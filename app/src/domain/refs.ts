// Property references: prefix + unique running number, e.g. P1001.
// Rules (owner, 12 Oct 2026):
//  - Built-in prefixes P, A, B, C, D, I, INT, ZA; any other prefix can be typed under Others and is remembered.
//  - The most recently used custom prefix is listed first, and the prefix used last is the default next time.
//  - Custom prefixes can be deleted; built-in prefixes cannot.
//  - The number part is unique across all prefixes (P1001 exists → the next suggestion is 1002, whatever the prefix).
//  - The full reference is unique too.
import type { CustomOption } from '../data/types';

export const BUILTIN_PREFIXES = ['P', 'A', 'B', 'C', 'D', 'I', 'INT', 'ZA'] as const;
export const FIRST_NUMBER = 1001;

interface HasRef { id: string; ref?: string; refPrefix?: string; refNo?: number }

export function parseRef(ref?: string): { prefix: string; no: number } | null {
  const m = /^\s*([A-Za-z]{1,6})\s*-?\s*(\d{1,9})\s*$/.exec(ref ?? '');
  return m ? { prefix: m[1].toUpperCase(), no: Number(m[2]) } : null;
}
export const makeRef = (prefix: string, no: number) => `${prefix.trim().toUpperCase()}${no}`;

function numberOf(r: HasRef): number | undefined {
  return r.refNo ?? parseRef(r.ref)?.no;
}

/** Number parts already used by other properties. */
export function usedNumbers(list: HasRef[], exceptId?: string): Set<number> {
  const s = new Set<number>();
  for (const r of list) if (r.id !== exceptId) { const n = numberOf(r); if (n !== undefined) s.add(n); }
  return s;
}

/** Next free number: one more than the highest used, starting at 1001. */
export function nextNumber(list: HasRef[], exceptId?: string): number {
  const used = [...usedNumbers(list, exceptId)];
  return used.length ? Math.max(FIRST_NUMBER - 1, ...used) + 1 : FIRST_NUMBER;
}

export type PrefixProblem = 'empty' | 'invalid';
export function checkPrefix(p: string): PrefixProblem | null {
  const v = p.trim();
  if (!v) return 'empty';
  return /^[A-Za-z]{1,6}$/.test(v) ? null : 'invalid';
}

export type RefProblem = 'invalidPrefix' | 'invalidNumber' | 'numberTaken' | 'refTaken';
/** Checks a reference before saving. Returns null when it can be used. */
export function checkRef(list: HasRef[], id: string, prefix: string, no: number | undefined): RefProblem | null {
  if (checkPrefix(prefix)) return 'invalidPrefix';
  if (no === undefined || !Number.isInteger(no) || no <= 0) return 'invalidNumber';
  const full = makeRef(prefix, no);
  if (list.some(r => r.id !== id && (r.ref ?? '').toUpperCase() === full)) return 'refTaken';
  if (usedNumbers(list, id).has(no)) return 'numberTaken';
  return null;
}

export const isBuiltinPrefix = (p: string) => (BUILTIN_PREFIXES as readonly string[]).includes(p.toUpperCase());

/** Prefix choices in display order: custom prefixes (most recently used first), then the built-in ones. */
export function prefixChoices(custom: CustomOption[] = []): { value: string; custom: boolean }[] {
  const c = [...custom].filter(o => !isBuiltinPrefix(o.value)).sort((a, b) => b.used - a.used).map(o => ({ value: o.value.toUpperCase(), custom: true }));
  return [...c, ...BUILTIN_PREFIXES.map(value => ({ value, custom: false }))];
}

/** Default prefix for a new property: the one used last if it still exists, otherwise the top choice. */
export function defaultPrefix(custom: CustomOption[] = [], lastPrefix?: string): string {
  const choices = prefixChoices(custom);
  if (lastPrefix && choices.some(c => c.value === lastPrefix.toUpperCase())) return lastPrefix.toUpperCase();
  return choices[0].value;
}

export interface NumberChoice {
  no: number;
  /** References already using this number (shown in red, cannot be chosen). Empty when the number is free. */
  usedBy: string[];
  /** The number this property already has (kept when editing). */
  current: boolean;
}

/**
 * Numbers for the reference-number dropdown: every number from 1001 up to 10 past the highest one in use, so gaps
 * left by deleted properties can be reused. Used numbers come back with the references that use them (shown in red).
 * Under the owner's rule the number is unique across all prefixes, so A1003 also makes 1003 "used" for P.
 */
export function numberChoices(list: HasRef[], exceptId?: string, extraFree = 10): NumberChoice[] {
  const byNo = new Map<number, string[]>();
  let currentNo: number | undefined;
  for (const r of list) {
    const n = numberOf(r);
    if (n === undefined) continue;
    if (r.id === exceptId) { currentNo = n; continue; }
    byNo.set(n, [...(byNo.get(n) ?? []), r.ref ?? (r.refPrefix ? makeRef(r.refPrefix, n) : String(n))]);
  }
  const highest = Math.max(FIRST_NUMBER - 1, ...byNo.keys(), currentNo ?? 0);
  const out: NumberChoice[] = [];
  for (let n = FIRST_NUMBER; n <= highest + extraFree; n++) out.push({ no: n, usedBy: byNo.get(n) ?? [], current: n === currentNo });
  // Old records may carry numbers below 1001; list them too so they show as used.
  for (const n of [...byNo.keys()].filter(x => x < FIRST_NUMBER).sort((a, b) => a - b)) out.unshift({ no: n, usedBy: byNo.get(n)!, current: false });
  return out;
}
