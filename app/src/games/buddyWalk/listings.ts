// v1buddychange014: which listings hang in the Buddy Walk gallery, and the key facts shown on the gold card.
// The same listings as the Subsale List shows by default: my own and those shared with me, without deleted (archived)
// ones and without Sold, Rented and Withdrawn, in the same order.
import type { AppState } from '../../data/types';
import { visible } from '../../team/access';
import { HIDDEN_BY_DEFAULT, cardTitle, forRent, forSale, landText, rm, sqft, statusKey, type Listing, type Photo, orderedPhotos, type StatusKey } from '../../listing/model';
import { listingStrings, typeLabel } from '../../listing/strings';
import type { Lang } from '../../i18n';

export function walkListings(state: AppState): Listing[] {
  return visible(state, 'properties', state.properties)
    .filter(l => !l.archived && !HIDDEN_BY_DEFAULT.includes(statusKey(l) as StatusKey));
}

/** The listing's main photo, if it has a real one (built-in type pictures are not used: the frame draws a pixel house). */
export const framePhoto = (l: Listing): Photo | undefined => orderedPhotos(l)[0];

export interface Facts { title: string; type?: string; rows: { k: string; label: string; value: string }[]; prices: string[]; sample: boolean }
export function listingFacts(l: Listing, lang: Lang): Facts {
  const s = listingStrings[lang];
  const rows: Facts['rows'] = [];
  if (l.bedrooms !== undefined) rows.push({ k: 'beds', label: s.kf.bedrooms, value: String(l.bedrooms) });
  if (l.bathrooms !== undefined) rows.push({ k: 'baths', label: s.kf.bathrooms, value: String(l.bathrooms) });
  if (l.landSqft !== undefined) rows.push({ k: 'land', label: s.kf.landSqft, value: landText(l.landSqft) });
  if (l.builtUpSqft !== undefined) rows.push({ k: 'builtUp', label: s.kf.builtUpSqft, value: sqft(l.builtUpSqft) });
  const prices: string[] = [];
  if (forSale(l) && l.askingPrice !== undefined) prices.push(rm(l.askingPrice));
  if (forRent(l) && l.monthlyRent !== undefined) prices.push(`${rm(l.monthlyRent)} ${s.perMonth}`);
  if (!prices.length) prices.push(s.noPrice);
  return { title: cardTitle(l) || s.untitled, type: typeLabel(s, l.type) || undefined, rows, prices, sample: Boolean(l.sample) };
}
