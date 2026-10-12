// One place for Malaysian Ringgit (RM) money: reading what the agent types, showing it while typing, and showing it in
// results. Every money field in the app uses these, so "500000", "500,000", "RM 500,000" and "rm500k" are never read
// differently on different screens.
//
// Rules
//  - Display: "RM 500,000" (whole ringgit) or "RM 1,234.50" (with sen).
//  - Typing: thousands separators appear as you type ("1500000" shows "1,500,000"); the stored value stays a plain
//    number (1500000), so calculations never see the commas.
//  - Up to 2 decimal places (sen). A trailing "." while typing is kept ("12." stays "12.") so the next digit can follow.
//  - Pasted text such as "RM 1,250,000.00" or "RM1.5m" / "RM 580k" is understood.
//  - An empty box means "not set" (undefined), never 0.

/** Reads a typed or pasted amount. Returns undefined for empty or unreadable text. */
export function parseMoney(text: string | undefined | null, opts: { allowNegative?: boolean } = {}): number | undefined {
  if (text === undefined || text === null) return undefined;
  let s = String(text).trim().toLowerCase().replace(/^rm\s*/, '').replace(/\s*rm$/, '').replace(/[\s,]/g, '');
  if (!s) return undefined;
  let neg = false;
  if (opts.allowNegative && /^[-−(]/.test(s)) { neg = true; s = s.replace(/^[-−(]/, '').replace(/\)$/, ''); }
  let mult = 1;
  const suffix = /^([\d.]+)(k|m|mil|million|j|juta)$/.exec(s);
  if (suffix) { s = suffix[1]; mult = suffix[2] === 'k' ? 1_000 : 1_000_000; }
  if (!/^\d*\.?\d*$/.test(s) || s === '.') return undefined;
  const n = Number(s) * mult;
  if (!Number.isFinite(n)) return undefined;
  const rounded = Math.round(n * 100) / 100;
  return neg ? -rounded : rounded;
}

/** Adds thousands separators to the whole-ringgit part. */
function group(intDigits: string): string {
  const d = intDigits.replace(/^0+(?=\d)/, '');
  return d.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * What the money box shows while the agent types: digits grouped with commas, at most one "." and two decimals.
 * Anything else (letters, a second ".") is dropped.
 */
export function formatMoneyTyping(text: string, opts: { allowNegative?: boolean } = {}): string {
  const raw = String(text ?? '');
  const neg = !!opts.allowNegative && /^\s*[-−]/.test(raw);
  const cleaned = raw.replace(/[^\d.]/g, '');
  const dot = cleaned.indexOf('.');
  const intPart = dot >= 0 ? cleaned.slice(0, dot) : cleaned;
  const decPart = dot >= 0 ? cleaned.slice(dot + 1).replace(/\./g, '').slice(0, 2) : '';
  if (!intPart && dot < 0) return neg ? '-' : '';
  const g = group(intPart || (dot >= 0 ? '0' : ''));
  return (neg ? '-' : '') + g + (dot >= 0 ? '.' + decPart : '');
}

/** The box's text for a stored number (no "RM": the box shows RM beside it). */
export function moneyBoxText(n: number | undefined): string {
  if (n === undefined || !Number.isFinite(n)) return '';
  const neg = n < 0;
  const abs = Math.abs(n);
  const whole = Math.trunc(abs);
  const sen = Math.round((abs - whole) * 100);
  return (neg ? '-' : '') + group(String(whole)) + (sen ? '.' + String(sen).padStart(2, '0') : '');
}

/**
 * Where the cursor should go after the box is reformatted: just after the same number of digits (and ".") that were
 * before it, so typing or deleting in the middle of "1,500,000" does not throw the cursor to the end.
 */
export function caretAfterFormat(before: string, caret: number, after: string): number {
  const meaningful = (ch: string) => /[\d.\-]/.test(ch);
  let count = 0;
  for (let i = 0; i < Math.min(caret, before.length); i++) if (meaningful(before[i])) count++;
  if (count === 0) return 0;
  for (let i = 0; i < after.length; i++) {
    if (meaningful(after[i])) count--;
    if (count === 0) return i + 1;
  }
  return after.length;
}

/** Display: "RM 500,000" (rounded to whole ringgit). Empty for no value. */
export const rm = (n?: number) =>
  n === undefined || !Number.isFinite(n) ? '' : (n < 0 ? '-RM ' : 'RM ') + Math.round(Math.abs(n)).toLocaleString('en-US');

/** Display with sen: "RM 1,234.50". */
export const rm2 = (n?: number) =>
  n === undefined || !Number.isFinite(n) ? '' : (n < 0 ? '-RM ' : 'RM ') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Short display for cards: "RM 1.5m", "RM 580k", or the full amount below RM 100,000. */
export function rmShort(n?: number): string {
  if (n === undefined) return '';
  if (n >= 1_000_000) return `RM ${+(n / 1_000_000).toFixed(2)}m`;
  if (n >= 100_000) return `RM ${Math.round(n / 1000)}k`;
  return rm(n);
}
