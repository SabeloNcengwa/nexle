import type { Refund, ReturnRequest, Shipment } from '@mavundla/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { apiFetch } from '../lib/api';
import styles from '../styles/ui.module.scss';

export function SupportPage() {
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
      <h1>Support</h1>
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
        <pre style={{ overflow: 'auto', fontSize: '0.85rem' }}>
          {JSON.stringify(lookup.data, null, 2)}
        </pre>
      </div>
    </div>
  );
}
