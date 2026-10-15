// Change 010 E: audit-history export copies kept inside the app (on this phone), Saved Exports and Deleted Exports.
//  - A saved copy stays until it is deleted; nothing expires. Deleting a copy never deletes the audit history.
//  - Delete moves it to Deleted Exports (recoverable); only "Delete permanently" removes it.
//  - Owner decision (15 Oct): a person may delete (and permanently delete, and restore) the export copies THEY made,
//    also in bulk. That never deletes the record, its audit history or anyone else's copies. Opening a copy still
//    needs current access to its records.
//  - Permissions are checked again at the moment of every action; files that are no longer allowed are named, and the
//    person decides whether to go on with the rest.
//  - A deletion that fails is tried once more; if it fails again the file is kept and named, so it can be retried.
//  - Every deletion (single or bulk) is recorded in the audit history of the records concerned.
import type { Store } from '../data/store';
import type { AppState, CollectionName } from '../data/types';
import { levelOf, myId } from '../team/access';
import type { ExportFormat, ExportMode } from './report';

export interface SavedExport {
  ref: string; fileName: string; format: ExportFormat; mode: ExportMode;
  /** Record IDs as shown (P1001…), and the records themselves ("collection:id"). */
  recordIds: string[]; recordKeys: string[];
  /** Owner (user id) of each record at export time ("local" = this phone's own, not signed in). */
  ownerIds: string[];
  exporterId: string; exporterLabel: string;
  at: number; fileId: string; bytes: number;
  deletedAt?: number; deletedById?: string; deletedByLabel?: string;
}
const KEY = (ref: string) => `export:${ref}`;

export async function listExports(store: Store): Promise<SavedExport[]> {
  return (await store.listLocal('export:')).map(r => r.value as SavedExport);
}

/** Keeps a finished report in the app. */
export async function keepExport(store: Store, meta: Omit<SavedExport, 'fileId' | 'bytes'>, blob: Blob): Promise<SavedExport> {
  const fileId = await store.putFile(blob);
  const e: SavedExport = { ...meta, fileId, bytes: blob.size };
  await store.putLocalNow(KEY(e.ref), e);
  store.touchExports();
  return e;
}

const isMe = (state: AppState, id: string) => id === myId(state) || id === 'local';
/** A person may delete, permanently delete or restore the export copies they made themselves. */
export const canDeleteExport = (state: AppState, e: SavedExport) => isMe(state, e.exporterId);
/** Opening or restoring needs current access to every record in it (or being their owner). */
export const canAccessExport = (state: AppState, e: SavedExport) => e.recordKeys.every(k => { const i = k.indexOf(':'); return !!levelOf(state, k.slice(0, i) as CollectionName, k.slice(i + 1)); });

export interface BulkResult { done: string[]; failed: string[]; refused: string[] }
type Op = 'delete' | 'restore' | 'purge';
const allowed = (state: AppState, e: SavedExport, _op: Op) => canDeleteExport(state, e);

/** Which of the selected files the person may no longer act on (checked now). */
export async function refusedFor(store: Store, refs: string[], op: Op): Promise<SavedExport[]> {
  const all = await listExports(store);
  const st = store.getState();
  return all.filter(e => refs.includes(e.ref) && !allowed(st, e, op));
}

/** Runs one step with one automatic retry. */
async function twice(f: () => Promise<void>): Promise<boolean> {
  try { await f(); return true; } catch { try { await f(); return true; } catch { return false; } }
}

/** Delete / restore / delete permanently, for one file or many. Permissions are checked again here; refused files are
 *  never touched. `fault` lets tests make a step fail. */
export async function bulk(store: Store, refs: string[], op: Op, fault?: (ref: string, attempt: number) => boolean): Promise<BulkResult> {
  const st = store.getState();
  const me = store.actor();
  const res: BulkResult = { done: [], failed: [], refused: [] };
  const byRef = new Map((await listExports(store)).map(e => [e.ref, e]));
  const tries = new Map<string, number>();
  const now = Date.now();
  for (const ref of refs) {
    const e = byRef.get(ref);
    if (!e) { res.failed.push(ref); continue; }
    if (!allowed(st, e, op)) { res.refused.push(ref); continue; }
    const ok = await twice(async () => {
      const n = (tries.get(ref) ?? 0) + 1; tries.set(ref, n);
      if (fault?.(ref, n)) throw new Error('simulated failure');
      if (op === 'delete') await store.putLocalNow(KEY(ref), { ...e, deletedAt: now, deletedById: me.actorId, deletedByLabel: me.actorName || me.actorEmail || '' });
      else if (op === 'restore') { const { deletedAt: _a, deletedById: _b, deletedByLabel: _c, ...rest } = e; void _a; void _b; void _c; await store.putLocalNow(KEY(ref), rest); }
      else { await store.removeFileNow(e.fileId); await store.removeLocalNow(KEY(ref)); }
    });
    (ok ? res.done : res.failed).push(ref);
  }
  // Record every deletion in the audit history of the records concerned: who, when, how many files, which references.
  if (op !== 'restore' && res.done.length) {
    const byKey = new Map<string, string[]>();
    for (const ref of res.done) for (const k of byRef.get(ref)!.recordKeys) { if (!byKey.has(k)) byKey.set(k, []); byKey.get(k)!.push(ref); }
    for (const [k, list] of byKey) {
      const i = k.indexOf(':');
      store.appendAudit(k, [{ id: `a-${crypto.randomUUID?.() ?? `${now}-${Math.random()}`}`, collection: k.slice(0, i), recordId: k.slice(i + 1), ...store.actor(), action: 'export',
        detail: { event: op === 'delete' ? 'export_copy_deleted' : 'export_copy_purged', count: list.length, refs: list, bulk: refs.length > 1 }, at: store.auditNow() }], true);
    }
  }
  store.touchExports();
  return res;
}
