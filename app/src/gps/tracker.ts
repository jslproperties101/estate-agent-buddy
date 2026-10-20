// House Shopping tracker: one per app, so recording continues while the agent opens other screens (for example to
// save a property found on the way). Uses the phone's GPS through the browser / WebView location service.
// In the browser this records while the app is open and the screen is on (a screen wake lock is requested).
// Recording with the screen off needs the Android app's background location (to be tested on the phone).
import type { Store } from '../data/store';
import { newId } from '../data/store';
import type { Journey } from '../data/types';
import { addPoint, addPlace, newJourney, thinPoints, nextSnapBatch, mergeSnapped, areaFromProperties, continued } from '../domain/journey';
import { config } from '../config';
import { snapToRoads } from './roads';

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

  /** Stops recording and saves the journey (JoyChange007: also with nothing marked). Returns its id. The area name comes
   *  from the nearest saved property when there is one; the last points are sent for road snapping. */
  stop(title?: string): string | null {
    const j = this.journey;
    this.stopWatching();
    if (!j) return null;
    const pausedMs = this.pausedAt ? Date.now() - this.pausedAt : 0;
    const area = j.area ?? areaFromProperties(j.points, this.store.getState().properties);
    this.save({ ...j, status: 'saved', endedAt: Date.now(), pausedMs: (j.pausedMs ?? 0) + pausedMs, title: title || j.title, area }, true);
    const id = j.id;
    this.journeyId = null; this.pausedAt = null; this.fix = null;
    this.emit();
    void this.snap(id, true);
    return id;
  }

  /** JoyChange007 "Continue this journey": the saved card records again, keeping its marks; the break is not counted.
   *  Refused (false) while another journey is recording or paused. */
  continueJourney(id: string): boolean {
    if (this.journey) return false;
    const j = this.store.getState().journeys.find(x => x.id === id);
    if (!j) return false;
    this.journeyId = id;
    this.pausedAt = null;
    this.save(continued(j, Date.now()), true);
    this.listen();
    return true;
  }

  // ---------- JoyChange007: road snapping in batches ----------
  private snapping = false;
  private snapFails = 0;
  /** Sends the next full batch of thinned points (or, at Stop, whatever is left) to the Roads API. A failure keeps the
   *  plain GPS line; after three failures in a row nothing more is sent until the app restarts (no wasted requests). */
  private async snap(id: string, final = false) {
    if (this.snapping || this.snapFails >= 3) return;
    const key = config(this.store.getState().settings).googleMapsApiKey;
    if (!key) return;
    const get = () => (this.pending?.id === id ? this.pending : this.store.getState().journeys.find(x => x.id === id));
    this.snapping = true;
    try {
      for (let guard = 0; guard < 50; guard++) {
        const j = get();
        if (!j) return;
        const b = nextSnapBatch(thinPoints(j.points), j.snapDone ?? 0, final);
        if (!b) return;
        let res;
        try { res = await snapToRoads(key, b.points); this.snapFails = 0; } catch { this.snapFails++; return; }
        const cur = get();
        if (!cur) return;
        const next = { ...cur, snapped: mergeSnapped(cur.snapped ?? [], res, (j.snapDone ?? 0) - b.from), snapDone: b.from + b.points.length };
        if (id === this.journeyId) this.save(next, true); else { this.store.upsert('journeys', next); this.emit(); }
        if (!final) return;
      }
    } finally { this.snapping = false; }
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
        if (r.result === 'added') { this.save(r.journey); this.onPoint?.(r.journey); void this.snap(r.journey.id); } else this.emit();
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
