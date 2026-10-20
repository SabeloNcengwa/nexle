import { describe, expect, it } from 'vitest';
import {
  allocateDeliveryBySeller,
  priceOrderLine,
  resolveUnitPriceCents,
  sumLineSubtotals,
} from './pricing.js';

describe('pricing', () => {
  it('prefers promotional price when lower', () => {
    expect(resolveUnitPriceCents(2000, 1500)).toBe(1500);
    expect(resolveUnitPriceCents(2000, 2500)).toBe(2000);
  });

  it('prices a line with half-up commission', () => {
    const line = priceOrderLine({
      productId: 'p1',
      sellerId: 's1',
      sku: 'SKU',
      title: 'Item',
      quantity: 2,
      unitPriceCents: 1005,
      taxClassification: 'standard',
      commissionPlanId: 'plan1',
      commissionPercentageBps: 1000,
      commissionPlanVersion: 1,
    });
    expect(line.lineSubtotalCents).toBe(2010);
    expect(line.platformCommissionCents).toBe(201);
    expect(line.sellerProceedsCents).toBe(1809);
  });

  it('allocates mock delivery per seller group', () => {
    const lines = [
      priceOrderLine({
        productId: 'p1',
        sellerId: 's1',
        sku: 'A',
        title: 'A',
        quantity: 1,
        unitPriceCents: 1000,
        taxClassification: 'standard',
        commissionPlanId: 'plan1',
        commissionPercentageBps: 1000,
        commissionPlanVersion: 1,
      }),
      priceOrderLine({
        productId: 'p2',
        sellerId: 's2',
        sku: 'B',
        title: 'B',
        quantity: 1,
        unitPriceCents: 60_000,
        taxClassification: 'standard',
        commissionPlanId: 'plan1',
        commissionPercentageBps: 1000,
        commissionPlanVersion: 1,
      }),
    ];
    const { quotes, deliveryTotalCents } = allocateDeliveryBySeller(lines);
    expect(quotes).toHaveLength(2);
    expect(quotes.find((q) => q.sellerId === 's1')?.deliveryCents).toBe(5000);
    expect(quotes.find((q) => q.sellerId === 's2')?.deliveryCents).toBe(0);
    expect(deliveryTotalCents).toBe(5000);
    expect(sumLineSubtotals(lines)).toBe(61_000);
  });
});
