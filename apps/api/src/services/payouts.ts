import {
  assessPayoutEligibility,
  canTransitionPayout,
  createPayoutSchema,
  reviewPayoutSchema,
  type Actor,
  type Payout,
} from '@mavundla/shared';
import type { DocData } from '../db/types.js';
import { db } from '../config/firebase.js';
import { AppError } from '../lib/errors.js';
import { maskAccountNumber } from '../lib/moneySecurity.js';
import {
  assertSellerPermission,
  requireAuthenticatedUser,
  requirePlatformPermission,
} from '../permissions/helpers.js';
import { getPaymentProvider } from '../providers/payment/index.js';
import { writeAuditLog } from './audit.js';
import { attachIdempotencyResource, claimIdempotencyKey } from './idempotency.js';
import { getSellerBalances, postPayoutLedgerEntries, releasePendingToEligible } from './ledger.js';

const DEFAULT_MIN_PAYOUT_CENTS = 1000;
const DEFAULT_HOLD_DAYS = 7;

function mapPayout(id: string, data: DocData): Payout {
  const bank = data.destinationBank as
    | { accountName: string; bankName: string; accountNumber: string; branchCode?: string }
    | undefined;
  return {
    id,
    sellerId: String(data.sellerId),
    amountCents: Number(data.amountCents),
    currency: 'ZAR',
    status: data.status,
    providerPayoutRef: data.providerPayoutRef,
    idempotencyKey: String(data.idempotencyKey),
    requestedByUid: String(data.requestedByUid),
    reviewedByUid: data.reviewedByUid,
    decisionReason: data.decisionReason,
    destinationBank: bank
      ? {
          accountName: bank.accountName,
          bankName: bank.bankName,
          accountNumber: maskAccountNumber(bank.accountNumber),
          branchCode: bank.branchCode,
        }
      : undefined,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    paidAt: data.paidAt,
  };
}

async function financeSettings(): Promise<{ minPayoutCents: number; payoutHoldDays: number }> {
  const snap = await db().collection('platformSettings').doc('finance').get();
  return {
    minPayoutCents: Number(snap.data()?.minPayoutCents ?? DEFAULT_MIN_PAYOUT_CENTS),
    payoutHoldDays: Number(snap.data()?.payoutHoldDays ?? DEFAULT_HOLD_DAYS),
  };
}

export async function autoReleaseEligibleForSeller(
  actor: Actor | undefined,
  sellerId: string,
  amountCents?: number,
): Promise<{ releasedCents: number }> {
  requirePlatformPermission(actor, ['super_admin', 'finance_operator']);
  const balances = await getSellerBalances(sellerId);
  const releaseAmount = amountCents ?? balances.pending;
  if (releaseAmount <= 0) return { releasedCents: 0 };
  await releasePendingToEligible({
    sellerId,
    amountCents: releaseAmount,
    actorUid: actor.uid,
    reason: `Eligibility release (${releaseAmount} cents)`,
  });
  return { releasedCents: releaseAmount };
}

/**
 * Scheduled helper: release pending proceeds older than hold period.
 * Simplified Phase 3: releases all pending for sellers with paid orders older than hold.
 * Full age-based per-entry release can refine later.
 */
export async function runEligibilityReleaseJob(limit = 20): Promise<{ sellersProcessed: number }> {
  const { payoutHoldDays } = await financeSettings();
  const cutoff = new Date(Date.now() - payoutHoldDays * 24 * 60 * 60 * 1000).toISOString();
  const orders = await db()
    .collection('orders')
    .where('status', '==', 'paid')
    .where('paidAt', '<=', cutoff)
    .limit(limit)
    .get();

  const sellerIds = new Set<string>();
  for (const doc of orders.docs) {
    for (const line of doc.data().lines ?? []) {
      sellerIds.add(String(line.sellerId));
    }
  }

  let sellersProcessed = 0;
  for (const sellerId of sellerIds) {
    const balances = await getSellerBalances(sellerId);
    if (balances.pending <= 0) continue;
    await releasePendingToEligible({
      sellerId,
      amountCents: balances.pending,
      actorUid: 'system:eligibility_job',
      reason: `Auto eligibility after ${payoutHoldDays}d hold`,
    });
    sellersProcessed += 1;
  }
  return { sellersProcessed };
}

export async function requestPayout(actor: Actor | undefined, body: unknown): Promise<Payout> {
  requireAuthenticatedUser(actor);
  const input = createPayoutSchema.parse(body);
  assertSellerPermission(actor, input.sellerId, 'seller:view_finance');

  const claim = await claimIdempotencyKey(input.idempotencyKey, 'payout', actor.uid);
  if (claim.alreadyExists && claim.existingResourceId) {
    const existing = await db().collection('payouts').doc(claim.existingResourceId).get();
    if (existing.exists) return mapPayout(existing.id, existing.data()!);
  }

  const sellerSnap = await db().collection('sellers').doc(input.sellerId).get();
  if (!sellerSnap.exists) throw new AppError('NOT_FOUND', 'Seller not found', 404);
  const seller = sellerSnap.data()!;
  const payoutBank = seller.payoutBank as
    | { accountName: string; bankName: string; accountNumber: string; branchCode?: string }
    | undefined;
  if (!payoutBank?.accountNumber || !payoutBank.bankName || !payoutBank.accountName) {
    throw new AppError(
      'PAYOUT_BANK_REQUIRED',
      'Add your business bank details before withdrawing. Nexle pays out your net proceeds (after the 8% platform fee) to that account.',
      400,
    );
  }
  const balances = await getSellerBalances(input.sellerId);
  const settings = await financeSettings();

  const assessment = assessPayoutEligibility({
    eligibleCents: balances.eligible,
    requestedCents: input.amountCents,
    sellerStatus: seller.status,
    paymentOnboardingComplete: true, // mock: treat as complete; production must check provider
    minPayoutCents: settings.minPayoutCents,
  });
  if (!assessment.eligible) {
    throw new AppError('PAYOUT_INELIGIBLE', assessment.reason ?? 'Not eligible', 400);
  }

  const nowIso = new Date().toISOString();
  const ref = db().collection('payouts').doc();
  const doc = {
    sellerId: input.sellerId,
    amountCents: input.amountCents,
    currency: 'ZAR',
    status: 'eligible',
    idempotencyKey: input.idempotencyKey,
    requestedByUid: actor.uid,
    /** Snapshot of destination — amount is already net of platform commission. */
    destinationBank: {
      accountName: payoutBank.accountName,
      bankName: payoutBank.bankName,
      accountNumber: payoutBank.accountNumber,
      branchCode: payoutBank.branchCode,
    },
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  await ref.set(doc);
  await attachIdempotencyResource(input.idempotencyKey, 'payout', ref.id);
  await writeAuditLog({
    actorUid: actor.uid,
    action: 'payout.requested',
    resourceType: 'payouts',
    resourceId: ref.id,
    metadata: { amountCents: input.amountCents },
  });
  return mapPayout(ref.id, doc);
}

export async function reviewPayout(
  actor: Actor | undefined,
  body: unknown,
  webBaseUrl: string,
): Promise<Payout> {
  requirePlatformPermission(actor, ['super_admin', 'finance_operator']);
  const input = reviewPayoutSchema.parse(body);
  const ref = db().collection('payouts').doc(input.payoutId);
  const snap = await ref.get();
  if (!snap.exists) throw new AppError('NOT_FOUND', 'Payout not found', 404);
  const data = snap.data()!;
  const nowIso = new Date().toISOString();

  if (input.decision === 'hold') {
    if (!canTransitionPayout(data.status, 'on_hold')) {
      throw new AppError('INVALID_STATE', 'Cannot hold payout', 409);
    }
    await ref.update({
      status: 'on_hold',
      reviewedByUid: actor.uid,
      decisionReason: input.reason ?? 'Held',
      updatedAt: nowIso,
    });
  } else if (input.decision === 'cancel') {
    if (!canTransitionPayout(data.status, 'cancelled')) {
      throw new AppError('INVALID_STATE', 'Cannot cancel payout', 409);
    }
    await ref.update({
      status: 'cancelled',
      reviewedByUid: actor.uid,
      decisionReason: input.reason ?? 'Cancelled',
      updatedAt: nowIso,
    });
  } else {
    // approve_and_initiate
    if (!canTransitionPayout(data.status, 'processing')) {
      throw new AppError('INVALID_STATE', 'Payout cannot move to processing', 409);
    }
    const provider = getPaymentProvider(webBaseUrl);
    if (!provider.supportsMarketplacePayouts || !provider.initiatePayout) {
      throw new AppError(
        'PAYOUTS_UNSUPPORTED',
        'Configured provider does not support marketplace payouts',
        501,
      );
    }
    await ref.update({
      status: 'processing',
      reviewedByUid: actor.uid,
      decisionReason: input.reason ?? 'Approved',
      updatedAt: nowIso,
    });
    const initiated = await provider.initiatePayout({
      payoutId: ref.id,
      sellerId: String(data.sellerId),
      amountCents: Number(data.amountCents),
      currency: 'ZAR',
    });
    await ref.update({
      providerPayoutRef: initiated.providerPayoutRef,
      updatedAt: new Date().toISOString(),
    });
  }

  const updated = await ref.get();
  return mapPayout(ref.id, updated.data()!);
}

/** Reconcile provider payout status — only mark paid on verified provider outcome. */
export async function reconcilePayoutWithProvider(
  actor: Actor | undefined,
  payoutId: string,
  webBaseUrl: string,
): Promise<Payout> {
  requirePlatformPermission(actor, ['super_admin', 'finance_operator']);
  const ref = db().collection('payouts').doc(payoutId);
  const snap = await ref.get();
  if (!snap.exists) throw new AppError('NOT_FOUND', 'Payout not found', 404);
  const data = snap.data()!;
  if (data.status !== 'processing') {
    throw new AppError('INVALID_STATE', 'Payout is not processing', 409);
  }
  if (!data.providerPayoutRef) {
    throw new AppError('PROVIDER_REF_MISSING', 'Missing provider payout reference', 400);
  }

  const provider = getPaymentProvider(webBaseUrl);
  if (!provider.getPayoutStatus) {
    throw new AppError('PAYOUTS_UNSUPPORTED', 'Provider cannot report payout status', 501);
  }
  const status = await provider.getPayoutStatus(String(data.providerPayoutRef));
  const nowIso = new Date().toISOString();

  if (status.status === 'pending') return mapPayout(ref.id, data);

  if (status.status === 'failed' || status.status === 'cancelled') {
    await ref.update({
      status: status.status === 'cancelled' ? 'cancelled' : 'failed',
      updatedAt: nowIso,
    });
    const updated = await ref.get();
    return mapPayout(ref.id, updated.data()!);
  }

  // paid
  await postPayoutLedgerEntries({
    sellerId: String(data.sellerId),
    payoutId,
    amountCents: Number(data.amountCents),
    actorUid: actor.uid,
  });
  await ref.update({ status: 'paid', paidAt: nowIso, updatedAt: nowIso });
  await writeAuditLog({
    actorUid: actor.uid,
    action: 'payout.paid',
    resourceType: 'payouts',
    resourceId: payoutId,
  });
  const updated = await ref.get();
  return mapPayout(ref.id, updated.data()!);
}

export async function listSellerPayouts(
  actor: Actor | undefined,
  sellerId: string,
): Promise<Payout[]> {
  requireAuthenticatedUser(actor);
  assertSellerPermission(actor, sellerId, 'seller:view_finance');
  const snap = await db()
    .collection('payouts')
    .where('sellerId', '==', sellerId)
    .orderBy('createdAt', 'desc')
    .limit(50)
    .get();
  return snap.docs.map((d) => mapPayout(d.id, d.data()));
}

export async function listPayoutQueue(actor: Actor | undefined): Promise<Payout[]> {
  requirePlatformPermission(actor, ['super_admin', 'finance_operator']);
  const snap = await db()
    .collection('payouts')
    .where('status', 'in', ['eligible', 'processing', 'on_hold', 'failed'])
    .limit(50)
    .get();
  return snap.docs.map((d) => mapPayout(d.id, d.data()));
}
