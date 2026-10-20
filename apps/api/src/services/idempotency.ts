import { db } from '../config/firebase.js';
import { AppError } from '../lib/errors.js';

export async function claimIdempotencyKey(
  key: string,
  scope: string,
  ownerUid: string,
): Promise<{ alreadyExists: boolean; existingResourceId?: string }> {
  const id = `${scope}_${key}`;
  const ref = db().collection('idempotencyRecords').doc(id);

  return db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) {
      const data = snap.data()!;
      if (data.ownerUid !== ownerUid) {
        throw new AppError('IDEMPOTENCY_CONFLICT', 'Idempotency key belongs to another user', 409);
      }
      return {
        alreadyExists: true,
        existingResourceId: data.resourceId as string | undefined,
      };
    }
    tx.set(ref, {
      key,
      scope,
      ownerUid,
      createdAt: new Date().toISOString(),
    });
    return { alreadyExists: false };
  });
}

export async function attachIdempotencyResource(
  key: string,
  scope: string,
  resourceId: string,
): Promise<void> {
  const id = `${scope}_${key}`;
  await db().collection('idempotencyRecords').doc(id).set({ resourceId }, { merge: true });
}
