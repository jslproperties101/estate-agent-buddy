// Per-field verification: how far one fact in a property record can be trusted. Four agreed states; a field that has not
// been marked has no stored entry, and is treated as "Need to check" wherever a value is shown (Change 009): nothing is
// ever shown as confirmed unless someone marked it so. The states are stored on the record itself (Listing.verification), so they sync, appear in
// the history and travel with the record like any other detail.
import type { Listing } from './model';

export const VERIFY_STATES = ['confirmed', 'owner', 'check', 'unknown'] as const;
export type VerifyState = (typeof VERIFY_STATES)[number];

/** The facts an agent is expected to double-check before relying on them or sharing the listing. */
// Change 014 (Oct 2026): Frontage, Depth and Lot Type, and the Building Specification facts (Ceiling Height, Power Supply,
// Loading Bay, Zoning, Plan Approval, Current Use / Crop) each have their own check status; Other Specification has none.
// Commission Type never had one and Commission Percentage no longer has one (its value and every calculation are unchanged;
// an old mark stored on a record is kept on the record, it is just not shown or counted).
export const VERIFIABLE_FIELDS = [
  'askingPrice', 'monthlyRent', 'maintenanceFee', 'commissionFlat', 'rentCommissionMonths', 'rentCommissionFlat',
  'tenure', 'leaseExpiryYear', 'titleType', 'landUse', 'restriction',
  'landSqft', 'builtUpSqft', 'frontageFt', 'depthFt', 'lotType', 'bedrooms', 'bathrooms', 'floors', 'parking', 'furnishing',
  'ceilingFt', 'powerKva', 'loadingBays', 'zoning', 'approvals', 'currentUse',
  'condition', 'availability', 'ownerName', 'ownerPhone',
] as const;
export type VerifiableField = (typeof VERIFIABLE_FIELDS)[number];
export const isVerifiable = (k: string): k is VerifiableField => (VERIFIABLE_FIELDS as readonly string[]).includes(k);

export const verifyStateOf = (l: Pick<Listing, 'verification'>, k: string): VerifyState | undefined => {
  const v = l.verification?.[k];
  return (VERIFY_STATES as readonly string[]).includes(v ?? '') ? v : undefined;
};

/** A copy of the record with one field's state set (undefined clears it). Other fields and values are never touched. */
export function withVerification<T extends Pick<Listing, 'verification'>>(l: T, k: string, state: VerifyState | undefined): T {
  if (!isVerifiable(k)) return l;
  const next = { ...(l.verification ?? {}) };
  if (state && (VERIFY_STATES as readonly string[]).includes(state)) next[k] = state; else delete next[k];
  return { ...l, verification: Object.keys(next).length ? next : undefined };
}

const hasValue = (l: object, k: string) => { const v = (l as Record<string, unknown>)[k]; return v !== undefined && v !== null && v !== ''; };

/** The state to show for one fact (Change 009): its mark, or "Need to check" when it has a value but no mark yet.
 *  undefined when the fact is not verifiable or has neither a value nor a mark. */
export function shownState(l: Pick<Listing, 'verification'>, k: string): VerifyState | undefined {
  if (!isVerifiable(k)) return undefined;
  return verifyStateOf(l, k) ?? (hasValue(l, k) ? 'check' : undefined);
}

/** Fields that still need attention: "Need to check" (marked, or filled in but not marked) or "Unknown". */
export const toCheck = (l: Pick<Listing, 'verification'>): string[] =>
  VERIFIABLE_FIELDS.filter(k => { const v = shownState(l, k); return v === 'check' || v === 'unknown'; });

/** How many fields are in each state (only fields that are in the record's verifiable list). */
export function verifyCounts(l: Pick<Listing, 'verification'>): Record<VerifyState, number> {
  const out: Record<VerifyState, number> = { confirmed: 0, owner: 0, check: 0, unknown: 0 };
  for (const k of VERIFIABLE_FIELDS) { const v = verifyStateOf(l, k); if (v) out[v]++; }
  return out;
}
