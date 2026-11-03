import type { ProductReview } from '@mavundla/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import styles from '../styles/ui.module.scss';

export function ReviewsPage() {
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
      <h1>Product reviews</h1>
      {list.data?.length === 0 && <p className={styles.muted}>No reviews yet.</p>}
      <ul className={styles.stack} style={{ listStyle: 'none', padding: 0, margin: 0 }}>
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
