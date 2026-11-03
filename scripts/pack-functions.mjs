/**
 * Bundle Express API for Firebase Cloud Functions deploy.
 * Output: apps/api/fn/ (main + package.json + .env)
 */
import { build } from 'esbuild';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'apps/api/fn');
const entry = resolve(root, 'apps/api/src/firebaseFunction.ts');

if (existsSync(outDir)) {
  rmSync(outDir, { recursive: true, force: true });
}
mkdirSync(outDir, { recursive: true });

await build({
  entryPoints: [entry],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile: resolve(outDir, 'index.js'),
  packages: 'bundle',
  external: ['firebase-admin', 'firebase-functions'],
  banner: {
    js: `import { createRequire } from 'module'; const require = createRequire(import.meta.url);`,
  },
  logLevel: 'info',
});

const pkg = {
  name: 'nexle-api-fn',
  private: true,
  type: 'module',
  main: 'index.js',
  engines: { node: '20' },
  dependencies: {
    'firebase-admin': '^13.1.0',
    'firebase-functions': '^6.3.0',
    dotenv: '^16.4.7',
  },
};
writeFileSync(resolve(outDir, 'package.json'), JSON.stringify(pkg, null, 2));

const apiEnvPath = resolve(root, 'apps/api/.env');
const apiEnvText = existsSync(apiEnvPath) ? readFileSync(apiEnvPath, 'utf8') : '';
function envFromApi(key) {
  return apiEnvText.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1]?.trim() ?? '';
}

const jobsSecret =
  process.env.JOBS_SECRET || envFromApi('JOBS_SECRET') || randomBytes(24).toString('hex');

const envLines = [
  'NODE_ENV=production',
  'CORS_ORIGIN=https://nexle-marketplace.web.app,https://nexle-admin.web.app,https://nexle-marketplace.firebaseapp.com',
  'WEB_BASE_URL=https://nexle-marketplace.web.app',
  'ADMIN_BASE_URL=https://nexle-admin.web.app',
  'FIREBASE_PROJECT_ID=nexle-marketplace',
  'FIREBASE_STORAGE_BUCKET=nexle-marketplace.firebasestorage.app',
  `SUPABASE_URL=${process.env.SUPABASE_URL || envFromApi('SUPABASE_URL') || 'https://sttgjxiyyyanfvynrqfb.supabase.co'}`,
  `SUPABASE_SERVICE_ROLE_KEY=${process.env.SUPABASE_SERVICE_ROLE_KEY || envFromApi('SUPABASE_SERVICE_ROLE_KEY')}`,
  `SUPABASE_DB_URL=${process.env.SUPABASE_DB_URL || envFromApi('SUPABASE_DB_URL')}`,
  `JOBS_SECRET=${jobsSecret}`,
  'RESERVATION_EXPIRY_INTERVAL_MS=60000',
  'PAYMENT_PROVIDER=mock',
  'ALLOW_MOCK_PAYMENTS=true',
  'COURIER_PROVIDER=mock',
  'ALLOW_MOCK_COURIER=true',
  'EMAIL_PROVIDER=mock',
  'ALLOW_MOCK_EMAIL=true',
  'SMS_PROVIDER=mock',
  'ALLOW_MOCK_SMS=true',
  'PILOT_MODE=false',
  'MAINTENANCE_MODE=false',
  'PUBLIC_LAUNCH=false',
];
writeFileSync(resolve(outDir, '.env'), envLines.join('\n') + '\n');

console.log('Packed Cloud Function → apps/api/fn');
