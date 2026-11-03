import type { Env } from './env.js';

export class ProductionConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProductionConfigError';
  }
}

const LIVE_PAYMENT = new Set(['paystack_marketplace', 'ozow_marketplace']);
const LIVE_COURIER = new Set(['the_courier_guy', 'bob_go']);
const LIVE_EMAIL = new Set(['sendgrid', 'ses', 'resend']);
const LIVE_SMS = new Set(['twilio', 'clickatell']);

/** Fail fast on unsafe production configuration. */
export function assertProductionSafe(env: Env): void {
  if (env.NODE_ENV !== 'production') return;

  const problems: string[] = [];

  if (!env.JOBS_SECRET || env.JOBS_SECRET.length < 16) {
    problems.push('JOBS_SECRET must be set and at least 16 characters in production');
  }

  if (!env.SUPABASE_DB_URL) {
    problems.push('SUPABASE_DB_URL is required in production (Supabase Postgres)');
  }
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    problems.push('SUPABASE_SERVICE_ROLE_KEY is required in production');
  }
  if (!env.SUPABASE_URL?.startsWith('https://')) {
    problems.push('SUPABASE_URL must be https in production');
  }

  const origins = env.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean);
  if (origins.length === 0) {
    problems.push('CORS_ORIGIN must list at least one exact origin in production');
  }
  if (origins.includes('*')) {
    problems.push('CORS_ORIGIN must not be * in production');
  }
  for (const origin of origins) {
    if (origin.startsWith('http://') && !origin.includes('localhost') && !origin.includes('127.0.0.1')) {
      problems.push(`CORS_ORIGIN ${origin} must use https in production (non-localhost)`);
    }
  }
  if (!env.WEB_BASE_URL.startsWith('https://') && !env.WEB_BASE_URL.includes('localhost')) {
    problems.push('WEB_BASE_URL must be https in production');
  }
  if (!env.ADMIN_BASE_URL.startsWith('https://') && !env.ADMIN_BASE_URL.includes('localhost')) {
    problems.push('ADMIN_BASE_URL must be https in production');
  }
  if (env.PUBLIC_LAUNCH) {
    for (const origin of origins) {
      if (!origin.startsWith('https://')) {
        problems.push(`PUBLIC_LAUNCH requires https CORS origin (got ${origin})`);
      }
    }
    if (!env.WEB_BASE_URL.startsWith('https://')) {
      problems.push('PUBLIC_LAUNCH requires https WEB_BASE_URL');
    }
    if (!env.ADMIN_BASE_URL.startsWith('https://')) {
      problems.push('PUBLIC_LAUNCH requires https ADMIN_BASE_URL');
    }
  }

  if (env.PAYMENT_PROVIDER === 'mock' && env.ALLOW_MOCK_PAYMENTS !== 'true') {
    problems.push(
      'PAYMENT_PROVIDER=mock requires ALLOW_MOCK_PAYMENTS=true in production (pilot only)',
    );
  }

  if (env.COURIER_PROVIDER === 'mock' && env.ALLOW_MOCK_COURIER !== 'true') {
    problems.push(
      'COURIER_PROVIDER=mock requires ALLOW_MOCK_COURIER=true in production (pilot only)',
    );
  }

  if (env.EMAIL_PROVIDER === 'mock' && env.ALLOW_MOCK_EMAIL !== 'true') {
    problems.push('EMAIL_PROVIDER=mock requires ALLOW_MOCK_EMAIL=true in production');
  }

  if (env.SMS_PROVIDER === 'mock' && env.ALLOW_MOCK_SMS !== 'true') {
    problems.push('SMS_PROVIDER=mock requires ALLOW_MOCK_SMS=true in production');
  }

  if (env.PAYMENT_PROVIDER === 'unconfigured' && env.ALLOW_MOCK_PAYMENTS === 'true') {
    problems.push('ALLOW_MOCK_PAYMENTS=true is incompatible with PAYMENT_PROVIDER=unconfigured');
  }

  if (LIVE_PAYMENT.has(env.PAYMENT_PROVIDER)) {
    if (env.PAYMENT_DILIGENCE_SIGNED !== 'true') {
      problems.push(`${env.PAYMENT_PROVIDER} requires PAYMENT_DILIGENCE_SIGNED=true`);
    }
    if (!env.PAYMENT_PROVIDER_API_KEY) {
      problems.push(`${env.PAYMENT_PROVIDER} requires PAYMENT_PROVIDER_API_KEY`);
    }
  }

  if (LIVE_COURIER.has(env.COURIER_PROVIDER)) {
    if (env.COURIER_DILIGENCE_SIGNED !== 'true') {
      problems.push(`${env.COURIER_PROVIDER} requires COURIER_DILIGENCE_SIGNED=true`);
    }
    if (!env.COURIER_PROVIDER_API_KEY) {
      problems.push(`${env.COURIER_PROVIDER} requires COURIER_PROVIDER_API_KEY`);
    }
  }

  if (LIVE_EMAIL.has(env.EMAIL_PROVIDER)) {
    if (env.EMAIL_DILIGENCE_SIGNED !== 'true') {
      problems.push(`${env.EMAIL_PROVIDER} requires EMAIL_DILIGENCE_SIGNED=true`);
    }
    if (!env.EMAIL_PROVIDER_API_KEY) {
      problems.push(`${env.EMAIL_PROVIDER} requires EMAIL_PROVIDER_API_KEY`);
    }
  }

  if (LIVE_SMS.has(env.SMS_PROVIDER)) {
    if (env.SMS_DILIGENCE_SIGNED !== 'true') {
      problems.push(`${env.SMS_PROVIDER} requires SMS_DILIGENCE_SIGNED=true`);
    }
    if (!env.SMS_PROVIDER_API_KEY) {
      problems.push(`${env.SMS_PROVIDER} requires SMS_PROVIDER_API_KEY`);
    }
  }

  if (env.PILOT_MODE) {
    if (env.PILOT_SELLER_ALLOWLIST.length === 0) {
      problems.push('PILOT_MODE=true requires a non-empty PILOT_SELLER_ALLOWLIST');
    }
  }

  if (env.PUBLIC_LAUNCH) {
    if (env.PILOT_MODE) {
      problems.push('PUBLIC_LAUNCH=true requires PILOT_MODE=false');
    }
    if (env.PAYMENT_PROVIDER === 'mock') {
      problems.push('PUBLIC_LAUNCH=true forbids PAYMENT_PROVIDER=mock — use a diligenced adapter');
    }
    if (env.COURIER_PROVIDER === 'mock') {
      problems.push('PUBLIC_LAUNCH=true forbids COURIER_PROVIDER=mock — use a diligenced adapter');
    }
    if (env.EMAIL_PROVIDER === 'mock') {
      problems.push('PUBLIC_LAUNCH=true forbids EMAIL_PROVIDER=mock');
    }
  }

  if (problems.length > 0) {
    throw new ProductionConfigError(
      `Unsafe production configuration:\n- ${problems.join('\n- ')}`,
    );
  }
}

export function getReadiness(env: Env): { ready: boolean; reasons: string[] } {
  const reasons: string[] = [];

  if (env.MAINTENANCE_MODE) {
    reasons.push('maintenance_mode');
  }

  try {
    assertProductionSafe(env);
  } catch (err) {
    if (err instanceof ProductionConfigError) {
      reasons.push('production_config');
    } else {
      reasons.push('unknown_config_error');
    }
  }

  return { ready: reasons.length === 0, reasons };
}
