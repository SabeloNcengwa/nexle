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
| `CORS_ORIGIN` | api | Comma-separated origins |
| `FIREBASE_PROJECT_ID` | api, web | Project id |
| `FIREBASE_STORAGE_BUCKET` | api | Bucket name |
| `GOOGLE_APPLICATION_CREDENTIALS` | api | Path to SA JSON (**never commit**) — omit when using emulators |
| `FIREBASE_AUTH_EMULATOR_HOST` | api | e.g. `127.0.0.1:9099` |
| `FIRESTORE_EMULATOR_HOST` | api | e.g. `127.0.0.1:8080` — note port conflict with API; use `8085` for Firestore in firebase.json |
| `FIREBASE_STORAGE_EMULATOR_HOST` | api | e.g. `127.0.0.1:9199` |
| `VITE_FIREBASE_API_KEY` | web | Public web config |
| `VITE_FIREBASE_AUTH_DOMAIN` | web | |
| `VITE_FIREBASE_PROJECT_ID` | web | |
| `VITE_FIREBASE_STORAGE_BUCKET` | web | |
| `VITE_FIREBASE_APP_ID` | web | |
| `VITE_API_BASE_URL` | web | e.g. `http://localhost:8080` |
| `VITE_USE_EMULATORS` | web | `true` for local |
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

Firestore emulator port is configured as **8085** in `firebase.json` so the API can use **8080**.

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

## Cloud Run (API) — outline

1. Build image: `docker build -f apps/api/Dockerfile -t mavundla-api .`
2. Deploy with env from Secret Manager (`JOBS_SECRET`, Firebase, pilot flags).
3. Probe `/ready` (not only `/health`) for readiness.
4. Set min instances as needed for webhook latency.

## Hosting (Web) — outline

Vite static build → Firebase Hosting or equivalent CDN. Point `VITE_API_BASE_URL` at the API.

## Backups / monitoring / rollback

See `docs/runbooks/backups.md`, `docs/runbooks/monitoring.md`, `docs/runbooks/rollback.md`.
