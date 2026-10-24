# Eksara VPS deployment

Target: `ubuntu@43.157.229.224`, checkout `/home/ubuntu/eksara-print`. The web binds to `127.0.0.1:3087` and API to `127.0.0.1:3088`; Nginx routes `ekasra.web.id/` to web and `/api/` to API. These ports were free when first deployed on 24 October 2026. Existing Nginx sites are separate.

`apps/api/.env` and `apps/web/.env.local` are private files on the server and ignored by Git. They originate from the local development configuration, with production URL, port, database, storage path, and secure cookie changes. Do not commit or print these files. Station uses `EKSARA_API_BASE_URL=https://ekasra.web.id/api` and a paired `EKSARA_STATION_DEVICE_TOKEN` matching the API environment.

For the development Windows machine, `apps/station/start-connected.ps1` reads the same Station token from its ignored `apps/api/.env` and launches the built Electron app with the production API URL. This is a development pairing bridge, not a distributable or tenant-scoped credential system.

## Activation

1. Point the `A` record for `ekasra.web.id` to `43.157.229.224`.
2. Obtain a trusted TLS certificate for the domain, then redirect HTTP to HTTPS. The checked-in Nginx file is HTTP bootstrap configuration; secure sessions and Station HTTPS require this step.
3. Add `https://ekasra.web.id/api/v1/auth/google/callback` to the Google OAuth client's authorized redirect URIs. Configure the SumoPod webhook as `https://ekasra.web.id/api/v1/billing/webhook/sumopod`.
4. Test Google login, wallet signing on the configured Monad network, sandbox subscription payment, share/PIN handoff, Station virtual print, and deletion attestation before accepting customer files.

On the server, after a reviewed push to `main`:

```bash
cd /home/ubuntu/eksara-print
git pull --ff-only origin main
pnpm install --frozen-lockfile
pnpm --filter @eksara/api migrate
pnpm build:api
NODE_OPTIONS=--max-old-space-size=1024 pnpm build
sudo systemctl restart eksara-api eksara-web
curl -fsS http://127.0.0.1:3088/health
curl -fsSI http://127.0.0.1:3087/
```

The first database was created as `eksara_prod` with a separate generated password. API files live in `apps/api/data/private-files`, owned by `ubuntu`, outside the web root. Back up PostgreSQL and manage file retention deliberately. Current deletion evidence attests removal of the active API file path; it cannot prove removal of snapshots, other copies, print spool data, or physical paper.
