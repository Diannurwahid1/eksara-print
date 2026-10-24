import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

/** CSPRNG opaque token, base64url, >= 128 bits of entropy (handoff §5). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** sha256 hex digest used to store tokens/credentials at rest. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Six random server-side digits for the share PIN (handoff §5). */
export function generatePin(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function hashPin(pin: string, salt: string): string {
  // TODO(scaffold): upgrade to a deliberately slow KDF (argon2/scrypt) before real customers.
  return createHmac("sha256", salt).update(pin).digest("hex");
}

export function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}
