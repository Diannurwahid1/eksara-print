import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { test } from "node:test";
import { BillingService, verifySumopodSignature } from "./billing";
import type { Database } from "./database";

test("SumoPod signature binds raw body, event ID and timestamp", () => {
  const key = randomBytes(32);
  const secret = `whsec_${key.toString("base64")}`;
  const id = "evt_test_123";
  const timestamp = String(Math.floor(Date.now() / 1000));
  const raw = Buffer.from('{"event_type":"payment.test"}');
  const signature = createHmac("sha256", key).update(`${id}.${timestamp}.`).update(raw).digest("base64");
  assert.equal(verifySumopodSignature(secret, id, timestamp, `v1,${signature}`, raw), true);
  assert.equal(verifySumopodSignature(secret, id, timestamp, `v1,${signature}`, Buffer.from('{}')), false);
  assert.equal(verifySumopodSignature(secret, "evt_other", timestamp, `v1,${signature}`, raw), false);
  assert.equal(verifySumopodSignature(secret, id, String(Number(timestamp) - 3600), `v1,${signature}`, raw), false);
});

test("completed webhook activates one subscription and rejects wrong invoice amount", async () => {
  const events = new Map<string, string>();
  const invoice = { owner_user_id: "user-1", plan: "pro", amount_idr: 99000, status: "pending", payment_id: "pay-1" };
  let activations = 0;
  const client = { query: async (sql: string, values: unknown[]) => {
    if (sql.startsWith("INSERT INTO payment_events")) {
      if (events.has(String(values[0]))) return { rowCount: 0, rows: [] };
      events.set(String(values[0]), String(values[2]));
      return { rowCount: 1, rows: [{ event_id: values[0] }] };
    }
    if (sql.startsWith("SELECT payload_hash")) return { rows: [{ payload_hash: events.get(String(values[0])) }] };
    if (sql.startsWith("SELECT owner_user_id")) return { rows: [invoice] };
    if (sql.startsWith("UPDATE invoices")) { invoice.status = "paid"; return { rowCount: 1, rows: [] }; }
    if (sql.startsWith("INSERT INTO subscriptions")) { activations++; return { rowCount: 1, rows: [] }; }
    throw new Error(`Unexpected SQL: ${sql}`);
  } };
  const db = { transaction: async (work: (value: typeof client) => Promise<unknown>) => work(client) } as unknown as Database;
  const billing = new BillingService(db);
  const valid = Buffer.from(JSON.stringify({ event_type: "payment.completed", data: { payment_id: "pay-1", order_id: `EXS-${"a".repeat(8)}-${"b".repeat(4)}-${"c".repeat(4)}-${"d".repeat(4)}-${"e".repeat(12)}`, amount: 99000, status: "completed" } }));
  assert.deepEqual(await billing.webhook("evt-1", valid), { ok: true });
  assert.equal(activations, 1);
  assert.deepEqual(await billing.webhook("evt-1", valid), { ok: true });
  assert.equal(activations, 1);
  const wrong = Buffer.from(valid.toString().replace('"amount":99000', '"amount":1000'));
  invoice.status = "pending";
  await assert.rejects(() => billing.webhook("evt-2", wrong), /Payment does not match invoice/);
  assert.equal(activations, 1);
});
