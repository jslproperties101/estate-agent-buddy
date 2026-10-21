// MainForAdmin-D (Stage D): what Admin EAB pushes to the app, and the company-wide switches.
//  - Market News and Intelligence posts, Admin-pushed Projects (also by invitation code), announcements (banner / pop-up):
//    the database decides who sees what and in which order (eab_my_feed). The phone only shows what it was given, and
//    keeps the last answer so the screens work offline. A withdrawn item disappears at the next refresh (no archive).
//  - Force update (soft warning / hard block) and maintenance mode (eab_public_settings), read signed in or not.
// A database without these functions (an older project) is "nothing to show": every screen keeps working.
import type { Store } from '../data/store';
import { configured, supabaseCall, supabaseHeaders, type SyncConfig } from '../data/sync';
import { rpc, TeamError } from '../team/api';
import { usage } from '../usage/logger';

export type FeedKind = 'news' | 'project' | 'announcement';
export interface FeedProject { developer?: string; location?: string; price_from?: number; price_to?: number; launch?: string; status?: string }
export interface FeedItem {
  id: string; kind: FeedKind; title: string; body?: string | null;
  image_url?: string | null; link_url?: string | null; pdf_url?: string | null;
  display?: 'banner' | 'popup' | null; project?: FeedProject | null; published_at?: string;
  from_code?: boolean; opened_at?: string | null; acknowledged_at?: string | null; dismissed_at?: string | null;
}
export interface FeedCache { userId: string; lang: string; items: FeedItem[]; at: number }
export type FeedMark = 'opened' | 'acknowledged' | 'dismissed';

export interface PublicSettings {
  company_name?: string; support_email?: string | null; business_address?: string | null;
  min_version?: string | null; min_version_mode?: 'soft' | 'hard'; update_url?: string | null;
  maintenance_on?: boolean; maintenance_message_en?: string | null; maintenance_message_bm?: string | null; maintenance_message_zh?: string | null;
  maintenance_back_at?: string | null;
  /** When this phone last heard it (ms). */
  fetchedAt: number;
}

/** Maintenance is trusted for 12 hours after it was last heard, so a phone that misses "off" is never locked for good. */
export const MAINTENANCE_TRUST_MS = 12 * 3_600_000;

// ---------- pure rules (tested) ----------
const ALLOWED_URL = /^https:\/\/[^\s]+$/;
/** Only https links are opened or shown as pictures. */
export const safeUrl = (u: string | null | undefined) => (u && ALLOWED_URL.test(u) ? u : undefined);

/** "2.10.0" is newer than "2.9.3". Missing parts count as 0; anything that is not a number counts as 0. */
export function versionLess(a: string, b: string): boolean {
  const pa = a.split('.').map(x => parseInt(x, 10) || 0); const pb = b.split('.').map(x => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const d = (pa[i] ?? 0) - (pb[i] ?? 0); if (d !== 0) return d < 0; }
  return false;
}
/** Does this app version have to (or should it) update? */
export function updateVerdict(s: PublicSettings | undefined, version: string): 'ok' | 'soft' | 'hard' {
  if (!s?.min_version || !versionLess(version, s.min_version)) return 'ok';
  return s.min_version_mode === 'hard' ? 'hard' : 'soft';
}
export function maintenanceActive(s: PublicSettings | undefined, now = Date.now()): boolean {
  return !!s?.maintenance_on && now - s.fetchedAt < MAINTENANCE_TRUST_MS;
}
export function maintenanceText(s: PublicSettings, lang: string): string | undefined {
  const m = lang === 'bm' ? s.maintenance_message_bm : lang === 'zh' ? s.maintenance_message_zh : s.maintenance_message_en;
  return (m || s.maintenance_message_en || undefined) ?? undefined;
}

/** The cached feed, only if it belongs to the person signed in now. */
export function myFeed(store: Store): FeedItem[] {
  const st = store.getState(); const f = st.meta.feed; const me = st.meta.syncSession?.userId;
  return f && me && f.userId === me ? f.items : [];
}
export const ofKind = (items: FeedItem[], kind: FeedKind) => items.filter(i => i.kind === kind);
export const unreadNews = (items: FeedItem[]) => items.filter(i => i.kind === 'news' && !i.opened_at).length;
/** Banners not closed, pop-ups not acknowledged — in Admin's order. */
export const openBanners = (items: FeedItem[]) => items.filter(i => i.kind === 'announcement' && i.display === 'banner' && !i.dismissed_at);
export const openPopups = (items: FeedItem[]) => items.filter(i => i.kind === 'announcement' && i.display === 'popup' && !i.acknowledged_at);

// ---------- talking to the database ----------
/** Fetches the agent's whole feed (every kind) in the app's language. Returns false when nothing could be read. */
export async function refreshFeed(store: Store, cfg: SyncConfig, lang: string, fetchFn?: typeof fetch): Promise<boolean> {
  const s = store.getState().meta.syncSession;
  if (!s || !configured(cfg)) return false;
  await sendMarks(store, cfg, fetchFn);
  try {
    const items = await rpc<FeedItem[]>(store, cfg, 'eab_my_feed', { p_kind: null, p_lang: lang }, fetchFn);
    if (store.getState().meta.syncSession?.userId !== s.userId) return false;   // signed out or switched meanwhile
    const pending = store.getState().meta.feedMarks ?? [];
    // A mark made offline and not sent yet still shows as made.
    const merged = (Array.isArray(items) ? items : []).map(i => applyMarks(i, pending.filter(p => p.id === i.id)));
    store.setSingleton('meta', { feed: { userId: s.userId, lang, items: merged, at: Date.now() } });
    return true;
  } catch (e) {
    if (e instanceof TeamError && e.code === 'unavailable') store.setSingleton('meta', { feed: { userId: s.userId, lang, items: [], at: Date.now() } });
    return false;
  }
}

function applyMarks(i: FeedItem, marks: { what: FeedMark; at: string }[]): FeedItem {
  let out = i;
  for (const m of marks) {
    out = { ...out, opened_at: out.opened_at ?? m.at };
    if (m.what === 'acknowledged') out = { ...out, acknowledged_at: out.acknowledged_at ?? m.at };
    if (m.what === 'dismissed') out = { ...out, dismissed_at: out.dismissed_at ?? m.at };
  }
  return out;
}

/** Marks an item at once on the phone (badge, banner, pop-up) and sends it; if offline it is sent at the next refresh. */
export async function markFeed(store: Store, cfg: SyncConfig, id: string, what: FeedMark, fetchFn?: typeof fetch): Promise<void> {
  const st = store.getState(); const f = st.meta.feed; const me = st.meta.syncSession?.userId;
  if (!f || !me || f.userId !== me) return;
  const at = new Date().toISOString();
  const item = f.items.find(i => i.id === id);
  if (!item) return;
  const already = what === 'opened' ? !!item.opened_at : what === 'acknowledged' ? !!item.acknowledged_at : !!item.dismissed_at;
  store.setSingleton('meta', { feed: { ...f, items: f.items.map(i => (i.id === id ? applyMarks(i, [{ what, at }]) : i)) } });
  if (already) return;
  if (what === 'opened') usage.feature(`${item.kind}.open`);
  store.setSingleton('meta', { feedMarks: [...(store.getState().meta.feedMarks ?? []), { id, what, at, userId: me }].slice(-200) });
  await sendMarks(store, cfg, fetchFn);
}

let sending = false;
async function sendMarks(store: Store, cfg: SyncConfig, fetchFn?: typeof fetch) {
  if (sending || !configured(cfg)) return;
  const me = store.getState().meta.syncSession?.userId;
  const all = store.getState().meta.feedMarks ?? [];
  if (!me || !all.length) return;
  sending = true;
  try {
    for (const m of all.filter(x => x.userId === me)) {
      try { await rpc<boolean>(store, cfg, 'eab_feed_mark', { p_item: m.id, p_what: m.what }, fetchFn); }
      catch (e) { if (!(e instanceof TeamError && e.code !== 'network')) break; /* offline: try later; refused: drop it */ }
      store.setSingleton('meta', { feedMarks: (store.getState().meta.feedMarks ?? []).filter(x => x !== m) });
    }
    // marks of another account are never sent as this one
    store.setSingleton('meta', { feedMarks: (store.getState().meta.feedMarks ?? []).filter(x => x.userId === me) });
  } finally { sending = false; }
}

export type RedeemResult = { ok: true; added: number; visible: number } | { ok: false; reason: 'not_found' | 'expired' | 'used_up' | 'too_many' | 'empty' | 'offline' | 'unavailable' | 'other' };
/** An invitation code from the team leader or management: adds one project or a bundle. */
export async function redeemCode(store: Store, cfg: SyncConfig, code: string, lang: string, fetchFn?: typeof fetch): Promise<RedeemResult> {
  const k = code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (k.length < 6) return { ok: false, reason: 'empty' };
  try {
    const r = await rpc<{ ok: boolean; added?: number; visible?: number; reason?: string }>(store, cfg, 'eab_redeem_code', { p_code: k }, fetchFn);
    usage.feature('code.redeem');
    if (!r?.ok) return { ok: false, reason: (['not_found', 'expired', 'used_up', 'too_many'].includes(r?.reason ?? '') ? r.reason : 'other') as 'other' };
    await refreshFeed(store, cfg, lang, fetchFn);
    return { ok: true, added: r.added ?? 0, visible: r.visible ?? 0 };
  } catch (e) {
    const c = e instanceof TeamError ? e.code : 'other';
    return { ok: false, reason: c === 'network' ? 'offline' : c === 'unavailable' ? 'unavailable' : 'other' };
  }
}

/** The company-wide switches. Works signed out too (the public key only). Keeps the last answer. */
export async function refreshPublicSettings(store: Store, cfg: SyncConfig, fetchFn: typeof fetch = (...a) => fetch(...a)): Promise<boolean> {
  if (!configured(cfg)) return false;
  try {
    const r = await supabaseCall(fetchFn, `${cfg.supabaseUrl}/rest/v1/rpc/eab_public_settings`, { method: 'POST', headers: supabaseHeaders(cfg), body: '{}' });
    const j = (await r.json()) as Omit<PublicSettings, 'fetchedAt'> | null;
    if (!j || typeof j !== 'object') return false;
    store.setSingleton('meta', { publicSettings: { ...j, fetchedAt: Date.now() } });
    return true;
  } catch { return false; }
}
