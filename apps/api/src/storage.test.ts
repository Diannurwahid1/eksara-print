import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import { StorageService } from "./storage";

test("local storage verifies uploads, issues short signed downloads, and deletes the current file", async () => {
  const root = await mkdtemp(join(tmpdir(), "eksara-storage-test-"));
  const previousDirectory = process.env.LOCAL_STORAGE_DIR;
  const previousSecret = process.env.LOCAL_STORAGE_URL_SECRET;
  process.env.LOCAL_STORAGE_DIR = root;
  process.env.LOCAL_STORAGE_URL_SECRET = "local-storage-test-secret-with-32-chars-minimum";
  const storage = new StorageService();
  const key = "documents/479aaed7-561e-456e-b980-366d74cf64dc/6d04cb51-6503-4cad-9ad4-2522d896d582";
  const orderId = "2e506991-a6f3-48ba-9b98-b535344a1a75";
  const bytes = Buffer.from("private test document");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  try {
    await assert.rejects(storage.put(key, Readable.from([bytes]), bytes.length, "0".repeat(64)));
    await assert.rejects(storage.head(key));
    await storage.put(key, Readable.from([bytes]), bytes.length, sha256);
    assert.deepEqual(await storage.head(key), { ContentLength: bytes.length, ChecksumSHA256: Buffer.from(sha256, "hex").toString("base64") });
    const ticket = storage.downloadUrl(orderId).split("/").at(-1)!;
    assert.equal(storage.verifyDownload(ticket), orderId);
    assert.throws(() => storage.verifyDownload(`${ticket}tampered`));
    const opened = await storage.open(key);
    const chunks: Buffer[] = [];
    for await (const chunk of opened.stream) chunks.push(Buffer.from(chunk));
    assert.deepEqual(Buffer.concat(chunks), bytes);
    await storage.delete(key);
    await assert.rejects(storage.open(key));
  } finally {
    if (previousDirectory === undefined) delete process.env.LOCAL_STORAGE_DIR; else process.env.LOCAL_STORAGE_DIR = previousDirectory;
    if (previousSecret === undefined) delete process.env.LOCAL_STORAGE_URL_SECRET; else process.env.LOCAL_STORAGE_URL_SECRET = previousSecret;
    if (!resolve(root).startsWith(resolve(tmpdir(), "eksara-storage-test-"))) throw new Error("Unsafe test cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});
