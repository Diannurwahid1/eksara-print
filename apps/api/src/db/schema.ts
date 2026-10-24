import { relations } from "drizzle-orm";
import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Core tables per docs/backend-handoff.md §6.
// All shop-owned records carry shop_id; file metadata stores object keys, never public URLs.

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name"),
  picture: text("picture"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const oauthAccounts = pgTable(
  "oauth_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id),
    provider: text("provider").notNull(),
    providerUserId: text("provider_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("oauth_provider_identity").on(t.provider, t.providerUserId)],
);

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  // sha256 of the session cookie value; the raw token is never stored.
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const shops = pgTable("shops", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const shopMemberships = pgTable("shop_memberships", {
  id: uuid("id").primaryKey().defaultRandom(),
  shopId: uuid("shop_id").notNull().references(() => shops.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  role: text("role").notNull().default("owner"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const stations = pgTable("stations", {
  id: uuid("id").primaryKey().defaultRandom(),
  shopId: uuid("shop_id").references(() => shops.id),
  name: text("name").notNull(),
  publicKey: text("public_key"),
  pairingCode: text("pairing_code"),
  // sha256 of the device credential; the raw credential is only returned once at pairing.
  credentialHash: text("credential_hash").notNull(),
  // pending | active | revoked
  status: text("status").notNull().default("pending"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id").notNull().references(() => users.id),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  // Private object-storage key; never a public URL.
  objectKey: text("object_key"),
  checksum: text("checksum"),
  // upload_pending | ready | rejected
  status: text("status").notNull().default("upload_pending"),
  // sha256 of the one-time upload token used to authorize the PUT.
  uploadTokenHash: text("upload_token_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PrintOptionsRecord = {
  paperSize: "A4" | "A3" | "Letter";
  color: "bw" | "color";
  copies: number;
  sides: "single" | "double";
  finishing: "none" | "staple" | "bind";
};

export const printOrders = pgTable("print_orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id").notNull().references(() => users.id),
  documentId: uuid("document_id").notNull().references(() => documents.id),
  // Set when the job is bound to a shop via handoff; null while unbound.
  shopId: uuid("shop_id").references(() => shops.id),
  options: jsonb("options").$type<PrintOptionsRecord>().notNull(),
  note: text("note"),
  // draft | shared | opened | processing | printed | expired | revoked | failed
  status: text("status").notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const shareGrants = pgTable("share_grants", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().references(() => printOrders.id),
  // sha256 of the opaque public token from /p/{token}.
  tokenHash: text("token_hash").notNull().unique(),
  // HMAC of the six-digit PIN with a random per-grant salt.
  pinHash: text("pin_hash").notNull(),
  pinSalt: text("pin_salt").notNull(),
  // active | opened | consumed | expired | revoked
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const handoffTickets = pgTable("handoff_tickets", {
  id: uuid("id").primaryKey().defaultRandom(),
  grantId: uuid("grant_id").notNull().references(() => shareGrants.id),
  shopId: uuid("shop_id").references(() => shops.id),
  ticketHash: text("ticket_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const printReleases = pgTable("print_releases", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().references(() => printOrders.id),
  grantId: uuid("grant_id").notNull().references(() => shareGrants.id),
  stationId: uuid("station_id").notNull().references(() => stations.id),
  // One release lease per release; the lease is a hashed single-use download secret.
  leaseHash: text("lease_hash"),
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
  // reserved | authorized | downloaded | processing | printed | failed
  status: text("status").notNull().default("reserved"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const printEvents = pgTable("print_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  releaseId: uuid("release_id").references(() => printReleases.id),
  kind: text("kind").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const chainTransactions = pgTable("chain_transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  releaseId: uuid("release_id").references(() => printReleases.id),
  chainId: integer("chain_id").notNull(),
  txHash: text("tx_hash"),
  // pending | confirmed | failed
  status: text("status").notNull().default("pending"),
  blockNumber: integer("block_number"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditEvents = pgTable("audit_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorType: text("actor_type").notNull(),
  actorId: text("actor_id"),
  action: text("action").notNull(),
  targetType: text("target_type"),
  targetId: text("target_id"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// --- relations used for joins ---

export const orderRelations = relations(printOrders, ({ one }) => ({
  owner: one(users, { fields: [printOrders.ownerId], references: [users.id] }),
  document: one(documents, { fields: [printOrders.documentId], references: [documents.id] }),
}));

export const grantRelations = relations(shareGrants, ({ one }) => ({
  order: one(printOrders, { fields: [shareGrants.orderId], references: [printOrders.id] }),
}));

export const sessionRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));
