/**
 * Secure bootstrap for the first super_admin.
 * Usage: npm run bootstrap:admin -- --uid <UID> --email <email>
 *
 * Requires Admin SDK credentials or emulator env vars.
 * Optional ADMIN_BOOTSTRAP_SECRET must match if set in env.
 */
import { loadEnv } from '../config/env.js';
import { db, initFirebase } from '../config/firebase.js';

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

async function main() {
  const env = loadEnv();
  const secret = arg('--secret');
  if (env.ADMIN_BOOTSTRAP_SECRET && env.ADMIN_BOOTSTRAP_SECRET !== secret) {
    throw new Error('ADMIN_BOOTSTRAP_SECRET mismatch or missing --secret');
  }

  const uid = arg('--uid');
  const email = arg('--email');
  if (!uid || !email) {
    throw new Error('Usage: bootstrap:admin -- --uid <UID> --email <email> [--secret <secret>]');
  }

  initFirebase(env);
  const now = new Date().toISOString();
  const ref = db().collection('users').doc(uid);
  await ref.set(
    {
      uid,
      email,
      displayName: email.split('@')[0],
      platformRoles: ['super_admin'],
      status: 'active',
      updatedAt: now,
      createdAt: now,
    },
    { merge: true },
  );

  await db().collection('auditLogs').add({
    actorUid: 'bootstrap',
    action: 'admin.bootstrap',
    resourceType: 'users',
    resourceId: uid,
    metadata: { email },
    createdAt: now,
  });

  console.log(`Promoted ${email} (${uid}) to super_admin`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
