import { AppError } from '../../lib/errors.js';
import { MockPaymentProvider, UnconfiguredProductionProvider } from './mockProvider.js';
import { PendingDiligencePaymentProvider } from './pendingDiligence.js';
import type { PaymentProvider } from './types.js';

export type { PaymentProvider } from './types.js';
export { MockPaymentProvider, UnconfiguredProductionProvider, MOCK_WEBHOOK_SECRET } from './mockProvider.js';

/**
 * Factory for payment adapters.
 * Named SA marketplace candidates stay behind diligence + credentials —
 * they never silently process live money.
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
