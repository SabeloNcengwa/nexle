import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import styles from '../components/ui.module.scss';

export function AccountPage() {
  const { profile, user } = useAuth();

  return (
    <div className={styles.panel}>
      <h1>Account</h1>
      <p>
        <strong>{profile?.displayName ?? user?.email}</strong>
      </p>
      <p className={styles.muted}>{profile?.email ?? user?.email}</p>
      <p>
        Platform roles:{' '}
        {profile?.platformRoles?.length ? profile.platformRoles.join(', ') : 'customer'}
      </p>
      <p>
        <Link to="/orders">View order history</Link>
      </p>
      <p className={styles.muted}>
        Address book, returns and wishlists ship in later phases.
      </p>
    </div>
  );
}
