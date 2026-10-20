# Notification provider diligence (email / SMS)

Phase 6 introduces provider-neutral `EmailProvider` / `SmsProvider` ports.

| Adapter | Status |
|---------|--------|
| `mock` | Implemented — structured console log (local/CI; production needs `ALLOW_MOCK_*`) |
| `unconfigured` | Explicit 501 |
| `sendgrid` / `ses` / `resend` | Scaffold only — needs diligence + API key + HTTP mapping |
| `twilio` / `clickatell` | Scaffold only — needs diligence + API key + HTTP mapping |

## Before enabling a live adapter

1. POPIA / operator agreement with the vendor  
2. SA-friendly deliverability (SPF/DKIM/DMARC for email)  
3. Opt-out / marketing vs transactional separation  
4. Secret Manager for API keys — never in client  
5. Failure isolation: notification job failures must not roll back payments  

Set `EMAIL_DILIGENCE_SIGNED=true` / `SMS_DILIGENCE_SIGNED=true` only after counsel/ops sign-off.
