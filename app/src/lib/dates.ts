// Local dates and times as plain strings: "yyyy-mm-dd" and "yyyy-mm-ddThh:mm". Times are the phone's local time
// (Malaysia), never converted to UTC, so a 10:00 viewing stays 10:00.

const two = (n: number) => String(n).padStart(2, '0');

export const ymd = (d: Date) => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
export const ymdhm = (d: Date) => `${ymd(d)}T${two(d.getHours())}:${two(d.getMinutes())}`;
export const ym = (d: Date) => `${d.getFullYear()}-${two(d.getMonth() + 1)}`;

/** Reads "yyyy-mm-dd" or "yyyy-mm-ddThh:mm" as local time. A date alone means `defaultHour`:00 that day. */
export function parseLocal(s?: string, defaultHour = 9): Date | undefined {
  if (!s) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(s);
  if (!m) return undefined;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), m[4] ? Number(m[4]) : defaultHour, m[5] ? Number(m[5]) : 0);
}
export const hasTime = (s?: string) => !!s && /T\d{2}:\d{2}/.test(s);
export const datePart = (s?: string) => (s ?? '').slice(0, 10);
export const timePart = (s?: string) => (hasTime(s) ? s!.slice(11, 16) : '');

export function addDays(d: Date, n: number): Date { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
export function startOfDay(d: Date): Date { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
export const sameDay = (a: Date, b: Date) => ymd(a) === ymd(b);

/** Six weeks of dates covering a month, weeks starting on Monday (as in Malaysian calendars). */
export function monthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  const start = addDays(first, -offset);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}
/** Monday to Sunday of the week that contains `d`. */
export function weekOf(d: Date): Date[] {
  const start = addDays(startOfDay(d), -((d.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export type LocaleTag = 'en-GB' | 'ms-MY' | 'zh-CN';
export const localeOf = (lang: 'en' | 'bm' | 'zh'): LocaleTag => (lang === 'bm' ? 'ms-MY' : lang === 'zh' ? 'zh-CN' : 'en-GB');

export function fmtDate(s: string | Date | number | undefined, lang: 'en' | 'bm' | 'zh', opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }): string {
  if (s === undefined || s === '') return '';
  const d = typeof s === 'string' ? parseLocal(s) : new Date(s);
  if (!d || isNaN(d.getTime())) return String(s);
  return d.toLocaleDateString(localeOf(lang), opts);
}
export function fmtDateTime(s: string | number | undefined, lang: 'en' | 'bm' | 'zh'): string {
  if (s === undefined || s === '') return '';
  if (typeof s === 'string' && !hasTime(s)) return fmtDate(s, lang, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const d = typeof s === 'string' ? parseLocal(s)! : new Date(s);
  return d.toLocaleString(localeOf(lang), { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}
export function fmtTime(s: string | undefined, lang: 'en' | 'bm' | 'zh'): string {
  const d = parseLocal(s);
  return d && hasTime(s) ? d.toLocaleTimeString(localeOf(lang), { hour: 'numeric', minute: '2-digit' }) : '';
}
export const monthText = (ymText: string | undefined, lang: 'en' | 'bm' | 'zh' = 'en') => {
  if (!ymText) return '';
  const [y, m] = ymText.split('-').map(Number);
  return m ? new Date(y, m - 1, 1).toLocaleString(localeOf(lang), { month: 'short', year: 'numeric' }) : ymText;
};
