# Mavundla Marketplace — Phased Checklist

## Phase 1 — Foundation

- [x] Monorepo, auth, sellers, catalogue, security rules, tests

## Phase 2 — Cart & checkout

- [x] Guest/auth carts, pricing, reservations, multi-seller orders, mock checkout, expiry jobs

## Phase 3 — Payments, ledger, payouts

- [x] Mock payment refunds/payouts, append-only ledger, diligence doc for real gateway

## Phase 4 — Couriers, returns, notifications

- [x] CourierProvider + mock adapter (rates, book, track, cancel, return label, signed webhooks)
- [x] Shipments with estimate vs confirmed booking distinction
- [x] Tracking refresh, courier webhooks (idempotent), manual tracking fallback, exception queue
- [x] Physical returns workflow (request → approve → label → receive → inspect → refund link)
- [x] Notification templates + durable `backgroundJobs` with retries (email failures isolated)
- [x] Support dashboard, order lookup, customer-visible notes
- [x] Seller/Admin/Customer UI hooks
- [x] Unit tests for fulfilment helpers + mock courier
- [ ] Production courier adapter (blocked on credentials/docs)
- [ ] Real email/SMS provider (mock logger only)

## Phase 5 — Hardening & pilot

- [x] Internal security review doc + residual risk register (`docs/security-review-phase5.md`)
- [x] Production startup guards (`JOBS_SECRET`, CORS, mock allow flags, pilot allowlist)
- [x] `/ready` probe + `MAINTENANCE_MODE` + trust proxy
- [x] Pilot seller allowlist enforcement on catalogue + checkout
- [x] Ops runbooks: monitoring, backups, incident, rollback, reconciliation
- [x] Legal/commercial checklist (counsel sign-off still required)
- [x] Pilot runbook + Docker image for API
- [x] Load baseline harness (`npm run load:baseline`) + load-testing doc
- [x] `validate:prod-env` script wired in CI
- [x] Verification (2026-10-20): typecheck ✓, lint ✓, unit tests ✓ (shared 18 / api 32 / web 1), rules ✓ (5), build ✓, `validate:prod-env` skip-ok, local probe baseline 0 errors
- [ ] External pentest / formal audit
- [ ] Staging soak + authenticated checkout load recorded
- [ ] Counsel clears legal/commercial blockers for public pilot

## Phase 6 — Reviews, providers, notifications, public launch (current)

- [x] Product reviews & ratings (verified purchase, aggregation, moderation API + UI)
- [x] Payment adapter scaffolds (`paystack_marketplace`, `ozow_marketplace`) gated by diligence + API key
- [x] Courier adapter scaffolds (`the_courier_guy`, `bob_go`) gated by diligence + API key
- [x] Email/SMS provider ports (`mock` + SendGrid/SES/Resend/Twilio/Clickatell scaffolds)
- [x] Notification delivery routes through provider ports (user email resolved from profile)
- [x] `PUBLIC_LAUNCH` guards + SLOs + public launch runbook
- [x] Firestore rules/indexes for `reviews`
- [x] Verification: typecheck ✓, lint ✓, unit tests ✓ (shared 21 / api 36 / web 1), rules ✓ (5), build ✓
- [ ] Live HTTP mapping for selected PSP/courier/email/SMS (blocked on diligence + vendor docs)
- [ ] Counsel sign-off to set `*_DILIGENCE_SIGNED=true`
- [ ] Exit pilot / set `PUBLIC_LAUNCH=true` in production (ops cutover)
