import type { Order, User } from "./types";

const ORDER_KEY = "eksara.demo.orders.v1";
const USER_KEY = "eksara.demo.user.v1";

export const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") || "";
export const isDemo = !apiBase;

export function readUser(): User | null {
  if (typeof window === "undefined") return null;
  try { return JSON.parse(localStorage.getItem(USER_KEY) || "null") as User | null; } catch { return null; }
}
export function saveUser(user: User | null) {
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user)); else localStorage.removeItem(USER_KEY);
  window.dispatchEvent(new Event("eksara:change"));
}
export function readOrders(): Order[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(ORDER_KEY) || "[]") as Order[]; } catch { return []; }
}
export function saveOrder(order: Order) {
  const orders = readOrders().filter((item) => item.id !== order.id);
  localStorage.setItem(ORDER_KEY, JSON.stringify([order, ...orders]));
  window.dispatchEvent(new Event("eksara:change"));
}
export function updateOrder(token: string, patch: Partial<Order>) {
  const orders = readOrders().map((order) => order.token === token ? { ...order, ...patch } : order);
  localStorage.setItem(ORDER_KEY, JSON.stringify(orders));
  window.dispatchEvent(new Event("eksara:change"));
}
export function makePin() { return String(Math.floor(100000 + Math.random() * 900000)); }
export function makeToken() { return crypto.randomUUID().replaceAll("-", "").slice(0, 14); }
export function formatBytes(bytes: number) { return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`; }
export function shareUrl(token: string) { return `${window.location.origin}/p/${token}`; }
export function statusLabel(status: Order["status"]) {
  return ({ ready: "Ready to share", shared: "Waiting for shop", opened: "Opened by shop", processing: "Processing", printed: "Printed", expired: "Expired", revoked: "Revoked" })[status];
}
