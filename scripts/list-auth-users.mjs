import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import postgres from 'postgres';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: resolve(root, 'apps/api/.env') });

console.log({
  FIREBASE_AUTH_EMULATOR_HOST: process.env.FIREBASE_AUTH_EMULATOR_HOST ?? null,
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
  GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS,
});

if (!getApps().length) {
  initializeApp({
    credential: applicationDefault(),
    projectId: process.env.FIREBASE_PROJECT_ID,
  });
}

const result = await getAuth().listUsers(100);
const authUsers = result.users.map((u) => ({
  uid: u.uid,
  email: u.email,
  displayName: u.displayName,
  createdAt: u.metadata.creationTime,
}));
console.log('auth_count', authUsers.length);
console.log(JSON.stringify(authUsers, null, 2));

const sql = postgres(process.env.SUPABASE_DB_URL, { max: 1, prepare: false });
try {
  const rows = await sql.unsafe(
    `select id, data->>'email' as email, data->>'accountType' as account_type from users order by updated_at desc limit 50`,
  );
  console.log('pg_users', JSON.stringify(rows, null, 2));
} finally {
  await sql.end({ timeout: 5 });
}
