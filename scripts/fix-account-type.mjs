/**
 * One-shot: set users.accountType for a given email (bug recovery).
 * Creates the Postgres profile from Firebase Auth when missing.
 * Usage: node scripts/fix-account-type.mjs email@example.com seller
 */
import postgres from 'postgres';
import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: resolve(root, 'apps/api/.env') });

const email = process.argv[2]?.trim().toLowerCase();
const accountType = process.argv[3]?.trim();
if (!email || (accountType !== 'seller' && accountType !== 'customer')) {
  console.error('Usage: node scripts/fix-account-type.mjs <email> <seller|customer>');
  process.exit(1);
}

if (!getApps().length) {
  initializeApp({
    credential: applicationDefault(),
    projectId: process.env.FIREBASE_PROJECT_ID,
  });
}

const sql = postgres(process.env.SUPABASE_DB_URL, { max: 1, prepare: false });
try {
  const authUser = await getAuth().getUserByEmail(email);
  const uid = authUser.uid;
  const now = new Date().toISOString();

  const rows = await sql.unsafe(`select id, data from users where id = $1`, [uid]);
  let before = null;
  let data;

  if (!rows.length) {
    data = {
      uid,
      email: authUser.email ?? email,
      displayName: authUser.displayName || authUser.email || email,
      platformRoles: [],
      status: 'active',
      accountType,
      createdAt: now,
      updatedAt: now,
    };
    await sql.unsafe(
      `insert into users (id, data, updated_at)
       values ($1, $2::jsonb, now())
       on conflict (id) do update set data = excluded.data, updated_at = now()`,
      [uid, data],
    );
  } else {
    data =
      typeof rows[0].data === 'string'
        ? JSON.parse(rows[0].data)
        : { ...(rows[0].data ?? {}) };
    before = data.accountType ?? null;
    data.accountType = accountType;
    data.email = data.email ?? authUser.email ?? email;
    data.uid = data.uid ?? uid;
    data.status = data.status ?? 'active';
    data.platformRoles = Array.isArray(data.platformRoles) ? data.platformRoles : [];
    data.updatedAt = now;
    await sql.unsafe(`update users set data = $2::jsonb, updated_at = now() where id = $1`, [
      uid,
      data,
    ]);
  }

  console.log(
    JSON.stringify({
      ok: true,
      id: uid,
      email,
      before,
      after: accountType,
      created: !rows.length,
    }),
  );
} catch (err) {
  console.error(
    JSON.stringify({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      email,
    }),
  );
  process.exit(1);
} finally {
  await sql.end({ timeout: 5 });
}
