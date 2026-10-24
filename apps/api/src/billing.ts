import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { BadGatewayException, BadRequestException, Body, Controller, Get, Headers, Injectable, Post, Req, ServiceUnavailableException, UnauthorizedException, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import { AuthRequest, SessionGuard } from "./auth";
import { Database } from "./database";

const plans = { pro: 99000, team: 299000 } as const;
const checkoutSchema = z.object({ plan: z.enum(["pro", "team"]) });
const eventSchema = z.object({
  event_type: z.enum(["payment.completed", "payment.failed", "payment.expired", "payment.test"]),
  data: z.object({ payment_id: z.string(), order_id: z.string(), amount: z.number().int().positive(), status: z.string(), paid_at: z.string().optional() }).optional()
});

export function verifySumopodSignature(secret: string, id: string, timestamp: string, signatures: string, rawBody: Buffer): boolean {
  if (!secret.startsWith("whsec_") || !id || !/^\d{10}$/.test(timestamp)) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const key = Buffer.from(secret.slice(6), "base64");
  if (key.length < 16) return false;
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.`).update(rawBody).digest();
  return signatures.split(/\s+/).some((item) => {
    if (!item.startsWith("v1,")) return false;
    const actual = Buffer.from(item.slice(3), "base64");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  });
}

@Injectable()
export class BillingService {
  constructor(private readonly db: Database) {}

  async current(userId: string) {
    const result = await this.db.query<{ plan: string; status: string; period_ends_at: Date | null }>(
      "SELECT plan,status,period_ends_at FROM subscriptions WHERE owner_user_id=$1", [userId]
    );
    const subscription = result.rows[0];
    return subscription && subscription.status === "active" && (!subscription.period_ends_at || subscription.period_ends_at.getTime() > Date.now())
      ? { plan: subscription.plan, status: "active", periodEndsAt: subscription.period_ends_at?.toISOString() || null }
      : { plan: "free", status: "active", periodEndsAt: null };
  }

  async checkout(userId: string, plan: "pro" | "team") {
    const baseUrl = process.env.SUMOPOD_BASE_URL;
    const key = process.env.SUMOPOD_API_KEY;
    if (!baseUrl || !key) throw new ServiceUnavailableException("Payment service is not configured");
    const invoiceId = randomUUID();
    const amount = plans[plan];
    await this.db.query("INSERT INTO invoices (id,owner_user_id,plan,amount_idr,status) VALUES ($1,$2,$3,$4,'pending')", [invoiceId, userId, plan, amount]);
    const appOrigin = process.env.APP_ORIGIN || "http://127.0.0.1:3000";
    let response: Response;
    try {
      response = await fetch(`${baseUrl.replace(/\/$/, "")}/payments`, {
        method: "POST", headers: { "Content-Type": "application/json", "X-Api-Key": key }, signal: AbortSignal.timeout(12000),
        body: JSON.stringify({ order_id: `EXS-${invoiceId}`, amount, currency: "IDR", expires_in_hours: 1,
          success_return_url: `${appOrigin}/app/billing?invoice=${invoiceId}`,
          cancel_return_url: `${appOrigin}/app/billing?invoice=${invoiceId}`,
          payment_method_type_code: "QRIS" })
      });
    } catch { throw new BadGatewayException("Payment service is unavailable. Please retry checkout."); }
    if (!response.ok) throw new BadGatewayException("Payment checkout could not be created");
    if (!response.headers.get("content-type")?.includes("application/json"))
      throw new BadGatewayException("Payment service returned an invalid response");
    let payment: { payment_id?: string; payment_link_url?: string; order_id?: string; amount?: number };
    try { payment = await response.json(); }
    catch { throw new BadGatewayException("Payment service returned an invalid response"); }
    if (!payment || typeof payment !== "object" || !payment.payment_id || !payment.payment_link_url || payment.order_id !== `EXS-${invoiceId}` || payment.amount !== amount)
      throw new BadGatewayException("Payment service returned an incomplete response");
    let url: URL;
    try { url = new URL(payment.payment_link_url); }
    catch { throw new BadGatewayException("Payment service returned an invalid payment URL"); }
    if (url.protocol !== "https:" || !(url.hostname === "sumopod.com" || url.hostname.endsWith(".sumopod.com"))) throw new BadGatewayException("Untrusted payment URL");
    await this.db.query("UPDATE invoices SET payment_id=$1,payment_url=$2 WHERE id=$3", [payment.payment_id, url.toString(), invoiceId]);
    return { invoiceId, paymentUrl: url.toString(), amountIdr: amount, plan };
  }

  async invoice(userId: string, id: string) {
    const result = await this.db.query<{ id: string; plan: string; amount_idr: number; status: string; payment_url: string | null }>(
      "SELECT id,plan,amount_idr,status,payment_url FROM invoices WHERE id=$1 AND owner_user_id=$2", [id, userId]
    );
    if (!result.rows[0]) throw new BadRequestException("Invoice not found");
    const row = result.rows[0];
    return { id: row.id, plan: row.plan, amountIdr: row.amount_idr, status: row.status, paymentUrl: row.payment_url };
  }

  async webhook(id: string, rawBody: Buffer) {
    const payload = eventSchema.safeParse(JSON.parse(rawBody.toString("utf8")));
    if (!payload.success) throw new BadRequestException("Invalid SumoPod event");
    const { event_type, data } = payload.data;
    const hash = createHash("sha256").update(rawBody).digest("hex");
    if (event_type === "payment.test") {
      await this.db.query("INSERT INTO payment_events (event_id,event_type,payload_hash) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [id, event_type, hash]);
      return { ok: true };
    }
    if (!data || !/^EXS-[a-f0-9-]{36}$/.test(data.order_id)) throw new BadRequestException("Unknown invoice reference");
    const invoiceId = data.order_id.slice(4);
    await this.db.transaction(async (client) => {
      const event = await client.query("INSERT INTO payment_events (event_id,event_type,payload_hash) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING event_id", [id, event_type, hash]);
      if (!event.rowCount) {
        const previous = await client.query<{ payload_hash: string }>("SELECT payload_hash FROM payment_events WHERE event_id=$1", [id]);
        if (previous.rows[0]?.payload_hash !== hash) throw new BadRequestException("Webhook event ID reused with different payload");
        return;
      }
      const invoiceResult = await client.query<{ owner_user_id: string; plan: string; amount_idr: number; status: string; payment_id: string }>(
        "SELECT owner_user_id,plan,amount_idr,status,payment_id FROM invoices WHERE id=$1 FOR UPDATE", [invoiceId]
      );
      const invoice = invoiceResult.rows[0];
      if (!invoice || invoice.payment_id !== data.payment_id || invoice.amount_idr !== data.amount)
        throw new BadRequestException("Payment does not match invoice");
      if (invoice.status === "paid") return;
      if (event_type === "payment.completed") {
        if (data.status !== "completed") throw new BadRequestException("Inconsistent payment status");
        await client.query("UPDATE invoices SET status='paid',paid_at=now() WHERE id=$1", [invoiceId]);
        await client.query(`INSERT INTO subscriptions (owner_user_id,plan,status,period_starts_at,period_ends_at,last_invoice_id)
          VALUES ($1,$2,'active',now(),now()+interval '1 month',$3)
          ON CONFLICT (owner_user_id) DO UPDATE SET plan=excluded.plan,status='active',period_starts_at=now(),
          period_ends_at=GREATEST(COALESCE(subscriptions.period_ends_at,now()),now())+interval '1 month',last_invoice_id=excluded.last_invoice_id,updated_at=now()`,
          [invoice.owner_user_id, invoice.plan, invoiceId]);
      } else if (invoice.status === "pending") {
        await client.query("UPDATE invoices SET status=$1 WHERE id=$2", [event_type === "payment.failed" ? "failed" : "expired", invoiceId]);
      }
    });
    return { ok: true };
  }
}

@Controller("v1/billing")
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get("subscription") @UseGuards(SessionGuard)
  subscription(@Req() request: AuthRequest) { return this.billing.current(request.eksaraUser!.id); }

  @Post("checkout") @UseGuards(SessionGuard)
  checkout(@Req() request: AuthRequest, @Body() body: unknown) {
    const parsed = checkoutSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException("Choose a valid subscription plan");
    return this.billing.checkout(request.eksaraUser!.id, parsed.data.plan);
  }

  @Get("invoices/:id") @UseGuards(SessionGuard)
  invoice(@Req() request: AuthRequest) { return this.billing.invoice(request.eksaraUser!.id, String(request.params.id)); }

  @Post("webhook/sumopod")
  webhook(@Req() request: Request & { rawBody?: Buffer }, @Headers("svix-id") id: string, @Headers("svix-timestamp") timestamp: string, @Headers("svix-signature") signatures: string) {
    const rawBody = request.rawBody;
    if (!rawBody || !verifySumopodSignature(process.env.SUMOPOD_WEBHOOK_SECRET || "", id, timestamp, signatures, rawBody))
      throw new UnauthorizedException("Invalid SumoPod webhook signature");
    return this.billing.webhook(id, rawBody);
  }
}
