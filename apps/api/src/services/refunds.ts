import {
  assessRefundEligibility,
  canTransitionRefund,
  createRefundRequestSchema,
  multiplyCents,
  reviewRefundSchema,
  type Actor,
  type Refund,
  type RefundLine,
} from '@mavundla/shared';
import { db } from '../config/firebase.js';
import { AppError } from '../lib/errors.js';
import {
  assertOrderAccess,
  requireAuthenticatedUser,
  requirePlatformPermission,
} from '../permissions/helpers.js';
import { getPaymentProvider } from '../providers/payment/index.js';
import { attachIdempotencyResource, claimIdempotencyKey } from './idempotency.js';
import { postRefundLedgerEntries } from './ledger.js';
import { getOrderDocument } from './orders.js';
import { writeAuditLog } from './audit.js';

const DEFAULT_RETURN_WINDOW_DAYS = 14;

async function getReturnWindowDays(): Promise<number> {
  const snap = await db().collection('platformSettings').doc('finance').get();
  if (!snap.exists) return DEFAULT_RETURN_WINDOW_DAYS;
  return Number(snap.data()!.returnWindowDays ?? DEFAULT_RETURN_WINDOW_DAYS);
}

function mapRefund(id: string, data: FirebaseFirestore.DocumentData): Refund {
  return {
    id,
    orderId: String(data.orderId),
    paymentId: String(data.paymentId),
    customerUid: String(data.customerUid),
    status: data.status,
    lines: data.lines ?? [],
    amountCents: Number(data.amountCents),
    currency: 'ZAR',
    reasonCode: String(data.reasonCode),
    notes: data.notes,
    providerRefundRef: data.providerRefundRef,
    idempotencyKey: String(data.idempotencyKey),
    reviewerUid: data.reviewerUid,
    decisionReason: data.decisionReason,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    succeededAt: data.succeededAt,
  };
}

async function alreadyRefundedQuantity(
  orderId: string,
  productId: string,
  sku: string,
): Promise<number> {
  const snap = await db().collection('refunds').where('orderId', '==', orderId).get();
  let qty = 0;
  for (const doc of snap.docs) {
    const status = doc.data().status as string;
    if (['rejected', 'cancelled', 'failed'].includes(status)) continue;
    for (const line of (doc.data().lines as RefundLine[]) ?? []) {
      if (line.productId === productId && line.sku === sku) qty += line.quantity;
    }
  }
  return qty;
}

export async function requestRefund(
  actor: Actor | undefined,
  body: unknown,
): Promise<Refund> {
  requireAuthenticatedUser(actor);
  const input = createRefundRequestSchema.parse(body);

  const claim = await claimIdempotencyKey(input.idempotencyKey, 'refund', actor.uid);
  if (claim.alreadyExists && claim.existingResourceId) {
    const existing = await db().collection('refunds').doc(claim.existingResourceId).get();
    if (existing.exists) return mapRefund(existing.id, existing.data()!);
  }

  const order = await getOrderDocument(input.orderId);
  assertOrderAccess(actor, order);

  const isCustomer = order.customerUid === actor.uid;
  const isStaff =
    actor.platformRoles.includes('support_agent') ||
    actor.platformRoles.includes('super_admin') ||
    actor.platformRoles.includes('finance_operator');
  const sellerIdsInRequest = new Set(
    input.lines.map((l) => {
      const orderLine = order.lines.find((ol) => ol.productId === l.productId && ol.sku === l.sku);
      return orderLine?.sellerId;
    }),
  );
  const isSellerHandler = [...sellerIdsInRequest].every(
    (sellerId) =>
      sellerId &&
      actor.sellerMemberships.some(
        (m) =>
          m.sellerId === sellerId &&
          m.status === 'active' &&
          m.permissions.includes('seller:manage_returns'),
      ),
  );
  if (!isCustomer && !isStaff && !isSellerHandler) {
    throw new AppError(
      'FORBIDDEN',
      'Only the customer, support/finance, or the fulfilling seller may request this refund',
      403,
    );
  }
  if (!order.paymentId) throw new AppError('PAYMENT_MISSING', 'Order has no payment', 400);

  const windowDays = await getReturnWindowDays();
  const nowIso = new Date().toISOString();
  const refundLines: RefundLine[] = [];

  for (const reqLine of input.lines) {
    const orderLine = order.lines.find(
      (l) => l.productId === reqLine.productId && l.sku === reqLine.sku,
    );
    if (!orderLine) {
      throw new AppError('LINE_NOT_FOUND', 'Order line not found', 404);
    }
    const already = await alreadyRefundedQuantity(order.id, reqLine.productId, reqLine.sku);
    const assessment = assessRefundEligibility({
      orderStatus: order.status,
      paidAtIso: order.paidAt,
      nowIso,
      returnWindowDays: windowDays,
      lineQuantityOrdered: orderLine.quantity,
      lineQuantityAlreadyRefunded: already,
      requestQuantity: reqLine.quantity,
    });
    if (!assessment.eligible) {
      throw new AppError('REFUND_INELIGIBLE', assessment.reason ?? 'Not eligible', 400);
    }

    const ratioNumerator = reqLine.quantity;
    const lineRefundCents = multiplyCents(orderLine.unitPriceCents, ratioNumerator);
    // Pro-rate commission/proceeds by quantity
    const platformCommissionCents = Math.floor(
      (orderLine.platformCommissionCents * ratioNumerator) / orderLine.quantity,
    );
    const sellerProceedsCents = lineRefundCents - platformCommissionCents;

    refundLines.push({
      productId: orderLine.productId,
      sellerId: orderLine.sellerId,
      sku: orderLine.sku,
      quantity: reqLine.quantity,
      unitPriceCents: orderLine.unitPriceCents,
      lineRefundCents,
      platformCommissionCents,
      sellerProceedsCents,
    });
  }

  const amountCents = refundLines.reduce((acc, l) => acc + l.lineRefundCents, 0);
  const ref = db().collection('refunds').doc();
  const doc = {
    orderId: order.id,
    paymentId: order.paymentId,
    customerUid: order.customerUid,
    status: 'requested',
    lines: refundLines,
    amountCents,
    currency: 'ZAR',
    reasonCode: input.reasonCode,
    notes: input.notes,
    idempotencyKey: input.idempotencyKey,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  await ref.set(doc);
  await attachIdempotencyResource(input.idempotencyKey, 'refund', ref.id);
  await writeAuditLog({
    actorUid: actor.uid,
    action: 'refund.requested',
    resourceType: 'refunds',
    resourceId: ref.id,
    metadata: { orderId: order.id, amountCents },
  });
  return mapRefund(ref.id, doc);
}

export async function reviewRefund(actor: Actor | undefined, body: unknown): Promise<Refund> {
  requirePlatformPermission(actor, ['super_admin', 'support_agent', 'finance_operator']);
  const input = reviewRefundSchema.parse(body);
  const ref = db().collection('refunds').doc(input.refundId);
  const snap = await ref.get();
  if (!snap.exists) throw new AppError('NOT_FOUND', 'Refund not found', 404);
  const data = snap.data()!;
  const nowIso = new Date().toISOString();

  if (input.decision === 'rejected') {
    if (!canTransitionRefund(data.status, 'rejected')) {
      throw new AppError('INVALID_STATE', 'Cannot reject refund in current status', 409);
    }
    await ref.update({
      status: 'rejected',
      reviewerUid: actor.uid,
      decisionReason: input.reason ?? 'Rejected',
      updatedAt: nowIso,
    });
  } else {
    let status = data.status as string;
    if (status === 'requested') {
      await ref.update({ status: 'under_review', reviewerUid: actor.uid, updatedAt: nowIso });
      status = 'under_review';
    }
    if (!canTransitionRefund(status as 'under_review', 'approved')) {
      throw new AppError('INVALID_STATE', 'Cannot approve refund', 409);
    }
    await ref.update({
      status: 'approved',
      reviewerUid: actor.uid,
      decisionReason: input.reason ?? 'Approved',
      updatedAt: nowIso,
    });
  }

  const updated = await ref.get();
  return mapRefund(ref.id, updated.data()!);
}

/** Submit approved refund to provider — does NOT mark succeeded on accept. */
export async function submitRefundToProvider(
  actor: Actor | undefined,
  refundId: string,
  webBaseUrl: string,
): Promise<Refund> {
  requirePlatformPermission(actor, ['super_admin', 'finance_operator']);
  const ref = db().collection('refunds').doc(refundId);
  const snap = await ref.get();
  if (!snap.exists) throw new AppError('NOT_FOUND', 'Refund not found', 404);
  const data = snap.data()!;
  if (data.status !== 'approved' && data.status !== 'failed') {
    throw new AppError('INVALID_STATE', 'Refund must be approved (or retry failed)', 409);
  }

  const paymentSnap = await db().collection('payments').doc(String(data.paymentId)).get();
  if (!paymentSnap.exists) throw new AppError('PAYMENT_MISSING', 'Payment missing', 404);
  const payment = paymentSnap.data()!;

  const provider = getPaymentProvider(webBaseUrl);
  const created = await provider.createRefund({
    paymentProviderRef: String(payment.providerRef),
    refundId,
    amountCents: Number(data.amountCents),
    currency: 'ZAR',
    reason: String(data.reasonCode),
  });

  const nowIso = new Date().toISOString();
  await ref.update({
    status: 'provider_pending',
    providerRefundRef: created.providerRefundRef,
    updatedAt: nowIso,
  });

  await writeAuditLog({
    actorUid: actor.uid,
    action: 'refund.provider_submitted',
    resourceType: 'refunds',
    resourceId: refundId,
    metadata: { providerRefundRef: created.providerRefundRef, providerStatus: created.status },
  });

  const updated = await ref.get();
  return mapRefund(ref.id, updated.data()!);
}

/** Confirm refund from provider status — only then ledger + succeeded. */
export async function reconcileRefundWithProvider(
  actor: Actor | undefined,
  refundId: string,
  webBaseUrl: string,
): Promise<Refund> {
  requirePlatformPermission(actor, ['super_admin', 'finance_operator']);
  const ref = db().collection('refunds').doc(refundId);
  const snap = await ref.get();
  if (!snap.exists) throw new AppError('NOT_FOUND', 'Refund not found', 404);
  const data = snap.data()!;
  if (data.status !== 'provider_pending') {
    throw new AppError('INVALID_STATE', 'Refund is not provider_pending', 409);
  }
  if (!data.providerRefundRef) {
    throw new AppError('PROVIDER_REF_MISSING', 'Missing provider refund reference', 400);
  }

  const provider = getPaymentProvider(webBaseUrl);
  const status = await provider.getRefundStatus(String(data.providerRefundRef));
  const nowIso = new Date().toISOString();

  if (status.status === 'pending') {
    return mapRefund(ref.id, data);
  }

  if (status.status === 'failed') {
    await ref.update({ status: 'failed', updatedAt: nowIso });
    const updated = await ref.get();
    return mapRefund(ref.id, updated.data()!);
  }

  // succeeded — post ledger once, then mark complete
  const lines = (data.lines as RefundLine[]) ?? [];
  const bySeller = new Map<string, { proceeds: number; commission: number }>();
  for (const line of lines) {
    const cur = bySeller.get(line.sellerId) ?? { proceeds: 0, commission: 0 };
    cur.proceeds += line.sellerProceedsCents;
    cur.commission += line.platformCommissionCents;
    bySeller.set(line.sellerId, cur);
  }
  for (const [sellerId, amounts] of bySeller) {
    await postRefundLedgerEntries({
      sellerId,
      refundId,
      orderId: String(data.orderId),
      paymentId: String(data.paymentId),
      sellerProceedsCents: amounts.proceeds,
      platformCommissionCents: amounts.commission,
      actorUid: actor.uid,
    });
  }

  await ref.update({ status: 'succeeded', succeededAt: nowIso, updatedAt: nowIso });
  await writeAuditLog({
    actorUid: actor.uid,
    action: 'refund.succeeded',
    resourceType: 'refunds',
    resourceId: refundId,
  });
  const updated = await ref.get();
  return mapRefund(ref.id, updated.data()!);
}

export async function listRefundsForOrder(
  actor: Actor | undefined,
  orderId: string,
): Promise<Refund[]> {
  const order = await getOrderDocument(orderId);
  assertOrderAccess(actor, order);
  const snap = await db().collection('refunds').where('orderId', '==', orderId).get();
  return snap.docs.map((d) => mapRefund(d.id, d.data()));
}

export async function listRefundQueue(actor: Actor | undefined): Promise<Refund[]> {
  requirePlatformPermission(actor, ['super_admin', 'support_agent', 'finance_operator']);
  const snap = await db()
    .collection('refunds')
    .where('status', 'in', ['requested', 'under_review', 'approved', 'provider_pending', 'failed'])
    .limit(50)
    .get();
  return snap.docs.map((d) => mapRefund(d.id, d.data()));
}
