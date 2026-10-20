# Service level objectives (public launch)

Targets for graduating from pilot (`PUBLIC_LAUNCH=true`). Measure on staging first, then production.

| SLO | Target | Window | Signal |
|-----|--------|--------|--------|
| API availability | ≥ 99.5% | 30 days | `/ready` uptime checks |
| API latency (read) | p95 ≤ 500 ms | 7 days | catalogue / health probes |
| Checkout start success | ≥ 99% | 7 days | `startCheckout` non-5xx |
| Payment webhook processing | ≥ 99.9% idempotent apply | 7 days | paymentEvents vs PSP |
| Notification delivery | ≥ 98% sent within 15 min | 7 days | backgroundJobs succeeded |
| Error budget | < 0.5% 5xx | 7 days | reverse proxy / Cloud Run |

## Error budget policy

If availability or 5xx budget is burned for the rolling window:

1. Freeze non-critical deploys  
2. Set `MAINTENANCE_MODE=true` only for SEV1 money/data risk  
3. Follow `docs/runbooks/incident-response.md`  

## Not yet enforced automatically

These SLOs are operational targets documented for launch — alerting should be wired in the hosting environment before `PUBLIC_LAUNCH=true`.
