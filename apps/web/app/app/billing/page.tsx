"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, CreditCard, ExternalLink, ShieldCheck } from "lucide-react";
import { apiBase } from "@/lib/demo";

type Plan = "pro" | "team";
type Subscription = { plan: string; status: string; periodEndsAt: string | null };
type Invoice = { id: string; status: string; plan: string; amountIdr: number; paymentUrl: string | null };
const plans: { id: Plan; title: string; price: string; detail: string }[] = [
  { id: "pro", title: "Print Shop Pro", price: "Rp99.000 / bulan", detail: "Untuk operasional satu toko percetakan." },
  { id: "team", title: "Business Team", price: "Rp299.000 / bulan", detail: "Untuk tim yang mengelola banyak permintaan." }
];

export default function BillingPage() {
  const params = useSearchParams();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [busy, setBusy] = useState<Plan | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!apiBase) return;
    const refreshSubscription = () => fetch(`${apiBase}/v1/billing/subscription`, { credentials: "include" }).then((r) => r.json()).then(setSubscription).catch(() => setError("Tidak bisa memuat status langganan."));
    refreshSubscription();
    const id = params.get("invoice");
    if (id && /^[a-f0-9-]{36}$/.test(id)) {
      const refreshInvoice = () => fetch(`${apiBase}/v1/billing/invoices/${id}`, { credentials: "include" }).then((r) => r.json()).then((value: Invoice) => { setInvoice(value); if (value.status === "paid") refreshSubscription(); }).catch(() => undefined);
      refreshInvoice();
      const interval = window.setInterval(refreshInvoice, 5000);
      return () => window.clearInterval(interval);
    }
  }, [params]);
  async function checkout(plan: Plan) {
    if (!apiBase) { setError("Pembayaran tersedia setelah API produksi dikonfigurasi."); return; }
    setBusy(plan); setError("");
    try {
      const response = await fetch(`${apiBase}/v1/billing/checkout`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "Checkout gagal dibuat.");
      window.location.assign(body.paymentUrl);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Checkout gagal dibuat."); setBusy(null); }
  }
  return <div className="shell billing-page"><div className="eyebrow">EKSARA SUBSCRIPTIONS</div><h1>Paket platform</h1><p>Pembayaran paket platform melalui SumoPod QRIS. Pembayaran biaya cetak di toko tidak termasuk.</p>
    <div className="billing-current"><ShieldCheck size={20}/><span>{subscription ? `Paket saat ini: ${subscription.plan.toUpperCase()}${subscription.periodEndsAt ? ` · aktif sampai ${new Date(subscription.periodEndsAt).toLocaleDateString("id-ID")}` : ""}` : apiBase ? "Memuat langganan…" : "Mode demo · pembayaran belum tersambung"}</span></div>
    {invoice && <div className="billing-invoice"><CheckCircle2 size={19}/><span>Invoice {invoice.id.slice(0, 8)} · {invoice.status === "paid" ? "Pembayaran diterima" : `Status ${invoice.status}`}. Status diperbarui dari webhook SumoPod, bukan dari halaman kembali.</span>{invoice.status === "pending" && invoice.paymentUrl && <a href={invoice.paymentUrl} target="_blank" rel="noreferrer">Buka pembayaran <ExternalLink size={14}/></a>}</div>}
    <div className="billing-grid">{plans.map((plan) => <article key={plan.id}><CreditCard size={24}/><h2>{plan.title}</h2><p>{plan.detail}</p><strong>{plan.price}</strong><button className="btn btn-dark" onClick={() => checkout(plan.id)} disabled={busy !== null}>{busy === plan.id ? "Membuka pembayaran…" : "Berlangganan via SumoPod"}</button></article>)}</div>
    {error && <div className="billing-error" role="alert">{error}</div>}
  </div>;
}
