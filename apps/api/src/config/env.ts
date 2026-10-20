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
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  WEB_BASE_URL: z.string().default('http://localhost:5173'),
  FIREBASE_PROJECT_ID: z.string().default('demo-mavundla'),
  FIREBASE_STORAGE_BUCKET: z.string().default('demo-mavundla.appspot.com'),
  ADMIN_BOOTSTRAP_SECRET: z.string().optional(),
  JOBS_SECRET: z.string().optional(),
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
