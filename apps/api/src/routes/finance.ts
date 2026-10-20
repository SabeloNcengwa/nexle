import { releaseSellerEligibilitySchema } from '@mavundla/shared';
import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';
import {
  assertSellerPermission,
  hasPlatformRole,
  requirePlatformPermission,
} from '../permissions/helpers.js';
import * as commissions from '../services/commissions.js';
import * as ledger from '../services/ledger.js';
import * as payouts from '../services/payouts.js';
import * as refunds from '../services/refunds.js';

export const financeRouter = Router();

financeRouter.post(
  '/refunds',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = await refunds.requestRefund(req.actor, req.body);
    res.status(201).json({ data });
  }),
);

financeRouter.post(
  '/refunds/review',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = await refunds.reviewRefund(req.actor, req.body);
    res.json({ data });
  }),
);

financeRouter.post(
  '/refunds/:refundId/submit-provider',
  requireAuth,
  asyncHandler(async (req, res) => {
    const webBaseUrl = (req.app.get('webBaseUrl') as string) || 'http://localhost:5173';
    const data = await refunds.submitRefundToProvider(req.actor, req.params.refundId!, webBaseUrl);
    res.json({ data });
  }),
);

financeRouter.post(
  '/refunds/:refundId/reconcile',
  requireAuth,
  asyncHandler(async (req, res) => {
    const webBaseUrl = (req.app.get('webBaseUrl') as string) || 'http://localhost:5173';
    const data = await refunds.reconcileRefundWithProvider(
      req.actor,
      req.params.refundId!,
      webBaseUrl,
    );
    res.json({ data });
  }),
);

financeRouter.get(
  '/refunds/queue',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = await refunds.listRefundQueue(req.actor);
    res.json({ data });
  }),
);

financeRouter.get(
  '/refunds/by-order/:orderId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = await refunds.listRefundsForOrder(req.actor, req.params.orderId!);
    res.json({ data });
  }),
);

financeRouter.get(
  '/ledger/:sellerId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const sellerId = req.params.sellerId!;
    if (hasPlatformRole(req.actor!, ['super_admin', 'finance_operator'])) {
      requirePlatformPermission(req.actor, ['super_admin', 'finance_operator']);
    } else {
      assertSellerPermission(req.actor, sellerId, 'seller:view_finance');
    }
    const entries = await ledger.listSellerLedger(sellerId);
    const balances = await ledger.getSellerBalances(sellerId);
    res.json({ data: { entries, balances } });
  }),
);

financeRouter.post(
  '/eligibility/release',
  requireAuth,
  asyncHandler(async (req, res) => {
    const input = releaseSellerEligibilitySchema.parse(req.body);
    const data = await payouts.autoReleaseEligibleForSeller(
      req.actor,
      input.sellerId,
      input.amountCents,
    );
    res.json({ data });
  }),
);

financeRouter.post(
  '/payouts',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = await payouts.requestPayout(req.actor, req.body);
    res.status(201).json({ data });
  }),
);

financeRouter.post(
  '/payouts/review',
  requireAuth,
  asyncHandler(async (req, res) => {
    const webBaseUrl = (req.app.get('webBaseUrl') as string) || 'http://localhost:5173';
    const data = await payouts.reviewPayout(req.actor, req.body, webBaseUrl);
    res.json({ data });
  }),
);

financeRouter.post(
  '/payouts/:payoutId/reconcile',
  requireAuth,
  asyncHandler(async (req, res) => {
    const webBaseUrl = (req.app.get('webBaseUrl') as string) || 'http://localhost:5173';
    const data = await payouts.reconcilePayoutWithProvider(
      req.actor,
      req.params.payoutId!,
      webBaseUrl,
    );
    res.json({ data });
  }),
);

financeRouter.get(
  '/payouts/queue',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = await payouts.listPayoutQueue(req.actor);
    res.json({ data });
  }),
);

financeRouter.get(
  '/payouts/by-seller/:sellerId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = await payouts.listSellerPayouts(req.actor, req.params.sellerId!);
    res.json({ data });
  }),
);

financeRouter.get(
  '/commission-plans',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = await commissions.listCommissionPlans(req.actor);
    res.json({ data });
  }),
);

financeRouter.post(
  '/commission-plans',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = await commissions.createCommissionPlan(req.actor, req.body);
    res.status(201).json({ data });
  }),
);
