import { firebaseAuth } from './firebase';
import { getOrCreateGuestCartId } from './guestCart';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080';

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');

  const user = firebaseAuth.currentUser;
  if (user) {
    const token = await user.getIdToken();
    headers.set('Authorization', `Bearer ${token}`);
  } else {
    headers.set('X-Guest-Cart-Id', getOrCreateGuestCartId());
  }

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  const json = (await res.json().catch(() => ({}))) as {
    data?: T;
    error?: { code?: string; message?: string };
  };

  if (!res.ok) {
    throw new ApiError(
      json.error?.code ?? 'REQUEST_FAILED',
      json.error?.message ?? `Request failed (${res.status})`,
      res.status,
    );
  }

  return json.data as T;
}
