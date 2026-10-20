import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import * as cart from '../services/cart.js';

export const cartRouter = Router();

function guestId(req: { header: (name: string) => string | undefined }): string | undefined {
  return req.header('x-guest-cart-id') ?? undefined;
}

cartRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const data = await cart.getCart(req.actor, guestId(req));
    res.json({ data });
  }),
);

cartRouter.post(
  '/items',
  asyncHandler(async (req, res) => {
    const data = await cart.addCartItem(req.body, req.actor, guestId(req));
    res.status(201).json({ data });
  }),
);

cartRouter.patch(
  '/items',
  asyncHandler(async (req, res) => {
    const data = await cart.updateCartItem(req.body, req.actor, guestId(req));
    res.json({ data });
  }),
);

cartRouter.delete(
  '/items',
  asyncHandler(async (req, res) => {
    const data = await cart.clearCart(req.actor, guestId(req));
    res.json({ data });
  }),
);

cartRouter.post(
  '/merge',
  asyncHandler(async (req, res) => {
    if (!req.actor) {
      res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required' } });
      return;
    }
    const guestCartId = guestId(req);
    if (!guestCartId) {
      res.status(400).json({ error: { code: 'CART_ID_REQUIRED', message: 'X-Guest-Cart-Id required' } });
      return;
    }
    const data = await cart.mergeGuestCart(req.actor, guestCartId);
    res.json({ data });
  }),
);
