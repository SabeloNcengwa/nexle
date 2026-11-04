import {
  formatAverageRating,
  formatZarFromCents,
  type Product,
  type ProductReview,
  type ProductRatingSummary,
} from '@mavundla/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { apiFetch } from '../lib/api';
import { primaryProductImageUrl } from '../lib/productImage';
import styles from '../components/ui.module.scss';
import pdp from './ProductPage.module.scss';

type ProductDetail = Product & {
  availability?: Array<{ sku: string; available: number }>;
};

type ReviewsPayload = {
  items: ProductReview[];
  nextCursor: string | null;
  summary: ProductRatingSummary;
};

export function ProductPage() {
  const { productId } = useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [orderId, setOrderId] = useState('');
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  const product = useQuery({
    queryKey: ['product', productId],
    enabled: Boolean(productId),
    queryFn: () => apiFetch<ProductDetail>(`/v1/catalogue/products/${productId}`),
  });

  const reviews = useQuery({
    queryKey: ['reviews', productId],
    enabled: Boolean(productId),
    queryFn: () =>
      apiFetch<ReviewsPayload>(`/v1/reviews?productId=${encodeURIComponent(productId!)}`),
  });

  const add = useMutation({
    mutationFn: (sku: string) =>
      apiFetch('/v1/cart/items', {
        method: 'POST',
        body: JSON.stringify({ productId, sku, quantity: 1 }),
      }),
    onSuccess: async () => {
      setMessage('Added to cart.');
      setError(null);
      await qc.invalidateQueries({ queryKey: ['cart'] });
    },
    onError: (err: Error) => {
      setError(err.message);
      setMessage(null);
    },
  });

  const submitReview = useMutation({
    mutationFn: () =>
      apiFetch('/v1/reviews', {
        method: 'POST',
        body: JSON.stringify({ productId, orderId, rating, title, body }),
      }),
    onSuccess: async () => {
      setMessage('Review published.');
      setError(null);
      setTitle('');
      setBody('');
      await qc.invalidateQueries({ queryKey: ['reviews', productId] });
      await qc.invalidateQueries({ queryKey: ['product', productId] });
    },
    onError: (err: Error) => {
      setError(err.message);
      setMessage(null);
    },
  });

  if (product.isLoading) return <p>Loading…</p>;
  if (product.isError || !product.data) {
    return <p className={styles.error}>Product not available.</p>;
  }

  const p = product.data;
  const price = p.variants[0]?.promotionalPriceCents ?? p.variants[0]?.priceCents ?? 0;
  const summary = reviews.data?.summary ?? p.ratingSummary ?? { averageTimes100: 0, count: 0 };
  const imageUrl = primaryProductImageUrl(p);

  return (
    <article className={styles.stack}>
      <Link to="/browse" className={styles.sectionLink}>
        ← Back to results
      </Link>
      <div className={pdp.layout}>
        <div className={pdp.media}>
          {imageUrl ? <img src={imageUrl} alt={p.title} /> : 'Nexle'}
        </div>
        <div className={pdp.buyBox}>
          <span className={styles.badgeMuted}>{p.brand || 'Marketplace seller'}</span>
          <h1 style={{ margin: 0, fontSize: '1.45rem' }}>{p.title}</h1>
          <p className={styles.muted} style={{ margin: 0 }}>
            {summary.count > 0
              ? `${formatAverageRating(summary)} / 5 · ${summary.count} review${summary.count === 1 ? '' : 's'}`
              : 'No reviews yet'}
          </p>
          <p className={pdp.price}>{formatZarFromCents(price)}</p>
          <p style={{ margin: 0 }}>{p.description}</p>
          <div>
            <h2 style={{ fontSize: '1rem', marginBottom: '0.35rem' }}>Options</h2>
            {p.variants.map((v) => {
              const avail = p.availability?.find((a) => a.sku === v.sku)?.available;
              return (
                <div key={v.sku} className={pdp.variantRow}>
                  <div>
                    <strong>{v.title}</strong>
                    <div className={styles.muted}>
                      {formatZarFromCents(v.priceCents)}
                      {typeof avail === 'number' ? ` · ${avail} in stock` : ''}
                    </div>
                  </div>
                  <button
                    type="button"
                    className={styles.btn}
                    disabled={add.isPending || avail === 0}
                    onClick={() => add.mutate(v.sku)}
                  >
                    Add to cart
                  </button>
                </div>
              );
            })}
          </div>
          {message && <p>{message}</p>}
          {error && <p className={styles.error}>{error}</p>}
        </div>
      </div>

      <section className={styles.panel}>
        <h2>Customer reviews</h2>
        {reviews.isLoading && <p>Loading reviews…</p>}
        {reviews.data?.items.length === 0 && (
          <p className={styles.muted}>Be the first to review after purchase.</p>
        )}
        <ul className={styles.stack}>
          {reviews.data?.items.map((r) => (
            <li key={r.id}>
              <strong>
                {r.rating}★ — {r.title}
              </strong>
              <div className={styles.muted}>
                {r.authorDisplayName} · {new Date(r.createdAt).toLocaleDateString()}
              </div>
              <p>{r.body}</p>
            </li>
          ))}
        </ul>

        {user ? (
          <form
            className={styles.stack}
            onSubmit={(e) => {
              e.preventDefault();
              submitReview.mutate();
            }}
          >
            <h3>Write a review</h3>
            <p className={styles.muted}>Requires a paid order that includes this product.</p>
            <label className={styles.field}>
              Order ID
              <input value={orderId} onChange={(e) => setOrderId(e.target.value)} required />
            </label>
            <label className={styles.field}>
              Rating
              <select value={rating} onChange={(e) => setRating(Number(e.target.value))}>
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              Title
              <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120} />
            </label>
            <label className={styles.field}>
              Review
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                required
                minLength={10}
                maxLength={4000}
              />
            </label>
            <button type="submit" className={styles.btn} disabled={submitReview.isPending}>
              Publish review
            </button>
          </form>
        ) : (
          <p className={styles.muted}>
            <Link to="/auth/sign-in">Sign in</Link> to leave a review.
          </p>
        )}
      </section>
    </article>
  );
}
