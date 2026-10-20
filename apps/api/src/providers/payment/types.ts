export type ProviderPaymentStatus = 'pending' | 'succeeded' | 'failed' | 'cancelled';
export type ProviderRefundStatus = 'pending' | 'succeeded' | 'failed';
export type ProviderPayoutStatus = 'pending' | 'paid' | 'failed' | 'cancelled';

export interface InitialiseCheckoutInput {
  paymentId: string;
  orderId: string;
  amountCents: number;
  currency: 'ZAR';
  customerEmail: string;
  returnUrl: string;
  cancelUrl: string;
}

export interface InitialiseCheckoutResult {
  providerRef: string;
  checkoutUrl: string;
}

export interface VerifyTransactionResult {
  providerRef: string;
  status: ProviderPaymentStatus;
  amountCents: number;
  currency: 'ZAR';
}

export interface ValidatedWebhookEvent {
  providerRef: string;
  status: ProviderPaymentStatus;
  amountCents: number;
  currency: 'ZAR';
  eventId: string;
  rawType: string;
  /** Discriminator for refund/payout webhooks when present */
  kind?: 'payment' | 'refund' | 'payout';
  relatedRef?: string;
}

export interface CreateRefundInput {
  paymentProviderRef: string;
  refundId: string;
  amountCents: number;
  currency: 'ZAR';
  reason: string;
}

export interface CreateRefundResult {
  providerRefundRef: string;
  status: ProviderRefundStatus;
}

export interface CreatePayoutRecipientInput {
  sellerId: string;
  displayName: string;
  /** Opaque bank/token reference — never log full account numbers */
  destinationToken: string;
}

export interface InitiatePayoutInput {
  payoutId: string;
  sellerId: string;
  amountCents: number;
  currency: 'ZAR';
  recipientRef?: string;
}

export interface InitiatePayoutResult {
  providerPayoutRef: string;
  status: ProviderPayoutStatus;
}

export interface SettlementRecord {
  providerSettlementId: string;
  amountCents: number;
  currency: 'ZAR';
  settledAt: string;
  metadata?: Record<string, unknown>;
}

/**
 * Provider-neutral marketplace payment port.
 * Production adapters must pass SA marketplace diligence before enablement.
 */
export interface PaymentProvider {
  readonly name: string;
  readonly supportsMarketplacePayouts: boolean;

  initialiseCheckout(input: InitialiseCheckoutInput): Promise<InitialiseCheckoutResult>;
  verifyTransaction(providerRef: string): Promise<VerifyTransactionResult>;
  validateWebhook(
    headers: Record<string, string | string[] | undefined>,
    body: unknown,
  ): Promise<ValidatedWebhookEvent>;

  createRefund(input: CreateRefundInput): Promise<CreateRefundResult>;
  getRefundStatus(providerRefundRef: string): Promise<CreateRefundResult>;

  getSettlementRecords(fromIso: string, toIso: string): Promise<SettlementRecord[]>;

  createPayoutRecipient?(input: CreatePayoutRecipientInput): Promise<{ recipientRef: string }>;
  initiatePayout?(input: InitiatePayoutInput): Promise<InitiatePayoutResult>;
  getPayoutStatus?(providerPayoutRef: string): Promise<InitiatePayoutResult>;
}
