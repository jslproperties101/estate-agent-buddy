// Spots a property that may already be in the list. It only warns; saving is never blocked.
import { unitLot, type Listing } from '../listing/model';

export type DuplicateReason = 'address' | 'lot';
export interface PossibleDuplicate { property: Listing; reason: DuplicateReason }

const ABBREV: Record<string, string> = { jalan: 'jln', lorong: 'lrg', persiaran: 'psn', lebuh: 'lbh', taman: 'tmn', bandar: 'bdr', kampung: 'kg' };
/** Lower case, no punctuation or spaces, common Malay road words shortened ("Jalan" = "Jln"). */
export function norm(s: string | undefined): string {
  if (!s) return '';
  return s.toLowerCase().replace(/[.,#()'"/\\-]/g, ' ').split(/\s+/).filter(Boolean).map(w => ABBREV[w] ?? w).join('');
}
const area = (l: Listing) => norm(l.township || l.city);
/** The lot number: an older separate lot field, or "Lot …" inside the one Unit/Lot Number field (Change 009). */
const lotOf = (l: Listing) => norm(l.lotNo || /\blot\s*([\w/-]+)/i.exec(l.unitNo ?? '')?.[1]);
const unitOf = (l: Listing) => norm(unitLot(l));

/** Other properties at the same address (street + unit) or the same lot in the same area. */
export function possibleDuplicates(d: Listing, others: Listing[]): PossibleDuplicate[] {
  const out: PossibleDuplicate[] = [];
  for (const o of others) {
    if (o.id === d.id) continue;
    const sameArea = !!area(d) && area(d) === area(o);
    if (norm(d.street) && unitOf(d) && norm(d.street) === norm(o.street) && unitOf(d) === unitOf(o) && (!area(d) || !area(o) || sameArea)) out.push({ property: o, reason: 'address' });
    else if (lotOf(d) && lotOf(d) === lotOf(o) && sameArea) out.push({ property: o, reason: 'lot' });
  }
  return out;
}
