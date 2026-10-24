import assert from "node:assert/strict";
import { test } from "node:test";
import { privateKeyToAccount } from "viem/accounts";
import { verifyTypedData, type Hex } from "viem";
import { FlowService } from "./flow";
import { grantTypes } from "./chain";
import type { ChainService } from "./chain";
import type { Database } from "./database";
import type { StorageService } from "./storage";

test("wallet-signed grant activates once and retains the prepared commitment", async () => {
  process.env.PIN_PEPPER = "test-only-32-character-pin-pepper-123456";
  const account = privateKeyToAccount(`0x${"1".repeat(64)}`);
  const documentId = "11111111-1111-4111-8111-111111111111";
  const commitment = `0x${"2".repeat(64)}` as Hex;
  const document = { id: documentId, object_key: "private/object", file_name: "test.pdf", content_type: "application/pdf",
    size_bytes: 123, file_hash: "3".repeat(64), commitment, status: "ready" };
  let order: Record<string, unknown> | null = null;
  let grantStatus = 0;
  let creations = 0;
  const domain = { name: "Eksara One-Time Print", version: "1", chainId: 10143, verifyingContract: `0x${"4".repeat(40)}` as Hex } as const;
  const chain = {
    nonce: async () => 0n,
    domain: () => domain,
    grant: async () => ({ status: grantStatus, customer: account.address, documentCommitment: commitment,
      shopCommitment: `0x${"0".repeat(64)}`, deletionEvidenceHash: `0x${"0".repeat(64)}` }),
    verify: async (customer: Hex, permit: { grantId: Hex; customer: Hex; documentCommitment: Hex; shopCommitment: Hex; expiresAt: bigint; nonce: bigint }, signature: Hex) => verifyTypedData({
      address: customer, domain, types: grantTypes, primaryType: "GrantPermit", message: permit, signature
    }),
    createGrant: async () => { creations++; grantStatus = 1; return `0x${"5".repeat(64)}` as Hex; }
  } as unknown as ChainService;
  const db = { query: async (sql: string, values: unknown[] = []) => {
    if (sql.startsWith("SELECT * FROM documents")) return { rows: [document], rowCount: 1 };
    if (sql.startsWith("SELECT 1 FROM print_orders")) return { rows: [], rowCount: 0 };
    if (sql.startsWith("INSERT INTO print_orders")) {
      order = { ...document, id: values[0], owner_user_id: values[1], document_id: values[2], token_hash: values[3], pin_hash: values[4],
        options: values[5], note: values[6], status: "draft", grant_id: values[7], grant_nonce: values[8], expires_at: values[9],
        created_at: new Date(), wallet_address: account.address, customer_name: "Test" };
      return { rows: [], rowCount: 1 };
    }
    if (sql.startsWith("SELECT o.*")) return { rows: order ? [order] : [], rowCount: order ? 1 : 0 };
    if (sql.startsWith("UPDATE print_orders SET status='shared'")) { if (order) { order.status = "shared"; order.chain_tx_hash = values[0]; } return { rows: [], rowCount: 1 }; }
    throw new Error(`Unexpected SQL: ${sql}`);
  } } as unknown as Database;
  const flow = new FlowService(db, {} as StorageService, chain);
  const draft = await flow.prepare("user-1", account.address, {
    documentId, options: { paperSize: "A4", color: "bw", copies: 1, sides: "single", finishing: "none" }, note: "", expiresInHours: 1
  });
  assert.equal(draft.typedData.message.documentCommitment, commitment);
  assert.equal(draft.typedData.types.GrantPermit.length, 6);
  const signature = await account.signTypedData({
    domain,
    types: grantTypes,
    primaryType: "GrantPermit",
    message: { ...draft.typedData.message, expiresAt: BigInt(draft.typedData.message.expiresAt), nonce: BigInt(draft.typedData.message.nonce) }
  });
  const activated = await flow.activate("user-1", draft.orderId, { token: draft.token, pin: draft.pin, signature });
  assert.equal(activated.status, "shared");
  assert.equal(creations, 1);
  await assert.rejects(() => flow.activate("user-1", draft.orderId, { token: draft.token, pin: draft.pin, signature }), /draft expired or unavailable/);
});
