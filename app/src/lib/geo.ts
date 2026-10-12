// Distance and GPS helpers. Pure functions, used by House Shopping, the property map and nearby-property checks.

export interface LatLng { lat: number; lng: number }

/** Distance in metres between two points (haversine). */
export function metres(a: LatLng, b: LatLng): number {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const validLatLng = (lat: unknown, lng: unknown): boolean =>
  typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)
  && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);

/** Records with a real saved position within `radius` metres of a point, nearest first. */
export function nearby<T extends { lat?: number; lng?: number }>(point: LatLng, items: T[], radius: number): { item: T; distance: number }[] {
  return items
    .filter(i => validLatLng(i.lat, i.lng))
    .map(item => ({ item, distance: Math.round(metres(point, { lat: item.lat!, lng: item.lng! })) }))
    .filter(x => x.distance <= radius)
    .sort((a, b) => a.distance - b.distance);
}

export const kmText = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 10000 ? 2 : 1)} km`);

export function durationText(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${two(m)}:${two(sec)}` : `${two(m)}:${two(sec)}`;
}

/** Google Maps universal link: opens turn-by-turn directions in the Google Maps app (Android) or website. No key needed. */
export function navigationUrl(dest: LatLng, origin?: LatLng): string {
  const p = new URLSearchParams({ api: '1', destination: `${dest.lat},${dest.lng}`, travelmode: 'driving' });
  if (origin) p.set('origin', `${origin.lat},${origin.lng}`);
  return `https://www.google.com/maps/dir/?${p.toString()}`;
}
