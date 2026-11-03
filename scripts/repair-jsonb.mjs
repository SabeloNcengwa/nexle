import postgres from 'postgres';
import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: resolve(root, 'apps/api/.env') });

const sql = postgres(process.env.SUPABASE_DB_URL, { max: 1, prepare: false });
try {
  const tables = [
    'users',
    'seller_applications',
    'sellers',
    'seller_members',
    'categories',
    'products',
    'inventory',
    'reviews',
    'carts',
    'orders',
    'seller_orders',
    'payments',
    'reservations',
    'shipments',
    'returns',
    'refunds',
    'commission_plans',
    'seller_ledger',
    'payouts',
    'platform_settings',
    'notifications',
    'background_jobs',
    'support_notes',
    'audit_logs',
    'idempotency_records',
    'webhook_events',
  ];
  for (const table of tables) {
    const result = await sql.unsafe(
      `update "${table}" set data = (data #>> '{}')::jsonb where jsonb_typeof(data) = 'string'`,
    );
    const count = Array.isArray(result) ? result.count ?? result.length : result.count;
    if (count) console.log(`repaired ${table}: ${count}`);
  }
  const plans = await sql.unsafe(
    `select id, data, jsonb_typeof(data) as t from commission_plans`,
  );
  console.log(JSON.stringify(plans, null, 2));
} finally {
  await sql.end({ timeout: 5 });
}
