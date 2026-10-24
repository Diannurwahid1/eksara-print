"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, Clock3, ExternalLink, FileText, LockKeyhole, Printer, ShieldCheck, XCircle } from "lucide-react";
import { Brand } from "@/components/ui";
import { claimRemoteGrant, getPublicGrant } from "@/lib/api";
import { apiBase, readOrders, statusLabel, updateOrder } from "@/lib/demo";
import type { Order } from "@/lib/types";

type PublicGrant = { fileName: string; expiresAt: string; status: string };
export default function ReceivePage() {
  const token = String(useParams().token || "");
  const [grant, setGrant] = useState<PublicGrant | null>(null);
  const [localOrder, setLocalOrder] = useState<Order | null>(null);
  const [pin, setPin] = useState(""); const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  const [ticket, setTicket] = useState(""); const [attempted, setAttempted] = useState(false);
  useEffect(() => { if (apiBase) getPublicGrant(token).then(setGrant).catch(() => setError("This link is invalid or no longer available.")); else { const o = readOrders().find((x) => x.token === token); if (o) { setLocalOrder(o); setGrant({ fileName: o.fileName, expiresAt: o.expiresAt, status: o.status }); } else if (token === "demo") setGrant({ fileName: "Example-Proposal.pdf", expiresAt: new Date(Date.now() + 86400000).toISOString(), status: "shared" }); else setError("This link is invalid or no longer available in this browser."); } }, [token]);
  const expired = grant && (new Date(grant.expiresAt).getTime() < Date.now() || ["expired", "revoked", "opened", "processing", "printed"].includes(grant.status));
  function openStation(value: string) { setAttempted(true); window.location.href = `eksara-station://claim?ticket=${encodeURIComponent(value)}`; }
  async function verify() {
    if (!/^\d{6}$/.test(pin)) { setError("Enter the 6-digit PIN."); return; }
    setLoading(true); setError("");
    try {
      let handoffTicket: string;
      if (apiBase) ({ handoffTicket } = await claimRemoteGrant(token, pin));
      else { if (localOrder && pin !== localOrder.pin) throw new Error("Incorrect PIN. Ask the customer to confirm it."); if (!localOrder && token === "demo" && pin !== "123456") throw new Error("For this preview, use PIN 123456."); handoffTicket = `demo-${token}-${crypto.randomUUID()}`; if (localOrder) updateOrder(token, { status: "opened" }); }
      setTicket(handoffTicket); openStation(handoffTicket);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not verify this request."); }
    finally { setLoading(false); }
  }
  return <div className="handoff-page"><header className="handoff-header shell"><Brand/><span>Secure print handoff</span></header><main className="handoff-shell"><div className="handoff-heading"><span className="handoff-badge"><ShieldCheck size={16}/> Eksara access</span><h1>Open this print request</h1><p>Verify the PIN from the customer to hand this job to Eksara Station.</p></div><div className="handoff-card">{grant ? <><div className="handoff-file"><span><FileText size={27}/></span><div><strong>{grant.fileName}</strong><small>Shared print request</small></div></div><div className="handoff-details"><span><Clock3 size={17}/> Expires {new Date(grant.expiresAt).toLocaleString()}</span><span><ShieldCheck size={17}/> {statusLabel((grant.status as Order["status"]) || "shared")}</span></div>{expired ? <div className="handoff-error"><XCircle size={20}/> This request is no longer available for print release.</div> : ticket ? <div className="handoff-success"><CheckCircle2 size={36}/><h2>Access verified</h2><p>Eksara Station should open automatically. If your browser asks for permission, allow it to open the desktop app.</p><button className="btn btn-primary" onClick={() => openStation(ticket)}>Open Print Station <ExternalLink size={16}/></button>{!apiBase && <small>Preview mode: there is no connected desktop or printable file.</small>}</div> : <><label className="pin-label" htmlFor="pin">6-digit PIN code</label><div className="pin-input"><LockKeyhole size={19}/><input id="pin" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="Enter PIN" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => { if (e.key === "Enter") verify(); }}/></div>{token === "demo" && <p className="demo-hint">Preview PIN: <strong>123456</strong></p>}<button className="btn btn-primary handoff-submit" onClick={verify} disabled={loading}>{loading ? "Verifying…" : "Verify & open Print Station"} <ArrowRight size={17}/></button><p className="handoff-note"><LockKeyhole size={14}/> The file is available only after the shop and device are authorized by the backend.</p></>}</> : <div className="handoff-loading">Checking the link…</div>}{error && <div className="handoff-error" role="alert"><XCircle size={18}/>{error}</div>}</div><div className="handoff-bottom"><Printer size={18}/><span>For print shops: install and pair Eksara Station before opening customer requests.</span></div><Link href="/" className="back-link">← Return to Eksara</Link></main></div>;
}
