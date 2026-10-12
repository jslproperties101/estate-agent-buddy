// A Google map with markers, an optional route line and click handling. Drawn only when Google Maps is loaded.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../data/useStore';
import { config } from '../config';
import { loadMaps, Maps, MapsError, mapsAuthFailed } from './google';
import { mapStrings } from './strings';
import type { Lang } from '../i18n';

export type MapsStatus = 'loading' | 'ready' | 'no-key' | 'auth' | 'load';

/** Loads Google Maps with the key from Settings or the build. */
export function useGoogleMaps(lang: Lang): { maps: Maps | null; status: MapsStatus } {
  const { state } = useApp();
  const key = config(state.settings).googleMapsApiKey;
  const [res, setRes] = useState<{ maps: Maps | null; status: MapsStatus }>({ maps: null, status: 'loading' });
  useEffect(() => {
    let live = true;
    const w = window as any;
    if (!key && !w.google?.maps?.Map) { setRes({ maps: null, status: 'no-key' }); return; }
    if (mapsAuthFailed()) { setRes({ maps: null, status: 'auth' }); return; }
    setRes({ maps: null, status: 'loading' });
    loadMaps(key, lang).then(m => { if (live) setRes({ maps: m, status: 'ready' }); })
      .catch((e: unknown) => { if (live) setRes({ maps: null, status: e instanceof MapsError && e.code === 'auth' ? 'auth' : e instanceof MapsError && e.code === 'no-key' ? 'no-key' : 'load' }); });
    const onAuth = () => { if (live) setRes({ maps: null, status: 'auth' }); };
    window.addEventListener('eab-maps-auth-failure', onAuth);
    return () => { live = false; window.removeEventListener('eab-maps-auth-failure', onAuth); };
  }, [key, lang]);
  return res;
}

export function MapsNotice({ lang, status }: { lang: Lang; status: MapsStatus }) {
  const m = mapStrings[lang];
  if (status === 'ready') return null;
  if (status === 'loading') return <p className="muted small">…</p>;
  const text = status === 'no-key' ? m.notConfigured : status === 'auth' ? m.authFail : m.loadFail;
  return <p className="notice warn" role="status" data-testid={`maps-${status}`}>{text}</p>;
}

export interface MapMarker { id: string; lat: number; lng: number; title?: string; label?: string; selected?: boolean; kind?: 'property' | 'mark' | 'me' | 'pick' | 'banner'; /** Pin colour for banners (status colour). */ colour?: string }

export function MapView({ maps, markers, path, route, center, zoom = 15, fit, onMarkerClick, onMapClick, onMarkerDrag, height = 320, testId }: {
  maps: Maps; markers: MapMarker[]; path?: { lat: number; lng: number }[]; route?: { lat: number; lng: number }[];
  center?: { lat: number; lng: number }; zoom?: number; fit?: boolean;
  onMarkerClick?: (id: string) => void; onMapClick?: (lat: number, lng: number) => void; onMarkerDrag?: (id: string, lat: number, lng: number) => void;
  height?: number; testId?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const drawn = useRef<{ markers: any[]; line?: any; route?: any }>({ markers: [] });
  const handlers = useRef({ onMarkerClick, onMapClick, onMarkerDrag });
  handlers.current = { onMarkerClick, onMapClick, onMarkerDrag };

  useEffect(() => {
    if (!el.current || map.current) return;
    map.current = new maps.Map(el.current, {
      center: center ?? { lat: 2.8205, lng: 101.8036 }, zoom, mapTypeControl: false, streetViewControl: false, fullscreenControl: false, clickableIcons: false, gestureHandling: 'greedy',
    });
    map.current.addListener?.('click', (e: any) => { const ll = e?.latLng; if (ll) handlers.current.onMapClick?.(ll.lat(), ll.lng()); });
  }, [maps]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    for (const x of drawn.current.markers) x.setMap(null);
    drawn.current.markers = markers.map(mk => {
      const marker = new maps.Marker({
        map: m, position: { lat: mk.lat, lng: mk.lng }, title: mk.title, label: mk.label,
        draggable: !!handlers.current.onMarkerDrag && mk.kind === 'pick',
        zIndex: mk.selected ? 1000 : undefined,
        icon: mk.kind === 'banner' ? { path: maps.SymbolPath?.CIRCLE ?? 0, scale: mk.selected ? 11 : 9, fillColor: mk.colour ?? '#22C55E', fillOpacity: 1, strokeColor: mk.selected ? '#F6E3A1' : '#08080A', strokeWeight: mk.selected ? 3 : 2 }
          : mk.kind === 'me' ? { path: maps.SymbolPath?.CIRCLE ?? 0, scale: 8, fillColor: '#4285F4', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 }
          : mk.kind === 'mark' ? { path: maps.SymbolPath?.CIRCLE ?? 0, scale: 7, fillColor: '#D4AF37', fillOpacity: 1, strokeColor: '#08080A', strokeWeight: 2 }
            : mk.selected ? undefined : undefined,
      });
      marker.addListener?.('click', () => handlers.current.onMarkerClick?.(mk.id));
      marker.addListener?.('dragend', (e: any) => { const ll = e?.latLng; if (ll) handlers.current.onMarkerDrag?.(mk.id, ll.lat(), ll.lng()); });
      return marker;
    });
  }, [maps, markers]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    drawn.current.line?.setMap(null);
    drawn.current.line = path && path.length > 1 ? new maps.Polyline({ map: m, path, strokeColor: '#D4AF37', strokeWeight: 5, strokeOpacity: 0.95 }) : undefined;
    drawn.current.route?.setMap(null);
    drawn.current.route = route && route.length > 1 ? new maps.Polyline({ map: m, path: route, strokeColor: '#4285F4', strokeWeight: 5, strokeOpacity: 0.85 }) : undefined;
  }, [maps, path, route]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const pts = [...markers.map(x => ({ lat: x.lat, lng: x.lng })), ...(path ?? []), ...(route ?? [])];
    if (fit && pts.length > 1 && maps.LatLngBounds) {
      const b = new maps.LatLngBounds();
      for (const p of pts) b.extend(p);
      m.fitBounds(b, 40);
    } else if (center) {
      m.panTo?.(center);
    } else if (pts.length === 1) {
      m.panTo?.(pts[0]);
    }
  }, [maps, fit, center?.lat, center?.lng, markers.length, path?.length, route?.length]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={el} className="gmap" style={{ height }} data-testid={testId ?? 'gmap'} />;
}
