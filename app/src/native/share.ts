// JoyChange010-04: the phone side of "share into the app". The app's own Android plugin EabShare (scripts/android-setup.mjs)
// receives what the agent shares from WhatsApp or another app, copies each file into the app's private cache and keeps a
// list. Here the app takes that list, reads each copied file, puts it in the Shared Documents tray and asks the plugin to
// delete its cache copies. Works when the app was closed (the list waits) and when it is open (a "shared" event).
// In a browser, or with an older APK without the plugin, nothing happens.
import { Capacitor } from '@capacitor/core';
import type { Store } from '../data/store';
import { addShared, type AddResult, type Incoming } from '../share/inbox';
import { isNative, plugin, pluginMissing } from './native';

export interface NativeShared { name?: string; mime?: string; size?: number; path?: string; tooBig?: boolean }
interface SharePlugin {
  take(): Promise<{ files: NativeShared[] }>;
  remove(o: { paths: string[] }): Promise<void>;
  addListener(ev: 'shared', fn: () => void): Promise<{ remove: () => Promise<void> }>;
}
const share = () => plugin<SharePlugin>('EabShare');
export const shareAvailable = () => isNative() && !pluginMissing('EabShare') && !!share();

type Reader = (path: string) => Promise<Blob>;
const readNative: Reader = async path => {
  const r = await fetch(Capacitor.convertFileSrc(path));
  if (!r.ok) throw new Error(`read ${r.status}`);
  return r.blob();
};

/** Moves the files the plugin received into the tray. Exported with its parts injectable for tests. */
export async function pullShared(store: Store, p: Pick<SharePlugin, 'take' | 'remove'>, read: Reader = readNative): Promise<AddResult & { unreadable: number }> {
  const { files } = await p.take();
  const incoming: Incoming[] = []; const done: string[] = []; const tooBig: string[] = []; let unreadable = 0;
  for (const f of files ?? []) {
    if (f.tooBig) { tooBig.push(f.name ?? ''); continue; }
    if (!f.path) { unreadable++; continue; }
    try { incoming.push({ name: f.name, mime: f.mime, blob: await read(f.path) }); }
    catch { unreadable++; }
    done.push(f.path);
  }
  const res = incoming.length ? await addShared(store, incoming) : { added: 0, tooBig: [], full: 0 };
  if (done.length) { try { await p.remove({ paths: done }); } catch { /* the cache is emptied by Android when space runs low */ } }
  return { ...res, tooBig: [...tooBig, ...res.tooBig], unreadable };
}

let started = false;
/** Starts the receiver once per opening of the app. `onArrived` runs when files reached the tray (to open it). */
export async function startShareReceiver(store: Store, onArrived: (r: AddResult & { unreadable: number }) => void): Promise<boolean> {
  const p = share();
  if (!shareAvailable() || !p || started) return started;
  started = true;
  const pull = async () => {
    try { const r = await pullShared(store, p); if (r.added || r.tooBig.length || r.full || r.unreadable) onArrived(r); }
    catch { /* nothing waiting, or the plugin is busy copying: the "shared" event follows */ }
  };
  try { await p.addListener('shared', () => { void pull(); }); } catch { /* older plugin */ }
  await pull();
  return true;
}
