// MainForAdmin-B: the sign-in log for Admin EAB's Login Security (kept 7 years in eab_login_log).
// Events are queued on the phone and sent with the signed-in account (eab_log_login): failed sign-ins and lockouts
// happen BEFORE anyone is signed in, so they wait for the next successful sign-in on this phone.
// GPS (JoyChange005-Main Part5 Change E): only at sign-in and app opening, and ONLY when the agent already allowed
// location (this never shows the permission question; that is asked the first time a location map is used).
import type { Store } from '../data/store';
import type { SyncConfig } from '../data/sync';
import { rpc } from '../team/api';
import { BUILD } from '../native/updates';
import { isNative, isWebsite, platform } from '../native/native';

export type LoginEvent = 'sign_in' | 'app_open' | 'sign_in_failed' | 'locked_out' | 'forced_out' | 'blocked' | 'sign_out';
export interface QueuedLogin {
  event: LoginEvent; at: string; device_id: string; device: string; platform: string; app_version: string;
  lat?: number; lng?: number; acc?: number; detail?: string;
}

const QUEUE = 'eab-login-queue';
const DEVICE = 'eab-device-id';
export const MAX_QUEUE = 300;
const BATCH = 200;

const readQ = (): QueuedLogin[] => { try { const v = JSON.parse(localStorage.getItem(QUEUE) ?? '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
const writeQ = (q: QueuedLogin[]) => { try { localStorage.setItem(QUEUE, JSON.stringify(q.slice(-MAX_QUEUE))); } catch { /* storage full or blocked */ } };
export const queuedLogins = () => readQ();

/** A random name for this phone (never a person's data), kept for good. */
export function deviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE);
    if (!id) { id = `d-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`; localStorage.setItem(DEVICE, id); }
    return id;
  } catch { return 'unknown'; }
}

/** Android / iOS / tablet / web browser / desktop (the laptop website), as Admin EAB's filters use them. */
export function platformOf(ua: string, native = isNative(), plat = platform(), website = isWebsite()): string {
  if (native) return plat === 'android' && !/Mobile/i.test(ua) ? 'tablet' : plat;
  if (website) return 'desktop';
  if (/iPad|Tablet/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) return 'tablet';
  return 'web';
}
/** Short phone description from the browser's own text, e.g. "Android 14; SM-S918B". No personal data. */
export function deviceOf(ua: string): string {
  const a = /Android ([\d.]+);\s*([^;)]+)/.exec(ua);
  if (a) return `Android ${a[1]}; ${a[2].trim()}`.slice(0, 200);
  const i = /(iPhone|iPad).*?OS ([\d_]+)/.exec(ua);
  if (i) return `${i[1]} iOS ${i[2].replace(/_/g, '.')}`;
  return (/Windows|Mac OS X|Linux|CrOS/.exec(ua)?.[0] ?? 'unknown').slice(0, 200);
}

/** The position, only when location was allowed before. Never asks. Gives up after a few seconds. */
export async function positionIfAllowed(): Promise<{ lat: number; lng: number; acc: number } | null> {
  try {
    if (typeof navigator === 'undefined' || !navigator.geolocation || !navigator.permissions?.query) return null;
    const p = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
    if (p.state !== 'granted') return null;
    return await new Promise(res => navigator.geolocation.getCurrentPosition(
      x => res({ lat: x.coords.latitude, lng: x.coords.longitude, acc: Math.round(x.coords.accuracy) }),
      () => res(null), { maximumAge: 5 * 60_000, timeout: 8000, enableHighAccuracy: false }));
  } catch { return null; }
}

/** Adds an event to the queue. Sign-in and app-opening events carry the position when location is already allowed. */
export async function logLogin(event: LoginEvent, detail?: string): Promise<void> {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const e: QueuedLogin = { event, at: new Date().toISOString(), device_id: deviceId(), device: deviceOf(ua), platform: platformOf(ua), app_version: BUILD.version, detail: detail?.slice(0, 200) };
  if (event === 'sign_in' || event === 'app_open') {
    const pos = await positionIfAllowed();
    if (pos) Object.assign(e, pos);
  }
  writeQ([...readQ(), e]);
}

/** Sends the queue with the signed-in account. Nothing is lost when offline or when the database is older (kept for later). */
export async function flushLoginLog(store: Store, cfg: SyncConfig): Promise<number> {
  const q = readQ();
  if (!q.length || !store.getState().meta.syncSession) return 0;
  const batch = q.slice(0, BATCH);
  try {
    await rpc<number>(store, cfg, 'eab_log_login', { p_events: batch });
    writeQ(readQ().slice(batch.length));
    return batch.length;
  } catch { return 0; }
}
