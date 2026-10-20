import { addCents, assertNonNegativeCents, calculatePercentageCents, multiplyCents } from './money.js';

export interface PricedLineInput {
  productId: string;
  sellerId: string;
  sku: string;
  title: string;
  quantity: number;
  unitPriceCents: number;
  taxClassification: string;
  commissionPlanId: string;
  commissionPercentageBps: number;
  commissionPlanVersion: number;
}

export interface PricedLine {
  productId: string;
  sellerId: string;
  sku: string;
  title: string;
  quantity: number;
  unitPriceCents: number;
  lineSubtotalCents: number;
  taxClassification: string;
  commissionRuleSnapshot: {
    planId: string;
    version: number;
    percentageBps: number;
    rounding: 'half_up';
  };
  platformCommissionCents: number;
  sellerProceedsCents: number;
}

export interface ShipmentGroupQuote {
  sellerId: string;
  deliveryCents: number;
  serviceCode: string;
  estimateOnly: boolean;
}

/** Resolve purchasable unit price. Prefer promo when lower; never trust the client. */
export function resolveUnitPriceCents(
  priceCents: number,
  promotionalPriceCents?: number,
): number {
  assertNonNegativeCents(priceCents);
  if (promotionalPriceCents === undefined) return priceCents;
  assertNonNegativeCents(promotionalPriceCents);
  return promotionalPriceCents < priceCents ? promotionalPriceCents : priceCents;
}

export function priceOrderLine(input: PricedLineInput): PricedLine {
  if (!Number.isInteger(input.quantity) || input.quantity < 1) {
    throw new Error('quantity must be a positive integer');
  }
  const lineSubtotalCents = multiplyCents(input.unitPriceCents, input.quantity);
  const platformCommissionCents = calculatePercentageCents(
    lineSubtotalCents,
    input.commissionPercentageBps,
    'half_up',
  );
  const sellerProceedsCents = lineSubtotalCents - platformCommissionCents;

  return {
    productId: input.productId,
    sellerId: input.sellerId,
    sku: input.sku,
    title: input.title,
    quantity: input.quantity,
    unitPriceCents: input.unitPriceCents,
    lineSubtotalCents,
    taxClassification: input.taxClassification,
    commissionRuleSnapshot: {
      planId: input.commissionPlanId,
      version: input.commissionPlanVersion,
      percentageBps: input.commissionPercentageBps,
      rounding: 'half_up',
    },
    platformCommissionCents,
    sellerProceedsCents,
  };
}

/** Mock delivery: flat R50 per seller shipment group (estimate, not a courier booking). */
export function mockDeliveryQuoteForSeller(sellerId: string, itemsSubtotalCents: number): ShipmentGroupQuote {
  assertNonNegativeCents(itemsSubtotalCents);
  const deliveryCents = itemsSubtotalCents >= 50_000 ? 0 : 5_000;
  return {
    sellerId,
    deliveryCents,
    serviceCode: 'MOCK_STANDARD',
    estimateOnly: true,
  };
}

export function allocateDeliveryBySeller(
  lines: PricedLine[],
): { quotes: ShipmentGroupQuote[]; deliveryTotalCents: number } {
  const bySeller = new Map<string, number>();
  for (const line of lines) {
    bySeller.set(line.sellerId, addCents(bySeller.get(line.sellerId) ?? 0, line.lineSubtotalCents));
  }
  const quotes: ShipmentGroupQuote[] = [];
  let deliveryTotalCents = 0;
  for (const [sellerId, subtotal] of bySeller) {
    const quote = mockDeliveryQuoteForSeller(sellerId, subtotal);
    quotes.push(quote);
    deliveryTotalCents = addCents(deliveryTotalCents, quote.deliveryCents);
  }
  return { quotes, deliveryTotalCents };
}

export function sumLineSubtotals(lines: PricedLine[]): number {
  return lines.reduce((acc, line) => addCents(acc, line.lineSubtotalCents), 0);
}
