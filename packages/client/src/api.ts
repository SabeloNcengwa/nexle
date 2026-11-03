import type { Auth } from 'firebase/auth';

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  auth: Auth;
  getGuestCartId?: () => string;
}

export type ApiFetch = <T>(path: string, init?: RequestInit) => Promise<T>;

export function createApiFetch(options: ApiClientOptions): ApiFetch {
  const { baseUrl, auth, getGuestCartId } = options;

  return async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    if (!headers.has('Content-Type') && init.body) {
      headers.set('Content-Type', 'application/json');
    }

    const user = auth.currentUser;
    if (user) {
      const token = await user.getIdToken();
      headers.set('Authorization', `Bearer ${token}`);
    } else if (getGuestCartId) {
      headers.set('X-Guest-Cart-Id', getGuestCartId());
    }

    const res = await fetch(`${baseUrl}${path}`, { ...init, headers });
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
  };
}
