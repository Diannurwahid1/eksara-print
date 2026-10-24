import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

/**
 * Local-disk object storage adapter for development.
 *
 * The real deployment uses a private S3-compatible bucket with presigned PUT
 * URLs (handoff §2 step 2 / §5). In dev we build the "presigned" URL ourselves
 * and serve the bytes from local disk. Swap this service for an S3 adapter
 * without touching the documents module.
 */
@Injectable()
export class StorageService {
  private readonly root: string;

  constructor() {
    this.root = resolve(process.env.STORAGE_DIR ?? "./var/storage");
  }

  private pathFor(objectKey: string): string {
    return join(this.root, objectKey);
  }

  async put(objectKey: string, bytes: Buffer): Promise<{ checksum: string }> {
    const path = this.pathFor(objectKey);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes);
    return { checksum: createHash("sha256").update(bytes).digest("hex") };
  }

  async get(objectKey: string): Promise<Buffer> {
    return readFile(this.pathFor(objectKey));
  }
}
