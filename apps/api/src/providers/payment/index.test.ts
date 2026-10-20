import { describe, expect, it } from 'vitest';
import { getPaymentProvider } from './index.js';

describe('getPaymentProvider', () => {
  it('returns mock by default', () => {
    const prev = process.env.PAYMENT_PROVIDER;
    delete process.env.PAYMENT_PROVIDER;
    expect(getPaymentProvider('http://localhost').name).toBe('mock');
    process.env.PAYMENT_PROVIDER = prev;
  });

  it('returns pending diligence adapter for named marketplace without keys', async () => {
    process.env.PAYMENT_PROVIDER = 'paystack_marketplace';
    delete process.env.PAYMENT_DILIGENCE_SIGNED;
    delete process.env.PAYMENT_PROVIDER_API_KEY;
    const provider = getPaymentProvider('http://localhost');
    expect(provider.name).toBe('paystack_marketplace');
    await expect(provider.initialiseCheckout({} as never)).rejects.toThrow(
      /PAYMENT_DILIGENCE_SIGNED/,
    );
    delete process.env.PAYMENT_PROVIDER;
  });
});
