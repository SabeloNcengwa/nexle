import { useAuth } from '@mavundla/client';
import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import styles from '../styles/ui.module.scss';

const WEB_URL = import.meta.env.VITE_WEB_BASE_URL ?? 'http://localhost:5173';

export function SignInPage() {
  const { user, profile, loading, signIn, logout, authError } = useAuth();
  const [email, setEmail] = useState('admin@nexle.co.za');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!loading && user && (profile?.platformRoles?.length ?? 0) > 0) {
    return <Navigate to="/" replace />;
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signIn(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  };

  const wrongApp =
    !loading && user && profile && (profile.platformRoles?.length ?? 0) === 0;
  const profileFailed = !loading && user && !profile && Boolean(authError);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: '1.5rem',
        background:
          'radial-gradient(800px 400px at 80% 0%, rgba(232,93,36,0.18), transparent 55%), radial-gradient(600px 360px at 10% 80%, rgba(36,120,200,0.12), transparent 50%), #f2f5f8',
      }}
    >
      <form
        className={`${styles.panel} ${styles.stack}`}
        style={{ width: 'min(440px, 100%)', boxShadow: 'var(--shadow-soft)' }}
        onSubmit={(e) => void onSubmit(e)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <img src="/nexle-logo.png" alt="Nexle" width={44} height={44} />
          <div>
            <h1 style={{ margin: 0, fontSize: '1.35rem' }}>Staff console</h1>
            <p className={styles.muted} style={{ margin: 0, fontSize: '0.9rem' }}>
              Nexle ops
            </p>
          </div>
        </div>

        <p className={styles.muted} style={{ margin: 0, fontSize: '0.88rem' }}>
          Sign in with your staff email to manage the marketplace.
        </p>

        <label className={styles.field}>
          Staff email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
          />
        </label>
        <label className={styles.field}>
          Password
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>
        {(error || authError) && <p className={styles.error}>{error ?? authError}</p>}
        {loading && user && <p className={styles.muted}>Checking your access…</p>}
        {wrongApp && (
          <div className={styles.stack}>
            <p className={styles.error} style={{ margin: 0 }}>
              <strong>{profile.email}</strong> has no staff roles.
            </p>
            <div className={styles.row}>
              <a className={styles.btn} href={WEB_URL}>
                Open storefront
              </a>
              <button type="button" className={styles.btnGhost} onClick={() => void logout()}>
                Sign out
              </button>
            </div>
          </div>
        )}
        {profileFailed && (
          <button type="button" className={styles.btnGhost} onClick={() => void logout()}>
            Sign out and try again
          </button>
        )}
        {!wrongApp && (
          <button className={styles.btn} type="submit" disabled={busy || loading}>
            {busy || loading ? 'Signing in…' : 'Continue to ops'}
          </button>
        )}
      </form>
    </div>
  );
}
