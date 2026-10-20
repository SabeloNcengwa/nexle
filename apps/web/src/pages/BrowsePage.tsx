import { formatZarFromCents, type Product } from '@mavundla/shared';
import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import styles from '../components/ui.module.scss';

export function BrowsePage() {
  const [q, setQ] = useState('');
  const [submitted, setSubmitted] = useState('');

  const products = useQuery({
    queryKey: ['products', submitted],
    queryFn: () =>
      apiFetch<{ items: Product[]; nextCursor: string | null }>(
        `/v1/catalogue/products?limit=24${submitted ? `&q=${encodeURIComponent(submitted)}` : ''}`,
      ),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(q.trim());
  };

  return (
    <div className={styles.stack}>
      <h1>Browse</h1>
      <form className={styles.row} onSubmit={onSubmit}>
        <label className={styles.field} style={{ flex: 1 }}>
          <span className="sr-only">Search</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search products"
            aria-label="Search products"
          />
        </label>
        <button className={styles.btn} type="submit">
          Search
        </button>
      </form>

      {products.isLoading && <p>Loading products…</p>}
      {products.isError && <p className={styles.error}>Could not load products.</p>}
      {products.data?.items.length === 0 && <p className={styles.muted}>No products found.</p>}

      <div className={styles.grid}>
        {products.data?.items.map((p) => {
          const price = p.variants[0]?.promotionalPriceCents ?? p.variants[0]?.priceCents ?? 0;
          return (
            <Link key={p.id} to={`/products/${p.id}`} className={styles.productCard}>
              <span className={styles.badge}>{p.brand || 'Marketplace'}</span>
              <h2 style={{ fontSize: '1.15rem', marginTop: '0.6rem' }}>{p.title}</h2>
              <p style={{ marginBottom: 0 }}>{formatZarFromCents(price)}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
