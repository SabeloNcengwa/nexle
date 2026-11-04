import {
  createProductSchema,
  moderateProductSchema,
  productSearchQuerySchema,
  submitProductForReviewSchema,
  updateInventorySchema,
  updateProductSchema,
  upsertCategorySchema,
  type Category,
  type InventoryRecord,
  type Product,
} from '@mavundla/shared';
import type { DocData } from '../db/types.js';
import type { Actor } from '@mavundla/shared';
import { db } from '../config/firebase.js';
import { AppError } from '../lib/errors.js';
import { assertSellerAllowedInPilot, isSellerAllowedInPilot } from '../config/pilot.js';
import { getRuntimeEnv } from '../config/runtime.js';
import {
  assertSellerPermission,
  hasPlatformRole,
  requireAuthenticatedUser,
  requirePlatformPermission,
} from '../permissions/helpers.js';
import { writeAuditLog } from './audit.js';
import { publicProductImageUrl } from './uploads.js';

function mapProduct(id: string, data: DocData): Product {
  const rawImages = Array.isArray(data.images) ? data.images : [];
  const images = rawImages.map((img: DocData, index: number) => {
    const path = String(img.path ?? '');
    let url: string | undefined;
    if (path && !path.includes('/placeholder.')) {
      try {
        url = publicProductImageUrl(path);
      } catch {
        url = undefined;
      }
    }
    return {
      path,
      contentType: img.contentType as Product['images'][number]['contentType'],
      sortOrder: Number(img.sortOrder ?? index),
      ...(url ? { url } : {}),
    };
  });

  return {
    id,
    sellerId: String(data.sellerId),
    title: String(data.title),
    description: String(data.description),
    categoryId: String(data.categoryId),
    brand: data.brand,
    attributes: data.attributes ?? {},
    images,
    status: data.status,
    moderation: data.moderation,
    variants: data.variants ?? [],
    taxClassification: String(data.taxClassification),
    handlingTimeDays: Number(data.handlingTimeDays ?? 0),
    shippingDimensions: data.shippingDimensions,
    ratingSummary: data.ratingSummary,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

function mapInventory(id: string, data: DocData): InventoryRecord {
  return {
    id,
    productId: String(data.productId),
    sellerId: String(data.sellerId),
    sku: String(data.sku),
    quantityOnHand: Number(data.quantityOnHand ?? 0),
    quantityReserved: Number(data.quantityReserved ?? 0),
    updatedAt: data.updatedAt,
  };
}

export async function upsertCategory(
  actor: Actor | undefined,
  body: unknown,
  categoryId?: string,
): Promise<Category> {
  requirePlatformPermission(actor, ['super_admin', 'catalogue_moderator']);
  const input = upsertCategorySchema.parse(body);
  const now = new Date().toISOString();

  let path: string[] = [];
  if (input.parentId) {
    const parent = await db().collection('categories').doc(input.parentId).get();
    if (!parent.exists) throw new AppError('NOT_FOUND', 'Parent category not found', 404);
    path = [...(parent.data()!.path as string[]), input.parentId];
  }

  const ref = categoryId
    ? db().collection('categories').doc(categoryId)
    : db().collection('categories').doc();

  const doc = {
    name: input.name,
    slug: input.slug,
    parentId: input.parentId ?? null,
    path,
    sortOrder: input.sortOrder,
    isActive: input.isActive,
    updatedAt: now,
    ...(categoryId ? {} : { createdAt: now }),
  };
  await ref.set(doc, { merge: true });
  return { id: ref.id, ...doc };
}

export async function listCategories(includeInactive = false): Promise<Category[]> {
  let query: import("../db/store.js").Query = db().collection('categories');
  if (!includeInactive) {
    query = query.where('isActive', '==', true);
  }
  const snap = await query.orderBy('sortOrder', 'asc').get();
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      name: data.name,
      slug: data.slug,
      parentId: data.parentId ?? null,
      path: data.path ?? [],
      sortOrder: data.sortOrder ?? 0,
      isActive: data.isActive ?? true,
    };
  });
}

/** Stable default category so sellers never type a category ID. */
export async function ensureGeneralCategory(): Promise<string> {
  const ref = db().collection('categories').doc('general');
  const snap = await ref.get();
  if (snap.exists) return ref.id;
  const now = new Date().toISOString();
  await ref.set({
    name: 'General',
    slug: 'general',
    parentId: null,
    path: [],
    sortOrder: 0,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });
  return ref.id;
}

export async function createProduct(actor: Actor | undefined, body: unknown): Promise<Product> {
  requireAuthenticatedUser(actor);
  const input = createProductSchema.parse(body);
  assertSellerPermission(actor, input.sellerId, 'seller:manage_products');

  const seller = await db().collection('sellers').doc(input.sellerId).get();
  if (!seller.exists || seller.data()!.status !== 'active') {
    throw new AppError('SELLER_INELIGIBLE', 'Seller is not eligible to list products', 403);
  }
  assertSellerAllowedInPilot(getRuntimeEnv(), input.sellerId);

  const skus = input.variants.map((v) => v.sku);
  if (new Set(skus).size !== skus.length) {
    throw new AppError('VALIDATION_ERROR', 'Variant SKUs must be unique', 400);
  }

  const categoryId = input.categoryId?.trim() || (await ensureGeneralCategory());
  const initialStock = input.initialStock ?? 10;
  const { initialStock: _stock, categoryId: _cat, ...productFields } = input;

  const now = new Date().toISOString();
  const productRef = db().collection('products').doc();
  const batch = db().batch();

  batch.set(productRef, {
    ...productFields,
    categoryId,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  });

  for (const variant of input.variants) {
    const invId = `${productRef.id}_${variant.sku}`;
    batch.set(db().collection('inventory').doc(invId), {
      productId: productRef.id,
      sellerId: input.sellerId,
      sku: variant.sku,
      quantityOnHand: initialStock,
      quantityReserved: 0,
      updatedAt: now,
    });
  }

  await batch.commit();
  const snap = await productRef.get();
  return mapProduct(productRef.id, snap.data()!);
}

export async function updateProduct(actor: Actor | undefined, body: unknown): Promise<Product> {
  requireAuthenticatedUser(actor);
  const input = updateProductSchema.parse(body);
  const ref = db().collection('products').doc(input.productId);
  const snap = await ref.get();
  if (!snap.exists) throw new AppError('NOT_FOUND', 'Product not found', 404);
  const existing = snap.data()!;
  assertSellerPermission(actor, existing.sellerId, 'seller:manage_products');

  const { productId, ...rest } = input;
  const now = new Date().toISOString();
  // Edits take an active listing offline until the seller publishes again (no admin gate).
  const nextStatus =
    existing.status === 'active' ||
    existing.status === 'rejected' ||
    existing.status === 'pending_review'
      ? 'draft'
      : existing.status;

  await ref.update({
    ...rest,
    status: nextStatus,
    updatedAt: now,
  });

  if (input.variants) {
    for (const variant of input.variants) {
      const invId = `${productId}_${variant.sku}`;
      const invRef = db().collection('inventory').doc(invId);
      const invSnap = await invRef.get();
      if (!invSnap.exists) {
        await invRef.set({
          productId,
          sellerId: existing.sellerId,
          sku: variant.sku,
          quantityOnHand: 0,
          quantityReserved: 0,
          updatedAt: now,
        });
      }
    }
  }

  const updated = await ref.get();
  return mapProduct(ref.id, updated.data()!);
}

export async function submitProductForReview(
  actor: Actor | undefined,
  body: unknown,
): Promise<Product> {
  requireAuthenticatedUser(actor);
  const { productId } = submitProductForReviewSchema.parse(body);
  const ref = db().collection('products').doc(productId);
  const snap = await ref.get();
  if (!snap.exists) throw new AppError('NOT_FOUND', 'Product not found', 404);
  const data = snap.data()!;
  assertSellerPermission(actor, data.sellerId, 'seller:manage_products');

  if (!['draft', 'rejected', 'pending_review'].includes(data.status)) {
    throw new AppError('INVALID_STATE', 'Only draft or rejected products can be published', 409);
  }
  if (!data.images?.length) {
    throw new AppError('INCOMPLETE', 'At least one image is required before publishing', 400);
  }
  const hasRealImage = (data.images as Array<{ path?: string }>).some(
    (img) => img.path && !String(img.path).includes('/placeholder.'),
  );
  if (!hasRealImage) {
    throw new AppError('INCOMPLETE', 'Upload a product photo before publishing', 400);
  }
  assertSellerAllowedInPilot(getRuntimeEnv(), String(data.sellerId));

  const now = new Date().toISOString();
  await ref.update({ status: 'active', updatedAt: now });
  await writeAuditLog({
    actorUid: actor.uid,
    action: 'product.published',
    resourceType: 'products',
    resourceId: productId,
  });
  const updated = await ref.get();
  return mapProduct(ref.id, updated.data()!);
}

export async function moderateProduct(actor: Actor | undefined, body: unknown): Promise<Product> {
  requirePlatformPermission(actor, ['super_admin', 'catalogue_moderator']);
  const input = moderateProductSchema.parse(body);
  const ref = db().collection('products').doc(input.productId);
  const snap = await ref.get();
  if (!snap.exists) throw new AppError('NOT_FOUND', 'Product not found', 404);
  if (snap.data()!.status !== 'pending_review') {
    throw new AppError('INVALID_STATE', 'Product is not pending review', 409);
  }
  if (input.decision === 'active') {
    assertSellerAllowedInPilot(getRuntimeEnv(), String(snap.data()!.sellerId));
  }

  const now = new Date().toISOString();
  await ref.update({
    status: input.decision,
    moderation: {
      reviewerUid: actor.uid,
      reason: input.reason,
      decidedAt: now,
    },
    updatedAt: now,
  });
  await writeAuditLog({
    actorUid: actor.uid,
    action: `product.${input.decision}`,
    resourceType: 'products',
    resourceId: input.productId,
    metadata: { reason: input.reason },
  });
  const updated = await ref.get();
  return mapProduct(ref.id, updated.data()!);
}

export async function getProduct(
  productId: string,
  actor?: Actor,
): Promise<Product & { availability?: Array<{ sku: string; available: number }> }> {
  const snap = await db().collection('products').doc(productId).get();
  if (!snap.exists) throw new AppError('NOT_FOUND', 'Product not found', 404);
  const data = snap.data()!;
  const product = mapProduct(productId, data);

  const canSeePrivate =
    product.status === 'active' ||
    (actor &&
      (hasPlatformRole(actor, ['super_admin', 'catalogue_moderator', 'support_agent']) ||
        actor.sellerMemberships.some(
          (m) => m.sellerId === product.sellerId && m.status === 'active',
        )));

  if (!canSeePrivate) {
    throw new AppError('NOT_FOUND', 'Product not found', 404);
  }

  if (product.status === 'active') {
    const seller = await db().collection('sellers').doc(product.sellerId).get();
    if (!seller.exists || seller.data()!.status !== 'active') {
      if (!actor || !hasPlatformRole(actor, ['super_admin', 'catalogue_moderator', 'support_agent'])) {
        throw new AppError('NOT_FOUND', 'Product not found', 404);
      }
    }
  }

  const invSnap = await db().collection('inventory').where('productId', '==', productId).get();
  const availability = invSnap.docs.map((d) => {
    const inv = d.data();
    return {
      sku: String(inv.sku),
      available: Math.max(0, Number(inv.quantityOnHand) - Number(inv.quantityReserved)),
    };
  });

  return { ...product, availability };
}

export async function searchProducts(query: unknown): Promise<{
  items: Product[];
  nextCursor: string | null;
}> {
  const input = productSearchQuerySchema.parse(query);
  let q: import("../db/store.js").Query = db()
    .collection('products')
    .where('status', '==', 'active');

  if (input.categoryId) {
    q = q.where('categoryId', '==', input.categoryId);
  }
  if (input.sellerId) {
    q = q.where('sellerId', '==', input.sellerId);
  }

  q = q.orderBy('updatedAt', 'desc').limit(input.limit + 1);

  if (input.cursor) {
    const cursorDoc = await db().collection('products').doc(input.cursor).get();
    if (cursorDoc.exists) {
      q = q.startAfter(cursorDoc);
    }
  }

  const snap = await q.get();
  let items = snap.docs.map((d) => mapProduct(d.id, d.data()));

  if (input.q) {
    const needle = input.q.toLowerCase();
    items = items.filter(
      (p) =>
        p.title.toLowerCase().includes(needle) ||
        p.description.toLowerCase().includes(needle) ||
        (p.brand ?? '').toLowerCase().includes(needle),
    );
  }

  // Filter out suspended sellers
  const sellerIds = [...new Set(items.map((p) => p.sellerId))];
  const sellerSnaps = await Promise.all(
    sellerIds.map((id) => db().collection('sellers').doc(id).get()),
  );
  const env = getRuntimeEnv();
  const activeSellers = new Set(
    sellerSnaps
      .filter(
        (s) =>
          s.exists &&
          s.data()!.status === 'active' &&
          isSellerAllowedInPilot(env, s.id),
      )
      .map((s) => s.id),
  );
  items = items.filter((p) => activeSellers.has(p.sellerId));

  const hasMore = snap.docs.length > input.limit;
  const page = hasMore ? items.slice(0, input.limit) : items;
  const nextCursor = hasMore ? snap.docs[input.limit - 1]?.id ?? null : null;

  return { items: page, nextCursor };
}

export async function listSellerProducts(
  actor: Actor | undefined,
  sellerId: string,
): Promise<Product[]> {
  requireAuthenticatedUser(actor);
  assertSellerPermission(actor, sellerId, 'seller:read');
  const snap = await db()
    .collection('products')
    .where('sellerId', '==', sellerId)
    .orderBy('updatedAt', 'desc')
    .limit(100)
    .get();
  return snap.docs.map((d) => mapProduct(d.id, d.data()));
}

export async function listPendingProducts(actor: Actor | undefined): Promise<Product[]> {
  requirePlatformPermission(actor, ['super_admin', 'catalogue_moderator']);
  const snap = await db()
    .collection('products')
    .where('status', '==', 'pending_review')
    .orderBy('updatedAt', 'desc')
    .limit(50)
    .get();
  return snap.docs.map((d) => mapProduct(d.id, d.data()));
}

export async function updateInventory(
  actor: Actor | undefined,
  body: unknown,
): Promise<InventoryRecord> {
  requireAuthenticatedUser(actor);
  const input = updateInventorySchema.parse(body);
  const ref = db().collection('inventory').doc(input.inventoryId);
  const snap = await ref.get();
  if (!snap.exists) throw new AppError('NOT_FOUND', 'Inventory record not found', 404);
  const data = snap.data()!;
  assertSellerPermission(actor, data.sellerId, 'seller:manage_inventory');

  const now = new Date().toISOString();
  await ref.update({
    quantityOnHand: input.quantityOnHand,
    updatedAt: now,
  });
  const updated = await ref.get();
  return mapInventory(ref.id, updated.data()!);
}

export async function listInventory(
  actor: Actor | undefined,
  sellerId: string,
  productId?: string,
): Promise<InventoryRecord[]> {
  requireAuthenticatedUser(actor);
  assertSellerPermission(actor, sellerId, 'seller:manage_inventory');
  let q: import("../db/store.js").Query = db().collection('inventory').where('sellerId', '==', sellerId);
  if (productId) {
    q = q.where('productId', '==', productId);
  }
  const snap = await q.limit(200).get();
  return snap.docs.map((d) => mapInventory(d.id, d.data()));
}
