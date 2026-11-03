import type { SellerApplication } from '@mavundla/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { apiFetch } from '../lib/api';
import styles from '../styles/ui.module.scss';

const KIND_LABELS: Record<string, string> = {
  cipc_registration: 'CIPC registration',
  director_id: 'Director ID',
  proof_of_address: 'Proof of address',
  bank_confirmation: 'Bank confirmation',
  signed_merchant_contract: 'Signed merchant agreement',
  vat_certificate: 'VAT certificate',
};

interface DocLink {
  kind: string;
  fileName: string;
  contentType: string;
  path: string;
  url: string;
  expiresAt: string;
}

function ApplicationDetail({
  application,
  onClose,
}: {
  application: SellerApplication;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const docs = useQuery({
    queryKey: ['app-docs', application.id],
    queryFn: () =>
      apiFetch<DocLink[]>(`/v1/sellers/applications/${application.id}/documents`),
  });

  const startReview = useMutation({
    mutationFn: () =>
      apiFetch(`/v1/sellers/applications/${application.id}/start-review`, {
        method: 'POST',
        body: '{}',
      }),
    onSuccess: async () => {
      setMessage('Marked under review.');
      await qc.invalidateQueries({ queryKey: ['seller-review-queue'] });
    },
  });

  const review = useMutation({
    mutationFn: (decision: 'approved' | 'rejected') =>
      apiFetch('/v1/sellers/applications/review', {
        method: 'POST',
        body: JSON.stringify({
          applicationId: application.id,
          decision,
          reason: reason || undefined,
        }),
      }),
    onSuccess: async () => {
      setMessage('Decision recorded.');
      await qc.invalidateQueries({ queryKey: ['seller-review-queue'] });
      onClose();
    },
  });

  return (
    <div className={`${styles.panel} ${styles.stack}`}>
      <div className={styles.row} style={{ justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>{application.businessName}</h2>
        <button type="button" className={styles.btnGhost} onClick={onClose}>
          Close
        </button>
      </div>
      <p className={styles.muted}>
        Status: <span className={styles.mono}>{application.status}</span> · Contact{' '}
        {application.contactEmail} · {application.contactPhone}
      </p>
      <p className={styles.muted}>
        Merchant agreement version on file: {application.sellerAgreementVersion}. Confirm the
        uploaded signed copy matches that version before you approve.
      </p>
      <div>
        <h3>Company documents</h3>
        {docs.isLoading && <p>Loading document links…</p>}
        {docs.isError && (
          <p className={styles.error}>
            Could not load signed URLs (Storage / credentials). Document metadata still shown below.
          </p>
        )}
        <ul className={styles.docList}>
          {(docs.data ?? application.documentRefs).map((d) => {
            const kind = 'kind' in d ? d.kind : 'document';
            const href = 'url' in d ? (d as DocLink).url : undefined;
            return (
              <li key={`${kind}-${d.fileName}`}>
                <strong>{KIND_LABELS[kind] ?? kind}</strong> — {d.fileName}
                {href ? (
                  <>
                    {' '}
                    <a href={href} target="_blank" rel="noreferrer">
                      Open
                    </a>
                  </>
                ) : (
                  <span className={styles.muted}> · path {d.path}</span>
                )}
              </li>
            );
          })}
          {(application.documentRefs?.length ?? 0) === 0 && (
            <li className={styles.muted}>No documents uploaded.</li>
          )}
        </ul>
      </div>
      <label className={styles.field}>
        Decision reason (required for reject)
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
      </label>
      {message && <p>{message}</p>}
      <div className={styles.row}>
        {application.status === 'submitted' && (
          <button type="button" className={styles.btnGhost} onClick={() => startReview.mutate()}>
            Start review
          </button>
        )}
        <button
          type="button"
          className={styles.btn}
          onClick={() => review.mutate('approved')}
          disabled={review.isPending}
        >
          Approve seller
        </button>
        <button
          type="button"
          className={styles.btnGhost}
          onClick={() => review.mutate('rejected')}
          disabled={review.isPending || !reason.trim()}
        >
          Reject
        </button>
      </div>
    </div>
  );
}

export function SellersPage() {
  const [selected, setSelected] = useState<SellerApplication | null>(null);
  const queue = useQuery({
    queryKey: ['seller-review-queue'],
    queryFn: () => apiFetch<SellerApplication[]>('/v1/sellers/applications/review-queue'),
  });

  return (
    <div className={styles.stack}>
      <div className={styles.pageHead}>
        <h1>Seller partners</h1>
        <p className={styles.muted} style={{ margin: 0 }}>
          Vet company documents. Once approved, merchants list and fulfil on their own — Nexle
          doesn’t warehouse their stock.
        </p>
      </div>
      {selected && (
        <ApplicationDetail application={selected} onClose={() => setSelected(null)} />
      )}
      {queue.isLoading && <p>Loading…</p>}
      <section className={styles.panel}>
        {!queue.data?.length ? (
          <div className={styles.empty}>No applications waiting — queue is clear.</div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Business</th>
                  <th>Status</th>
                  <th>Documents</th>
                  <th>Contact</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {queue.data.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <strong>{a.businessName}</strong>
                    </td>
                    <td>
                      <span className={styles.pillWarn}>{a.status}</span>
                    </td>
                    <td>{a.documentRefs?.length ?? 0}</td>
                    <td className={styles.muted}>{a.contactEmail}</td>
                    <td>
                      <button type="button" className={styles.btn} onClick={() => setSelected(a)}>
                        Review docs
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
