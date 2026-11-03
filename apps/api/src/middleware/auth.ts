import type { AccountType, Actor, PlatformRole, SellerMember } from '@mavundla/shared';
import type { NextFunction, Request, Response } from 'express';
import { auth, db } from '../config/firebase.js';
import { AppError } from '../lib/errors.js';

declare global {
  // Express Request augmentation (declaration merging)
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      actor?: Actor;
    }
  }
}

function asPlatformRoles(value: unknown): PlatformRole[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is PlatformRole => typeof v === 'string');
}

function asAccountType(value: unknown): AccountType | undefined {
  return value === 'customer' || value === 'seller' ? value : undefined;
}

/** Prefer an existing Supabase profile for this email when Auth was recreated with a new uid. */
async function reclaimProfileByEmail(
  uid: string,
  email: string,
): Promise<Record<string, unknown> | undefined> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return undefined;

  const snap = await db().collection('users').where('email', '==', normalized).limit(10).get();
  const orphan = snap.docs.find((doc) => doc.id !== uid);
  if (!orphan) {
    // Emails may have been stored with original casing.
    const snapRaw = await db().collection('users').where('email', '==', email).limit(10).get();
    const orphanRaw = snapRaw.docs.find((doc) => doc.id !== uid);
    if (!orphanRaw) return undefined;
    const data = { ...orphanRaw.data() };
    await db().collection('users').doc(uid).set(
      {
        ...data,
        uid,
        email: normalized,
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
    await orphanRaw.ref.delete().catch(() => undefined);
    return (await db().collection('users').doc(uid).get()).data();
  }

  const data = { ...orphan.data() };
  await db().collection('users').doc(uid).set(
    {
      ...data,
      uid,
      email: normalized,
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );
  await orphan.ref.delete().catch(() => undefined);
  return (await db().collection('users').doc(uid).get()).data();
}

export async function resolveActor(
  uid: string,
  email: string,
  name?: string,
  intendedAccountType?: AccountType,
): Promise<Actor> {
  const userRef = db().collection('users').doc(uid);
  const userSnap = await userRef.get();
  const normalizedEmail = email.trim().toLowerCase();

  let displayName = name ?? email;
  let platformRoles: PlatformRole[] = [];
  let status: Actor['status'] = 'active';
  let accountType: AccountType | undefined;

  if (!userSnap.exists) {
    const reclaimed = await reclaimProfileByEmail(uid, normalizedEmail || email);
    if (!reclaimed) {
      // Merge so a concurrent registration PATCH cannot lose accountType.
      const bootstrap: Record<string, unknown> = {
        uid,
        email: normalizedEmail || email,
        displayName,
        platformRoles: [] as PlatformRole[],
        status: 'active' as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      if (intendedAccountType) {
        bootstrap.accountType = intendedAccountType;
      }
      await userRef.set(bootstrap, { merge: true });
    } else if (intendedAccountType && !asAccountType(reclaimed.accountType)) {
      await userRef.set(
        { accountType: intendedAccountType, updatedAt: new Date().toISOString() },
        { merge: true },
      );
    }
    const created = await userRef.get();
    const data = created.data() ?? {};
    displayName = (data.displayName as string | undefined) ?? displayName;
    platformRoles = asPlatformRoles(data.platformRoles);
    status = (data.status as Actor['status'] | undefined) ?? 'active';
    accountType = asAccountType(data.accountType) ?? intendedAccountType;
  } else {
    const data = userSnap.data()!;
    displayName = (data.displayName as string | undefined) ?? displayName;
    platformRoles = asPlatformRoles(data.platformRoles);
    status = (data.status as Actor['status'] | undefined) ?? 'active';
    accountType = asAccountType(data.accountType);
    // First authenticated request during seller registration can still set a missing type.
    if (!accountType && intendedAccountType) {
      await userRef.set(
        { accountType: intendedAccountType, updatedAt: new Date().toISOString() },
        { merge: true },
      );
      accountType = intendedAccountType;
    }
  }

  const memberSnap = await db()
    .collection('sellerMembers')
    .where('uid', '==', uid)
    .where('status', '==', 'active')
    .get();

  const sellerMemberships: SellerMember[] = memberSnap.docs.map((doc) => {
    const d = doc.data();
    return {
      id: doc.id,
      sellerId: String(d.sellerId),
      uid: String(d.uid),
      role: d.role,
      permissions: d.permissions ?? [],
      status: d.status,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    } as SellerMember;
  });

  return {
    uid,
    email,
    displayName,
    accountType,
    platformRoles,
    status,
    sellerMemberships,
  };
}

export async function authMiddleware(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.header('authorization');
    if (!header?.startsWith('Bearer ')) {
      next();
      return;
    }

    const token = header.slice('Bearer '.length).trim();
    if (!token) {
      next();
      return;
    }

    const decoded = await auth().verifyIdToken(token);
    const intended = asAccountType(req.header('x-account-type'));
    req.actor = await resolveActor(
      decoded.uid,
      decoded.email ?? '',
      decoded.name,
      intended,
    );
    next();
  } catch {
    next(new AppError('UNAUTHENTICATED', 'Invalid or expired token', 401));
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.actor) {
    next(new AppError('UNAUTHENTICATED', 'Authentication required', 401));
    return;
  }
  if (req.actor.status !== 'active') {
    next(new AppError('USER_SUSPENDED', 'Account is suspended', 403));
    return;
  }
  next();
}
