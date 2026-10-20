# Runbook — Incident response

## Severity

| Sev | Definition | Response |
|-----|------------|----------|
| SEV1 | Payments broken, data leak suspected, total outage | Immediate page; war room |
| SEV2 | Checkout degraded, fulfilment stuck, elevated errors | Respond within 30 min |
| SEV3 | Partial feature broken, workaround exists | Business hours |

## Process

1. **Detect** — alert, customer report, or provider notice  
2. **Triage** — severity, blast radius, when started, last deploy  
3. **Contain** — disable pilot traffic (`PILOT_MODE` / feature flag), freeze payouts if money risk, rotate secrets if leak  
4. **Mitigate** — rollback, config fix, provider failover  
5. **Communicate** — status to sellers/customers if customer-facing; internal timeline  
6. **Recover** — restore service; verify reconciliation  
7. **Postmortem** — within 5 business days for SEV1/SEV2  

## Money-related incidents

- Pause payout job (`JOBS_SECRET` endpoints)  
- Do not manually edit `sellerLedger` — append compensating entries only after finance sign-off  
- Capture provider settlement IDs before any manual refund  

## Evidence to preserve

Request IDs, webhook payloads (redact PAN), deploy SHA, screenshots of provider dashboards.  
