import { SA_PROVINCES } from '@mavundla/shared';
import { AppError } from '../lib/errors.js';

const NOMINATIM = 'https://nominatim.openstreetmap.org';
const UA = 'NexleMarketplace/1.0 (https://nexle-marketplace.web.app; delivery-geocode)';

type NominatimAddress = {
  road?: string;
  house_number?: string;
  suburb?: string;
  neighbourhood?: string;
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  county?: string;
  state?: string;
  postcode?: string;
};

type NominatimHit = {
  lat: string;
  lon: string;
  display_name?: string;
  address?: NominatimAddress;
};

export type GeocodeSuggestion = {
  label: string;
  line1: string;
  suburb: string;
  city: string;
  province: string;
  postalCode: string;
  lat: number;
  lng: number;
};

function matchProvince(state?: string): string {
  if (!state) return 'Gauteng';
  const n = state.toLowerCase().replace(/\s+/g, ' ').trim();
  return (
    SA_PROVINCES.find((p) => p.toLowerCase() === n || n.includes(p.toLowerCase())) ?? 'Gauteng'
  );
}

function toSuggestion(hit: NominatimHit): GeocodeSuggestion {
  const a = hit.address ?? {};
  const road = [a.house_number, a.road].filter(Boolean).join(' ').trim();
  const suburb = a.suburb || a.neighbourhood || a.county || '';
  const city = a.city || a.town || a.village || a.municipality || '';
  const postalCode = (a.postcode ?? '').replace(/\D/g, '').slice(0, 4);
  const lat = Number(hit.lat);
  const lng = Number(hit.lon);
  const line1 = road || (hit.display_name?.split(',')[0]?.trim() ?? '');
  const label =
    hit.display_name?.trim() ||
    [line1, suburb, city, matchProvince(a.state), postalCode].filter(Boolean).join(', ');
  return {
    label,
    line1,
    suburb,
    city,
    province: matchProvince(a.state),
    postalCode,
    lat,
    lng,
  };
}

async function nominatimGet(pathAndQuery: string): Promise<unknown> {
  const res = await fetch(`${NOMINATIM}${pathAndQuery}`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': UA,
    },
  });
  if (!res.ok) {
    throw new AppError('GEOCODE_UPSTREAM', `Address lookup failed (${res.status})`, 502);
  }
  return res.json();
}

export async function searchAddresses(query: string, limit = 6): Promise<GeocodeSuggestion[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const capped = Math.min(Math.max(limit, 1), 8);
  const data = await nominatimGet(
    `/search?format=jsonv2&q=${encodeURIComponent(q)}&addressdetails=1&countrycodes=za&limit=${capped}`,
  );
  if (!Array.isArray(data)) return [];
  return (data as NominatimHit[]).map(toSuggestion);
}

export async function reverseAddress(lat: number, lng: number): Promise<GeocodeSuggestion | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new AppError('VALIDATION_ERROR', 'Invalid coordinates', 400);
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new AppError('VALIDATION_ERROR', 'Coordinates out of range', 400);
  }
  const data = await nominatimGet(
    `/reverse?format=jsonv2&lat=${lat}&lon=${lng}&addressdetails=1&countrycodes=za`,
  );
  if (!data || typeof data !== 'object' || !('lat' in data)) return null;
  return toSuggestion(data as NominatimHit);
}
