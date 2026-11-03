import type { AccountType, MeResponse, UserProfile } from '@mavundla/shared';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { ApiFetch } from './api.js';
import type { FirebaseClient } from './firebase.js';
import { clearGuestCartId, getOrCreateGuestCartId } from './guestCart.js';

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  memberships: MeResponse['sellerMemberships'];
  loading: boolean;
  authError: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    displayName: string,
    accountType: AccountType,
  ) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export interface AuthProviderProps {
  children: ReactNode;
  firebase: FirebaseClient;
  apiFetch: ApiFetch;
  /** Merge guest cart after sign-in (storefront only). */
  mergeGuestCart?: boolean;
}

function mapAuthError(err: unknown): string {
  const code = (err as { code?: string }).code ?? '';
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
    return 'Wrong email or password.';
  }
  if (code === 'auth/unauthorized-domain') {
    return 'This domain is not authorized for sign-in. Add it in Firebase Authentication → Settings → Authorized domains.';
  }
  if (code === 'auth/too-many-requests') {
    return 'Too many attempts. Try again in a few minutes.';
  }
  if (code === 'auth/network-request-failed') {
    return 'Network error. Check your connection and try again.';
  }
  return err instanceof Error ? err.message : 'Sign-in failed.';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function AuthProvider({
  children,
  firebase,
  apiFetch,
  mergeGuestCart = false,
}: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [memberships, setMemberships] = useState<MeResponse['sellerMemberships']>([]);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  /** Survives onAuthStateChanged racing registration PATCH. */
  const pendingAccountTypeRef = useRef<{
    uid: string;
    accountType: AccountType;
    displayName: string;
  } | null>(null);

  const completeProfile = async (
    current: User,
    displayName: string,
    accountType: AccountType,
  ): Promise<MeResponse> => {
    await current.getIdToken(true);
    let lastError: unknown;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const me = await apiFetch<MeResponse>('/v1/users/me', {
          method: 'PATCH',
          headers: { 'X-Account-Type': accountType },
          body: JSON.stringify({ displayName, accountType }),
        });
        if (me.accountType === accountType) {
          return me;
        }
        // Profile exists but type missing/wrong — brief wait for concurrent bootstrap, retry.
        await sleep(120 * (attempt + 1));
      } catch (err) {
        lastError = err;
        await sleep(120 * (attempt + 1));
      }
    }
    if (lastError) throw lastError;
    throw new Error('Could not save account type. Please try again.');
  };

  const loadProfile = async (current: User): Promise<void> => {
    try {
      let me = await apiFetch<MeResponse>('/v1/users/me');
      const pending = pendingAccountTypeRef.current;
      if (
        pending &&
        pending.uid === current.uid &&
        me.accountType !== pending.accountType
      ) {
        me = await completeProfile(current, pending.displayName, pending.accountType);
      }
      if (pending?.uid === current.uid && me.accountType === pending.accountType) {
        pendingAccountTypeRef.current = null;
      }
      setProfile(me);
      setMemberships(me.sellerMemberships ?? []);
      setAuthError(null);
    } catch {
      setProfile(null);
      setMemberships([]);
      setAuthError('Signed in, but your profile could not be loaded. Try again.');
    }
  };

  useEffect(() => {
    firebase.connectEmulatorsIfNeeded();
    return onAuthStateChanged(firebase.auth, (next) => {
      setUser(next);
      if (!next) {
        pendingAccountTypeRef.current = null;
        setProfile(null);
        setMemberships([]);
        setAuthError(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      void (async () => {
        try {
          await loadProfile(next);
          if (mergeGuestCart) {
            try {
              const guestId = localStorage.getItem('mavundla_guest_cart_id');
              if (guestId) {
                getOrCreateGuestCartId();
                await apiFetch('/v1/cart/merge', {
                  method: 'POST',
                  headers: { 'X-Guest-Cart-Id': guestId },
                });
                clearGuestCartId();
              }
            } catch {
              // Non-fatal
            }
          }
        } finally {
          setLoading(false);
        }
      })();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebase]);

  const refreshProfile = async () => {
    const current = firebase.auth.currentUser;
    if (!current) {
      setProfile(null);
      setMemberships([]);
      return;
    }
    await loadProfile(current);
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      memberships,
      loading,
      authError,
      async signIn(email, password) {
        setAuthError(null);
        try {
          await signInWithEmailAndPassword(firebase.auth, email, password);
        } catch (err) {
          const message = mapAuthError(err);
          setAuthError(message);
          throw new Error(message);
        }
      },
      async register(email, password, displayName, accountType) {
        setAuthError(null);
        try {
          const cred = await createUserWithEmailAndPassword(firebase.auth, email, password);
          pendingAccountTypeRef.current = {
            uid: cred.user.uid,
            accountType,
            displayName,
          };
          const me = await completeProfile(cred.user, displayName, accountType);
          pendingAccountTypeRef.current = null;
          setProfile(me);
          setMemberships(me.sellerMemberships ?? []);
          setAuthError(null);
        } catch (err) {
          pendingAccountTypeRef.current = null;
          const message = mapAuthError(err);
          setAuthError(message);
          throw new Error(message);
        }
      },
      async logout() {
        pendingAccountTypeRef.current = null;
        await signOut(firebase.auth);
        setProfile(null);
        setMemberships([]);
        setAuthError(null);
      },
      refreshProfile,
    }),
    [user, profile, memberships, loading, authError, firebase, apiFetch],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
