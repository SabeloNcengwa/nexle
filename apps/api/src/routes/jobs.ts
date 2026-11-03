import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { getRuntimeEnv } from '../config/runtime.js';
import { assertJobsSecret, requireJobsIpAllowlist } from '../middleware/networkSecurity.js';
import { moneyRateLimit } from '../middleware/rateLimit.js';
import { expireReservations } from '../services/checkout.js';
import { processNotificationJobs } from '../services/notifications.js';
import { runEligibilityReleaseJob } from '../services/payouts.js';

export const jobsRouter = Router();

jobsRouter.use((req, res, next) => {
  const env = getRuntimeEnv();
  requireJobsIpAllowlist(env)(req, res, next);
});

jobsRouter.use(moneyRateLimit);

jobsRouter.use((req, _res, next) => {
  try {
    assertJobsSecret(req, getRuntimeEnv().JOBS_SECRET);
    next();
  } catch (err) {
    next(err);
  }
});

jobsRouter.post(
  '/expire-reservations',
  asyncHandler(async (_req, res) => {
    const data = await expireReservations(100);
    res.json({ data });
  }),
);

jobsRouter.post(
  '/release-payout-eligibility',
  asyncHandler(async (_req, res) => {
    const data = await runEligibilityReleaseJob(50);
    res.json({ data });
  }),
);

jobsRouter.post(
  '/process-notifications',
  asyncHandler(async (_req, res) => {
    const data = await processNotificationJobs(50);
    res.json({ data });
  }),
);
