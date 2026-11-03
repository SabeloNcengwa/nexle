import {
  formatZarFromCents,
  SA_PROVINCES,
  type Order,
  type OrderLineSnapshot,
  type PaymentAttempt,
} from '@mavundla/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { apiFetch } from '../lib/api';
import styles from '../components/ui.module.scss';

interface Preview {
  lines: OrderLineSnapshot[];
  subtotalCents: number;
  deliveryCents: number;
  totalCents: number;
  deliveryQuotes: Array<{ sellerId: string; deliveryCents: number; estimateOnly: boolean }>;
}

export function CheckoutPage() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [address, setAddress] = useState({
    line1: '',
    suburb: '',
    city: '',
    province: 'Gauteng',
    postalCode: '',
  });

  useEffect(() => {
    const saved = profile?.defaultShippingAddress;
    if (!saved) return;
    setAddress({
      line1: saved.line1 ?? '',
      suburb: saved.suburb ?? '',
      city: saved.city ?? '',
      province: saved.province || 'Gauteng',
      postalCode: saved.postalCode ?? '',
    });
  }, [profile]);

  const preview = useQuery({
    queryKey: ['checkout-preview'],
    enabled: Boolean(user),
    queryFn: () => apiFetch<Preview>('/v1/checkout/preview'),
  });

  const start = useMutation({
    mutationFn: () =>
      apiFetch<{ order: Order; payment: PaymentAttempt; checkoutUrl: string }>('/v1/checkout', {
        method: 'POST',
        body: JSON.stringify({
          idempotencyKey: crypto.randomUUID(),
          shippingAddress: { ...address, country: 'ZA' },
        }),
      }),
    onSuccess: (data) => {
      window.location.href = data.checkoutUrl;
    },
    onError: (err: Error) => setError(err.message),
  });

  if (!user) {
    return (
      <div className={styles.panel}>
        <h1>Checkout</h1>
        <p>
          Please <Link to="/auth/sign-in">sign in</Link> to checkout. Guests may browse and add to
          cart.
        </p>
      </div>
    );
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    start.mutate();
  };

  return (
    <div className={styles.stack}>
      <h1>Checkout</h1>
      {preview.isLoading && <p>Recalculating prices…</p>}
      {preview.isError && (
        <p className={styles.error}>
          Could not preview checkout. Ensure your cart has eligible items.{' '}
          <button type="button" className={styles.btnGhost} onClick={() => navigate('/cart')}>
            Back to cart
          </button>
        </p>
      )}

      {preview.data && (
        <div className={styles.panel}>
          <h2>Order summary</h2>
          <ul>
            {preview.data.lines.map((l) => (
              <li key={`${l.productId}_${l.sku}`}>
                {l.title} × {l.quantity} — {formatZarFromCents(l.lineSubtotalCents)}
              </li>
            ))}
          </ul>
          <p>Subtotal: {formatZarFromCents(preview.data.subtotalCents)}</p>
          <p>
            Delivery (estimate): {formatZarFromCents(preview.data.deliveryCents)}
            {preview.data.deliveryQuotes.some((q) => q.estimateOnly) ? ' · estimate only' : ''}
          </p>
          <p>
            <strong>Total: {formatZarFromCents(preview.data.totalCents)}</strong>
          </p>
        </div>
      )}

      <form className={`${styles.panel} ${styles.stack}`} onSubmit={onSubmit}>
        <h2>Delivery address (South Africa)</h2>
        {profile?.defaultShippingAddress && (
          <p className={styles.muted}>
            Prefills from{' '}
            <Link to="/account">My account</Link>
            . Edit here for this order only, or update your saved address on your profile.
          </p>
        )}
        <label className={styles.field}>
          Street address
          <input
            required
            value={address.line1}
            onChange={(e) => setAddress((a) => ({ ...a, line1: e.target.value }))}
          />
        </label>
        <label className={styles.field}>
          Suburb
          <input
            required
            value={address.suburb}
            onChange={(e) => setAddress((a) => ({ ...a, suburb: e.target.value }))}
          />
        </label>
        <label className={styles.field}>
          City
          <input
            required
            value={address.city}
            onChange={(e) => setAddress((a) => ({ ...a, city: e.target.value }))}
          />
        </label>
        <label className={styles.field}>
          Province
          <select
            required
            value={address.province}
            onChange={(e) => setAddress((a) => ({ ...a, province: e.target.value }))}
          >
            {SA_PROVINCES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          Postal code
          <input
            required
            pattern="\d{4}"
            maxLength={4}
            value={address.postalCode}
            onChange={(e) => setAddress((a) => ({ ...a, postalCode: e.target.value }))}
          />
        </label>
        {error && <p className={styles.error}>{error}</p>}
        <button className={styles.btn} type="submit" disabled={start.isPending || !preview.data}>
          {start.isPending ? 'Reserving stock…' : 'Pay with mock checkout'}
        </button>
        <p className={styles.muted}>
          Mock provider only — browser redirect is not proof of payment; the API verifies provider
          outcomes.
        </p>
      </form>
    </div>
  );
}
