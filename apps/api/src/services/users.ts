import {
  createUserProfileSchema,
  type AccountType,
  type MeResponse,
} from '@mavundla/shared';
import type { Actor } from '@mavundla/shared';
import { db } from '../config/firebase.js';
import { AppError } from '../lib/errors.js';

function asAccountType(value: unknown): AccountType | undefined {
  return value === 'customer' || value === 'seller' ? value : undefined;
}

export async function getMe(actor: Actor): Promise<MeResponse> {
  const snap = await db().collection('users').doc(actor.uid).get();
  if (!snap.exists) {
    throw new AppError('NOT_FOUND', 'User profile not found', 404);
  }
  const data = snap.data()!;
  return {
    uid: actor.uid,
    email: String(data.email ?? actor.email),
    displayName: String(data.displayName ?? actor.displayName),
    phone: data.phone,
    accountType: asAccountType(data.accountType) ?? actor.accountType,
    platformRoles: data.platformRoles ?? [],
    status: data.status ?? 'active',
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    sellerMemberships: actor.sellerMemberships ?? [],
  };
}

export async function updateMe(actor: Actor, body: unknown): Promise<MeResponse> {
  const input = createUserProfileSchema.parse(body);
  const ref = db().collection('users').doc(actor.uid);
  const snap = await ref.get();
  const existing = snap.data() ?? {};
  const existingType = asAccountType(existing.accountType);
  const hasSellerFootprint = (actor.sellerMemberships ?? []).some((m) => m.status === 'active');

  // Allow one-time customer→seller correction when registration raced and locked the wrong type
  // before any seller membership exists. Seller→customer stays locked.
  const allowCustomerToSellerCorrection =
    existingType === 'customer' &&
    input.accountType === 'seller' &&
    !hasSellerFootprint;

  if (
    input.accountType &&
    existingType &&
    existingType !== input.accountType &&
    !allowCustomerToSellerCorrection
  ) {
    throw new AppError(
      'ACCOUNT_TYPE_LOCKED',
      'Account type was set at registration and cannot be changed. Create a separate account to sell or shop.',
      409,
    );
  }

  const patch: Record<string, unknown> = {
    displayName: input.displayName,
    phone: input.phone,
    updatedAt: new Date().toISOString(),
  };
  if (input.accountType && (!existingType || allowCustomerToSellerCorrection)) {
    patch.accountType = input.accountType;
  }

  await ref.set(patch, { merge: true });
  const nextType =
    (patch.accountType as AccountType | undefined) ??
    existingType ??
    input.accountType ??
    actor.accountType;
  return getMe({
    ...actor,
    displayName: input.displayName,
    accountType: nextType,
  });
}
