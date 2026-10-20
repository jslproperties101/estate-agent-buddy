// House Shopping journeys: records the route actually travelled, like a jogging tracker.
// GPS readings are filtered before they count: poor fixes, tiny jitter while standing still, and impossible jumps
// are ignored, so the distance is not inflated.
import type { Journey, TrackPoint } from '../data/types';
import { metres } from '../lib/geo';

export const MAX_ACCURACY_M = 50;
/** JoyChange007: a move shorter than about 10 m (stopped, in traffic, marking a property) is not a new point. */
export const MIN_STEP_M = 10;
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

// ---------- JoyChange007: fewer Google requests ----------
/** Keep about one point every THIN_SPACING_M metres, plus every turn, for road snapping (Google charges per request). */
export const THIN_SPACING_M = 45;
export const TURN_DEG = 30;
/** Google's Roads API takes up to 100 points per request; batches overlap so the snapped pieces join up. */
export const SNAP_BATCH = 100;
export const SNAP_OVERLAP = 3;
/** About US$10 per 1,000 Roads requests (20 Oct 2026 price; verify in Google's calculator). In micro-dollars. */
export const SNAP_COST_MICRO_USD = 10_000;

const bearing = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const r = Math.PI / 180;
  const y = Math.sin((b.lng - a.lng) * r) * Math.cos(b.lat * r);
  const x = Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lng - a.lng) * r);
  return (Math.atan2(y, x) * 180) / Math.PI;
};
const turn = (b1: number, b2: number) => { const d = Math.abs(b1 - b2) % 360; return d > 180 ? 360 - d : d; };

/** The route thinned for snapping: the first point, then a point every ~45 m or where the road turns, and the last point.
 *  The full list of points is kept on the journey (distance is measured from it). */
export function thinPoints<T extends { lat: number; lng: number }>(points: T[], spacing = THIN_SPACING_M, turnDeg = TURN_DEG): T[] {
  if (points.length <= 2) return [...points];
  const out: T[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const last = out[out.length - 1];
    if (metres(last, points[i]) >= spacing) { out.push(points[i]); continue; }
    // A corner: the road from the last kept point to the previous reading turns sharply at that reading.
    const corner = points[i - 1];
    if (corner !== last && metres(last, corner) >= MIN_STEP_M && turn(bearing(last, corner), bearing(corner, points[i])) >= turnDeg) out.push(corner);
  }
  out.push(points[points.length - 1]);
  return out;
}

/** The next batch of thinned points to snap, or null when there is not a full batch yet (`final`: send what is left). */
export function nextSnapBatch<T>(thinned: T[], done: number, final = false): { from: number; points: T[] } | null {
  const from = Math.max(0, done - SNAP_OVERLAP);
  const left = thinned.length - done;
  if (left <= 0) return null;
  if (!final && thinned.length - from < SNAP_BATCH) return null;
  const points = thinned.slice(from, from + SNAP_BATCH);
  if (points.length < 2) return null;
  return { from, points };
}

/** Adds one snapped batch to the road line. Points Google returns for the overlap (already on the line) are dropped. */
export function mergeSnapped(prev: { lat: number; lng: number }[], batch: { lat: number; lng: number; originalIndex?: number }[], overlap: number): { lat: number; lng: number }[] {
  if (!prev.length || overlap <= 0) return [...prev, ...batch.map(({ lat, lng }) => ({ lat, lng }))];
  // Keep from the last overlap point onwards (interpolated points carry no index and follow the indexed point before them).
  let keepFrom = batch.findIndex(p => p.originalIndex !== undefined && p.originalIndex >= overlap - 1);
  if (keepFrom < 0) keepFrom = 0;
  return [...prev, ...batch.slice(keepFrom + 1).map(({ lat, lng }) => ({ lat, lng }))];
}

/** JoyChange008 / 007: the area name for a journey card without asking Google: the neighbourhood (else township, else town)
 *  of the nearest saved property within `maxM` of the route's middle. */
export function areaFromProperties(points: { lat: number; lng: number }[], props: { lat?: number; lng?: number; neighborhood?: string; township?: string; city?: string }[], maxM = 1500): string | undefined {
  if (!points.length) return undefined;
  const mid = points[Math.floor(points.length / 2)];
  let best: { d: number; name: string } | undefined;
  for (const p of props) {
    if (p.lat === undefined || p.lng === undefined) continue;
    const name = (p.neighborhood || p.township || p.city || '').trim();
    if (!name) continue;
    const d = metres(mid, { lat: p.lat, lng: p.lng });
    if (d <= maxM && (!best || d < best.d)) best = { d, name };
  }
  return best?.name;
}

/** "Continue this journey" (JoyChange007, Joe 21 Oct 2026): the same card records again; the break is not counted. */
export function continued(j: Journey, now: number): Journey {
  const gap = j.endedAt ? Math.max(0, now - j.endedAt) : 0;
  return { ...j, status: 'recording', endedAt: undefined, pausedMs: (j.pausedMs ?? 0) + gap, updated: now };
}

/** The line drawn on the map: the road-snapped part, then the plain GPS points not yet snapped (drawn at once). */
export function displayPath(j: Pick<Journey, 'points' | 'snapped' | 'snapDone'>): { lat: number; lng: number }[] {
  if (!j.snapped?.length || !j.snapDone) return j.points;
  const thinned = thinPoints(j.points);
  const lastSent = thinned[Math.min(j.snapDone, thinned.length) - 1];
  const i = lastSent ? j.points.indexOf(lastSent) : -1;
  return [...j.snapped, ...(i >= 0 ? j.points.slice(i + 1) : [])];
}
