import { AppError } from '../lib/errors.js';
import type { Env } from './env.js';

export function assertSellerAllowedInPilot(env: Env, sellerId: string): void {
  if (!env.PILOT_MODE) return;
  if (env.PILOT_SELLER_ALLOWLIST.includes(sellerId)) return;
  throw new AppError('PILOT_SELLER_BLOCKED', 'Seller is not on the pilot allowlist', 403);
}

export function isSellerAllowedInPilot(env: Env, sellerId: string): boolean {
  if (!env.PILOT_MODE) return true;
  return env.PILOT_SELLER_ALLOWLIST.includes(sellerId);
}
