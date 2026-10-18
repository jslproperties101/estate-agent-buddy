// Change 25: phone notifications for Team Workspace invitations while the app is closed (Firebase Cloud Messaging).
//  - The installed app asks Google for this phone's FCM address and gives it to the cloud (eab_push_register). The address
//    is linked to the person signed in; signing out removes it (eab_push_unregister).
//  - After this phone sends, accepts or declines an invitation, it asks the notify-invite function to tell the other agent
//    (supabase/functions/notify-invite). The database decides whom to tell and allows each announcement once.
//  - A notification that arrives while the app is on screen is not shown by Android; the app looks for invitations at once
//    instead (the pop-up appears). Tapping a notification opens the app, which looks for invitations as it opens.
// Only in an APK built WITH Firebase settings (BUILD.push): without them Google's library stops the app at start, so a
// build without the google-services.json secret never touches the push plugin (and Change 13's checks still work).
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Store } from '../data/store';
import { fresh, supabaseHeaders, type Session, type SyncConfig } from '../data/sync';
import { plugin, platform } from './native';
import { BUILD } from './updates';

type FetchFn = typeof fetch;
/** Registered again after this long, so the cloud never holds a stale address for long. */
export const REREGISTER_MS = 7 * 24 * 3600_000;

/** True in an installed app whose build has the Firebase settings. */
export const pushBuilt = () => !!BUILD.push && (platform() === 'android' || platform() === 'ios');
const push = (): any => (pushBuilt() ? plugin('PushNotifications') : undefined);

/** The signed-in session with a sign-in token that is still valid (renewed and saved when needed). */
async function session(store: Store, cfg: SyncConfig, fetchFn: FetchFn): Promise<Session | undefined> {
  const s0 = store.getState().meta.syncSession;
  if (!s0) return undefined;
  const s = await fresh(cfg, s0, fetchFn);
  if (s !== s0) store.setSingleton('meta', { syncSession: s });
  return s;
}

let currentToken: string | undefined;
/** This phone's FCM address once Google has given it (for tests and sign-out). */
export const pushToken = () => currentToken;
export const setPushTokenForTest = (t: string | undefined) => { currentToken = t; };

/** True when this phone receives invitation alerts by push: Change 13's own phone notifications are then not shown
 *  (otherwise the same invitation would be announced twice: once by Google while closed, once by the app on opening). */
export function pushActive(store: Store, now = Date.now()): boolean {
  const p = store.getState().meta.push;
  const s = store.getState().meta.syncSession;
  return !!p && !!s && p.userId === s.userId && now - p.at < 4 * REREGISTER_MS && (pushBuilt() || !!p.test);
}

/** Gives the address to the cloud for the signed-in person (only when it changed, the person changed, or a week passed). */
export async function registerToken(store: Store, cfg: SyncConfig, token: string, lang: string, fetchFn: FetchFn = fetch, now = Date.now(), test = false): Promise<boolean> {
  currentToken = token;
  const p = store.getState().meta.push;
  const uid = store.getState().meta.syncSession?.userId;
  if (!uid) return false;
  if (p && p.token === token && p.userId === uid && p.lang === lang && now - p.at < REREGISTER_MS) return true;
  try {
    const s = await session(store, cfg, fetchFn);
    if (!s) return false;
    const r = await fetchFn(`${cfg.supabaseUrl}/rest/v1/rpc/eab_push_register`, { method: 'POST', headers: supabaseHeaders(cfg, s.accessToken),
      body: JSON.stringify({ p_token: token, p_platform: platform() === 'ios' ? 'ios' : 'android', p_lang: lang }) });
    if (!r.ok) return false;                        // e.g. the SQL is not applied yet: Change 13's checks keep working
    store.setSingleton('meta', { push: { token, userId: s.userId, lang, at: now, ...(test ? { test: true } : {}) } });
    return true;
  } catch { return false; }
}

/** Called before signing out (with the session being ended): this phone stops receiving the person's invitation alerts. */
export async function unregisterPush(cfg: SyncConfig, s: Session, fetchFn: FetchFn = fetch): Promise<void> {
  const token = currentToken;
  if (!token) return;
  try { await fetchFn(`${cfg.supabaseUrl}/rest/v1/rpc/eab_push_unregister`, { method: 'POST', headers: supabaseHeaders(cfg, s.accessToken), body: JSON.stringify({ p_token: token }) }); } catch { /* offline: the address moves to the next person who signs in */ }
}

/** Asks the notify-invite function to tell the other agent. Never fails the action that called it. */
export async function announce(store: Store, cfg: SyncConfig, inviteId: string, kind: 'invite' | 'answer', fetchFn: FetchFn = fetch): Promise<boolean> {
  try {
    const s = await session(store, cfg, fetchFn);
    if (!s) return false;
    const r = await fetchFn(`${cfg.supabaseUrl}/functions/v1/notify-invite`, { method: 'POST', headers: supabaseHeaders(cfg, s.accessToken), body: JSON.stringify({ invite_id: inviteId, kind }) });
    return r.ok;
  } catch { return false; }  // not deployed yet, or offline: the other agent still sees it the next time their app looks
}

export interface PushHooks {
  /** The cloud settings and app language, or undefined when not signed in. */
  current: () => { cfg: SyncConfig; lang: string } | undefined;
  /** A notification arrived while the app is open, or one was tapped: look for invitations now. */
  onInvite: () => void;
}

let started = false;
/** Starts push on the installed app (once). Safe to call when push is not built in: it does nothing. */
export async function startPush(store: Store, hooks: PushHooks): Promise<'off' | 'denied' | 'started'> {
  const p = push();
  if (!p || started) return started ? 'started' : 'off';
  try {
    let perm = await p.checkPermissions();
    if (perm?.receive === 'prompt' || perm?.receive === 'prompt-with-rationale') perm = await p.requestPermissions();
    if (perm?.receive !== 'granted') return 'denied';
    started = true;
    await p.addListener('registration', (t: { value: string }) => {
      const c = hooks.current();
      currentToken = t.value;
      if (c) void registerToken(store, c.cfg, t.value, c.lang);
    });
    await p.addListener('registrationError', () => { /* no push on this phone: Change 13's checks still work */ });
    await p.addListener('pushNotificationReceived', (n: { data?: Record<string, string> }) => { if (n?.data?.type === 'team-invite') hooks.onInvite(); });
    await p.addListener('pushNotificationActionPerformed', (a: { notification?: { data?: Record<string, string> } }) => { if (a?.notification?.data?.type === 'team-invite') hooks.onInvite(); });
    await p.register();
    return 'started';
  } catch { return 'off'; }
}

/** After signing in (or a different person signs in), the known address is given to the cloud for that person. */
export function registerKnownToken(store: Store, hooks: PushHooks) {
  const c = hooks.current();
  if (c && currentToken) void registerToken(store, c.cfg, currentToken, c.lang);
}
