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
type EthereumProvider = { request(args: { method: string; params?: unknown[] }): Promise<unknown> };
function provider(): EthereumProvider {
  const ethereum = (window as Window & { ethereum?: EthereumProvider }).ethereum;
  if (!ethereum) throw new Error("Install or open an EVM wallet to upload documents.");
  return ethereum;
}
export async function connectRemoteWallet(): Promise<string> {
  const ethereum = provider();
  const accounts = await ethereum.request({ method: "eth_requestAccounts" }) as string[];
  const address = accounts?.[0];
  if (!address) throw new Error("No wallet account was selected.");
  const challenge = await request<{ challengeId: string; message: string }>("/v1/wallet/challenge", { method: "POST", body: JSON.stringify({ address }) });
  const signature = await ethereum.request({ method: "personal_sign", params: [challenge.message, address] }) as string;
  const verified = await request<{ walletAddress: string }>("/v1/wallet/verify", { method: "POST", body: JSON.stringify({ challengeId: challenge.challengeId, signature }) });
  return verified.walletAddress;
}
export async function getOrders() { return request<Order[]>("/v1/print-orders?scope=mine"); }
export async function getOrder(id: string) { return request<Order>(`/v1/print-orders/${encodeURIComponent(id)}`); }
export async function createRemoteOrder(file: File, options: PrintOptions, note: string): Promise<Order> {
  const ethereum = provider();
  const me = await getMe();
  if (!me.walletAddress) throw new Error("Connect and verify your wallet before uploading.");
  const accounts = await ethereum.request({ method: "eth_requestAccounts" }) as string[];
  if (accounts?.[0]?.toLowerCase() !== me.walletAddress.toLowerCase()) throw new Error("Select the wallet linked to your Eksara account.");
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const intent = await request<{ documentId: string; uploadUrl: string; uploadHeaders?: Record<string, string> }>("/v1/documents/upload-intents", { method: "POST", body: JSON.stringify({ fileName: file.name, mimeType: file.type, sizeBytes: file.size, sha256 }) });
  const uploaded = await fetch(intent.uploadUrl, { method: "PUT", body: file, credentials: "include", headers: intent.uploadHeaders || { "Content-Type": file.type } });
  if (!uploaded.ok) throw new Error("File upload failed. Please try again.");
  await request(`/v1/documents/${intent.documentId}/complete`, { method: "POST", body: "{}" });
  const draft = await request<{ orderId: string; token: string; pin: string; typedData: { domain: { chainId: number }; [key: string]: unknown } }>("/v1/print-orders/prepare", { method: "POST", body: JSON.stringify({ documentId: intent.documentId, options, note, expiresInHours: 24 }) });
  const targetChain = `0x${draft.typedData.domain.chainId.toString(16)}`;
  const chain = await ethereum.request({ method: "eth_chainId" }) as string;
  if (chain.toLowerCase() !== targetChain.toLowerCase()) {
    try { await ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: targetChain }] }); }
    catch (error) {
      const rpc = process.env.NEXT_PUBLIC_MONAD_RPC_URL;
      if ((error as { code?: number }).code !== 4902 || !rpc) throw new Error("Switch your wallet to the configured Monad network and try again.");
      await ethereum.request({ method: "wallet_addEthereumChain", params: [{ chainId: targetChain, chainName: "Monad", nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 }, rpcUrls: [rpc] }] });
      await ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: targetChain }] });
    }
  }
  const signature = await ethereum.request({ method: "eth_signTypedData_v4", params: [me.walletAddress, JSON.stringify(draft.typedData)] }) as string;
  return request<Order>(`/v1/print-orders/${draft.orderId}/activate`, { method: "POST", body: JSON.stringify({ token: draft.token, pin: draft.pin, signature }) });
}
export async function getPublicGrant(token: string) { return request<{ fileName: string; expiresAt: string; status: string }>(`/v1/share-grants/${token}/public`); }
export async function claimRemoteGrant(token: string, pin: string) { return request<{ handoffTicket: string; expiresAt: string }>(`/v1/share-grants/${token}/handoff`, { method: "POST", body: JSON.stringify({ pin }) }); }
export async function revokeRemoteGrant(id: string) { return request(`/v1/print-orders/${id}/revoke`, { method: "POST", body: "{}" }); }
