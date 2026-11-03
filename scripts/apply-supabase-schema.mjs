/**
 * Apply supabase/migrations SQL + ensure Storage buckets.
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in apps/api/.env
 * Prefers SUPABASE_DB_URL for DDL; falls back to Supabase pg-meta /query if available.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const apiEnvPath = resolve(root, 'apps/api/.env');

function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

const fileEnv = loadEnvFile(apiEnvPath);
const SUPABASE_URL = process.env.SUPABASE_URL || fileEnv.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || fileEnv.SUPABASE_SERVICE_ROLE_KEY;
const DB_URL = process.env.SUPABASE_DB_URL || fileEnv.SUPABASE_DB_URL;
const migrationPath = resolve(root, 'supabase/migrations/20261103140000_init_nexle.sql');

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const sqlText = readFileSync(migrationPath, 'utf8');

async function runViaPostgres(url) {
  const sql = postgres(url, { max: 1, prepare: false, connect_timeout: 30 });
  try {
    await sql.unsafe(sqlText);
    console.log('Schema applied via SUPABASE_DB_URL');
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function runViaPgMeta() {
  const endpoints = [
    `${SUPABASE_URL}/pg/query`,
    `${SUPABASE_URL}/rest/v1/rpc/`,
  ];
  // Split on statements carefully enough for our migration (no $$ bodies with ;)
  // Keep DO/function bodies intact by running whole file when possible.
  const res = await fetch(`${SUPABASE_URL}/pg/query`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sqlText }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`pg/query failed (${res.status}): ${text.slice(0, 500)}`);
  }
  console.log('Schema applied via /pg/query');
  void endpoints;
}

async function ensureBuckets() {
  const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const buckets = [
    {
      id: 'seller-docs',
      public: false,
      fileSizeLimit: 10_485_760,
      allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
    },
    {
      id: 'product-images',
      public: true,
      fileSizeLimit: 5_242_880,
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    },
  ];
  for (const b of buckets) {
    const { data: existing, error: listErr } = await sb.storage.listBuckets();
    if (listErr) throw listErr;
    const found = (existing ?? []).some((x) => x.id === b.id || x.name === b.id);
    if (found) {
      console.log(`Bucket exists: ${b.id}`);
      continue;
    }
    const { error } = await sb.storage.createBucket(b.id, {
      public: b.public,
      fileSizeLimit: b.fileSizeLimit,
      allowedMimeTypes: b.allowedMimeTypes,
    });
    if (error) throw error;
    console.log(`Bucket created: ${b.id}`);
  }
}

try {
  if (DB_URL) {
    await runViaPostgres(DB_URL);
  } else {
    console.log('SUPABASE_DB_URL empty — trying Supabase /pg/query …');
    await runViaPgMeta();
  }
  await ensureBuckets();
  console.log('Done.');
} catch (err) {
  console.error(String(err?.stack || err));
  console.error(
    '\nIf DDL failed, paste supabase/migrations/20261103140000_init_nexle.sql into the Supabase SQL editor,\nthen set SUPABASE_DB_URL in apps/api/.env (Settings → Database → URI).',
  );
  process.exit(1);
}
