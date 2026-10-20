// JoyChange002 Change 25: push notifications (Firebase Cloud Messaging) for Team Workspace invitations.
//  - When someone is signed in on the Android app, the phone asks for permission to show notifications, gets its push
//    address from Firebase and registers it for that person (eab_push_register). Signing out removes it.
//  - After an invitation is sent, accepted or declined, the app asks the send-push Edge Function to tell the other phone.
//    That message arrives even when the app is closed; tapping it opens the app, which shows the invitation pop-up.
//  - While the app is open, a push message makes it look for invitations at once (Change 24: the pop-up straight away).
// Everything here is best effort: if push is not set up (no Firebase key on the server, an older APK, permission
// refused), invitations still appear the next time the app looks (on opening, on returning to it, and every 30 s).
import type { Store } from '../data/store';
import type { SyncConfig } from '../data/sync';
import { configured, fresh, supabaseHeaders } from '../data/sync';
import { APP_ID, isNative, platform, plugin, pluginMissing } from './native';
import { usage } from '../usage/logger';

type FetchFn = typeof fetch;
interface PushPlugin {
  checkPermissions(): Promise<{ receive: string }>;
  requestPermissions(): Promise<{ receive: string }>;
  register(): Promise<void>;
  createChannel?(c: { id: string; name: string; description?: string; importance?: number; visibility?: number }): Promise<void>;
  addListener(ev: string, fn: (x: any) => void): Promise<{ remove: () => Promise<void> }>;   // eslint-disable-line @typescript-eslint/no-explicit-any
  removeAllListeners(): Promise<void>;
}
const push = () => plugin<PushPlugin>('PushNotifications');
export const pushAvailable = () => isNative() && platform() === 'android' && !pluginMissing('PushNotifications') && !!push();

async function rpc(cfg: SyncConfig, store: Store, fn: string, body: Record<string, unknown>, fetchFn: FetchFn) {
  const s0 = store.getState().meta.syncSession;
  if (!configured(cfg) || !s0) return false;
  const s = await fresh(cfg, s0, fetchFn);
  if (s !== s0) store.setSingleton('meta', { syncSession: s });
  const r = await fetchFn(`${cfg.supabaseUrl}/rest/v1/rpc/${fn}`, { method: 'POST', headers: supabaseHeaders(cfg, s.accessToken), body: JSON.stringify(body) });
  return r.ok;
}

/** Saves this phone's push address for the signed-in person (only when it or the person changed). */
export async function registerToken(store: Store, cfg: SyncConfig, token: string, lang: string, fetchFn: FetchFn = fetch): Promise<boolean> {
  const st = store.getState();
  const uid = st.meta.syncSession?.userId;
  if (!uid || !token) return false;
  const cur = st.meta.push;
  if (cur && cur.token === token && cur.userId === uid && cur.lang === lang) return true;
  try {
    const ok = await rpc(cfg, store, 'eab_push_register', { p_token: token, p_app: APP_ID, p_platform: platform() === 'ios' ? 'ios' : 'android', p_lang: lang }, fetchFn);
    if (ok) store.setSingleton('meta', { push: { token, userId: uid, lang } });
    return ok;
  } catch { return false; }
}

/** Signing out: this phone stops getting the person's notifications. Called before the session is forgotten. */
export async function unregisterToken(store: Store, cfg: SyncConfig, fetchFn: FetchFn = fetch): Promise<void> {
  const cur = store.getState().meta.push;
  if (!cur) return;
  try { await rpc(cfg, store, 'eab_push_unregister', { p_token: cur.token }, fetchFn); } catch { /* offline: the server drops it when Firebase reports it unused */ }
  store.setSingleton('meta', { push: undefined });
}

/** Asks the server to tell the other person's phone (after sending or answering an invitation). Never throws. */
export async function sendPush(store: Store, cfg: SyncConfig, kind: 'invite' | 'answer', inviteId?: string, fetchFn: FetchFn = fetch): Promise<void> {
  const s0 = store.getState().meta.syncSession;
  if (!configured(cfg) || !s0) return;
  try {
    const s = await fresh(cfg, s0, fetchFn);
    await fetchFn(`${cfg.supabaseUrl}/functions/v1/send-push`, { method: 'POST', headers: supabaseHeaders(cfg, s.accessToken), body: JSON.stringify({ kind, invite_id: inviteId }) });
  } catch { /* push is a bonus: the invitation is still shown when the other app looks */ }
}

let started = false;
/** Starts push on this phone once per opening of the app. `onMessage` runs when a message arrives or is tapped. */
export async function startPush(store: Store, cfg: SyncConfig, lang: () => string, onMessage: () => void): Promise<'on' | 'off' | 'refused'> {
  const p = push();
  if (!pushAvailable() || !p) return 'off';
  if (started) return 'on';
  started = true;
  try {
    let perm = await p.checkPermissions();
    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') perm = await p.requestPermissions();
    if (perm.receive !== 'granted') { started = false; return 'refused'; }
    // Android 8+: invitations get their own notification channel (shown with sound, on the lock screen).
    await p.createChannel?.({ id: 'invites', name: 'Team Workspace invitations', importance: 4, visibility: 1 }).catch(() => undefined);
    await p.addListener('registration', (t: { value: string }) => { void registerToken(store, cfg, t.value, lang()); });
    await p.addListener('registrationError', () => { /* no Google Play services or no internet: try again next opening */ started = false; usage.error('push.registration'); });
    await p.addListener('pushNotificationReceived', () => { usage.push('push.received'); onMessage(); });
    await p.addListener('pushNotificationActionPerformed', () => { usage.push('push.opened'); onMessage(); });
    await p.register();
    return 'on';
  } catch { started = false; return 'off'; }
}
