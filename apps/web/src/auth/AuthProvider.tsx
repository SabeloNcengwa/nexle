import type { UserProfile } from '@mavundla/shared';
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
  useState,
  type ReactNode,
} from 'react';
import { apiFetch } from '../lib/api';
import { connectEmulatorsIfNeeded, firebaseAuth } from '../lib/firebase';
import { clearGuestCartId, getOrCreateGuestCartId } from '../lib/guestCart';

async function mergeGuestCartIfPresent(): Promise<void> {
  try {
    const guestId = localStorage.getItem('mavundla_guest_cart_id');
    if (!guestId) return;
    // Ensure header uses the same guest id during merge
    getOrCreateGuestCartId();
    await apiFetch('/v1/cart/merge', {
      method: 'POST',
      headers: { 'X-Guest-Cart-Id': guestId },
    });
    clearGuestCartId();
  } catch {
    // Non-fatal: user can still shop with authenticated cart
  }
}

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    connectEmulatorsIfNeeded();
    return onAuthStateChanged(firebaseAuth, (next) => {
      setUser(next);
      setLoading(false);
    });
  }, []);

  const refreshProfile = async () => {
    if (!firebaseAuth.currentUser) {
      setProfile(null);
      return;
    }
    const me = await apiFetch<UserProfile>('/v1/users/me');
    setProfile(me);
  };

  useEffect(() => {
    if (!user) {
      setProfile(null);
      return;
    }
    void (async () => {
      try {
        await refreshProfile();
        await mergeGuestCartIfPresent();
      } catch {
        setProfile(null);
      }
    })();
  }, [user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      loading,
      async signIn(email, password) {
        await signInWithEmailAndPassword(firebaseAuth, email, password);
      },
      async register(email, password, displayName) {
        await createUserWithEmailAndPassword(firebaseAuth, email, password);
        await apiFetch('/v1/users/me', {
          method: 'PATCH',
          body: JSON.stringify({ displayName }),
        });
      },
      async logout() {
        await signOut(firebaseAuth);
        setProfile(null);
      },
      refreshProfile,
    }),
    [user, profile, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
