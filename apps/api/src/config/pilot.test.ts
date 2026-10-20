import { describe, expect, it } from 'vitest';
import { AppError } from '../lib/errors.js';
import { loadEnv } from './env.js';
import { assertSellerAllowedInPilot, isSellerAllowedInPilot } from './pilot.js';

describe('pilot allowlist', () => {
  it('allows all sellers when pilot mode is off', () => {
    const env = loadEnv({ NODE_ENV: 'test', PILOT_MODE: 'false' });
    expect(isSellerAllowedInPilot(env, 'anyone')).toBe(true);
    expect(() => assertSellerAllowedInPilot(env, 'anyone')).not.toThrow();
  });

  it('blocks sellers not on allowlist when pilot mode is on', () => {
    const env = loadEnv({
      NODE_ENV: 'test',
      PILOT_MODE: 'true',
      PILOT_SELLER_ALLOWLIST: 'a,b',
    });
    expect(isSellerAllowedInPilot(env, 'a')).toBe(true);
    expect(isSellerAllowedInPilot(env, 'c')).toBe(false);
    expect(() => assertSellerAllowedInPilot(env, 'c')).toThrow(AppError);
  });
});
