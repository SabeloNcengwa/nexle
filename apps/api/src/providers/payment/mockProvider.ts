import { createHmac, randomUUID } from 'node:crypto';
import { AppError } from '../../lib/errors.js';
import { safeEqualString } from '../../lib/moneySecurity.js';
import type {
  CreateRefundInput,
  CreateRefundResult,
  InitialiseCheckoutInput,
  InitialiseCheckoutResult,
  InitiatePayoutInput,
  InitiatePayoutResult,
  PaymentProvider,
  SettlementRecord,
  ValidatedWebhookEvent,
  VerifyTransactionResult,
} from './types.js';

interface MockTxn {
  paymentId: string;
  orderId: string;
  amountCents: number;
  currency: 'ZAR';
  status: 'pending' | 'succeeded' | 'failed' | 'cancelled';
  refundedCents: number;
}

interface MockRefund {
  paymentProviderRef: string;
  refundId: string;
  amountCents: number;
  currency: 'ZAR';
  status: 'pending' | 'succeeded' | 'failed';
}

interface MockPayout {
  payoutId: string;
  sellerId: string;
  amountCents: number;
  currency: 'ZAR';
  status: 'pending' | 'paid' | 'failed' | 'cancelled';
}

const txns = new Map<string, MockTxn>();
const refunds = new Map<string, MockRefund>();
const payouts = new Map<string, MockPayout>();

export const MOCK_WEBHOOK_SECRET = 'mock-webhook-secret';

function assertMockAllowed(): void {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_MOCK_PAYMENTS !== 'true') {
    throw new AppError(
      'MOCK_PROVIDER_FORBIDDEN',
      'Mock payment provider cannot operate with live production money',
      500,
    );
  }
}

export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';
  readonly supportsMarketplacePayouts = true;

  constructor(private readonly publicBaseUrl: string) {}

  async initialiseCheckout(input: InitialiseCheckoutInput): Promise<InitialiseCheckoutResult> {
    assertMockAllowed();
    const providerRef = `mock_${randomUUID()}`;
    txns.set(providerRef, {
      paymentId: input.paymentId,
      orderId: input.orderId,
      amountCents: input.amountCents,
      currency: input.currency,
      status: 'pending',
      refundedCents: 0,
    });

    const checkoutUrl = new URL('/mock-pay', this.publicBaseUrl);
    checkoutUrl.searchParams.set('providerRef', providerRef);
    checkoutUrl.searchParams.set('returnUrl', input.returnUrl);
    checkoutUrl.searchParams.set('cancelUrl', input.cancelUrl);
    checkoutUrl.searchParams.set('amountCents', String(input.amountCents));

    return { providerRef, checkoutUrl: checkoutUrl.toString() };
  }

  async verifyTransaction(providerRef: string): Promise<VerifyTransactionResult> {
    const txn = txns.get(providerRef);
    if (!txn) throw new AppError('PAYMENT_NOT_FOUND', 'Unknown mock provider reference', 404);
    return {
      providerRef,
      status: txn.status,
      amountCents: txn.amountCents,
      currency: txn.currency,
    };
  }

  async validateWebhook(
    headers: Record<string, string | string[] | undefined>,
    body: unknown,
  ): Promise<ValidatedWebhookEvent> {
    const payload = body as {
      providerRef?: string;
      status?: string;
      amountCents?: number;
      currency?: string;
      eventId?: string;
      kind?: string;
      relatedRef?: string;
    };

    const signatureHeader = headers['x-mock-signature'];
    const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
    const expected = createHmac('sha256', MOCK_WEBHOOK_SECRET)
      .update(JSON.stringify(body))
      .digest('hex');

    if (!signature || !safeEqualString(signature, expected)) {
      throw new AppError('INVALID_WEBHOOK_SIGNATURE', 'Mock webhook signature invalid', 401);
    }

    if (
      !payload.providerRef ||
      !payload.status ||
      typeof payload.amountCents !== 'number' ||
      payload.currency !== 'ZAR' ||
      !payload.eventId
    ) {
      throw new AppError('INVALID_WEBHOOK_PAYLOAD', 'Malformed mock webhook', 400);
    }

    const kind = (payload.kind as ValidatedWebhookEvent['kind']) ?? 'payment';

    if (kind === 'payment') {
      const txn = txns.get(payload.providerRef);
      if (!txn) throw new AppError('PAYMENT_NOT_FOUND', 'Unknown mock provider reference', 404);
      if (payload.amountCents !== txn.amountCents || payload.currency !== txn.currency) {
        throw new AppError('AMOUNT_MISMATCH', 'Webhook amount/currency mismatch', 400);
      }
      if (payload.status === 'succeeded' || payload.status === 'failed' || payload.status === 'cancelled') {
        txn.status = payload.status;
      }
    }

    if (kind === 'refund') {
      const refund = refunds.get(payload.providerRef);
      if (!refund) throw new AppError('REFUND_NOT_FOUND', 'Unknown mock refund reference', 404);
      if (payload.amountCents !== refund.amountCents) {
        throw new AppError('AMOUNT_MISMATCH', 'Refund webhook amount mismatch', 400);
      }
      if (payload.status === 'succeeded' || payload.status === 'failed') {
        refund.status = payload.status;
      }
    }

    if (kind === 'payout') {
      const payout = payouts.get(payload.providerRef);
      if (!payout) throw new AppError('PAYOUT_NOT_FOUND', 'Unknown mock payout reference', 404);
      if (payload.amountCents !== payout.amountCents) {
        throw new AppError('AMOUNT_MISMATCH', 'Payout webhook amount mismatch', 400);
      }
      if (payload.status === 'paid' || payload.status === 'failed' || payload.status === 'cancelled') {
        payout.status = payload.status === 'paid' ? 'paid' : payload.status;
      }
    }

    return {
      providerRef: payload.providerRef,
      status: payload.status as ValidatedWebhookEvent['status'],
      amountCents: payload.amountCents,
      currency: 'ZAR',
      eventId: payload.eventId,
      rawType: `mock.${kind}.${payload.status}`,
      kind,
      relatedRef: payload.relatedRef,
    };
  }

  async createRefund(input: CreateRefundInput): Promise<CreateRefundResult> {
    assertMockAllowed();
    const txn = txns.get(input.paymentProviderRef);
    if (!txn) throw new AppError('PAYMENT_NOT_FOUND', 'Unknown payment for refund', 404);
    if (txn.status !== 'succeeded') {
      throw new AppError('INVALID_STATE', 'Can only refund succeeded payments', 409);
    }
    if (txn.refundedCents + input.amountCents > txn.amountCents) {
      throw new AppError('REFUND_EXCEEDS_PAYMENT', 'Refund exceeds captured amount', 400);
    }

    const providerRefundRef = `mock_refund_${randomUUID()}`;
    // Mock accepts immediately as pending — confirmation is a separate status poll/webhook
    refunds.set(providerRefundRef, {
      paymentProviderRef: input.paymentProviderRef,
      refundId: input.refundId,
      amountCents: input.amountCents,
      currency: input.currency,
      status: 'pending',
    });
    return { providerRefundRef, status: 'pending' };
  }

  async getRefundStatus(providerRefundRef: string): Promise<CreateRefundResult> {
    const refund = refunds.get(providerRefundRef);
    if (!refund) throw new AppError('REFUND_NOT_FOUND', 'Unknown mock refund', 404);
    return { providerRefundRef, status: refund.status };
  }

  async getSettlementRecords(fromIso: string, _toIso: string): Promise<SettlementRecord[]> {
    return [
      {
        providerSettlementId: `mock_settle_${fromIso.slice(0, 10)}`,
        amountCents: 0,
        currency: 'ZAR',
        settledAt: fromIso,
        metadata: { note: 'Mock settlements are empty placeholders' },
      },
    ];
  }

  async createPayoutRecipient(input: {
    sellerId: string;
    displayName: string;
    destinationToken: string;
  }): Promise<{ recipientRef: string }> {
    assertMockAllowed();
    return { recipientRef: `mock_recipient_${input.sellerId}` };
  }

  async initiatePayout(input: InitiatePayoutInput): Promise<InitiatePayoutResult> {
    assertMockAllowed();
    const providerPayoutRef = `mock_payout_${randomUUID()}`;
    payouts.set(providerPayoutRef, {
      payoutId: input.payoutId,
      sellerId: input.sellerId,
      amountCents: input.amountCents,
      currency: input.currency,
      status: 'pending',
    });
    return { providerPayoutRef, status: 'pending' };
  }

  async getPayoutStatus(providerPayoutRef: string): Promise<InitiatePayoutResult> {
    const payout = payouts.get(providerPayoutRef);
    if (!payout) throw new AppError('PAYOUT_NOT_FOUND', 'Unknown mock payout', 404);
    return { providerPayoutRef, status: payout.status };
  }

  /** Test/dev: confirm a pending refund without fabricating success on create. */
  static confirmRefundForTests(providerRefundRef: string, status: 'succeeded' | 'failed'): void {
    const refund = refunds.get(providerRefundRef);
    if (!refund) throw new Error('refund missing');
    refund.status = status;
    if (status === 'succeeded') {
      const txn = txns.get(refund.paymentProviderRef);
      if (txn) txn.refundedCents += refund.amountCents;
    }
  }

  static confirmPayoutForTests(providerPayoutRef: string, status: 'paid' | 'failed'): void {
    const payout = payouts.get(providerPayoutRef);
    if (!payout) throw new Error('payout missing');
    payout.status = status;
  }

  static setStatusForTests(
    providerRef: string,
    status: 'pending' | 'succeeded' | 'failed' | 'cancelled',
  ): void {
    const txn = txns.get(providerRef);
    if (txn) txn.status = status;
  }

  static clearForTests(): void {
    txns.clear();
    refunds.clear();
    payouts.clear();
  }

  static signWebhookBody(body: unknown): string {
    return createHmac('sha256', MOCK_WEBHOOK_SECRET).update(JSON.stringify(body)).digest('hex');
  }
}

/** Placeholder until diligence selects a real SA marketplace-capable provider. */
export class UnconfiguredProductionProvider implements PaymentProvider {
  readonly name = 'unconfigured';
  readonly supportsMarketplacePayouts = false;

  private fail(): never {
    throw new AppError(
      'PROVIDER_NOT_CONFIGURED',
      'No production payment provider selected. Complete docs/payment-provider-diligence.md first.',
      501,
    );
  }

  initialiseCheckout(): Promise<InitialiseCheckoutResult> {
    this.fail();
  }
  verifyTransaction(): Promise<VerifyTransactionResult> {
    this.fail();
  }
  validateWebhook(): Promise<ValidatedWebhookEvent> {
    this.fail();
  }
  createRefund(): Promise<CreateRefundResult> {
    this.fail();
  }
  getRefundStatus(): Promise<CreateRefundResult> {
    this.fail();
  }
  getSettlementRecords(): Promise<SettlementRecord[]> {
    this.fail();
  }
}

