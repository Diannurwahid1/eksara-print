import { Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { DbService } from "../db/db.module";
import { documents } from "../db/schema";
import { ApiError } from "../common/api-error";
import { hashToken, randomToken } from "../common/crypto";
import { StorageService } from "../storage/storage.service";

export type CreateUploadIntentInput = { fileName: string; mimeType: string; sizeBytes: number };

@Injectable()
export class DocumentsService {
  constructor(private db: DbService, private storage: StorageService) {}

  private apiPublicUrl(): string {
    return (process.env.API_PUBLIC_URL ?? "http://localhost:4000").replace(/\/$/, "");
  }

  async createUploadIntent(ownerId: string, input: CreateUploadIntentInput) {
    const uploadToken = randomToken(24);
    const rows = await this.db.db
      .insert(documents)
      .values({
        ownerId,
        fileName: input.fileName,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        uploadTokenHash: hashToken(uploadToken),
        status: "upload_pending",
      })
      .returning({ id: documents.id });

    const documentId = rows[0].id;
    return {
      documentId,
      // Dev adapter: the "presigned" URL points back at this API's token-authorized PUT.
      // In production this becomes a short-lived S3 presigned PUT URL.
      uploadUrl: `${this.apiPublicUrl()}/v1/documents/${documentId}/blob?token=${encodeURIComponent(uploadToken)}`,
    };
  }

  /** Validates the one-time upload token, writes bytes to private storage, and checksums them. */
  async storeBlob(documentId: string, uploadToken: string, bytes: Buffer) {
    const rows = await this.db.db.select().from(documents).where(eq(documents.id, documentId)).limit(1);
    const doc = rows[0];
    if (!doc) throw ApiError.notFound("DOCUMENT_NOT_FOUND", "Document not found");
    if (doc.status !== "upload_pending" || !doc.uploadTokenHash) {
      throw ApiError.badRequest("UPLOAD_NOT_ALLOWED", "This document is not awaiting an upload");
    }
    if (doc.uploadTokenHash !== hashToken(uploadToken)) {
      throw ApiError.forbidden("UPLOAD_TOKEN_INVALID", "Upload token is invalid");
    }
    if (bytes.length > doc.sizeBytes + 1024) {
      throw ApiError.badRequest("FILE_TOO_LARGE", "Uploaded bytes exceed the declared size");
    }

    const objectKey = `documents/${documentId}`;
    const { checksum } = await this.storage.put(objectKey, bytes);
    await this.db.db
      .update(documents)
      .set({ objectKey, checksum, uploadTokenHash: null, status: "ready" })
      .where(eq(documents.id, documentId));
    return { fileName: doc.fileName };
  }

  async completeUpload(ownerId: string, documentId: string) {
    const rows = await this.db.db
      .select()
      .from(documents)
      .where(and(eq(documents.id, documentId), eq(documents.ownerId, ownerId)))
      .limit(1);
    const doc = rows[0];
    if (!doc) throw ApiError.notFound("DOCUMENT_NOT_FOUND", "Document not found");
    if (doc.status !== "ready") {
      // TODO(production): real object-type sniffing, malware scan, page count (handoff §3).
      throw ApiError.badRequest("UPLOAD_INCOMPLETE", "Upload has not completed or failed validation");
    }
    return {
      documentId: doc.id,
      fileName: doc.fileName,
      mimeType: doc.mimeType,
      sizeBytes: doc.sizeBytes,
      checksum: doc.checksum,
      status: doc.status,
    };
  }

  async requireOwnedDocument(ownerId: string, documentId: string) {
    const rows = await this.db.db
      .select()
      .from(documents)
      .where(and(eq(documents.id, documentId), eq(documents.ownerId, ownerId)))
      .limit(1);
    const doc = rows[0];
    if (!doc || doc.status !== "ready") {
      throw ApiError.badRequest("DOCUMENT_NOT_READY", "Document is missing, not owned, or not ready");
    }
    return doc;
  }
}
