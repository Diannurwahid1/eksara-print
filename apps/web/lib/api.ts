import { apiBase } from "./demo";
import type { Order, PrintOptions, User } from "./types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, { credentials: "include", ...init, headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers } });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message || `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}
export async function getMe() { return request<User>("/v1/me"); }
export async function getOrders() { return request<Order[]>("/v1/print-orders?scope=mine"); }
export async function getOrder(id: string) { return request<Order>(`/v1/print-orders/${encodeURIComponent(id)}`); }
export async function createRemoteOrder(file: File, options: PrintOptions, note: string): Promise<Order> {
  const intent = await request<{ documentId: string; uploadUrl: string; uploadHeaders?: Record<string, string> }>("/v1/documents/upload-intents", { method: "POST", body: JSON.stringify({ fileName: file.name, mimeType: file.type, sizeBytes: file.size }) });
  const uploaded = await fetch(intent.uploadUrl, { method: "PUT", body: file, headers: intent.uploadHeaders || { "Content-Type": file.type } });
  if (!uploaded.ok) throw new Error("File upload failed. Please try again.");
  await request(`/v1/documents/${intent.documentId}/complete`, { method: "POST", body: "{}" });
  return request<Order>("/v1/print-orders", { method: "POST", body: JSON.stringify({ documentId: intent.documentId, options, note, expiresInHours: 24 }) });
}
export async function getPublicGrant(token: string) { return request<{ fileName: string; expiresAt: string; status: string }>(`/v1/share-grants/${token}/public`); }
export async function claimRemoteGrant(token: string, pin: string) { return request<{ handoffTicket: string; expiresAt: string }>(`/v1/share-grants/${token}/handoff`, { method: "POST", body: JSON.stringify({ pin }) }); }
export async function revokeRemoteGrant(token: string) { return request(`/v1/share-grants/${token}/revoke`, { method: "POST", body: "{}" }); }
