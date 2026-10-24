import { Injectable } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import { DbService } from "../db/db.module";
import { documents, printOrders, shareGrants, type PrintOptionsRecord } from "../db/schema";
import { ApiError } from "../common/api-error";
import { generatePin, hashPin, hashToken, randomToken } from "../common/crypto";
import { DocumentsService } from "../documents/documents.service";
import type { CreatePrintOrderDto } from "./orders.controller";

type OrderRow = typeof printOrders.$inferSelect;
type DocumentRow = typeof documents.$inferSelect;

@Injectable()
export class OrdersService {
  constructor(private db: DbService, private documentsService: DocumentsService) {}

  /**
   * Creates the order and its share grant atomically enough for the scaffold.
   * TODO(production): wrap in a single SQL transaction.
   */
  async createOrder(ownerId: string, dto: CreatePrintOrderDto) {
    const doc = await this.documentsService.requireOwnedDocument(ownerId, dto.documentId);
    const expiresAt = new Date(Date.now() + (dto.expiresInHours ?? 24) * 3600 * 1000);

    const orderRows = await this.db.db
      .insert(printOrders)
      .values({
        ownerId,
        documentId: doc.id,
        options: dto.options as PrintOptionsRecord,
        note: dto.note?.slice(0, 300) ?? null,
        status: "shared",
        expiresAt,
      })
      .returning();
    const order = orderRows[0];

    const token = randomToken(32);
    const pin = generatePin();
    const pinSalt = randomToken(16);
    await this.db.db.insert(shareGrants).values({
      orderId: order.id,
      tokenHash: hashToken(token),
      pinHash: hashPin(pin, pinSalt),
      pinSalt,
      status: "active",
      expiresAt,
    });

    // The PIN is returned exactly once (handoff §2 step 3).
    return this.toOrderResponse(order, doc, token, pin);
  }

  async listMine(ownerId: string) {
    const rows = await this.db.db
      .select({ order: printOrders, document: documents })
      .from(printOrders)
      .innerJoin(documents, eq(documents.id, printOrders.documentId))
      .where(eq(printOrders.ownerId, ownerId))
      .orderBy(desc(printOrders.createdAt))
      .limit(100); // TODO(production): real pagination

    return rows.map(({ order, document }) => this.toOrderResponse(order, document, null, null));
  }

  async getOrder(ownerId: string, orderId: string) {
    const row = await this.requireOwnedOrder(ownerId, orderId);
    return this.toOrderResponse(row.order, row.document, null, null);
  }

  async requireOwnedOrder(ownerId: string, orderId: string) {
    const rows = await this.db.db
      .select({ order: printOrders, document: documents })
      .from(printOrders)
      .innerJoin(documents, eq(documents.id, printOrders.documentId))
      .where(and(eq(printOrders.id, orderId), eq(printOrders.ownerId, ownerId)))
      .limit(1);
    if (!rows[0]) throw ApiError.notFound("ORDER_NOT_FOUND", "Order not found");
    return rows[0];
  }

  /**
   * Maps an order row to the response shape the frontend expects (handoff §3):
   * `id, token, fileName, fileSize, fileType, options, note, createdAt,
   * expiresAt, status` (+ `pin` only at creation time).
   */
  private toOrderResponse(order: OrderRow, doc: DocumentRow, token: string | null, pin: string | null) {
    const effectiveStatus = order.status === "shared" && order.expiresAt < new Date() ? "expired" : order.status;
    return {
      id: order.id,
      token,
      fileName: doc.fileName,
      fileSize: doc.sizeBytes,
      fileType: doc.mimeType,
      options: order.options,
      note: order.note,
      pin,
      createdAt: order.createdAt.toISOString(),
      expiresAt: order.expiresAt.toISOString(),
      status: effectiveStatus,
      receipt: { status: effectiveStatus, txHash: null }, // filled in once the Monad relayer is wired
    };
  }
}
