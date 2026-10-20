import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { AppError } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { getCourierProvider, MockCourierProvider } from '../providers/courier/index.js';
import * as notifications from '../services/notifications.js';
import * as returns from '../services/returns.js';
import * as shipments from '../services/shipments.js';
import * as support from '../services/support.js';

export const fulfilmentRouter = Router();

// --- Shipments (static paths before :shipmentId) ---
fulfilmentRouter.post(
  '/shipments/quote',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = await shipments.quoteRates(req.actor, req.body);
    res.json({ data });
  }),
);

fulfilmentRouter.post(
  '/shipments',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = await shipments.createShipment(req.actor, req.body);
    res.status(201).json({ data });
  }),
);

fulfilmentRouter.get(
  '/shipments/by-seller-order/:sellerOrderId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = await shipments.listShipmentsForSellerOrder(
      req.actor,
      req.params.sellerOrderId!,
    );
    res.json({ data });
  }),
);

fulfilmentRouter.get(
  '/shipments/by-order/:orderId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = await shipments.listShipmentsForOrder(req.actor, req.params.orderId!);
    res.json({ data });
  }),
);

fulfilmentRouter.get(
  '/shipments/exceptions/queue',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = await shipments.listExceptionShipments(req.actor);
    res.json({ data });
  }),
);

fulfilmentRouter.post(
  '/shipments/cancel',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = await shipments.cancelShipment(req.actor, req.body);
    res.json({ data });
  }),
);

fulfilmentRouter.post(
  '/shipments/manual-tracking',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = await shipments.applyManualTracking(req.actor, req.body);
    res.json({ data });
  }),
);

fulfilmentRouter.get(
  '/shipments/:shipmentId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = await shipments.getShipment(req.actor, req.params.shipmentId!);
    res.json({ data });
  }),
);

fulfilmentRouter.post(
  '/shipments/:shipmentId/refresh-tracking',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = await shipments.refreshTracking(req.actor, req.params.shipmentId!);
    res.json({ data });
  }),
);

fulfilmentRouter.post(
  '/courier/webhook',
  asyncHandler(async (req, res) => {
    const courier = getCourierProvider();
    const event = await courier.validateWebhook(req.headers as Record<string, string>, req.body);
    const data = await shipments.applyCourierWebhook(event);
    res.status(200).json({ data: { received: true, ...data } });
  }),
);

fulfilmentRouter.post(
  '/courier/mock/advance',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (process.env.NODE_ENV === 'production' && process.env.ALLOW_MOCK_COURIER !== 'true') {
      throw new AppError('FORBIDDEN', 'Mock courier disabled', 403);
    }
    const { providerShipmentRef, status, description } = req.body as {
      providerShipmentRef: string;
      status: string;
      description?: string;
    };
    MockCourierProvider.advanceForTests(
      providerShipmentRef,
      status,
      description ?? `Advanced to ${status}`,
    );
    res.json({ data: { advanced: true } });
  }),
);

// --- Returns ---
fulfilmentRouter.post(
  '/returns',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = await returns.createReturnRequest(req.actor, req.body);
    res.status(201).json({ data });
  }),
);

fulfilmentRouter.post(
  '/returns/review',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = await returns.reviewReturn(req.actor, req.body);
    res.json({ data });
  }),
);

fulfilmentRouter.post(
  '/returns/inspect',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = await returns.inspectReturn(req.actor, req.body);
    res.json({ data });
  }),
);

fulfilmentRouter.get(
  '/returns/queue',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = await returns.listReturnQueue(req.actor);
    res.json({ data });
  }),
);

fulfilmentRouter.get(
  '/returns/by-order/:orderId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = await returns.listReturnsForOrder(req.actor, req.params.orderId!);
    res.json({ data });
  }),
);

fulfilmentRouter.get(
  '/returns/by-seller/:sellerId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = await returns.listSellerReturns(req.actor, req.params.sellerId!);
    res.json({ data });
  }),
);

fulfilmentRouter.post(
  '/returns/:returnId/label',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = await returns.createReturnLabel(req.actor, req.params.returnId!);
    res.json({ data });
  }),
);

fulfilmentRouter.post(
  '/returns/:returnId/received',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = await returns.markReturnReceived(req.actor, req.params.returnId!);
    res.json({ data });
  }),
);

fulfilmentRouter.get(
  '/returns/:returnId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = await returns.getReturn(req.actor, req.params.returnId!);
    res.json({ data });
  }),
);

// --- Support ---
fulfilmentRouter.get(
  '/support/dashboard',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = await support.getSupportDashboard(req.actor);
    res.json({ data });
  }),
);

fulfilmentRouter.get(
  '/support/orders/:orderId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = await support.lookupOrderForSupport(req.actor, req.params.orderId!);
    res.json({ data });
  }),
);

fulfilmentRouter.post(
  '/support/notes',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = await support.addSupportNote(req.actor, req.body);
    res.status(201).json({ data });
  }),
);

fulfilmentRouter.get(
  '/support/notes/:resourceType/:resourceId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = await support.listSupportNotes(
      req.actor,
      req.params.resourceType!,
      req.params.resourceId!,
    );
    res.json({ data });
  }),
);

// --- Notifications ---
fulfilmentRouter.get(
  '/notifications/mine',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = await notifications.listNotificationsForUser(req.actor!.uid);
    res.json({ data });
  }),
);
