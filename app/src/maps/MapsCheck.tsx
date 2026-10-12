// Settings → Check Google Maps: loads a real Google map with the configured key and tests each Google service the
// app uses, one by one, saying exactly which Google Cloud setting to change when something fails.
// It never invents results: a row is "Working" only after Google answered that request.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react';
import { Lang } from '../i18n';
import { useApp } from '../data/useStore';
import { config } from '../config';
import { mapStrings } from './strings';
import { MapView, useGoogleMaps, useMapsErrorCode } from './MapView';
import { reverseGeocode } from './google';

type Item = 'map' | 'geocode' | 'places' | 'routes' | 'gps';
const ITEMS: Item[] = ['map', 'geocode', 'places', 'routes', 'gps'];
interface Result { ok: boolean | null; msg?: string }
const NILAI = { lat: 2.8167, lng: 101.7972 };
const KLIA = { lat: 2.7456, lng: 101.7072 };

export function MapsCheck({ lang }: { lang: Lang }) {
  const { state } = useApp();
  const m = mapStrings[lang].check;
  const [run, setRun] = useState(0);
  const src = config(state.settings).source.googleMapsApiKey;
  return (
    <div className="stack-sm" data-testid="maps-check">
      <small className="muted">{m.help}</small>
      <small className="muted" data-testid="maps-key-source">{m.keyFrom[src]}</small>
      <button className="btn secondary" onClick={() => setRun(r => r + 1)} data-testid="maps-check-run">🗺 {m.run}</button>
      {run > 0 && <CheckRun key={run} lang={lang} />}
    </div>
  );
}

function CheckRun({ lang }: { lang: Lang }) {
  const ms = mapStrings[lang];
  const m = ms.check;
  const { maps, status } = useGoogleMaps(lang);
  const code = useMapsErrorCode();
  const [res, setRes] = useState<Record<Item, Result>>({ map: { ok: null }, geocode: { ok: null }, places: { ok: null }, routes: { ok: null }, gps: { ok: null } });
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const set = (k: Item, r: Result) => setRes(x => ({ ...x, [k]: r }));
  const errText = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200);

  // Map problems reported by Google (wrong website, API off, billing…).
  useEffect(() => {
    if (status === 'no-key') { for (const k of ITEMS) if (k !== 'gps') set(k, { ok: false, msg: ms.notConfigured }); }
    else if (status === 'auth' || status === 'load' || code) {
      set('map', { ok: false, msg: code ? `${ms.fix[code] ?? ms.authFail} (${code})` : status === 'auth' ? ms.authFail : ms.loadFail });
      // Without the map library the other Google services cannot be tried: say so instead of waiting forever.
      if (status !== 'ready') for (const k of ['geocode', 'places', 'routes'] as Item[]) setRes(x => (x[k].ok === null ? { ...x, [k]: { ok: false, msg: m.skipped } } : x));
    }
  }, [status, code]); // eslint-disable-line react-hooks/exhaustive-deps

  // The Google services, each tested on its own.
  useEffect(() => {
    if (!maps) return;
    let live = true;
    const done = (k: Item, r: Result) => { if (live) set(k, r); };
    // Give Google a moment to report a key problem before calling the map working.
    const t = setTimeout(() => { if (live) setRes(x => (x.map.ok === null ? { ...x, map: { ok: true } } : x)); }, 2500);
    void (async () => {
      try {
        const r = await reverseGeocode(maps, NILAI.lat, NILAI.lng);
        done('geocode', r ? { ok: true, msg: r.formatted } : { ok: false, msg: m.apiOff('Geocoding API') });
      } catch (e) { done('geocode', { ok: false, msg: `${m.apiOff('Geocoding API')} — ${errText(e)}` }); }
      try {
        const places: any = await maps.importLibrary('places');
        const { suggestions } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({ input: 'Nilai', includedRegionCodes: ['my'] });
        done('places', { ok: true, msg: (suggestions ?? []).slice(0, 2).map((x: any) => x.placePrediction?.text?.text).filter(Boolean).join(' · ') });
      } catch (e) { done('places', { ok: false, msg: `${m.apiOff('Places API (New)')} — ${errText(e)}` }); }
      try {
        const { Route }: any = await maps.importLibrary('routes');
        const { routes } = await Route.computeRoutes({ origin: NILAI, destination: KLIA, travelMode: 'DRIVING', fields: ['distanceMeters'] });
        const d = routes?.[0]?.distanceMeters;
        done('routes', d ? { ok: true, msg: `Nilai → KLIA ${(d / 1000).toFixed(1)} km` } : { ok: false, msg: m.apiOff('Routes API') });
      } catch (e) { done('routes', { ok: false, msg: `${m.apiOff('Routes API')} — ${errText(e)}` }); }
    })();
    return () => { live = false; clearTimeout(t); };
  }, [maps]); // eslint-disable-line react-hooks/exhaustive-deps

  // The phone's GPS (independent of Google).
  useEffect(() => {
    if (!('geolocation' in navigator)) { set('gps', { ok: false, msg: m.gpsOff }); return; }
    navigator.geolocation.getCurrentPosition(
      p => { setMe({ lat: p.coords.latitude, lng: p.coords.longitude }); set('gps', { ok: true, msg: `${p.coords.latitude.toFixed(5)}, ${p.coords.longitude.toFixed(5)} ±${Math.round(p.coords.accuracy)} m` }); },
      e => set('gps', { ok: false, msg: e.code === 1 ? m.gpsDenied : m.gpsOff }),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="stack-sm">
      {maps && (
        <MapView maps={maps} height={260} fit testId="maps-check-map" me={me}
          markers={[{ id: 'pin', lat: NILAI.lat, lng: NILAI.lng, title: m.pin, kind: 'property' }, ...(me ? [{ id: 'gps', lat: me.lat, lng: me.lng, title: m.here, kind: 'mark' as const }] : [])]} />
      )}
      <ul className="check-list">
        {ITEMS.map(k => {
          const r = res[k];
          return (
            <li key={k} data-testid={`check-${k}`} data-ok={r.ok === null ? 'pending' : String(r.ok)} className={r.ok === null ? '' : r.ok ? 'ok' : 'bad'}>
              <span aria-hidden="true" className="check-mark">{r.ok === null ? '…' : r.ok ? '✓' : '✕'}</span>
              <span className="stack-sm check-body">
                <strong>{m.item[k]} — {r.ok === null ? m.running : r.ok ? m.ok : m.fail}</strong>
                {r.msg && <small className={r.ok ? 'muted' : 'warn-text'}>{r.msg}</small>}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
