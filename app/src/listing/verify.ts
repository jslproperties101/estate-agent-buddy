// Per-field verification: how far one fact in a property record can be trusted. Four agreed states; a field that has not
// been marked has no entry. The states are stored on the record itself (Listing.verification), so they sync, appear in
// the history and travel with the record like any other detail.
import type { Listing } from './model';

export const VERIFY_STATES = ['confirmed', 'owner', 'check', 'unknown'] as const;
export type VerifyState = (typeof VERIFY_STATES)[number];

/** The facts an agent is expected to double-check before relying on them or sharing the listing. */
export const VERIFIABLE_FIELDS = [
  'askingPrice', 'monthlyRent', 'maintenanceFee', 'commissionPct',
  'tenure', 'leaseExpiryYear', 'titleType', 'landUse', 'restriction',
  'landSqft', 'builtUpSqft', 'bedrooms', 'bathrooms', 'floors', 'parking', 'furnishing',
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

/** Fields that still need attention: marked "Need to check" or "Unknown". */
export const toCheck = (l: Pick<Listing, 'verification'>): string[] =>
  Object.entries(l.verification ?? {}).filter(([k, v]) => isVerifiable(k) && (v === 'check' || v === 'unknown')).map(([k]) => k);

/** How many fields are in each state (only fields that are in the record's verifiable list). */
export function verifyCounts(l: Pick<Listing, 'verification'>): Record<VerifyState, number> {
  const out: Record<VerifyState, number> = { confirmed: 0, owner: 0, check: 0, unknown: 0 };
  for (const k of VERIFIABLE_FIELDS) { const v = verifyStateOf(l, k); if (v) out[v]++; }
  return out;
}
