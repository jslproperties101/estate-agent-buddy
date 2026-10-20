// JoyChange007: Google Roads API "Snap to Roads" for House Shopping. Sends up to 100 thinned points per request with
// interpolate=true, so the line follows the full road shape between the points (verified in Google's documentation,
// 21 Oct 2026). Google charges per request, so the tracker sends a request only once a full batch is ready and once more
// at Stop. Every request is written to the usage log (Change 19: no coordinates are ever logged).
import { usage } from '../usage/logger';
import { SNAP_COST_MICRO_USD } from '../domain/journey';

export interface SnappedPoint { lat: number; lng: number; originalIndex?: number }

export async function snapToRoads(key: string, points: { lat: number; lng: number }[], fetcher: typeof fetch = fetch): Promise<SnappedPoint[]> {
  const path = points.map(p => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`).join('|');
  const url = `https://roads.googleapis.com/v1/snapToRoads?interpolate=true&path=${encodeURIComponent(path)}&key=${encodeURIComponent(key)}`;
  let ok = false;
  try {
    const r = await fetcher(url);
    if (!r.ok) throw new Error(`roads ${r.status}`);
    const body = await r.json() as { snappedPoints?: { location: { latitude: number; longitude: number }; originalIndex?: number }[] };
    ok = true;
    return (body.snappedPoints ?? []).map(s => ({ lat: s.location.latitude, lng: s.location.longitude, originalIndex: s.originalIndex }));
  } finally {
    usage.google('roads.snap', ok, 'house-shopping', points.length, SNAP_COST_MICRO_USD);
  }
}
