import {
  computeRatingSummary,
  createProductReviewSchema,
  listProductReviewsQuerySchema,
  moderateProductReviewSchema,
  type Actor,
  type ProductReview,
  type ProductRatingSummary,
} from '@mavundla/shared';
import { db } from '../config/firebase.js';
import { AppError } from '../lib/errors.js';
import {
  hasPlatformRole,
  requireAuthenticatedUser,
  requirePlatformPermission,
} from '../permissions/helpers.js';
import { writeAuditLog } from './audit.js';

function mapReview(id: string, data: FirebaseFirestore.DocumentData): ProductReview {
  return {
    id,
    productId: String(data.productId),
    sellerId: String(data.sellerId),
    orderId: String(data.orderId),
    authorUid: String(data.authorUid),
    authorDisplayName: String(data.authorDisplayName ?? 'Customer'),
    rating: Number(data.rating),
    title: String(data.title),
    body: String(data.body),
    status: data.status,
    moderation: data.moderation,
    createdAt: String(data.createdAt),
    updatedAt: String(data.updatedAt),
  };
}

async function recomputeProductRating(productId: string): Promise<ProductRatingSummary> {
  const snap = await db()
    .collection('reviews')
    .where('productId', '==', productId)
    .where('status', '==', 'published')
    .get();
  const summary = computeRatingSummary(snap.docs.map((d) => Number(d.data().rating)));
  await db().collection('products').doc(productId).update({
    ratingSummary: summary,
    updatedAt: new Date().toISOString(),
  });
  return summary;
}

export async function createProductReview(
  actor: Actor | undefined,
  body: unknown,
): Promise<ProductReview> {
  requireAuthenticatedUser(actor);
  const input = createProductReviewSchema.parse(body);

  const productSnap = await db().collection('products').doc(input.productId).get();
  if (!productSnap.exists || productSnap.data()!.status !== 'active') {
    throw new AppError('PRODUCT_INELIGIBLE', 'Product is not available for review', 400);
  }
  const sellerId = String(productSnap.data()!.sellerId);

  const orderSnap = await db().collection('orders').doc(input.orderId).get();
  if (!orderSnap.exists) {
    throw new AppError('ORDER_NOT_FOUND', 'Order not found', 404);
  }
  const order = orderSnap.data()!;
  if (String(order.customerUid) !== actor.uid) {
    throw new AppError('FORBIDDEN', 'Order does not belong to you', 403);
  }
  if (order.status !== 'paid') {
    throw new AppError('ORDER_NOT_ELIGIBLE', 'Only paid orders can be reviewed', 400);
  }

  const lines = (order.lines ?? []) as Array<{ productId: string }>;
  if (!lines.some((l) => l.productId === input.productId)) {
    throw new AppError('PRODUCT_NOT_IN_ORDER', 'Product was not purchased on this order', 400);
  }

  const existing = await db()
    .collection('reviews')
    .where('productId', '==', input.productId)
    .where('authorUid', '==', actor.uid)
    .limit(1)
    .get();
  if (!existing.empty) {
    throw new AppError('REVIEW_EXISTS', 'You have already reviewed this product', 409);
  }

  const now = new Date().toISOString();
  const ref = db().collection('reviews').doc();
  const doc = {
    productId: input.productId,
    sellerId,
    orderId: input.orderId,
    authorUid: actor.uid,
    authorDisplayName: actor.displayName || 'Customer',
    rating: input.rating,
    title: input.title,
    body: input.body,
    status: 'published' as const,
    createdAt: now,
    updatedAt: now,
  };
  await ref.set(doc);
  await recomputeProductRating(input.productId);
  await writeAuditLog({
    actorUid: actor.uid,
    action: 'review.created',
    resourceType: 'reviews',
    resourceId: ref.id,
    metadata: { productId: input.productId, rating: input.rating },
  });
  return mapReview(ref.id, doc);
}

export async function listProductReviews(query: unknown): Promise<{
  items: ProductReview[];
  nextCursor: string | null;
  summary: ProductRatingSummary;
}> {
  const input = listProductReviewsQuerySchema.parse(query);
  let q: FirebaseFirestore.Query = db()
    .collection('reviews')
    .where('productId', '==', input.productId)
    .where('status', '==', 'published')
    .orderBy('createdAt', 'desc')
    .limit(input.limit + 1);

  if (input.cursor) {
    const cursorDoc = await db().collection('reviews').doc(input.cursor).get();
    if (cursorDoc.exists) q = q.startAfter(cursorDoc);
  }

  const snap = await q.get();
  const docs = snap.docs.slice(0, input.limit);
  const items = docs.map((d) => mapReview(d.id, d.data()));
  const hasMore = snap.docs.length > input.limit;
  const nextCursor = hasMore ? docs[docs.length - 1]?.id ?? null : null;

  const product = await db().collection('products').doc(input.productId).get();
  const summary = (product.data()?.ratingSummary as ProductRatingSummary | undefined) ?? {
    averageTimes100: 0,
    count: 0,
  };

  return { items, nextCursor, summary };
}

export async function listReviewsForModeration(
  actor: Actor | undefined,
): Promise<ProductReview[]> {
  requirePlatformPermission(actor, ['super_admin', 'catalogue_moderator', 'support_agent']);
  const snap = await db()
    .collection('reviews')
    .orderBy('createdAt', 'desc')
    .limit(100)
    .get();
  return snap.docs.map((d) => mapReview(d.id, d.data()));
}

export async function moderateProductReview(
  actor: Actor | undefined,
  body: unknown,
): Promise<ProductReview> {
  requirePlatformPermission(actor, ['super_admin', 'catalogue_moderator', 'support_agent']);
  const input = moderateProductReviewSchema.parse(body);
  const ref = db().collection('reviews').doc(input.reviewId);
  const snap = await ref.get();
  if (!snap.exists) throw new AppError('NOT_FOUND', 'Review not found', 404);

  const now = new Date().toISOString();
  await ref.update({
    status: input.decision,
    moderation: {
      reviewerUid: actor!.uid,
      reason: input.reason,
      decidedAt: now,
    },
    updatedAt: now,
  });
  await recomputeProductRating(String(snap.data()!.productId));
  await writeAuditLog({
    actorUid: actor!.uid,
    action: `review.${input.decision}`,
    resourceType: 'reviews',
    resourceId: input.reviewId,
    metadata: { reason: input.reason },
  });
  const updated = await ref.get();
  return mapReview(updated.id, updated.data()!);
}

export async function getReview(
  reviewId: string,
  actor?: Actor,
): Promise<ProductReview> {
  const snap = await db().collection('reviews').doc(reviewId).get();
  if (!snap.exists) throw new AppError('NOT_FOUND', 'Review not found', 404);
  const review = mapReview(snap.id, snap.data()!);
  if (review.status === 'published') return review;
  if (
    actor &&
    (review.authorUid === actor.uid ||
      hasPlatformRole(actor, ['super_admin', 'catalogue_moderator', 'support_agent']))
  ) {
    return review;
  }
  throw new AppError('NOT_FOUND', 'Review not found', 404);
}
