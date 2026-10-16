// ClaudeChanges001 (owner, 17 Oct 2026): rules for the property form that do not depend on the screen.
//  - Change 10: Status merged into Availability. The record keeps its two stored fields (status and availability), so
//    filters, cards, matching, exports and sync are unchanged; the form shows one list and writes both.
//  - Change 5: location options belong to the level above. A typed City is saved under its State, a Township under its
//    City, and so on down to Street. A blank level is skipped, so its options link to the next level up.
import type { Listing, Status, Availability } from './model';

/** The one Availability list (Change 10), in the agreed order. */
export const AVAIL_CHOICES = ['available_now', 'available_from', 'booked', 'sold', 'rented', 'withdrawn'] as const;
export type AvailChoice = (typeof AVAIL_CHOICES)[number];

/** Which choice a record shows. The status decides first (a sold property is Sold whatever its old availability said);
 *  older records without a status show their availability. */
export function availChoice(l: Pick<Listing, 'status' | 'availability'>): AvailChoice | undefined {
  switch (l.status) {
    case 'in_progress': return 'booked';
    case 'sold': return 'sold';
    case 'rented': return 'rented';
    case 'off_market': return 'withdrawn';
  }
  if (l.availability === 'from_date') return 'available_from';
  if (l.availability === 'immediate') return 'available_now';
  if (l.status === 'available') return 'available_now';
  if (!l.status && l.availability === 'tenanted') return 'rented';
  return undefined;
}

/** The two stored fields for a choice. "Available From" keeps the chosen month; every other choice clears it. */
export function availPatch(choice: AvailChoice | undefined, keepFrom?: string): { status?: Status; availability?: Availability; availableFrom?: string } {
  switch (choice) {
    case 'available_now': return { status: 'available', availability: 'immediate', availableFrom: undefined };
    case 'available_from': return { status: 'available', availability: 'from_date', availableFrom: keepFrom };
    case 'booked': return { status: 'in_progress', availability: 'not_available', availableFrom: undefined };
    case 'sold': return { status: 'sold', availability: 'not_available', availableFrom: undefined };
    case 'rented': return { status: 'rented', availability: 'tenanted', availableFrom: undefined };
    case 'withdrawn': return { status: 'off_market', availability: 'not_available', availableFrom: undefined };
    default: return { status: undefined, availability: undefined, availableFrom: undefined };
  }
}

/** Arrangement (Change 10): Co-broke or Direct only. An older Referral / Other shows as not set until it is chosen again. */
export const ARRANGEMENT_CHOICES = ['cobroke', 'direct'] as const;

// ---------- Change 5: the location chain ----------
export const LOCATION_LEVELS = ['country', 'state', 'city', 'township', 'neighborhood', 'street'] as const;
export type LocationLevel = (typeof LOCATION_LEVELS)[number];

/** The filled levels above one level, from the top (blank levels are skipped). */
export function parentPath(l: Partial<Pick<Listing, LocationLevel>>, level: LocationLevel): string[] {
  const i = LOCATION_LEVELS.indexOf(level);
  return LOCATION_LEVELS.slice(0, i).map(k => (l[k] ?? '').trim()).filter(Boolean);
}

/** The remembered-options list for one level under its parents, for example "township@Malaysia/Negeri Sembilan/Nilai".
 *  Country is the top and has one list. The same name under two different parents is two different entries. */
export function locationListKey(l: Partial<Pick<Listing, LocationLevel>>, level: LocationLevel): string {
  if (level === 'country') return 'country';
  return `${level}@${parentPath(l, level).join('/')}`;
}

/** Changing one level clears every level below it (owner): a Neighbourhood can never stay under the wrong Township.
 *  Unit/Lot Number is typed for the property and stays. */
export function clearBelow(level: LocationLevel): Partial<Record<LocationLevel, undefined>> {
  const i = LOCATION_LEVELS.indexOf(level);
  const out: Partial<Record<LocationLevel, undefined>> = {};
  for (const k of LOCATION_LEVELS.slice(i + 1)) out[k] = undefined;
  return out;
}
