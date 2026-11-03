import postgres from 'postgres';
import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: resolve(root, 'apps/api/.env') });
const sql = postgres(process.env.SUPABASE_DB_URL, { max: 1, prepare: false });
try {
  const rows = await sql.unsafe(`
    select
      id,
      jsonb_typeof(data) as t,
      data->>'email' as email,
      data->>'accountType' as account_type,
      left(data::text, 240) as preview
    from users
    order by updated_at desc
    limit 50
  `);
  console.log(JSON.stringify(rows, null, 2));
} finally {
  await sql.end({ timeout: 5 });
}
