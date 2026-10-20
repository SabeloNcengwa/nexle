# Courier provider diligence

Phase 4 ships a **provider-neutral** `CourierProvider` with a **mock** adapter for local/CI use.

A production courier must not be enabled until credentials and current documentation confirm:

1. South African pickup/delivery coverage  
2. Rate shopping APIs with explicit expiry  
3. Label generation and tracking numbers  
4. Webhooks with signature verification  
5. Cancellation and exception handling  
6. Return shipment support (or documented manual fallback)  

## Platform policy

- Never fabricate a courier price, booking confirmation, or tracking event  
- Distinguish **estimates** (`estimateOnly: true`) from **confirmed bookings**  
- Store courier webhook events idempotently before applying status changes  
- Manual tracking is an explicit fallback for support/sellers when webhooks fail  

| Adapter | Status |
|---------|--------|
| `mock` | Implemented |
| `unconfigured` | Explicit 501 |
| `the_courier_guy` | Scaffold — requires `COURIER_DILIGENCE_SIGNED` + `COURIER_PROVIDER_API_KEY`; live HTTP pending |
| `bob_go` | Scaffold — same gates; live HTTP pending |

Candidate names do **not** imply commercial selection.
