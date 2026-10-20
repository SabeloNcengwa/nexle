import {
  canTransitionReturn,
  createReturnRequestSchema,
  inspectReturnSchema,
  reviewReturnSchema,
  type Actor,
  type ReturnRequest,
  type SaAddress,
} from '@mavundla/shared';
import { db } from '../config/firebase.js';
import { AppError } from '../lib/errors.js';
import {
  assertOrderAccess,
  assertSellerPermission,
  hasPlatformRole,
  requireAuthenticatedUser,
  requirePlatformPermission,
} from '../permissions/helpers.js';
import { getCourierProvider } from '../providers/courier/index.js';
import { writeAuditLog } from './audit.js';
import { attachIdempotencyResource, claimIdempotencyKey } from './idempotency.js';
import { enqueueNotification } from './notifications.js';
import { getOrderDocument } from './orders.js';
import { requestRefund } from './refunds.js';

function mapReturn(id: string, data: FirebaseFirestore.DocumentData): ReturnRequest {
  return {
    id,
    orderId: String(data.orderId),
    customerUid: String(data.customerUid),
    sellerId: String(data.sellerId),
    status: data.status,
    lines: data.lines ?? [],
    reasonCode: String(data.reasonCode),
    notes: data.notes,
    evidencePaths: data.evidencePaths ?? [],
    returnShipmentId: data.returnShipmentId,
    refundId: data.refundId,
    inspectionOutcome: data.inspectionOutcome,
    inspectionNotes: data.inspectionNotes,
    reviewerUid: data.reviewerUid,
    decisionReason: data.decisionReason,
    idempotencyKey: String(data.idempotencyKey),
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

export async function createReturnRequest(
  actor: Actor | undefined,
  body: unknown,
): Promise<ReturnRequest> {
  requireAuthenticatedUser(actor);
  const input = createReturnRequestSchema.parse(body);

  const claim = await claimIdempotencyKey(input.idempotencyKey, 'return', actor.uid);
  if (claim.alreadyExists && claim.existingResourceId) {
    const existing = await db().collection('returns').doc(claim.existingResourceId).get();
    if (existing.exists) return mapReturn(existing.id, existing.data()!);
  }

  const order = await getOrderDocument(input.orderId);
  assertOrderAccess(actor, order);
  if (order.status !== 'paid') {
    throw new AppError('INVALID_STATE', 'Returns require a paid order', 409);
  }
  if (order.customerUid !== actor.uid && !hasPlatformRole(actor, ['super_admin', 'support_agent'])) {
    throw new AppError('FORBIDDEN', 'Only customer or support may open a return', 403);
  }

  const lines = input.lines.map((reqLine) => {
    const orderLine = order.lines.find(
      (l) => l.productId === reqLine.productId && l.sku === reqLine.sku,
    );
    if (!orderLine) throw new AppError('LINE_NOT_FOUND', 'Order line not found', 404);
    if (reqLine.quantity > orderLine.quantity) {
      throw new AppError('VALIDATION_ERROR', 'Return quantity exceeds ordered quantity', 400);
    }
    return {
      productId: orderLine.productId,
      sku: orderLine.sku,
      quantity: reqLine.quantity,
      title: orderLine.title,
      sellerId: orderLine.sellerId,
    };
  });

  const sellerIds = new Set(lines.map((l) => l.sellerId));
  if (sellerIds.size !== 1) {
    throw new AppError(
      'MULTI_SELLER_RETURN',
      'Phase 4 returns must target a single seller per request',
      400,
    );
  }
  const sellerId = [...sellerIds][0]!;

  const now = new Date().toISOString();
  const ref = db().collection('returns').doc();
  const doc = {
    orderId: order.id,
    customerUid: order.customerUid,
    sellerId,
    status: 'requested',
    lines: lines.map(({ productId, sku, quantity, title }) => ({
      productId,
      sku,
      quantity,
      title,
    })),
    reasonCode: input.reasonCode,
    notes: input.notes,
    evidencePaths: input.evidencePaths,
    idempotencyKey: input.idempotencyKey,
    createdAt: now,
    updatedAt: now,
  };
  await ref.set(doc);
  await attachIdempotencyResource(input.idempotencyKey, 'return', ref.id);
  await writeAuditLog({
    actorUid: actor.uid,
    action: 'return.requested',
    resourceType: 'returns',
    resourceId: ref.id,
  });
  await enqueueNotification({
    template: 'return_update',
    toUid: order.customerUid,
    vars: {
      returnId: ref.id,
      status: 'requested',
      orderId: order.id,
      summary: 'Return request received',
    },
    dedupeKey: `return_requested_${ref.id}`,
  }).catch(() => undefined);

  return mapReturn(ref.id, doc);
}

export async function reviewReturn(actor: Actor | undefined, body: unknown): Promise<ReturnRequest> {
  requireAuthenticatedUser(actor);
  const input = reviewReturnSchema.parse(body);
  const ref = db().collection('returns').doc(input.returnId);
  const snap = await ref.get();
  if (!snap.exists) throw new AppError('NOT_FOUND', 'Return not found', 404);
  const data = snap.data()!;

  const isStaff = hasPlatformRole(actor, ['super_admin', 'support_agent']);
  if (!isStaff) {
    assertSellerPermission(actor, String(data.sellerId), 'seller:manage_returns');
  }

  if (!canTransitionReturn(data.status, input.decision === 'approved' ? 'approved' : 'rejected')) {
    throw new AppError('INVALID_STATE', 'Return cannot be reviewed in current status', 409);
  }

  const now = new Date().toISOString();
  await ref.update({
    status: input.decision === 'approved' ? 'approved' : 'rejected',
    reviewerUid: actor.uid,
    decisionReason: input.reason ?? input.decision,
    updatedAt: now,
  });

  await enqueueNotification({
    template: 'return_update',
    toUid: String(data.customerUid),
    vars: {
      returnId: ref.id,
      status: input.decision,
      orderId: String(data.orderId),
      summary: `Return ${input.decision}`,
    },
    dedupeKey: `return_review_${ref.id}_${input.decision}`,
  }).catch(() => undefined);

  const updated = await ref.get();
  return mapReturn(ref.id, updated.data()!);
}

/** Create return shipment label after approval. Distinguishes booked label from estimates. */
export async function createReturnLabel(
  actor: Actor | undefined,
  returnId: string,
): Promise<ReturnRequest> {
  requireAuthenticatedUser(actor);
  const ref = db().collection('returns').doc(returnId);
  const snap = await ref.get();
  if (!snap.exists) throw new AppError('NOT_FOUND', 'Return not found', 404);
  const data = snap.data()!;

  if (!hasPlatformRole(actor, ['super_admin', 'support_agent'])) {
    assertSellerPermission(actor, String(data.sellerId), 'seller:manage_returns');
  }
  if (data.status !== 'approved') {
    throw new AppError('INVALID_STATE', 'Return must be approved before label creation', 409);
  }

  const order = await getOrderDocument(String(data.orderId));
  const courier = getCourierProvider();
  if (!courier.createReturnShipment) {
    throw new AppError('RETURN_SHIPMENT_UNSUPPORTED', 'Courier does not support return labels', 501);
  }

  const sellerApp = await db()
    .collection('sellers')
    .doc(String(data.sellerId))
    .get();
  let sellerAddress: SaAddress = {
    line1: 'Seller returns desk',
    suburb: 'Sandton',
    city: 'Johannesburg',
    province: 'Gauteng',
    postalCode: '2196',
    country: 'ZA',
  };
  if (sellerApp.exists) {
    const app = await db()
      .collection('sellerApplications')
      .doc(String(sellerApp.data()!.applicationId))
      .get();
    if (app.exists && app.data()!.businessAddress) {
      sellerAddress = app.data()!.businessAddress as SaAddress;
    }
  }

  const shipmentRef = db().collection('shipments').doc();
  const booked = await courier.createReturnShipment({
    shipmentId: shipmentRef.id,
    pickup: order.shippingAddress,
    delivery: sellerAddress,
    parcel: { lengthCm: 30, widthCm: 20, heightCm: 10, weightGrams: 1000 },
    serviceCode: 'MOCK_STANDARD',
    reference: returnId,
  });

  const now = new Date().toISOString();
  await shipmentRef.set({
    orderId: order.id,
    sellerOrderId: `return_${returnId}`,
    sellerId: data.sellerId,
    customerUid: data.customerUid,
    status: 'booked',
    serviceCode: 'MOCK_STANDARD',
    parcel: { lengthCm: 30, widthCm: 20, heightCm: 10, weightGrams: 1000 },
    rateCents: booked.amountCents,
    rateEstimateOnly: booked.estimateOnly,
    provider: courier.name,
    providerShipmentRef: booked.providerShipmentRef,
    trackingNumber: booked.trackingNumber,
    labelUrl: booked.labelUrl,
    trackingEvents: [
      {
        status: 'booked',
        description: 'Return label created (confirmed booking)',
        at: now,
        source: 'provider',
      },
    ],
    idempotencyKey: `return_label_${returnId}`,
    isReturn: true,
    createdAt: now,
    updatedAt: now,
  });

  await ref.update({
    status: 'label_created',
    returnShipmentId: shipmentRef.id,
    updatedAt: now,
  });

  await enqueueNotification({
    template: 'return_update',
    toUid: String(data.customerUid),
    vars: {
      returnId,
      status: 'label_created',
      orderId: order.id,
      trackingNumber: booked.trackingNumber,
      summary: 'Return shipping label ready',
    },
    dedupeKey: `return_label_${returnId}`,
  }).catch(() => undefined);

  const updated = await ref.get();
  return mapReturn(ref.id, updated.data()!);
}

export async function markReturnReceived(
  actor: Actor | undefined,
  returnId: string,
): Promise<ReturnRequest> {
  requireAuthenticatedUser(actor);
  const ref = db().collection('returns').doc(returnId);
  const snap = await ref.get();
  if (!snap.exists) throw new AppError('NOT_FOUND', 'Return not found', 404);
  const data = snap.data()!;
  assertSellerPermission(actor, String(data.sellerId), 'seller:manage_returns');

  if (!['label_created', 'in_transit'].includes(data.status)) {
    throw new AppError('INVALID_STATE', 'Return cannot be marked received', 409);
  }
  const now = new Date().toISOString();
  await ref.update({ status: 'received', updatedAt: now });
  const updated = await ref.get();
  return mapReturn(ref.id, updated.data()!);
}

export async function inspectReturn(
  actor: Actor | undefined,
  body: unknown,
): Promise<ReturnRequest> {
  requireAuthenticatedUser(actor);
  const input = inspectReturnSchema.parse(body);
  const ref = db().collection('returns').doc(input.returnId);
  const snap = await ref.get();
  if (!snap.exists) throw new AppError('NOT_FOUND', 'Return not found', 404);
  const data = snap.data()!;
  assertSellerPermission(actor, String(data.sellerId), 'seller:manage_returns');

  if (!canTransitionReturn(data.status, 'inspected')) {
    throw new AppError('INVALID_STATE', 'Return must be received before inspection', 409);
  }

  const now = new Date().toISOString();
  await ref.update({
    status: 'inspected',
    inspectionOutcome: input.outcome,
    inspectionNotes: input.notes,
    updatedAt: now,
  });

  if (input.outcome === 'accepted' && input.createRefund) {
    await ref.update({ status: 'refund_pending', updatedAt: new Date().toISOString() });
    try {
      const refund = await requestRefund(actor, {
        orderId: data.orderId,
        idempotencyKey: `return_refund_${input.returnId}`,
        reasonCode: data.reasonCode,
        notes: `Return ${input.returnId} accepted after inspection`,
        lines: (data.lines as Array<{ productId: string; sku: string; quantity: number }>).map(
          (l) => ({
            productId: l.productId,
            sku: l.sku,
            quantity: l.quantity,
          }),
        ),
      });
      await ref.update({
        refundId: refund.id,
        status: 'completed',
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      // Keep refund_pending if refund request fails; support can retry
      await writeAuditLog({
        actorUid: actor.uid,
        action: 'return.refund_request_failed',
        resourceType: 'returns',
        resourceId: input.returnId,
        metadata: { error: err instanceof Error ? err.message : String(err) },
      });
    }
  } else if (input.outcome === 'rejected') {
    await ref.update({ status: 'completed', updatedAt: new Date().toISOString() });
  }

  await enqueueNotification({
    template: 'return_update',
    toUid: String(data.customerUid),
    vars: {
      returnId: input.returnId,
      status: input.outcome,
      orderId: String(data.orderId),
      summary: `Return inspection: ${input.outcome}`,
    },
    dedupeKey: `return_inspect_${input.returnId}`,
  }).catch(() => undefined);

  const updated = await ref.get();
  return mapReturn(ref.id, updated.data()!);
}

export async function getReturn(actor: Actor | undefined, returnId: string): Promise<ReturnRequest> {
  requireAuthenticatedUser(actor);
  const snap = await db().collection('returns').doc(returnId).get();
  if (!snap.exists) throw new AppError('NOT_FOUND', 'Return not found', 404);
  const ret = mapReturn(snap.id, snap.data()!);
  if (
    ret.customerUid !== actor.uid &&
    !hasPlatformRole(actor, ['super_admin', 'support_agent']) &&
    !actor.sellerMemberships.some((m) => m.sellerId === ret.sellerId && m.status === 'active')
  ) {
    throw new AppError('FORBIDDEN', 'No access to return', 403);
  }
  return ret;
}

export async function listReturnsForOrder(
  actor: Actor | undefined,
  orderId: string,
): Promise<ReturnRequest[]> {
  const order = await getOrderDocument(orderId);
  assertOrderAccess(actor, order);
  const snap = await db().collection('returns').where('orderId', '==', orderId).get();
  return snap.docs.map((d) => mapReturn(d.id, d.data()));
}

export async function listReturnQueue(actor: Actor | undefined): Promise<ReturnRequest[]> {
  requirePlatformPermission(actor, ['super_admin', 'support_agent']);
  const snap = await db()
    .collection('returns')
    .where('status', 'in', ['requested', 'approved', 'label_created', 'received', 'refund_pending'])
    .limit(50)
    .get();
  return snap.docs.map((d) => mapReturn(d.id, d.data()));
}

export async function listSellerReturns(
  actor: Actor | undefined,
  sellerId: string,
): Promise<ReturnRequest[]> {
  requireAuthenticatedUser(actor);
  assertSellerPermission(actor, sellerId, 'seller:manage_returns');
  const snap = await db()
    .collection('returns')
    .where('sellerId', '==', sellerId)
    .orderBy('createdAt', 'desc')
    .limit(50)
    .get();
  return snap.docs.map((d) => mapReturn(d.id, d.data()));
}
