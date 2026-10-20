import {
  formatZarFromCents,
  type Order,
  type Refund,
  type ReturnRequest,
  type Shipment,
} from '@mavundla/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import styles from '../components/ui.module.scss';

export function OrdersListPage() {
  const orders = useQuery({
    queryKey: ['orders-mine'],
    queryFn: () => apiFetch<Order[]>('/v1/orders/mine'),
  });

  return (
    <div className={styles.stack}>
      <h1>Your orders</h1>
      {orders.isLoading && <p>Loading…</p>}
      {orders.data?.length === 0 && <p className={styles.muted}>No orders yet.</p>}
      <ul className={styles.stack}>
        {orders.data?.map((o) => (
          <li key={o.id} className={styles.panel}>
            <Link to={`/orders/${o.id}`}>
              <strong>{o.id}</strong>
            </Link>
            <div>
              {o.status} · {formatZarFromCents(o.totalCents)}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function OrderDetailPage() {
  const { orderId } = useParams();
  const qc = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const order = useQuery({
    queryKey: ['order', orderId],
    enabled: Boolean(orderId),
    queryFn: () => apiFetch<Order>(`/v1/orders/${orderId}`),
  });

  const refunds = useQuery({
    queryKey: ['refunds', orderId],
    enabled: Boolean(orderId),
    queryFn: () => apiFetch<Refund[]>(`/v1/finance/refunds/by-order/${orderId}`),
  });

  const returns = useQuery({
    queryKey: ['returns', orderId],
    enabled: Boolean(orderId),
    queryFn: () => apiFetch<ReturnRequest[]>(`/v1/fulfilment/returns/by-order/${orderId}`),
  });

  const shipments = useQuery({
    queryKey: ['shipments', orderId],
    enabled: Boolean(orderId),
    queryFn: () => apiFetch<Shipment[]>(`/v1/fulfilment/shipments/by-order/${orderId}`),
  });

  const requestRefund = useMutation({
    mutationFn: () => {
      const o = order.data!;
      const line = o.lines[0];
      if (!line) throw new Error('No lines');
      return apiFetch<Refund>('/v1/finance/refunds', {
        method: 'POST',
        body: JSON.stringify({
          orderId: o.id,
          idempotencyKey: crypto.randomUUID(),
          reasonCode: 'changed_mind',
          notes: 'Customer-initiated refund request',
          lines: [{ productId: line.productId, sku: line.sku, quantity: 1 }],
        }),
      });
    },
    onSuccess: async () => {
      setMessage('Refund requested.');
      setError(null);
      await qc.invalidateQueries({ queryKey: ['refunds', orderId] });
    },
    onError: (err: Error) => {
      setError(err.message);
      setMessage(null);
    },
  });

  const requestReturn = useMutation({
    mutationFn: () => {
      const o = order.data!;
      const line = o.lines[0];
      if (!line) throw new Error('No lines');
      return apiFetch<ReturnRequest>('/v1/fulfilment/returns', {
        method: 'POST',
        body: JSON.stringify({
          orderId: o.id,
          idempotencyKey: crypto.randomUUID(),
          reasonCode: 'defective',
          notes: 'Customer return request',
          evidencePaths: [],
          lines: [{ productId: line.productId, sku: line.sku, quantity: 1 }],
        }),
      });
    },
    onSuccess: async () => {
      setMessage('Return requested. Seller/support will review.');
      setError(null);
      await qc.invalidateQueries({ queryKey: ['returns', orderId] });
    },
    onError: (err: Error) => {
      setError(err.message);
      setMessage(null);
    },
  });

  if (order.isLoading) return <p>Loading…</p>;
  if (order.isError || !order.data) return <p className={styles.error}>Order not found.</p>;

  const o = order.data;
  return (
    <article className={styles.stack}>
      <Link to="/orders">← Orders</Link>
      <div className={styles.panel}>
        <span className={styles.badge}>{o.status}</span>
        <h1>Order {o.id}</h1>
        <p>
          Total: {formatZarFromCents(o.totalCents)} (incl. delivery{' '}
          {formatZarFromCents(o.deliveryCents)})
        </p>
        <h2>Lines</h2>
        <ul>
          {o.lines.map((l) => (
            <li key={`${l.productId}_${l.sku}`}>
              {l.title} × {l.quantity} — {formatZarFromCents(l.lineSubtotalCents)} (seller{' '}
              {l.sellerId})
              {o.status === 'paid' && (
                <>
                  {' · '}
                  <Link to={`/products/${l.productId}`}>Leave review</Link>
                </>
              )}
            </li>
          ))}
        </ul>
        <h2>Ship to</h2>
        <p>
          {o.shippingAddress.line1}, {o.shippingAddress.suburb}, {o.shippingAddress.city},{' '}
          {o.shippingAddress.province} {o.shippingAddress.postalCode}
        </p>
        {o.status === 'paid' && (
          <div className={styles.row} style={{ marginTop: '1rem' }}>
            <button
              type="button"
              className={styles.btn}
              disabled={requestRefund.isPending}
              onClick={() => requestRefund.mutate()}
            >
              Request refund
            </button>
            <button
              type="button"
              className={styles.btnGhost}
              disabled={requestReturn.isPending}
              onClick={() => requestReturn.mutate()}
            >
              Request return
            </button>
          </div>
        )}
        {message && <p>{message}</p>}
        {error && <p className={styles.error}>{error}</p>}
      </div>

      <div className={styles.panel}>
        <h2>Shipments</h2>
        {shipments.data?.length === 0 && <p className={styles.muted}>No shipments yet.</p>}
        <ul>
          {shipments.data?.map((s) => (
            <li key={s.id}>
              {s.trackingNumber ?? s.id} — {s.status}
              {s.rateEstimateOnly ? ' · rate was estimate' : ' · booked rate'}
            </li>
          ))}
        </ul>
      </div>

      <div className={styles.panel}>
        <h2>Returns</h2>
        {returns.data?.length === 0 && <p className={styles.muted}>No returns yet.</p>}
        <ul>
          {returns.data?.map((r) => (
            <li key={r.id}>
              {r.id} — {r.status}
            </li>
          ))}
        </ul>
      </div>

      <div className={styles.panel}>
        <h2>Refunds</h2>
        {refunds.data?.length === 0 && <p className={styles.muted}>No refunds yet.</p>}
        <ul>
          {refunds.data?.map((r) => (
            <li key={r.id}>
              {r.id} — {r.status} — {formatZarFromCents(r.amountCents)}
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}
