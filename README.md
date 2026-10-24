# Eksara web and desktop MVP

This repository implements the customer web app, NestJS API, Monad contract, and an Electron print shop workspace. The web app includes a landing page, Google sign-in, wallet verification, file preparation, print preferences, share link/PIN/QR, WhatsApp/email sharing, order history, and SumoPod subscription checkout. Station follows the supplied dashboard mockup with a queue, request review, print controls, printer discovery, and a one-time handoff bridge.

The project uses Next.js + TypeScript, Tailwind CSS, Electron + React, a NestJS API with private local file storage, and a Monad smart contract. The physical printer adapter is not implemented. See [backend implementation status](docs/backend-implementation.md).

## Product documents

- [Eksara PRD and architecture draft](docs/Eksara_PRD_Monad_Blitz_v1.md)
- [Eksara BRD](docs/Eksara_BRD_Monad_Blitz_v1.md)
- [Backend and Print Station handoff](docs/backend-handoff.md)
- [Current backend implementation and deployment handoff](docs/backend-implementation.md)

The PRD and BRD are adapted copies of the supplied planning documents. They retain draft assumptions and distinguish planned capabilities from implemented frontend behavior.

## Run locally

```bash
pnpm install
pnpm dev
pnpm dev:api
```

Open `http://127.0.0.1:3000`. With no API URL, choose **Enter demo workspace** on `/login`. Demo orders and status are stored in the current browser's `localStorage`; only file metadata is retained. The actual file remains in memory for a temporary preview and is never uploaded, shared, or printed. The `/p/demo` handoff preview uses PIN `123456`.

To run the Electron station in a second terminal:

```bash
pnpm dev:station
```

Station shows an empty queue until connected to the API; it contains no sample orders or revenue. In API mode, Station downloads an authorized PDF or image. Its virtual printer generates and verifies a PDF; physical printer selection opens the file in the desktop viewer for manual printing. The operator confirms completion before local and server storage deletion is attested. This does not verify physical printer output. The renderer is also available at `http://127.0.0.1:5173`, though printer discovery and window controls require Electron.

## Connect the backend

Copy `apps/web/.env.example` to `apps/web/.env.local`, then set the API URL:

```env
NEXT_PUBLIC_API_BASE_URL=https://api.example.com
```

Set up the API according to `docs/backend-implementation.md`. The API stores uploads under `LOCAL_STORAGE_DIR` on its own machine; there is no S3 dependency. Keep that directory on a persistent private volume, outside the web root. With the API configured, the **Continue with Google** button starts OAuth, the frontend requires a verified wallet before upload, and the wallet signs a Monad one-time grant. A real Print Station install and OS protocol registration are required for the `eksara-station://` handoff.

For station API development, set `EKSARA_API_BASE_URL` and `EKSARA_STATION_DEVICE_TOKEN` in the station process environment. The latter is a temporary integration credential; production needs device pairing and secure OS credential storage. See [apps/station/README.md](apps/station/README.md) for the station endpoints and remaining printer work.

## Structure

```text
apps/web/app/          Next.js routes
apps/web/components/   Reusable interface pieces
apps/web/lib/          Types, API adapter, explicit local demo store
apps/web/public/images Generated illustration
apps/station/          Electron + React desktop workspace
apps/api/              NestJS API, database schema, storage, billing, Monad relayer
contracts/             One-time print protocol Solidity contract
docs/backend-handoff.md Backend and Electron implementation contract
```

## Verification

```bash
pnpm typecheck
pnpm build
pnpm build:api
pnpm build:contracts
pnpm test:api
```
