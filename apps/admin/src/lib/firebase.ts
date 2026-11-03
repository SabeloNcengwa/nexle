import { createFirebaseClient } from '@mavundla/client';

export const firebase = createFirebaseClient(
  {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? 'demo-api-key',
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? 'localhost',
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? 'demo-mavundla',
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? 'demo-mavundla.appspot.com',
    appId: import.meta.env.VITE_FIREBASE_APP_ID ?? 'demo-app-id',
  },
  { useEmulators: import.meta.env.VITE_USE_EMULATORS === 'true' },
);

export const firebaseAuth = firebase.auth;
