const KEY = 'mavundla_guest_cart_id';

export function getOrCreateGuestCartId(): string {
  const existing = localStorage.getItem(KEY);
  if (existing && existing.length >= 8) return existing;
  const id = crypto.randomUUID().replace(/-/g, '');
  localStorage.setItem(KEY, id);
  return id;
}

export function clearGuestCartId(): void {
  localStorage.removeItem(KEY);
}
