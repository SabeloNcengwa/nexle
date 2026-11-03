import { createApiFetch, getOrCreateGuestCartId } from '@mavundla/client';
import { firebaseAuth } from './firebase';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080';

export const apiFetch = createApiFetch({
  baseUrl: API_BASE,
  auth: firebaseAuth,
  getGuestCartId: getOrCreateGuestCartId,
});

export { ApiError } from '@mavundla/client';
