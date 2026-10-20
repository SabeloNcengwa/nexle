import type { Actor, Order, PlatformRole, SellerPermission } from '@mavundla/shared';
import { AppError } from '../lib/errors.js';

export function requireAuthenticatedUser(actor: Actor | undefined): asserts actor is Actor {
  if (!actor) {
    throw new AppError('UNAUTHENTICATED', 'Authentication required', 401);
  }
  if (actor.status !== 'active') {
    throw new AppError('USER_SUSPENDED', 'Account is suspended', 403);
  }
}

export function requirePlatformPermission(
  actor: Actor | undefined,
  allowed: PlatformRole[],
): asserts actor is Actor {
  requireAuthenticatedUser(actor);
  const ok = allowed.some((role) => actor.platformRoles.includes(role));
  if (!ok) {
    throw new AppError('FORBIDDEN', 'Insufficient platform permission', 403);
  }
}

export function assertSellerPermission(
  actor: Actor | undefined,
  sellerId: string,
  permission: SellerPermission,
): void {
  requireAuthenticatedUser(actor);

  if (actor.platformRoles.includes('super_admin') || actor.platformRoles.includes('support_agent')) {
    return;
  }

  const membership = actor.sellerMemberships.find(
    (m) => m.sellerId === sellerId && m.status === 'active',
  );

  if (!membership || !membership.permissions.includes(permission)) {
    throw new AppError('FORBIDDEN', 'Insufficient seller permission', 403);
  }
}

export function assertOrderAccess(actor: Actor | undefined, order: Order): void {
  requireAuthenticatedUser(actor);

  if (order.customerUid === actor.uid) return;
  if (hasPlatformRole(actor, ['super_admin', 'support_agent'])) return;

  const sellerIds = new Set(order.lines.map((l) => l.sellerId));
  const memberSeller = actor.sellerMemberships.some(
    (m) => m.status === 'active' && sellerIds.has(m.sellerId),
  );
  if (memberSeller) return;

  throw new AppError('FORBIDDEN', 'No access to this order', 403);
}

export function assertFinancePermission(actor: Actor | undefined): void {
  requirePlatformPermission(actor, ['finance_operator', 'super_admin']);
}

export function hasPlatformRole(actor: Actor, roles: PlatformRole[]): boolean {
  return roles.some((role) => actor.platformRoles.includes(role));
}
