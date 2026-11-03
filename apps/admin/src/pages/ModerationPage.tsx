import type { Product } from '@mavundla/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import styles from '../styles/ui.module.scss';

export function ModerationPage() {
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
      <div className={styles.pageHead}>
        <h1>Catalogue quality</h1>
        <p className={styles.muted} style={{ margin: 0 }}>
          Sellers create the listings. You only decide what can appear on the storefront.
        </p>
      </div>
      <section className={styles.panel}>
        {!pending.data?.length ? (
          <div className={styles.empty}>No listings waiting for review.</div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Listing</th>
                  <th>Seller</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {pending.data.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.title}</strong>
                      <div className={styles.muted}>{p.id}</div>
                    </td>
                    <td className={styles.mono}>{p.sellerId}</td>
                    <td>
                      <div className={styles.row}>
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
