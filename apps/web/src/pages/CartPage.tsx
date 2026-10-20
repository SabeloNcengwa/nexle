import type { Cart } from '@mavundla/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import styles from '../components/ui.module.scss';

export function CartPage() {
  const qc = useQueryClient();
  const cart = useQuery({
    queryKey: ['cart'],
    queryFn: () => apiFetch<Cart>('/v1/cart'),
  });

  const update = useMutation({
    mutationFn: (body: { productId: string; sku: string; quantity: number }) =>
      apiFetch<Cart>('/v1/cart/items', { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['cart'] });
    },
  });

  if (cart.isLoading) return <p>Loading cart…</p>;
  if (cart.isError) return <p className={styles.error}>Could not load cart.</p>;

  const items = cart.data?.items ?? [];

  return (
    <div className={styles.stack}>
      <h1>Cart</h1>
      {items.length === 0 ? (
        <p className={styles.muted}>
          Your cart is empty. <Link to="/browse">Browse products</Link>
        </p>
      ) : (
        <div className={styles.panel}>
          <ul className={styles.stack}>
            {items.map((item) => (
              <li key={`${item.productId}_${item.sku}`} className={styles.row}>
                <div style={{ flex: 1 }}>
                  <strong>{item.titleSnapshot}</strong>
                  <div className={styles.muted}>
                    {item.sku} · seller {item.sellerId}
                  </div>
                </div>
                <label className={styles.field}>
                  Qty
                  <input
                    type="number"
                    min={0}
                    max={99}
                    value={item.quantity}
                    onChange={(e) =>
                      update.mutate({
                        productId: item.productId,
                        sku: item.sku,
                        quantity: Number(e.target.value),
                      })
                    }
                  />
                </label>
              </li>
            ))}
          </ul>
          <p className={styles.muted}>
            Prices are recalculated at checkout on the server (integer cents, ZAR).
          </p>
          <div className={styles.row}>
            <Link className={styles.btn} to="/checkout">
              Checkout
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
