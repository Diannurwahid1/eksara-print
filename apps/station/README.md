# Eksara Station

Electron desktop workspace for print shops. The UI follows the supplied Eksara Station mockup and remains separate from the Next.js customer platform in `apps/web`.

## Run

From the repository root:

```bash
pnpm install
pnpm dev:station
```

The command opens Electron and serves its React renderer from `http://127.0.0.1:5173`. `pnpm build:station` builds the renderer; `pnpm --filter @eksara/station start` opens the built app. The application registers the `eksara-station://claim?ticket=...` deep link handler with the OS, but an installed package/OS registration is needed for reliable browser handoff.

## Current behavior

- Dashboard, queue, request details, print controls, sidebar navigation, and window controls. Unsupported management modules show Coming soon.
- Queue search/filter, job selection, preview paging/zoom, printer selection, refresh, and dismissible notifications.
- Electron main process discovers OS printers. The renderer receives only printer metadata through a narrow, context-isolated preload bridge.
- With no API credentials, the queue is empty and Station clearly shows that it is unconfigured. No sample orders, revenue, stock, or document preview are shown.
- With an API URL and development device token configured, the main process lists real jobs, claims a one-use handoff ticket, obtains a Monad-authorized release, and downloads the file to an app-owned temporary directory. The virtual printer renders PDF or image input through Electron to a verified PDF. The operator confirms completion; Station removes the input and output files and asks the API to delete the stored document and record a deletion attestation. Physical printer selection opens the file in the OS viewer and requires operator confirmation; spooler completion is not verified.

## API development configuration

Set these process environment variables before starting Electron:

```text
EKSARA_API_BASE_URL=https://ekastra.web.id/api
EKSARA_STATION_DEVICE_TOKEN=paired-device-development-token
```

For local development, `http://127.0.0.1:<port>` is allowed. The token is kept in Electron main process and never exposed through the preload API. Run `pnpm --filter @eksara/station test:print` to exercise the virtual PDF printer locally. An environment variable is only an integration placeholder; replace it with device pairing and OS credential storage before using real customer files.

On the development Windows machine, run `powershell -ExecutionPolicy Bypass -File apps/station/start-connected.ps1` from the repository root to launch the built Station against `https://ekastra.web.id/api`. The script reads only the Station token from the ignored local `apps/api/.env`. It does not embed the credential in the renderer or Git. DNS and trusted HTTPS for the domain must be active first.

Current endpoints are in [backend-implementation.md](../../docs/backend-implementation.md): `GET /v1/station/jobs`, `POST /v1/station/handoffs/claim`, `GET /v1/station/jobs/{id}`, `POST /v1/station/jobs/{id}/authorize-release`, and `POST /v1/station/jobs/{id}/complete`. Shop/device binding and scoped tenant reads remain production work.

## Before physical printing

Implement secure device pairing and credential rotation, one-use download lease handling, validated file rendering and malware scanning, a native printer adapter with spooler monitoring, and failure/retry policy. Current manual completion is an operator attestation; a chain receipt confirms authorization or a recorded deletion claim, not successful paper output. Never silently print from a deep link.
