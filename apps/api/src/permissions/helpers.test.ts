import type { Actor, Order } from '@mavundla/shared';
import { describe, expect, it } from 'vitest';
import {
  assertFinancePermission,
  assertOrderAccess,
  assertSellerPermission,
  requireAuthenticatedUser,
  requirePlatformPermission,
} from './helpers.js';

function makeActor(overrides: Partial<Actor> = {}): Actor {
  return {
    uid: 'u1',
    email: 'u1@example.com',
    displayName: 'User One',
    platformRoles: [],
    status: 'active',
    sellerMemberships: [],
    ...overrides,
  };
}

describe('permission helpers', () => {
  it('requireAuthenticatedUser rejects missing actor', () => {
    expect(() => requireAuthenticatedUser(undefined)).toThrow(/Authentication required/);
  });

  it('requireAuthenticatedUser rejects suspended users', () => {
    expect(() => requireAuthenticatedUser(makeActor({ status: 'suspended' }))).toThrow(
      /suspended/,
    );
  });

  it('requirePlatformPermission allows listed roles only', () => {
    const admin = makeActor({ platformRoles: ['super_admin'] });
    expect(() => requirePlatformPermission(admin, ['super_admin'])).not.toThrow();
    expect(() => requirePlatformPermission(makeActor(), ['super_admin'])).toThrow(/permission/);
  });

  it('assertSellerPermission checks membership grants', () => {
    const seller = makeActor({
      sellerMemberships: [
        {
          id: 'm1',
          sellerId: 's1',
          uid: 'u1',
          role: 'seller_staff',
          permissions: ['seller:manage_products'],
          status: 'active',
        },
      ],
    });
    expect(() => assertSellerPermission(seller, 's1', 'seller:manage_products')).not.toThrow();
    expect(() => assertSellerPermission(seller, 's1', 'seller:manage_members')).toThrow();
    expect(() => assertSellerPermission(seller, 'other', 'seller:manage_products')).toThrow();
  });

  it('assertFinancePermission restricts to finance roles', () => {
    expect(() =>
      assertFinancePermission(makeActor({ platformRoles: ['finance_operator'] })),
    ).not.toThrow();
    expect(() => assertFinancePermission(makeActor({ platformRoles: ['support_agent'] }))).toThrow();
  });

  it('assertOrderAccess allows customer, staff, or seller member', () => {
    const order: Order = {
      id: 'o1',
      customerUid: 'u1',
      status: 'paid',
      currency: 'ZAR',
      subtotalCents: 100,
      deliveryCents: 0,
      totalCents: 100,
      shippingAddress: {
        line1: '1',
        suburb: 's',
        city: 'c',
        province: 'Gauteng',
        postalCode: '0001',
        country: 'ZA',
      },
      lines: [
        {
          productId: 'p1',
          sellerId: 's1',
          sku: 'SKU',
          title: 'T',
          quantity: 1,
          unitPriceCents: 100,
          lineSubtotalCents: 100,
          taxClassification: 'standard',
          commissionRuleSnapshot: {
            planId: 'c1',
            version: 1,
            percentageBps: 1000,
            rounding: 'half_up',
          },
          platformCommissionCents: 10,
          sellerProceedsCents: 90,
        },
      ],
      deliveryQuotes: [],
      reservationIds: [],
      idempotencyKey: 'key-1',
    };

    expect(() => assertOrderAccess(makeActor({ uid: 'u1' }), order)).not.toThrow();
    expect(() => assertOrderAccess(makeActor({ uid: 'other' }), order)).toThrow(/No access/);
    expect(() =>
      assertOrderAccess(makeActor({ uid: 'staff', platformRoles: ['support_agent'] }), order),
    ).not.toThrow();
    expect(() =>
      assertOrderAccess(
        makeActor({
          uid: 'seller',
          sellerMemberships: [
            {
              id: 'm1',
              sellerId: 's1',
              uid: 'seller',
              role: 'seller_owner',
              permissions: ['seller:manage_orders'],
              status: 'active',
            },
          ],
        }),
        order,
      ),
    ).not.toThrow();
  });
});
