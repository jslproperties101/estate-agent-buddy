// House Shopping journeys: records the route actually travelled, like a jogging tracker.
// GPS readings are filtered before they count: poor fixes, tiny jitter while standing still, and impossible jumps
// are ignored, so the distance is not inflated.
import type { Journey, TrackPoint } from '../data/types';
import { metres } from '../lib/geo';

export const MAX_ACCURACY_M = 50;
export const MIN_STEP_M = 8;
export const MAX_SPEED_MS = 70; // about 250 km/h

export type PointResult = 'added' | 'poor' | 'jitter' | 'jump';

/** Adds a GPS reading to a journey if it is good enough. Returns the updated journey and what happened. */
export function addPoint(j: Journey, p: TrackPoint): { journey: Journey; result: PointResult } {
  if (!(p.acc <= MAX_ACCURACY_M)) return { journey: j, result: 'poor' };
  const last = j.points[j.points.length - 1];
  if (!last) return { journey: { ...j, points: [p] }, result: 'added' };
  const d = metres(last, p);
  if (d < Math.max(MIN_STEP_M, Math.min(p.acc, last.acc) / 2)) return { journey: j, result: 'jitter' };
  const dt = (p.t - last.t) / 1000;
  if (dt > 0 && d / dt > MAX_SPEED_MS) return { journey: j, result: 'jump' };
  return { journey: { ...j, points: [...j.points, p], distanceM: j.distanceM + d }, result: 'added' };
}

/** Time travelling, without the time spent paused. */
export function elapsedMs(j: Journey, now: number): number {
  const end = j.status === 'saved' ? j.endedAt ?? now : now;
  return Math.max(0, end - j.startedAt - (j.pausedMs ?? 0));
}

export function newJourney(id: string, now: number): Journey {
  return { id, created: now, updated: now, startedAt: now, pausedMs: 0, points: [], distanceM: 0, places: [], marks: [], status: 'recording' };
}

/** Adds a named place the route passed through, once per name. */
export function addPlace(j: Journey, name: string, lat: number, lng: number, at: number): Journey {
  const n = name.trim();
  if (!n || j.places.some(p => p.name.toLowerCase() === n.toLowerCase())) return j;
  return { ...j, places: [...j.places, { name: n, lat, lng, at }] };
}

/** Bounding box of the route and marks, for drawing it without a map. */
export function bounds(points: { lat: number; lng: number }[]) {
  if (!points.length) return null;
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const p of points) { minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat); minLng = Math.min(minLng, p.lng); maxLng = Math.max(maxLng, p.lng); }
  return { minLat, maxLat, minLng, maxLng };
}
