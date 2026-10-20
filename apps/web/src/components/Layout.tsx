import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { BrandLogo } from './BrandLogo';
import styles from './Layout.module.scss';

export function Layout() {
  const { user, profile, logout } = useAuth();
  const isAdmin = (profile?.platformRoles?.length ?? 0) > 0;
  const isSeller = Boolean(user);

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <BrandLogo variant="header" />
          <nav className={styles.nav} aria-label="Primary">
            <NavLink to="/">Home</NavLink>
            <NavLink to="/browse">Browse</NavLink>
            <NavLink to="/cart">Cart</NavLink>
            {user ? (
              <>
                <NavLink to="/orders">Orders</NavLink>
                <NavLink to="/account">Account</NavLink>
                {isSeller && <NavLink to="/seller">Seller Centre</NavLink>}
                {isAdmin && <NavLink to="/admin">Admin</NavLink>}
                <button type="button" className={styles.btnSecondary} onClick={() => void logout()}>
                  Sign out
                </button>
              </>
            ) : (
              <>
                <NavLink to="/auth/sign-in">Sign in</NavLink>
                <NavLink to="/auth/register" className={styles.btn}>
                  Register
                </NavLink>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className={styles.main}>
        <Outlet />
      </main>
      <footer className={styles.footer}>
        <BrandLogo variant="footer" />
        <p>Your Next Find Starts Here. Independent sellers across South Africa.</p>
      </footer>
    </div>
  );
}
