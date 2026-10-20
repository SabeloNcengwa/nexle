export const ORDER_STATUSES = [
  'pending_payment',
  'paid',
  'payment_failed',
  'cancelled',
  'expired',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const SELLER_ORDER_STATUSES = [
  'awaiting_payment',
  'confirmed',
  'cancelled',
] as const;

export type SellerOrderStatus = (typeof SELLER_ORDER_STATUSES)[number];

export const PAYMENT_STATUSES = [
  'created',
  'pending',
  'succeeded',
  'failed',
  'cancelled',
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const RESERVATION_STATUSES = ['active', 'consumed', 'released', 'expired'] as const;

export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending_payment: ['paid', 'payment_failed', 'cancelled', 'expired'],
  paid: [],
  payment_failed: ['cancelled'],
  cancelled: [],
  expired: [],
};

const PAYMENT_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  created: ['pending', 'cancelled'],
  pending: ['succeeded', 'failed', 'cancelled'],
  succeeded: [],
  failed: [],
  cancelled: [],
};

const RESERVATION_TRANSITIONS: Record<ReservationStatus, ReservationStatus[]> = {
  active: ['consumed', 'released', 'expired'],
  consumed: [],
  released: [],
  expired: [],
};

export function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

export function canTransitionPayment(from: PaymentStatus, to: PaymentStatus): boolean {
  return PAYMENT_TRANSITIONS[from].includes(to);
}

export function canTransitionReservation(
  from: ReservationStatus,
  to: ReservationStatus,
): boolean {
  return RESERVATION_TRANSITIONS[from].includes(to);
}
