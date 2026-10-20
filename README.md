# Mavundla Marketplace

Nationwide South African multi-vendor ecommerce marketplace operated by **Mavundla Tech Solutions**. Independent sellers own, price, stock and fulfil their own products.

Phases 1–5 delivered foundation through pilot hardening. **Phase 6** adds product reviews/ratings, diligenced provider scaffolds (payment/courier/email/SMS), and public-launch ops.

## Stack

| Area | Versions (declared) |
|------|---------------------|
| Node | ≥ 20 (local: 24.x) |
| React | 18.3 |
| Vite | 6.1 |
| Express | 4.21 |
| Firebase Admin / Client | 13.x / 11.x |
| TanStack Query | 5.66 |
| Zod | 3.24 |
| Vitest | 3.0 |
| TypeScript | 5.7 |

Exact resolved versions are in `package-lock.json` after `npm install`.

## Quick start

```bash
npm install
cp .env.example apps/api/.env
cp .env.example apps/web/.env

# Terminal 1
npm run emulators

# Terminal 2
npm run dev:api

# Terminal 3
npm run dev:web
```

Web: http://localhost:5173 · API: http://localhost:8080 · Emulator UI: http://localhost:4000

### Bootstrap first administrator

1. Create a user in the Auth emulator (or Firebase console).
2. Run:

```bash
npm run bootstrap:admin -- --uid <UID> --email admin@example.com
```

Public administrator registration is disabled.

## Workspace scripts

| Command | Purpose |
|---------|---------|
| `npm run build` | Build shared → api → web |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript `--noEmit` |
| `npm run test` | Unit / component tests |
| `npm run test:rules` | Firestore rules tests (needs emulator) |
| `npm run emulators` | Firebase Emulator Suite |

## Documentation

- [Architecture](docs/architecture.md)
- [Data model](docs/data-model.md)
- [Security](docs/security.md)
- [Deployment](docs/deployment.md)
- [Phase checklist](docs/phase-checklist.md)

## Phase status

**Phase 6 current.** Reviews are live on mock data paths. Named PSP/courier/email adapters are scaffolds gated by diligence flags — live HTTP mapping still pending. See `docs/public-launch-runbook.md` and `docs/slos.md`.
