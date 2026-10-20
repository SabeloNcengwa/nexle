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
import styles from '../components/ui.module.scss';

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

  return (
    <article className={styles.stack}>
      <Link to="/browse">← Back to browse</Link>
      <div className={styles.panel}>
        <span className={styles.badge}>{p.status}</span>
        <h1>{p.title}</h1>
        <p className={styles.muted}>
          {summary.count > 0
            ? `${formatAverageRating(summary)} ★ · ${summary.count} review${summary.count === 1 ? '' : 's'}`
            : 'No reviews yet'}
        </p>
        <p>{p.description}</p>
        <p>
          <strong>{formatZarFromCents(price)}</strong>
        </p>
        <h2>Variants & stock</h2>
        <ul className={styles.stack}>
          {p.variants.map((v) => {
            const avail = p.availability?.find((a) => a.sku === v.sku)?.available;
            return (
              <li key={v.sku} className={styles.row}>
                <div style={{ flex: 1 }}>
                  {v.title} ({v.sku}) — {formatZarFromCents(v.priceCents)}
                  {typeof avail === 'number' ? ` · ${avail} available` : ''}
                </div>
                <button
                  type="button"
                  className={styles.btn}
                  disabled={add.isPending || avail === 0}
                  onClick={() => add.mutate(v.sku)}
                >
                  Add to cart
                </button>
              </li>
            );
          })}
        </ul>
        {message && <p>{message}</p>}
        {error && <p className={styles.error}>{error}</p>}
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
