// Change 015 (owner, 16 Oct 2026): rules behind the Subsale List card, the photo menu and the check / not-filled counts.
// Screen-free, so each rule is unit-tested on its own.
import { Listing, Photo, missingDetails, sqft } from './model';
import { toCheck } from './verify';

/** The location fields, in the order shown on the form and on the property page:
 *  Country → State → City → Township → Neighborhood → Street → Unit Number or Lot Number. */
export const LOCATION_ORDER = ['country', 'state', 'city', 'township', 'neighborhood', 'street', 'unitNo'] as const;

/** The transaction labels under the gear, from the property's own purpose only (nothing is assumed when it is not set).
 *  Both: FOR SALE above FOR RENT, as two separate labels. */
export function transactionLabels(l: Pick<Listing, 'purpose'>): ('sale' | 'rent')[] {
  if (l.purpose === 'sale') return ['sale'];
  if (l.purpose === 'rent') return ['rent'];
  if (l.purpose === 'sale_or_rent') return ['sale', 'rent'];
  return [];
}

export interface SpecWords {
  type?: string; lotType?: string;
  storeys: (n: number) => string; bedrooms: (n: number) => string; bathrooms: (n: number) => string;
  land: (x: string) => string; builtUp: (x: string) => string;
}

/** Keeps a number and its unit together on a narrow card ("1,650 sq ft" never breaks before "sq" or "ft"). */
const keep = (x: string) => x.replace(/ /g, '\u00a0');
/** Land area in the card's usual units (acres from one acre up, otherwise square feet). */
export const cardLand = (n: number) => keep(n >= 43560 ? `${(n / 43560).toFixed(1)} acres` : sqft(n));

/** The card's specification lines, in the agreed order; only real values, empty lines left out.
 *  Owner, 17 Oct 2026 (supersedes Change 015's four lines): 1 type, storeys, lot designation ("Terrace House   2.5 Storeys
 *  Corner", spaced, no commas); 2 bedrooms and bathrooms; 3 land and built-up on one line, spaced, no comma. The card puts
 *  the tenure line between lines 1 and 2. `spaced` lines are shown with a wider gap instead of a comma.
 *  Each part carries its field key so the screen can keep the Change 009 check colour on the value. */
export function specLines(l: Listing, w: SpecWords): { key: string; spaced: boolean; parts: { k: string; text: string }[] }[] {
  const line1: { k: string; text: string }[] = [];
  if (w.type) line1.push({ k: 'type', text: w.type });
  if (l.floors !== undefined) line1.push({ k: 'floors', text: w.storeys(l.floors) });
  if (l.lotType && w.lotType) line1.push({ k: 'lotType', text: w.lotType });
  const line2: { k: string; text: string }[] = [];
  if (l.bedrooms !== undefined) line2.push({ k: 'bedrooms', text: w.bedrooms(l.bedrooms) });
  if (l.bathrooms !== undefined) line2.push({ k: 'bathrooms', text: w.bathrooms(l.bathrooms) });
  const line3: { k: string; text: string }[] = [];
  if (l.landSqft !== undefined) line3.push({ k: 'landSqft', text: w.land(cardLand(l.landSqft)) });
  if (l.builtUpSqft !== undefined) line3.push({ k: 'builtUpSqft', text: w.builtUp(keep(sqft(l.builtUpSqft))) });
  const out = [
    { key: 'type', spaced: true, parts: line1 },
    { key: 'rooms', spaced: false, parts: line2 },
    { key: 'area', spaced: true, parts: line3 },
  ];
  return out.filter(x => x.parts.length > 0);
}

/** Owner, 17 Oct 2026: the Google Maps link for a property's saved map point (opens the Maps app on Android). */
export const mapsUrl = (p: { lat: number; lng: number }) => `https://www.google.com/maps/search/?api=1&query=${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;

/** Owner, 17 Oct 2026: the WhatsApp message that shares a property's location with one contact. */
export function shareLocationLink(phoneDigits: string, title: string, p: { lat: number; lng: number }): string {
  const text = `${title ? `${title}\n` : ''}${mapsUrl(p)}`;
  return `https://wa.me/${phoneDigits}?text=${encodeURIComponent(text)}`;
}

/** A "not filled" key and the "to check" fields it covers, so one empty detail is never counted twice
 *  (for example the owner field: missing "vendorId" and an Unknown mark on "ownerName"). */
const COVERS: Record<string, string[]> = { vendorId: ['ownerName', 'ownerPhone'], township: [], lat: [] };

/** The fields still to check and the fields not filled, each field in one list only: an empty field counts as
 *  "not filled", never also as "to check". Uses the established rules unchanged (Change 009 verification,
 *  missingDetails). */
export function checkAndMissing(l: Listing): { check: string[]; missing: string[] } {
  const missing = missingDetails(l).map(String);
  const covered = new Set(missing.flatMap(k => [k, ...(COVERS[k] ?? [])]));
  const check = toCheck(l).filter(k => !covered.has(k));
  return { check, missing };
}

/** The two numbers on a card. */
export function cardCounts(l: Listing): { toCheck: number; notFilled: number } {
  const { check, missing } = checkAndMissing(l);
  return { toCheck: check.length, notFilled: missing.length };
}

/** Make as Main Photo: the chosen photo moves to position 1 and becomes the one main photo; the others keep their order.
 *  An unknown id changes nothing. */
export function makeMainPhoto(photos: Photo[], id: string): { photos: Photo[]; mainPhotoId?: string } {
  const i = photos.findIndex(p => p.id === id);
  if (i < 0) return { photos, mainPhotoId: photos[0]?.id };
  const next = i === 0 ? photos : [photos[i], ...photos.slice(0, i), ...photos.slice(i + 1)];
  return { photos: next, mainPhotoId: next[0]?.id };
}

/** Remove: only the chosen photo leaves the list. When it was the main photo, the first remaining photo becomes the main
 *  photo (the app's existing rule: the first photo is the main photo); with none left there is no main photo. */
export function removePhoto(photos: Photo[], id: string): { photos: Photo[]; mainPhotoId?: string; removed?: Photo } {
  const removed = photos.find(p => p.id === id);
  if (!removed) return { photos, mainPhotoId: photos[0]?.id };
  const next = photos.filter(p => p.id !== id);
  return { photos: next, mainPhotoId: next[0]?.id, removed };
}
