import { describe, expect, it } from 'vitest';
import {
  canTransitionOrder,
  canTransitionPayment,
  canTransitionReservation,
} from './orderStates.js';

describe('order state machines', () => {
  it('allows pending_payment to paid or terminal failure states', () => {
    expect(canTransitionOrder('pending_payment', 'paid')).toBe(true);
    expect(canTransitionOrder('pending_payment', 'expired')).toBe(true);
    expect(canTransitionOrder('paid', 'cancelled')).toBe(false);
  });

  it('locks succeeded payments', () => {
    expect(canTransitionPayment('pending', 'succeeded')).toBe(true);
    expect(canTransitionPayment('succeeded', 'failed')).toBe(false);
  });

  it('allows active reservations to be consumed or released', () => {
    expect(canTransitionReservation('active', 'consumed')).toBe(true);
    expect(canTransitionReservation('consumed', 'released')).toBe(false);
  });
});
