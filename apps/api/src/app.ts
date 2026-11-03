import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import type { Env } from './config/env.js';
import { getReadiness } from './config/productionGuards.js';
import { setRuntimeEnv } from './config/runtime.js';
import { authMiddleware } from './middleware/auth.js';
import { correlationMiddleware } from './middleware/correlation.js';
import { errorHandler } from './middleware/errorHandler.js';
import {
  corsOriginAllowlist,
  requireAllowedHost,
  requireHttps,
} from './middleware/networkSecurity.js';
import { rateLimit } from './middleware/rateLimit.js';
import { cartRouter } from './routes/cart.js';
import { catalogueRouter } from './routes/catalogue.js';
import { checkoutRouter } from './routes/checkout.js';
import { financeRouter } from './routes/finance.js';
import { fulfilmentRouter } from './routes/fulfilment.js';
import { jobsRouter } from './routes/jobs.js';
import { ordersRouter } from './routes/orders.js';
import { paymentsRouter } from './routes/payments.js';
import { reviewsRouter } from './routes/reviews.js';
import { sellersRouter } from './routes/sellers.js';
import { uploadsRouter } from './routes/uploads.js';
import { usersRouter } from './routes/users.js';

export function createApp(env: Env) {
  setRuntimeEnv(env);
  const app = express();
  app.set('trust proxy', 1);
  app.set('webBaseUrl', env.WEB_BASE_URL);
  app.set('adminBaseUrl', env.ADMIN_BASE_URL);
  app.set('envConfig', env);
  app.disable('x-powered-by');

  const allowedOrigins = corsOriginAllowlist(env);

  app.use(requireHttps(env));
  app.use(requireAllowedHost(env));

  app.use(
    helmet({
      frameguard: { action: 'deny' },
      noSniff: true,
      referrerPolicy: { policy: 'no-referrer' },
      hidePoweredBy: true,
      crossOriginResourcePolicy: { policy: 'same-site' },
      crossOriginOpenerPolicy: { policy: 'same-origin' },
      hsts:
        env.NODE_ENV === 'production'
          ? { maxAge: 31_536_000, includeSubDomains: true, preload: true }
          : false,
      contentSecurityPolicy: false, // API returns JSON only; CSP set on Hosting SPAs
    }),
  );

  app.use(
    cors({
      origin(origin, callback) {
        // Non-browser clients (webhooks, jobs, curl) send no Origin — allow; auth still required.
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(null, false);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Authorization',
        'Content-Type',
        'X-Guest-Cart-Id',
        'X-Account-Type',
        'X-Correlation-Id',
        'X-Jobs-Secret',
        'X-Requested-With',
      ],
      exposedHeaders: ['X-Correlation-Id'],
      maxAge: 600,
      optionsSuccessStatus: 204,
    }),
  );

  // Preserve raw body for provider webhook HMAC (Paystack / mock) verification.
  app.use(
    express.json({
      limit: '256kb',
      verify: (req, _res, buf) => {
        (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );
  app.use(correlationMiddleware);
  app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));
  app.use(rateLimit({ windowMs: 60_000, max: 180 }));
  app.use(authMiddleware);

  app.get('/health', (_req, res) => {
    res.json({ data: { status: 'ok', service: 'mavundla-api', phase: 6 } });
  });

  app.get('/ready', (_req, res) => {
    const readiness = getReadiness(env);
    if (!readiness.ready) {
      res.status(503).json({
        data: { status: 'not_ready', reasons: readiness.reasons },
      });
      return;
    }
    res.json({
      data: {
        status: 'ready',
        pilotMode: env.PILOT_MODE,
        paymentProvider: env.PAYMENT_PROVIDER,
        courierProvider: env.COURIER_PROVIDER,
        emailProvider: env.EMAIL_PROVIDER,
        smsProvider: env.SMS_PROVIDER,
      },
    });
  });

  app.use('/v1/users', usersRouter);
  app.use('/v1/uploads', uploadsRouter);
  app.use('/v1/sellers', sellersRouter);
  app.use('/v1/catalogue', catalogueRouter);
  app.use('/v1/cart', cartRouter);
  app.use('/v1/checkout', checkoutRouter);
  app.use('/v1/orders', ordersRouter);
  app.use('/v1/payments', paymentsRouter);
  app.use('/v1/finance', financeRouter);
  app.use('/v1/fulfilment', fulfilmentRouter);
  app.use('/v1/reviews', reviewsRouter);
  app.use('/v1/jobs', jobsRouter);

  app.use(errorHandler);
  return app;
}
