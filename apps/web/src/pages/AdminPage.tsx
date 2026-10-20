import {
  formatZarFromCents,
  type Payout,
  type Product,
  type ProductReview,
  type Refund,
  type ReturnRequest,
  type SellerApplication,
  type Shipment,
} from '@mavundla/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import styles from '../components/ui.module.scss';

function SellerReviewPanel() {
  const qc = useQueryClient();
  const queue = useQuery({
    queryKey: ['seller-review-queue'],
    queryFn: () => apiFetch<SellerApplication[]>('/v1/sellers/applications/review-queue'),
  });

  const review = useMutation({
    mutationFn: (payload: { applicationId: string; decision: 'approved' | 'rejected' }) =>
      apiFetch('/v1/sellers/applications/review', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['seller-review-queue'] });
    },
  });

  return (
    <div className={styles.stack}>
      <h2>Seller applications</h2>
      {queue.isLoading && <p>Loading…</p>}
      {queue.data?.length === 0 && <p className={styles.muted}>No applications awaiting review.</p>}
      <ul>
        {queue.data?.map((a) => (
          <li key={a.id} className={styles.panel}>
            <strong>{a.businessName}</strong> — {a.status}
            <div className={styles.row} style={{ marginTop: '0.75rem' }}>
              <button
                type="button"
                className={styles.btn}
                onClick={() => review.mutate({ applicationId: a.id, decision: 'approved' })}
              >
                Approve
              </button>
              <button
                type="button"
                className={styles.btnGhost}
                onClick={() =>
                  review.mutate({ applicationId: a.id, decision: 'rejected' })
                }
              >
                Reject
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ModerationPanel() {
  const qc = useQueryClient();
  const pending = useQuery({
    queryKey: ['pending-products'],
    queryFn: () => apiFetch<Product[]>('/v1/catalogue/products/pending'),
  });

  const moderate = useMutation({
    mutationFn: (payload: { productId: string; decision: 'active' | 'rejected'; reason?: string }) =>
      apiFetch('/v1/catalogue/products/moderate', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['pending-products'] });
    },
  });

  return (
    <div className={styles.stack}>
      <h2>Listing moderation</h2>
      {pending.data?.length === 0 && <p className={styles.muted}>No pending listings.</p>}
      <ul>
        {pending.data?.map((p) => (
          <li key={p.id} className={styles.panel}>
            <strong>{p.title}</strong> ({p.id})
            <div className={styles.row} style={{ marginTop: '0.75rem' }}>
              <button
                type="button"
                className={styles.btn}
                onClick={() => moderate.mutate({ productId: p.id, decision: 'active' })}
              >
                Approve
              </button>
              <button
                type="button"
                className={styles.btnGhost}
                onClick={() =>
                  moderate.mutate({
                    productId: p.id,
                    decision: 'rejected',
                    reason: 'Does not meet catalogue standards',
                  })
                }
              >
                Reject
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CategoriesPanel() {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const qc = useQueryClient();

  const categories = useQuery({
    queryKey: ['categories-admin'],
    queryFn: () => apiFetch('/v1/catalogue/categories?includeInactive=true'),
  });

  const create = useMutation({
    mutationFn: () =>
      apiFetch('/v1/catalogue/categories', {
        method: 'POST',
        body: JSON.stringify({ name, slug, isActive: true, sortOrder: 0 }),
      }),
    onSuccess: async () => {
      setMessage('Category created.');
      setName('');
      setSlug('');
      await qc.invalidateQueries({ queryKey: ['categories-admin'] });
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };

  return (
    <div className={styles.stack}>
      <h2>Categories</h2>
      <form className={`${styles.panel} ${styles.stack}`} onSubmit={onSubmit}>
        <label className={styles.field}>
          Name
          <input required value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className={styles.field}>
          Slug
          <input
            required
            pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
          />
        </label>
        {message && <p>{message}</p>}
        <button className={styles.btn} type="submit">
          Create category
        </button>
      </form>
      <pre className={styles.panel}>{JSON.stringify(categories.data, null, 2)}</pre>
    </div>
  );
}

function FinancePanel() {
  const qc = useQueryClient();
  const refunds = useQuery({
    queryKey: ['refund-queue'],
    queryFn: () => apiFetch<Refund[]>('/v1/finance/refunds/queue'),
  });
  const payouts = useQuery({
    queryKey: ['payout-queue'],
    queryFn: () => apiFetch<Payout[]>('/v1/finance/payouts/queue'),
  });
  const [sellerId, setSellerId] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const reviewRefund = useMutation({
    mutationFn: (payload: { refundId: string; decision: 'approved' | 'rejected' }) =>
      apiFetch('/v1/finance/refunds/review', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['refund-queue'] });
    },
  });

  const submitRefund = useMutation({
    mutationFn: async (refundId: string) => {
      const submitted = await apiFetch<Refund>(`/v1/finance/refunds/${refundId}/submit-provider`, {
        method: 'POST',
        body: '{}',
      });
      if (submitted.providerRefundRef) {
        await apiFetch('/v1/payments/mock/refunds/confirm', {
          method: 'POST',
          body: JSON.stringify({
            providerRefundRef: submitted.providerRefundRef,
            status: 'succeeded',
          }),
        });
      }
      return apiFetch(`/v1/finance/refunds/${refundId}/reconcile`, {
        method: 'POST',
        body: '{}',
      });
    },
    onSuccess: async () => {
      setMessage('Refund submitted to mock provider, confirmed, and reconciled.');
      await qc.invalidateQueries({ queryKey: ['refund-queue'] });
    },
  });

  const reviewPayout = useMutation({
    mutationFn: async (payoutId: string) => {
      const payout = await apiFetch<Payout>('/v1/finance/payouts/review', {
        method: 'POST',
        body: JSON.stringify({ payoutId, decision: 'approve_and_initiate' }),
      });
      if (payout.providerPayoutRef) {
        await apiFetch('/v1/payments/mock/payouts/confirm', {
          method: 'POST',
          body: JSON.stringify({ providerPayoutRef: payout.providerPayoutRef, status: 'paid' }),
        });
      }
      return apiFetch(`/v1/finance/payouts/${payoutId}/reconcile`, {
        method: 'POST',
        body: '{}',
      });
    },
    onSuccess: async () => {
      setMessage('Payout initiated, mock-confirmed, and reconciled to paid.');
      await qc.invalidateQueries({ queryKey: ['payout-queue'] });
    },
  });

  const release = useMutation({
    mutationFn: () =>
      apiFetch('/v1/finance/eligibility/release', {
        method: 'POST',
        body: JSON.stringify({ sellerId }),
      }),
    onSuccess: () => setMessage('Pending balance released to eligible.'),
  });

  return (
    <div className={styles.stack}>
      <h2>Finance</h2>
      <p className={styles.muted}>
        Mock provider only. Refunds are not complete until provider status is reconciled. This is
        not escrow.
      </p>
      {message && <p>{message}</p>}

      <div className={styles.panel}>
        <h3>Release eligibility</h3>
        <label className={styles.field}>
          Seller ID
          <input value={sellerId} onChange={(e) => setSellerId(e.target.value)} />
        </label>
        <button type="button" className={styles.btn} onClick={() => release.mutate()}>
          Release pending → eligible
        </button>
      </div>

      <h3>Refund queue</h3>
      {refunds.data?.length === 0 && <p className={styles.muted}>Empty.</p>}
      <ul className={styles.stack}>
        {refunds.data?.map((r) => (
          <li key={r.id} className={styles.panel}>
            {r.id} — {r.status} — {formatZarFromCents(r.amountCents)}
            <div className={styles.row}>
              {(r.status === 'requested' || r.status === 'under_review') && (
                <>
                  <button
                    type="button"
                    className={styles.btn}
                    onClick={() => reviewRefund.mutate({ refundId: r.id, decision: 'approved' })}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className={styles.btnGhost}
                    onClick={() => reviewRefund.mutate({ refundId: r.id, decision: 'rejected' })}
                  >
                    Reject
                  </button>
                </>
              )}
              {(r.status === 'approved' || r.status === 'failed') && (
                <button
                  type="button"
                  className={styles.btn}
                  onClick={() => submitRefund.mutate(r.id)}
                >
                  Submit + reconcile (mock)
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      <h3>Payout queue</h3>
      {payouts.data?.length === 0 && <p className={styles.muted}>Empty.</p>}
      <ul className={styles.stack}>
        {payouts.data?.map((p) => (
          <li key={p.id} className={styles.panel}>
            {p.id} — seller {p.sellerId} — {p.status} — {formatZarFromCents(p.amountCents)}
            {p.status === 'eligible' && (
              <div className={styles.row}>
                <button
                  type="button"
                  className={styles.btn}
                  onClick={() => reviewPayout.mutate(p.id)}
                >
                  Approve + reconcile (mock)
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SupportPanel() {
  const [orderId, setOrderId] = useState('');
  const [note, setNote] = useState('');
  const dashboard = useQuery({
    queryKey: ['support-dashboard'],
    queryFn: () =>
      apiFetch<{
        exceptionShipments: Shipment[];
        openReturns: ReturnRequest[];
        openRefunds: Refund[];
      }>('/v1/fulfilment/support/dashboard'),
  });
  const lookup = useQuery({
    queryKey: ['support-order', orderId],
    enabled: orderId.length > 8,
    queryFn: () => apiFetch(`/v1/fulfilment/support/orders/${orderId}`),
  });
  const addNote = useMutation({
    mutationFn: () =>
      apiFetch('/v1/fulfilment/support/notes', {
        method: 'POST',
        body: JSON.stringify({
          resourceType: 'order',
          resourceId: orderId,
          note,
          visibility: 'customer',
        }),
      }),
  });

  return (
    <div className={styles.stack}>
      <h2>Support</h2>
      <div className={styles.panel}>
        <h3>Queues</h3>
        <p>
          Exceptions: {dashboard.data?.exceptionShipments.length ?? 0} · Returns:{' '}
          {dashboard.data?.openReturns.length ?? 0} · Refunds:{' '}
          {dashboard.data?.openRefunds.length ?? 0}
        </p>
      </div>
      <div className={styles.panel}>
        <h3>Order lookup</h3>
        <label className={styles.field}>
          Order ID
          <input value={orderId} onChange={(e) => setOrderId(e.target.value)} />
        </label>
        <label className={styles.field}>
          Customer-visible note
          <textarea value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <button type="button" className={styles.btn} onClick={() => addNote.mutate()}>
          Add note
        </button>
        <pre>{JSON.stringify(lookup.data, null, 2)}</pre>
      </div>
    </div>
  );
}

function ReviewsModerationPanel() {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ['reviews-moderation'],
    queryFn: () => apiFetch<ProductReview[]>('/v1/reviews/moderation'),
  });

  const moderate = useMutation({
    mutationFn: (payload: {
      reviewId: string;
      decision: 'published' | 'hidden' | 'rejected';
    }) =>
      apiFetch('/v1/reviews/moderate', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['reviews-moderation'] });
    },
  });

  return (
    <div className={styles.stack}>
      <h2>Product reviews</h2>
      {list.isLoading && <p>Loading…</p>}
      {list.data?.length === 0 && <p className={styles.muted}>No reviews yet.</p>}
      <ul className={styles.stack}>
        {list.data?.map((r) => (
          <li key={r.id} className={styles.panel}>
            <strong>
              {r.rating}★ {r.title}
            </strong>{' '}
            — {r.status}
            <div className={styles.muted}>
              product {r.productId} · {r.authorDisplayName}
            </div>
            <p>{r.body}</p>
            <div className={styles.row}>
              <button
                type="button"
                className={styles.btn}
                onClick={() => moderate.mutate({ reviewId: r.id, decision: 'published' })}
              >
                Publish
              </button>
              <button
                type="button"
                className={styles.btnGhost}
                onClick={() => moderate.mutate({ reviewId: r.id, decision: 'hidden' })}
              >
                Hide
              </button>
              <button
                type="button"
                className={styles.btnGhost}
                onClick={() => moderate.mutate({ reviewId: r.id, decision: 'rejected' })}
              >
                Reject
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AdminPage() {
  return (
    <div className={styles.stack}>
      <h1>Nexle Administration</h1>
      <p className={styles.muted}>
        Privileged access only. First admin must be bootstrapped — public admin registration is
        disabled.
      </p>
      <nav className={styles.row}>
        <Link to="/admin">Sellers</Link>
        <Link to="/admin/moderation">Moderation</Link>
        <Link to="/admin/reviews">Reviews</Link>
        <Link to="/admin/categories">Categories</Link>
        <Link to="/admin/finance">Finance</Link>
        <Link to="/admin/support">Support</Link>
      </nav>
      <Routes>
        <Route index element={<SellerReviewPanel />} />
        <Route path="moderation" element={<ModerationPanel />} />
        <Route path="reviews" element={<ReviewsModerationPanel />} />
        <Route path="categories" element={<CategoriesPanel />} />
        <Route path="finance" element={<FinancePanel />} />
        <Route path="support" element={<SupportPanel />} />
      </Routes>
    </div>
  );
}
