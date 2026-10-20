# Runbook — Deploy rollback

## Prefer

1. **Traffic rollback** — previous Cloud Run / container revision (fastest)  
2. **Config rollback** — env vars / secrets only if code is fine  
3. **Forward fix** — only for data migrations that cannot reverse cleanly  

## Cloud Run example

```bash
# List revisions
gcloud run revisions list --service=mavundla-api --region=REGION

# Route 100% to previous revision
gcloud run services update-traffic mavundla-api \
  --to-revisions=PREVIOUS_REVISION=100 \
  --region=REGION
```

## Web (Firebase Hosting / static)

Redeploy previous CI artifact or `git checkout <sha> && npm run build -w @mavundla/web` then hosting deploy.

## Database

Firestore has no automatic schema rollback. Migrations must be additive and reversible by **new** documents/fields, not destructive deletes during pilot.

If a bad write batch is known:

1. Freeze writes (maintenance flag / take API to 503 via `/ready`)  
2. Export current state  
3. Compensating writes under change control  

## Checklist after rollback

- [ ] `/ready` returns 200  
- [ ] Login + catalogue browse  
- [ ] Create cart → checkout (sandbox/mock)  
- [ ] Job endpoints reject without secret  
- [ ] No spike in 5xx  
