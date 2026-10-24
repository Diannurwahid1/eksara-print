# Eksara backend and Print Station handoff

> Dokumen ini adalah rancangan awal. Keputusan terbaru memakai direktori lokal privat pada host API, bukan S3. Status implementasi dan langkah operasional terbaru ada di [backend-implementation.md](backend-implementation.md).

**Status:** implementation contract for the backend and desktop teams, 24 October 2026. The frontend in `apps/web` is implemented. This document does not imply that Google OAuth, private storage, printing, or Monad transactions are already running.

**Ringkasan untuk tim:** web pelanggan dan sistem manajemen print shop adalah dua permukaan produk yang terpisah. Pelanggan masuk melalui Google, mengunggah file, mengatur cetak, lalu membagikan tautan, PIN, atau QR. Operator toko membuka tautan, memverifikasi PIN, dan browser mencoba membuka aplikasi desktop melalui tiket sekali pakai. NestJS menjadi satu-satunya sumber data/izin; Electron baru mengambil file dan mencetak setelah perangkat dan izin Monad tervalidasi. Halaman detail order pelanggan ada di `/app/orders/{id}`, sedangkan `/p/{token}` khusus penerima di toko.

## 1. Product boundary

| Surface | Owner | Purpose |
| --- | --- | --- |
| Public website + customer workspace | `apps/web` (Next.js) | Landing, Google login, upload, preferences, note, link/PIN/QR, sharing, status |
| Print shop management | Separate shop web application | Shop account, staff, devices, queue, reporting |
| Eksara Station | Separate Electron desktop application | Claim an authorized job, download the document, select printer, monitor spooler |
| Central API | NestJS | Identity, access control, private files, orders, shop routing, state machine, Monad relayer |

An earlier source PRD described guest customer orders. **The current Eksara PRD and user instruction use Google OAuth for customer login.** Shop staff authenticate with separate shop roles; a customer account must never grant station or shop permissions.

Both web and desktop call the same versioned NestJS API. Keep business logic out of Next.js route handlers. Use an OpenAPI document and generate a typed client for both applications after backend DTOs stabilize.

## 2. Exact user flow

1. Customer clicks **Continue with Google**. The browser is redirected to `GET /v1/auth/google/start?returnTo=/app`; NestJS performs OAuth authorization code + PKCE, verifies the Google identity, creates/loads the customer, sets a secure session cookie, and redirects to `/app`.
2. Customer selects one PDF, DOCX, PPTX, JPG or PNG, up to 50 MB. Web requests an upload intent; the API returns an authenticated PUT endpoint. Web uploads to the API's private local directory, then calls `complete` for server-side validation.
3. Customer chooses paper size, color, copies, sides, finishing, and optional note. `POST /v1/print-orders` creates a draft order and one share grant. The response contains a random opaque public token, an independently generated six-digit PIN shown **once**, expiration, and order metadata.
4. Web renders `/p/{token}` as a link and QR. Customer sends link plus PIN by WhatsApp or email. Those buttons open the user's own apps with composed text; they do not send messages from the backend.
5. Shop operator opens the link on the shop computer. Public GET returns only safe metadata and status, never the file or customer contact. Operator enters PIN. The API validates PIN, expiry, shop/device authorization and rate limits, then issues a **short-lived, single-use handoff ticket**.
6. Browser attempts `eksara-station://claim?ticket={ticket}`. Browsers may require an OS prompt; the page keeps an **Open Print Station** button as fallback. Never include the document URL, PIN, session cookie, or long-lived credential in the custom URI.
7. Station receives the ticket, authenticates with its paired device credential, claims it with the API, and shows the job for operator review. The operator explicitly selects printer and starts processing. A browser deep link by itself must never trigger silent printing.
8. Backend validates the one-time authorization, submits/observes a Monad transaction, and issues a short-lived single-use download lease. Station downloads the document, prints, reports spooler events, and receives a final receipt. Customer status updates through polling or WebSocket.

For WhatsApp/email handoff, the customer may share the PIN in the same message for MVP usability. A higher-assurance rollout should use a second channel or shop-bound claims. PIN verification must always happen server-side.

## 3. HTTP API contract expected by the current frontend

Base URL comes from `NEXT_PUBLIC_API_BASE_URL`. Browser requests use `credentials: include`. Configure CORS for the exact customer origin and `Access-Control-Allow-Credentials: true`. Production cookie: `HttpOnly; Secure; SameSite=Lax` when on same site, with CSRF protection on mutations. Cross-site deployment requires an explicit cookie/CSRF design.

Successful JSON objects use camelCase. Errors use `{ "code": "PIN_INVALID", "message": "Incorrect PIN" }` with an appropriate HTTP status. Never return the PIN from list/detail endpoints after initial creation.

| Method | Path | Caller | Response/notes |
| --- | --- | --- | --- |
| GET | `/v1/auth/google/start?returnTo=/app` | Browser | Redirect to Google. Validate `returnTo` against an allowlist. |
| GET | `/v1/auth/google/callback` | Google redirect | Establish browser session; redirect to allowlisted web route. |
| POST | `/v1/auth/logout` | Customer web | Clear server session/cookie. |
| GET | `/v1/me` | Customer web | `{ name, email, picture? }`; 401 if signed out. |
| POST | `/v1/documents/upload-intents` | Customer web | Body `{ fileName, mimeType, sizeBytes, sha256 }`; response `{ documentId, uploadUrl, uploadHeaders? }`. |
| PUT | `/v1/documents/{documentId}/content` | Customer web | Authenticated file stream; API checks size and SHA-256 and writes to private local storage. |
| POST | `/v1/documents/{documentId}/complete` | Customer web | Validate actual object type, size, checksum, malware scan status; return safe document metadata. |
| POST | `/v1/print-orders` | Customer web | Body `{ documentId, options, note, expiresInHours: 24 }`; response `Order` below. Idempotency key recommended. |
| GET | `/v1/print-orders?scope=mine` | Customer web | Array of customer orders, **without PIN**. Paginate in production. |
| GET | `/v1/print-orders/{id}` | Customer web | Owned order and receipt summary, without PIN. |
| GET | `/v1/share-grants/{token}/public` | Public browser | `{ fileName, expiresAt, status }` only. |
| POST | `/v1/share-grants/{token}/handoff` | Shop browser | Body `{ pin }`; response `{ handoffTicket, expiresAt }`. Requires shop login or station-bound browser pairing before issuing a usable ticket. |
| POST | `/v1/share-grants/{token}/revoke` | Customer web | Revoke owned unused grant. |

The frontend currently expects the `POST /v1/print-orders` response to include `id`, `token`, `fileName`, `fileSize`, `fileType`, `options`, `note`, `pin`, `createdAt`, `expiresAt`, `status`. Add `documentId` and receipt fields as the client evolves. If the API changes shape, update `apps/web/lib/api.ts` through a generated OpenAPI client.

`options` is `{ paperSize: "A4" | "A3" | "Letter", color: "bw" | "color", copies: 1..99, sides: "single" | "double", finishing: "none" | "staple" | "bind" }`. `note` max length: 300 characters. Validate all values on the server; do not trust UI limits.

## 4. Station and shop API

These endpoints are required for actual end-to-end printing and are not called by the current customer frontend.

| Method | Path | Role | Purpose |
| --- | --- | --- | --- |
| POST | `/v1/station/devices/pair/start` | Station | Show short pairing code and device public key. |
| POST | `/v1/station/devices/pair/approve` | Shop owner | Approve a device for one shop. |
| POST | `/v1/station/handoffs/claim` | Paired station | Exchange handoff ticket for job ID after checking shop/device binding; consume ticket atomically. |
| GET | `/v1/station/jobs` | Paired station | Queue for the station's paired shop. Return only authorized job metadata and approved print options. |
| GET | `/v1/station/jobs/{id}` | Paired station | Job detail and approved print options; no permanent file URL. |
| POST | `/v1/station/jobs/{id}/authorize-release` | Paired station | Atomically reserve one release and start Monad authorization/consume. Return release lease only after confirmation policy. |
| GET | `/v1/station/jobs/{id}/download` | Paired station + lease | Stream/decrypt file or return very short-lived signed URL. One lease per release. |
| POST | `/v1/station/jobs/{id}/status` | Paired station | Report `processing`, `printed`, or `failed` with spooler ID and idempotency key. |
| GET | `/v1/station/jobs/{id}/receipt` | Station/customer | Authorization ID, chain ID, tx hash, block status and local spooler outcome. |
| GET | `/v1/shops/{shopId}/orders` | Shop staff | Shop queue only. |
| WS | `/v1/events` | Authorized clients | `order.updated`, `station.job.available`, `station.device.revoked`. |

Station installation registers the `eksara-station` protocol on Windows. Main process validates URI scheme, ticket syntax and length; renderer never receives device secret. Use `contextIsolation: true`, `nodeIntegration: false`, sandbox, narrow IPC, TLS certificate validation, and an allowlist for external navigation. Use a device-specific credential with rotation and revocation. Desktop printer integration requires an OS/driver test matrix; a Monad receipt is not proof of physical paper output.

`apps/station` now contains the Electron renderer, secure preload bridge, printer discovery, queue preview, and API request scaffold. In demo mode it uses sample requests and **simulates** release without downloading or printing a document. With `EKSARA_API_BASE_URL` and `EKSARA_STATION_DEVICE_TOKEN` configured, its main process calls the station endpoints above; the bearer token environment variable is a development integration placeholder, not a production credential store. The `authorize-release` request currently stops after API authorization. Before real printing, implement device pairing and secure credential storage, short-lived download lease handling, validated file rendering, printer adapter/spooler tracking, idempotent status reporting, and a retry policy. Do not treat API authorization or Electron's `print()` callback as proof of a completed physical print.

## 5. State and security rules

Suggested states: `draft → shared → opened → processing → printed`; terminal alternatives `expired`, `revoked`, `failed`. `opened` means PIN validated and handoff accepted, **not printed**. A grant can be claimed at most once for release; retries of HTTP calls must be idempotent. A failed printer job needs an explicit server decision about retry versus cancellation, with an audit record, so it cannot quietly print twice.

- Token: CSPRNG, at least 128 bits of entropy, stored hashed if practical. Do not use sequential order IDs as share secrets.
- PIN: six random digits generated server-side; store a slow hash/HMAC, limit attempts per token/IP/shop, and lock temporarily after repeated failures. Public error responses must avoid account enumeration.
- Handoff ticket: CSPRNG opaque value, TTL around 60 seconds, one use, bound to intended shop/device and grant. A copied deep link cannot become a reusable document URL.
- File: private local directory on the API host, restricted OS permissions, short retention, no static/public URL. Application-level encryption and AV/type validation are still required for production. PDF/DOCX/PPTX conversion, page count and preview require isolated workers; never parse untrusted files in the web process.
- PII and document bytes remain off-chain. Monad records a hash/authorization ID, grant/consume/revoke events and receipt only. Use chain ID 10143 in the provided project plan for testnet configuration, verified against the deployment environment before release.
- Google OAuth: state, nonce, PKCE, allowed redirect URIs, server-side ID token validation; no Google access token in localStorage. Distinguish customer, shop owner, staff, station, admin and relayer principals.
- Customer order reads/writes are owner-scoped. Shop APIs are tenant-scoped. Station can access only jobs assigned to its paired shop. Relayer key stays server-side.
- Log state transitions and transaction hashes; redact file names, PINs, raw tokens and URLs from general logs. Add retention/deletion and audit policies before real customer documents.

## 6. Data model and infrastructure

Current storage decision: a private local directory on the API host. The broader draft stack from the supplied blueprint included NestJS + TypeScript, PostgreSQL + Drizzle ORM, Redis + BullMQ, Socket.IO/WebSocket, Monad + Solidity/Foundry + viem, and Electron + React. Keep API, worker, desktop and shop management in separate packages/apps of the monorepo.

Core tables: `users`, `oauth_accounts`, `sessions`, `shops`, `shop_memberships`, `stations`, `documents`, `print_orders`, `share_grants`, `handoff_tickets`, `print_releases`, `print_events`, `chain_transactions`, `audit_events`. All shop-owned records carry `shop_id`; foreign keys and query policies enforce tenant boundaries. Store file object keys instead of public URLs. Add uniqueness on consumed grant/release and idempotency keys.

Worker tasks: upload validation/scan, document preview and page count, expiration/revocation, Monad transaction submission and reconciliation, receipt indexing, safe file deletion. Reconcile chain state and database state after restarts. Use a transactional outbox or equivalent for state changes that publish queue/events.

## 7. Integration acceptance checks

1. Google login establishes a server session; refreshed `/app` loads the same customer and their own orders.
2. 50 MB boundary and unsupported formats are rejected by both UI and API. Failed upload cannot create a share grant.
3. Two customers cannot read or revoke each other's orders. Public link reveals no file bytes or PIN.
4. Wrong PIN, expired token, revoked token, and repeated attempts are rejected; no handoff ticket is created.
5. Valid shop claim opens Station via protocol prompt/fallback; the ticket cannot be used twice or by a different paired station.
6. A second release attempt is rejected at API and smart-contract level. A printer failure follows a documented retry decision.
7. Customer status and receipt match the authoritative backend; on-chain tx hash is linked only after confirmed submission.
8. WhatsApp/email and QR all carry the same `/p/{token}` URL. Deep link carries only a short-lived ticket.

## 8. Frontend follow-up when API is ready

Replace browser demo persistence with the generated API client; fetch orders and status live, add logout API call, use server-returned preview/page count, and hide the PIN after first display. The current frontend has initial remote calls in `apps/web/lib/api.ts`, but its Google button is intentionally disabled until `NEXT_PUBLIC_API_BASE_URL` is set. Test the complete flow against a running NestJS API and a paired Windows Station before calling it production-ready.
