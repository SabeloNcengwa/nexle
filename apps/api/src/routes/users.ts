import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';
import * as users from '../services/users.js';

export const usersRouter = Router();

usersRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = await users.getMe(req.actor!);
    res.json({ data });
  }),
);

usersRouter.patch(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = await users.updateMe(req.actor!, req.body);
    res.json({ data });
  }),
);
