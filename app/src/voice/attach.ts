// Where a voice note belongs (Version 1J proposal). Attach automatically only when it is reliable:
// a GPS fix of 30 m or better and exactly one known property within 50 m. Otherwise the person chooses.
export interface Place { id: string; name: string; lat: number; lon: number }
export interface Fix { lat: number; lon: number; accuracy: number }

export type Attach =
  | { kind: 'property'; place: Place; distance: number }
  | { kind: 'ask'; reason: 'no-fix' | 'poor-fix' | 'none-near' | 'several-near'; near: { place: Place; distance: number }[] };

export const MAX_ACCURACY_M = 30;
export const NEAR_M = 50;

/** Distance in metres between two points (haversine). */
export function metres(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function decideAttachment(fix: Fix | null, places: Place[]): Attach {
  if (!fix) return { kind: 'ask', reason: 'no-fix', near: [] };
  const near = places.map(place => ({ place, distance: Math.round(metres(fix, place)) }))
    .filter(x => x.distance <= NEAR_M).sort((a, b) => a.distance - b.distance);
  if (fix.accuracy > MAX_ACCURACY_M) return { kind: 'ask', reason: 'poor-fix', near };
  if (near.length === 0) return { kind: 'ask', reason: 'none-near', near };
  if (near.length > 1) return { kind: 'ask', reason: 'several-near', near };
  return { kind: 'property', place: near[0].place, distance: near[0].distance };
}
