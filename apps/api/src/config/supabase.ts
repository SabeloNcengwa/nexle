import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Env } from './env.js';

let client: SupabaseClient | undefined;

export function initSupabase(env: Env): SupabaseClient {
  if (client) return client;
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  }
  client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

export function supabase(): SupabaseClient {
  if (!client) {
    throw new Error('Supabase not initialised — call initSupabase() first');
  }
  return client;
}

export const STORAGE_BUCKETS = {
  sellerDocs: 'seller-docs',
  productImages: 'product-images',
} as const;

export function bucketForStoragePath(path: string): string {
  if (path.startsWith('sellerApplications/')) return STORAGE_BUCKETS.sellerDocs;
  if (path.startsWith('sellers/') && path.includes('/products/')) {
    return STORAGE_BUCKETS.productImages;
  }
  throw new Error(`Cannot resolve storage bucket for path: ${path}`);
}
