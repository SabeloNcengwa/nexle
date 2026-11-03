import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { apiFetch } from '../lib/api';
import styles from '../styles/ui.module.scss';

export function CategoriesPage() {
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
      <h1>Categories</h1>
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
      <pre className={styles.panel} style={{ overflow: 'auto', fontSize: '0.85rem' }}>
        {JSON.stringify(categories.data, null, 2)}
      </pre>
    </div>
  );
}
