import { formatZarFromCents, type Category, type Product } from '@mavundla/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { primaryProductImageUrl } from '../lib/productImage';
import styles from '../components/ui.module.scss';
import browse from './BrowsePage.module.scss';

export function BrowsePage() {
  const [params, setParams] = useSearchParams();
  const urlQ = params.get('q') ?? '';
  const urlCategoryId = params.get('categoryId') ?? '';
  const [q, setQ] = useState(urlQ);
  const [submitted, setSubmitted] = useState(urlQ);

  useEffect(() => {
    setQ(urlQ);
    setSubmitted(urlQ);
  }, [urlQ]);

  const categories = useQuery({
    queryKey: ['store-categories'],
    queryFn: () => apiFetch<Category[]>('/v1/catalogue/categories'),
  });

  const activeCategory = (categories.data ?? []).find((c) => c.id === urlCategoryId);

  const products = useQuery({
    queryKey: ['products', submitted, urlCategoryId],
    queryFn: () => {
      const qs = new URLSearchParams({ limit: '48' });
      if (submitted) qs.set('q', submitted);
      if (urlCategoryId) qs.set('categoryId', urlCategoryId);
      return apiFetch<{ items: Product[]; nextCursor: string | null }>(
        `/v1/catalogue/products?${qs.toString()}`,
      );
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const next = q.trim();
    setSubmitted(next);
    const nextParams: Record<string, string> = {};
    if (next) nextParams.q = next;
    if (urlCategoryId) nextParams.categoryId = urlCategoryId;
    setParams(nextParams);
  };

  return (
    <div className={browse.page}>
      <div className={browse.toolbar}>
        <div>
          <h1>Browse</h1>
          <p className={styles.muted}>
            {activeCategory
              ? `Products in ${activeCategory.name}`
              : submitted
                ? `Results for “${submitted}”`
                : 'All active listings from Nexle sellers'}
          </p>
        </div>
        <form className={browse.searchRow} onSubmit={onSubmit}>
          <label className={styles.field} style={{ flex: 1, margin: 0 }}>
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
      </div>

      {(categories.data?.length ?? 0) > 0 && (
        <div className={styles.row} style={{ marginBottom: '0.75rem' }}>
          <Link
            className={!urlCategoryId ? styles.btn : styles.btnGhost}
            to={submitted ? `/browse?q=${encodeURIComponent(submitted)}` : '/browse'}
          >
            All
          </Link>
          {categories.data!.map((c) => (
            <Link
              key={c.id}
              className={urlCategoryId === c.id ? styles.btn : styles.btnGhost}
              to={
                submitted
                  ? `/browse?categoryId=${encodeURIComponent(c.id)}&q=${encodeURIComponent(submitted)}`
                  : `/browse?categoryId=${encodeURIComponent(c.id)}`
              }
            >
              {c.name}
            </Link>
          ))}
        </div>
      )}

      {products.isLoading && <p>Loading products…</p>}
      {products.isError && <p className={styles.error}>Could not load products.</p>}
      {products.data?.items.length === 0 && <p className={styles.muted}>No products found.</p>}

      <div className={styles.grid}>
        {products.data?.items.map((p) => {
          const price = p.variants[0]?.promotionalPriceCents ?? p.variants[0]?.priceCents ?? 0;
          const hasPromo =
            typeof p.variants[0]?.promotionalPriceCents === 'number' &&
            p.variants[0]!.promotionalPriceCents! < (p.variants[0]?.priceCents ?? 0);
          const imageUrl = primaryProductImageUrl(p);
          return (
            <Link key={p.id} to={`/products/${p.id}`} className={styles.productCard}>
              <div className={styles.productMedia}>
                {imageUrl ? <img src={imageUrl} alt="" loading="lazy" /> : 'Nexle'}
              </div>
              <div className={styles.productBody}>
                {hasPromo ? (
                  <span className={styles.badge}>Deal</span>
                ) : (
                  <span className={styles.badgeMuted}>{p.brand || 'Seller'}</span>
                )}
                <h2 className={styles.productTitle}>{p.title}</h2>
                <p className={styles.productPrice}>{formatZarFromCents(price)}</p>
                <p className={styles.productMeta}>Fulfilled by seller</p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
