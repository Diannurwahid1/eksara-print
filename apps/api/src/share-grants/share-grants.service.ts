import { Injectable } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import { DbService } from "../db/db.module";
import { documents, handoffTickets, printOrders, shareGrants } from "../db/schema";
import { ApiError } from "../common/api-error";
import { hashPin, hashToken, randomToken, safeEqualHex } from "../common/crypto";

// In-memory PIN attempt tracking for the scaffold.
// TODO(production): persist per-token/per-IP/per-shop attempt counters with locking (handoff §5).
const pinAttempts = new Map<string, { count: number; lockedUntil: number }>();
const MAX_PIN_ATTEMPTS = 5;
const PIN_LOCK_MS = 15 * 60 * 1000;
const HANDOFF_TICKET_TTL_MS = 60 * 1000; // handoff §5: ~60 seconds, one use

type GrantRow = typeof shareGrants.$inferSelect;

@Injectable()
export class ShareGrantsService {
  constructor(private db: DbService) {}

  private async findByTokenHash(tokenHash: string) {
    const rows = await this.db.db
      .select({ grant: shareGrants, order: printOrders, document: documents })
      .from(shareGrants)
      .innerJoin(printOrders, eq(printOrders.id, shareGrants.orderId))
      .innerJoin(documents, eq(documents.id, printOrders.documentId))
      .where(eq(shareGrants.tokenHash, tokenHash))
      .limit(1);
    return rows[0];
  }

  async publicInfo(token: string) {
    const row = await this.findByTokenHash(hashToken(token));
    if (!row) throw ApiError.notFound("GRANT_NOT_FOUND", "Share link not found");
    const expired = row.grant.expiresAt < new Date();
    const status = expired && row.grant.status === "active" ? "expired" : row.grant.status;
    return {
      fileName: row.document.fileName,
      expiresAt: row.grant.expiresAt.toISOString(),
      status,
    };
  }

  async handoff(token: string, pin: string) {
    const tokenHash = hashToken(token);
    const row = await this.findByTokenHash(tokenHash);
    if (!row) throw ApiError.notFound("GRANT_NOT_FOUND", "Share link not found");

    const attempt = pinAttempts.get(tokenHash);
    if (attempt && attempt.lockedUntil > Date.now()) {
      throw ApiError.badRequest("PIN_LOCKED", "Too many attempts; try again later");
    }

    if (row.grant.status !== "active" || row.grant.expiresAt < new Date()) {
      throw ApiError.badRequest("GRANT_UNAVAILABLE", "This share link is no longer available");
    }

    if (!safeEqualHex(hashPin(pin, row.grant.pinSalt), row.grant.pinHash)) {
      const next = { count: (attempt?.count ?? 0) + 1, lockedUntil: 0 };
      if (next.count >= MAX_PIN_ATTEMPTS) next.lockedUntil = Date.now() + PIN_LOCK_MS;
      pinAttempts.set(tokenHash, next);
      throw new ApiError(400, "PIN_INVALID", "Incorrect PIN");
    }
    pinAttempts.delete(tokenHash);

    const ticket = randomToken(32);
    const expiresAt = new Date(Date.now() + HANDOFF_TICKET_TTL_MS);
    await this.db.db.insert(handoffTickets).values({
      grantId: row.grant.id,
      shopId: null, // TODO(production): bind to the shop/device that verified the PIN
      ticketHash: hashToken(ticket),
      expiresAt,
    });
    await this.db.db.update(shareGrants).set({ status: "opened" }).where(eq(shareGrants.id, row.grant.id));
    await this.db.db.update(printOrders).set({ status: "opened" }).where(eq(printOrders.id, row.order.id));

    return { handoffTicket: ticket, expiresAt: expiresAt.toISOString() };
  }

  async revoke(ownerId: string, token: string) {
    const row = await this.findByTokenHash(hashToken(token));
    if (!row) throw ApiError.notFound("GRANT_NOT_FOUND", "Share link not found");
    if (row.order.ownerId !== ownerId) throw ApiError.forbidden();

    if (row.grant.status === "consumed" || row.grant.status === "opened") {
      throw ApiError.badRequest("GRANT_ALREADY_USED", "This grant was already used and cannot be revoked");
    }
    if (row.grant.status === "revoked") return { ok: true };

    await this.db.db.update(shareGrants).set({ status: "revoked" }).where(eq(shareGrants.id, row.grant.id));
    await this.db.db.update(printOrders).set({ status: "revoked" }).where(eq(printOrders.id, row.order.id));
    return { ok: true };
  }

  /** Consumes a handoff ticket exactly once and returns the bound grant (station claim). */
  async consumeTicket(ticket: string): Promise<GrantRow> {
    const ticketHash = hashToken(ticket);
    const rows = await this.db.db
      .select()
      .from(handoffTickets)
      .where(eq(handoffTickets.ticketHash, ticketHash))
      .limit(1);
    const row = rows[0];
    if (!row || row.usedAt || row.expiresAt < new Date()) {
      throw ApiError.badRequest("TICKET_INVALID", "Handoff ticket is invalid, expired, or already used");
    }
    // Atomically consume: the WHERE guard makes double-claim impossible even under races.
    const consumed = await this.db.db
      .update(handoffTickets)
      .set({ usedAt: new Date() })
      .where(and(eq(handoffTickets.id, row.id), isNull(handoffTickets.usedAt)))
      .returning({ id: handoffTickets.id });
    if (!consumed[0]) throw ApiError.badRequest("TICKET_INVALID", "Handoff ticket is invalid or already used");

    const grantRows = await this.db.db.select().from(shareGrants).where(eq(shareGrants.id, row.grantId)).limit(1);
    const grant = grantRows[0];
    if (!grant || grant.status !== "opened") {
      throw ApiError.badRequest("GRANT_UNAVAILABLE", "The share grant is no longer available");
    }
    return grant;
  }
}
