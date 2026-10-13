// The save/sync state of ONE record, for the chip on its detail screen. The words never claim more than is true:
//   draft     there is a draft for this record that has not been saved with the Save button yet
//   phone     saved on this phone (signed out, or this record never went through a sync yet)
//   waiting   saved on this phone, waiting for the next sync
//   syncing   being sent right now
//   synced    the cloud accepted exactly this content
//   conflict  differs from the cloud's copy and needs the person's decision (both versions kept)
//   failed    the last send did not work (or was refused); the record is kept on this phone and will be tried again
import type { Store } from './store';
import type { CollectionName } from './types';
import { recordHash } from './hash';

export type RecordState = 'draft' | 'phone' | 'waiting' | 'syncing' | 'synced' | 'conflict' | 'failed';

export function recordStateOf(store: Store, c: CollectionName, id: string): RecordState {
  const m = store.getState().meta;
  const key = `${c}:${id}`;
  if ((m.conflicts ?? []).some(x => x.key === key)) return 'conflict';
  const dirty = m.dirty.includes(key);
  if ((m.recErrors ?? {})[key] || (store.writeFailed && dirty)) return 'failed';
  if (store.getDraft(key)) return 'draft';
  if (!m.syncSession) return 'phone';
  if (dirty) {
    if (store.syncing && store.isInflight(key)) return 'syncing';
    return m.syncError ? 'failed' : 'waiting';
  }
  const rec = (store.getState()[c] as unknown as { id: string }[]).find(x => x.id === id);
  const base = store.getBase(key);
  if (rec && base && !base.deleted && base.hash === recordHash(rec)) return 'synced';
  return 'phone';
}
