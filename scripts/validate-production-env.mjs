#!/usr/bin/env node
/**
 * Validates production/pilot/launch env vars without starting Firebase.
 * Usage: node scripts/validate-production-env.mjs
 */

function parseAllowlist(raw) {
  if (!raw) return [];
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const env = process.env;
const problems = [];

if (env.NODE_ENV !== 'production') {
  console.log(
    JSON.stringify({
      ok: true,
      skipped: true,
      reason: 'NODE_ENV is not production; no production guards applied',
      nodeEnv: env.NODE_ENV ?? null,
    }),
  );
  process.exit(0);
}

if (!env.JOBS_SECRET || env.JOBS_SECRET.length < 16) {
  problems.push('JOBS_SECRET must be set and at least 16 characters');
}

const origins = String(env.CORS_ORIGIN ?? '')
  .split(',')
  .map((s) => s.trim());
if (!env.CORS_ORIGIN || origins.includes('*')) {
  problems.push('CORS_ORIGIN must be set and must not include *');
}

const payment = env.PAYMENT_PROVIDER ?? 'mock';
const courier = env.COURIER_PROVIDER ?? 'mock';
const email = env.EMAIL_PROVIDER ?? 'mock';
const sms = env.SMS_PROVIDER ?? 'mock';

if (payment === 'mock' && env.ALLOW_MOCK_PAYMENTS !== 'true') {
  problems.push('PAYMENT_PROVIDER=mock requires ALLOW_MOCK_PAYMENTS=true');
}
if (courier === 'mock' && env.ALLOW_MOCK_COURIER !== 'true') {
  problems.push('COURIER_PROVIDER=mock requires ALLOW_MOCK_COURIER=true');
}
if (email === 'mock' && env.ALLOW_MOCK_EMAIL !== 'true') {
  problems.push('EMAIL_PROVIDER=mock requires ALLOW_MOCK_EMAIL=true');
}
if (sms === 'mock' && env.ALLOW_MOCK_SMS !== 'true') {
  problems.push('SMS_PROVIDER=mock requires ALLOW_MOCK_SMS=true');
}

for (const [name, diligence, key] of [
  [['paystack_marketplace', 'ozow_marketplace'].includes(payment) ? payment : null, 'PAYMENT_DILIGENCE_SIGNED', 'PAYMENT_PROVIDER_API_KEY'],
  [['the_courier_guy', 'bob_go'].includes(courier) ? courier : null, 'COURIER_DILIGENCE_SIGNED', 'COURIER_PROVIDER_API_KEY'],
  [['sendgrid', 'ses', 'resend'].includes(email) ? email : null, 'EMAIL_DILIGENCE_SIGNED', 'EMAIL_PROVIDER_API_KEY'],
  [['twilio', 'clickatell'].includes(sms) ? sms : null, 'SMS_DILIGENCE_SIGNED', 'SMS_PROVIDER_API_KEY'],
]) {
  if (!name) continue;
  if (env[diligence] !== 'true') problems.push(`${name} requires ${diligence}=true`);
  if (!env[key]) problems.push(`${name} requires ${key}`);
}

if (env.PILOT_MODE === 'true' && parseAllowlist(env.PILOT_SELLER_ALLOWLIST).length === 0) {
  problems.push('PILOT_MODE=true requires non-empty PILOT_SELLER_ALLOWLIST');
}

if (env.PUBLIC_LAUNCH === 'true') {
  if (env.PILOT_MODE === 'true') problems.push('PUBLIC_LAUNCH=true requires PILOT_MODE=false');
  if (payment === 'mock') problems.push('PUBLIC_LAUNCH forbids PAYMENT_PROVIDER=mock');
  if (courier === 'mock') problems.push('PUBLIC_LAUNCH forbids COURIER_PROVIDER=mock');
  if (email === 'mock') problems.push('PUBLIC_LAUNCH forbids EMAIL_PROVIDER=mock');
}

if (problems.length) {
  console.error(JSON.stringify({ ok: false, problems }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify({
    ok: true,
    pilotMode: env.PILOT_MODE === 'true',
    publicLaunch: env.PUBLIC_LAUNCH === 'true',
    paymentProvider: payment,
    courierProvider: courier,
    emailProvider: email,
    smsProvider: sms,
  }),
);
