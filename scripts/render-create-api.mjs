/**
 * Create nexle-api on Render with secrets from local files (never logged).
 * Usage: node scripts/render-create-api.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { config } from 'dotenv';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: resolve(root, 'apps/api/.env') });

const saPath = resolve(root, 'secrets/nexle-marketplace-admin.json');
if (!existsSync(saPath)) {
  console.error('Missing secrets/nexle-marketplace-admin.json');
  process.exit(1);
}

const saJson = JSON.stringify(JSON.parse(readFileSync(saPath, 'utf8')));
const supabaseUrl = process.env.SUPABASE_URL || 'https://sttgjxiyyyanfvynrqfb.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const dbUrl = process.env.SUPABASE_DB_URL;
const jobsSecret = process.env.JOBS_SECRET || randomBytes(24).toString('hex');

if (!supabaseKey || !dbUrl) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_DB_URL in apps/api/.env');
  process.exit(1);
}

const envVars = {
  NODE_VERSION: '20',
  NODE_ENV: 'production',
  CORS_ORIGIN:
    'https://nexle-marketplace.web.app,https://nexle-admin.web.app,https://nexle-marketplace.firebaseapp.com',
  WEB_BASE_URL: 'https://nexle-marketplace.web.app',
  ADMIN_BASE_URL: 'https://nexle-admin.web.app',
  FIREBASE_PROJECT_ID: 'nexle-marketplace',
  FIREBASE_STORAGE_BUCKET: 'nexle-marketplace.firebasestorage.app',
  SUPABASE_URL: supabaseUrl,
  SUPABASE_SERVICE_ROLE_KEY: supabaseKey,
  SUPABASE_DB_URL: dbUrl,
  FIREBASE_SERVICE_ACCOUNT_JSON: saJson,
  JOBS_SECRET: jobsSecret,
  RESERVATION_EXPIRY_INTERVAL_MS: '60000',
  PAYMENT_PROVIDER: 'mock',
  ALLOW_MOCK_PAYMENTS: 'true',
  COURIER_PROVIDER: 'mock',
  ALLOW_MOCK_COURIER: 'true',
  EMAIL_PROVIDER: 'mock',
  ALLOW_MOCK_EMAIL: 'true',
  SMS_PROVIDER: 'mock',
  ALLOW_MOCK_SMS: 'true',
  PILOT_MODE: 'false',
  MAINTENANCE_MODE: 'false',
  PUBLIC_LAUNCH: 'false',
};

const args = [
  'services',
  'create',
  '--name',
  'nexle-api',
  '--type',
  'web_service',
  '--repo',
  'https://github.com/SabeloNcengwa/nexle',
  '--branch',
  'main',
  '--runtime',
  'node',
  '--plan',
  'free',
  '--region',
  'frankfurt',
  '--build-command',
  'npm ci --include-workspace-root && npm run build -w @mavundla/shared && npm run build -w @mavundla/api',
  '--start-command',
  'npm run start -w @mavundla/api',
  '--health-check-path',
  '/health',
  '--auto-deploy',
  '--confirm',
  '-o',
  'json',
];

for (const [k, v] of Object.entries(envVars)) {
  args.push('--env-var', `${k}=${v}`);
}

console.log('Creating Render service nexle-api (secrets omitted from log)...');
console.log({
  envKeys: Object.keys(envVars),
  saJsonChars: saJson.length,
  supabaseKeyChars: supabaseKey.length,
  dbUrlChars: dbUrl.length,
});

// shell:false so JSON private_key newlines are not mangled by PowerShell.
const result = spawnSync('render', args, {
  encoding: 'utf8',
  maxBuffer: 20 * 1024 * 1024,
  shell: false,
  windowsHide: true,
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
process.exit(result.status ?? 1);
