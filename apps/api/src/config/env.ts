import { z } from 'zod';

function parseSellerAllowlist(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

const paymentProviders = z.enum([
  'mock',
  'unconfigured',
  'paystack_marketplace',
  'ozow_marketplace',
]);
const courierProviders = z.enum(['mock', 'unconfigured', 'the_courier_guy', 'bob_go']);
const emailProviders = z.enum(['mock', 'unconfigured', 'sendgrid', 'ses', 'resend']);
const smsProviders = z.enum(['mock', 'unconfigured', 'twilio', 'clickatell']);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8080),
  CORS_ORIGIN: z.string().default('http://localhost:5173,http://localhost:5174'),
  WEB_BASE_URL: z.string().default('http://localhost:5173'),
  ADMIN_BASE_URL: z.string().default('http://localhost:5174'),
  FIREBASE_PROJECT_ID: z.string().default('demo-mavundla'),
  FIREBASE_STORAGE_BUCKET: z.string().default('demo-mavundla.appspot.com'),
  /** Supabase project URL, e.g. https://sttgjxiyyyanfvynrqfb.supabase.co */
  SUPABASE_URL: z.string().default('https://sttgjxiyyyanfvynrqfb.supabase.co'),
  /** Service role key — server only; never expose to clients. */
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  /** Postgres connection string (Settings → Database). Required for API data store. */
  SUPABASE_DB_URL: z.string().optional(),
  ADMIN_BOOTSTRAP_SECRET: z.string().optional(),
  JOBS_SECRET: z.string().optional(),
  /** Comma-separated Host header allowlist (empty = disabled). */
  ALLOWED_HOSTS: z.string().optional(),
  /** Comma-separated IPs for /v1/jobs/* (empty = secret-only). */
  JOBS_IP_ALLOWLIST: z.string().optional(),
  /** Comma-separated IPs for payment/courier webhooks (empty = signature-only). */
  WEBHOOK_IP_ALLOWLIST: z.string().optional(),
  /** Reject cleartext in production when true (default). */
  REQUIRE_HTTPS: z
    .string()
    .optional()
    .transform((v) => v !== 'false'),
  ALLOW_MOCK_PAYMENTS: z.string().optional(),
  PAYMENT_PROVIDER: paymentProviders.default('mock'),
  PAYMENT_PROVIDER_API_KEY: z.string().optional(),
  PAYMENT_DILIGENCE_SIGNED: z.string().optional(),
  COURIER_PROVIDER: courierProviders.default('mock'),
  COURIER_PROVIDER_API_KEY: z.string().optional(),
  COURIER_DILIGENCE_SIGNED: z.string().optional(),
  ALLOW_MOCK_COURIER: z.string().optional(),
  EMAIL_PROVIDER: emailProviders.default('mock'),
  EMAIL_PROVIDER_API_KEY: z.string().optional(),
  EMAIL_DILIGENCE_SIGNED: z.string().optional(),
  ALLOW_MOCK_EMAIL: z.string().optional(),
  SMS_PROVIDER: smsProviders.default('mock'),
  SMS_PROVIDER_API_KEY: z.string().optional(),
  SMS_DILIGENCE_SIGNED: z.string().optional(),
  ALLOW_MOCK_SMS: z.string().optional(),
  RESERVATION_EXPIRY_INTERVAL_MS: z.coerce.number().int().nonnegative().default(60_000),
  PILOT_MODE: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  PILOT_SELLER_ALLOWLIST: z
    .string()
    .optional()
    .transform((v) => parseSellerAllowlist(v)),
  MAINTENANCE_MODE: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  /** Public launch: requires PILOT_MODE=false and non-mock providers unless mocks explicitly allowed. */
  PUBLIC_LAUNCH: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${parsed.error.message}`);
  }
  return parsed.data;
}
