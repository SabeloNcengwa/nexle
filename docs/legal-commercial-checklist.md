# Legal & commercial readiness checklist

**Owner:** Counsel + commercial lead  
**Engineering role:** Implement product behaviour; do not ship public pilot until counsel marks blockers cleared.

Items below are **not** legal advice. Status is unchecked until counsel completes review.

## Consumer & marketplace

- [ ] Terms of use (buyers) reviewed  
- [ ] Seller agreement (commission, payouts, returns liability) reviewed  
- [ ] Returns / refunds policy matches product behaviour  
- [ ] Prohibited goods / restricted categories policy  
- [ ] Dispute escalation path (platform vs seller) documented  

## Privacy (POPIA)

- [ ] Privacy policy published  
- [ ] Processing grounds and retention schedule defined  
- [ ] Operator agreements with Firebase / PSP / courier / email vendors  
- [ ] Data subject request process (access / deletion)  
- [ ] Breach notification process aligned with incident runbook  

## Payments & tax

- [ ] PSP contract + PCI scope confirmed (platform never stores PAN)  
- [ ] VAT / tax treatment for commissions and seller sales confirmed with tax adviser  
- [ ] Invoicing / credit note requirements for refunds  

## Brand & marketing

- [ ] Public marketing claims match pilot scope (no “nationwide same-day” etc. unless true)  
- [ ] Trademark / trade name clearance for Mavundla Marketplace  

## Engineering blockers tied to legal

| Blocker | Until cleared |
|---------|----------------|
| Live PSP credentials | Diligence + contract |
| Live courier | Diligence + contract |
| Public signup without allowlist | Pilot exit criteria |
| Deleting user data automatically | Retention policy signed |
