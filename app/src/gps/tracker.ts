// House Shopping tracker: one per app, so recording continues while the agent opens other screens (for example to
// save a property found on the way). Uses the phone's GPS through the browser / WebView location service.
// In the browser this records while the app is open and the screen is on (a screen wake lock is requested).
// Recording with the screen off needs the Android app's background location (to be tested on the phone).
import type { Store } from '../data/store';
import { newId } from '../data/store';
import type { Journey } from '../data/types';
import { addPoint, addPlace, newJourney } from '../domain/journey';

export type TrackerError = 'unsupported' | 'denied' | 'unavailable' | 'timeout';
export interface Fix { lat: number; lng: number; acc: number; t: number }

type Listener = () => void;
const SAVE_EVERY_MS = 10_000;

export class Tracker {
  journeyId: string | null = null;
  fix: Fix | null = null;
  error: TrackerError | null = null;
  lastResult: string | null = null;
  private watch: number | null = null;
  private listeners = new Set<Listener>();
  private pending: Journey | null = null;
  private lastSave = 0;
  private pausedAt: number | null = null;
  private wakeLock: { release: () => Promise<void> } | null = null;
  /** Called after each accepted point with the journey, so the screen can look up place names. */
  onPoint: ((j: Journey) => void) | null = null;

  constructor(private store: Store) {
    const open = store.getState().journeys.find(j => j.status === 'recording' || j.status === 'paused');
    if (open) { this.journeyId = open.id; if (open.status === 'paused') this.pausedAt = open.updated; }
  }

  subscribe = (fn: Listener) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  private emit() { for (const l of this.listeners) l(); }

  get journey(): Journey | undefined {
    return this.pending ?? this.store.getState().journeys.find(j => j.id === this.journeyId);
  }
  get running() { return this.watch !== null; }

  start(): Journey {
    const j = newJourney(newId(), Date.now());
    this.store.upsert('journeys', j);
    this.journeyId = j.id;
    this.pausedAt = null;
    this.listen();
    return j;
  }

  /** Continue a journey that was recording when the app was closed or paused. */
  resume() {
    const j = this.journey;
    if (!j) return;
    const pausedMs = this.pausedAt ? Date.now() - this.pausedAt : 0;
    this.pausedAt = null;
    this.save({ ...j, status: 'recording', pausedMs: (j.pausedMs ?? 0) + pausedMs }, true);
    this.listen();
  }

  pause() {
    const j = this.journey;
    if (!j) return;
    this.stopWatching();
    this.pausedAt = Date.now();
    this.save({ ...j, status: 'paused' }, true);
  }

  /** Stops recording and saves the journey. Returns its id. */
  stop(title?: string): string | null {
    const j = this.journey;
    this.stopWatching();
    if (!j) return null;
    const pausedMs = this.pausedAt ? Date.now() - this.pausedAt : 0;
    this.save({ ...j, status: 'saved', endedAt: Date.now(), pausedMs: (j.pausedMs ?? 0) + pausedMs, title: title || j.title }, true);
    const id = j.id;
    this.journeyId = null; this.pausedAt = null; this.fix = null;
    this.emit();
    return id;
  }

  update(fn: (j: Journey) => Journey) {
    const j = this.journey;
    if (j) this.save(fn(j), true);
  }

  addPlaceName(name: string, lat: number, lng: number) {
    this.update(j => addPlace(j, name, lat, lng, Date.now()));
  }

  private save(j: Journey, now = false) {
    this.pending = j;
    if (now || Date.now() - this.lastSave > SAVE_EVERY_MS) {
      this.store.upsert('journeys', j);
      this.lastSave = Date.now();
      this.pending = null;
    }
    this.emit();
  }

  private listen() {
    this.error = null;
    if (!('geolocation' in navigator)) { this.error = 'unsupported'; this.emit(); return; }
    this.stopWatching();
    this.watch = navigator.geolocation.watchPosition(
      p => {
        const fix: Fix = { lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy), t: p.timestamp || Date.now() };
        this.fix = fix; this.error = null;
        const j = this.journey;
        if (!j || j.status !== 'recording') { this.emit(); return; }
        const r = addPoint(j, fix);
        this.lastResult = r.result;
        if (r.result === 'added') { this.save(r.journey); this.onPoint?.(r.journey); } else this.emit();
      },
      e => { this.error = e.code === 1 ? 'denied' : e.code === 3 ? 'timeout' : 'unavailable'; this.emit(); },
      // A reading up to 3 s old is accepted for the first fix (another map screen may already have the GPS running);
      // every point still passes the accuracy and jitter checks in domain/journey.ts.
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 30000 },
    );
    void this.keepAwake();
    this.emit();
  }

  private stopWatching() {
    if (this.watch !== null) navigator.geolocation.clearWatch(this.watch);
    this.watch = null;
    if (this.pending) { this.store.upsert('journeys', this.pending); this.pending = null; }
    void this.wakeLock?.release().catch(() => {});
    this.wakeLock = null;
  }

  private async keepAwake() {
    try { this.wakeLock = await (navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request('screen') ?? null; } catch { this.wakeLock = null; }
  }
}

let instance: Tracker | null = null;
/** The app's one tracker (created on first use). */
export function trackerFor(store: Store): Tracker {
  if (!instance) instance = new Tracker(store);
  return instance;
}
