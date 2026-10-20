import { z } from 'zod';

export const REVIEW_STATUSES = ['published', 'hidden', 'rejected'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const createProductReviewSchema = z.object({
  productId: z.string().min(1),
  orderId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  title: z.string().min(1).max(120),
  body: z.string().min(10).max(4000),
});

export const moderateProductReviewSchema = z.object({
  reviewId: z.string().min(1),
  decision: z.enum(['published', 'hidden', 'rejected']),
  reason: z.string().max(1000).optional(),
});

export const listProductReviewsQuerySchema = z.object({
  productId: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().optional(),
});

export type CreateProductReviewInput = z.infer<typeof createProductReviewSchema>;
export type ModerateProductReviewInput = z.infer<typeof moderateProductReviewSchema>;

export interface ProductReview {
  id: string;
  productId: string;
  sellerId: string;
  orderId: string;
  authorUid: string;
  authorDisplayName: string;
  rating: number;
  title: string;
  body: string;
  status: ReviewStatus;
  moderation?: {
    reviewerUid?: string;
    reason?: string;
    decidedAt?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface ProductRatingSummary {
  averageTimes100: number;
  count: number;
}

/** Average stored as integer hundredths to avoid float money-style drift (e.g. 450 = 4.50). */
export function computeRatingSummary(
  ratings: number[],
): ProductRatingSummary {
  if (ratings.length === 0) {
    return { averageTimes100: 0, count: 0 };
  }
  const sum = ratings.reduce((a, b) => a + b, 0);
  return {
    count: ratings.length,
    averageTimes100: Math.round((sum * 100) / ratings.length),
  };
}

export function formatAverageRating(summary: ProductRatingSummary): string {
  if (summary.count === 0) return '—';
  return (summary.averageTimes100 / 100).toFixed(1);
}
