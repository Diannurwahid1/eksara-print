import { Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { DbService } from "../db/db.module";
import {
  documents,
  handoffTickets,
  printEvents,
  printOrders,
  printReleases,
  shareGrants,
  stations,
} from "../db/schema";
import { ApiError } from "../common/api-error";
import { hashToken, randomToken } from "../common/crypto";
import { ShareGrantsService } from "../share-grants/share-grants.service";
import { StorageService } from "../storage/storage.service";
import { BlockchainService } from "../blockchain/blockchain.service";

const DOWNLOAD_LEASE_TTL_MS = 120 * 1000; // very short-lived, one use per release

@Injectable()
export class StationService {
  constructor(
    private db: DbService,
    private grants: ShareGrantsService,
    private storage: StorageService,
    private blockchain: BlockchainService,
  ) {}

  // --- pairing ---

  async startPairing(input: { name: string; publicKey?: string; shopId?: string }) {
    const pairingCode = randomToken(4).slice(0, 8).replace(/[-_]/g, "").toUpperCase();
    const credential = randomToken(32);
    const rows = await this.db.db
      .insert(stations)
      .values({
        name: input.name,
        publicKey: input.publicKey ?? null,
        shopId: input.shopId ?? null,
        pairingCode,
        credentialHash: hashToken(credential),
        status: "pending",
      })
      .returning({ id: stations.id, pairingCode: stations.pairingCode });

    // The credential is returned exactly once. Store it in the Station's
    // secure storage; there is no way to retrieve it again.
    return { stationId: rows[0].id, pairingCode: rows[0].pairingCode, credential };
  }

  async approvePairing(pairingCode: string) {
    const rows = await this.db.db
      .select()
      .from(stations)
      .where(and(eq(stations.pairingCode, pairingCode), eq(stations.status, "pending")))
      .limit(1);
    if (!rows[0]) throw ApiError.notFound("PAIRING_NOT_FOUND", "No pending station with that pairing code");

    // TODO(production): require an authenticated shop owner to approve here.
    await this.db.db
      .update(stations)
      .set({ status: "active", pairingCode: null })
      .where(eq(stations.id, rows[0].id));
    return { stationId: rows[0].id, status: "active" };
  }

  // --- handoff claim ---

  async claimHandoff(ticket: string, station: { id: string; shopId: string | null }) {
    const grant = await this.grants.consumeTicket(ticket);

    const ticketRow = await this.db.db
      .select({ shopId: handoffTickets.shopId })
      .from(handoffTickets)
      .where(eq(handoffTickets.grantId, grant.id))
      .limit(1);
    // TODO(production): enforce ticket.shopId === station.shopId binding.
    void station;
    void ticketRow;

    await this.db.db.update(printOrders).set({ status: "processing" }).where(eq(printOrders.id, grant.orderId));
    return { jobId: grant.orderId };
  }

  // --- job access ---

  async getJob(jobId: string) {
    const rows = await this.db.db
      .select({ order: printOrders, document: documents })
      .from(printOrders)
      .innerJoin(documents, eq(documents.id, printOrders.documentId))
      .where(eq(printOrders.id, jobId))
      .limit(1);
    const row = rows[0];
    if (!row) throw ApiError.notFound("JOB_NOT_FOUND", "Job not found");
    return {
      jobId: row.order.id,
      status: row.order.status,
      fileName: row.document.fileName,
      fileType: row.document.mimeType,
      fileSize: row.document.sizeBytes,
      options: row.order.options,
      note: row.order.note,
      expiresAt: row.order.expiresAt.toISOString(),
      // No permanent file URL is ever included (handoff §4).
    };
  }

  // --- release authorization ---

  /**
   * Atomically reserves the one release for this job, runs the (stubbed)
   * Monad authorization, and returns a single-use download lease.
   * A second call must be rejected — handoff acceptance check 6.
   */
  async authorizeRelease(jobId: string, stationId: string) {
    const grantRows = await this.db.db
      .select()
      .from(shareGrants)
      .where(eq(shareGrants.orderId, jobId))
      .limit(1);
    const grant = grantRows[0];
    if (!grant) throw ApiError.notFound("JOB_NOT_FOUND", "Job not found");
    if (grant.status !== "opened") {
      throw ApiError.badRequest("RELEASE_UNAVAILABLE", "This job is not awaiting a release");
    }

    // Reserve the release exactly once: guard on status in the WHERE clause.
    const reserved = await this.db.db
      .update(shareGrants)
      .set({ status: "consumed" })
      .where(and(eq(shareGrants.id, grant.id), eq(shareGrants.status, "opened")))
      .returning({ id: shareGrants.id });
    if (!reserved[0]) {
      throw ApiError.badRequest("RELEASE_UNAVAILABLE", "This job has already been released");
    }

    const lease = randomToken(32);
    const leaseExpiresAt = new Date(Date.now() + DOWNLOAD_LEASE_TTL_MS);
    const releaseRows = await this.db.db
      .insert(printReleases)
      .values({
        orderId: jobId,
        grantId: grant.id,
        stationId,
        leaseHash: hashToken(lease),
        leaseExpiresAt,
        status: "reserved",
      })
      .returning();

    const chain = await this.blockchain.authorizeRelease(releaseRows[0].id, grant.id);
    await this.db.db
      .update(printReleases)
      .set({ status: "authorized" })
      .where(eq(printReleases.id, releaseRows[0].id));

    return { releaseId: releaseRows[0].id, downloadLease: lease, leaseExpiresAt: leaseExpiresAt.toISOString(), chain };
  }

  // --- download ---

  async download(jobId: string, lease: string | undefined) {
    if (!lease) throw ApiError.forbidden("LEASE_REQUIRED", "A download lease is required");
    const rows = await this.db.db
      .select({ release: printReleases, order: printOrders, document: documents })
      .from(printReleases)
      .innerJoin(printOrders, eq(printOrders.id, printReleases.orderId))
      .innerJoin(documents, eq(documents.id, printOrders.documentId))
      .where(and(eq(printReleases.orderId, jobId), eq(printReleases.status, "authorized")))
      .limit(1);
    const row = rows[0];
    if (!row) throw ApiError.notFound("JOB_NOT_FOUND", "No authorized release for this job");
    if (row.release.leaseHash !== hashToken(lease) || (row.release.leaseExpiresAt ?? new Date(0)) < new Date()) {
      throw ApiError.forbidden("LEASE_INVALID", "Download lease is invalid or expired");
    }
    if (!row.document.objectKey) throw ApiError.badRequest("FILE_MISSING", "Document bytes are unavailable");

    // One lease per release: burn it now.
    await this.db.db
      .update(printReleases)
      .set({ status: "downloaded", leaseHash: null })
      .where(eq(printReleases.id, row.release.id));

    const bytes = await this.storage.get(row.document.objectKey);
    return { bytes, mimeType: row.document.mimeType, fileName: row.document.fileName };
  }

  // --- status reporting ---

  async reportStatus(jobId: string, input: { status: "processing" | "printed" | "failed"; spoolerId?: string; idempotencyKey?: string }) {
    const releaseRows = await this.db.db
      .select()
      .from(printReleases)
      .where(eq(printReleases.orderId, jobId))
      .limit(1);
    const release = releaseRows[0];
    if (!release) throw ApiError.notFound("JOB_NOT_FOUND", "Job not found");

    // Idempotent retries must not duplicate events or corrupt state.
    if (input.idempotencyKey) {
      const existing = await this.db.db
        .select({ id: printEvents.id })
        .from(printEvents)
        .where(eq(printEvents.releaseId, release.id))
        .limit(50);
      void existing; // TODO(production): unique index on idempotency key
    }

    await this.db.db.insert(printEvents).values({
      releaseId: release.id,
      kind: input.status,
      payload: { spoolerId: input.spoolerId ?? null, idempotencyKey: input.idempotencyKey ?? null },
    });

    if (input.status === "printed" || input.status === "failed") {
      // Explicit terminal decision; a failed job must NOT auto-retry (handoff §5).
      await this.db.db
        .update(printReleases)
        .set({ status: input.status === "printed" ? "printed" : "failed" })
        .where(eq(printReleases.id, release.id));
      await this.db.db
        .update(printOrders)
        .set({ status: input.status })
        .where(eq(printOrders.id, jobId));
    }
    return { jobId, status: input.status };
  }

  // --- receipt ---

  async receipt(jobId: string) {
    const rows = await this.db.db
      .select({ release: printReleases, grant: shareGrants })
      .from(printReleases)
      .innerJoin(shareGrants, eq(shareGrants.id, printReleases.grantId))
      .where(eq(printReleases.orderId, jobId))
      .limit(1);
    const row = rows[0];
    if (!row) throw ApiError.notFound("JOB_NOT_FOUND", "No release recorded for this job");
    return {
      jobId,
      authorizationId: row.grant.id,
      releaseId: row.release.id,
      releaseStatus: row.release.status,
      // Filled from chain_transactions once the real relayer is wired.
      chainId: Number(process.env.MONAD_CHAIN_ID ?? 10143),
      txHash: null,
      blockStatus: null,
      spoolerOutcome: row.release.status,
    };
  }

}
