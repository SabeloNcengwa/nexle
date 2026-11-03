/**
 * Firebase HTTPS function entry (2nd gen) — Express app on Cloud Functions.
 */
import { config as loadDotenv } from 'dotenv';
import { onRequest } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2';
import { createApp } from './app.js';
import { loadEnv } from './config/env.js';
import { assertProductionSafe } from './config/productionGuards.js';
import { initFirebase } from './config/firebase.js';
import { expireReservations } from './services/checkout.js';
import { processNotificationJobs } from './services/notifications.js';

// Packed by scripts/pack-functions.mjs into apps/api/fn/.env (Supabase + CORS).
loadDotenv();

setGlobalOptions({
  region: 'africa-south1',
  maxInstances: 20,
});

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'production';
}

const env = loadEnv(process.env);
assertProductionSafe(env);
initFirebase(env);
const expressApp = createApp(env);

let jobsStarted = false;
function ensureJobs(): void {
  if (jobsStarted) return;
  jobsStarted = true;
  const interval = env.RESERVATION_EXPIRY_INTERVAL_MS;
  if (interval > 0) {
    setInterval(() => {
      void expireReservations(50).catch((err) => {
        console.error(JSON.stringify({ msg: 'reservation_expiry_failed', err: String(err) }));
      });
      void processNotificationJobs(25).catch((err) => {
        console.error(JSON.stringify({ msg: 'notification_jobs_failed', err: String(err) }));
      });
    }, interval);
  }
}

ensureJobs();

export const api = onRequest(
  {
    memory: '512MiB',
    timeoutSeconds: 120,
    cors: false,
    invoker: 'public',
  },
  expressApp,
);
