import { createUserProfileSchema, type UserProfile } from '@mavundla/shared';
import { db } from '../config/firebase.js';
import { AppError } from '../lib/errors.js';
import type { Actor } from '@mavundla/shared';

export async function getMe(actor: Actor): Promise<UserProfile> {
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
    platformRoles: data.platformRoles ?? [],
    status: data.status ?? 'active',
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

export async function updateMe(actor: Actor, body: unknown): Promise<UserProfile> {
  const input = createUserProfileSchema.parse(body);
  const ref = db().collection('users').doc(actor.uid);
  await ref.set(
    {
      displayName: input.displayName,
      phone: input.phone,
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );
  return getMe(actor);
}
