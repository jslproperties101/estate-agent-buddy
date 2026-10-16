// A Google map with markers, an optional route line and click handling. Drawn only when Google Maps is loaded.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../data/useStore';
import { config } from '../config';
import { loadMaps, Maps, MapsError, mapsAuthFailed, lastMapsError } from './google';
import { useLivePosition, PositionState } from './position';
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

/** The Google error code (for example RefererNotAllowedMapError) once Google reports one. */
export function useMapsErrorCode(): string | null {
  const [code, setCode] = useState<string | null>(lastMapsError());
  useEffect(() => {
    const on = (e: Event) => setCode((e as CustomEvent<string>).detail);
    window.addEventListener('eab-maps-error', on);
    return () => window.removeEventListener('eab-maps-error', on);
  }, []);
  return code;
}

export function MapsNotice({ lang, status }: { lang: Lang; status: MapsStatus }) {
  const m = mapStrings[lang];
  const code = useMapsErrorCode();
  // Google can refuse the key after the map has started (for example a website restriction): show the fix then too.
  if (status === 'ready' && !code) return null;
  if (status === 'loading') return <p className="muted small">…</p>;
  const text = status === 'no-key' ? m.notConfigured
    : code ? (m.fix[code] ?? m.authFail)
      : status === 'auth' ? m.authFail : m.loadFail;
  return <p className="notice warn" role="status" data-testid={`maps-${code ? 'error' : status}`} data-code={code ?? undefined}>{text}{code ? ` (${code})` : ''}</p>;
}

export interface MapMarker { id: string; lat: number; lng: number; title?: string; label?: string; selected?: boolean; kind?: 'property' | 'mark' | 'me' | 'pick' | 'banner'; /** Pin colour for banners (status colour). */ colour?: string }

export type MapType = 'roadmap' | 'satellite' | 'hybrid';
export const MAP_TYPES: MapType[] = ['roadmap', 'satellite', 'hybrid'];

/**
 * A Google map with markers, an optional route line and click handling. Drawn only when Google Maps is loaded.
 * Every map also has:
 *  - your live GPS position (blue dot with an accuracy circle), from `me` when the screen already tracks it
 *    (House Shopping), otherwise watched here while the map is open;
 *  - a ◎ My Location button that always recentres on the latest real position and then follows you until you move
 *    the map by hand (moving the map never removes the button);
 *  - Map / Satellite / Hybrid, remembered for next time; switching keeps the position, zoom and every marker.
 * `follow`: the screen's `center` is a live position (House Shopping) — the map follows it until you drag.
 */
export function MapView({ maps, markers, path, route, center, zoom = 15, fit, onMarkerClick, onMapClick, onMarkerDrag, height = 320, testId, me, meState, onLocate, follow = false, locate = true, compactTypes, fixedType }: {
  maps: Maps; markers: MapMarker[]; path?: { lat: number; lng: number }[]; route?: { lat: number; lng: number }[];
  center?: { lat: number; lng: number }; zoom?: number; fit?: boolean;
  onMarkerClick?: (id: string) => void; onMapClick?: (lat: number, lng: number) => void; onMarkerDrag?: (id: string, lat: number, lng: number) => void;
  height?: number; testId?: string;
  /** Change 015: smaller, shorter Map / Satellite / Hybrid buttons (the Add Location popup). */
  compactTypes?: boolean;
  /** Owner, 17 Oct 2026: always this map type, with no Map / Satellite / Hybrid buttons (the Add Location popup: Hybrid).
   *  The remembered choice for other maps is not changed. */
  fixedType?: MapType;
  me?: { lat: number; lng: number; acc?: number } | null; follow?: boolean; locate?: boolean;
  /** When the screen supplies `me`: its GPS state and how to (re)start it, so the map reports refusals correctly. */
  meState?: PositionState; onLocate?: () => void;
}) {
  const { state, store } = useApp();
  const lang = state.settings.lang ?? 'en';
  const ms = mapStrings[lang];
  const mapType: MapType = fixedType ?? state.settings.mapType ?? 'roadmap';
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const drawn = useRef<{ markers: any[]; line?: any; route?: any; me?: any; acc?: any }>({ markers: [] });
  const handlers = useRef({ onMarkerClick, onMapClick, onMarkerDrag });
  handlers.current = { onMarkerClick, onMapClick, onMarkerDrag };
  const live = useLivePosition(locate && me === undefined);
  const myPos = me === undefined ? live.pos : me;
  const posState: PositionState = me === undefined ? live.state : (meState ?? (me ? 'live' : 'locating'));
  // Following you: on for live screens until the map is dragged; the ◎ button turns it on again.
  // A map for choosing a spot (tap to select) with nothing chosen yet starts at your own position, so the agent
  // standing at the property sees it straight away; tapping or dragging the map stops following.
  const [following, setFollowing] = useState(follow || (!!onMapClick && !center && !fit));
  const followingRef = useRef(following);
  followingRef.current = following;
  const wantRecentre = useRef(false);
  const [, setPresses] = useState(0); // redraw the status line after a press

  useEffect(() => {
    if (!el.current || map.current) return;
    map.current = new maps.Map(el.current, {
      center: center ?? { lat: 2.8205, lng: 101.8036 }, zoom, mapTypeId: mapType, mapTypeControl: false, streetViewControl: false, fullscreenControl: false, clickableIcons: false, gestureHandling: 'greedy',
      // Google's round camera control would sit under the ◎ My Location button; pinch / scroll zoom is unchanged.
      cameraControl: false,
    });
    map.current.addListener?.('click', (e: any) => { const ll = e?.latLng; if (ll) { if (handlers.current.onMapClick) setFollowing(false); handlers.current.onMapClick?.(ll.lat(), ll.lng()); } });
    // Moving the map by hand stops following (the ◎ button stays and recentres again).
    map.current.addListener?.('dragstart', () => setFollowing(false));
  }, [maps]); // eslint-disable-line react-hooks/exhaustive-deps

  // Map / Satellite / Hybrid: the same map object, so position, zoom and markers stay as they are.
  useEffect(() => { map.current?.setMapTypeId?.(mapType); }, [mapType]);

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

  // Leaving the screen removes this map's pins and lines.
  useEffect(() => () => {
    for (const x of drawn.current.markers) x.setMap(null);
    drawn.current.line?.setMap(null);
    drawn.current.route?.setMap(null);
    drawn.current.me?.setMap(null);
    drawn.current.acc?.setMap(null);
    drawn.current = { markers: [] };
  }, []);

  // Your position: blue dot and accuracy circle, moved (not redrawn) as the GPS updates.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!myPos) { drawn.current.me?.setMap(null); drawn.current.acc?.setMap(null); drawn.current.me = drawn.current.acc = undefined; return; }
    const at = { lat: myPos.lat, lng: myPos.lng };
    if (!drawn.current.me) {
      drawn.current.me = new maps.Marker({ map: m, position: at, zIndex: 2000, title: ms.check.here, clickable: false,
        icon: { path: maps.SymbolPath?.CIRCLE ?? 0, scale: 8, fillColor: '#4285F4', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 } });
    } else drawn.current.me.setPosition?.(at);
    if (maps.Circle && myPos.acc) {
      if (!drawn.current.acc) drawn.current.acc = new maps.Circle({ map: m, center: at, radius: myPos.acc, clickable: false, strokeColor: '#4285F4', strokeOpacity: 0.4, strokeWeight: 1, fillColor: '#4285F4', fillOpacity: 0.12 });
      else { drawn.current.acc.setCenter?.(at); drawn.current.acc.setRadius?.(myPos.acc); }
    }
    if (wantRecentre.current || followingRef.current) {
      m.panTo?.(at);
      if (wantRecentre.current && (m.getZoom?.() ?? 16) < 15) m.setZoom?.(16);
      wantRecentre.current = false;
    }
  }, [maps, myPos?.lat, myPos?.lng, myPos?.acc, (myPos as { t?: number } | null | undefined)?.t]); // eslint-disable-line react-hooks/exhaustive-deps

  /** ◎ My Location: works every time it is pressed. Pans straight to the last position (if it is recent), asks the
   *  GPS for a fresh reading, and pans again (zooming in if needed) when that reading arrives. */
  function recentre() {
    setFollowing(true);
    wantRecentre.current = true;
    const fresh = myPos && (!('t' in myPos) || Date.now() - ((myPos as { t?: number }).t ?? 0) < 60_000);
    if (myPos && fresh) {
      map.current?.panTo?.({ lat: myPos.lat, lng: myPos.lng });
      if ((map.current?.getZoom?.() ?? 16) < 15) map.current?.setZoom?.(16);
    }
    if (me === undefined) live.refresh(); else onLocate?.();
    setPresses(n => n + 1);
  }

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
    if (follow) {
      // A live position screen: follow only while following (dragging the map stops it).
      if (center && followingRef.current) m.panTo?.(center);
      else if (!center && fit && pts.length > 1 && maps.LatLngBounds) { const b = new maps.LatLngBounds(); for (const p of pts) b.extend(p); m.fitBounds(b, 40); }
      return;
    }
    if (fit && pts.length > 1 && maps.LatLngBounds) {
      const b = new maps.LatLngBounds();
      for (const p of pts) b.extend(p);
      m.fitBounds(b, 40);
    } else if (center) {
      setFollowing(false); // a chosen place (for example another property) takes over from following you
      m.panTo?.(center);
    } else if (pts.length === 1) {
      m.panTo?.(pts[0]);
    }
  }, [maps, fit, center?.lat, center?.lng, markers.length, path?.length, route?.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const status = posState === 'denied' ? ms.meDenied : posState === 'off' ? ms.check.gpsOff : posState === 'locating' && (wantRecentre.current || following) ? ms.locatingMe : '';
  return (
    <div className="gmap-wrap" style={{ height }}>
      <div ref={el} className="gmap" style={{ height }} data-testid={testId ?? 'gmap'} />
      {!fixedType && (
        <div className={compactTypes ? 'map-types compact' : 'map-types'} role="radiogroup" aria-label={ms.mapType} data-testid="map-types">
          {MAP_TYPES.map(t => (
            <button key={t} type="button" role="radio" aria-checked={mapType === t} data-type={t}
              onClick={() => store.setSingleton('settings', { mapType: t })}>{ms.types[t]}</button>
          ))}
        </div>
      )}
      {locate && (
        <button type="button" className={`map-me ${following && myPos ? 'on' : ''}`} onClick={recentre} aria-label={ms.recentre} title={ms.recentre} data-testid="map-my-location" data-following={following ? 'yes' : 'no'}>
          <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /><circle cx="12" cy="12" r="8" /></svg>
        </button>
      )}
      {status && <span className="map-status" role="status" data-testid="map-status">{status}</span>}
    </div>
  );
}
