import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
  type App,
  type Credential,
} from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import type { Env } from './env.js';
import { initPostgres } from '../db/postgres.js';
import { createStore, type FirestoreStore } from '../db/store.js';
import { initSupabase } from './supabase.js';

let app: App | undefined;
let store: FirestoreStore | undefined;

/** Prefer inline SA JSON (Render); else ADC / GOOGLE_APPLICATION_CREDENTIALS. */
function resolveCredential(): Credential {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) {
    return applicationDefault();
  }
  try {
    const jsonText = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
    const sa = JSON.parse(jsonText) as {
      project_id?: string;
      client_email?: string;
      private_key?: string;
    };
    if (!sa.client_email || !sa.private_key) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON missing client_email or private_key');
    }
    return cert(sa as Parameters<typeof cert>[0]);
  } catch (err) {
    throw new Error(
      `Invalid FIREBASE_SERVICE_ACCOUNT_JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/** Initialise Firebase Auth + Supabase Postgres/Storage. */
export function initFirebase(env: Env): App {
  if (getApps().length > 0) {
    app = getApps()[0];
  } else {
    const usingAuthEmulator = Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST);
    app = initializeApp({
      projectId: env.FIREBASE_PROJECT_ID,
      ...(usingAuthEmulator ? {} : { credential: resolveCredential() }),
    });
  }

  if (env.SUPABASE_DB_URL) {
    initPostgres(env);
    store = createStore();
  }
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    initSupabase(env);
  }

  return app!;
}

/** Document store backed by Supabase Postgres (Firestore-compatible API). */
export function db(): FirestoreStore {
  if (!store) {
    throw new Error(
      'Database not initialised. Set SUPABASE_DB_URL and call initFirebase() before using db().',
    );
  }
  return store;
}

export function auth() {
  return getAuth();
}
