import { beforeEach, describe, expect, it } from 'vitest';
import { MockPaymentProvider } from './mockProvider.js';

describe('MockPaymentProvider', () => {
  const provider = new MockPaymentProvider('http://localhost:5173');

  beforeEach(() => {
    MockPaymentProvider.clearForTests();
  });

  it('initialises checkout and verifies pending txn', async () => {
    const init = await provider.initialiseCheckout({
      paymentId: 'pay1',
      orderId: 'ord1',
      amountCents: 12500,
      currency: 'ZAR',
      customerEmail: 'a@b.com',
      returnUrl: 'http://localhost:5173/orders/ord1',
      cancelUrl: 'http://localhost:5173/checkout',
    });
    expect(init.providerRef.startsWith('mock_')).toBe(true);
    expect(init.checkoutUrl).toContain('providerRef=');

    const verified = await provider.verifyTransaction(init.providerRef);
    expect(verified.status).toBe('pending');
    expect(verified.amountCents).toBe(12500);
  });

  it('rejects webhook with bad signature or amount mismatch', async () => {
    const init = await provider.initialiseCheckout({
      paymentId: 'pay1',
      orderId: 'ord1',
      amountCents: 1000,
      currency: 'ZAR',
      customerEmail: 'a@b.com',
      returnUrl: 'http://localhost:5173/x',
      cancelUrl: 'http://localhost:5173/y',
    });

    await expect(
      provider.validateWebhook(
        { 'x-mock-signature': 'nope' },
        {
          providerRef: init.providerRef,
          status: 'succeeded',
          amountCents: 1000,
          currency: 'ZAR',
          eventId: 'e1',
        },
      ),
    ).rejects.toThrow(/signature/i);

    const badAmount = {
      providerRef: init.providerRef,
      status: 'succeeded',
      amountCents: 999,
      currency: 'ZAR',
      eventId: 'e2',
    };
    await expect(
      provider.validateWebhook(
        { 'x-mock-signature': MockPaymentProvider.signWebhookBody(badAmount) },
        badAmount,
      ),
    ).rejects.toThrow(/mismatch/i);
  });

  it('accepts signed webhook and updates status', async () => {
    const init = await provider.initialiseCheckout({
      paymentId: 'pay1',
      orderId: 'ord1',
      amountCents: 1000,
      currency: 'ZAR',
      customerEmail: 'a@b.com',
      returnUrl: 'http://localhost:5173/x',
      cancelUrl: 'http://localhost:5173/y',
    });
    const body = {
      providerRef: init.providerRef,
      status: 'succeeded',
      amountCents: 1000,
      currency: 'ZAR',
      eventId: 'e3',
    };
    const event = await provider.validateWebhook(
      { 'x-mock-signature': MockPaymentProvider.signWebhookBody(body) },
      body,
    );
    expect(event.status).toBe('succeeded');
    const verified = await provider.verifyTransaction(init.providerRef);
    expect(verified.status).toBe('succeeded');
  });

  it('creates refunds as pending and confirms separately', async () => {
    const init = await provider.initialiseCheckout({
      paymentId: 'pay1',
      orderId: 'ord1',
      amountCents: 5000,
      currency: 'ZAR',
      customerEmail: 'a@b.com',
      returnUrl: 'http://localhost:5173/x',
      cancelUrl: 'http://localhost:5173/y',
    });
    MockPaymentProvider.setStatusForTests(init.providerRef, 'succeeded');

    const refund = await provider.createRefund({
      paymentProviderRef: init.providerRef,
      refundId: 'r1',
      amountCents: 1000,
      currency: 'ZAR',
      reason: 'defective',
    });
    expect(refund.status).toBe('pending');

    let status = await provider.getRefundStatus(refund.providerRefundRef);
    expect(status.status).toBe('pending');

    MockPaymentProvider.confirmRefundForTests(refund.providerRefundRef, 'succeeded');
    status = await provider.getRefundStatus(refund.providerRefundRef);
    expect(status.status).toBe('succeeded');
  });

  it('initiates payouts as pending until confirmed', async () => {
    const payout = await provider.initiatePayout!({
      payoutId: 'po1',
      sellerId: 's1',
      amountCents: 2000,
      currency: 'ZAR',
    });
    expect(payout.status).toBe('pending');
    MockPaymentProvider.confirmPayoutForTests(payout.providerPayoutRef, 'paid');
    const status = await provider.getPayoutStatus!(payout.providerPayoutRef);
    expect(status.status).toBe('paid');
  });
});
