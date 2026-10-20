import { formatZarFromCents, type Order, type OrderLineSnapshot, type PaymentAttempt } from '@mavundla/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
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
  const { user } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [address, setAddress] = useState({
    line1: '',
    suburb: '',
    city: '',
    province: 'Gauteng',
    postalCode: '',
  });

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
        {(
          [
            ['line1', 'Street address'],
            ['suburb', 'Suburb'],
            ['city', 'City'],
            ['province', 'Province'],
            ['postalCode', 'Postal code'],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className={styles.field}>
            {label}
            <input
              required
              value={address[key]}
              onChange={(e) => setAddress((a) => ({ ...a, [key]: e.target.value }))}
            />
          </label>
        ))}
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
