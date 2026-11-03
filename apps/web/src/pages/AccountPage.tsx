import type { AccountType } from '@mavundla/shared';
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from 'firebase/auth';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { apiFetch } from '../lib/api';
import { firebaseAuth } from '../lib/firebase';
import styles from '../components/ui.module.scss';
import { canAccessSellerCentre, isSeller } from '../lib/roleHome';

export function AccountPage() {
  const { profile, user, memberships, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const seller = isSeller(memberships);
  const sellerCentreOk = canAccessSellerCentre(profile, memberships);
  const sellerOnlyNotice = params.get('notice') === 'seller-only';
  const needsAccountType = Boolean(profile && !profile.accountType && !seller);
  // Mis-tagged customer (signup race) can correct once from this notice.
  const canCorrectToSeller = Boolean(
    profile && profile.accountType === 'customer' && sellerOnlyNotice && !seller,
  );

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwMessage, setPwMessage] = useState<string | null>(null);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwBusy, setPwBusy] = useState(false);
  const [typeBusy, setTypeBusy] = useState(false);
  const [typeError, setTypeError] = useState<string | null>(null);

  const chooseAccountType = async (accountType: AccountType) => {
    if (!profile?.displayName) return;
    setTypeBusy(true);
    setTypeError(null);
    try {
      await apiFetch('/v1/users/me', {
        method: 'PATCH',
        body: JSON.stringify({ displayName: profile.displayName, accountType }),
      });
      await refreshProfile();
      if (accountType === 'seller') navigate('/seller', { replace: true });
    } catch {
      setTypeError('Could not save account type. Try again.');
    } finally {
      setTypeBusy(false);
    }
  };

  const onChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    setPwMessage(null);
    setPwError(null);
    if (newPassword.length < 8) {
      setPwError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError('New passwords do not match.');
      return;
    }
    const current = firebaseAuth.currentUser;
    if (!current?.email) {
      setPwError('You must be signed in to change your password.');
      return;
    }
    setPwBusy(true);
    try {
      const cred = EmailAuthProvider.credential(current.email, currentPassword);
      await reauthenticateWithCredential(current, cred);
      await updatePassword(current, newPassword);
      setPwMessage('Password updated.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch {
      setPwError('Could not update password. Check your current password and try again.');
    } finally {
      setPwBusy(false);
    }
  };

  return (
    <div className={styles.stack} style={{ maxWidth: 560 }}>
      <div className={styles.panel}>
        <h1>My account</h1>
        {sellerOnlyNotice && !needsAccountType && !canCorrectToSeller && (
          <p className={styles.error}>
            Seller Centre is only for seller accounts. This login is a customer account. To sell,
            sign out and register a new seller account.
          </p>
        )}
        {(needsAccountType || canCorrectToSeller) && (
          <div className={styles.stack} style={{ marginBottom: '1rem' }}>
            <p className={styles.error}>
              {canCorrectToSeller
                ? 'This account was saved as Customer. If you meant to sell, switch once — this cannot be undone.'
                : 'Your account type was not saved at registration. Choose once — this cannot be changed later.'}
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className={styles.btn}
                disabled={typeBusy}
                onClick={() => void chooseAccountType('seller')}
              >
                I want to sell
              </button>
              {!canCorrectToSeller && (
                <button
                  type="button"
                  className={styles.btnGhost}
                  disabled={typeBusy}
                  onClick={() => void chooseAccountType('customer')}
                >
                  I want to shop
                </button>
              )}
            </div>
            {typeError && <p className={styles.error}>{typeError}</p>}
          </div>
        )}
        <p>
          <strong>{profile?.displayName ?? user?.email}</strong>
        </p>
        <p className={styles.muted}>{profile?.email ?? user?.email}</p>
        <p className={styles.muted}>
          Account type:{' '}
          {profile?.accountType === 'seller'
            ? 'Seller'
            : profile?.accountType === 'customer'
              ? 'Customer'
              : seller
                ? 'Seller (legacy)'
                : 'Not set'}
        </p>
        <p>
          <Link to="/orders">Order history</Link>
          {' · '}
          <Link to="/browse">Continue shopping</Link>
          {sellerCentreOk && (
            <>
              {' · '}
              <Link to="/seller">Seller Centre</Link>
            </>
          )}
        </p>
      </div>

      <form className={`${styles.panel} ${styles.stack}`} onSubmit={(e) => void onChangePassword(e)}>
        <h2>Change password</h2>
        <label className={styles.field}>
          Current password
          <input
            type="password"
            required
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
        </label>
        <label className={styles.field}>
          New password
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </label>
        <label className={styles.field}>
          Confirm new password
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </label>
        {pwMessage && <p>{pwMessage}</p>}
        {pwError && <p className={styles.error}>{pwError}</p>}
        <button className={styles.btn} type="submit" disabled={pwBusy}>
          {pwBusy ? 'Updating…' : 'Update password'}
        </button>
      </form>
    </div>
  );
}
