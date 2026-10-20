import { describe, expect, it } from 'vitest';
import {
  addCents,
  calculatePercentageCents,
  formatZarFromCents,
  multiplyCents,
  subtractCents,
} from './money.js';

describe('money helpers', () => {
  it('adds and subtracts integer cents', () => {
    expect(addCents(1999, 1)).toBe(2000);
    expect(subtractCents(2000, 1)).toBe(1999);
  });

  it('rejects floating amounts', () => {
    expect(() => addCents(1.5, 1)).toThrow();
  });

  it('multiplies unit price by quantity', () => {
    expect(multiplyCents(2500, 3)).toBe(7500);
  });

  it('calculates commission with half-up rounding', () => {
    // 10% of R10.05 = 1005 cents * 1000 bps / 10000 = 100.5 → 101
    expect(calculatePercentageCents(1005, 1000, 'half_up')).toBe(101);
    expect(calculatePercentageCents(1005, 1000, 'floor')).toBe(100);
  });

  it('formats ZAR', () => {
    expect(formatZarFromCents(0)).toBe('R 0.00');
    expect(formatZarFromCents(1299)).toBe('R 12.99');
  });
});
