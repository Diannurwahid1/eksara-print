import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { link, mkdir, stat, unlink } from "node:fs/promises";
import { resolve, join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { BadRequestException, Injectable, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";

const maxBytes = 50 * 1024 * 1024;
const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const keyPattern = new RegExp(`^documents/(${uuid})/(${uuid})$`, "i");
const orderPattern = new RegExp(`^${uuid}$`, "i");

@Injectable()
export class StorageService {
  private root() { return resolve(process.env.LOCAL_STORAGE_DIR || "data/private-files"); }

  private filePath(key: string) {
    const match = keyPattern.exec(key);
    if (!match) throw new BadRequestException("Invalid document storage key");
    return join(this.root(), "documents", match[1], match[2]);
  }

  async put(key: string, source: Readable, expectedSize: number, expectedHash: string) {
    if (!Number.isSafeInteger(expectedSize) || expectedSize < 1 || expectedSize > maxBytes || !/^[a-f0-9]{64}$/.test(expectedHash))
      throw new BadRequestException("Invalid upload declaration");
    const destination = this.filePath(key);
    const directory = resolve(destination, "..");
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const temporary = join(directory, `.${randomUUID()}.upload`);
    const digest = createHash("sha256");
    let size = 0;
    const checksum = new Transform({ transform(chunk: Buffer, _encoding, callback) {
      size += chunk.length;
      if (size > expectedSize || size > maxBytes) return callback(new BadRequestException("Uploaded file exceeds declared size"));
      digest.update(chunk);
      callback(null, chunk);
    } });
    try {
      await pipeline(source, checksum, createWriteStream(temporary, { flags: "wx", mode: 0o600 }));
      if (size !== expectedSize || digest.digest("hex") !== expectedHash)
        throw new BadRequestException("Uploaded file does not match declared size or SHA-256");
      // Same-directory hard link publishes only the fully verified file and refuses an existing destination.
      await link(temporary, destination);
    } finally {
      await unlink(temporary).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
    }
  }

  async head(key: string) {
    const file = this.filePath(key);
    const info = await stat(file);
    if (!info.isFile()) throw new BadRequestException("Stored document is not a file");
    const digest = createHash("sha256");
    for await (const chunk of createReadStream(file)) digest.update(chunk);
    return { ContentLength: info.size, ChecksumSHA256: digest.digest("base64") };
  }

  downloadUrl(orderId: string) {
    if (!orderPattern.test(orderId)) throw new BadRequestException("Invalid print order");
    const secret = process.env.LOCAL_STORAGE_URL_SECRET;
    if (!secret || secret.length < 32) throw new ServiceUnavailableException("Local download signing is not configured");
    const payload = Buffer.from(JSON.stringify({ orderId, exp: Date.now() + 60_000 })).toString("base64url");
    const signature = createHmac("sha256", secret).update(payload).digest("base64url");
    const origin = (process.env.API_ORIGIN || "http://127.0.0.1:4000").replace(/\/$/, "");
    return `${origin}/v1/station/downloads/${payload}.${signature}`;
  }

  verifyDownload(token: string): string {
    const secret = process.env.LOCAL_STORAGE_URL_SECRET;
    if (!secret || secret.length < 32) throw new ServiceUnavailableException("Local download signing is not configured");
    const match = /^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(token);
    if (!match) throw new UnauthorizedException("Invalid download ticket");
    const expected = createHmac("sha256", secret).update(match[1]).digest();
    const actual = Buffer.from(match[2], "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new UnauthorizedException("Invalid download ticket");
    let payload: { orderId?: unknown; exp?: unknown };
    try { payload = JSON.parse(Buffer.from(match[1], "base64url").toString("utf8")); }
    catch { throw new UnauthorizedException("Invalid download ticket"); }
    if (typeof payload.orderId !== "string" || !orderPattern.test(payload.orderId) ||
      typeof payload.exp !== "number" || payload.exp <= Date.now()) throw new UnauthorizedException("Download ticket expired");
    return payload.orderId;
  }

  async open(key: string) {
    const file = this.filePath(key);
    const info = await stat(file);
    if (!info.isFile() || info.size < 1 || info.size > maxBytes) throw new BadRequestException("Stored document is unavailable");
    return { stream: createReadStream(file), size: info.size };
  }

  async delete(key: string) {
    const file = this.filePath(key);
    try { await unlink(file); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    try { await stat(file); throw new Error("Document still exists after deletion"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
}
