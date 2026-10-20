# Payment provider diligence (South Africa marketplace)

Phase 3 keeps a **provider-neutral** interface. The running default is the **mock** adapter for local development and automated tests.

A production provider must **not** be enabled merely because it supports ordinary ecommerce checkout or bank transfers.

## Checklist before selecting a production adapter

Confirm current commercial terms and technical docs for:

1. South African merchant / marketplace eligibility  
2. ZAR support  
3. Explicit marketplace / multi-seller (or subaccount) model  
4. Seller / submerchant onboarding (separate from platform KYC)  
5. Commission / split allocation capabilities (or clear settlement model)  
6. Settlement timing and payout control  
7. Refunds, chargebacks and reversals  
8. Reconciliation and reporting APIs  
9. Required compliance checks (FICA / POPIA / PCI — hosted or tokenized only)  

## Platform policy

- Secret keys only on the server / Secret Manager  
- Hosted checkout or tokenized collection — never store PAN/CVV  
- Browser redirect is **not** proof of payment  
- Verify via authenticated webhooks and/or server-to-server verification  
- Reject amount, currency, merchant, or reference mismatches  
- Store provider events idempotently before side effects  
- Never accept client requests that set `paymentStatus = paid`  
- Never create production payments through the mock provider  

## Current adapter status

| Adapter | Status |
|---------|--------|
| `mock` | Implemented — local/CI only |
| `unconfigured` | Explicit 501 |
| `paystack_marketplace` | Scaffold — requires `PAYMENT_DILIGENCE_SIGNED` + `PAYMENT_PROVIDER_API_KEY`; live HTTP mapping still pending |
| `ozow_marketplace` | Scaffold — same gates; live HTTP mapping still pending |

Ordinary bank transfers are **not** an acceptable workaround for unsupported marketplace allocation.

Candidate names do **not** imply commercial selection or certification.

This platform does **not** claim to hold escrow or safeguarded funds unless a separate legal arrangement says so.
