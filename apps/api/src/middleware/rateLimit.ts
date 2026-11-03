import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/errors.js';

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

function clientKey(req: Request): string {
  const uid = req.actor?.uid;
  return uid ? `uid:${uid}` : `ip:${req.ip ?? 'unknown'}`;
}

/** Basic in-memory rate limiter. Replace with managed edge limiter before scale-out. */
export function rateLimit(options: { windowMs: number; max: number; keyPrefix?: string }) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    // Probes must stay reachable for orchestration / load harnesses.
    if (req.path === '/health' || req.path === '/ready') {
      next();
      return;
    }

    const prefix = options.keyPrefix ?? req.path;
    const key = `${clientKey(req)}:${prefix}`;
    const now = Date.now();
    const existing = buckets.get(key);

    if (!existing || existing.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }

    existing.count += 1;
    if (existing.count > options.max) {
      next(new AppError('RATE_LIMITED', 'Too many requests', 429));
      return;
    }
    next();
  };
}

/** Stricter limits for money-moving endpoints (confirm, payouts, refunds, mock pay). */
export const moneyRateLimit = rateLimit({
  windowMs: 60_000,
  max: 30,
  keyPrefix: 'money',
});
