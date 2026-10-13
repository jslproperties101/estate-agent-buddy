// Buyer ↔ property matching. A requirement is a list of conditions the buyer cares about; each condition is judged
// against the property as "fits", "does not fit" or "not known" (the property record has no value). Nothing unknown is
// ever counted as a fit:
//   exact    every condition the buyer set is met from recorded facts
//   partial  nothing contradicts it, but at least one condition cannot be checked from the record
//   near     exactly one condition fails and at least two are met (shown so the agent can decide, clearly marked)
// Properties that are sold, rented or off the market are never offered. "Adjoining units" can never be confirmed from a
// single record, so a requirement that needs them reaches at most "partial".
import type { BuyerRequirement, Contact } from '../data/types';
import { BUYER_ROLES } from '../data/types';
import type { Listing } from '../listing/model';

export type Verdict = 'fits' | 'fails' | 'unknown';
export type CriterionKey = 'purpose' | 'type' | 'area' | 'budget' | 'bedrooms' | 'land' | 'builtUp' | 'tenure' | 'adjoining' | 'availability';
export interface Criterion { key: CriterionKey; verdict: Verdict; /** what the property has, for the explanation */ has?: string | number; /** what the buyer wants */ wants?: string | number }
export type Level = 'exact' | 'partial' | 'near' | 'none';
export interface MatchResult { level: Level; criteria: Criterion[]; score: number }

const RANK: Record<Level, number> = { exact: 0, partial: 1, near: 2, none: 3 };
const low = (s?: string) => (s ?? '').toLowerCase().trim();

export const isEmptyRequirement = (r: BuyerRequirement) =>
  !r.purpose && !r.types?.length && !r.areas?.length && r.budgetMin === undefined && r.budgetMax === undefined &&
  r.bedroomsMin === undefined && r.landMinSqft === undefined && r.builtUpMinSqft === undefined && !r.tenure && !r.adjoiningUnits;

/** Sold, rented and withdrawn properties are not offered to anyone. */
export const offerable = (p: Listing) => !['sold', 'rented', 'off_market'].includes(p.status ?? '');

export function matchRequirement(r: BuyerRequirement, p: Listing): MatchResult {
  const out: Criterion[] = [];
  const add = (key: CriterionKey, verdict: Verdict, has?: string | number, wants?: string | number) => out.push({ key, verdict, has, wants });

  if (r.purpose && r.purpose !== 'sale_or_rent') {
    if (!p.purpose) add('purpose', 'unknown', undefined, r.purpose);
    else if (p.purpose === 'sale_or_rent' || p.purpose === r.purpose) add('purpose', 'fits', p.purpose, r.purpose);
    else add('purpose', 'fails', p.purpose, r.purpose);
  }
  if (r.types?.length) {
    if (!p.type) add('type', 'unknown', undefined, r.types.join(', '));
    else add('type', r.types.includes(p.type) ? 'fits' : 'fails', p.type, r.types.join(', '));
  }
  if (r.areas?.length) {
    const here = [p.township, p.city, p.state].map(low).filter(Boolean);
    if (!here.length) add('area', 'unknown', undefined, r.areas.join(', '));
    else add('area', r.areas.some(a => here.some(h => h.includes(low(a)) || low(a).includes(h))) ? 'fits' : 'fails', [p.township, p.city].filter(Boolean).join(', '), r.areas.join(', '));
  }
  if (r.budgetMin !== undefined || r.budgetMax !== undefined) {
    const renting = r.purpose === 'rent' || (r.purpose !== 'sale' && p.purpose === 'rent');
    const price = renting ? p.monthlyRent : p.askingPrice;
    const wants = [r.budgetMin, r.budgetMax].map(v => (v === undefined ? '' : String(v))).join(' – ');
    if (price === undefined) add('budget', 'unknown', undefined, wants);
    else add('budget', (r.budgetMax === undefined || price <= r.budgetMax) && (r.budgetMin === undefined || price >= r.budgetMin) ? 'fits' : 'fails', price, wants);
  }
  if (r.bedroomsMin !== undefined) {
    if (p.bedrooms === undefined) add('bedrooms', 'unknown', undefined, r.bedroomsMin);
    else add('bedrooms', p.bedrooms >= r.bedroomsMin ? 'fits' : 'fails', p.bedrooms, r.bedroomsMin);
  }
  if (r.landMinSqft !== undefined) {
    if (p.landSqft === undefined) add('land', 'unknown', undefined, r.landMinSqft);
    else add('land', p.landSqft >= r.landMinSqft ? 'fits' : 'fails', p.landSqft, r.landMinSqft);
  }
  if (r.builtUpMinSqft !== undefined) {
    if (p.builtUpSqft === undefined) add('builtUp', 'unknown', undefined, r.builtUpMinSqft);
    else add('builtUp', p.builtUpSqft >= r.builtUpMinSqft ? 'fits' : 'fails', p.builtUpSqft, r.builtUpMinSqft);
  }
  if (r.tenure) {
    if (!p.tenure) add('tenure', 'unknown', undefined, r.tenure);
    else add('tenure', p.tenure === r.tenure ? 'fits' : 'fails', p.tenure, r.tenure);
  }
  if ((r.adjoiningUnits ?? 0) >= 2) add('adjoining', 'unknown', undefined, r.adjoiningUnits);
  if (p.status === 'needs_check') add('availability', 'unknown', 'needs_check');

  const fits = out.filter(c => c.verdict === 'fits').length;
  const fails = out.filter(c => c.verdict === 'fails').length;
  const unknown = out.filter(c => c.verdict === 'unknown').length;
  let level: Level = 'none';
  if (!isEmptyRequirement(r) && fits >= 1 && fails === 0) level = unknown === 0 ? 'exact' : 'partial';
  else if (!isEmptyRequirement(r) && fails === 1 && fits >= 2) level = 'near';
  return { level, criteria: out, score: fits * 10 - unknown * 2 - fails * 8 };
}

const better = (a: MatchResult, b: MatchResult) => RANK[a.level] < RANK[b.level] || (a.level === b.level && a.score > b.score);

export interface PropertyMatch { property: Listing; level: Level; criteria: Criterion[]; score: number; requirement: BuyerRequirement }
/** Properties that suit a buyer, best first. Uses the buyer's best-fitting requirement for each property. */
export function matchesForBuyer(c: Contact, properties: Listing[]): PropertyMatch[] {
  const reqs = (c.requirements ?? []).filter(r => !isEmptyRequirement(r));
  const out: PropertyMatch[] = [];
  for (const p of properties) {
    if (!offerable(p) || p.sample !== c.sample) continue;   // sample and real data never mix
    let best: { r: BuyerRequirement; m: MatchResult } | undefined;
    for (const r of reqs) { const m = matchRequirement(r, p); if (m.level !== 'none' && (!best || better(m, best.m))) best = { r, m }; }
    if (best) out.push({ property: p, level: best.m.level, criteria: best.m.criteria, score: best.m.score, requirement: best.r });
  }
  return out.sort((a, b) => RANK[a.level] - RANK[b.level] || b.score - a.score);
}

export interface BuyerMatchResult { contact: Contact; level: Level; criteria: Criterion[]; score: number; requirement: BuyerRequirement }
/** Active buyers whose requirements fit a property, best first. Dropped and already-booked buyers are left out. */
export function matchesForProperty(p: Listing, contacts: Contact[]): BuyerMatchResult[] {
  if (!offerable(p)) return [];
  const out: BuyerMatchResult[] = [];
  for (const c of contacts) {
    if (!c.roles.some(r => BUYER_ROLES.includes(r)) || c.leadStatus === 'dropped' || c.leadStatus === 'booked' || c.sample !== p.sample) continue;
    let best: { r: BuyerRequirement; m: MatchResult } | undefined;
    for (const r of c.requirements ?? []) { const m = matchRequirement(r, p); if (m.level !== 'none' && (!best || better(m, best.m))) best = { r, m }; }
    if (best) out.push({ contact: c, level: best.m.level, criteria: best.m.criteria, score: best.m.score, requirement: best.r });
  }
  const HEAT: Record<string, number> = { hot: 0, warm: 1, cold: 2 };
  return out.sort((a, b) => RANK[a.level] - RANK[b.level] || b.score - a.score || (HEAT[a.contact.leadStatus ?? 'cold'] ?? 3) - (HEAT[b.contact.leadStatus ?? 'cold'] ?? 3));
}
