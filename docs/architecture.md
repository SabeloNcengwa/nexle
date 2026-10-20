# Mavundla Marketplace — Architecture

## Purpose

Mavundla Marketplace is a nationwide South African multi-vendor ecommerce platform operated by Mavundla Tech Solutions. Independent sellers own inventory, pricing, packing and fulfilment. Mavundla provides the technology platform, catalogue moderation, payments orchestration, commissions and operational tooling.

This is **not** a single-vendor shop. Sellers remain owners of their stock unless a future fulfilment service is explicitly configured.

## Repository layout

```
NEXLE/
  apps/
    web/          # React + Vite storefront, Seller Centre, Admin
    api/          # Express + Firebase Admin API
  packages/
    shared/       # Shared TypeScript types, Zod schemas, money helpers
  firebase/       # Firestore rules, Storage rules, indexes, emulator config
  docs/           # Architecture, data model, security, deployment
  scripts/        # Bootstrap admin, seed helpers
  .github/workflows/
```

## Technology stack (Phase 1)

| Layer | Choice | Notes |
|-------|--------|-------|
| Frontend | React 18, TypeScript (strict), Vite 6, SCSS modules, React Router 6, TanStack Query 5, Zod 3 | Multi-portal SPA |
| Backend | Node.js, Express 4, TypeScript, Firebase Admin SDK | Token verification + Admin SDK |
| Data | Cloud Firestore, Firebase Auth, Firebase Storage | Emulator Suite for local/CI |
| Validation | Zod (shared package) | Client and server |
| Tests | Vitest, React Testing Library, Supertest, @firebase/rules-unit-testing | Playwright reserved for later E2E |
| Tooling | ESLint, Prettier, GitHub Actions | npm workspaces monorepo |

Exact locked versions live in each package's `package.json` and the root lockfile after install.

## Portals

| Portal | Route prefix | Audience |
|--------|--------------|----------|
| Public storefront | `/` | Guests and customers |
| Seller Centre | `/seller/*` | Approved seller members |
| Administration | `/admin/*` | Platform staff roles |
| Auth | `/auth/*` | Sign-in / register |

## Backend module layout

```
apps/api/src/
  index.ts
  app.ts
  config/
  middleware/     # auth, correlation, errors, rate limit
  auth/           # token verification, actor resolution
  permissions/    # requireAuthenticatedUser, assertSellerPermission, …
  modules/
    users/
    sellers/      # applications, members, approval
    catalogue/    # categories, products, moderation
    cart/         # guest + authenticated carts
    checkout/     # pricing, reservations, orders, payments
    storage/      # signed upload helpers
  providers/      # mock payment (Phase 2); courier (Phase 4)
  jobs/           # reservation expiry (inline + secured HTTP trigger)
```

## Request flow

1. Client obtains Firebase ID token via Firebase Auth.
2. API verifies token with Admin SDK (`requireAuthenticatedUser`).
3. Actor is resolved from `users` (+ optional `sellerMembers`).
4. Route handlers validate input with Zod.
5. Application services enforce permissions and business rules.
6. Repositories talk to Firestore / Storage via Admin SDK.
7. Responses use a consistent `{ data }` / `{ error }` envelope.

**Authentication ≠ authorization.** Client-supplied UID, role, seller ID or status is never trusted without server checks.

## Phase boundaries

| Phase | Scope |
|-------|-------|
| 1 | Foundation, auth, roles, seller applications, catalogue, moderation, security rules, tests |
| 2 | Cart, price recalculation, atomic reservations, parent/seller orders, mock checkout, expiry jobs |
| 3 | Provider port + mock refunds/payouts, append-only ledger, refunds, payout reconciliation |
| 4 | Couriers (mock), shipments/tracking, physical returns, notifications jobs, support workflows |
| 5 | Security review, production guards, ops runbooks, load baseline, Docker, controlled pilot |
| **6 (current)** | Reviews/ratings, provider scaffolds, email/SMS ports, public-launch ops |

## External dependencies (Phase 1)

- Firebase project (Auth, Firestore, Storage) or Emulator Suite
- Node.js 20+ (documented against 24.x locally)
- npm 10+

Payment and courier providers are **not** wired in Phase 1. Mock adapters appear from Phase 2.

## Environment variables

See `.env.example` and `docs/deployment.md`.
