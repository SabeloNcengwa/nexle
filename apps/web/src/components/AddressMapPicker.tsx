import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { apiFetch } from '../lib/api';
import styles from './ui.module.scss';

export type AddressMapValue = {
  line1: string;
  line2?: string;
  suburb: string;
  city: string;
  province: string;
  postalCode: string;
  lat?: number;
  lng?: number;
};

type Props = {
  value: AddressMapValue;
  onChange: (next: AddressMapValue) => void;
};

const SA_CENTER: [number, number] = [-28.4793, 24.6727];

// Vite breaks Leaflet's default icon URLs — point at bundled assets.
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

type ReversePayload = {
  suggestion: {
    label: string;
    line1: string;
    suburb: string;
    city: string;
    province: string;
    postalCode: string;
    lat: number;
    lng: number;
  } | null;
};

function MapClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function Recenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], Math.max(map.getZoom(), 16), { animate: true });
  }, [lat, lng, map]);
  return null;
}

function InvalidateSize() {
  const map = useMap();
  useEffect(() => {
    const id = window.setTimeout(() => map.invalidateSize(), 80);
    return () => window.clearTimeout(id);
  }, [map]);
  return null;
}

export function AddressMapPicker({ value, onChange }: Props) {
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  valueRef.current = value;
  onChangeRef.current = onChange;

  const position = useMemo((): [number, number] | null => {
    if (typeof value.lat === 'number' && typeof value.lng === 'number') {
      return [value.lat, value.lng];
    }
    return null;
  }, [value.lat, value.lng]);

  const applyClick = async (lat: number, lng: number) => {
    setBusy(true);
    setGeoError(null);
    setHint(null);
    try {
      const data = await apiFetch<ReversePayload>(
        `/v1/geocode/reverse?lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}`,
      );
      const current = valueRef.current;
      const hit = data.suggestion;
      if (hit) {
        onChangeRef.current({
          line1: hit.line1 || current.line1,
          line2: current.line2,
          suburb: hit.suburb || current.suburb,
          city: hit.city || current.city,
          province: hit.province || current.province,
          postalCode: hit.postalCode || current.postalCode,
          lat: hit.lat,
          lng: hit.lng,
        });
        setHint('Address filled from the map pin. Adjust fields if needed.');
      } else {
        onChangeRef.current({ ...current, lat, lng });
        setHint('Pin set. Fill in the address fields to match this spot.');
      }
    } catch {
      onChangeRef.current({ ...valueRef.current, lat, lng });
      setHint('Pin set. Could not auto-fill address — enter details manually.');
    } finally {
      setBusy(false);
    }
  };

  const useMyLocation = () => {
    setGeoError(null);
    if (!navigator.geolocation) {
      setGeoError('This browser cannot share your location.');
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        void applyClick(pos.coords.latitude, pos.coords.longitude);
      },
      () => {
        setBusy(false);
        setGeoError('Location permission denied or unavailable. Click the map instead.');
      },
      { enableHighAccuracy: true, timeout: 12000 },
    );
  };

  return (
    <div className={styles.mapPicker}>
      <div className={styles.mapPickerHeader}>
        <div>
          <strong>Pin your exact location</strong>
          <p className={styles.muted}>
            Pick a suggested address above, or click / drag the pin for the precise delivery spot.
          </p>
        </div>
        <button type="button" className={styles.btnGhost} onClick={useMyLocation} disabled={busy}>
          Use my location
        </button>
      </div>
      <div className={styles.mapFrame}>
        <MapContainer
          center={position ?? SA_CENTER}
          zoom={position ? 16 : 5}
          className={styles.mapCanvas}
          scrollWheelZoom
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png"
            subdomains="abcd"
            maxZoom={20}
          />
          <InvalidateSize />
          <MapClickHandler onPick={(lat, lng) => void applyClick(lat, lng)} />
          {position && (
            <>
              <Recenter lat={position[0]} lng={position[1]} />
              <Marker
                position={position}
                draggable
                eventHandlers={{
                  dragend: (e) => {
                    const m = e.target as L.Marker;
                    const { lat, lng } = m.getLatLng();
                    void applyClick(lat, lng);
                  },
                }}
              />
            </>
          )}
        </MapContainer>
      </div>
      {busy && <p className={styles.muted}>Updating map…</p>}
      {hint && <p className={styles.muted}>{hint}</p>}
      {geoError && <p className={styles.error}>{geoError}</p>}
      {position && (
        <p className={styles.muted}>
          Coordinates: {position[0].toFixed(5)}, {position[1].toFixed(5)}
        </p>
      )}
    </div>
  );
}
