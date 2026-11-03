/**
 * Ensure default commission plan is 8% (Bolt-style platform fee).
 * Usage: npm run ensure:commission -w @mavundla/api
 */
import { config as loadDotenv } from 'dotenv';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_PLATFORM_COMMISSION_BPS } from '@mavundla/shared';
import { loadEnv } from '../config/env.js';
import { db, initFirebase } from '../config/firebase.js';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../..');
loadDotenv({ path: resolve(root, 'apps/api/.env') });

async function main() {
  const env = loadEnv();
  initFirebase(env);

  const defaults = await db().collection('commissionPlans').where('isDefault', '==', true).get();
  const matching = defaults.docs.find(
    (d) => Number(d.data().percentageBps) === DEFAULT_PLATFORM_COMMISSION_BPS,
  );
  if (matching) {
    console.log(
      JSON.stringify({
        ok: true,
        alreadyDefault: matching.id,
        percentageBps: DEFAULT_PLATFORM_COMMISSION_BPS,
        percent: '8%',
      }),
    );
    return;
  }

  const batch = db().batch();
  for (const d of defaults.docs) {
    batch.update(d.ref, { isDefault: false });
  }
  const ref = db().collection('commissionPlans').doc();
  batch.set(ref, {
    name: 'Standard 8% (platform fee)',
    version: 1,
    percentageBps: DEFAULT_PLATFORM_COMMISSION_BPS,
    effectiveFrom: new Date().toISOString(),
    isDefault: true,
    previousPlanId: defaults.empty ? undefined : defaults.docs[0]!.id,
  });
  await batch.commit();
  console.log(
    JSON.stringify({
      ok: true,
      createdPlanId: ref.id,
      percentageBps: DEFAULT_PLATFORM_COMMISSION_BPS,
      percent: '8%',
      note: 'Customer pays Nexle (one Paystack). Seller withdraws 92% after hold.',
    }),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
