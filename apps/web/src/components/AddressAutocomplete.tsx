import { useEffect, useId, useRef, useState } from 'react';
import { apiFetch } from '../lib/api';
import type { AddressMapValue } from './AddressMapPicker';
import styles from './ui.module.scss';

type Suggestion = AddressMapValue & { label: string };

type Props = {
  value: string;
  onInputChange: (value: string) => void;
  onSelect: (next: AddressMapValue) => void;
  required?: boolean;
  placeholder?: string;
};

export function AddressAutocomplete({
  value,
  onInputChange,
  onSelect,
  required,
  placeholder = 'Start typing your street address…',
}: Props) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [active, setActive] = useState(-1);
  const skipNext = useRef(false);

  useEffect(() => {
    if (skipNext.current) {
      skipNext.current = false;
      return;
    }
    const q = value.trim();
    if (q.length < 3) {
      setItems([]);
      setOpen(false);
      return;
    }

    const handle = window.setTimeout(() => {
      void (async () => {
        setBusy(true);
        try {
          const data = await apiFetch<{ suggestions: Suggestion[] }>(
            `/v1/geocode/search?q=${encodeURIComponent(q)}&limit=6`,
          );
          setItems(data.suggestions);
          setOpen(data.suggestions.length > 0);
          setActive(-1);
        } catch {
          setItems([]);
          setOpen(false);
        } finally {
          setBusy(false);
        }
      })();
    }, 350);

    return () => window.clearTimeout(handle);
  }, [value]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const pick = (s: Suggestion) => {
    skipNext.current = true;
    setOpen(false);
    setItems([]);
    onSelect({
      line1: s.line1 || s.label.split(',')[0]?.trim() || value,
      line2: undefined,
      suburb: s.suburb,
      city: s.city,
      province: s.province,
      postalCode: s.postalCode,
      lat: s.lat,
      lng: s.lng,
    });
  };

  return (
    <div className={styles.suggestWrap} ref={rootRef}>
      <label className={styles.field}>
        Street address
        <input
          required={required}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            onInputChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            if (items.length) setOpen(true);
          }}
          onKeyDown={(e) => {
            if (!open || !items.length) return;
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((i) => (i + 1) % items.length);
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((i) => (i <= 0 ? items.length - 1 : i - 1));
            } else if (e.key === 'Enter' && active >= 0) {
              e.preventDefault();
              pick(items[active]!);
            } else if (e.key === 'Escape') {
              setOpen(false);
            }
          }}
        />
      </label>
      {busy && <p className={styles.suggestStatus}>Searching addresses…</p>}
      {open && items.length > 0 && (
        <ul id={listId} role="listbox" className={styles.suggestList}>
          {items.map((s, i) => (
            <li key={`${s.lat}-${s.lng}-${s.label}`}>
              <button
                type="button"
                role="option"
                aria-selected={i === active}
                className={i === active ? styles.suggestOptionActive : styles.suggestOption}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(s)}
              >
                {s.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
