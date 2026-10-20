import {
  allocateDeliveryBySeller,
  canTransitionOrder,
  canTransitionPayment,
  checkoutSchema,
  priceOrderLine,
  resolveUnitPriceCents,
  sumLineSubtotals,
  type Actor,
  type CartItem,
  type Order,
  type OrderLineSnapshot,
  type PaymentAttempt,
} from '@mavundla/shared';
import { db } from '../config/firebase.js';
import { assertSellerAllowedInPilot } from '../config/pilot.js';
import { getRuntimeEnv } from '../config/runtime.js';
import { AppError } from '../lib/errors.js';
import { requireAuthenticatedUser } from '../permissions/helpers.js';
import { getPaymentProvider } from '../providers/payment/index.js';
import { writeAuditLog } from './audit.js';
import { clearCart, getCart } from './cart.js';
import { attachIdempotencyResource, claimIdempotencyKey } from './idempotency.js';
import { postSaleLedgerForOrder } from './ledger.js';
import { enqueueNotification } from './notifications.js';

const RESERVATION_TTL_MS = 15 * 60 * 1000;

interface CommissionPlan {
  id: string;
  percentageBps: number;
  version: number;
}

async function loadCommissionPlan(planId: string): Promise<CommissionPlan> {
  const snap = await db().collection('commissionPlans').doc(planId).get();
  if (!snap.exists) {
    throw new AppError('COMMISSION_PLAN_MISSING', 'Commission plan not found', 500);
  }
  const data = snap.data()!;
  return {
    id: snap.id,
    percentageBps: Number(data.percentageBps ?? 1000),
    version: Number(data.version ?? 1),
  };
}

async function buildPricedLines(items: CartItem[]): Promise<OrderLineSnapshot[]> {
  const lines: OrderLineSnapshot[] = [];

  for (const item of items) {
    const productSnap = await db().collection('products').doc(item.productId).get();
    if (!productSnap.exists) {
      throw new AppError('PRODUCT_INELIGIBLE', `Product ${item.productId} not found`, 400);
    }
    const product = productSnap.data()!;
    if (product.status !== 'active') {
      throw new AppError('PRODUCT_INELIGIBLE', `Product ${item.productId} is not active`, 400);
    }
    if (String(product.sellerId) !== item.sellerId) {
      throw new AppError('SELLER_MISMATCH', 'Cart seller does not match product', 400);
    }

    const sellerSnap = await db().collection('sellers').doc(item.sellerId).get();
    if (!sellerSnap.exists || sellerSnap.data()!.status !== 'active') {
      throw new AppError('SELLER_INELIGIBLE', `Seller ${item.sellerId} is not eligible`, 400);
    }
    assertSellerAllowedInPilot(getRuntimeEnv(), item.sellerId);

    const variant = (
      product.variants as Array<{
        sku: string;
        priceCents: number;
        promotionalPriceCents?: number;
      }>
    ).find((v) => v.sku === item.sku);
    if (!variant) {
      throw new AppError('SKU_NOT_FOUND', `SKU ${item.sku} not found`, 400);
    }

    const plan = await loadCommissionPlan(String(sellerSnap.data()!.commissionPlanId));
    const unitPriceCents = resolveUnitPriceCents(variant.priceCents, variant.promotionalPriceCents);
    lines.push(
      priceOrderLine({
        productId: item.productId,
        sellerId: item.sellerId,
        sku: item.sku,
        title: String(product.title),
        quantity: item.quantity,
        unitPriceCents,
        taxClassification: String(product.taxClassification ?? 'standard'),
        commissionPlanId: plan.id,
        commissionPercentageBps: plan.percentageBps,
        commissionPlanVersion: plan.version,
      }),
    );
  }

  return lines;
}

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

function mapPayment(id: string, data: FirebaseFirestore.DocumentData): PaymentAttempt {
  return {
    id,
    orderId: String(data.orderId),
    provider: 'mock',
    providerRef: String(data.providerRef ?? ''),
    amountCents: Number(data.amountCents),
    currency: 'ZAR',
    status: data.status,
    idempotencyKey: String(data.idempotencyKey),
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

export async function previewCheckout(actor: Actor | undefined): Promise<{
  lines: OrderLineSnapshot[];
  subtotalCents: number;
  deliveryCents: number;
  totalCents: number;
  deliveryQuotes: ReturnType<typeof allocateDeliveryBySeller>['quotes'];
}> {
  requireAuthenticatedUser(actor);
  const cart = await getCart(actor);
  if (cart.items.length === 0) {
    throw new AppError('CART_EMPTY', 'Cart is empty', 400);
  }
  const lines = await buildPricedLines(cart.items);
  const { quotes, deliveryTotalCents } = allocateDeliveryBySeller(lines);
  const subtotalCents = sumLineSubtotals(lines);
  return {
    lines,
    subtotalCents,
    deliveryCents: deliveryTotalCents,
    totalCents: subtotalCents + deliveryTotalCents,
    deliveryQuotes: quotes,
  };
}

export async function startCheckout(
  actor: Actor | undefined,
  body: unknown,
  webBaseUrl: string,
): Promise<{ order: Order; payment: PaymentAttempt; checkoutUrl: string }> {
  requireAuthenticatedUser(actor);
  const input = checkoutSchema.parse(body);

  const claim = await claimIdempotencyKey(input.idempotencyKey, 'checkout', actor.uid);
  if (claim.alreadyExists && claim.existingResourceId) {
    const existingOrder = await db().collection('orders').doc(claim.existingResourceId).get();
    if (existingOrder.exists) {
      const order = mapOrder(existingOrder.id, existingOrder.data()!);
      if (!order.paymentId) {
        throw new AppError('PAYMENT_MISSING', 'Existing checkout has no payment', 500);
      }
      const paymentSnap = await db().collection('payments').doc(order.paymentId).get();
      const payment = mapPayment(paymentSnap.id, paymentSnap.data()!);
      return {
        order,
        payment,
        checkoutUrl: `${webBaseUrl}/mock-pay?providerRef=${encodeURIComponent(payment.providerRef)}&amountCents=${payment.amountCents}`,
      };
    }
  }

  const cart = await getCart(actor);
  if (cart.items.length === 0) {
    throw new AppError('CART_EMPTY', 'Cart is empty', 400);
  }

  const lines = await buildPricedLines(cart.items);
  const { quotes, deliveryTotalCents } = allocateDeliveryBySeller(lines);
  const subtotalCents = sumLineSubtotals(lines);
  const totalCents = subtotalCents + deliveryTotalCents;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + RESERVATION_TTL_MS).toISOString();
  const nowIso = now.toISOString();

  const orderRef = db().collection('orders').doc();
  const paymentRef = db().collection('payments').doc();
  const reservationRefs = lines.map(() => db().collection('reservations').doc());
  const sellerOrderRefs = [...new Set(lines.map((l) => l.sellerId))].map((sellerId) => ({
    sellerId,
    ref: db().collection('sellerOrders').doc(),
  }));

  await db().runTransaction(async (tx) => {
    // Reads first
    const invSnaps = await Promise.all(
      lines.map((line) => tx.get(db().collection('inventory').doc(`${line.productId}_${line.sku}`))),
    );

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const invSnap = invSnaps[i]!;
      if (!invSnap.exists) {
        throw new AppError('INVENTORY_NOT_FOUND', `Missing inventory for ${line.sku}`, 404);
      }
      const inv = invSnap.data()!;
      const available = Number(inv.quantityOnHand) - Number(inv.quantityReserved);
      if (line.quantity > available) {
        throw new AppError('INSUFFICIENT_STOCK', `Insufficient stock for ${line.sku}`, 409, {
          available,
          sku: line.sku,
        });
      }
    }

    // Writes
    const reservationIds: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const invSnap = invSnaps[i]!;
      const inv = invSnap.data()!;
      const inventoryId = `${line.productId}_${line.sku}`;
      tx.update(invSnap.ref, {
        quantityReserved: Number(inv.quantityReserved) + line.quantity,
        updatedAt: nowIso,
      });
      const reservationRef = reservationRefs[i]!;
      reservationIds.push(reservationRef.id);
      tx.set(reservationRef, {
        orderId: orderRef.id,
        inventoryId,
        productId: line.productId,
        sellerId: line.sellerId,
        sku: line.sku,
        quantity: line.quantity,
        status: 'active',
        expiresAt,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    }

    tx.set(orderRef, {
      customerUid: actor.uid,
      status: 'pending_payment',
      currency: 'ZAR',
      subtotalCents,
      deliveryCents: deliveryTotalCents,
      totalCents,
      shippingAddress: input.shippingAddress,
      lines,
      deliveryQuotes: quotes,
      paymentId: paymentRef.id,
      reservationIds,
      sellerOrderIds: sellerOrderRefs.map((s) => s.ref.id),
      idempotencyKey: input.idempotencyKey,
      createdAt: nowIso,
      updatedAt: nowIso,
    });

    for (const { sellerId, ref } of sellerOrderRefs) {
      const sellerLines = lines.filter((l) => l.sellerId === sellerId);
      tx.set(ref, {
        orderId: orderRef.id,
        sellerId,
        status: 'awaiting_payment',
        lines: sellerLines,
        subtotalCents: sumLineSubtotals(sellerLines),
        deliveryCents: quotes.find((q) => q.sellerId === sellerId)?.deliveryCents ?? 0,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    }

    tx.set(paymentRef, {
      orderId: orderRef.id,
      provider: 'mock',
      providerRef: '',
      amountCents: totalCents,
      currency: 'ZAR',
      status: 'created',
      idempotencyKey: input.idempotencyKey,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  });

  const provider = getPaymentProvider(webBaseUrl);
  const init = await provider.initialiseCheckout({
    paymentId: paymentRef.id,
    orderId: orderRef.id,
    amountCents: totalCents,
    currency: 'ZAR',
    customerEmail: actor.email,
    returnUrl: `${webBaseUrl}/orders/${orderRef.id}?payment=return`,
    cancelUrl: `${webBaseUrl}/checkout?payment=cancelled`,
  });

  await paymentRef.update({
    providerRef: init.providerRef,
    status: 'pending',
    updatedAt: new Date().toISOString(),
  });

  await attachIdempotencyResource(input.idempotencyKey, 'checkout', orderRef.id);
  await writeAuditLog({
    actorUid: actor.uid,
    action: 'checkout.started',
    resourceType: 'orders',
    resourceId: orderRef.id,
    metadata: { paymentId: paymentRef.id, totalCents },
  });

  const orderSnap = await orderRef.get();
  const paymentSnap = await paymentRef.get();

  return {
    order: mapOrder(orderRef.id, orderSnap.data()!),
    payment: mapPayment(paymentRef.id, paymentSnap.data()!),
    checkoutUrl: init.checkoutUrl,
  };
}

export async function processVerifiedPaymentOutcome(input: {
  providerRef: string;
  status: 'succeeded' | 'failed' | 'cancelled' | 'pending';
  amountCents: number;
  currency: 'ZAR';
  eventId: string;
}): Promise<{ order: Order; payment: PaymentAttempt; duplicate: boolean }> {
  const eventRef = db().collection('webhookEvents').doc(`mock_${input.eventId}`);
  const existingEvent = await eventRef.get();
  if (existingEvent.exists) {
    const paymentId = String(existingEvent.data()!.paymentId);
    const paymentSnap = await db().collection('payments').doc(paymentId).get();
    const orderSnap = await db().collection('orders').doc(String(paymentSnap.data()!.orderId)).get();
    return {
      order: mapOrder(orderSnap.id, orderSnap.data()!),
      payment: mapPayment(paymentSnap.id, paymentSnap.data()!),
      duplicate: true,
    };
  }

  const paymentQuery = await db()
    .collection('payments')
    .where('providerRef', '==', input.providerRef)
    .limit(1)
    .get();
  if (paymentQuery.empty) {
    throw new AppError('PAYMENT_NOT_FOUND', 'No payment for provider reference', 404);
  }
  const paymentDoc = paymentQuery.docs[0]!;
  const paymentData = paymentDoc.data();

  if (Number(paymentData.amountCents) !== input.amountCents || paymentData.currency !== input.currency) {
    throw new AppError('AMOUNT_MISMATCH', 'Payment amount/currency mismatch', 400);
  }

  if (input.status === 'pending') {
    await eventRef.set({
      provider: 'mock',
      eventId: input.eventId,
      paymentId: paymentDoc.id,
      status: input.status,
      processedAt: new Date().toISOString(),
      ignored: true,
    });
    const orderSnap = await db().collection('orders').doc(String(paymentData.orderId)).get();
    return {
      order: mapOrder(orderSnap.id, orderSnap.data()!),
      payment: mapPayment(paymentDoc.id, paymentData),
      duplicate: false,
    };
  }

  const orderRef = db().collection('orders').doc(String(paymentData.orderId));
  const nowIso = new Date().toISOString();
  let customerUid = '';

  await db().runTransaction(async (tx) => {
    const orderSnap = await tx.get(orderRef);
    const paySnap = await tx.get(paymentDoc.ref);
    const eventSnap = await tx.get(eventRef);
    if (!orderSnap.exists || !paySnap.exists) {
      throw new AppError('NOT_FOUND', 'Order or payment missing', 404);
    }
    if (eventSnap.exists) return;

    const order = orderSnap.data()!;
    const payment = paySnap.data()!;
    customerUid = String(order.customerUid);
    const reservationIds = (order.reservationIds as string[]) ?? [];
    const sellerOrderIds = (order.sellerOrderIds as string[]) ?? [];

    const reservationSnaps = await Promise.all(
      reservationIds.map((id) => tx.get(db().collection('reservations').doc(id))),
    );
    const inventorySnaps = await Promise.all(
      reservationSnaps.map((snap) => {
        if (!snap.exists) return Promise.resolve(null);
        return tx.get(db().collection('inventory').doc(String(snap.data()!.inventoryId)));
      }),
    );
    const sellerOrderSnaps = await Promise.all(
      sellerOrderIds.map((id) => tx.get(db().collection('sellerOrders').doc(id))),
    );

    // Writes after all reads
    tx.set(eventRef, {
      provider: 'mock',
      eventId: input.eventId,
      paymentId: paymentDoc.id,
      status: input.status,
      processedAt: nowIso,
    });

    if (input.status === 'succeeded') {
      if (payment.status === 'succeeded' && order.status === 'paid') return;

      if (!canTransitionPayment(payment.status, 'succeeded')) {
        throw new AppError('INVALID_STATE', 'Payment cannot transition to succeeded', 409);
      }
      if (!canTransitionOrder(order.status, 'paid')) {
        throw new AppError('INVALID_STATE', 'Order cannot transition to paid', 409);
      }

      tx.update(paymentDoc.ref, { status: 'succeeded', updatedAt: nowIso });
      tx.update(orderRef, { status: 'paid', paidAt: nowIso, updatedAt: nowIso });

      for (let i = 0; i < reservationSnaps.length; i++) {
        const resSnap = reservationSnaps[i]!;
        const invSnap = inventorySnaps[i];
        if (!resSnap.exists || resSnap.data()!.status !== 'active' || !invSnap?.exists) continue;
        const res = resSnap.data()!;
        const inv = invSnap.data()!;
        tx.update(invSnap.ref, {
          quantityOnHand: Number(inv.quantityOnHand) - Number(res.quantity),
          quantityReserved: Number(inv.quantityReserved) - Number(res.quantity),
          updatedAt: nowIso,
        });
        tx.update(resSnap.ref, { status: 'consumed', updatedAt: nowIso });
      }

      for (const so of sellerOrderSnaps) {
        if (so.exists) {
          tx.update(so.ref, { status: 'confirmed', updatedAt: nowIso });
        }
      }
    } else {
      const targetPayment = input.status === 'failed' ? 'failed' : 'cancelled';
      const targetOrder = input.status === 'failed' ? 'payment_failed' : 'cancelled';
      if (payment.status === 'succeeded') {
        throw new AppError('INVALID_STATE', 'Cannot fail a succeeded payment', 409);
      }
      if (canTransitionPayment(payment.status, targetPayment)) {
        tx.update(paymentDoc.ref, { status: targetPayment, updatedAt: nowIso });
      }
      if (canTransitionOrder(order.status, targetOrder)) {
        tx.update(orderRef, { status: targetOrder, updatedAt: nowIso });
      }
      for (let i = 0; i < reservationSnaps.length; i++) {
        const resSnap = reservationSnaps[i]!;
        const invSnap = inventorySnaps[i];
        if (!resSnap.exists || resSnap.data()!.status !== 'active' || !invSnap?.exists) continue;
        const res = resSnap.data()!;
        const inv = invSnap.data()!;
        tx.update(invSnap.ref, {
          quantityReserved: Math.max(0, Number(inv.quantityReserved) - Number(res.quantity)),
          updatedAt: nowIso,
        });
        tx.update(resSnap.ref, { status: 'released', updatedAt: nowIso });
      }
      for (const so of sellerOrderSnaps) {
        if (so.exists) {
          tx.update(so.ref, { status: 'cancelled', updatedAt: nowIso });
        }
      }
    }
  });

  if (input.status === 'succeeded' && customerUid) {
    await clearCart({
      uid: customerUid,
      email: '',
      displayName: '',
      platformRoles: [],
      status: 'active',
      sellerMemberships: [],
    });

    const paidOrder = await orderRef.get();
    if (paidOrder.exists && paidOrder.data()!.status === 'paid') {
      await postSaleLedgerForOrder({
        orderId: orderRef.id,
        paymentId: paymentDoc.id,
        lines: paidOrder.data()!.lines ?? [],
        deliveryQuotes: paidOrder.data()!.deliveryQuotes ?? [],
        actorUid: customerUid,
      });
      await enqueueNotification({
        template: 'order_confirmation',
        toUid: customerUid,
        vars: {
          orderId: orderRef.id,
          summary: `Order ${orderRef.id} paid`,
        },
        dedupeKey: `order_paid_${orderRef.id}`,
      }).catch(() => undefined);
    }
  }

  const paymentSnap = await paymentDoc.ref.get();
  const orderSnap = await orderRef.get();
  return {
    order: mapOrder(orderRef.id, orderSnap.data()!),
    payment: mapPayment(paymentSnap.id, paymentSnap.data()!),
    duplicate: false,
  };
}

export async function expireReservations(limit = 50): Promise<{ expired: number }> {
  const nowIso = new Date().toISOString();
  const snap = await db()
    .collection('reservations')
    .where('status', '==', 'active')
    .where('expiresAt', '<=', nowIso)
    .limit(limit)
    .get();

  let expired = 0;
  for (const doc of snap.docs) {
    await db().runTransaction(async (tx) => {
      const fresh = await tx.get(doc.ref);
      if (!fresh.exists || fresh.data()!.status !== 'active') return;
      const data = fresh.data()!;
      const invRef = db().collection('inventory').doc(String(data.inventoryId));
      const invSnap = await tx.get(invRef);
      const orderRef = db().collection('orders').doc(String(data.orderId));
      const orderSnap = await tx.get(orderRef);
      let paySnap: FirebaseFirestore.DocumentSnapshot | null = null;
      if (orderSnap.exists && orderSnap.data()!.paymentId) {
        paySnap = await tx.get(db().collection('payments').doc(String(orderSnap.data()!.paymentId)));
      }

      if (invSnap.exists) {
        tx.update(invRef, {
          quantityReserved: Math.max(
            0,
            Number(invSnap.data()!.quantityReserved) - Number(data.quantity),
          ),
          updatedAt: nowIso,
        });
      }
      tx.update(doc.ref, { status: 'expired', updatedAt: nowIso });

      if (orderSnap.exists && orderSnap.data()!.status === 'pending_payment') {
        tx.update(orderRef, { status: 'expired', updatedAt: nowIso });
        if (paySnap?.exists && ['created', 'pending'].includes(paySnap.data()!.status)) {
          tx.update(paySnap.ref, { status: 'cancelled', updatedAt: nowIso });
        }
      }
    });
    expired += 1;
  }

  return { expired };
}
