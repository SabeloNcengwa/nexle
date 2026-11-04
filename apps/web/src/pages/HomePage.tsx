import { formatZarFromCents, type Product } from '@mavundla/shared';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { BrandLogo } from '../components/BrandLogo';
import { apiFetch } from '../lib/api';
import { primaryProductImageUrl } from '../lib/productImage';
import ui from '../components/ui.module.scss';
import styles from './HomePage.module.scss';

const DEPARTMENTS = [
  { label: 'Electronics', hint: 'Phones, audio, gadgets', q: 'electronics' },
  { label: 'Home', hint: 'Kitchen and living', q: 'home' },
  { label: 'Fashion', hint: 'Everyday style', q: 'fashion' },
  { label: 'Beauty', hint: 'Care and fragrance', q: 'beauty' },
  { label: 'Sport', hint: 'Train and play', q: 'sport' },
  { label: 'Baby', hint: 'For little ones', q: 'baby' },
  { label: 'Gaming', hint: 'Play at home', q: 'gaming' },
  { label: 'All deals', hint: 'Everything listed', q: '' },
];

export function HomePage() {
  const featured = useQuery({
    queryKey: ['home-featured'],
    queryFn: () =>
      apiFetch<{ items: Product[]; nextCursor: string | null }>('/v1/catalogue/products?limit=8'),
  });

  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-label="Nexle hero">
        <div className={styles.heroCopy}>
          <div className={styles.heroBrand}>
            <BrandLogo variant="hero" />
          </div>
          <p className={styles.kicker}>South Africa · Independent sellers</p>
          <h1>Your Next Find Starts Here.</h1>
          <p>
            Shop sellers across the country. Pay once on Nexle, then they pack and ship from their
            own stock.
          </p>
          <div className={styles.heroActions}>
            <Link className={ui.btn} to="/browse">
              Shop now
            </Link>
            <Link className={ui.btnGhost} to="/auth/register?as=seller">
              Sell on Nexle
            </Link>
          </div>
        </div>
        <aside className={styles.heroAside}>
          <div>
            <strong>One checkout.</strong>
            <p>Your payment is confirmed before the seller starts packing.</p>
          </div>
          <div>
            <strong>Nationwide.</strong>
            <p>Each seller fulfils their own orders, from their own shelves.</p>
          </div>
        </aside>
      </section>

      <section className={styles.trustStrip} aria-label="Why shop Nexle">
        <div className={styles.trustItem}>
          <strong>Nationwide delivery</strong>
          <span>Sellers fulfil across South Africa</span>
        </div>
        <div className={styles.trustItem}>
          <strong>Secure payments</strong>
          <span>Checkout protected on the platform</span>
        </div>
        <div className={styles.trustItem}>
          <strong>Easy returns</strong>
          <span>Request returns from your orders</span>
        </div>
        <div className={styles.trustItem}>
          <strong>Multi-vendor</strong>
          <span>Independent sellers own their stock</span>
        </div>
      </section>

      <section className={styles.departments}>
        <div className={ui.sectionHead}>
          <h2>Shop by department</h2>
          <Link className={ui.sectionLink} to="/browse">
            View all
          </Link>
        </div>
        <div className={styles.deptGrid}>
          {DEPARTMENTS.map((d) => (
            <Link
              key={d.label}
              className={styles.deptChip}
              to={d.q ? `/browse?q=${encodeURIComponent(d.q)}` : '/browse'}
            >
              <strong>{d.label}</strong>
              <span>{d.hint}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className={styles.shelf}>
        <div className={ui.sectionHead}>
          <h2>Featured on Nexle</h2>
          <Link className={ui.sectionLink} to="/browse">
            See more
          </Link>
        </div>
        {featured.isLoading && <p className={ui.muted}>Loading products…</p>}
        {featured.isError && <p className={ui.error}>Could not load products.</p>}
        {featured.data?.items.length === 0 && (
          <p className={ui.muted}>No listings yet — check back soon.</p>
        )}
        <div className={ui.grid}>
          {featured.data?.items.map((p) => {
            const price = p.variants[0]?.promotionalPriceCents ?? p.variants[0]?.priceCents ?? 0;
            const hasPromo =
              typeof p.variants[0]?.promotionalPriceCents === 'number' &&
              p.variants[0]!.promotionalPriceCents! < (p.variants[0]?.priceCents ?? 0);
            const imageUrl = primaryProductImageUrl(p);
            return (
              <Link key={p.id} to={`/products/${p.id}`} className={ui.productCard}>
                <div className={ui.productMedia}>
                  {imageUrl ? <img src={imageUrl} alt="" loading="lazy" /> : 'Nexle'}
                </div>
                <div className={ui.productBody}>
                  {hasPromo ? <span className={ui.badge}>Deal</span> : null}
                  <h3 className={ui.productTitle}>{p.title}</h3>
                  <p className={ui.productPrice}>{formatZarFromCents(price)}</p>
                  <p className={ui.productMeta}>{p.brand || 'Marketplace seller'}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
