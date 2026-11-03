/** Integer-cent money helpers. Never use floating point for financial math. */

export type CurrencyCode = 'ZAR';

export interface Money {
  amountCents: number;
  currency: CurrencyCode;
}

export function assertNonNegativeCents(amountCents: number): void {
  if (!Number.isInteger(amountCents) || amountCents < 0) {
    throw new Error('amountCents must be a non-negative integer');
  }
}

export function addCents(a: number, b: number): number {
  assertNonNegativeCents(a);
  assertNonNegativeCents(b);
  return a + b;
}

export function subtractCents(a: number, b: number): number {
  assertNonNegativeCents(a);
  assertNonNegativeCents(b);
  if (b > a) {
    throw new Error('insufficient cents');
  }
  return a - b;
}

export function multiplyCents(amountCents: number, quantity: number): number {
  assertNonNegativeCents(amountCents);
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new Error('quantity must be a non-negative integer');
  }
  return amountCents * quantity;
}

/**
 * Default Nexle platform fee (Bolt-style): charged on sale subtotal before seller payout.
 * 800 bps = 8.00%. Customer pays Nexle; seller withdraws 92% of merchandise after the hold.
 */
export const DEFAULT_PLATFORM_COMMISSION_BPS = 800;

/** percentageBps: 1000 = 10.00%, 800 = 8.00% */
export function calculatePercentageCents(
  amountCents: number,
  percentageBps: number,
  rounding: 'half_up' | 'floor' = 'half_up',
): number {
  assertNonNegativeCents(amountCents);
  if (!Number.isInteger(percentageBps) || percentageBps < 0) {
    throw new Error('percentageBps must be a non-negative integer');
  }
  const numerator = amountCents * percentageBps;
  if (rounding === 'floor') {
    return Math.floor(numerator / 10000);
  }
  // half-up integer division
  return Math.floor((numerator + 5000) / 10000);
}

export function formatZarFromCents(amountCents: number): string {
  assertNonNegativeCents(amountCents);
  const whole = Math.floor(amountCents / 100);
  const frac = amountCents % 100;
  return `R ${whole}.${frac.toString().padStart(2, '0')}`;
}
