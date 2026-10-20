/** Fulfilment, returns and notification domain helpers. */

export const SHIPMENT_STATUSES = [
  'draft',
  'rate_quoted',
  'booked',
  'in_transit',
  'out_for_delivery',
  'delivered',
  'failed_attempt',
  'exception',
  'cancelled',
  'returned_to_sender',
] as const;

export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export const RETURN_STATUSES = [
  'requested',
  'approved',
  'rejected',
  'label_created',
  'in_transit',
  'received',
  'inspected',
  'refund_pending',
  'completed',
  'cancelled',
] as const;

export type ReturnStatus = (typeof RETURN_STATUSES)[number];

export const NOTIFICATION_TEMPLATES = [
  'account_verification',
  'seller_application_update',
  'listing_moderation',
  'order_confirmation',
  'shipment_update',
  'delivery_update',
  'return_update',
  'refund_update',
  'payout_status',
  'support_update',
] as const;

export type NotificationTemplate = (typeof NOTIFICATION_TEMPLATES)[number];

export const NOTIFICATION_CHANNELS = ['email', 'sms', 'in_app'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_STATUSES = ['pending', 'sent', 'failed', 'dead_letter'] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

const SHIPMENT_TRANSITIONS: Record<ShipmentStatus, ShipmentStatus[]> = {
  draft: ['rate_quoted', 'cancelled'],
  rate_quoted: ['booked', 'cancelled', 'draft'],
  booked: ['in_transit', 'cancelled', 'exception'],
  in_transit: ['out_for_delivery', 'delivered', 'failed_attempt', 'exception', 'returned_to_sender'],
  out_for_delivery: ['delivered', 'failed_attempt', 'exception'],
  delivered: [],
  failed_attempt: ['out_for_delivery', 'exception', 'returned_to_sender'],
  exception: ['in_transit', 'returned_to_sender', 'cancelled'],
  cancelled: [],
  returned_to_sender: [],
};

const RETURN_TRANSITIONS: Record<ReturnStatus, ReturnStatus[]> = {
  requested: ['approved', 'rejected', 'cancelled'],
  approved: ['label_created', 'cancelled'],
  rejected: [],
  label_created: ['in_transit', 'cancelled'],
  in_transit: ['received', 'cancelled'],
  received: ['inspected'],
  inspected: ['refund_pending', 'completed', 'cancelled'],
  refund_pending: ['completed'],
  completed: [],
  cancelled: [],
};

export function canTransitionShipment(from: ShipmentStatus, to: ShipmentStatus): boolean {
  return SHIPMENT_TRANSITIONS[from].includes(to);
}

export function canTransitionReturn(from: ReturnStatus, to: ReturnStatus): boolean {
  return RETURN_TRANSITIONS[from].includes(to);
}

export function renderNotificationSubject(
  template: NotificationTemplate,
  vars: Record<string, string>,
): string {
  const map: Record<NotificationTemplate, string> = {
    account_verification: 'Verify your Mavundla account',
    seller_application_update: `Seller application ${vars.status ?? 'updated'}`,
    listing_moderation: `Listing ${vars.status ?? 'updated'}`,
    order_confirmation: `Order ${vars.orderId ?? ''} confirmed`,
    shipment_update: `Shipment ${vars.trackingNumber ?? ''} update`,
    delivery_update: `Delivery update for order ${vars.orderId ?? ''}`,
    return_update: `Return ${vars.returnId ?? ''} ${vars.status ?? 'updated'}`,
    refund_update: `Refund ${vars.refundId ?? ''} ${vars.status ?? 'updated'}`,
    payout_status: `Payout ${vars.status ?? 'update'}`,
    support_update: `Support update on ${vars.resourceType ?? 'case'}`,
  };
  return map[template];
}

export function renderNotificationBody(
  template: NotificationTemplate,
  vars: Record<string, string>,
): string {
  return Object.entries(vars).reduce(
    (body, [key, value]) => body.replaceAll(`{{${key}}}`, value),
    `Mavundla Marketplace notification (${template}): {{summary}}`,
  );
}
