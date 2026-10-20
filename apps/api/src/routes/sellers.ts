import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';
import * as sellers from '../services/sellers.js';

export const sellersRouter = Router();

sellersRouter.post(
  '/applications',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = await sellers.createOrUpdateDraftApplication(req.actor, req.body);
    res.status(201).json({ data });
  }),
);

sellersRouter.patch(
  '/applications/:applicationId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = await sellers.createOrUpdateDraftApplication(
      req.actor,
      req.body,
      req.params.applicationId,
    );
    res.json({ data });
  }),
);

sellersRouter.post(
  '/applications/submit',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = await sellers.submitApplication(req.actor, req.body);
    res.json({ data });
  }),
);

sellersRouter.get(
  '/applications/mine',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = await sellers.listMyApplications(req.actor);
    res.json({ data });
  }),
);

sellersRouter.get(
  '/applications/review-queue',
  requireAuth,
  asyncHandler(async (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const data = await sellers.listApplicationsForReview(req.actor, status);
    res.json({ data });
  }),
);

sellersRouter.post(
  '/applications/:applicationId/start-review',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = await sellers.startReview(req.actor, req.params.applicationId!);
    res.json({ data });
  }),
);

sellersRouter.post(
  '/applications/review',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = await sellers.reviewApplication(req.actor, req.body);
    res.json({ data });
  }),
);

sellersRouter.get(
  '/:sellerId',
  asyncHandler(async (req, res) => {
    const data = await sellers.getSeller(req.params.sellerId!);
    res.json({ data });
  }),
);

sellersRouter.post(
  '/:sellerId/status',
  requireAuth,
  asyncHandler(async (req, res) => {
    const status = req.body?.status as 'active' | 'suspended';
    if (status !== 'active' && status !== 'suspended') {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'status must be active or suspended' },
      });
      return;
    }
    const data = await sellers.setSellerStatus(req.actor, req.params.sellerId!, status);
    res.json({ data });
  }),
);
