import { config as loadDotenv } from 'dotenv';
import { resolve } from 'node:path';
import { loadEnv } from './config/env.js';
import { assertProductionSafe } from './config/productionGuards.js';
import { initFirebase } from './config/firebase.js';
import { createApp } from './app.js';
import { expireReservations } from './services/checkout.js';
import { processNotificationJobs } from './services/notifications.js';

loadDotenv({ path: resolve(process.cwd(), '.env') });
loadDotenv({ path: resolve(process.cwd(), '../../.env') });

const env = loadEnv();
assertProductionSafe(env);
initFirebase(env);
const app = createApp(env);

app.listen(env.PORT, () => {
  console.log(
    JSON.stringify({
      msg: 'api_listen',
      port: env.PORT,
      phase: 5,
      pilotMode: env.PILOT_MODE,
      paymentProvider: env.PAYMENT_PROVIDER,
      courierProvider: env.COURIER_PROVIDER,
    }),
  );
});

if (env.RESERVATION_EXPIRY_INTERVAL_MS > 0) {
  setInterval(() => {
    void expireReservations(50).catch((err) => {
      console.error(JSON.stringify({ msg: 'reservation_expiry_failed', err: String(err) }));
    });
    void processNotificationJobs(25).catch((err) => {
      console.error(JSON.stringify({ msg: 'notification_jobs_failed', err: String(err) }));
    });
  }, env.RESERVATION_EXPIRY_INTERVAL_MS);
}
