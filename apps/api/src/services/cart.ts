import {
  cartItemInputSchema,
  updateCartItemSchema,
  type Actor,
  type Cart,
  type CartItem,
} from '@mavundla/shared';
import type { DocData } from '../db/types.js';
import { db } from '../config/firebase.js';
import { AppError } from '../lib/errors.js';

const MAX_CART_ITEMS = 50;

function mapCart(id: string, data: DocData): Cart {
  return {
    id,
    ownerUid: data.ownerUid,
    guestToken: data.guestToken,
    items: (data.items ?? []) as CartItem[],
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

export function resolveCartDocId(actor?: Actor, guestCartId?: string): string {
  if (actor) return `user_${actor.uid}`;
  if (guestCartId && /^[a-zA-Z0-9_-]{8,80}$/.test(guestCartId)) return `guest_${guestCartId}`;
  throw new AppError('CART_ID_REQUIRED', 'Provide authentication or X-Guest-Cart-Id', 400);
}

async function loadEligibleLine(
  productId: string,
  sku: string,
  quantity: number,
): Promise<CartItem> {
  const productSnap = await db().collection('products').doc(productId).get();
  if (!productSnap.exists) throw new AppError('NOT_FOUND', 'Product not found', 404);
  const product = productSnap.data()!;
  if (product.status !== 'active') {
    throw new AppError('PRODUCT_INELIGIBLE', 'Product is not available for purchase', 400);
  }

  const sellerSnap = await db().collection('sellers').doc(String(product.sellerId)).get();
  if (!sellerSnap.exists || sellerSnap.data()!.status !== 'active') {
    throw new AppError('SELLER_INELIGIBLE', 'Seller is not eligible', 400);
  }

  const variant = (product.variants as Array<{ sku: string; title?: string }> | undefined)?.find(
    (v) => v.sku === sku,
  );
  if (!variant) throw new AppError('SKU_NOT_FOUND', 'SKU not found on product', 404);

  const inventoryId = `${productId}_${sku}`;
  const invSnap = await db().collection('inventory').doc(inventoryId).get();
  if (!invSnap.exists) throw new AppError('INVENTORY_NOT_FOUND', 'Inventory record missing', 404);
  const inv = invSnap.data()!;
  const available = Number(inv.quantityOnHand) - Number(inv.quantityReserved);
  if (quantity > available) {
    throw new AppError('INSUFFICIENT_STOCK', `Only ${available} available`, 409, { available });
  }

  return {
    productId,
    sellerId: String(product.sellerId),
    sku,
    quantity,
    titleSnapshot: String(product.title),
  };
}

export async function getCart(actor?: Actor, guestCartId?: string): Promise<Cart> {
  const id = resolveCartDocId(actor, guestCartId);
  const snap = await db().collection('carts').doc(id).get();
  if (!snap.exists) {
    const now = new Date().toISOString();
    const empty = {
      ownerUid: actor?.uid,
      guestToken: actor ? undefined : guestCartId,
      items: [],
      createdAt: now,
      updatedAt: now,
    };
    await db().collection('carts').doc(id).set(empty);
    return mapCart(id, empty);
  }
  return mapCart(id, snap.data()!);
}

export async function addCartItem(
  body: unknown,
  actor?: Actor,
  guestCartId?: string,
): Promise<Cart> {
  const input = cartItemInputSchema.parse(body);
  const cartId = resolveCartDocId(actor, guestCartId);
  const line = await loadEligibleLine(input.productId, input.sku, input.quantity);
  const ref = db().collection('carts').doc(cartId);
  const now = new Date().toISOString();

  await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const items: CartItem[] = snap.exists ? [...(snap.data()!.items as CartItem[])] : [];
    const idx = items.findIndex((i) => i.productId === line.productId && i.sku === line.sku);
    if (idx >= 0) {
      const nextQty = items[idx]!.quantity + line.quantity;
      if (nextQty > 99) throw new AppError('VALIDATION_ERROR', 'Quantity too high', 400);
      items[idx] = { ...items[idx]!, quantity: nextQty, titleSnapshot: line.titleSnapshot };
    } else {
      if (items.length >= MAX_CART_ITEMS) {
        throw new AppError('CART_FULL', 'Cart item limit reached', 400);
      }
      items.push(line);
    }
    tx.set(
      ref,
      {
        ownerUid: actor?.uid,
        guestToken: actor ? null : guestCartId,
        items,
        updatedAt: now,
        ...(snap.exists ? {} : { createdAt: now }),
      },
      { merge: true },
    );
  });

  return getCart(actor, guestCartId);
}

export async function updateCartItem(
  body: unknown,
  actor?: Actor,
  guestCartId?: string,
): Promise<Cart> {
  const input = updateCartItemSchema.parse(body);
  const cartId = resolveCartDocId(actor, guestCartId);
  const ref = db().collection('carts').doc(cartId);
  const now = new Date().toISOString();

  if (input.quantity > 0) {
    await loadEligibleLine(input.productId, input.sku, input.quantity);
  }

  await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new AppError('NOT_FOUND', 'Cart not found', 404);
    let items: CartItem[] = [...(snap.data()!.items as CartItem[])];
    if (input.quantity === 0) {
      items = items.filter((i) => !(i.productId === input.productId && i.sku === input.sku));
    } else {
      const idx = items.findIndex((i) => i.productId === input.productId && i.sku === input.sku);
      if (idx < 0) throw new AppError('NOT_FOUND', 'Cart item not found', 404);
      items[idx] = { ...items[idx]!, quantity: input.quantity };
    }
    tx.update(ref, { items, updatedAt: now });
  });

  return getCart(actor, guestCartId);
}

export async function clearCart(actor?: Actor, guestCartId?: string): Promise<Cart> {
  const cartId = resolveCartDocId(actor, guestCartId);
  const now = new Date().toISOString();
  await db().collection('carts').doc(cartId).set(
    {
      items: [],
      updatedAt: now,
      ownerUid: actor?.uid,
      guestToken: actor ? null : guestCartId,
    },
    { merge: true },
  );
  return getCart(actor, guestCartId);
}

/** Merge guest cart into authenticated user cart after sign-in. */
export async function mergeGuestCart(actor: Actor, guestCartId: string): Promise<Cart> {
  const guestId = resolveCartDocId(undefined, guestCartId);
  const guestSnap = await db().collection('carts').doc(guestId).get();
  if (!guestSnap.exists) return getCart(actor);

  const guestItems = (guestSnap.data()!.items as CartItem[]) ?? [];
  for (const item of guestItems) {
    await addCartItem(
      { productId: item.productId, sku: item.sku, quantity: item.quantity },
      actor,
    );
  }
  await db().collection('carts').doc(guestId).delete();
  return getCart(actor);
}
