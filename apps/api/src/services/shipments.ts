import {
  canTransitionShipment,
  cancelShipmentSchema,
  createShipmentSchema,
  manualTrackingSchema,
  quoteShipmentSchema,
  type Actor,
  type SaAddress,
  type Shipment,
  type ShipmentStatus,
} from '@mavundla/shared';
import type { DocData } from '../db/types.js';
import { db } from '../config/firebase.js';
import { AppError } from '../lib/errors.js';
import {
  assertSellerPermission,
  hasPlatformRole,
  requireAuthenticatedUser,
  requirePlatformPermission,
} from '../permissions/helpers.js';
import { getCourierProvider } from '../providers/courier/index.js';
import { writeAuditLog } from './audit.js';
import { attachIdempotencyResource, claimIdempotencyKey } from './idempotency.js';
import { enqueueNotification } from './notifications.js';

function mapShipment(id: string, data: DocData): Shipment {
  return {
    id,
    orderId: String(data.orderId),
    sellerOrderId: String(data.sellerOrderId),
    sellerId: String(data.sellerId),
    customerUid: String(data.customerUid),
    status: data.status,
    serviceCode: String(data.serviceCode),
    parcel: data.parcel,
    rateCents: data.rateCents,
    rateEstimateOnly: Boolean(data.rateEstimateOnly),
    rateExpiresAt: data.rateExpiresAt,
    provider: String(data.provider),
    providerShipmentRef: data.providerShipmentRef,
    trackingNumber: data.trackingNumber,
    labelUrl: data.labelUrl,
    trackingEvents: data.trackingEvents ?? [],
    exceptionCode: data.exceptionCode,
    exceptionNote: data.exceptionNote,
    idempotencyKey: String(data.idempotencyKey),
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

function assertShipmentAccess(actor: Actor, shipment: Shipment): void {
  if (shipment.customerUid === actor.uid) return;
  if (hasPlatformRole(actor, ['super_admin', 'support_agent'])) return;
  if (
    actor.sellerMemberships.some(
      (m) => m.sellerId === shipment.sellerId && m.status === 'active',
    )
  ) {
    return;
  }
  throw new AppError('FORBIDDEN', 'No access to shipment', 403);
}

async function loadSellerOrder(sellerOrderId: string): Promise<{
  id: string;
  orderId: string;
  sellerId: string;
  status: string;
}> {
  const snap = await db().collection('sellerOrders').doc(sellerOrderId).get();
  if (!snap.exists) throw new AppError('NOT_FOUND', 'Seller order not found', 404);
  const data = snap.data()!;
  return {
    id: snap.id,
    orderId: String(data.orderId),
    sellerId: String(data.sellerId),
    status: String(data.status),
  };
}

async function loadOrderAddress(orderId: string): Promise<{
  customerUid: string;
  shippingAddress: SaAddress;
}> {
  const snap = await db().collection('orders').doc(orderId).get();
  if (!snap.exists) throw new AppError('NOT_FOUND', 'Order not found', 404);
  const data = snap.data()!;
  if (data.status !== 'paid') {
    throw new AppError('INVALID_STATE', 'Can only ship paid orders', 409);
  }
  return {
    customerUid: String(data.customerUid),
    shippingAddress: data.shippingAddress as SaAddress,
  };
}

async function sellerPickupAddress(sellerId: string): Promise<SaAddress> {
  const seller = await db().collection('sellers').doc(sellerId).get();
  if (!seller.exists) throw new AppError('NOT_FOUND', 'Seller not found', 404);
  // Use application business address when available
  const appId = String(seller.data()!.applicationId);
  const app = await db().collection('sellerApplications').doc(appId).get();
  if (app.exists && app.data()!.businessAddress) {
    return app.data()!.businessAddress as SaAddress;
  }
  return {
    line1: 'Seller warehouse',
    suburb: 'Sandton',
    city: 'Johannesburg',
    province: 'Gauteng',
    postalCode: '2196',
    country: 'ZA',
  };
}

export async function quoteRates(actor: Actor | undefined, body: unknown) {
  requireAuthenticatedUser(actor);
  const input = quoteShipmentSchema.parse(body);
  const sellerOrder = await loadSellerOrder(input.sellerOrderId);
  assertSellerPermission(actor, String(sellerOrder.sellerId), 'seller:manage_orders');
  const order = await loadOrderAddress(String(sellerOrder.orderId));
  const pickup = await sellerPickupAddress(String(sellerOrder.sellerId));
  const courier = getCourierProvider();
  const quotes = await courier.getRates({
    pickup,
    delivery: order.shippingAddress,
    parcel: input.parcel,
  });
  return {
    quotes,
    note: 'Rates from mock/provider are estimates until a shipment is booked.',
  };
}

export async function createShipment(
  actor: Actor | undefined,
  body: unknown,
): Promise<Shipment> {
  requireAuthenticatedUser(actor);
  const input = createShipmentSchema.parse(body);
  const sellerOrder = await loadSellerOrder(input.sellerOrderId);
  assertSellerPermission(actor, String(sellerOrder.sellerId), 'seller:manage_orders');
  if (sellerOrder.status !== 'confirmed') {
    throw new AppError('INVALID_STATE', 'Seller order must be confirmed before shipping', 409);
  }

  const claim = await claimIdempotencyKey(input.idempotencyKey, 'shipment', actor.uid);
  if (claim.alreadyExists && claim.existingResourceId) {
    const existing = await db().collection('shipments').doc(claim.existingResourceId).get();
    if (existing.exists) return mapShipment(existing.id, existing.data()!);
  }

  const order = await loadOrderAddress(String(sellerOrder.orderId));
  const pickup = await sellerPickupAddress(String(sellerOrder.sellerId));
  const courier = getCourierProvider();
  const quotes = await courier.getRates({
    pickup,
    delivery: order.shippingAddress,
    parcel: input.parcel,
    serviceCodes: [input.serviceCode],
  });
  const quote = quotes.find((q) => q.serviceCode === input.serviceCode) ?? quotes[0];
  if (!quote) throw new AppError('NO_RATES', 'No courier rates available', 400);

  const now = new Date().toISOString();
  const ref = db().collection('shipments').doc();

  const booked = await courier.createShipment({
    shipmentId: ref.id,
    pickup,
    delivery: order.shippingAddress,
    parcel: input.parcel,
    serviceCode: input.serviceCode,
    reference: sellerOrder.id,
  });

  const doc = {
    orderId: String(sellerOrder.orderId),
    sellerOrderId: sellerOrder.id,
    sellerId: String(sellerOrder.sellerId),
    customerUid: order.customerUid,
    status: 'booked' as ShipmentStatus,
    serviceCode: input.serviceCode,
    parcel: input.parcel,
    rateCents: booked.amountCents,
    rateEstimateOnly: booked.estimateOnly,
    rateExpiresAt: quote.expiresAt,
    provider: courier.name,
    providerShipmentRef: booked.providerShipmentRef,
    trackingNumber: booked.trackingNumber,
    labelUrl: booked.labelUrl,
    trackingEvents: [
      {
        status: 'booked',
        description: 'Shipment booked',
        at: now,
        source: 'provider' as const,
      },
    ],
    idempotencyKey: input.idempotencyKey,
    createdAt: now,
    updatedAt: now,
  };
  await ref.set(doc);
  await attachIdempotencyResource(input.idempotencyKey, 'shipment', ref.id);
  await writeAuditLog({
    actorUid: actor.uid,
    action: 'shipment.booked',
    resourceType: 'shipments',
    resourceId: ref.id,
    metadata: { trackingNumber: booked.trackingNumber, estimateOnly: booked.estimateOnly },
  });

  await enqueueNotification({
    template: 'shipment_update',
    toUid: order.customerUid,
    vars: {
      orderId: String(sellerOrder.orderId),
      trackingNumber: booked.trackingNumber,
      status: 'booked',
      summary: `Shipment booked for order ${sellerOrder.orderId}`,
    },
    dedupeKey: `shipment_booked_${ref.id}`,
  }).catch(() => undefined);

  return mapShipment(ref.id, doc);
}

export async function getShipment(actor: Actor | undefined, shipmentId: string): Promise<Shipment> {
  requireAuthenticatedUser(actor);
  const snap = await db().collection('shipments').doc(shipmentId).get();
  if (!snap.exists) throw new AppError('NOT_FOUND', 'Shipment not found', 404);
  const shipment = mapShipment(snap.id, snap.data()!);
  assertShipmentAccess(actor, shipment);
  return shipment;
}

export async function listShipmentsForSellerOrder(
  actor: Actor | undefined,
  sellerOrderId: string,
): Promise<Shipment[]> {
  requireAuthenticatedUser(actor);
  const sellerOrder = await loadSellerOrder(sellerOrderId);
  assertSellerPermission(actor, String(sellerOrder.sellerId), 'seller:manage_orders');
  const snap = await db()
    .collection('shipments')
    .where('sellerOrderId', '==', sellerOrderId)
    .orderBy('createdAt', 'desc')
    .limit(20)
    .get();
  return snap.docs.map((d) => mapShipment(d.id, d.data()));
}

export async function listShipmentsForOrder(
  actor: Actor | undefined,
  orderId: string,
): Promise<Shipment[]> {
  requireAuthenticatedUser(actor);
  const orderSnap = await db().collection('orders').doc(orderId).get();
  if (!orderSnap.exists) throw new AppError('NOT_FOUND', 'Order not found', 404);
  const order = orderSnap.data()!;
  if (
    order.customerUid !== actor.uid &&
    !hasPlatformRole(actor, ['super_admin', 'support_agent'])
  ) {
    throw new AppError('FORBIDDEN', 'No access to order shipments', 403);
  }
  const snap = await db().collection('shipments').where('orderId', '==', orderId).get();
  return snap.docs.map((d) => mapShipment(d.id, d.data()));
}

export async function refreshTracking(
  actor: Actor | undefined,
  shipmentId: string,
): Promise<Shipment> {
  requireAuthenticatedUser(actor);
  const snap = await db().collection('shipments').doc(shipmentId).get();
  if (!snap.exists) throw new AppError('NOT_FOUND', 'Shipment not found', 404);
  const shipment = mapShipment(snap.id, snap.data()!);
  assertShipmentAccess(actor, shipment);
  if (!shipment.providerShipmentRef) {
    throw new AppError('PROVIDER_REF_MISSING', 'Shipment has no provider reference', 400);
  }

  const courier = getCourierProvider();
  const tracking = await courier.getTracking(shipment.providerShipmentRef);
  const now = new Date().toISOString();
  const mappedStatus = mapProviderStatus(tracking.status);
  const events = tracking.events.map((e) => ({
    status: e.status,
    description: e.description,
    at: e.at,
    source: 'provider' as const,
  }));

  await snap.ref.update({
    status: mappedStatus,
    trackingNumber: tracking.trackingNumber,
    trackingEvents: events,
    updatedAt: now,
  });

  await enqueueNotification({
    template: 'delivery_update',
    toUid: shipment.customerUid,
    vars: {
      orderId: shipment.orderId,
      trackingNumber: tracking.trackingNumber,
      status: mappedStatus,
      summary: `Delivery status: ${mappedStatus}`,
    },
    dedupeKey: `shipment_track_${shipmentId}_${mappedStatus}_${events.length}`,
  }).catch(() => undefined);

  const updated = await snap.ref.get();
  return mapShipment(updated.id, updated.data()!);
}

function mapProviderStatus(status: string): ShipmentStatus {
  const allowed = new Set([
    'booked',
    'in_transit',
    'out_for_delivery',
    'delivered',
    'failed_attempt',
    'exception',
    'cancelled',
    'returned_to_sender',
  ]);
  if (allowed.has(status)) return status as ShipmentStatus;
  return 'in_transit';
}

export async function applyCourierWebhook(event: {
  eventId: string;
  providerShipmentRef: string;
  trackingNumber?: string;
  status: string;
  description: string;
  at: string;
}): Promise<{ duplicate: boolean; shipmentId?: string }> {
  const eventRef = db().collection('webhookEvents').doc(`courier_${event.eventId}`);
  if ((await eventRef.get()).exists) {
    return { duplicate: true };
  }

  const query = await db()
    .collection('shipments')
    .where('providerShipmentRef', '==', event.providerShipmentRef)
    .limit(1)
    .get();
  if (query.empty) {
    throw new AppError('SHIPMENT_NOT_FOUND', 'No shipment for provider reference', 404);
  }
  const doc = query.docs[0]!;
  const data = doc.data();
  const mapped = mapProviderStatus(event.status);
  const now = new Date().toISOString();
  const events = [
    ...(data.trackingEvents ?? []),
    {
      status: event.status,
      description: event.description,
      at: event.at,
      source: 'webhook',
    },
  ];

  await db().runTransaction(async (tx) => {
    const freshEvent = await tx.get(eventRef);
    if (freshEvent.exists) return;
    tx.set(eventRef, {
      provider: 'courier',
      eventId: event.eventId,
      shipmentId: doc.id,
      status: event.status,
      processedAt: now,
    });
    tx.update(doc.ref, {
      status: mapped,
      trackingNumber: event.trackingNumber ?? data.trackingNumber,
      trackingEvents: events,
      updatedAt: now,
      ...(mapped === 'exception'
        ? { exceptionCode: event.status, exceptionNote: event.description }
        : {}),
    });
  });

  await enqueueNotification({
    template: 'shipment_update',
    toUid: String(data.customerUid),
    vars: {
      orderId: String(data.orderId),
      trackingNumber: String(event.trackingNumber ?? data.trackingNumber ?? ''),
      status: mapped,
      summary: event.description,
    },
    dedupeKey: `courier_wh_${event.eventId}`,
  }).catch(() => undefined);

  return { duplicate: false, shipmentId: doc.id };
}

export async function cancelShipment(actor: Actor | undefined, body: unknown): Promise<Shipment> {
  requireAuthenticatedUser(actor);
  const input = cancelShipmentSchema.parse(body);
  const snap = await db().collection('shipments').doc(input.shipmentId).get();
  if (!snap.exists) throw new AppError('NOT_FOUND', 'Shipment not found', 404);
  const shipment = mapShipment(snap.id, snap.data()!);
  assertSellerPermission(actor, shipment.sellerId, 'seller:manage_orders');

  if (!canTransitionShipment(shipment.status, 'cancelled')) {
    throw new AppError('INVALID_STATE', 'Shipment cannot be cancelled', 409);
  }
  if (shipment.providerShipmentRef) {
    const courier = getCourierProvider();
    await courier.cancelShipment(shipment.providerShipmentRef, input.reason);
  }
  const now = new Date().toISOString();
  await snap.ref.update({
    status: 'cancelled',
    updatedAt: now,
    trackingEvents: [
      ...shipment.trackingEvents,
      {
        status: 'cancelled',
        description: input.reason ?? 'Cancelled by seller',
        at: now,
        source: 'manual',
      },
    ],
  });
  const updated = await snap.ref.get();
  return mapShipment(updated.id, updated.data()!);
}

/** Manual tracking fallback when provider webhooks are unavailable. */
export async function applyManualTracking(
  actor: Actor | undefined,
  body: unknown,
): Promise<Shipment> {
  requireAuthenticatedUser(actor);
  const input = manualTrackingSchema.parse(body);
  const snap = await db().collection('shipments').doc(input.shipmentId).get();
  if (!snap.exists) throw new AppError('NOT_FOUND', 'Shipment not found', 404);
  const shipment = mapShipment(snap.id, snap.data()!);

  if (
    !hasPlatformRole(actor, ['super_admin', 'support_agent']) &&
    !actor.sellerMemberships.some(
      (m) => m.sellerId === shipment.sellerId && m.status === 'active',
    )
  ) {
    throw new AppError('FORBIDDEN', 'Cannot update tracking', 403);
  }

  if (!canTransitionShipment(shipment.status, input.status as ShipmentStatus)) {
    // allow same-status note append for exceptions
    if (shipment.status !== input.status) {
      throw new AppError('INVALID_STATE', 'Invalid shipment status transition', 409);
    }
  }

  const now = new Date().toISOString();
  await snap.ref.update({
    status: input.status,
    trackingNumber: input.trackingNumber ?? shipment.trackingNumber,
    updatedAt: now,
    ...(input.status === 'exception'
      ? { exceptionCode: 'manual', exceptionNote: input.note }
      : {}),
    trackingEvents: [
      ...shipment.trackingEvents,
      {
        status: input.status,
        description: input.note ?? `Manual update: ${input.status}`,
        at: now,
        source: 'manual',
      },
    ],
  });

  await writeAuditLog({
    actorUid: actor.uid,
    action: 'shipment.manual_tracking',
    resourceType: 'shipments',
    resourceId: shipment.id,
    metadata: { status: input.status },
  });

  const updated = await snap.ref.get();
  return mapShipment(updated.id, updated.data()!);
}

export async function listExceptionShipments(actor: Actor | undefined): Promise<Shipment[]> {
  requirePlatformPermission(actor, ['super_admin', 'support_agent']);
  const snap = await db()
    .collection('shipments')
    .where('status', 'in', ['exception', 'failed_attempt'])
    .limit(50)
    .get();
  return snap.docs.map((d) => mapShipment(d.id, d.data()));
}
