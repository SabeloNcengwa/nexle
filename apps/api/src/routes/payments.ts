import { mockPaymentCompleteSchema } from '@mavundla/shared';
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/asyncHandler.js';
import { AppError } from '../lib/errors.js';
import { getRuntimeEnv } from '../config/runtime.js';
import { requireAuth } from '../middleware/auth.js';
import { requireWebhookIpAllowlist } from '../middleware/networkSecurity.js';
import { moneyRateLimit } from '../middleware/rateLimit.js';
import { MockPaymentProvider, getPaymentProvider } from '../providers/payment/index.js';
import { db } from '../config/firebase.js';
import * as checkout from '../services/checkout.js';

export const paymentsRouter = Router();

function assertMockAllowed(): void {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_MOCK_PAYMENTS !== 'true') {
    throw new AppError('MOCK_PROVIDER_FORBIDDEN', 'Mock payments disabled in production', 403);
  }
  // Refuse mock money paths when a non-mock provider is configured.
  const provider = process.env.PAYMENT_PROVIDER ?? 'mock';
  if (provider !== 'mock') {
    throw new AppError('MOCK_PROVIDER_FORBIDDEN', 'Mock payment routes disabled for this provider', 403);
  }
}

/**
 * Fast confirm: verify with provider then apply outcome (races webhook).
 * Used by the order return URL so sellers can fulfil without waiting on webhooks.
 * Auth + order ownership enforced in service; rate-limited for abuse.
 */
paymentsRouter.post(
  '/confirm',
  requireAuth,
  moneyRateLimit,
  asyncHandler(async (req, res) => {
    const webBaseUrl = (req.app.get('webBaseUrl') as string) || 'http://localhost:5173';
    const data = await checkout.confirmPaymentForOrder(req.actor, req.body, webBaseUrl);
    res.json({ data });
  }),
);

/**
 * Hosted-checkout completion for the mock provider (dev/test only).
 * Requires auth and order ownership so a leaked providerRef cannot capture payment.
 */
paymentsRouter.post(
  '/mock/complete',
  requireAuth,
  moneyRateLimit,
  asyncHandler(async (req, res) => {
    assertMockAllowed();
    const input = mockPaymentCompleteSchema.parse(req.body);
    const provider = getPaymentProvider(
      (req.app.get('webBaseUrl') as string) || 'http://localhost:5173',
    );
    const verified = await provider.verifyTransaction(input.providerRef);

    const paySnap = await db()
      .collection('payments')
      .where('providerRef', '==', input.providerRef)
      .limit(1)
      .get();
    if (paySnap.empty) {
      throw new AppError('PAYMENT_NOT_FOUND', 'No payment for provider reference', 404);
    }
    const payment = paySnap.docs[0]!.data();
    const orderSnap = await db().collection('orders').doc(String(payment.orderId)).get();
    if (!orderSnap.exists) {
      throw new AppError('NOT_FOUND', 'Order not found', 404);
    }
    if (orderSnap.data()!.customerUid !== req.actor!.uid) {
      throw new AppError('FORBIDDEN', 'Not your payment session', 403);
    }

    const body = {
      providerRef: input.providerRef,
      status: input.outcome,
      amountCents: verified.amountCents,
      currency: 'ZAR' as const,
      eventId: randomUUID(),
      kind: 'payment',
    };
    const signature = MockPaymentProvider.signWebhookBody(body);
    // Updates in-memory mock txn status (like a provider webhook)
    const event = await provider.validateWebhook({ 'x-mock-signature': signature }, body);
    const data = await checkout.processVerifiedPaymentOutcome({
      providerRef: event.providerRef,
      status: event.status === 'pending' ? 'pending' : event.status,
      amountCents: event.amountCents,
      currency: event.currency,
      eventId: event.eventId,
      actorUid: req.actor!.uid,
      source: 'mock_complete',
    });
    res.json({ data });
  }),
);

paymentsRouter.post(
  '/mock/webhook',
  moneyRateLimit,
  (req, res, next) => requireWebhookIpAllowlist(getRuntimeEnv())(req, res, next),
  asyncHandler(async (req, res) => {
    assertMockAllowed();
    const provider = getPaymentProvider(
      (req.app.get('webBaseUrl') as string) || 'http://localhost:5173',
    );
    const event = await provider.validateWebhook(req.headers as Record<string, string>, req.body);
    if (event.kind && event.kind !== 'payment') {
      res.status(200).json({
        data: {
          received: true,
          note: 'Refund/payout webhooks acknowledged; reconcile via finance endpoints',
        },
      });
      return;
    }
    const data = await checkout.processVerifiedPaymentOutcome({
      providerRef: event.providerRef,
      status: event.status === 'pending' ? 'pending' : event.status,
      amountCents: event.amountCents,
      currency: event.currency,
      eventId: event.eventId,
      source: 'webhook',
    });
    // Acknowledge quickly — fulfilment already applied inside processVerifiedPaymentOutcome
    res.status(200).json({ data: { received: true, duplicate: data.duplicate } });
  }),
);

/** Dev helper: move mock refund from pending → succeeded/failed without claiming create = complete. */
paymentsRouter.post(
  '/mock/refunds/confirm',
  requireAuth,
  moneyRateLimit,
  asyncHandler(async (req, res) => {
    assertMockAllowed();
    const input = z
      .object({
        providerRefundRef: z.string().min(1),
        status: z.enum(['succeeded', 'failed']),
      })
      .parse(req.body);
    MockPaymentProvider.confirmRefundForTests(input.providerRefundRef, input.status);
    res.json({ data: { confirmed: true, ...input } });
  }),
);

paymentsRouter.post(
  '/mock/payouts/confirm',
  requireAuth,
  moneyRateLimit,
  asyncHandler(async (req, res) => {
    assertMockAllowed();
    const input = z
      .object({
        providerPayoutRef: z.string().min(1),
        status: z.enum(['paid', 'failed']),
      })
      .parse(req.body);
    MockPaymentProvider.confirmPayoutForTests(input.providerPayoutRef, input.status);
    res.json({ data: { confirmed: true, ...input } });
  }),
);
