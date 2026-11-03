import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';
import * as geocode from '../services/geocode.js';

export const geocodeRouter = Router();

geocodeRouter.get(
  '/search',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { q, limit } = z
      .object({
        q: z.string().min(1).max(200),
        limit: z.coerce.number().int().min(1).max(8).optional(),
      })
      .parse(req.query);
    const suggestions = await geocode.searchAddresses(q, limit ?? 6);
    res.json({ data: { suggestions } });
  }),
);

geocodeRouter.get(
  '/reverse',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { lat, lng } = z
      .object({
        lat: z.coerce.number(),
        lng: z.coerce.number(),
      })
      .parse(req.query);
    const suggestion = await geocode.reverseAddress(lat, lng);
    res.json({ data: { suggestion } });
  }),
);
