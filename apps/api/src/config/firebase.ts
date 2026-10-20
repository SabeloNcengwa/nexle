import { applicationDefault, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import type { Env } from './env.js';

let app: App | undefined;

export function initFirebase(env: Env): App {
  if (getApps().length > 0) {
    app = getApps()[0];
    return app!;
  }

  const usingEmulators =
    Boolean(process.env.FIRESTORE_EMULATOR_HOST) ||
    Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST);

  app = initializeApp({
    projectId: env.FIREBASE_PROJECT_ID,
    storageBucket: env.FIREBASE_STORAGE_BUCKET,
    ...(usingEmulators ? {} : { credential: applicationDefault() }),
  });

  return app;
}

export function db() {
  return getFirestore();
}

export function auth() {
  return getAuth();
}

export function storage() {
  return getStorage();
}
