import postgres from 'postgres';
import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: resolve(root, 'apps/api/.env') });

const sql = postgres(process.env.SUPABASE_DB_URL, { max: 1, prepare: false });
try {
  const tables = await sql`
    select tablename from pg_tables where schemaname = 'public' order by tablename
  `;
  const plans = await sql`
    select id, data->>'name' as name, data->>'percentageBps' as bps
    from commission_plans
  `;
  console.log(
    JSON.stringify(
      {
        tableCount: tables.length,
        tables: tables.map((t) => t.tablename),
        plans,
      },
      null,
      2,
    ),
  );
} finally {
  await sql.end({ timeout: 5 });
}
