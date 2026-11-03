import {
  eligibilityReleaseEntries,
  sumLedgerEntries,
  type LedgerEntry,
  type OrderLineSnapshot,
  type SellerBucketBalances,
} from '@mavundla/shared';
import type { DocData } from '../db/types.js';
import { db } from '../config/firebase.js';
import { AppError } from '../lib/errors.js';

function mapEntry(id: string, data: DocData): LedgerEntry {
  return {
    id,
    sellerId: String(data.sellerId),
    type: data.type,
    amountCents: Number(data.amountCents),
    sign: data.sign,
    bucket: data.bucket,
    currency: 'ZAR',
    orderId: data.orderId,
    paymentId: data.paymentId,
    refundId: data.refundId,
    payoutId: data.payoutId,
    compensatingForEntryId: data.compensatingForEntryId,
    description: String(data.description),
    createdByUid: String(data.createdByUid),
    createdAt: String(data.createdAt),
  };
}

/** Append-only write. Never update or delete ledger history. */
export async function appendLedgerEntry(
  input: Omit<LedgerEntry, 'id' | 'currency' | 'createdAt'> & { createdAt?: string },
): Promise<LedgerEntry> {
  if (!Number.isInteger(input.amountCents) || input.amountCents < 0) {
    throw new AppError('VALIDATION_ERROR', 'Ledger amountCents must be non-negative integer', 400);
  }
  const ref = db().collection('sellerLedger').doc();
  const createdAt = input.createdAt ?? new Date().toISOString();
  const doc = {
    ...input,
    currency: 'ZAR',
    createdAt,
  };
  await ref.set(doc);
  return mapEntry(ref.id, doc);
}

export async function listSellerLedger(
  sellerId: string,
  limit = 100,
): Promise<LedgerEntry[]> {
  const snap = await db()
    .collection('sellerLedger')
    .where('sellerId', '==', sellerId)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();
  return snap.docs.map((d) => mapEntry(d.id, d.data()));
}

export async function getSellerBalances(sellerId: string): Promise<SellerBucketBalances> {
  const entries = await listSellerLedger(sellerId, 1000);
  return sumLedgerEntries(
    entries.map((e) => ({
      type: e.type,
      amountCents: e.amountCents,
      sign: e.sign,
      bucket: e.bucket,
    })),
  );
}

/**
 * Post immutable sale + commission entries when payment succeeds.
 * Idempotent via orderId marker document.
 */
export async function postSaleLedgerForOrder(input: {
  orderId: string;
  paymentId: string;
  lines: OrderLineSnapshot[];
  deliveryQuotes: Array<{ sellerId: string; deliveryCents: number }>;
  actorUid: string;
}): Promise<{ posted: boolean }> {
  const markerRef = db().collection('idempotencyRecords').doc(`ledger_sale_${input.orderId}`);
  const existing = await markerRef.get();
  if (existing.exists) return { posted: false };

  const now = new Date().toISOString();
  const bySeller = new Map<string, OrderLineSnapshot[]>();
  for (const line of input.lines) {
    const list = bySeller.get(line.sellerId) ?? [];
    list.push(line);
    bySeller.set(line.sellerId, list);
  }

  const batch = db().batch();
  batch.set(markerRef, {
    key: input.orderId,
    scope: 'ledger_sale',
    ownerUid: input.actorUid,
    resourceId: input.orderId,
    createdAt: now,
  });

  for (const [sellerId, lines] of bySeller) {
    let proceeds = 0;
    let commission = 0;
    for (const line of lines) {
      proceeds += line.sellerProceedsCents;
      commission += line.platformCommissionCents;
    }
    const deliveryCents =
      input.deliveryQuotes.find((q) => q.sellerId === sellerId)?.deliveryCents ?? 0;

    const proceedsRef = db().collection('sellerLedger').doc();
    batch.set(proceedsRef, {
      sellerId,
      type: 'seller_sale_proceeds',
      amountCents: proceeds,
      sign: 1,
      bucket: 'pending',
      currency: 'ZAR',
      orderId: input.orderId,
      paymentId: input.paymentId,
      description: `Sale proceeds for order ${input.orderId}`,
      createdByUid: input.actorUid,
      createdAt: now,
    });

    // Platform commission tracked per seller attribution (platform revenue reporting)
    const commissionRef = db().collection('sellerLedger').doc();
    batch.set(commissionRef, {
      sellerId: '__platform__',
      type: 'platform_commission',
      amountCents: commission,
      sign: 1,
      bucket: 'pending',
      currency: 'ZAR',
      orderId: input.orderId,
      paymentId: input.paymentId,
      description: `Commission from seller ${sellerId} order ${input.orderId}`,
      createdByUid: input.actorUid,
      createdAt: now,
      attributedSellerId: sellerId,
    });

    if (deliveryCents > 0) {
      // Delivery charged to customer; estimate only in Phase 2/3 — recorded for reconciliation
      const deliveryRef = db().collection('sellerLedger').doc();
      batch.set(deliveryRef, {
        sellerId: '__platform__',
        type: 'delivery_charge',
        amountCents: deliveryCents,
        sign: 1,
        bucket: 'pending',
        currency: 'ZAR',
        orderId: input.orderId,
        paymentId: input.paymentId,
        description: `Delivery estimate for seller ${sellerId}`,
        createdByUid: input.actorUid,
        createdAt: now,
        attributedSellerId: sellerId,
      });
    }
  }

  await batch.commit();
  return { posted: true };
}

export async function releasePendingToEligible(input: {
  sellerId: string;
  amountCents: number;
  actorUid: string;
  reason: string;
}): Promise<LedgerEntry[]> {
  const balances = await getSellerBalances(input.sellerId);
  if (input.amountCents > balances.pending) {
    throw new AppError('INSUFFICIENT_PENDING', 'Not enough pending balance to release', 400);
  }
  const pair = eligibilityReleaseEntries(input.amountCents);
  const created: LedgerEntry[] = [];
  for (const part of pair) {
    created.push(
      await appendLedgerEntry({
        sellerId: input.sellerId,
        type: part.type,
        amountCents: part.amountCents,
        sign: part.sign,
        bucket: part.bucket,
        description: input.reason,
        createdByUid: input.actorUid,
      }),
    );
  }
  return created;
}

export async function postRefundLedgerEntries(input: {
  sellerId: string;
  refundId: string;
  orderId: string;
  paymentId: string;
  sellerProceedsCents: number;
  platformCommissionCents: number;
  actorUid: string;
}): Promise<void> {
  const now = new Date().toISOString();
  const markerRef = db().collection('idempotencyRecords').doc(`ledger_refund_${input.refundId}`);
  if ((await markerRef.get()).exists) return;

  const batch = db().batch();
  batch.set(markerRef, {
    key: input.refundId,
    scope: 'ledger_refund',
    ownerUid: input.actorUid,
    resourceId: input.refundId,
    createdAt: now,
  });

  // Compensating entries — prefer debiting pending, else eligible (simplified: debit pending first via held if needed)
  const balances = await getSellerBalances(input.sellerId);
  let remaining = input.sellerProceedsCents;
  const debitPending = Math.min(remaining, Math.max(0, balances.pending));
  remaining -= debitPending;
  const debitEligible = Math.min(remaining, Math.max(0, balances.eligible));
  remaining -= debitEligible;
  if (remaining > 0) {
    // Hold overdraft as held negative via debit held (still append-only)
    batch.set(db().collection('sellerLedger').doc(), {
      sellerId: input.sellerId,
      type: 'refund',
      amountCents: remaining,
      sign: -1,
      bucket: 'held',
      currency: 'ZAR',
      orderId: input.orderId,
      paymentId: input.paymentId,
      refundId: input.refundId,
      description: `Refund clawback (held) ${input.refundId}`,
      createdByUid: input.actorUid,
      createdAt: now,
    });
  }
  if (debitPending > 0) {
    batch.set(db().collection('sellerLedger').doc(), {
      sellerId: input.sellerId,
      type: 'refund',
      amountCents: debitPending,
      sign: -1,
      bucket: 'pending',
      currency: 'ZAR',
      orderId: input.orderId,
      paymentId: input.paymentId,
      refundId: input.refundId,
      description: `Refund debit pending ${input.refundId}`,
      createdByUid: input.actorUid,
      createdAt: now,
    });
  }
  if (debitEligible > 0) {
    batch.set(db().collection('sellerLedger').doc(), {
      sellerId: input.sellerId,
      type: 'refund',
      amountCents: debitEligible,
      sign: -1,
      bucket: 'eligible',
      currency: 'ZAR',
      orderId: input.orderId,
      paymentId: input.paymentId,
      refundId: input.refundId,
      description: `Refund debit eligible ${input.refundId}`,
      createdByUid: input.actorUid,
      createdAt: now,
    });
  }

  batch.set(db().collection('sellerLedger').doc(), {
    sellerId: '__platform__',
    type: 'reversal',
    amountCents: input.platformCommissionCents,
    sign: -1,
    bucket: 'pending',
    currency: 'ZAR',
    orderId: input.orderId,
    paymentId: input.paymentId,
    refundId: input.refundId,
    description: `Commission reversal for refund ${input.refundId}`,
    createdByUid: input.actorUid,
    createdAt: now,
    attributedSellerId: input.sellerId,
  });

  await batch.commit();
}

export async function postPayoutLedgerEntries(input: {
  sellerId: string;
  payoutId: string;
  amountCents: number;
  actorUid: string;
}): Promise<void> {
  const markerRef = db().collection('idempotencyRecords').doc(`ledger_payout_${input.payoutId}`);
  if ((await markerRef.get()).exists) return;
  const now = new Date().toISOString();
  const batch = db().batch();
  batch.set(markerRef, {
    key: input.payoutId,
    scope: 'ledger_payout',
    ownerUid: input.actorUid,
    resourceId: input.payoutId,
    createdAt: now,
  });
  batch.set(db().collection('sellerLedger').doc(), {
    sellerId: input.sellerId,
    type: 'payout',
    amountCents: input.amountCents,
    sign: -1,
    bucket: 'eligible',
    currency: 'ZAR',
    payoutId: input.payoutId,
    description: `Payout ${input.payoutId}`,
    createdByUid: input.actorUid,
    createdAt: now,
  });
  batch.set(db().collection('sellerLedger').doc(), {
    sellerId: input.sellerId,
    type: 'payout',
    amountCents: input.amountCents,
    sign: 1,
    bucket: 'paid',
    currency: 'ZAR',
    payoutId: input.payoutId,
    description: `Payout settled ${input.payoutId}`,
    createdByUid: input.actorUid,
    createdAt: now,
  });
  await batch.commit();
}
