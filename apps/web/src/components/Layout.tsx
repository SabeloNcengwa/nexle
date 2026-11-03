import { useState, type FormEvent } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { canAccessSellerCentre } from '../lib/roleHome';
import { BrandLogo } from './BrandLogo';
import styles from './Layout.module.scss';

const DEPARTMENTS = [
  { label: 'All deals', to: '/browse' },
  { label: 'Electronics', to: '/browse?q=electronics' },
  { label: 'Home & kitchen', to: '/browse?q=home' },
  { label: 'Fashion', to: '/browse?q=fashion' },
  { label: 'Beauty', to: '/browse?q=beauty' },
  { label: 'Sport', to: '/browse?q=sport' },
  { label: 'Baby', to: '/browse?q=baby' },
  { label: 'Gaming', to: '/browse?q=gaming' },
];

function actionClass(isActive: boolean) {
  return `${styles.actionLink}${isActive ? ` ${styles.actionLinkActive}` : ''}`;
}

export function Layout() {
  const { user, profile, memberships, logout } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const ADMIN_URL = import.meta.env.VITE_ADMIN_BASE_URL ?? 'http://localhost:5174';
  const isStaff = (profile?.platformRoles?.length ?? 0) > 0;
  const sellHref = !user
    ? '/auth/register?as=seller'
    : canAccessSellerCentre(profile, memberships)
      ? '/seller'
      : '/account?notice=seller-only';

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    const query = q.trim();
    navigate(query ? `/browse?q=${encodeURIComponent(query)}` : '/browse');
  };

  return (
    <div className={styles.shell}>
      <div className={styles.topBar}>
        <div className={styles.topBarInner}>
          <span>Deliver to South Africa · Independent sellers nationwide</span>
          <div className={styles.topLinks}>
            <Link to={sellHref}>Sell on Nexle</Link>
            <Link to="/account">Help</Link>
          </div>
        </div>
      </div>

      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.brandSlot}>
            <BrandLogo variant="header" />
          </div>

          <form className={styles.searchForm} onSubmit={onSearch} role="search">
            <label className="sr-only" htmlFor="nexle-search">
              Search Nexle
            </label>
            <input
              id="nexle-search"
              className={styles.searchInput}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search for products, brands and more…"
              autoComplete="off"
            />
            <button className={styles.searchBtn} type="submit">
              Search
            </button>
          </form>

          <div className={styles.headerActions}>
            {user ? (
              <>
                <NavLink to="/account" className={({ isActive }) => actionClass(isActive)}>
                  <span className={styles.actionLabel}>Account</span>
                </NavLink>
                <NavLink to="/orders" className={({ isActive }) => actionClass(isActive)}>
                  <span className={styles.actionLabel}>Orders</span>
                </NavLink>
                {isStaff && (
                  <a href={ADMIN_URL} className={styles.actionLink}>
                    <span className={styles.actionLabel}>Staff</span>
                  </a>
                )}
                <button type="button" className={styles.actionLink} onClick={() => void logout()}>
                  <span className={styles.actionLabel}>Sign out</span>
                </button>
              </>
            ) : (
              <NavLink to="/auth/sign-in" className={({ isActive }) => actionClass(isActive)}>
                <span className={styles.actionLabel}>Sign in</span>
              </NavLink>
            )}
            <NavLink to="/cart" className={({ isActive }) => actionClass(isActive)}>
              <span className={styles.actionLabel}>Cart</span>
            </NavLink>
          </div>
        </div>
      </header>

      <nav className={styles.categoryBar} aria-label="Departments">
        <div className={styles.categoryInner}>
          {DEPARTMENTS.map((d) => (
            <Link key={d.label} to={d.to} className={styles.categoryLink}>
              {d.label}
            </Link>
          ))}
        </div>
      </nav>

      <main className={styles.main}>
        <Outlet />
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div>
            <div className={styles.footerBrand}>
              <BrandLogo variant="footer" />
            </div>
            <p style={{ color: 'rgba(255,255,255,0.7)', margin: 0 }}>
              Your Next Find Starts Here. Shop independent sellers across South Africa.
            </p>
          </div>
          <div>
            <h3>Shop</h3>
            <Link to="/browse">All products</Link>
            <Link to="/browse?q=deals">Daily deals</Link>
            <Link to="/cart">Cart</Link>
          </div>
          <div>
            <h3>Account</h3>
            <Link to="/orders">Orders</Link>
            <Link to="/account">My account</Link>
            <Link to="/auth/register">Register</Link>
          </div>
          <div>
            <h3>Sell</h3>
            <Link to={sellHref}>Sell on Nexle</Link>
          </div>
        </div>
        <div className={styles.footerBottom}>© {new Date().getFullYear()} Nexle · Multi-vendor marketplace</div>
      </footer>
    </div>
  );
}
