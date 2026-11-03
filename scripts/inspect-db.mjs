import postgres from 'postgres';
import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: resolve(root, 'apps/api/.env') });
const sql = postgres(process.env.SUPABASE_DB_URL, { max: 1, prepare: false });
try {
  const tables = await sql.unsafe(
    `select table_name from information_schema.tables where table_schema='public' order by 1`,
  );
  console.log('tables', tables.map((t) => t.table_name));
  for (const t of tables.map((r) => r.table_name)) {
    const c = await sql.unsafe(`select count(*)::int as n from "${t}"`);
    console.log(t, c[0].n);
  }
} finally {
  await sql.end({ timeout: 5 });
}
