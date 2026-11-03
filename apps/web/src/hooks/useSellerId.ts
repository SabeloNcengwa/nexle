import { useAuth } from '@mavundla/client';

/** Primary active seller membership for the signed-in user. */
export function useSellerId(): string | null {
  const { memberships } = useAuth();
  const active = memberships.find((m) => m.status === 'active');
  return active?.sellerId ?? null;
}
