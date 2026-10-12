// The phone's own GPS position for the map screens ("You are here" dot). Only while a map screen is open: the GPS is
// watched for live updates and switched off again when the screen closes (House Shopping has its own tracker for
// recorded routes). Never runs in the background.
// In the Android app the WebView asks for Android's location permission the first time.
import { useCallback, useEffect, useRef, useState } from 'react';

export interface MyPosition { lat: number; lng: number; acc: number; t: number }
export type PositionState = 'idle' | 'locating' | 'live' | 'denied' | 'off';

const ALLOWED_KEY = 'eab-location-allowed';
const rememberAllowed = () => { try { localStorage.setItem(ALLOWED_KEY, '1'); } catch { /* storage blocked */ } };
const allowedBefore = () => { try { return localStorage.getItem(ALLOWED_KEY) === '1'; } catch { return false; } };

/**
 * Live position while the calling screen is open. Starts by itself when location was allowed before (no surprise
 * permission prompt); otherwise `locate()` (the My Location button) starts it and asks for permission.
 */
export function useLivePosition(enabled = true): { pos: MyPosition | null; state: PositionState; locate: () => void; refresh: () => void } {
  const [pos, setPos] = useState<MyPosition | null>(null);
  const [state, setState] = useState<PositionState>('idle');
  const watch = useRef<number | null>(null);
  const lastFix = useRef(0);

  const stop = () => { if (watch.current !== null) { try { navigator.geolocation.clearWatch(watch.current); } catch { /* ignore */ } watch.current = null; } };
  const apply = useCallback((p: GeolocationPosition) => {
    rememberAllowed();
    lastFix.current = Date.now();
    setPos({ lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy), t: Date.now() });
    setState('live');
  }, []);
  const locate = useCallback(() => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) { setState('off'); return; }
    if (watch.current !== null) return; // already live: the caller recentres on the last position
    setState(s => (s === 'live' ? s : 'locating'));
    watch.current = navigator.geolocation.watchPosition(
      apply,
      // Only a refused permission ends the watch. No signal or a slow fix (codes 2 and 3) is often brief: keep
      // watching so the position comes back by itself; say "no GPS" only while there is no position at all.
      e => { if (e.code === 1) { stop(); setState('denied'); } else setState(s => (s === 'live' ? s : 'off')); },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 },
    );
  }, [apply]);
  /**
   * My Location pressed: get a brand-new GPS reading now (not a cached one), and restart the live watch when it has
   * gone quiet (Android can stop delivering updates after the screen was off or the app was in the background).
   * The new reading arrives through `pos`, which the map uses to recentre.
   */
  const refresh = useCallback(() => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) { setState('off'); return; }
    if (watch.current !== null && Date.now() - lastFix.current > 20_000) stop();
    locate();
    navigator.geolocation.getCurrentPosition(
      apply,
      e => { if (e.code === 1) { stop(); setState('denied'); } },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 3000 },
    );
  }, [apply, locate]);

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    if (allowedBefore()) locate();
    else navigator.permissions?.query({ name: 'geolocation' as PermissionName })
      .then(r => { if (live && r.state === 'granted') locate(); })
      .catch(() => { /* Permissions API not available: wait for the button */ });
    return () => { live = false; stop(); };
  }, [enabled, locate]);

  return { pos, state, locate, refresh };
}

/** One-off reading API kept for screens without a map (same behaviour, live updates included). */
export const useMyPosition = (auto = true) => useLivePosition(auto);
