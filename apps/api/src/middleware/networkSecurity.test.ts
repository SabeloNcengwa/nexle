import { describe, expect, it } from 'vitest';
import type { Request, Response } from 'express';
import { loadEnv } from '../config/env.js';
import {
  assertJobsSecret,
  requireHttps,
  requireWebhookIpAllowlist,
} from './networkSecurity.js';

function mockReq(opts: {
  path?: string;
  ip?: string;
  headers?: Record<string, string>;
}): Request {
  const headers = opts.headers ?? {};
  return {
    path: opts.path ?? '/v1/payments/confirm',
    protocol: 'http',
    ip: opts.ip ?? '1.2.3.4',
    headers,
    header(name: string) {
      const key = name.toLowerCase();
      return headers[key] ?? headers[name];
    },
  } as unknown as Request;
}

describe('networkSecurity', () => {
  it('requires https in production', () => {
    const env = loadEnv({ NODE_ENV: 'production', REQUIRE_HTTPS: 'true' });
    const mw = requireHttps(env);
    let status: number | undefined;
    mw(
      mockReq({ headers: { 'x-forwarded-proto': 'http' } }),
      {} as Response,
      (err?: unknown) => {
        status = (err as { status?: number })?.status;
      },
    );
    expect(status).toBe(403);
  });

  it('allows https via forwarded proto', () => {
    const env = loadEnv({ NODE_ENV: 'production', REQUIRE_HTTPS: 'true' });
    const mw = requireHttps(env);
    let called = false;
    mw(
      mockReq({ headers: { 'x-forwarded-proto': 'https' } }),
      {} as Response,
      () => {
        called = true;
      },
    );
    expect(called).toBe(true);
  });

  it('enforces webhook IP allowlist when configured', () => {
    const env = loadEnv({ WEBHOOK_IP_ALLOWLIST: '10.0.0.1,10.0.0.2' });
    const mw = requireWebhookIpAllowlist(env);
    let denied = false;
    mw(mockReq({ ip: '9.9.9.9' }), {} as Response, (err?: unknown) => {
      denied = Boolean(err);
    });
    expect(denied).toBe(true);

    let ok = false;
    mw(
      mockReq({ ip: '10.0.0.1', headers: { 'x-forwarded-for': '10.0.0.1' } }),
      {} as Response,
      () => {
        ok = true;
      },
    );
    expect(ok).toBe(true);
  });

  it('checks jobs secret with timing-safe compare', () => {
    expect(() =>
      assertJobsSecret(mockReq({ headers: { 'x-jobs-secret': 'wrong' } }), 'abcdefghijklmnopqrstuvwxyz'),
    ).toThrow(/Invalid jobs secret/);
    expect(() =>
      assertJobsSecret(
        mockReq({ headers: { 'x-jobs-secret': 'abcdefghijklmnopqrstuvwxyz' } }),
        'abcdefghijklmnopqrstuvwxyz',
      ),
    ).not.toThrow();
  });
});
