// Advertising & Listing Tracker rules. Pure functions; the screens call these and save the results.
// An advert lives inside its property record (marketing.ads), so there is one store of adverts, not two.
// Real adverts only are counted in costs and reminders: dummy / test adverts (fake) and adverts on sample properties never are,
// so practice data cannot be mixed into the real figures.
import { Advert, AdStatus, AdType, Listing } from '../listing/model';

export const DEFAULT_REMIND_DAYS = 3;

/** An advert that counts: not a test listing and not on a sample property. */
export const isRealAd = (l: Pick<Listing, 'sample'>, a: Advert): boolean => !a.fake && !l.sample;

const DAY = 86_400_000;
const utc = (ymd: string): number | undefined => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : undefined; };
/** Whole days from `from` to `to` (both YYYY-MM-DD); negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number | undefined {
  const a = utc(from), b = utc(to);
  return a === undefined || b === undefined ? undefined : Math.round((b - a) / DAY);
}

/** The status to show. A "live" advert whose end date has passed is shown as Expired (the saved status is not changed until the agent does). */
export function shownStatus(a: Advert, today: string): AdStatus | undefined {
  if (a.status === 'live' && a.end && daysBetween(today, a.end) !== undefined && daysBetween(today, a.end)! < 0) return 'expired';
  return a.status;
}
export const isStale = (a: Advert, today: string) => a.status === 'live' && shownStatus(a, today) === 'expired';

export type AdIssue = 'url' | 'dates' | 'cost' | 'platform';
/** Problems that stop an advert being saved. */
export function validateAd(a: Advert): AdIssue[] {
  const out: AdIssue[] = [];
  if (!a.platform.trim()) out.push('platform');
  if (a.url && !/^https?:\/\/[^\s/]+\.[^\s/]+/i.test(a.url.trim())) out.push('url');
  if (a.start && a.end && (daysBetween(a.start, a.end) ?? 0) < 0) out.push('dates');
  if (a.cost !== undefined && (!Number.isFinite(a.cost) || a.cost < 0)) out.push('cost');
  return out;
}

export function newAd(id: string, o: Partial<Advert> = {}): Advert {
  return { id, platform: 'PropertyGuru', status: 'planned', type: 'listing', ...o };
}
/** A dummy / test advert: always labelled, never counted, never live. */
export function newFakeAd(id: string, o: Partial<Advert> = {}): Advert {
  return newAd(id, { ...o, fake: true, status: 'planned' });
}

// ---------- attention list (expiry reminders) ----------
export type AttentionKind = 'expired' | 'expiring' | 'needs_update';
export interface Attention { propertyId: string; adId: string; kind: AttentionKind; /** days until the end date (negative = days since) */ days?: number; at: number }

/** Real adverts that need the agent: past the end date, ending within their reminder window, or marked Needs update. Most urgent first. */
export function attention(listings: Listing[], today: string): Attention[] {
  const out: Attention[] = [];
  for (const l of listings) for (const a of l.marketing?.ads ?? []) {
    if (!isRealAd(l, a)) continue;
    const st = a.status;
    if (st === 'paused' || st === 'planned') continue;
    const left = a.end ? daysBetween(today, a.end) : undefined;
    if (st === 'expired') continue;
    if (left !== undefined && left < 0) out.push({ propertyId: l.id, adId: a.id, kind: 'expired', days: left, at: 0 });
    else if (st === 'needs_update') out.push({ propertyId: l.id, adId: a.id, kind: 'needs_update', days: left, at: 0 });
    else if (left !== undefined && left <= (a.remindDays ?? DEFAULT_REMIND_DAYS)) out.push({ propertyId: l.id, adId: a.id, kind: 'expiring', days: left, at: 0 });
  }
  const rank: Record<AttentionKind, number> = { expired: 0, needs_update: 1, expiring: 2 };
  return out.sort((x, y) => rank[x.kind] - rank[y.kind] || (x.days ?? 999) - (y.days ?? 999));
}

/** Phone notifications to schedule: 9:00 on the reminder day for each real, running advert with an end date still ahead. */
export interface AdReminder { key: string; at: number; propertyId: string; adId: string; days: number }
export function adReminders(listings: Listing[], now: number): AdReminder[] {
  const out: AdReminder[] = [];
  for (const l of listings) for (const a of l.marketing?.ads ?? []) {
    if (!isRealAd(l, a) || !a.end || (a.status !== 'live' && a.status !== 'needs_update')) continue;
    const e = utc(a.end);
    if (e === undefined) continue;
    const days = a.remindDays ?? DEFAULT_REMIND_DAYS;
    const d = new Date(e); const at = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - days, 9, 0, 0).getTime();
    if (at > now) out.push({ key: `ad:${l.id}:${a.id}:${a.end}:${days}`, at, propertyId: l.id, adId: a.id, days });
  }
  return out.sort((x, y) => x.at - y.at);
}

// ---------- cost summaries ----------
export interface CostLine { key: string; label: string; total: number; count: number }
export interface CostSummary {
  total: number; count: number; withCost: number; withoutCost: number;
  byProperty: CostLine[]; byPlatform: CostLine[]; byMonth: CostLine[];
  /** Adverts left out of the figures above. */
  testCount: number; sampleCount: number;
}
export const UNDATED = 'undated';
/** Period = start date's month; `from`/`to` are inclusive YYYY-MM-DD limits on the start date (adverts with no start date are in "undated" and kept only when no limit is set). */
export function costSummary(listings: Listing[], titleOf: (l: Listing) => string, o: { from?: string; to?: string } = {}): CostSummary {
  const sum: CostSummary = { total: 0, count: 0, withCost: 0, withoutCost: 0, byProperty: [], byPlatform: [], byMonth: [], testCount: 0, sampleCount: 0 };
  const P = new Map<string, CostLine>(), F = new Map<string, CostLine>(), M = new Map<string, CostLine>();
  const bump = (m: Map<string, CostLine>, key: string, label: string, cost: number) => {
    const x = m.get(key) ?? { key, label, total: 0, count: 0 }; x.total += cost; x.count++; m.set(key, x);
  };
  for (const l of listings) for (const a of l.marketing?.ads ?? []) {
    if (a.fake) { sum.testCount++; continue; }
    if (l.sample) { sum.sampleCount++; continue; }
    if ((o.from || o.to) && (!a.start || (o.from && a.start < o.from) || (o.to && a.start > o.to))) continue;
    const cost = a.cost ?? 0;
    sum.count++; sum.total += cost;
    if (a.cost === undefined) sum.withoutCost++; else sum.withCost++;
    bump(P, l.id, titleOf(l), cost); bump(F, a.platform || '—', a.platform || '—', cost);
    const month = a.start ? a.start.slice(0, 7) : UNDATED;
    bump(M, month, month, cost);
  }
  const byTotal = (x: CostLine, y: CostLine) => y.total - x.total || x.label.localeCompare(y.label);
  sum.byProperty = [...P.values()].sort(byTotal); sum.byPlatform = [...F.values()].sort(byTotal);
  sum.byMonth = [...M.values()].sort((x, y) => (x.key === UNDATED ? 1 : y.key === UNDATED ? -1 : y.key.localeCompare(x.key)));
  return sum;
}

// ---------- saving ----------
const stamp = (l: Listing, now: number, summary: string): Listing => ({ ...l, history: [{ at: now, source: 'form', summary }, ...(l.history ?? [])] });
/** Adds or replaces one advert in the property record, with a record-history entry. */
export function saveAd(l: Listing, ad: Advert, now: number): Listing {
  const ads = l.marketing?.ads ?? [];
  const exists = ads.some(x => x.id === ad.id);
  const next: Listing = { ...l, updated: now, marketing: { ...(l.marketing ?? { custom: {}, ads: [] }), custom: l.marketing?.custom ?? {}, ads: exists ? ads.map(x => (x.id === ad.id ? ad : x)) : [...ads, ad], advertised: ad.fake ? l.marketing?.advertised : 'yes' } };
  return stamp(next, now, `${exists ? 'Advert changed' : 'Advert added'}: ${ad.platform}${ad.fake ? ' (test)' : ''}`);
}
export function deleteAd(l: Listing, adId: string, now: number): Listing {
  const ad = (l.marketing?.ads ?? []).find(x => x.id === adId);
  if (!ad) return l;
  const next: Listing = { ...l, updated: now, marketing: { ...(l.marketing as NonNullable<Listing['marketing']>), ads: (l.marketing?.ads ?? []).filter(x => x.id !== adId) } };
  return stamp(next, now, `Advert removed: ${ad.platform}${ad.fake ? ' (test)' : ''}`);
}
export type { AdType };
