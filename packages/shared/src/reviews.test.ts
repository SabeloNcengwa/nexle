import { describe, expect, it } from 'vitest';
import {
  computeRatingSummary,
  createProductReviewSchema,
  formatAverageRating,
} from './reviews.js';

describe('computeRatingSummary', () => {
  it('returns zeros for empty set', () => {
    expect(computeRatingSummary([])).toEqual({ averageTimes100: 0, count: 0 });
  });

  it('averages integer hundredths', () => {
    expect(computeRatingSummary([5, 4, 3])).toEqual({
      averageTimes100: 400,
      count: 3,
    });
    expect(formatAverageRating({ averageTimes100: 400, count: 3 })).toBe('4.0');
  });
});

describe('createProductReviewSchema', () => {
  it('rejects out-of-range ratings', () => {
    const result = createProductReviewSchema.safeParse({
      productId: 'p1',
      orderId: 'o1',
      rating: 6,
      title: 'Great',
      body: 'This product was excellent quality.',
    });
    expect(result.success).toBe(false);
  });
});
