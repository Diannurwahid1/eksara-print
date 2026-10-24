# Eksara customer web MVP

This repository currently implements the **customer-facing frontend** in `apps/web`. It includes a landing page, Google sign-in entry, customer workspace, file preparation, print preferences, share link/PIN/QR, WhatsApp/email sharing, document and order lists, and the shop handoff page. The visual direction follows the supplied mockups; the hero artwork is an original generated asset. The UI uses Tailwind CSS, a shadcn-style Button primitive, Lucide icons, and a local Inter font.

The project uses Next.js + TypeScript, Tailwind CSS, a separate NestJS API, and a separate Electron Print Station. The API and desktop app are **specified, not implemented** in this repository. See [docs/backend-handoff.md](docs/backend-handoff.md).

## Run locally

```bash
pnpm install
pnpm dev
```

Open `http://127.0.0.1:3000`. With no API URL, choose **Enter demo workspace** on `/login`. Demo orders and status are stored in the current browser's `localStorage`; only file metadata is retained. The actual file remains in memory for a temporary preview and is never uploaded, shared, or printed. The `/p/demo` handoff preview uses PIN `123456`.

## Connect the backend

Create `apps/web/.env.local`:

```env
NEXT_PUBLIC_API_BASE_URL=https://api.example.com
```

The API must implement the exact browser contract in `docs/backend-handoff.md` and set a secure, HTTP-only session cookie after Google OAuth. With the API configured, the **Continue with Google** button starts `/v1/auth/google/start`; the frontend calls `/v1/me` and uploads files through private presigned URLs. A real Print Station install and OS protocol registration are required for the `eksara-station://` handoff.

## Structure

```text
apps/web/app/          Next.js routes
apps/web/components/   Reusable interface pieces
apps/web/lib/          Types, API adapter, explicit local demo store
apps/web/public/images Generated illustration
docs/backend-handoff.md Backend and Electron implementation contract
```

## Verification

```bash
pnpm typecheck
pnpm build
```
