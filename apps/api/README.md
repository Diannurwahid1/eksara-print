# @eksara/api — NestJS backend scaffold

Implementation of the contract in [`docs/backend-handoff.md`](../../docs/backend-handoff.md). This is a scaffold: the customer-facing HTTP contract (§3) and Station contract (§4) are implemented end-to-end against PostgreSQL; the Monad relayer and WebSocket events are clearly-marked stubs.

## Setup

```bash
cp .env.example .env          # fill DATABASE_URL (Postgres)
pnpm --filter @eksara/api db:push   # create tables via drizzle-kit
pnpm --filter @eksara/api dev       # start on :4000, OpenAPI doc at /openapi
```

Google login requires `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`GOOGLE_REDIRECT_URI`; without them `/v1/auth/google/start` returns `GOOGLE_NOT_CONFIGURED`.

## Implemented (customer contract §3)

- `GET /v1/auth/google/start`, `GET /v1/auth/google/callback` (OAuth code + PKCE), `POST /v1/auth/logout`, `GET /v1/me`
- `POST /v1/documents/upload-intents` (50 MB limit, MIME allowlist, dev presigned-style PUT URL), `PUT /v1/documents/:id/blob`, `POST /v1/documents/:id/complete`
- `POST /v1/print-orders` (creates order + share grant; PIN returned once), `GET /v1/print-orders?scope=mine`, `GET /v1/print-orders/:id`
- `GET /v1/share-grants/:token/public`, `POST /v1/share-grants/:token/handoff` (server-side PIN check, rate limiting, 60 s single-use ticket), `POST /v1/share-grants/:token/revoke`

## Implemented (station contract §4)

- `POST /v1/station/devices/pair/start`, `pair/approve` (credential returned once; TODO shop-owner auth)
- `POST /v1/station/handoffs/claim` (atomic single-use ticket consumption)
- `GET /v1/station/jobs/:id`, `POST /v1/station/jobs/:id/authorize-release` (atomic one-release-per-grant guard), `GET /v1/station/jobs/:id/download` (single-use 2 min lease), `POST /v1/station/jobs/:id/status`, `GET /v1/station/jobs/:id/receipt`
- Station auth: `Authorization: Bearer <credential>` via `StationGuard`

## Stubs (marked in code with TODO)

- `BlockchainService` — placeholder tx hashes; real version must call `consumeAuthorization()` via viem with a server-only relayer key (handoff §2 step 8, §5).
- `EventsGateway` — `/v1/events` accepts sockets but does not authenticate or emit.
- Shop dashboard APIs (`/v1/shops/...`), shop-bound handoff tickets, PIN slow-KDF, AV scanning, transactional outbox.

## Station smoke test

```bash
PAIR=$(curl -s -X POST localhost:4000/v1/station/devices/pair/start \
  -H 'Content-Type: application/json' -d '{"name":"Counter 1"}')
CRED=$(echo "$PAIR" | jq -r .credential)
curl -s -X POST localhost:4000/v1/station/devices/pair/approve \
  -H 'Content-Type: application/json' -d "{\"pairingCode\":\"$(echo "$PAIR" | jq -r .pairingCode)\"}"
# claim a handoff ticket from /v1/share-grants/:token/handoff:
curl -s -X POST localhost:4000/v1/station/handoffs/claim \
  -H "Authorization: Bearer $CRED" -H 'Content-Type: application/json' -d '{"ticket":"..."}'
```
