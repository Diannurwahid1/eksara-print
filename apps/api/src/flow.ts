import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { BadRequestException, Body, CanActivate, ConflictException, Controller, ExecutionContext, Get, Injectable, Param, Post, Put, Req, Res, StreamableFile, UnauthorizedException, UseGuards } from "@nestjs/common";
import type { Request, Response } from "express";
import { keccak256, stringToHex, type Hex } from "viem";
import { z } from "zod";
import { AuthRequest, SessionGuard } from "./auth";
import { WalletGuard } from "./wallet";
import { Database } from "./database";
import { ChainService, grantTypes } from "./chain";
import { StorageService } from "./storage";

const hex32 = z.string().regex(/^0x[a-fA-F0-9]{64}$/);
const uploadSchema = z.object({ fileName: z.string().min(1).max(180), mimeType: z.enum(["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "image/jpeg", "image/png"]), sizeBytes: z.number().int().min(1).max(52428800), sha256: z.string().regex(/^[a-f0-9]{64}$/) });
const optionsSchema = z.object({ paperSize: z.enum(["A4", "A3", "Letter"]), color: z.enum(["bw", "color"]), copies: z.number().int().min(1).max(99), sides: z.enum(["single", "double"]), finishing: z.enum(["none", "staple", "bind"]) });
const prepareSchema = z.object({ documentId: z.uuid(), options: optionsSchema, note: z.string().max(300), expiresInHours: z.number().int().min(1).max(24) });
const activateSchema = z.object({ token: z.string().min(20), pin: z.string().regex(/^\d{6}$/), signature: z.string().regex(/^0x[a-fA-F0-9]{130}$/) });
const handoffSchema = z.object({ pin: z.string().regex(/^\d{6}$/) });
const tokenHash = (value: string) => createHash("sha256").update(value).digest("hex");
const pinHash = (token: string, pin: string) => {
  if (!process.env.PIN_PEPPER || process.env.PIN_PEPPER.length < 32) throw new Error("PIN_PEPPER must be a random secret of at least 32 characters");
  return createHmac("sha256", process.env.PIN_PEPPER).update(`${token}:${pin}`).digest("hex");
};
const publicOrigin = () => process.env.APP_ORIGIN || "http://127.0.0.1:3000";
const shopCommitment = keccak256(stringToHex("Eksara:any-authorized-station:v1"));

type DocumentRow = { id: string; object_key: string; file_name: string; content_type: string; size_bytes: number; file_hash: string; commitment: Hex; status: string };
type OrderRow = { id: string; owner_user_id: string; document_id: string; token_hash: string; pin_hash: string; options: z.infer<typeof optionsSchema>; note: string; status: string; grant_id: Hex; grant_nonce: string; chain_tx_hash: string | null; expires_at: Date; created_at: Date; file_name: string; content_type: string; size_bytes: number; object_key: string; commitment: Hex; wallet_address: `0x${string}`; customer_name: string };

@Injectable()
export class FlowService {
  constructor(private readonly db: Database, private readonly storage: StorageService, private readonly chain: ChainService) {}

  async uploadIntent(userId: string, input: z.infer<typeof uploadSchema>) {
    const id = randomUUID();
    const key = `documents/${userId}/${id}`;
    const commitment = keccak256(stringToHex(`Eksara:file:${input.sha256}:${randomBytes(32).toString("hex")}`));
    await this.db.query(`INSERT INTO documents (id,owner_user_id,object_key,file_name,content_type,size_bytes,file_hash,commitment,status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending')`, [id, userId, key, input.fileName, input.mimeType, input.sizeBytes, input.sha256, commitment]);
    const origin = (process.env.API_ORIGIN || "http://127.0.0.1:4000").replace(/\/$/, "");
    return { documentId: id, uploadUrl: `${origin}/v1/documents/${id}/content`, uploadHeaders: { "Content-Type": input.mimeType } };
  }

  async uploadContent(userId: string, id: string, request: Request) {
    const result = await this.db.query<DocumentRow>("SELECT * FROM documents WHERE id=$1 AND owner_user_id=$2 AND status='pending'", [id, userId]);
    const doc = result.rows[0];
    if (!doc) throw new BadRequestException("Upload intent not found");
    if (request.headers["content-type"] !== doc.content_type) throw new BadRequestException("Upload content type does not match intent");
    await this.storage.put(doc.object_key, request, doc.size_bytes, doc.file_hash);
    return { ok: true };
  }

  async complete(userId: string, id: string) {
    const result = await this.db.query<DocumentRow>("SELECT * FROM documents WHERE id=$1 AND owner_user_id=$2", [id, userId]);
    const doc = result.rows[0];
    if (!doc || doc.status !== "pending") throw new BadRequestException("Upload intent not found");
    const head = await this.storage.head(doc.object_key);
    if (head.ContentLength !== doc.size_bytes || head.ChecksumSHA256 !== Buffer.from(doc.file_hash, "hex").toString("base64"))
      throw new BadRequestException("Uploaded file does not match declared size or SHA-256");
    await this.db.query("UPDATE documents SET status='ready' WHERE id=$1", [id]);
    return { ok: true };
  }

  async prepare(userId: string, wallet: `0x${string}`, input: z.infer<typeof prepareSchema>) {
    const result = await this.db.query<DocumentRow>("SELECT * FROM documents WHERE id=$1 AND owner_user_id=$2 AND status='ready'", [input.documentId, userId]);
    const doc = result.rows[0];
    if (!doc) throw new BadRequestException("Document is not ready");
    const used = await this.db.query("SELECT 1 FROM print_orders WHERE document_id=$1", [doc.id]);
    if (used.rowCount) throw new ConflictException("A one-time grant already exists for this document");
    const id = randomUUID();
    const token = randomBytes(32).toString("base64url");
    const pin = String(randomBytes(4).readUInt32BE() % 1000000).padStart(6, "0");
    const grantId = keccak256(stringToHex(`Eksara:grant:${id}:${randomBytes(16).toString("hex")}`));
    const nonce = await this.chain.nonce(wallet);
    const expiresAt = new Date(Date.now() + input.expiresInHours * 3600000);
    try {
      await this.db.query(`INSERT INTO print_orders (id,owner_user_id,document_id,token_hash,pin_hash,options,note,status,grant_id,grant_nonce,expires_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,'draft',$8,$9,$10)`,
        [id, userId, doc.id, tokenHash(token), pinHash(token, pin), input.options, input.note, grantId, nonce.toString(), expiresAt]);
    } catch (error) {
      if ((error as { code?: string }).code === "23505") throw new ConflictException("A one-time grant already exists for this document");
      throw error;
    }
    return { orderId: id, token, pin, typedData: { domain: this.chain.domain(), types: {
      EIP712Domain: [
        { name: "name", type: "string" }, { name: "version", type: "string" },
        { name: "chainId", type: "uint256" }, { name: "verifyingContract", type: "address" }
      ], ...grantTypes
    }, primaryType: "GrantPermit", message: {
      grantId, customer: wallet, documentCommitment: doc.commitment, shopCommitment, expiresAt: Math.floor(expiresAt.getTime() / 1000).toString(), nonce: nonce.toString()
    } } };
  }

  private async orderById(id: string, userId?: string) {
    const result = await this.db.query<OrderRow>(`SELECT o.*,d.file_name,d.content_type,d.size_bytes,d.object_key,d.commitment,u.wallet_address,u.name AS customer_name
      FROM print_orders o JOIN documents d ON d.id=o.document_id JOIN users u ON u.id=o.owner_user_id
      WHERE o.id=$1 ${userId ? "AND o.owner_user_id=$2" : ""}`, userId ? [id, userId] : [id]);
    return result.rows[0];
  }

  private publicOrder(row: OrderRow, token = "", pin = "") {
    return { id: row.id, token, pin, fileName: row.file_name, fileSize: row.size_bytes, fileType: row.content_type,
      options: row.options, note: row.note, status: row.status, createdAt: row.created_at.toISOString(),
      expiresAt: row.expires_at.toISOString(), chainTxHash: row.chain_tx_hash || undefined };
  }

  async activate(userId: string, id: string, input: z.infer<typeof activateSchema>) {
    const row = await this.orderById(id, userId);
    if (!row || row.status !== "draft" || row.expires_at.getTime() <= Date.now()) throw new ConflictException("Grant draft expired or unavailable");
    if (row.token_hash !== tokenHash(input.token) || row.pin_hash !== pinHash(input.token, input.pin)) throw new UnauthorizedException("Grant secrets do not match");
    const permit = { grantId: row.grant_id, customer: row.wallet_address, documentCommitment: row.commitment, shopCommitment,
      expiresAt: BigInt(Math.floor(row.expires_at.getTime() / 1000)), nonce: BigInt(row.grant_nonce) };
    if (!(await this.chain.verify(row.wallet_address, permit, input.signature as Hex))) throw new UnauthorizedException("Wallet permit signature is invalid");
    const onchain = await this.chain.grant(row.grant_id);
    let txHash: Hex | null = null;
    if (onchain.status === 1) {
      if (onchain.customer.toLowerCase() !== row.wallet_address.toLowerCase() || onchain.documentCommitment !== row.commitment || onchain.shopCommitment !== shopCommitment)
        throw new ConflictException("On-chain grant does not match the prepared order");
    } else {
      if (onchain.status !== 0 || await this.chain.nonce(row.wallet_address) !== permit.nonce) throw new ConflictException("Wallet nonce changed; prepare a fresh request");
      txHash = await this.chain.createGrant(permit, input.signature as Hex);
    }
    await this.db.query("UPDATE print_orders SET status='shared',chain_tx_hash=$1 WHERE id=$2 AND status='draft'", [txHash, id]);
    return this.publicOrder({ ...row, status: "shared", chain_tx_hash: txHash }, input.token, input.pin);
  }

  async list(userId: string) {
    const result = await this.db.query<{ id: string }>("SELECT id FROM print_orders WHERE owner_user_id=$1 AND status<>'draft' ORDER BY created_at DESC LIMIT 100", [userId]);
    return Promise.all(result.rows.map(async ({ id }) => this.publicOrder((await this.orderById(id, userId))!)));
  }
  async get(userId: string, id: string) {
    const row = await this.orderById(id, userId);
    if (!row) throw new BadRequestException("Order not found");
    const attestation = await this.db.query<{ evidence_hash: string; chain_tx_hash: string | null; object_deleted_at: Date; print_mode: string; virtual_output_hash: string | null }>(
      "SELECT evidence_hash,chain_tx_hash,object_deleted_at,print_mode,virtual_output_hash FROM deletion_attestations WHERE document_id=$1", [row.document_id]
    );
    const receipt = attestation.rows[0];
    return { ...this.publicOrder(row), deletionEvidenceHash: receipt?.evidence_hash || undefined,
      attestationTxHash: receipt?.chain_tx_hash || undefined, deletedAt: receipt?.object_deleted_at.toISOString() || undefined,
      printMode: receipt?.print_mode || undefined, virtualOutputHash: receipt?.virtual_output_hash || undefined };
  }

  async revoke(userId: string, id: string) {
    const row = await this.orderById(id, userId);
    if (!row || !["shared", "opened"].includes(row.status)) throw new ConflictException("Only an unused grant can be revoked");
    const onchain = await this.chain.grant(row.grant_id);
    if (onchain.status !== 1 && onchain.status !== 3) throw new ConflictException("Grant was already consumed or expired");
    const txHash = onchain.status === 3 ? null : await this.chain.revokeGrant(row.grant_id);
    await this.db.query("UPDATE print_orders SET status='revoked' WHERE id=$1 AND status IN ('shared','opened')", [id]);
    return { status: "revoked", chainTxHash: txHash };
  }

  async publicGrant(token: string) {
    const result = await this.db.query<OrderRow>(`SELECT o.*,d.file_name,d.content_type,d.size_bytes,d.object_key,d.commitment,u.wallet_address,u.name AS customer_name
      FROM print_orders o JOIN documents d ON d.id=o.document_id JOIN users u ON u.id=o.owner_user_id
      WHERE o.token_hash=$1 AND o.status<>'draft'`, [tokenHash(token)]);
    const row = result.rows[0];
    if (!row) throw new BadRequestException("Share link not found");
    return { fileName: row.file_name, expiresAt: row.expires_at.toISOString(), status: row.expires_at.getTime() > Date.now() ? row.status : "expired" };
  }

  async handoff(token: string, pin: string, ip: string) {
    const hash = tokenHash(token);
    const ipHash = tokenHash(ip);
    const attempts = await this.db.query<{ count: string }>("SELECT count(*)::text AS count FROM pin_attempts WHERE token_hash=$1 AND ip_hash=$2 AND attempted_at > now()-interval '15 minutes'", [hash, ipHash]);
    if (Number(attempts.rows[0].count) >= 5) throw new UnauthorizedException("Too many PIN attempts. Try again later.");
    const result = await this.db.query<{ id: string; pin_hash: string; status: string; expires_at: Date }>("SELECT id,pin_hash,status,expires_at FROM print_orders WHERE token_hash=$1", [hash]);
    const row = result.rows[0];
    const expected = pinHash(token, pin);
    if (!row || !timingSafeEqual(Buffer.from(row.pin_hash, "hex"), Buffer.from(expected, "hex"))) {
      await this.db.query("INSERT INTO pin_attempts (token_hash,ip_hash) VALUES ($1,$2)", [hash, ipHash]);
      throw new UnauthorizedException("Invalid link or PIN");
    }
    if (row.status !== "shared" || row.expires_at.getTime() <= Date.now()) throw new ConflictException("Print request is no longer available");
    const ticket = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 5 * 60000);
    await this.db.query("INSERT INTO handoff_tickets (ticket_hash,order_id,expires_at) VALUES ($1,$2,$3)", [tokenHash(ticket), row.id, expiresAt]);
    return { handoffTicket: ticket, expiresAt: expiresAt.toISOString(), deepLink: `eksara-station://claim?ticket=${ticket}` };
  }

  async claim(ticket: string) {
    const result = await this.db.query<{ order_id: string }>("DELETE FROM handoff_tickets WHERE ticket_hash=$1 AND expires_at>now() RETURNING order_id", [tokenHash(ticket)]);
    const id = result.rows[0]?.order_id;
    if (!id) throw new UnauthorizedException("Handoff ticket expired or used");
    const updated = await this.db.query("UPDATE print_orders SET status='opened' WHERE id=$1 AND status='shared' AND expires_at>now() RETURNING id", [id]);
    if (!updated.rowCount) throw new ConflictException("Request already opened or expired");
    return { jobId: id };
  }

  async stationJobs() {
    const result = await this.db.query<{ id: string }>("SELECT id FROM print_orders WHERE status IN ('opened','processing','printed') ORDER BY created_at DESC LIMIT 100");
    return Promise.all(result.rows.map(async ({ id }) => this.stationJob(id)));
  }
  async stationJob(id: string) {
    const row = await this.orderById(id);
    if (!row || !["opened", "processing", "printed"].includes(row.status)) throw new BadRequestException("Station job not found");
    return { id: row.id, fileName: row.file_name, fileSize: row.size_bytes, pageCount: null,
      customerName: row.customer_name, source: "Shared Link", note: row.note, options: row.options,
      status: row.status, createdAt: row.created_at.toISOString(), expiresAt: row.expires_at.toISOString() };
  }

  async release(id: string) {
    const row = await this.orderById(id);
    if (!row || row.status !== "opened" || row.expires_at.getTime() <= Date.now()) throw new ConflictException("Job is not eligible for release");
    const onchain = await this.chain.grant(row.grant_id);
    if (onchain.status !== 1 && onchain.status !== 2) throw new ConflictException("Monad grant is not active");
    const txHash = onchain.status === 2 ? null : await this.chain.consumeGrant(row.grant_id);
    await this.db.query("UPDATE print_orders SET status='processing' WHERE id=$1 AND status='opened'", [id]);
    return { releaseTxHash: txHash, downloadUrl: this.storage.downloadUrl(id), expiresInSeconds: 60 };
  }

  async download(ticket: string) {
    const id = this.storage.verifyDownload(ticket);
    const row = await this.orderById(id);
    if (!row || row.status !== "processing") throw new UnauthorizedException("Document release is unavailable");
    return this.storage.open(row.object_key);
  }

  async completePrint(id: string, printerName: string, virtualOutputSha256?: string) {
    const row = await this.orderById(id);
    if (!row || !["processing", "printed"].includes(row.status)) throw new ConflictException("Job is not processing");
    let stored = await this.db.query<{ evidence_hash: Hex; chain_tx_hash: Hex | null; object_deleted_at: Date }>(
      "SELECT evidence_hash,chain_tx_hash,object_deleted_at FROM deletion_attestations WHERE document_id=$1", [row.document_id]
    );
    if (!stored.rows[0]) {
      if (row.status !== "processing") throw new ConflictException("Deletion evidence is missing");
      await this.storage.delete(row.object_key);
      const deletedAt = new Date();
      const printMode = virtualOutputSha256 ? "virtual_pdf_test" : "operator_attested";
      const evidence = { version: 1, documentId: row.document_id, orderId: id, objectKeyHash: tokenHash(row.object_key),
        fileHash: row.commitment, printerName, printMode, virtualOutputSha256: virtualOutputSha256 || null,
        objectDeletedAt: deletedAt.toISOString(), claim: "Current object absent from configured storage after delete; copies elsewhere are not covered" };
      const evidenceHash = keccak256(stringToHex(JSON.stringify(evidence)));
      await this.db.transaction(async (client) => {
        await client.query("UPDATE documents SET status='deleted',deleted_at=$1 WHERE id=$2", [deletedAt, row.document_id]);
        await client.query("UPDATE print_orders SET status='printed' WHERE id=$1", [id]);
        await client.query("INSERT INTO deletion_attestations (document_id,order_id,object_deleted_at,evidence_hash,print_mode,virtual_output_hash) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING", [row.document_id, id, deletedAt, evidenceHash, printMode, virtualOutputSha256 || null]);
      });
      stored = await this.db.query("SELECT evidence_hash,chain_tx_hash,object_deleted_at FROM deletion_attestations WHERE document_id=$1", [row.document_id]);
    }
    const evidenceHash = stored.rows[0].evidence_hash;
    let txHash = stored.rows[0].chain_tx_hash;
    if (!txHash) {
      const chainGrant = await this.chain.grant(row.grant_id);
      if (chainGrant.deletionEvidenceHash === evidenceHash) {
        // A prior transaction succeeded but its hash was not saved after a crash.
      } else if (chainGrant.deletionEvidenceHash === `0x${"0".repeat(64)}`) {
        txHash = await this.chain.attestDeletion(row.grant_id, evidenceHash);
        await this.db.query("UPDATE deletion_attestations SET chain_tx_hash=$1 WHERE document_id=$2", [txHash, row.document_id]);
      } else throw new ConflictException("On-chain deletion evidence differs from storage evidence");
    }
    return { status: "printed", deletionEvidenceHash: evidenceHash, attestationTxHash: txHash,
      printMode: virtualOutputSha256 ? "virtual_pdf_test" : "operator_attested",
      claim: "Current storage object absent after deletion; physical output and external copies are not covered" };
  }
}

@Injectable()
export class StationGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    const token = process.env.EKSARA_STATION_DEVICE_TOKEN || "";
    const provided = request.headers.authorization?.replace(/^Bearer /, "") || "";
    if (!token || !provided || token.length !== provided.length || !timingSafeEqual(Buffer.from(token), Buffer.from(provided))) throw new UnauthorizedException("Station credential required");
    return true;
  }
}

@Controller("v1")
export class FlowController {
  constructor(private readonly flow: FlowService) {}
  @Post("documents/upload-intents") @UseGuards(SessionGuard, WalletGuard)
  upload(@Req() request: AuthRequest, @Body() body: unknown) {
    const parsed = uploadSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException("Invalid file metadata or SHA-256");
    return this.flow.uploadIntent(request.eksaraUser!.id, parsed.data);
  }
  @Put("documents/:id/content") @UseGuards(SessionGuard, WalletGuard)
  uploadContent(@Req() request: AuthRequest, @Param("id") id: string) {
    return this.flow.uploadContent(request.eksaraUser!.id, id, request);
  }
  @Post("documents/:id/complete") @UseGuards(SessionGuard, WalletGuard)
  complete(@Req() request: AuthRequest, @Param("id") id: string) { return this.flow.complete(request.eksaraUser!.id, id); }
  @Post("print-orders/prepare") @UseGuards(SessionGuard, WalletGuard)
  prepare(@Req() request: AuthRequest, @Body() body: unknown) {
    const parsed = prepareSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException("Invalid print preferences");
    return this.flow.prepare(request.eksaraUser!.id, request.eksaraUser!.wallet_address as `0x${string}`, parsed.data);
  }
  @Post("print-orders/:id/activate") @UseGuards(SessionGuard, WalletGuard)
  activate(@Req() request: AuthRequest, @Param("id") id: string, @Body() body: unknown) {
    const parsed = activateSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException("Invalid wallet permit");
    return this.flow.activate(request.eksaraUser!.id, id, parsed.data);
  }
  @Get("print-orders") @UseGuards(SessionGuard)
  list(@Req() request: AuthRequest) { return this.flow.list(request.eksaraUser!.id); }
  @Get("print-orders/:id") @UseGuards(SessionGuard)
  get(@Req() request: AuthRequest, @Param("id") id: string) { return this.flow.get(request.eksaraUser!.id, id); }
  @Post("print-orders/:id/revoke") @UseGuards(SessionGuard)
  revoke(@Req() request: AuthRequest, @Param("id") id: string) { return this.flow.revoke(request.eksaraUser!.id, id); }
  @Get("share-grants/:token/public")
  publicGrant(@Param("token") token: string) { return this.flow.publicGrant(token); }
  @Post("share-grants/:token/handoff")
  handoff(@Req() request: Request, @Param("token") token: string, @Body() body: unknown) {
    const parsed = handoffSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException("Enter a six-digit PIN");
    return this.flow.handoff(token, parsed.data.pin, request.ip || "unknown");
  }
  @Post("station/handoffs/claim") @UseGuards(StationGuard)
  claim(@Body() body: unknown) {
    const parsed = z.object({ handoffTicket: z.string().min(20).max(512) }).safeParse(body);
    if (!parsed.success) throw new BadRequestException("Invalid handoff ticket");
    return this.flow.claim(parsed.data.handoffTicket);
  }
  @Get("station/jobs") @UseGuards(StationGuard)
  jobs() { return this.flow.stationJobs(); }
  @Get("station/jobs/:id") @UseGuards(StationGuard)
  job(@Param("id") id: string) { return this.flow.stationJob(id); }
  @Post("station/jobs/:id/authorize-release") @UseGuards(StationGuard)
  release(@Param("id") id: string) { return this.flow.release(id); }
  @Get("station/downloads/:ticket")
  async download(@Param("ticket") ticket: string, @Res({ passthrough: true }) response: Response) {
    const { stream, size } = await this.flow.download(ticket);
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    return new StreamableFile(stream, { type: "application/octet-stream", disposition: "attachment", length: size });
  }
  @Post("station/jobs/:id/complete") @UseGuards(StationGuard)
  completePrint(@Param("id") id: string, @Body() body: unknown) {
    const parsed = z.object({ printerName: z.string().min(1).max(250), virtualOutputSha256: z.string().regex(/^[a-f0-9]{64}$/).optional() }).safeParse(body);
    if (!parsed.success) throw new BadRequestException("Printer name required");
    if ((parsed.data.printerName === "eksara-virtual-pdf") !== Boolean(parsed.data.virtualOutputSha256)) throw new BadRequestException("Virtual print proof does not match printer mode");
    return this.flow.completePrint(id, parsed.data.printerName, parsed.data.virtualOutputSha256);
  }
}
