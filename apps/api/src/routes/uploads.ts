import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';
import * as uploads from '../services/uploads.js';

export const uploadsRouter = Router();

uploadsRouter.post(
  '/sign',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = await uploads.createSignedUpload(req.actor, req.body);
    res.json({ data });
  }),
);
