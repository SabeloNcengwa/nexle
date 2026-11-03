import { z } from 'zod';
import type { Actor } from '@mavundla/shared';
import { bucketForStoragePath, STORAGE_BUCKETS, supabase } from '../config/supabase.js';
import { AppError } from '../lib/errors.js';
import { requireAuthenticatedUser } from '../permissions/helpers.js';

const signUploadSchema = z.object({
  path: z.string().min(3).max(512),
  contentType: z.string().min(3).max(128),
  upsert: z.boolean().optional(),
});

function assertPathAllowed(actor: Actor, path: string): void {
  if (path.includes('..') || path.startsWith('/')) {
    throw new AppError('INVALID_PATH', 'Invalid storage path', 400);
  }

  const sellerDoc = path.match(/^sellerApplications\/([^/]+)\/docs\/([^/]+)\//);
  if (sellerDoc) {
    if (sellerDoc[2] !== actor.uid) {
      throw new AppError('FORBIDDEN', 'You can only upload documents under your own uid path', 403);
    }
    return;
  }

  const productImage = path.match(/^sellers\/([^/]+)\/products\/([^/]+)\//);
  if (productImage) {
    const sellerId = productImage[1]!;
    const isMember = actor.sellerMemberships.some(
      (m) => m.sellerId === sellerId && m.status === 'active',
    );
    if (!isMember) {
      throw new AppError('FORBIDDEN', 'Not a member of this seller account', 403);
    }
    return;
  }

  throw new AppError('INVALID_PATH', 'Path must be a seller document or product image path', 400);
}

export async function createSignedUpload(
  actor: Actor | undefined,
  body: unknown,
): Promise<{
  bucket: string;
  path: string;
  signedUrl: string;
  token: string;
  contentType: string;
}> {
  requireAuthenticatedUser(actor);
  const input = signUploadSchema.parse(body);
  assertPathAllowed(actor, input.path);

  const bucket = bucketForStoragePath(input.path);
  const { data, error } = await supabase().storage
    .from(bucket)
    .createSignedUploadUrl(input.path, { upsert: input.upsert ?? true });

  if (error || !data) {
    throw new AppError(
      'UPLOAD_SIGN_FAILED',
      error?.message ?? 'Could not create signed upload URL',
      502,
    );
  }

  return {
    bucket,
    path: input.path,
    signedUrl: data.signedUrl,
    token: data.token,
    contentType: input.contentType,
  };
}

export async function createSignedReadUrl(
  path: string,
  expiresInSeconds = 900,
): Promise<{ url: string; expiresAt: string; bucket: string }> {
  const bucket = bucketForStoragePath(path);
  const { data, error } = await supabase().storage
    .from(bucket)
    .createSignedUrl(path, expiresInSeconds);

  if (error || !data?.signedUrl) {
    throw new AppError(
      'SIGNED_URL_FAILED',
      error?.message ?? 'Could not create signed download URL',
      502,
    );
  }

  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();
  return { url: data.signedUrl, expiresAt, bucket };
}

export function publicProductImageUrl(path: string): string {
  const { data } = supabase().storage.from(STORAGE_BUCKETS.productImages).getPublicUrl(path);
  return data.publicUrl;
}
