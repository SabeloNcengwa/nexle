/**
 * Recreate Firebase Auth for a Supabase seller profile (same uid) when Auth was deleted.
 * Usage: node scripts/ensure-seller-auth.mjs sabeee@gmail.com [password]
 */
import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import postgres from 'postgres';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: resolve(root, 'apps/api/.env') });

const email = process.argv[2]?.trim().toLowerCase();
const passwordArg = process.argv[3]?.trim();
if (!email) {
  console.error('Usage: node scripts/ensure-seller-auth.mjs <email> [password]');
  process.exit(1);
}

if (!getApps().length) {
  initializeApp({
    credential: applicationDefault(),
    projectId: process.env.FIREBASE_PROJECT_ID,
  });
}

const sql = postgres(process.env.SUPABASE_DB_URL, { max: 1, prepare: false });
const auth = getAuth();

try {
  const rows = await sql.unsafe(
    `select id, data from users where lower(data->>'email') = $1 order by updated_at desc limit 5`,
    [email],
  );
  if (!rows.length) {
    console.error(JSON.stringify({ ok: false, error: 'no_supabase_user', email }));
    process.exit(1);
  }

  const row = rows[0];
  const data =
    typeof row.data === 'string' ? JSON.parse(row.data) : { ...(row.data ?? {}) };
  const uid = String(row.id);
  data.accountType = 'seller';
  data.email = email;
  data.uid = uid;
  data.status = data.status ?? 'active';
  data.platformRoles = Array.isArray(data.platformRoles) ? data.platformRoles : [];
  data.updatedAt = new Date().toISOString();
  if (!data.createdAt) data.createdAt = data.updatedAt;
  if (!data.displayName) data.displayName = email;

  await sql.unsafe(`update users set data = $2::jsonb, updated_at = now() where id = $1`, [
    uid,
    data,
  ]);

  const password = passwordArg || `Nexle-${randomBytes(4).toString('hex')}!`;
  let authAction = 'updated';

  try {
    const existing = await auth.getUserByEmail(email);
    if (existing.uid !== uid) {
      await auth.deleteUser(existing.uid);
      await auth.createUser({
        uid,
        email,
        password,
        displayName: String(data.displayName),
        emailVerified: true,
      });
      authAction = 'recreated_uid_mismatch';
    } else {
      await auth.updateUser(uid, {
        password,
        displayName: String(data.displayName),
        emailVerified: true,
      });
      authAction = 'password_reset';
    }
  } catch (err) {
    const code = err && typeof err === 'object' && 'code' in err ? String(err.code) : '';
    if (code !== 'auth/user-not-found') throw err;
    try {
      await auth.getUser(uid);
      await auth.updateUser(uid, {
        email,
        password,
        displayName: String(data.displayName),
        emailVerified: true,
      });
      authAction = 'uid_existed_email_set';
    } catch {
      await auth.createUser({
        uid,
        email,
        password,
        displayName: String(data.displayName),
        emailVerified: true,
      });
      authAction = 'created';
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        email,
        uid,
        accountType: 'seller',
        authAction,
        temporaryPassword: password,
        next: 'Sign in at http://localhost:5173/auth/sign-in then open /seller',
      },
      null,
      2,
    ),
  );
} finally {
  await sql.end({ timeout: 5 });
}
