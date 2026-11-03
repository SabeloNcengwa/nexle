import { formatZarFromCents } from '@mavundla/shared';
import { useMutation } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import styles from '../components/ui.module.scss';

export function MockPayPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const providerRef = params.get('providerRef') ?? '';
  const amountCents = Number(params.get('amountCents') ?? '0');
  const returnUrl = params.get('returnUrl') ?? '/orders';

  const orderId = useMemo(() => {
    try {
      const url = new URL(returnUrl, window.location.origin);
      const parts = url.pathname.split('/');
      return parts[parts.length - 1] || '';
    } catch {
      return '';
    }
  }, [returnUrl]);

  const complete = useMutation({
    mutationFn: (outcome: 'succeeded' | 'failed') =>
      apiFetch('/v1/payments/mock/complete', {
        method: 'POST',
        body: JSON.stringify({ providerRef, outcome }),
      }),
    onSuccess: (_data, outcome) => {
      if (outcome === 'succeeded' && orderId) {
        // Same return path as live Paystack — OrderDetailPage confirms + unlocks fulfilment
        navigate(`/orders/${orderId}?payment=return`);
      } else if (outcome === 'succeeded' && returnUrl) {
        navigate(returnUrl.startsWith('http') ? new URL(returnUrl).pathname + '?payment=return' : returnUrl);
      } else {
        navigate('/checkout?payment=failed');
      }
    },
  });

  if (!providerRef) {
    return <p className={styles.error}>Missing provider reference.</p>;
  }

  return (
    <div className={`${styles.panel} ${styles.stack}`} style={{ maxWidth: 480 }}>
      <span className={styles.badge}>Mock payment provider</span>
      <h1>Hosted checkout (mock)</h1>
      <p>
        Amount due: <strong>{formatZarFromCents(Number.isFinite(amountCents) ? amountCents : 0)}</strong>
      </p>
      <p className={styles.muted}>
        This page simulates a payment gateway. No cards are collected. Completing payment calls the
        API, which verifies the mock provider result (not the browser redirect alone).
      </p>
      <div className={styles.row}>
        <button
          type="button"
          className={styles.btn}
          disabled={complete.isPending}
          onClick={() => complete.mutate('succeeded')}
        >
          Simulate success
        </button>
        <button
          type="button"
          className={styles.btnGhost}
          disabled={complete.isPending}
          onClick={() => complete.mutate('failed')}
        >
          Simulate failure
        </button>
      </div>
      {complete.isError && <p className={styles.error}>{(complete.error as Error).message}</p>}
      <Link to="/cart">Cancel and return to cart</Link>
    </div>
  );
}
