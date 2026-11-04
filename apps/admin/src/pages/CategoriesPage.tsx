import type { Category, CategorySuggestion } from '@mavundla/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { apiFetch } from '../lib/api';
import styles from '../styles/ui.module.scss';

export function CategoriesPage() {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [rewriteNames, setRewriteNames] = useState<Record<string, string>>({});
  const [rewriteSlugs, setRewriteSlugs] = useState<Record<string, string>>({});
  const qc = useQueryClient();

  const categories = useQuery({
    queryKey: ['categories-admin'],
    queryFn: () =>
      apiFetch<Category[]>('/v1/catalogue/categories?includeInactive=true'),
  });

  const suggestions = useQuery({
    queryKey: ['category-suggestions-pending'],
    queryFn: () =>
      apiFetch<CategorySuggestion[]>('/v1/catalogue/category-suggestions?status=pending'),
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

  const review = useMutation({
    mutationFn: (payload: {
      suggestionId: string;
      decision: 'approved' | 'rejected';
      name?: string;
      slug?: string;
      reason?: string;
    }) =>
      apiFetch('/v1/catalogue/category-suggestions/review', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: async () => {
      setMessage('Suggestion reviewed.');
      await qc.invalidateQueries({ queryKey: ['category-suggestions-pending'] });
      await qc.invalidateQueries({ queryKey: ['categories-admin'] });
    },
    onError: (err: Error) => setMessage(err.message),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };

  const active = (categories.data ?? []).filter((c) => c.isActive);
  const pendingCats = (categories.data ?? []).filter((c) => c.pendingApproval);

  return (
    <div className={styles.stack}>
      <h1>Categories</h1>
      <p className={styles.muted}>
        Live departments appear on the storefront. Seller suggestions need your approval — you can
        rewrite the name to match Nexle standards before publishing.
      </p>

      <section className={`${styles.panel} ${styles.stack}`}>
        <h2>Seller suggestions awaiting review</h2>
        {!suggestions.data?.length ? (
          <p className={styles.muted}>No pending suggestions.</p>
        ) : (
          <div className={styles.stack}>
            {suggestions.data.map((s) => (
              <div key={s.id} className={styles.panel} style={{ margin: 0 }}>
                <p style={{ margin: 0 }}>
                  <strong>{s.proposedName}</strong>
                  <span className={styles.muted}> · seller {s.sellerId.slice(0, 8)}…</span>
                </p>
                <label className={styles.field}>
                  Storefront name (optional rewrite)
                  <input
                    value={rewriteNames[s.id] ?? s.proposedName}
                    onChange={(e) =>
                      setRewriteNames((m) => ({ ...m, [s.id]: e.target.value }))
                    }
                  />
                </label>
                <label className={styles.field}>
                  Slug (optional rewrite)
                  <input
                    value={
                      rewriteSlugs[s.id] ??
                      s.proposedName
                        .toLowerCase()
                        .replace(/[^a-z0-9]+/g, '-')
                        .replace(/^-+|-+$/g, '')
                    }
                    onChange={(e) =>
                      setRewriteSlugs((m) => ({ ...m, [s.id]: e.target.value }))
                    }
                  />
                </label>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className={styles.btn}
                    disabled={review.isPending}
                    onClick={() =>
                      review.mutate({
                        suggestionId: s.id,
                        decision: 'approved',
                        name: rewriteNames[s.id] ?? s.proposedName,
                        slug:
                          rewriteSlugs[s.id] ??
                          s.proposedName
                            .toLowerCase()
                            .replace(/[^a-z0-9]+/g, '-')
                            .replace(/^-+|-+$/g, ''),
                      })
                    }
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className={styles.btnGhost}
                    disabled={review.isPending}
                    onClick={() =>
                      review.mutate({
                        suggestionId: s.id,
                        decision: 'rejected',
                        reason: 'Does not meet catalogue standards',
                      })
                    }
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {pendingCats.length > 0 && (
          <p className={styles.muted}>{pendingCats.length} inactive categor(ies) waiting on review.</p>
        )}
      </section>

      <form className={`${styles.panel} ${styles.stack}`} onSubmit={onSubmit}>
        <h2>Add official category</h2>
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

      <section className={`${styles.panel} ${styles.stack}`}>
        <h2>Live categories</h2>
        <ul>
          {active.map((c) => (
            <li key={c.id}>
              <strong>{c.name}</strong> <span className={styles.muted}>({c.slug})</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
