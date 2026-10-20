import type { Actor, Order, SellerOrder } from '@mavundla/shared';
import { db } from '../config/firebase.js';
import { AppError } from '../lib/errors.js';
import {
  assertOrderAccess,
  assertSellerPermission,
  hasPlatformRole,
  requireAuthenticatedUser,
} from '../permissions/helpers.js';

function mapOrder(id: string, data: FirebaseFirestore.DocumentData): Order {
  return {
    id,
    customerUid: String(data.customerUid),
    status: data.status,
    currency: 'ZAR',
    subtotalCents: Number(data.subtotalCents),
    deliveryCents: Number(data.deliveryCents),
    totalCents: Number(data.totalCents),
    shippingAddress: data.shippingAddress,
    lines: data.lines ?? [],
    deliveryQuotes: data.deliveryQuotes ?? [],
    paymentId: data.paymentId,
    reservationIds: data.reservationIds ?? [],
    idempotencyKey: String(data.idempotencyKey),
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    paidAt: data.paidAt,
  };
}

function mapSellerOrder(id: string, data: FirebaseFirestore.DocumentData): SellerOrder {
  return {
    id,
    orderId: String(data.orderId),
    sellerId: String(data.sellerId),
    status: data.status,
    lines: data.lines ?? [],
    subtotalCents: Number(data.subtotalCents),
    deliveryCents: Number(data.deliveryCents),
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

export async function getOrderDocument(orderId: string): Promise<Order> {
  const snap = await db().collection('orders').doc(orderId).get();
  if (!snap.exists) throw new AppError('NOT_FOUND', 'Order not found', 404);
  return mapOrder(snap.id, snap.data()!);
}

export async function listMyOrders(actor: Actor | undefined): Promise<Order[]> {
  requireAuthenticatedUser(actor);
  const snap = await db()
    .collection('orders')
    .where('customerUid', '==', actor.uid)
    .orderBy('createdAt', 'desc')
    .limit(50)
    .get();
  return snap.docs.map((d) => mapOrder(d.id, d.data()));
}

export async function getOrderForActor(actor: Actor | undefined, orderId: string): Promise<Order> {
  const order = await getOrderDocument(orderId);
  assertOrderAccess(actor, order);
  return order;
}

export async function listSellerOrders(
  actor: Actor | undefined,
  sellerId: string,
): Promise<SellerOrder[]> {
  requireAuthenticatedUser(actor);
  assertSellerPermission(actor, sellerId, 'seller:manage_orders');
  const snap = await db()
    .collection('sellerOrders')
    .where('sellerId', '==', sellerId)
    .orderBy('createdAt', 'desc')
    .limit(50)
    .get();
  return snap.docs.map((d) => mapSellerOrder(d.id, d.data()));
}

export async function getSellerOrderForActor(
  actor: Actor | undefined,
  sellerOrderId: string,
): Promise<SellerOrder> {
  requireAuthenticatedUser(actor);
  const snap = await db().collection('sellerOrders').doc(sellerOrderId).get();
  if (!snap.exists) throw new AppError('NOT_FOUND', 'Seller order not found', 404);
  const data = snap.data()!;
  if (
    !hasPlatformRole(actor, ['super_admin', 'support_agent']) &&
    !actor.sellerMemberships.some(
      (m) => m.sellerId === data.sellerId && m.status === 'active',
    )
  ) {
    throw new AppError('FORBIDDEN', 'No access to seller order', 403);
  }
  return mapSellerOrder(snap.id, data);
}
