import { mockPaymentCompleteSchema } from '@mavundla/shared';
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/asyncHandler.js';
import { AppError } from '../lib/errors.js';
import { MockPaymentProvider, getPaymentProvider } from '../providers/payment/index.js';
import * as checkout from '../services/checkout.js';

export const paymentsRouter = Router();

function assertMockAllowed(): void {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_MOCK_PAYMENTS !== 'true') {
    throw new AppError('MOCK_PROVIDER_FORBIDDEN', 'Mock payments disabled in production', 403);
  }
}

/** Hosted-checkout completion helper for the mock provider (dev/test only). */
paymentsRouter.post(
  '/mock/complete',
  asyncHandler(async (req, res) => {
    assertMockAllowed();
    const input = mockPaymentCompleteSchema.parse(req.body);
    const provider = getPaymentProvider(
      (req.app.get('webBaseUrl') as string) || 'http://localhost:5173',
    );
    const verified = await provider.verifyTransaction(input.providerRef);

    const body = {
      providerRef: input.providerRef,
      status: input.outcome,
      amountCents: verified.amountCents,
      currency: 'ZAR' as const,
      eventId: randomUUID(),
      kind: 'payment',
    };
    const signature = MockPaymentProvider.signWebhookBody(body);
    const event = await provider.validateWebhook({ 'x-mock-signature': signature }, body);
    const data = await checkout.processVerifiedPaymentOutcome({
      providerRef: event.providerRef,
      status: event.status === 'pending' ? 'pending' : event.status,
      amountCents: event.amountCents,
      currency: event.currency,
      eventId: event.eventId,
    });
    res.json({ data });
  }),
);

paymentsRouter.post(
  '/mock/webhook',
  asyncHandler(async (req, res) => {
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
    });
    res.status(200).json({ data: { received: true, duplicate: data.duplicate } });
  }),
);

/** Dev helper: move mock refund from pending → succeeded/failed without claiming create = complete. */
paymentsRouter.post(
  '/mock/refunds/confirm',
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
