// Changes 19 and 20: the usage log. The phone notes short, anonymous-looking events (which Google API was called from
// which screen, a screen was opened, minutes in the app, a sync worked or failed, ...) and sends them in batches to the
// database function eab_log_usage (supabase/proposed/20261018000000_change019_020_usage_dashboard.sql). The database
// decides who the events belong to (the signed-in person) and only the developer can read them.
//
// What is NEVER recorded: addresses, coordinates, search words, record contents, names, phone numbers, e-mails, error
// messages. An event is made only of a kind, a short code (lower-case letters, digits and . _ : -), a screen code, a
// yes/no, a count and one number (milliseconds, bytes or a count). codeOf() turns anything else into a safe code, and
// the database refuses anything that is not one.
//
// Nothing here can break the app: every public method catches its own errors, a failed send only keeps the events for
// the next try, and the queue is capped so a phone that is offline for weeks never fills its storage.
import { config } from '../config';
import { configured } from '../data/sync';
import type { Store } from '../data/store';
import { rpc } from '../team/api';

export type UsageKind = 'google' | 'session' | 'screen' | 'feature' | 'ai' | 'sync' | 'error' | 'metric';
const KINDS: readonly UsageKind[] = ['google', 'session', 'screen', 'feature', 'ai', 'sync', 'error', 'metric'];

/** What goes to the database (the person is added there, from the sign-in). */
export interface UsageEvent {
  kind: UsageKind; name: string; screen?: string; ok?: boolean; n?: number; value?: number;
  at: string; app_version?: string; platform?: string; device?: string;
}
/** A queued event also remembers who was signed in when it happened (never sent): events are only ever sent as that person. */
interface Queued extends UsageEvent { u: string }

export const MAX_QUEUE = 3000;
export const BATCH = 200;
const FLUSH_EVERY_MS = 60_000;
const ACTIVE_TICK_MS = 15_000;
const IDLE_AFTER_MS = 60_000;
const NEW_SESSION_AFTER_MS = 30 * 60_000;
const ERRORS_PER_HOUR = 10;
const QUEUE_KEY = 'usage:queue';

/** "listingForm" → "listing-form"; anything outside a-z 0-9 . _ : - becomes "-". Empty when nothing usable is left. */
export function codeOf(s: unknown, max = 60): string {
  if (typeof s !== 'string') return '';
  const c = s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase().replace(/[^a-z0-9_.:-]+/g, '-').replace(/-{2,}/g, '-').replace(/^[^a-z0-9]+/, '').slice(0, max).replace(/-+$/, '');
  return c;
}

/** A phone model as plain text the database accepts, or '' when it is not worth sending. */
export function deviceText(s: unknown): string {
  if (typeof s !== 'string') return '';
  const t = s.replace(/[^0-9A-Za-z ._()+-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  return t.length >= 2 && t !== 'K' ? t : '';
}

export interface UsageInit { appVersion: string; platform: 'android' | 'ios' | 'web'; device?: string; fetchFn?: typeof fetch }

export class UsageLogger {
  private store?: Store;
  private fetchFn: typeof fetch = (...a) => fetch(...a);
  private queue: Queued[] = [];
  private screenCode = '';
  private overlayCode = '';
  private init: UsageInit = { appVersion: '', platform: 'web' };
  private flushing = false;
  private nextTryAt = 0;
  private failures = 0;
  private activeMs = 0;
  private lastTick = 0;
  private lastInteraction = 0;
  private hiddenAt = 0;
  private errorTimes: number[] = [];
  private lastSyncOkAt = 0;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private started = false;
  /** Counts of what was sent or dropped, for the developer's own checks. */
  readonly stats = { sent: 0, dropped: 0, failedSends: 0 };

  /** Ties the logger to the phone's store (sign-in, settings, storage). Safe to call again. */
  attach(store: Store, init: UsageInit) {
    this.store = store; this.init = init;
    if (init.fetchFn) this.fetchFn = init.fetchFn;
  }

  private userId(): string | undefined { try { return this.store?.getState().meta.syncSession?.userId; } catch { return undefined; } }

  /** The screen events belong to: an open pop-up (the location picker) wins over the screen underneath it. */
  private currentScreen() { return this.overlayCode || this.screenCode || undefined; }

  /** Notes one event. Returns true when it was queued. Never throws. */
  track(e: { kind: UsageKind; name: string; screen?: string; ok?: boolean; n?: number; value?: number; at?: number }): boolean {
    try {
      const u = this.userId();
      if (!u) return false;                                       // nobody signed in: nothing is recorded
      if (!KINDS.includes(e.kind)) return false;
      const name = codeOf(e.name);
      if (!name) return false;
      const screen = codeOf(e.screen ?? this.currentScreen(), 40) || undefined;
      const q: Queued = { u, kind: e.kind, name, at: new Date(e.at ?? Date.now()).toISOString() };
      if (screen) q.screen = screen;
      if (typeof e.ok === 'boolean') q.ok = e.ok;
      if (Number.isInteger(e.n) && e.n! >= 1 && e.n! <= 1000) q.n = e.n;
      if (typeof e.value === 'number' && Number.isFinite(e.value)) q.value = e.value;
      if (this.init.appVersion) q.app_version = this.init.appVersion.slice(0, 40);
      if (this.init.platform) q.platform = this.init.platform;
      const d = deviceText(this.init.device); if (d) q.device = d;
      this.queue.push(q);
      if (this.queue.length > MAX_QUEUE) { this.stats.dropped += this.queue.length - MAX_QUEUE; this.queue.splice(0, this.queue.length - MAX_QUEUE); }
      this.persistLater();
      if (this.queue.length >= 25 && this.started) void this.flush();
      return true;
    } catch { return false; }
  }

  // ---------- the event kinds the app uses ----------
  /** One call to a Google Maps Platform API, e.g. google('geocoding.reverse', true). */
  google(name: string, ok: boolean, screen?: string) { this.track({ kind: 'google', name, ok, screen }); }
  feature(name: string, screen?: string) { this.track({ kind: 'feature', name, screen }); }
  ai(name: string, ok: boolean, value?: number) { this.track({ kind: 'ai', name, ok, value }); }
  /** A screen was opened. */
  screen(name: string) {
    const c = codeOf(name, 40);
    if (!c || c === this.screenCode) return;
    this.screenCode = c;
    this.track({ kind: 'screen', name: c, screen: c });
  }
  setOverlay(name: string) { this.overlayCode = codeOf(name, 40); }
  /** A sync or backup finished. Successful runs that changed nothing are noted at most every 30 minutes. */
  sync(name: string, ok: boolean, value?: number) {
    if (ok && name === 'sync.run' && !value) {
      const now = Date.now();
      if (now - this.lastSyncOkAt < 30 * 60_000) return;
      this.lastSyncOkAt = now;
    }
    this.track({ kind: 'sync', name, ok, value });
  }
  /** A problem, by code only (never the message). At most 10 an hour. */
  error(name: string, screen?: string) {
    const now = Date.now();
    this.errorTimes = this.errorTimes.filter(t => now - t < 3_600_000);
    if (this.errorTimes.length >= ERRORS_PER_HOUR) return;
    this.errorTimes.push(now);
    this.track({ kind: 'error', name, ok: false, screen });
  }
  metric(name: string, value: number) { this.track({ kind: 'metric', name, value }); }

  // ---------- time in the app ----------
  /** Called every few seconds: counts the time only while the app is in front AND the person touched it recently. */
  tick(now = Date.now(), visible = true) {
    if (this.lastTick && visible && now - this.lastInteraction < IDLE_AFTER_MS) this.activeMs += Math.min(now - this.lastTick, ACTIVE_TICK_MS * 2);
    this.lastTick = now;
  }
  touched(now = Date.now()) { this.lastInteraction = now; }
  /** Moves the counted time into the queue as one session.active event. */
  private closeActive() {
    const ms = Math.round(this.activeMs);
    if (ms >= 1000) { this.activeMs = 0; this.track({ kind: 'session', name: 'session.active', value: ms }); }
  }
  /** Time counted so far and not yet queued (for tests). */
  pendingActiveMs() { return Math.round(this.activeMs); }

  // ---------- sending ----------
  /** Sends what is waiting (oldest first, at most 200 per call, up to 5 calls). Resolves with how many were stored. */
  async flush(force = false): Promise<number> {
    const store = this.store;
    if (!store || this.flushing) return 0;
    this.flushing = true;
    let stored = 0;
    try {
      const me = this.userId();
      if (!me) return 0;
      if (this.queue.some(q => q.u !== me)) { this.stats.dropped += this.queue.filter(q => q.u !== me).length; this.queue = this.queue.filter(q => q.u === me); }
      this.closeActive();
      const cfg = config(store.getState().settings);
      if (!configured(cfg) || !this.queue.length) return 0;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return 0;
      if (!force && Date.now() < this.nextTryAt) return 0;
      for (let round = 0; round < 5 && this.queue.length; round++) {
        const batch = this.queue.slice(0, BATCH);
        const payload = batch.map(({ u: _u, ...e }) => e);
        try {
          const n = await rpc<number>(store, cfg, 'eab_log_usage', { p_events: payload }, this.fetchFn);
          this.queue = this.queue.filter(q => !batch.includes(q));
          stored += typeof n === 'number' ? n : batch.length;
          this.stats.sent += batch.length;
          this.failures = 0; this.nextTryAt = 0;
        } catch (e) {
          this.stats.failedSends++;
          this.failures++;
          const code = (e as { code?: string })?.code;
          // The database part may not be installed (yet) on this project: wait longer, keep the events.
          this.nextTryAt = Date.now() + (code === 'unavailable' ? 30 * 60_000 : Math.min(15 * 60_000, 30_000 * 2 ** Math.min(this.failures, 5)));
          break;
        }
      }
      this.persistLater();
    } catch { /* never disturbs the app */ }
    finally { this.flushing = false; }
    return stored;
  }

  // ---------- keeping the queue across restarts ----------
  private persistLater() {
    if (!this.store || this.persistTimer) return;
    this.persistTimer = setTimeout(() => { this.persistTimer = null; void this.persistNow(); }, 10_000);
    (this.persistTimer as { unref?: () => void }).unref?.();
  }
  async persistNow() {
    try { await this.store?.putLocalNow(QUEUE_KEY, this.queue); } catch { /* the events stay in memory */ }
  }
  /** Brings back events saved before the app was closed. */
  async restore() {
    try {
      const saved = (await this.store?.listLocal(QUEUE_KEY))?.find(r => r.key === QUEUE_KEY)?.value;
      if (Array.isArray(saved)) {
        const ok = saved.filter((x): x is Queued => !!x && typeof x === 'object' && typeof (x as Queued).u === 'string' && KINDS.includes((x as Queued).kind) && !!codeOf((x as Queued).name));
        this.queue = [...ok, ...this.queue].slice(-MAX_QUEUE);
      }
    } catch { /* nothing to restore */ }
  }

  /** Waiting events (for tests and the developer's own checks). */
  pending(): UsageEvent[] { return this.queue.map(({ u: _u, ...e }) => e); }
  clear() { this.queue = []; this.activeMs = 0; this.errorTimes = []; this.lastSyncOkAt = 0; this.screenCode = ''; this.overlayCode = ''; this.nextTryAt = 0; this.failures = 0; }

  // ---------- running in the app ----------
  /** Starts the timers and listeners. Returns a function that stops them. */
  start(doc: Document | undefined = typeof document === 'undefined' ? undefined : document, win: Window | undefined = typeof window === 'undefined' ? undefined : window): () => void {
    if (!doc || !win) return () => {};
    this.started = true;
    void this.restore().then(() => {
      this.track({ kind: 'session', name: 'session.start' });
      void this.reportMetrics();
    });
    this.lastTick = Date.now(); this.lastInteraction = Date.now();
    const touch = () => { this.lastInteraction = Date.now(); };
    const evs = ['pointerdown', 'keydown', 'touchstart', 'scroll'] as const;
    for (const ev of evs) win.addEventListener(ev, touch, { passive: true, capture: true });
    const tick = setInterval(() => this.tick(Date.now(), doc.visibilityState === 'visible'), ACTIVE_TICK_MS);
    const flush = setInterval(() => { void this.flush(); }, FLUSH_EVERY_MS);
    const metrics = setInterval(() => { void this.reportMetrics(); }, 6 * 3_600_000);
    const onVis = () => {
      const now = Date.now();
      if (doc.visibilityState === 'hidden') { this.hiddenAt = now; this.tick(now, true); this.closeActive(); void this.persistNow(); void this.flush(true); }
      else { if (this.hiddenAt && now - this.hiddenAt > NEW_SESSION_AFTER_MS) this.track({ kind: 'session', name: 'session.start' }); this.lastTick = now; this.lastInteraction = now; }
    };
    doc.addEventListener('visibilitychange', onVis);
    const onErr = (e: ErrorEvent) => { void e; this.error('js.error'); };
    const onRej = (e: PromiseRejectionEvent) => { void e; this.error('js.rejection'); };
    win.addEventListener('error', onErr);
    win.addEventListener('unhandledrejection', onRej);
    void this.flush();
    return () => {
      this.started = false;
      for (const ev of evs) win.removeEventListener(ev, touch, { capture: true } as EventListenerOptions);
      clearInterval(tick); clearInterval(flush); clearInterval(metrics);
      doc.removeEventListener('visibilitychange', onVis);
      win.removeEventListener('error', onErr); win.removeEventListener('unhandledrejection', onRej);
      this.closeActive(); void this.persistNow(); void this.flush(true);
    };
  }

  /** Sizes only: how much the app keeps on the phone, and how many changes are waiting to be sent. */
  async reportMetrics() {
    try {
      const est = await (typeof navigator !== 'undefined' ? navigator.storage?.estimate?.() : undefined);
      if (est && typeof est.usage === 'number') this.metric('storage.local_bytes', est.usage);
      const m = this.store?.getState().meta;
      if (m) this.metric('records.pending', m.dirty.length);
    } catch { /* not available */ }
  }
}

/** The one logger the app uses. */
export const usage = new UsageLogger();

/** Best-effort phone model (Chrome and the Android WebView hide most of it; empty when unknown). */
export async function detectDevice(nav: Navigator | undefined = typeof navigator === 'undefined' ? undefined : navigator): Promise<string> {
  try {
    const uad = (nav as unknown as { userAgentData?: { getHighEntropyValues?: (h: string[]) => Promise<{ model?: string }> } } | undefined)?.userAgentData;
    const hi = await uad?.getHighEntropyValues?.(['model']);
    const m = deviceText(hi?.model);
    if (m) return m;
    const ua = nav?.userAgent ?? '';
    const x = /Android[^;)]*;\s*([^;)]+?)(?:\s+Build\/[^;)]*)?[;)]/.exec(ua);
    return deviceText(x?.[1]);
  } catch { return ''; }
}
