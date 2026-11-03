import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { BrandLogo } from '../components/BrandLogo';
import styles from '../components/ui.module.scss';
import { canAccessSellerCentre, storefrontHomePath } from '../lib/roleHome';

export function SignInPage() {
  const { signIn, user, profile, memberships, loading } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const next = params.get('next');

  useEffect(() => {
    if (loading || !user || !profile) return;
    if (next?.startsWith('/')) {
      if (next.startsWith('/seller') && !canAccessSellerCentre(profile, memberships)) {
        navigate('/account?notice=seller-only', { replace: true });
        return;
      }
      navigate(next, { replace: true });
      return;
    }
    navigate(storefrontHomePath(profile, memberships), { replace: true });
  }, [loading, user, profile, memberships, navigate, next]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
    } catch {
      setError('Sign-in failed. Check your email and password.');
      setBusy(false);
    }
  };

  return (
    <div className={styles.panel} style={{ maxWidth: 440, margin: '0 auto' }}>
      <BrandLogo variant="auth" />
      <h1>Sign in</h1>
      <p className={styles.muted}>Welcome back. Sign in to shop and track your orders.</p>
      <form className={styles.stack} onSubmit={(e) => void onSubmit(e)}>
        <label className={styles.field}>
          Email
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className={styles.field}>
          Password
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p className={styles.error}>{error}</p>}
        <button className={styles.btn} type="submit" disabled={busy || loading}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p className={styles.muted}>
        No account? <Link to="/auth/register">Create an account</Link>
        {' · '}
        <Link to="/auth/register?as=seller">Sell on Nexle</Link>
      </p>
    </div>
  );
}
