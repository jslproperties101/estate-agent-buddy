// My Banner Location: rules for banner status and banner records (no screen code).
//  - Each property has a banner status: Yes (placed), Not yet, No, Owner doesn't allow, Removed.
//  - Each banner actually put up is a record with its own position, date, photo and note; taking it down keeps the
//    record (with the date removed) as history.
//  - Adding a banner position sets the status to Yes. Taking down the last banner that is still up sets it to
//    Removed. Any other status change is the agent's own choice and is never made automatically.
import type { Banner } from '../data/types';
import type { BannerStatus, Listing } from '../listing/model';

/** Colours used on cards, chips and map pins. Green Yes, gold Not yet, grey No, red Owner doesn't allow, blue Removed. */
export const BANNER_COLOURS: Record<BannerStatus | 'unset', string> = {
  yes: '#22C55E', not_yet: '#EAB308', no: '#9CA3AF', not_allowed: '#EF4444', removed: '#60A5FA', unset: '#4B5563',
};

export const bannersOf = (banners: Banner[], propertyId: string) =>
  banners.filter(b => b.propertyId === propertyId).sort((a, b) => (b.placedOn.localeCompare(a.placedOn)) || b.created - a.created);

export const activeBanners = (banners: Banner[], propertyId: string) => bannersOf(banners, propertyId).filter(b => !b.removedOn);

/** Status after a new banner position is added. */
export const statusAfterAdd = (): BannerStatus => 'yes';

/** Status after a banner is taken down: Removed when none is left up, otherwise unchanged. */
export function statusAfterRemove(current: BannerStatus | undefined, stillUp: number): BannerStatus | undefined {
  return stillUp > 0 ? current : 'removed';
}

/** How many properties have each status (properties without one count as "unset"). */
export function bannerCounts(properties: Pick<Listing, 'bannerStatus'>[]): Record<BannerStatus | 'unset', number> {
  const out: Record<BannerStatus | 'unset', number> = { yes: 0, not_yet: 0, no: 0, not_allowed: 0, removed: 0, unset: 0 };
  for (const p of properties) out[p.bannerStatus ?? 'unset']++;
  return out;
}
