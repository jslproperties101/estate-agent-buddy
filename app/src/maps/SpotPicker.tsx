// Choosing an exact spot: tap the map (or drag the pin), use the phone's current GPS position, or keep the
// starting spot. Used by House Shopping (mark a property found on the way, and move a mark later); the property
// form uses LocationPicker (which also reads the address) and My Banner Location has its own sheet.
import { useState } from 'react';
import { Lang } from '../i18n';
import { mapStrings } from './strings';
import { MapView } from './MapView';
import type { Maps } from './google';
import { listingStrings } from '../listing/strings';

export interface Spot { lat: number; lng: number; acc?: number; source: 'gps' | 'map' }

export function SpotPicker({ lang, maps, spot, onChange, height = 220, testId = 'spot-map' }: {
  lang: Lang; maps: Maps | null; spot: Spot | null; onChange: (s: Spot) => void; height?: number; testId?: string;
}) {
  const m = mapStrings[lang];
  const ls = listingStrings[lang];
  const [locating, setLocating] = useState(false);
  const [err, setErr] = useState<'denied' | 'off' | null>(null);
  function gps() {
    setErr(null);
    if (!('geolocation' in navigator)) { setErr('off'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      p => { setLocating(false); onChange({ lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy), source: 'gps' }); },
      e => { setLocating(false); setErr(e.code === 1 ? 'denied' : 'off'); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 3000 },
    );
  }
  return (
    <div className="stack-sm" data-testid={`${testId}-picker`}>
      {maps && (
        <>
          <small className="muted">{m.tapHint}</small>
          <MapView maps={maps} height={height} center={spot ?? undefined} zoom={18} testId={testId}
            markers={spot ? [{ id: 'pick', lat: spot.lat, lng: spot.lng, kind: 'pick' }] : []}
            onMapClick={(lat, lng) => onChange({ lat, lng, source: 'map' })} onMarkerDrag={(_, lat, lng) => onChange({ lat, lng, source: 'map' })} />
        </>
      )}
      <button type="button" className="btn secondary" onClick={gps} disabled={locating} data-testid={`${testId}-gps`}>📍 {locating ? m.locatingMe : m.myLocation}</button>
      {spot && <small className="ok-text" data-testid={`${testId}-pos`}>{ls.position(spot.lat.toFixed(5), spot.lng.toFixed(5))}{spot.acc ? ` · ±${spot.acc} m` : ''}</small>}
      {err && <p className="error" role="alert">{err === 'denied' ? m.meDenied : m.check.gpsOff}</p>}
      {!maps && <small className="muted">{m.notConfigured}</small>}
    </div>
  );
}
