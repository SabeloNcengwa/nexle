import type { AccountType } from '@mavundla/shared';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { BrandLogo } from '../components/BrandLogo';
import styles from '../components/ui.module.scss';

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const preferSeller = params.get('as') === 'seller';

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accountType, setAccountType] = useState<AccountType>(
    preferSeller ? 'seller' : 'customer',
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await register(email, password, displayName, accountType);
      navigate(accountType === 'seller' ? '/seller' : '/account');
    } catch {
      setError('Registration failed. Try a different email.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.panel} style={{ maxWidth: 440, margin: '0 auto' }}>
      <BrandLogo variant="auth" />
      <h1>Create your account</h1>
      <p className={styles.muted}>Choose how you will use Nexle. This cannot be changed later.</p>
      <form className={styles.stack} onSubmit={(e) => void onSubmit(e)}>
        <fieldset className={styles.stack} style={{ border: 0, margin: 0, padding: 0 }}>
          <legend className={styles.muted} style={{ marginBottom: '0.35rem' }}>
            Account type
          </legend>
          <div className={styles.accountTypeGrid} role="radiogroup" aria-label="Account type">
            <label
              className={`${styles.accountTypeOption}${
                accountType === 'customer' ? ` ${styles.accountTypeOptionActive}` : ''
              }`}
            >
              <input
                type="radio"
                name="accountType"
                value="customer"
                checked={accountType === 'customer'}
                onChange={() => setAccountType('customer')}
              />
              <span>
                <span className={styles.accountTypeOptionStrong}>Customer</span>
                <span className={styles.muted}>
                  Shop products, checkout, and track orders. No Seller Centre access.
                </span>
              </span>
            </label>
            <label
              className={`${styles.accountTypeOption}${
                accountType === 'seller' ? ` ${styles.accountTypeOptionActive}` : ''
              }`}
            >
              <input
                type="radio"
                name="accountType"
                value="seller"
                checked={accountType === 'seller'}
                onChange={() => setAccountType('seller')}
              />
              <span>
                <span className={styles.accountTypeOptionStrong}>Seller</span>
                <span className={styles.muted}>
                  Apply to sell, manage catalogue and orders, and withdraw payouts.
                </span>
              </span>
            </label>
          </div>
        </fieldset>

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
          {busy
            ? 'Creating…'
            : accountType === 'seller'
              ? 'Create seller account'
              : 'Create customer account'}
        </button>
      </form>
      <p className={styles.muted}>
        Already registered? <Link to="/auth/sign-in">Sign in</Link>
      </p>
    </div>
  );
}
