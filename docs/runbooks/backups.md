# Runbook — Backups & restore

## What to protect

| Asset | Mechanism | RPO target | RTO target |
|-------|-----------|------------|------------|
| Firestore | Scheduled export to GCS (daily) + PITR if enabled | ≤ 24h (≤ 1h with PITR) | ≤ 4h |
| Cloud Storage (product images) | Versioning + GCS backup bucket sync | ≤ 24h | ≤ 8h |
| Secrets | Secret Manager versions (no local copies) | N/A | ≤ 1h rotate |
| Repo / CI | Git remote | N/A | ≤ 1h |

## Daily export (Firebase)

```bash
# Example — schedule via Cloud Scheduler → Cloud Functions or gcloud
gcloud firestore export gs://YOUR_BACKUP_BUCKET/firestore/$(date -u +%Y%m%d) \
  --project=YOUR_PROJECT
```

Retain ≥ 30 daily exports; keep one monthly for 12 months.

## Restore drill (staging only)

1. Create empty staging project or isolated DB  
2. Import latest export  
3. Point staging API at restored data  
4. Verify: sellers, products, one paid order, ledger rows  
5. Record duration and gaps in incident log  

**Never** restore production on top of live without an approved change window and freeze on writes.

## Before pilot

- [ ] Backup bucket exists with lifecycle policy  
- [ ] First successful export verified  
- [ ] Restore drill completed once  
- [ ] Access to backup bucket limited to ops + break-glass SA  
