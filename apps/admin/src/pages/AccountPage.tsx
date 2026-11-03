import { useAuth } from '@mavundla/client';
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from 'firebase/auth';
import { useState, type FormEvent } from 'react';
import { firebaseAuth } from '../lib/firebase';
import styles from '../styles/ui.module.scss';

export function AccountPage() {
  const { profile, user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setError(null);
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }
    const current = firebaseAuth.currentUser;
    if (!current?.email) {
      setError('You must be signed in.');
      return;
    }
    setBusy(true);
    try {
      const cred = EmailAuthProvider.credential(current.email, currentPassword);
      await reauthenticateWithCredential(current, cred);
      await updatePassword(current, newPassword);
      setMessage('Password updated.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch {
      setError('Could not update password. Check your current password and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.stack}>
      <div className={styles.pageHead}>
        <h1>Your account</h1>
        <p className={styles.muted} style={{ margin: 0 }}>
          {profile?.displayName ?? user?.email} · {profile?.email ?? user?.email}
        </p>
      </div>

      <form className={`${styles.panel} ${styles.stack}`} onSubmit={(e) => void onSubmit(e)}>
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
        {message && <p>{message}</p>}
        {error && <p className={styles.error}>{error}</p>}
        <button className={styles.btn} type="submit" disabled={busy}>
          {busy ? 'Updating…' : 'Update password'}
        </button>
      </form>
    </div>
  );
}
