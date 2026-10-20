# Public launch runbook (exit pilot)

## Preconditions (all required)

- [ ] Pilot exit criteria in `docs/pilot-runbook.md` met  
- [ ] Legal/commercial public-launch items cleared (`docs/legal-commercial-checklist.md`)  
- [ ] Security review acknowledgements + MFA for privileged accounts  
- [ ] Staging restore drill + rollback drill completed  
- [ ] SLOs agreed (`docs/slos.md`) and monitoring/alerts live  
- [ ] Payment diligence signed → `PAYMENT_DILIGENCE_SIGNED=true` + API key in Secret Manager  
- [ ] Courier diligence signed → `COURIER_DILIGENCE_SIGNED=true` + API key  
- [ ] Email diligence signed → `EMAIL_DILIGENCE_SIGNED=true` + API key  
- [ ] Live HTTP adapters implemented for selected providers (scaffolds alone are **not** enough)  
- [ ] `npm run validate:prod-env` passes with launch env  

## Cutover steps

1. Announce maintenance window to pilot sellers  
2. Set `MAINTENANCE_MODE=true`; drain jobs  
3. Deploy release with:
   ```env
   PILOT_MODE=false
   PUBLIC_LAUNCH=true
   PAYMENT_PROVIDER=<diligenced adapter>
   COURIER_PROVIDER=<diligenced adapter>
   EMAIL_PROVIDER=<diligenced adapter>
   SMS_PROVIDER=<diligenced or mock with ALLOW_MOCK_SMS if SMS deferred>
   ```
4. Smoke: login, browse, checkout (sandbox or live micro-amount), shipment book, notification job  
5. Clear `MAINTENANCE_MODE`  
6. Watch dashboards for 2 hours; finance reconciliation same day  

## Abort

Revert traffic to previous revision; restore `PILOT_MODE=true` + allowlist; follow incident runbook.

## Explicit non-claims

Setting `PUBLIC_LAUNCH=true` with pending diligence adapters will **fail startup** or return 501 on money/ship/email paths. Credentials without a completed HTTP adapter still return `PROVIDER_ADAPTER_PENDING`.
