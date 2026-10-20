import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';
import * as orders from '../services/orders.js';

export const ordersRouter = Router();

ordersRouter.get(
  '/mine',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = await orders.listMyOrders(req.actor);
    res.json({ data });
  }),
);

ordersRouter.get(
  '/by-seller/:sellerId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = await orders.listSellerOrders(req.actor, req.params.sellerId!);
    res.json({ data });
  }),
);

ordersRouter.get(
  '/:orderId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = await orders.getOrderForActor(req.actor, req.params.orderId!);
    res.json({ data });
  }),
);
