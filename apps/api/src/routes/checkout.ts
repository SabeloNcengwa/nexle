import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';
import * as checkout from '../services/checkout.js';

export const checkoutRouter = Router();

checkoutRouter.get(
  '/preview',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = await checkout.previewCheckout(req.actor);
    res.json({ data });
  }),
);

checkoutRouter.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const webBaseUrl = (req.app.get('webBaseUrl') as string) || 'http://localhost:5173';
    const data = await checkout.startCheckout(req.actor, req.body, webBaseUrl);
    res.status(201).json({ data });
  }),
);
