import { initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';

export interface FirebaseClientConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  appId: string;
}

export interface FirebaseClient {
  app: FirebaseApp;
  auth: Auth;
  connectEmulatorsIfNeeded: () => void;
}

/** Firebase Auth only — database and file uploads use Supabase. */
export function createFirebaseClient(
  config: FirebaseClientConfig,
  options: { useEmulators?: boolean } = {},
): FirebaseClient {
  const app = initializeApp(config);
  const auth = getAuth(app);
  let emulatorsConnected = false;

  return {
    app,
    auth,
    connectEmulatorsIfNeeded() {
      if (emulatorsConnected || !options.useEmulators) return;
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      emulatorsConnected = true;
    },
  };
}
