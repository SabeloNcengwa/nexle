import { formatZarFromCents, type Payout, type Refund } from '@mavundla/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { apiFetch } from '../lib/api';
import styles from '../styles/ui.module.scss';

export function FinancePage() {
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
      <div className={styles.pageHead}>
        <h1>Finance</h1>
        <p className={styles.muted} style={{ margin: 0 }}>
          One Paystack account collects all customer payments. Payment confirm unlocks fulfilment
          immediately (sellers ship without waiting on webhooks or payout holds). On each sale the
          ledger posts an 8% platform fee (Bolt-style) and credits the seller 92% to pending →
          eligible. Withdrawals send that net amount to the seller’s business bank — commission and
          hold affect withdrawals only.
        </p>
      </div>
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

      <h2>Refund queue</h2>
      {refunds.data?.length === 0 && <p className={styles.muted}>Empty.</p>}
      <ul className={styles.stack} style={{ listStyle: 'none', padding: 0, margin: 0 }}>
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

      <h2>Payout queue</h2>
      {payouts.data?.length === 0 && <p className={styles.muted}>Empty.</p>}
      <ul className={styles.stack} style={{ listStyle: 'none', padding: 0, margin: 0 }}>
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
