import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { AppError } from '../lib/errors.js';
import { expireReservations } from '../services/checkout.js';
import { processNotificationJobs } from '../services/notifications.js';
import { runEligibilityReleaseJob } from '../services/payouts.js';

export const jobsRouter = Router();

function requireJobsSecret(req: { header: (n: string) => string | undefined }): void {
  const expected = process.env.JOBS_SECRET;
  const provided = req.header('x-jobs-secret');
  if (!expected || provided !== expected) {
    throw new AppError('FORBIDDEN', 'Invalid jobs secret', 403);
  }
}

jobsRouter.post(
  '/expire-reservations',
  asyncHandler(async (req, res) => {
    requireJobsSecret(req);
    const data = await expireReservations(100);
    res.json({ data });
  }),
);

jobsRouter.post(
  '/release-payout-eligibility',
  asyncHandler(async (req, res) => {
    requireJobsSecret(req);
    const data = await runEligibilityReleaseJob(50);
    res.json({ data });
  }),
);

jobsRouter.post(
  '/process-notifications',
  asyncHandler(async (req, res) => {
    requireJobsSecret(req);
    const data = await processNotificationJobs(50);
    res.json({ data });
  }),
);
