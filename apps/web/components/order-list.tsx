"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, FileText, Search } from "lucide-react";
import { apiBase, formatBytes, readOrders, statusLabel } from "@/lib/demo";
import { getOrders } from "@/lib/api";
import type { Order } from "@/lib/types";

export function OrderList({ title, description }: { title: string; description: string }) {
  const [orders, setOrders] = useState<Order[]>([]); const [query, setQuery] = useState(""); const [status, setStatus] = useState("all");
  useEffect(() => { if (apiBase) getOrders().then(setOrders).catch(() => setOrders([])); else setOrders(readOrders()); }, []);
  const shown = orders.filter((o) => o.fileName.toLowerCase().includes(query.toLowerCase()) && (status === "all" || o.status === status));
  return <div className="shell listing-page"><div className="page-intro"><div className="eyebrow">YOUR WORKSPACE</div><h1>{title}</h1><p>{description}</p><Link href="/app" className="btn btn-primary">Create new request <ArrowRight size={16}/></Link></div><div className="list-card"><div className="list-toolbar"><div className="searchbox"><Search size={18}/><input placeholder="Search documents" value={query} onChange={(e) => setQuery(e.target.value)}/></div><select aria-label="Filter status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="all">All statuses</option><option value="shared">Waiting for shop</option><option value="opened">Opened</option><option value="processing">Processing</option><option value="printed">Printed</option><option value="expired">Expired</option><option value="revoked">Revoked</option></select></div>{shown.length ? <div className="document-list">{shown.map((item) => <Link href={`/app/orders/${item.id}`} key={item.id} className="document-row"><span className="document-icon"><FileText size={23}/></span><span className="document-main"><strong>{item.fileName}</strong><small>{formatBytes(item.fileSize)} · {item.options.paperSize} · {item.options.copies} {item.options.copies === 1 ? "copy" : "copies"}</small></span><span className={`status status-${item.status}`}>{statusLabel(item.status)}</span><span className="document-date">{new Date(item.createdAt).toLocaleDateString()}</span><ArrowRight size={18}/></Link>)}</div> : <div className="listing-empty"><FileText size={36}/><h2>{orders.length ? "No matching documents" : "Nothing here yet"}</h2><p>{orders.length ? "Try another search or status." : "Your prepared print requests will appear here."}</p></div>}</div></div>;
}
