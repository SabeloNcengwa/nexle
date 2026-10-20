# Pilot runbook

## Goals

- Validate checkout → mock/sandbox pay → fulfilment → returns with a small seller set  
- Prove ops: backups, alerts, rollback, reconciliation  
- Collect product feedback without open marketplace risk  

## Preconditions

- [ ] `docs/security-review-phase5.md` acknowledged  
- [ ] Legal/commercial checklist blockers for pilot scope cleared or explicitly waived  
- [ ] Staging restore drill done  
- [ ] `validate:prod-env` passes for the target environment  
- [ ] MFA enabled for all admin accounts  
- [ ] `PILOT_MODE=true` and non-empty `PILOT_SELLER_ALLOWLIST`  

## Pilot config

```env
NODE_ENV=production
PILOT_MODE=true
PILOT_SELLER_ALLOWLIST=sellerId1,sellerId2
PAYMENT_PROVIDER=mock
ALLOW_MOCK_PAYMENTS=true
COURIER_PROVIDER=mock
ALLOW_MOCK_COURIER=true
JOBS_SECRET=<strong-random>
CORS_ORIGIN=https://your-pilot-host
```

For sandbox PSP later: set `PAYMENT_PROVIDER` to the adapter name and turn off `ALLOW_MOCK_PAYMENTS` only after diligence.

## Admission

1. Approve sellers in admin; add their IDs to allowlist; redeploy/restart API  
2. Invite buyers (closed group); no public ads required  
3. Cap: suggest ≤ 20 sellers, ≤ 200 SKUs for first wave  

## Daily pilot ops

1. Check `/ready` and error dashboard  
2. Run reconciliation for previous day  
3. Process open returns / support tickets  
4. Trigger job endpoints with `X-Jobs-Secret` (or Cloud Scheduler)  

## Exit criteria (graduate from pilot)

- [ ] Zero unresolved SEV1 for 14 days  
- [ ] Reconciliation matches within agreed tolerance for 7 consecutive days  
- [ ] Live PSP + courier diligence complete **or** explicit decision to remain mock-only internal  
- [ ] Legal checklist public-launch items cleared  
- [ ] Load baseline meets agreed SLOs  
- [ ] `PILOT_MODE` can be disabled with monitoring in place  

## Abort

If money integrity or data exposure is suspected: set API to not-ready / remove traffic, follow `incident-response.md`, notify counsel.  
