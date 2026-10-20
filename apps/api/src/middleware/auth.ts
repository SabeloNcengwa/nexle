import type { Actor, PlatformRole, SellerMember } from '@mavundla/shared';
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

export async function resolveActor(uid: string, email: string, name?: string): Promise<Actor> {
  const userRef = db().collection('users').doc(uid);
  const userSnap = await userRef.get();

  let displayName = name ?? email;
  let platformRoles: PlatformRole[] = [];
  let status: Actor['status'] = 'active';

  if (!userSnap.exists) {
    const profile = {
      uid,
      email,
      displayName,
      platformRoles: [] as PlatformRole[],
      status: 'active' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await userRef.set(profile);
  } else {
    const data = userSnap.data()!;
    displayName = (data.displayName as string | undefined) ?? displayName;
    platformRoles = asPlatformRoles(data.platformRoles);
    status = (data.status as Actor['status'] | undefined) ?? 'active';
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
    req.actor = await resolveActor(decoded.uid, decoded.email ?? '', decoded.name);
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
