import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { BrandLogo } from '../components/BrandLogo';
import styles from '../components/ui.module.scss';

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await register(email, password, displayName);
      navigate('/account');
    } catch {
      setError('Registration failed. Try a different email.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.panel} style={{ maxWidth: 420, margin: '0 auto' }}>
      <BrandLogo variant="auth" />
      <h1>Create customer account</h1>
      <p className={styles.muted}>Administrator accounts cannot be self-registered.</p>
      <form className={styles.stack} onSubmit={(e) => void onSubmit(e)}>
        <label className={styles.field}>
          Display name
          <input required value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </label>
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
          {busy ? 'Creating…' : 'Register'}
        </button>
      </form>
      <p className={styles.muted}>
        Already registered? <Link to="/auth/sign-in">Sign in</Link>
      </p>
    </div>
  );
}
