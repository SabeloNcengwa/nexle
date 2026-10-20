import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { BrandLogo } from '../components/BrandLogo';
import styles from '../components/ui.module.scss';

export function SignInPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
      navigate('/account');
    } catch {
      setError('Sign-in failed. Check your email and password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.panel} style={{ maxWidth: 420, margin: '0 auto' }}>
      <BrandLogo variant="auth" />
      <h1>Sign in</h1>
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
        <button className={styles.btn} type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p className={styles.muted}>
        No account? <Link to="/auth/register">Register</Link>
      </p>
    </div>
  );
}
