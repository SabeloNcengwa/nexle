# Phase 5 — Internal security review

**Date:** 2026-10-20  
**Scope:** Codebase as of Phase 4 completion (API, web, Firestore/Storage rules, providers)  
**Method:** Architecture + code review against the master engineering threat model  
**Status:** Findings recorded; remediations applied where code-complete; residual risks require ops/legal sign-off before public pilot

This is an **engineering** review, not a third-party pentest or formal audit.

## Strengths

1. Deny-by-default Firestore/Storage rules; financial collections client-unwritable  
2. Firebase ID token verification on API; actor resolved server-side  
3. Reusable authorization helpers; client role escalation blocked in rules  
4. Money as integer cents; checkout recalculates prices/stock  
5. Payment/courier webhooks signature-checked; idempotent event storage  
6. Refunds/payouts require provider reconciliation before terminal success  
7. Mock providers blocked in production unless explicit allow flags  
8. Admin registration disabled; bootstrap script + audit log  

## Findings

| ID | Severity | Finding | Remediation |
|----|----------|---------|-------------|
| S1 | High | Production could start with `PAYMENT_PROVIDER=mock` if misconfigured | Startup production guard refuses unsafe mock/live mix; `validate:prod-env` script |
| S2 | High | `JOBS_SECRET` optional — job endpoints could be open if unset in prod | Required when `NODE_ENV=production` |
| S3 | Medium | In-memory rate limit is per-instance only | Documented; `/health`+`/ready` exempt; use managed edge rate limit before scale-out |
| S4 | Medium | Storage product-image write rules are coarse (auth + MIME) | Pilot: keep API as write path of record; tighten Storage rules when signed uploads land |
| S5 | Medium | No MFA enforced for `super_admin` / finance | Pilot runbook requires IdP MFA before privileged accounts |
| S6 | Low | `/health` reveals phase number | Kept for ops; `/ready` is the orchestration probe |
| S7 | Low | Support notes customer visibility relies on staff discipline | Documented in support runbook; audit log on note create |
| S8 | Info | Production payment/courier adapters not selected | Diligence docs remain blockers for live money / live labels |

## Residual risks (accept for controlled pilot only)

- No external pentest yet  
- Load tests are synthetic baselines, not production soak  
- Real PSP/courier not integrated — pilot should use mock or tightly scoped sandbox credentials only  
- POPIA / consumer-law policy text must be reviewed by counsel before public marketing  

## Sign-off checklist

- [ ] Engineering lead acknowledges findings S1–S8  
- [ ] Ops confirms Secret Manager + least-privilege SA  
- [ ] Counsel completes legal/commercial checklist  
- [ ] Pilot allowlist sellers approved  
- [ ] Rollback drill completed once in staging  
