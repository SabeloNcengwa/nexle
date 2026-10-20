# Mavundla Marketplace — Security

## Principles

- Deny by default (Firestore rules, Storage rules, API authorization).
- Authentication is not authorization.
- Never trust client-supplied UID, role, seller ID, amount or status.
- Firebase Admin SDK bypasses Security Rules — every API route must authorize.
- Secrets stay server-side / managed secret store; never commit `.env` or service-account JSON.

Phase 5 internal review: `docs/security-review-phase5.md`. Production startup guards refuse unsafe mock/CORS/`JOBS_SECRET` configs; pilot mode restricts sell/buy to `PILOT_SELLER_ALLOWLIST`.

## Roles

| Role | Scope |
|------|-------|
| guest | Unauthenticated browse |
| customer | Own profile, future cart/orders |
| seller_owner | Full seller account |
| seller_manager | Catalogue, orders (configurable) |
| seller_staff | Limited seller ops |
| support_agent | Customer/order support (platform) |
| catalogue_moderator | Listing & category moderation |
| finance_operator | Finance workflows (Phase 3) |
| super_admin | Full platform control |

Platform roles live on `users.platformRoles`. Seller roles live on `sellerMembers`.

## API authorization helpers

| Helper | Behaviour |
|--------|-----------|
| `requireAuthenticatedUser` | Verify Firebase ID token; load user; attach actor |
| `requirePlatformPermission` | Require one of listed platform roles |
| `assertSellerPermission` | Membership + permission grant for sellerId |
| `assertOrderAccess` | Phase 2+ |
| `assertFinancePermission` | Phase 3+ |

Deny by default when helper checks fail (403).

## Admin bootstrap

Public administrator registration is **disabled**.

1. Create a Firebase Auth user (email/password or approved IdP) via console or emulator.
2. Run `npm run bootstrap:admin -- --uid <UID> --email <email>` with Admin credentials / emulator.
3. Script sets `platformRoles: ["super_admin"]` on `users/{uid}` and writes an audit log.
4. Privileged portals require authenticated session + platform role checks on every request.

For production, prefer stronger auth (MFA / IdP) for `super_admin`, `finance_operator` and similar — document in ops runbooks before pilot.

## Firestore rules (summary)

- Default: `allow read, write: if false;`
- `users`: owner read; owner update of non-role fields only; no client role writes
- `sellerApplications`: owner create/read/update while draft/rejected; staff read/update for review
- `sellers`, `sellerMembers`: member or staff read; writes via Admin SDK / privileged rules only where safe
- `categories`: public read of active; writes staff only
- `products`: public read of `active` (+ seller active — enforced primarily via API queries); seller members manage own drafts; moderators update status
- `inventory`: seller members / staff; no public read of raw stock docs preferred (API exposes availability)
- `auditLogs`, financial collections: no client writes

Full rules: `firebase/firestore.rules`. Tested with Emulator Suite.

## Storage rules (summary)

- Default deny
- Product images: authenticated seller member upload under `sellers/{sellerId}/products/{productId}/…` with MIME/size checks
- Verification docs: `sellerApplications/{applicationId}/docs/{uid}/…` — owner upload; staff read; **no public URLs**
- No token download URLs for private verification paths in application code — use short-lived signed URLs from API

## API hardening (Phase 1 baseline)

- CORS allowlist via env
- JSON body size limit
- Correlation ID middleware
- Safe error responses (no stack traces in production)
- Zod validation on all mutating routes
- Rate limiting middleware (basic in-memory for Phase 1; replace with managed limiter in production)

## Phase 2–3 commerce / finance controls

- Cart/order/payment/reservation/webhook/idempotency/ledger/refund/payout: **no client writes**
- Checkout recalculates prices and stock; never trusts browser amounts
- Mock payment webhooks require HMAC signature + amount/currency match
- Duplicate webhook `eventId` values are stored and ignored on replay
- `assertOrderAccess` gates order reads; finance routes use `requirePlatformPermission` / seller finance permission
- Refunds: request ≠ complete; provider status must be reconciled before ledger + `succeeded`
- Payouts: finance approval required to initiate; `paid` only after provider confirmation
- Ledger is append-only; no destructive edits
- Mock provider refuses production use unless `ALLOW_MOCK_PAYMENTS=true` (never for live money)
- Production gateway must pass `docs/payment-provider-diligence.md` before enablement

## Phase 4 fulfilment controls

- Shipments/returns/notifications/jobs/supportNotes: **no client writes**
- Courier webhooks require HMAC signature + idempotent `eventId` storage
- Estimates vs confirmed bookings are explicit (`rateEstimateOnly`)
- Notification send failures retry via jobs and never roll back payments/orders
- Support customer notes notify via durable queue; internal notes stay staff-only

## Threat notes for later phases

- Production courier credential leakage → Secret Manager (Phase 5 ops)
- Load / abuse of tracking endpoints → rate limits already baseline; tune in Phase 5

## Reporting issues

Internal: escalate to platform security owner. Do not file secrets in GitHub issues.
