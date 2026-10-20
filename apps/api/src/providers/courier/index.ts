import { AppError } from '../../lib/errors.js';
import { MockCourierProvider, UnconfiguredCourierProvider } from './mockCourier.js';
import { PendingDiligenceCourierProvider } from './pendingDiligence.js';
import type { CourierProvider } from './types.js';

export type { CourierProvider } from './types.js';
export { MockCourierProvider, UnconfiguredCourierProvider } from './mockCourier.js';

export function getCourierProvider(): CourierProvider {
  const name = process.env.COURIER_PROVIDER ?? 'mock';

  if (name === 'mock') return new MockCourierProvider();
  if (name === 'unconfigured') return new UnconfiguredCourierProvider();

  if (name === 'the_courier_guy' || name === 'bob_go') {
    const diligence = process.env.COURIER_DILIGENCE_SIGNED === 'true';
    const apiKey = process.env.COURIER_PROVIDER_API_KEY?.trim();
    if (!diligence || !apiKey) {
      return new PendingDiligenceCourierProvider(name, {
        missingDiligence: !diligence,
        missingApiKey: !apiKey,
      });
    }
    return new PendingDiligenceCourierProvider(name, {
      missingDiligence: false,
      missingApiKey: false,
      credentialsPresent: true,
    });
  }

  throw new AppError(
    'UNKNOWN_COURIER_PROVIDER',
    `Unknown COURIER_PROVIDER=${name}. Use mock | unconfigured | the_courier_guy | bob_go.`,
    500,
  );
}
