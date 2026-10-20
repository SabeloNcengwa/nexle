import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.js';
import { assertProductionSafe, getReadiness, ProductionConfigError } from './productionGuards.js';

function prodBase(overrides: Record<string, string> = {}) {
  return loadEnv({
    NODE_ENV: 'production',
    PORT: '8080',
    CORS_ORIGIN: 'https://pilot.example',
    JOBS_SECRET: 'abcdefghijklmnopqrstuvwxyz',
    PAYMENT_PROVIDER: 'mock',
    ALLOW_MOCK_PAYMENTS: 'true',
    COURIER_PROVIDER: 'mock',
    ALLOW_MOCK_COURIER: 'true',
    EMAIL_PROVIDER: 'mock',
    ALLOW_MOCK_EMAIL: 'true',
    SMS_PROVIDER: 'mock',
    ALLOW_MOCK_SMS: 'true',
    PILOT_MODE: 'true',
    PILOT_SELLER_ALLOWLIST: 'seller-a',
    ...overrides,
  });
}

describe('assertProductionSafe', () => {
  it('allows a configured pilot production env', () => {
    expect(() => assertProductionSafe(prodBase())).not.toThrow();
  });

  it('rejects missing JOBS_SECRET', () => {
    expect(() => assertProductionSafe(prodBase({ JOBS_SECRET: '' }))).toThrow(
      ProductionConfigError,
    );
  });

  it('rejects CORS *', () => {
    expect(() => assertProductionSafe(prodBase({ CORS_ORIGIN: '*' }))).toThrow(
      ProductionConfigError,
    );
  });

  it('rejects mock payments without allow flag', () => {
    expect(() =>
      assertProductionSafe(
        prodBase({
          ALLOW_MOCK_PAYMENTS: '',
        }),
      ),
    ).toThrow(ProductionConfigError);
  });

  it('rejects pilot mode without allowlist', () => {
    expect(() =>
      assertProductionSafe(
        prodBase({
          PILOT_SELLER_ALLOWLIST: '',
        }),
      ),
    ).toThrow(ProductionConfigError);
  });

  it('skips checks outside production', () => {
    expect(() => assertProductionSafe(loadEnv({ NODE_ENV: 'development' }))).not.toThrow();
  });
});

describe('getReadiness', () => {
  it('is not ready in maintenance mode', () => {
    const env = prodBase({ MAINTENANCE_MODE: 'true' });
    const result = getReadiness(env);
    expect(result.ready).toBe(false);
    expect(result.reasons).toContain('maintenance_mode');
  });

  it('is ready for valid pilot config', () => {
    expect(getReadiness(prodBase()).ready).toBe(true);
  });

  it('rejects PUBLIC_LAUNCH while still in pilot mode', () => {
    expect(() =>
      assertProductionSafe(
        prodBase({
          PUBLIC_LAUNCH: 'true',
          PILOT_MODE: 'true',
        }),
      ),
    ).toThrow(ProductionConfigError);
  });
});
