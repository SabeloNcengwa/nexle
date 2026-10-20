import { Link } from 'react-router-dom';
import { BrandLogo } from '../components/BrandLogo';
import styles from '../components/ui.module.scss';

export function HomePage() {
  return (
    <section className={styles.hero}>
      <BrandLogo variant="hero" />
      <h1 className={styles.srOnly}>Nexle</h1>
      <p className={styles.heroLead}>Your Next Find Starts Here.</p>
      <p className={styles.muted}>
        Shop independent sellers across South Africa. Sellers own their stock, set their prices, and
        fulfil their orders.
      </p>
      <div className={styles.row}>
        <Link className={styles.btn} to="/browse">
          Browse products
        </Link>
        <Link className={styles.btnGhost} to="/seller">
          Sell on Nexle
        </Link>
      </div>
    </section>
  );
}
