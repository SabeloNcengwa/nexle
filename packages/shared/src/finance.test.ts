import { describe, expect, it } from 'vitest';
import {
  assessPayoutEligibility,
  assessRefundEligibility,
  canTransitionPayout,
  canTransitionRefund,
  eligibilityReleaseEntries,
  sumLedgerEntries,
} from './finance.js';

describe('finance helpers', () => {
  it('sums ledger buckets with credits and debits', () => {
    const balances = sumLedgerEntries([
      { type: 'seller_sale_proceeds', amountCents: 900, sign: 1, bucket: 'pending' },
      ...eligibilityReleaseEntries(900),
      { type: 'payout', amountCents: 500, sign: -1, bucket: 'eligible' },
      { type: 'payout', amountCents: 500, sign: 1, bucket: 'paid' },
    ]);
    expect(balances.pending).toBe(0);
    expect(balances.eligible).toBe(400);
    expect(balances.paid).toBe(500);
  });

  it('assesses refund eligibility against window and quantity', () => {
    const paidAt = '2026-10-01T00:00:00.000Z';
    expect(
      assessRefundEligibility({
        orderStatus: 'paid',
        paidAtIso: paidAt,
        nowIso: '2026-10-10T00:00:00.000Z',
        returnWindowDays: 14,
        lineQuantityOrdered: 2,
        lineQuantityAlreadyRefunded: 0,
        requestQuantity: 1,
      }).eligible,
    ).toBe(true);

    expect(
      assessRefundEligibility({
        orderStatus: 'paid',
        paidAtIso: paidAt,
        nowIso: '2026-10-20T00:00:00.000Z',
        returnWindowDays: 14,
        lineQuantityOrdered: 2,
        lineQuantityAlreadyRefunded: 0,
        requestQuantity: 1,
      }).eligible,
    ).toBe(false);

    expect(
      assessRefundEligibility({
        orderStatus: 'paid',
        paidAtIso: paidAt,
        nowIso: '2026-10-05T00:00:00.000Z',
        returnWindowDays: 14,
        lineQuantityOrdered: 2,
        lineQuantityAlreadyRefunded: 2,
        requestQuantity: 1,
      }).reason,
    ).toMatch(/exceeds/i);
  });

  it('assesses payout eligibility', () => {
    expect(
      assessPayoutEligibility({
        eligibleCents: 10_000,
        requestedCents: 5_000,
        sellerStatus: 'active',
        paymentOnboardingComplete: true,
        minPayoutCents: 1000,
      }).eligible,
    ).toBe(true);

    expect(
      assessPayoutEligibility({
        eligibleCents: 500,
        requestedCents: 5_000,
        sellerStatus: 'active',
        paymentOnboardingComplete: true,
        minPayoutCents: 1000,
      }).eligible,
    ).toBe(false);
  });

  it('enforces payout and refund state machines', () => {
    expect(canTransitionPayout('eligible', 'processing')).toBe(true);
    expect(canTransitionPayout('paid', 'processing')).toBe(false);
    expect(canTransitionRefund('approved', 'provider_pending')).toBe(true);
    expect(canTransitionRefund('succeeded', 'failed')).toBe(false);
  });
});
