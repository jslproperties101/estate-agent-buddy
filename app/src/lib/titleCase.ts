// Title Case for short labels (field names, section names, dropdown values), Change 009.
//  - English and Bahasa Malaysia: the first letter of each word is a capital, except small joining words after the first
//    word ("Price, Tenure and Title Info", "Nombor Unit/Lot dan Jalan").
//  - Words that already hold a capital after the first letter (kVA, RM, DO, WhatsApp, NIL), units (sq ft) and "e.g."
//    stay as they are.
//  - Long help sentences are NOT passed through this: they keep normal sentence capitals.
//  - Chinese (and any script without capital letters) is never changed.
import type { Lang } from '../i18n';

const MINOR: Record<string, Set<string>> = {
  en: new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'of', 'on', 'or', 'per', 'the', 'to', 'via', 'vs', 'with', 'from']),
  bm: new Set(['dan', 'atau', 'di', 'ke', 'dari', 'daripada', 'untuk', 'per', 'yang', 'bagi', 'dengan', 'sebagai', 'pada']),
};
/** Kept exactly as written. */
const KEEP = new Set(['sq', 'ft', 'e.g.', 'm²', 'x', '×']);

function capWord(w: string, first: boolean, minor: Set<string>): string {
  // Leading punctuation such as "(" or "/" stays; the letter after it is the one to change.
  const m = /^([^\p{L}\p{N}]*)(.*)$/u.exec(w);
  const lead = m?.[1] ?? '';
  const core = m?.[2] ?? w;
  if (!core) return w;
  const low = core.toLowerCase();
  if (KEEP.has(low.replace(/[),:;?!]+$/, ''))) return w;
  if (/\p{Lu}/u.test(core.slice(1))) return w;            // kVA, RM, WhatsApp, NIL: already written on purpose
  if (!first && minor.has(low.replace(/[^\p{L}]/gu, ''))) return lead + core;
  // Hyphenated or slashed parts each get a capital: "Built-Up", "Unit/Lot".
  return lead + core.split(/([-/])/).map(p => (p === '-' || p === '/' ? p : p.charAt(0).toLocaleUpperCase() + p.slice(1))).join('');
}

/** One label in Title Case for the language; other languages come back unchanged. */
export function titleCase(text: string, lang: Lang): string {
  const minor = MINOR[lang];
  if (!minor || !/[a-z]/i.test(text)) return text;
  return text.split(/(\s+)/).map((w, i) => (/^\s+$/.test(w) ? w : capWord(w, i === 0, minor))).join('');
}

/** A copy of a label map with every string value in Title Case (functions and nested objects are left alone). */
export function titleCaseMap<T extends Record<string, unknown>>(map: T, lang: Lang): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(map)) out[k] = typeof v === 'string' ? titleCase(v, lang) : v;
  return out as T;
}
