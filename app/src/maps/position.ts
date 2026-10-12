// The phone's own GPS position for the map screens ("You are here" pin). One reading at a time, only while a map
// screen is open, never tracked in the background (House Shopping has its own tracker for routes).
// In the Android app the WebView asks for Android's location permission the first time.
import { useCallback, useEffect, useState } from 'react';

export interface MyPosition { lat: number; lng: number; acc: number }
export type PositionState = 'idle' | 'locating' | 'denied' | 'off';

export function useMyPosition(auto = true): { pos: MyPosition | null; state: PositionState; locate: () => void } {
  const [pos, setPos] = useState<MyPosition | null>(null);
  const [state, setState] = useState<PositionState>('idle');
  const locate = useCallback(() => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) { setState('off'); return; }
    setState('locating');
    navigator.geolocation.getCurrentPosition(
      p => { setPos({ lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy) }); setState('idle'); },
      e => setState(e.code === 1 ? 'denied' : 'off'),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  }, []);
  // Show the position straight away when location was already allowed; otherwise wait for the button (no surprise prompt).
  useEffect(() => {
    if (!auto) return;
    let live = true;
    navigator.permissions?.query({ name: 'geolocation' as PermissionName })
      .then(r => { if (live && r.state === 'granted') locate(); })
      .catch(() => { /* Permissions API not available */ });
    return () => { live = false; };
  }, [auto, locate]);
  return { pos, state, locate };
}
