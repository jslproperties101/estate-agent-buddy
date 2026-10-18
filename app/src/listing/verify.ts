// Per-field verification: how far one fact in a property record can be trusted. Four agreed states; a field that has not
// been marked has no stored entry, and is treated as "Need to check" wherever a value is shown (Change 009): nothing is
// ever shown as confirmed unless someone marked it so. The states are stored on the record itself (Listing.verification), so they sync, appear in
// the history and travel with the record like any other detail.
import type { Listing } from './model';

// JoyChange002 Change 35: three states, each with its own colour: Confirmed (green), Owner stated (orange), Need to check
// (red). "Unknown" is gone (it meant much the same as Need to check); an old "unknown" mark stored on a record is read as
// Need to check, and is rewritten as such the next time the record is saved.
export const VERIFY_STATES = ['confirmed', 'owner', 'check'] as const;
export type VerifyState = (typeof VERIFY_STATES)[number];
/** A stored mark as one of the three states ("unknown" from before Change 35 reads as "check"). */
const normalise = (v: string | undefined): VerifyState | undefined => (v === 'unknown' ? 'check' : (VERIFY_STATES as readonly string[]).includes(v ?? '') ? v as VerifyState : undefined);

/** The facts an agent is expected to double-check before relying on them or sharing the listing. */
// Change 014 (Oct 2026): Frontage, Depth and Lot Type, and the Building Specification facts (Ceiling Height, Power Supply,
// Loading Bay, Zoning, Plan Approval, Current Use / Crop) each have their own check status; Other Specification has none.
// Commission Type never had one and Commission Percentage no longer has one (its value and every calculation are unchanged;
// an old mark stored on a record is kept on the record, it is just not shown or counted).
// Owner, 17 Oct 2026: Asking Price and Monthly Rent have no check status any more (no picker on the form, not counted
// as "to check"); their values and every calculation are unchanged, and an old mark stays on the record, unshown.
// ClaudeChanges001 (owner, 17 Oct 2026): Commission (RM) and Availability have no check status any more (changes 3 and 8);
// their stored marks are removed when the property is saved (ListingForm).
export const VERIFIABLE_FIELDS = [
  'maintenanceFee', 'rentCommissionMonths', 'rentCommissionFlat',
  'tenure', 'leaseExpiryYear', 'titleType', 'landUse', 'restriction',
  'landSqft', 'builtUpSqft', 'frontageFt', 'depthFt', 'lotType', 'bedrooms', 'bathrooms', 'floors', 'parking', 'furnishing',
  'ceilingFt', 'powerKva', 'loadingBays', 'zoning', 'approvals', 'currentUse',
  'condition', 'ownerName', 'ownerPhone',
] as const;
export type VerifiableField = (typeof VERIFIABLE_FIELDS)[number];
export const isVerifiable = (k: string): k is VerifiableField => (VERIFIABLE_FIELDS as readonly string[]).includes(k);

export const verifyStateOf = (l: Pick<Listing, 'verification'>, k: string): VerifyState | undefined => {
  return normalise(l.verification?.[k]);
};

/** A copy of the record with one field's state set (undefined clears it). Other fields and values are never touched. */
export function withVerification<T extends Pick<Listing, 'verification'>>(l: T, k: string, state: VerifyState | 'unknown' | undefined): T {
  if (!isVerifiable(k)) return l;
  const next: NonNullable<Listing['verification']> = {};
  for (const [f, v] of Object.entries(l.verification ?? {})) { const n = normalise(v); if (n) next[f] = n; }   // old "unknown" marks become "check"
  const st = normalise(state);
  if (st) next[k] = st; else delete next[k];
  return { ...l, verification: Object.keys(next).length ? next : undefined };
}

const hasValue = (l: object, k: string) => { const v = (l as Record<string, unknown>)[k]; return v !== undefined && v !== null && v !== ''; };

/** The state to show for one fact (Change 009): its mark, or "Need to check" when it has a value but no mark yet.
 *  undefined when the fact is not verifiable or has neither a value nor a mark. */
export function shownState(l: Pick<Listing, 'verification'>, k: string): VerifyState | undefined {
  if (!isVerifiable(k)) return undefined;
  return verifyStateOf(l, k) ?? (hasValue(l, k) ? 'check' : undefined);
}

/** Fields that still need attention: "Need to check" (marked, or filled in but not marked). */
export const toCheck = (l: Pick<Listing, 'verification'>): string[] =>
  VERIFIABLE_FIELDS.filter(k => shownState(l, k) === 'check');

/** How many fields are in each state (only fields that are in the record's verifiable list). */
export function verifyCounts(l: Pick<Listing, 'verification'>): Record<VerifyState, number> {
  const out: Record<VerifyState, number> = { confirmed: 0, owner: 0, check: 0 };
  for (const k of VERIFIABLE_FIELDS) { const v = verifyStateOf(l, k); if (v) out[v]++; }
  return out;
}
