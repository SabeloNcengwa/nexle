# Mavundla Marketplace — Deployment & Local Setup

## Prerequisites

- Node.js 20+ (developed against Node 24.x)
- npm 10+
- Firebase CLI (`npm i -g firebase-tools`) for emulators and deploys
- Git

## Install

```bash
cd NEXLE
npm install
cp .env.example apps/api/.env
cp .env.example apps/web/.env   # or symlink shared vars as documented below
```

## Environment variables

Copy `.env.example` — names only, no secrets. Key variables:

| Variable | Used by | Purpose |
|----------|---------|---------|
| `NODE_ENV` | api | `development` / `test` / `production` |
| `PORT` | api | Default `8080` |
| `CORS_ORIGIN` | api | Comma-separated exact origins (https in production) |
| `REQUIRE_HTTPS` | api | Default on in production; set `false` only for break-glass |
| `ALLOWED_HOSTS` | api | Optional Host header allowlist |
| `WEBHOOK_IP_ALLOWLIST` | api | Optional payment/courier webhook source IPs |
| `JOBS_IP_ALLOWLIST` | api | Optional allowlist for `/v1/jobs/*` |
| `WEB_BASE_URL` | api | Public storefront origin (https in production) |
| `ADMIN_BASE_URL` | api | Staff console origin (https in production) |
| `FIREBASE_PROJECT_ID` | api, web | Firebase Auth project id |
| `FIREBASE_STORAGE_BUCKET` | api | Legacy; uploads use Supabase Storage |
| `SUPABASE_URL` | api | e.g. `https://sttgjxiyyyanfvynrqfb.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | api | Server-only Supabase key (**never commit**) |
| `SUPABASE_DB_URL` | api | Postgres URI (required for data store) |
| `GOOGLE_APPLICATION_CREDENTIALS` | api | Path to SA JSON for Auth Admin (**never commit**) — omit with Auth emulator |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | api | Inline SA JSON (or base64) for Render / Cloud hosts without a key file |
| `FIREBASE_AUTH_EMULATOR_HOST` | api | e.g. `127.0.0.1:9099` |
| `VITE_FIREBASE_API_KEY` | web | Public Firebase Auth config |
| `VITE_FIREBASE_AUTH_DOMAIN` | web | |
| `VITE_FIREBASE_PROJECT_ID` | web | |
| `VITE_FIREBASE_STORAGE_BUCKET` | web | |
| `VITE_FIREBASE_APP_ID` | web | |
| `VITE_SUPABASE_URL` | web | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | web | Optional; uploads go through API signed URLs |
| `VITE_API_BASE_URL` | web | e.g. `http://localhost:8080` |
| `VITE_USE_EMULATORS` | web | `true` for Auth emulator only |
| `ADMIN_BOOTSTRAP_SECRET` | api/scripts | Optional gate for bootstrap script |
| `WEB_BASE_URL` | api | Public web origin for mock checkout URLs |
| `JOBS_SECRET` | api | Required header `x-jobs-secret` for job triggers |
| `RESERVATION_EXPIRY_INTERVAL_MS` | api | In-process expiry poll (0 disables) |
| `ALLOW_MOCK_PAYMENTS` | api | Must not be set for real production money |
| `PAYMENT_PROVIDER` | api | `mock` (default) or `unconfigured` until diligence passes |
| `COURIER_PROVIDER` | api | `mock` (default) or `unconfigured` |
| `ALLOW_MOCK_COURIER` | api | Required to allow mock courier if `NODE_ENV=production` |
| `PILOT_MODE` | api | `true` to restrict sell/buy to allowlisted sellers |
| `PILOT_SELLER_ALLOWLIST` | api | Comma-separated seller IDs (required when `PILOT_MODE=true` in production) |
| `MAINTENANCE_MODE` | api | When `true`, `/ready` returns 503 |

Database and file uploads use **Supabase** — see [`docs/supabase-setup.md`](supabase-setup.md). Firebase Auth emulator port is **9099**; API listens on **8080**.

## Phase 5 ops docs

| Doc | Purpose |
|-----|---------|
| `docs/security-review-phase5.md` | Internal security review |
| `docs/pilot-runbook.md` | Controlled pilot procedure |
| `docs/legal-commercial-checklist.md` | Counsel/commercial gates |
| `docs/load-testing.md` | Baseline load harness |
| `docs/runbooks/*.md` | Monitoring, backups, incident, rollback, reconciliation |

## Docker (API)

```bash
docker build -f apps/api/Dockerfile -t mavundla-api .
docker run --rm -p 8080:8080 --env-file apps/api/.env mavundla-api
```

Production containers must pass `npm run validate:prod-env` with `NODE_ENV=production` before traffic.

## Scripts (Phase 5)

| Script | Description |
|--------|-------------|
| `npm run validate:prod-env` | Fail if production env is unsafe |
| `npm run load:baseline` | Concurrent `/health` + `/ready` baseline |

## Local development (emulators)

```bash
# Terminal 1 — Firebase Emulator Suite
npm run emulators

# Terminal 2 — API
npm run dev:api

# Terminal 3 — Web
npm run dev:web
```

Bootstrap first admin (with Auth emulator running, create a user first):

```bash
npm run bootstrap:admin -- --uid <UID> --email admin@example.com
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run build` | Build shared, api, web |
| `npm run lint` | ESLint all workspaces |
| `npm run typecheck` | `tsc --noEmit` all workspaces |
| `npm run test` | Vitest unit/integration |
| `npm run test:rules` | Firestore/Storage rules tests |
| `npm run emulators` | Start Firebase emulators |
| `npm run bootstrap:admin` | Promote first super_admin |

## Firebase project setup

1. Create Firebase project (dev / staging / prod separately).
2. Enable Email/Password Auth (add others as required).
3. Create Firestore (native mode) and Storage.
4. Deploy rules and indexes:

```bash
firebase use <projectAlias>
firebase deploy --only firestore:rules,firestore:indexes,storage
```

5. Provision least-privilege service account for Cloud Run / API; store JSON in secret manager.

## Environments

| Env | Firebase | API host | Secrets |
|-----|----------|----------|---------|
| development | Emulators or isolated Firebase | localhost | local `.env` (gitignored) |
| staging | Staging project | Cloud Run / Hosting rewrite | Secret Manager |
| production | Production project | Cloud Run / Hosting rewrite | Secret Manager |

Never use production credentials locally.

## CI (GitHub Actions)

Workflow `.github/workflows/ci.yml` runs on PR/push:

1. `npm ci`
2. lint
3. typecheck
4. unit tests
5. rules tests (Java-based emulators where available)

## Render (API) — production without Firebase Blaze

Postgres + Storage stay on **Supabase**. The Express API runs on **Render** (Docker).

1. Ensure [`render.yaml`](../render.yaml) is in the repo root (Node free plan; builds shared + api workspaces).
2. Push to GitHub, then Render Dashboard → **New → Blueprint** (or Web Service) connected to this repo.
3. Set secret env vars in the Render dashboard (never commit):
   - `SUPABASE_URL` (also set in blueprint), `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`
   - `FIREBASE_SERVICE_ACCOUNT_JSON` (contents of `secrets/nexle-marketplace-admin.json`, or base64)
   - `JOBS_SECRET` (16+ chars)
4. After deploy, note the service URL (e.g. `https://nexle-api.onrender.com`).
5. Set `VITE_API_BASE_URL` to that URL in `apps/web/.env.production` and `apps/admin/.env.production`, rebuild, deploy Hosting.
6. Probe `GET /health` and `GET /ready` on the Render URL.

Free tier cold-starts after idle (~30–60s).

## Cloud Run (API) — outline

1. Build image: `docker build -f apps/api/Dockerfile -t mavundla-api .`
2. Deploy with env from Secret Manager (`JOBS_SECRET`, Firebase, pilot flags).
3. Probe `/ready` (not only `/health`) for readiness.
4. Set min instances as needed for webhook latency.

## Hosting (Web) — outline

Vite static build → Firebase Hosting. Point `VITE_API_BASE_URL` at the Render (or Cloud Run) API origin.

## Backups / monitoring / rollback

See `docs/runbooks/backups.md`, `docs/runbooks/monitoring.md`, `docs/runbooks/rollback.md`.
