import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';
import * as reviews from '../services/reviews.js';

export const reviewsRouter = Router();

reviewsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const data = await reviews.listProductReviews(req.query);
    res.json({ data });
  }),
);

reviewsRouter.get(
  '/moderation',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = await reviews.listReviewsForModeration(req.actor);
    res.json({ data });
  }),
);

reviewsRouter.get(
  '/:reviewId',
  asyncHandler(async (req, res) => {
    const data = await reviews.getReview(req.params.reviewId!, req.actor);
    res.json({ data });
  }),
);

reviewsRouter.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = await reviews.createProductReview(req.actor, req.body);
    res.status(201).json({ data });
  }),
);

reviewsRouter.post(
  '/moderate',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = await reviews.moderateProductReview(req.actor, req.body);
    res.json({ data });
  }),
);
