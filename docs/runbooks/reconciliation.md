# Runbook — Financial reconciliation

## Daily (finance ops)

1. Export overnight `sellerLedger` entries for the settlement date  
2. Match `payment_captured` / `payment_refunded` to PSP settlement report  
3. Match `payout_*` rows to bank / PSP payout file  
4. Flag orphans: ledger without provider ref, or provider without ledger  

## Queries (concept)

- Sum of `payment_captured` for day D vs PSP captured total  
- Open `refunds` in `pending` / `provider_pending` older than 24h  
- Open `payouts` not `paid` older than SLA  
- Orders `paid` with no shipment after N hours (ops + seller chase)  

## Discrepancy handling

| Case | Action |
|------|--------|
| PSP paid, no ledger | Investigate webhook / idempotency; append missing entry after dual control |
| Ledger paid, PSP missing | Check sandbox vs live; reverse or hold payout |
| Partial refund mismatch | Block seller payout for that order until resolved |
| Courier COD / collect fees | Track separately; do not mix into product commission until policy signed |

## Controls

- Dual approval for manual ledger compensation (`super_admin` + finance)  
- Never delete ledger documents  
- Store reconciliation spreadsheet / ticket ID on compensating entry metadata  
