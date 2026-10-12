// Reminder notifications.
//  - Android app (Capacitor with @capacitor/local-notifications): reminders are scheduled on the phone, so they
//    appear even when the app is closed. Detected at run time; nothing to configure in this code.
//  - Browser: a notification is shown while the app is open (when the person allows it); otherwise the reminder
//    still appears inside the app.
/* eslint-disable @typescript-eslint/no-explicit-any */

export type Permission = 'granted' | 'denied' | 'default' | 'unsupported';

import { plugin } from '../native/native';

const native = (): any => plugin('LocalNotifications');

export function permission(): Permission {
  if (native()) return 'granted';
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission as Permission;
}

export async function requestPermission(): Promise<Permission> {
  const n = native();
  if (n) { try { const r = await n.requestPermissions(); return r?.display === 'granted' ? 'granted' : 'denied'; } catch { return 'denied'; } }
  if (typeof Notification === 'undefined') return 'unsupported';
  try { return (await Notification.requestPermission()) as Permission; } catch { return 'denied'; }
}

/** Shows a notification now (browser). Returns false when only the in-app reminder can be shown. */
export async function showNow(title: string, body: string): Promise<boolean> {
  if (permission() !== 'granted' || native()) return false;
  try {
    const reg = await navigator.serviceWorker?.getRegistration?.();
    if (reg) { await reg.showNotification(title, { body, tag: title }); return true; }
    new Notification(title, { body, tag: title });
    return true;
  } catch { return false; }
}

export interface Scheduled { id: number; at: number; title: string; body: string }

/** Android app: replaces the phone's scheduled reminders with the given list. Returns false in the browser. */
export async function scheduleNative(list: Scheduled[]): Promise<boolean> {
  const n = native();
  if (!n) return false;
  try {
    const pending = await n.getPending();
    if (pending?.notifications?.length) await n.cancel({ notifications: pending.notifications.map((x: any) => ({ id: x.id })) });
    if (list.length) await n.schedule({ notifications: list.slice(0, 60).map(x => ({ id: x.id, title: x.title, body: x.body, schedule: { at: new Date(x.at), allowWhileIdle: true } })) });
    return true;
  } catch { return false; }
}

/** Stable small number for a reminder key (Android notification ids are 32-bit integers). */
export function idFor(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return Math.abs(h) % 2_000_000_000;
}
