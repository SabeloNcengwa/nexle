# Load testing

## Scope

Phase 5 ships a **baseline harness** for public probes (`/health`, `/ready`). It does **not** claim production capacity for checkout, payments, or Firestore write paths.

Authenticated checkout load requires a dedicated staging project, test accounts, and an approved test plan — run that separately and record results here.

## Local / staging probe baseline

```bash
# Terminal 1 — API listening
npm run dev:api

# Terminal 2
npm run load:baseline
# or
BASE_URL=http://127.0.0.1:8080 CONCURRENCY=20 DURATION_MS=15000 npm run load:baseline
```

Exit code `0` only if all requests succeed.

## Suggested staging scenarios (manual checklist)

| Scenario | Goal | Notes |
|----------|------|-------|
| Probe soak | `/ready` stable 30 min | Harness above |
| Catalogue browse | Read-heavy search | Auth optional |
| Cart + checkout | Write contention | Staging only; mock pay |
| Webhook burst | Idempotent payment/courier events | Replay signed fixtures |
| Job fan-out | Notification + expiry jobs | Secured with `JOBS_SECRET` |

## Recording results

| Date | Env | Scenario | Concurrency | Duration | p95 ms | Errors | Notes |
|------|-----|----------|-------------|----------|--------|--------|-------|
| 2026-10-20 | local API | probe `/health`+`/ready` | 10 | 5s | 5.78 | 0 | ~4.2k rps; probes exempt from in-memory rate limit |

Do not mark production SLO met until staging soak + review.
