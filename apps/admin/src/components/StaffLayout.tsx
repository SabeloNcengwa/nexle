import { useAuth } from '@mavundla/client';
import { NavLink, Outlet } from 'react-router-dom';
import styles from './StaffLayout.module.scss';

const WEB_URL = import.meta.env.VITE_WEB_BASE_URL ?? 'http://localhost:5173';

const LINKS = [
  { to: '/', label: 'Home', end: true },
  { to: '/sellers', label: 'Sellers' },
  { to: '/moderation', label: 'Catalogue' },
  { to: '/reviews', label: 'Reviews' },
  { to: '/categories', label: 'Categories' },
  { to: '/finance', label: 'Finance' },
  { to: '/support', label: 'Support' },
  { to: '/account', label: 'Account' },
];

export function StaffLayout() {
  const { profile, logout } = useAuth();

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <img src="/nexle-logo.png" alt="" />
          <div>
            Nexle
            <span className={styles.brandSub}>Marketplace ops</span>
          </div>
        </div>
        <nav className={styles.nav} aria-label="Staff">
          {LINKS.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) => (isActive ? styles.navActive : undefined)}
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className={styles.sideFoot}>
          <div>
            <strong>{profile?.displayName ?? profile?.email}</strong>
          </div>
          <a className={styles.storeLink} href={WEB_URL} target="_blank" rel="noreferrer">
            Open storefront ↗
          </a>
          <button type="button" onClick={() => void logout()}>
            Sign out
          </button>
        </div>
      </aside>
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
