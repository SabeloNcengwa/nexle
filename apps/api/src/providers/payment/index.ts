import { AppError } from '../../lib/errors.js';
import { MockPaymentProvider, UnconfiguredProductionProvider } from './mockProvider.js';
import { PendingDiligencePaymentProvider } from './pendingDiligence.js';
import type { PaymentProvider } from './types.js';

export type { PaymentProvider } from './types.js';
export { MockPaymentProvider, UnconfiguredProductionProvider, MOCK_WEBHOOK_SECRET } from './mockProvider.js';

/**
 * Factory for payment adapters.
 *
 * Money model (Bolt-style, single merchant account):
 * 1. Customer pays Nexle’s Paystack (one platform account — not per-seller).
 * 2. Return URL + webhook race via POST /v1/payments/confirm — sellerOrders → confirmed
 *    immediately so fulfilment/shipping is not delayed.
 * 3. On paid order, ledger posts sale + 8% platform_commission; seller pending = 92%.
 * 4. After hold, seller withdraws to business bank — fee/hold affect payouts only.
 *
 * Named SA marketplace candidates stay behind diligence + credentials —
 * they never silently process live money until signed off.
 */
export function getPaymentProvider(publicWebBaseUrl: string): PaymentProvider {
  const name = process.env.PAYMENT_PROVIDER ?? 'mock';

  if (name === 'mock') return new MockPaymentProvider(publicWebBaseUrl);
  if (name === 'unconfigured') return new UnconfiguredProductionProvider();

  if (name === 'paystack_marketplace' || name === 'ozow_marketplace') {
    const diligence = process.env.PAYMENT_DILIGENCE_SIGNED === 'true';
    const apiKey = process.env.PAYMENT_PROVIDER_API_KEY?.trim();
    if (!diligence || !apiKey) {
      return new PendingDiligencePaymentProvider(name, {
        missingDiligence: !diligence,
        missingApiKey: !apiKey,
      });
    }
    return new PendingDiligencePaymentProvider(name, {
      missingDiligence: false,
      missingApiKey: false,
      credentialsPresent: true,
    });
  }

  throw new AppError(
    'UNKNOWN_PAYMENT_PROVIDER',
    `Unknown PAYMENT_PROVIDER=${name}. Use mock | unconfigured | paystack_marketplace | ozow_marketplace.`,
    500,
  );
}
