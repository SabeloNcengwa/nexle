/**
 * Create a Firebase Auth user and promote to super_admin.
 * Usage:
 *   npm run create:admin -- --email you@example.com --password 'YourSecurePass1!'
 * Omitting flags uses defaults printed at the end (change password after first login).
 */
import { config as loadDotenv } from 'dotenv';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { loadEnv } from '../config/env.js';
import { auth, db, initFirebase } from '../config/firebase.js';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../..');
loadDotenv({ path: resolve(root, 'apps/api/.env') });
loadDotenv({ path: resolve(root, '.env') });

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

async function main() {
  const env = loadEnv();
  initFirebase(env);

  const email = (arg('--email') ?? 'admin@nexle.co.za').trim().toLowerCase();
  const password = arg('--password') ?? `Nexle!${randomBytes(6).toString('base64url')}`;
  const displayName = arg('--name') ?? 'Nexle Admin';

  let user;
  try {
    user = await auth().getUserByEmail(email);
    await auth().updateUser(user.uid, { password, displayName, emailVerified: true });
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code !== 'auth/user-not-found') throw err;
    user = await auth().createUser({
      email,
      password,
      displayName,
      emailVerified: true,
    });
  }

  const now = new Date().toISOString();
  await db()
    .collection('users')
    .doc(user.uid)
    .set(
      {
        uid: user.uid,
        email,
        displayName,
        platformRoles: ['super_admin'],
        status: 'active',
        updatedAt: now,
        createdAt: now,
      },
      { merge: true },
    );

  await db().collection('auditLogs').add({
    actorUid: 'createStaffAdmin',
    action: 'admin.created',
    resourceType: 'users',
    resourceId: user.uid,
    metadata: { email },
    createdAt: now,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        email,
        password,
        uid: user.uid,
        staffConsole: 'https://nexle-admin.web.app',
        localStaff: 'http://localhost:5174',
        note: 'Change this password after first sign-in (Account / Change password on storefront, or staff settings).',
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
