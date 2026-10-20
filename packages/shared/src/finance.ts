/** Finance domain helpers — integer cents only. */

export const LEDGER_ENTRY_TYPES = [
  'seller_sale_proceeds',
  'platform_commission',
  'payment_processing_fee',
  'delivery_charge',
  'refund',
  'chargeback',
  'payout',
  'reversal',
  'manual_adjustment',
  'eligibility_release',
] as const;

export type LedgerEntryType = (typeof LEDGER_ENTRY_TYPES)[number];

export const LEDGER_BUCKETS = ['pending', 'eligible', 'held', 'paid'] as const;
export type LedgerBucket = (typeof LEDGER_BUCKETS)[number];

export const REFUND_STATUSES = [
  'requested',
  'under_review',
  'approved',
  'rejected',
  'provider_pending',
  'succeeded',
  'failed',
  'cancelled',
] as const;

export type RefundStatus = (typeof REFUND_STATUSES)[number];

export const PAYOUT_STATUSES = [
  'pending_eligibility',
  'eligible',
  'processing',
  'paid',
  'on_hold',
  'failed',
  'reversed',
  'cancelled',
] as const;

export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];

export interface LedgerEntryInput {
  type: LedgerEntryType;
  amountCents: number;
  /** +1 credit to seller bucket, -1 debit from seller bucket */
  sign: 1 | -1;
  bucket: LedgerBucket;
}

export interface SellerBucketBalances {
  pending: number;
  eligible: number;
  held: number;
  paid: number;
}

export function emptyBalances(): SellerBucketBalances {
  return { pending: 0, eligible: 0, held: 0, paid: 0 };
}

export function applyLedgerEntry(
  balances: SellerBucketBalances,
  entry: LedgerEntryInput,
): SellerBucketBalances {
  if (!Number.isInteger(entry.amountCents) || entry.amountCents < 0) {
    throw new Error('amountCents must be a non-negative integer');
  }
  const next = { ...balances };
  next[entry.bucket] += entry.sign * entry.amountCents;
  return next;
}

export function sumLedgerEntries(entries: LedgerEntryInput[]): SellerBucketBalances {
  return entries.reduce(applyLedgerEntry, emptyBalances());
}

/** Move amount between buckets via paired conceptual entries (caller persists both). */
export function eligibilityReleaseEntries(amountCents: number): LedgerEntryInput[] {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new Error('amountCents must be a positive integer');
  }
  return [
    { type: 'eligibility_release', amountCents, sign: -1, bucket: 'pending' },
    { type: 'eligibility_release', amountCents, sign: 1, bucket: 'eligible' },
  ];
}

export interface RefundEligibilityInput {
  orderStatus: string;
  paidAtIso?: string;
  nowIso: string;
  returnWindowDays: number;
  lineQuantityOrdered: number;
  lineQuantityAlreadyRefunded: number;
  requestQuantity: number;
}

export function assessRefundEligibility(input: RefundEligibilityInput): {
  eligible: boolean;
  reason?: string;
} {
  if (input.orderStatus !== 'paid') {
    return { eligible: false, reason: 'Order is not paid' };
  }
  if (!input.paidAtIso) {
    return { eligible: false, reason: 'Missing paidAt timestamp' };
  }
  if (!Number.isInteger(input.requestQuantity) || input.requestQuantity < 1) {
    return { eligible: false, reason: 'Invalid refund quantity' };
  }
  const remaining = input.lineQuantityOrdered - input.lineQuantityAlreadyRefunded;
  if (input.requestQuantity > remaining) {
    return { eligible: false, reason: 'Quantity exceeds refundable amount' };
  }
  const paidAt = Date.parse(input.paidAtIso);
  const now = Date.parse(input.nowIso);
  if (Number.isNaN(paidAt) || Number.isNaN(now)) {
    return { eligible: false, reason: 'Invalid timestamps' };
  }
  const windowMs = input.returnWindowDays * 24 * 60 * 60 * 1000;
  if (now - paidAt > windowMs) {
    return { eligible: false, reason: 'Outside return window' };
  }
  return { eligible: true };
}

export interface PayoutEligibilityInput {
  eligibleCents: number;
  requestedCents: number;
  sellerStatus: 'active' | 'suspended';
  paymentOnboardingComplete: boolean;
  minPayoutCents: number;
}

export function assessPayoutEligibility(input: PayoutEligibilityInput): {
  eligible: boolean;
  reason?: string;
} {
  if (input.sellerStatus !== 'active') {
    return { eligible: false, reason: 'Seller is not active' };
  }
  if (!input.paymentOnboardingComplete) {
    return { eligible: false, reason: 'Payment provider seller onboarding incomplete' };
  }
  if (!Number.isInteger(input.requestedCents) || input.requestedCents <= 0) {
    return { eligible: false, reason: 'Invalid payout amount' };
  }
  if (input.requestedCents < input.minPayoutCents) {
    return { eligible: false, reason: 'Below minimum payout' };
  }
  if (input.requestedCents > input.eligibleCents) {
    return { eligible: false, reason: 'Insufficient eligible balance' };
  }
  return { eligible: true };
}

const PAYOUT_TRANSITIONS: Record<PayoutStatus, PayoutStatus[]> = {
  pending_eligibility: ['eligible', 'on_hold', 'cancelled'],
  eligible: ['processing', 'on_hold', 'cancelled'],
  processing: ['paid', 'failed', 'on_hold'],
  paid: ['reversed'],
  on_hold: ['eligible', 'cancelled'],
  failed: ['eligible', 'cancelled'],
  reversed: [],
  cancelled: [],
};

const REFUND_TRANSITIONS: Record<RefundStatus, RefundStatus[]> = {
  requested: ['under_review', 'cancelled', 'rejected'],
  under_review: ['approved', 'rejected', 'cancelled'],
  approved: ['provider_pending', 'cancelled'],
  rejected: [],
  provider_pending: ['succeeded', 'failed'],
  succeeded: [],
  failed: ['provider_pending', 'cancelled'],
  cancelled: [],
};

export function canTransitionPayout(from: PayoutStatus, to: PayoutStatus): boolean {
  return PAYOUT_TRANSITIONS[from].includes(to);
}

export function canTransitionRefund(from: RefundStatus, to: RefundStatus): boolean {
  return REFUND_TRANSITIONS[from].includes(to);
}
