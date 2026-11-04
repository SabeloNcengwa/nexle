import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';
import * as catalogue from '../services/catalogue.js';

export const catalogueRouter = Router();

catalogueRouter.get(
  '/categories',
  asyncHandler(async (req, res) => {
    const includeInactive = req.query.includeInactive === 'true';
    const data = await catalogue.listCategories(includeInactive);
    res.json({ data });
  }),
);

catalogueRouter.post(
  '/categories',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = await catalogue.upsertCategory(req.actor, req.body);
    res.status(201).json({ data });
  }),
);

catalogueRouter.post(
  '/category-suggestions',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = await catalogue.suggestCategory(req.actor, req.body);
    res.status(201).json({ data });
  }),
);

catalogueRouter.get(
  '/category-suggestions',
  requireAuth,
  asyncHandler(async (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const data = await catalogue.listCategorySuggestions(req.actor, status);
    res.json({ data });
  }),
);

catalogueRouter.post(
  '/category-suggestions/review',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = await catalogue.reviewCategorySuggestion(req.actor, req.body);
    res.json({ data });
  }),
);

catalogueRouter.get(
  '/products',
  asyncHandler(async (req, res) => {
    const data = await catalogue.searchProducts(req.query);
    res.json({ data });
  }),
);

catalogueRouter.get(
  '/products/pending',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = await catalogue.listPendingProducts(req.actor);
    res.json({ data });
  }),
);

catalogueRouter.get(
  '/products/:productId',
  asyncHandler(async (req, res) => {
    const data = await catalogue.getProduct(req.params.productId!, req.actor);
    res.json({ data });
  }),
);

catalogueRouter.post(
  '/products',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = await catalogue.createProduct(req.actor, req.body);
    res.status(201).json({ data });
  }),
);

catalogueRouter.patch(
  '/products',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = await catalogue.updateProduct(req.actor, req.body);
    res.json({ data });
  }),
);

catalogueRouter.post(
  '/products/submit',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = await catalogue.submitProductForReview(req.actor, req.body);
    res.json({ data });
  }),
);

catalogueRouter.post(
  '/products/delete',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = await catalogue.deleteProduct(req.actor, req.body);
    res.json({ data });
  }),
);

catalogueRouter.post(
  '/products/moderate',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = await catalogue.moderateProduct(req.actor, req.body);
    res.json({ data });
  }),
);

catalogueRouter.get(
  '/sellers/:sellerId/products',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = await catalogue.listSellerProducts(req.actor, req.params.sellerId!);
    res.json({ data });
  }),
);

catalogueRouter.get(
  '/sellers/:sellerId/inventory',
  requireAuth,
  asyncHandler(async (req, res) => {
    const productId = typeof req.query.productId === 'string' ? req.query.productId : undefined;
    const data = await catalogue.listInventory(req.actor, req.params.sellerId!, productId);
    res.json({ data });
  }),
);

catalogueRouter.patch(
  '/inventory',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = await catalogue.updateInventory(req.actor, req.body);
    res.json({ data });
  }),
);
