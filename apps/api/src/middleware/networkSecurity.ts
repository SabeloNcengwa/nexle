import type { NextFunction, Request, Response } from 'express';
import type { Env } from '../config/env.js';
import { AppError } from '../lib/errors.js';
import { safeEqualString } from '../lib/moneySecurity.js';

function parseList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function clientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0]!.trim();
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    return String(forwarded[0]).split(',')[0]!.trim();
  }
  return req.ip ?? req.socket.remoteAddress ?? '';
}

function ipAllowed(ip: string, allowlist: string[]): boolean {
  if (allowlist.length === 0) return true;
  return allowlist.some((entry) => entry === ip || (entry.endsWith('*') && ip.startsWith(entry.slice(0, -1))));
}

/** Production traffic must arrive as HTTPS (Cloud Functions / load balancer terminate TLS). */
export function requireHttps(env: Env) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (env.NODE_ENV !== 'production') {
      next();
      return;
    }
    if (!env.REQUIRE_HTTPS) {
      next();
      return;
    }
    // Health probes from the platform may hit over internal HTTP — allow those paths only.
    if (req.path === '/health' || req.path === '/ready') {
      next();
      return;
    }
    const proto = String(req.headers['x-forwarded-proto'] ?? req.protocol ?? '')
      .split(',')[0]!
      .trim()
      .toLowerCase();
    if (proto !== 'https') {
      next(new AppError('HTTPS_REQUIRED', 'HTTPS is required for this API', 403));
      return;
    }
    next();
  };
}

/** Optional Host allowlist — blocks Host-header attacks when configured. */
export function requireAllowedHost(env: Env) {
  const hosts = parseList(env.ALLOWED_HOSTS);
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (hosts.length === 0) {
      next();
      return;
    }
    const host = String(req.headers.host ?? '')
      .split(':')[0]!
      .toLowerCase();
    if (!hosts.map((h) => h.toLowerCase()).includes(host)) {
      next(new AppError('HOST_REJECTED', 'Host not allowed', 403));
      return;
    }
    next();
  };
}

/** Optional IP allowlist for payment/courier webhooks (set provider edge IPs in env). */
export function requireWebhookIpAllowlist(env: Env) {
  const allowlist = parseList(env.WEBHOOK_IP_ALLOWLIST);
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (allowlist.length === 0) {
      next();
      return;
    }
    const ip = clientIp(req);
    if (!ipAllowed(ip, allowlist)) {
      next(new AppError('WEBHOOK_IP_DENIED', 'Webhook source IP not allowlisted', 403));
      return;
    }
    next();
  };
}

/** Optional IP allowlist for privileged job triggers. */
export function requireJobsIpAllowlist(env: Env) {
  const allowlist = parseList(env.JOBS_IP_ALLOWLIST);
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (allowlist.length === 0) {
      next();
      return;
    }
    const ip = clientIp(req);
    if (!ipAllowed(ip, allowlist)) {
      next(new AppError('JOBS_IP_DENIED', 'Jobs source IP not allowlisted', 403));
      return;
    }
    next();
  };
}

/** Timing-safe jobs secret check. */
export function assertJobsSecret(req: Request, expected: string | undefined): void {
  const provided = req.header('x-jobs-secret') ?? '';
  if (!expected || expected.length < 16 || !safeEqualString(provided, expected)) {
    throw new AppError('FORBIDDEN', 'Invalid jobs secret', 403);
  }
}

export function corsOriginAllowlist(env: Env): string[] {
  return env.CORS_ORIGIN.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
