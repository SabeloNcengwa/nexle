import { describe, expect, it } from 'vitest';
import {
  canTransitionReturn,
  canTransitionShipment,
  renderNotificationSubject,
} from './fulfilment.js';

describe('fulfilment helpers', () => {
  it('allows booked shipment to move in transit but not reverse from delivered', () => {
    expect(canTransitionShipment('booked', 'in_transit')).toBe(true);
    expect(canTransitionShipment('delivered', 'in_transit')).toBe(false);
  });

  it('allows return inspection path', () => {
    expect(canTransitionReturn('requested', 'approved')).toBe(true);
    expect(canTransitionReturn('inspected', 'refund_pending')).toBe(true);
    expect(canTransitionReturn('completed', 'requested')).toBe(false);
  });

  it('renders notification subjects with variables', () => {
    expect(renderNotificationSubject('order_confirmation', { orderId: 'abc' })).toContain('abc');
    expect(renderNotificationSubject('seller_new_order', { orderId: 'abc' })).toContain('ship');
    expect(renderNotificationSubject('shipment_update', { trackingNumber: 'TRK1' })).toContain(
      'TRK1',
    );
  });
});
