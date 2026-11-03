/**
 * Removes seeded demo Auth users and known demo Firestore documents.
 * Usage: npm run purge:demo
 */
import { config as loadDotenv } from 'dotenv';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from '../config/env.js';
import { auth, db, initFirebase } from '../config/firebase.js';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../..');
loadDotenv({ path: resolve(root, 'apps/api/.env') });
loadDotenv({ path: resolve(root, '.env') });

const DEMO_EMAILS = ['admin@nexle.demo', 'seller@nexle.demo', 'customer@nexle.demo'] as const;

const DEMO_DOCS: Array<{ collection: string; id: string }> = [
  { collection: 'sellerApplications', id: 'demo-seller-app' },
  { collection: 'sellers', id: 'demo-seller' },
  { collection: 'products', id: 'demo-product' },
  { collection: 'categories', id: 'demo-electronics' },
];

async function deleteByQuery(
  collection: string,
  field: string,
  value: string,
): Promise<number> {
  const snap = await db().collection(collection).where(field, '==', value).get();
  let n = 0;
  const batch = db().batch();
  for (const doc of snap.docs) {
    batch.delete(doc.ref);
    n += 1;
  }
  if (n > 0) await batch.commit();
  return n;
}

async function main() {
  const env = loadEnv();
  initFirebase(env);

  const removedUsers: string[] = [];
  for (const email of DEMO_EMAILS) {
    try {
      const user = await auth().getUserByEmail(email);
      await auth().deleteUser(user.uid);
      await db().collection('users').doc(user.uid).delete().catch(() => undefined);
      removedUsers.push(`${email} (${user.uid})`);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code !== 'auth/user-not-found') {
        console.warn(`Skip ${email}:`, err);
      }
    }
  }

  const deletedDocs: string[] = [];
  for (const { collection, id } of DEMO_DOCS) {
    const ref = db().collection(collection).doc(id);
    const snap = await ref.get();
    if (snap.exists) {
      await ref.delete();
      deletedDocs.push(`${collection}/${id}`);
    }
  }

  const memberCount = await deleteByQuery('sellerMembers', 'sellerId', 'demo-seller');
  const inventoryCount = await deleteByQuery('inventory', 'sellerId', 'demo-seller');

  console.log(
    JSON.stringify(
      {
        ok: true,
        removedAuthUsers: removedUsers,
        deletedDocs,
        sellerMembersDeleted: memberCount,
        inventoryDeleted: inventoryCount,
        next: [
          'Customers & sellers: register on the storefront',
          'First staff: register on storefront, then npm run bootstrap:admin -- --uid <UID> --email <email>',
        ],
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
