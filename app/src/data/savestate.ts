// What the status line says about the person's latest changes. Three different things can be true and they are never
// mixed up: saved on this phone (always the first step), syncing to the cloud, and synced (the cloud answered).
//   failed-phone  the phone's own storage refused a write: the change may not be saved at all
//   failed-sync   the change is saved on the phone, but the last cloud sync failed
//   syncing       a cloud sync is running now
//   conflict      a record differs between this phone and the cloud and needs the person's decision (nothing is lost)
//   synced        signed in, nothing waiting (no change, no conflict, no picture/document still to upload), and the last
//                 sync finished well
//   phone         saved on this phone (not signed in, or changes are waiting for the next sync)
import type { Store } from './store';
import { fileRefs } from './fileRefs';

/** Pictures and documents that a saved record uses but the cloud does not have yet. */
export function pendingFileCount(store: Store): number {
  const used = new Set(fileRefs(store.getState()).map(r => r.fileId));
  let n = 0;
  for (const e of store.allFileEntries()) if (used.has(e.id) && !e.removedAt && e.status !== 'uploaded' && e.status !== 'missing') n++;
  return n;
}

export type SaveState = 'phone' | 'syncing' | 'synced' | 'failed-phone' | 'failed-sync' | 'conflict';

export interface SaveInput { writeFailed: boolean; syncing: boolean; signedIn: boolean; waiting: number; syncError?: string; lastSync?: number; conflicts?: number; pendingFiles?: number }

export function saveStateOf(i: SaveInput): SaveState {
  if (i.writeFailed) return 'failed-phone';
  if (i.syncing) return 'syncing';
  if (i.signedIn && i.syncError) return 'failed-sync';
  if (i.signedIn && (i.conflicts ?? 0) > 0) return 'conflict';
  if (i.signedIn && i.waiting === 0 && (i.pendingFiles ?? 0) === 0 && i.lastSync) return 'synced';
  return 'phone';
}

export function saveStateFromStore(store: Store): SaveState {
  const m = store.getState().meta;
  return saveStateOf({ writeFailed: store.writeFailed, syncing: store.syncing, signedIn: !!m.syncSession, waiting: m.dirty.length, syncError: m.syncError, lastSync: m.lastSync, conflicts: (m.conflicts ?? []).length, pendingFiles: pendingFileCount(store) });
}
