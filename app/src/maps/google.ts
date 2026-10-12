// Google Maps Platform: loads the Maps JavaScript API with the configured key and wraps the parts the app uses —
// map display, markers and routes (Maps JavaScript API), reverse and forward geocoding (Geocoding API),
// place search (Places API, new), and route previews (Directions API, or the Routes API where Directions is not
// enabled). Turn-by-turn navigation opens the Google Maps app through its universal link (lib/geo.ts), which needs
// no key. Gemini is not used for any map function.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { partsFromGoogle, AddressParts, GoogleComponent } from '../domain/places';

export type Maps = any;

let loading: Promise<Maps> | null = null;
let loadedKey = '';
let authFailed = false;

export class MapsError extends Error {
  constructor(public code: 'no-key' | 'load' | 'auth' | 'timeout') { super(code); }
}

/** Loads the Maps JavaScript API once. Resolves with google.maps. */
export function loadMaps(key: string, lang: 'en' | 'bm' | 'zh' = 'en'): Promise<Maps> {
  const w = window as any;
  if (w.google?.maps?.Map) return Promise.resolve(w.google.maps);
  if (!key) return Promise.reject(new MapsError('no-key'));
  if (authFailed) return Promise.reject(new MapsError('auth'));
  if (loading && loadedKey === key) return loading;
  loadedKey = key;
  loading = new Promise<Maps>((resolve, reject) => {
    const timer = setTimeout(() => { loading = null; reject(new MapsError('timeout')); }, 20000);
    // Google calls this when the key is wrong, restricted, or billing is not enabled.
    w.gm_authFailure = () => { authFailed = true; loading = null; clearTimeout(timer); reject(new MapsError('auth')); window.dispatchEvent(new Event('eab-maps-auth-failure')); };
    w.__eabMapsReady = () => { clearTimeout(timer); resolve(w.google.maps); };
    const s = document.createElement('script');
    const language = lang === 'bm' ? 'ms' : lang === 'zh' ? 'zh-CN' : 'en';
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&libraries=places,geometry&loading=async&callback=__eabMapsReady&language=${language}&region=MY`;
    s.async = true;
    s.onerror = () => { loading = null; clearTimeout(timer); reject(new MapsError('load')); };
    document.head.appendChild(s);
  });
  return loading;
}

export const mapsAuthFailed = () => authFailed;

export interface GeocodeResult { parts: AddressParts; formatted: string; placeId?: string; lat: number; lng: number }

function fromGeocoder(r: any): GeocodeResult {
  const loc = r.geometry?.location;
  return {
    parts: partsFromGoogle((r.address_components ?? []) as GoogleComponent[]),
    formatted: r.formatted_address ?? '',
    placeId: r.place_id,
    lat: typeof loc?.lat === 'function' ? loc.lat() : loc?.lat,
    lng: typeof loc?.lng === 'function' ? loc.lng() : loc?.lng,
  };
}

/** Address of a map position (reverse geocoding). */
export async function reverseGeocode(maps: Maps, lat: number, lng: number): Promise<GeocodeResult | null> {
  const g = new maps.Geocoder();
  const res = await g.geocode({ location: { lat, lng } });
  const first = res?.results?.[0];
  return first ? { ...fromGeocoder(first), lat, lng } : null;
}

/** Position of a typed address (forward geocoding), limited to Malaysia first. */
export async function geocodeAddress(maps: Maps, address: string): Promise<GeocodeResult | null> {
  const g = new maps.Geocoder();
  const res = await g.geocode({ address, region: 'MY' });
  const first = res?.results?.[0];
  return first ? fromGeocoder(first) : null;
}

export interface Suggestion { text: string; secondary?: string; select: () => Promise<GeocodeResult | null> }

/** Place search suggestions (Places API, new). Returns [] when the Places library is not available for this key. */
export async function searchPlaces(maps: Maps, input: string, near?: { lat: number; lng: number }): Promise<Suggestion[]> {
  if (!input.trim()) return [];
  let places: any;
  try { places = await maps.importLibrary('places'); } catch { return []; }
  const AS = places?.AutocompleteSuggestion;
  if (!AS?.fetchAutocompleteSuggestions) return [];
  const req: any = { input, includedRegionCodes: ['my'] };
  if (near) req.locationBias = { center: near, radius: 30000 };
  const { suggestions } = await AS.fetchAutocompleteSuggestions(req);
  return (suggestions ?? []).filter((s: any) => s.placePrediction).slice(0, 6).map((s: any) => {
    const p = s.placePrediction;
    return {
      text: p.mainText?.text ?? p.text?.text ?? '',
      secondary: p.secondaryText?.text,
      select: async () => {
        const place = p.toPlace();
        await place.fetchFields({ fields: ['addressComponents', 'location', 'formattedAddress', 'id'] });
        const comps: GoogleComponent[] = (place.addressComponents ?? []).map((c: any) => ({ long_name: c.longText, short_name: c.shortText, types: c.types }));
        const loc = place.location;
        if (!loc) return null;
        return { parts: partsFromGoogle(comps), formatted: place.formattedAddress ?? '', placeId: place.id, lat: loc.lat(), lng: loc.lng() };
      },
    };
  });
}

export interface RoutePreview { path: { lat: number; lng: number }[]; distanceM?: number; durationS?: number }

/** Driving route between two points, for showing on the map before navigating. */
export async function routePreview(maps: Maps, from: { lat: number; lng: number }, to: { lat: number; lng: number }): Promise<RoutePreview | null> {
  try {
    const svc = new maps.DirectionsService();
    const res = await svc.route({ origin: from, destination: to, travelMode: maps.TravelMode?.DRIVING ?? 'DRIVING' });
    const route = res?.routes?.[0];
    if (route) {
      const leg = route.legs?.[0];
      return {
        path: (route.overview_path ?? []).map((p: any) => ({ lat: p.lat(), lng: p.lng() })),
        distanceM: leg?.distance?.value, durationS: leg?.duration?.value,
      };
    }
  } catch { /* Directions API not enabled for this key: try the Routes API */ }
  try {
    const { Route } = await maps.importLibrary('routes');
    if (!Route?.computeRoutes) return null;
    const { routes } = await Route.computeRoutes({ origin: from, destination: to, travelMode: 'DRIVING', fields: ['path', 'distanceMeters', 'durationMillis'] });
    const r = routes?.[0];
    if (!r) return null;
    return { path: (r.path ?? []).map((p: any) => ({ lat: typeof p.lat === 'function' ? p.lat() : p.lat, lng: typeof p.lng === 'function' ? p.lng() : p.lng })), distanceM: r.distanceMeters, durationS: r.durationMillis ? r.durationMillis / 1000 : undefined };
  } catch { return null; }
}
