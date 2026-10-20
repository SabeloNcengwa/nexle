# Runbook — Monitoring & alerting

## Signals to collect

| Signal | Source | Alert when |
|--------|--------|------------|
| API `/ready` | Uptime check (every 60s) | 2 consecutive failures |
| HTTP 5xx rate | Cloud Logging / reverse proxy | >1% of requests over 5 min |
| Auth failures | API structured logs `auth.failed` | Spike >10× baseline |
| Payment webhook failures | `paymentEvents` / provider dashboard | Any sustained failure >15 min |
| Job worker errors | `/internal/jobs/*` logs | Error rate >0 with backlog |
| Firestore write contention | Firebase console | Sustained transaction aborts |
| Storage quota | Firebase / GCS | >80% of plan |

## Log fields (API)

Emit JSON lines with at least: `ts`, `level`, `msg`, `requestId`, `userId` (if any), `route`, `status`, `latencyMs`.

Correlation: clients may send `X-Request-Id`; otherwise generate UUID per request.

## Dashboards (minimum)

1. Request rate / latency p50–p95 / error rate  
2. Checkout → payment → paid conversion funnel counts (from Firestore aggregates or BigQuery export)  
3. Background job success/fail last 24h  
4. Refund and payout pending counts  

## On-call first response

1. Check `/ready` and Cloud Run / host status  
2. Check recent deploys (rollback if regression)  
3. Check provider status pages (PSP, courier, Firebase)  
4. Open incident channel; follow `incident-response.md`  
