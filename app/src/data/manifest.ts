// The data shape that the approved single backup (Supabase + Google Drive ZIP) will carry. This file only DESCRIBES and
// COLLECTS the data in a versioned, secret-free form; it is not a backup system and it restores nothing. (Phase 2 asked
// for the data structures to be ready, not for a second backup or a restore.)
//
// Included: records (real ones only, never sample data) and their history, deleted records still recoverable, the
// cloud-version bookkeeping (for safe reconciliation after a restore), pending-sync state and open conflicts, the file
// relationships (record, id, checksum, cloud path) and the schema/data version.
// Never included: sign-in tokens, the Supabase keys, API keys, or the pictures' bytes (those are the ZIP's job; here only
// their ids and checksums are listed).
import type { Store } from './store';
import { fileRefs } from './fileRefs';
import { COLLECTIONS, CollectionName, Conflict } from './types';

/** Bump when the shape below changes in a way a restore must know about. */
export const MANIFEST_VERSION = 1;
/** Version of the phone's own storage layout (records / files / local areas). */
export const LOCAL_SCHEMA_VERSION = 2;

export interface ManifestFile { id: string; collection: CollectionName; recordId: string; kind: string; name?: string; sha256?: string; bytes?: number; status: string; cloudPath?: string }
export interface BackupManifest {
  format: 'eab-backup-manifest';
  version: number;
  localSchema: number;
  createdAt: number;
  workspaceId?: string;
  deviceId?: string;
  lastSeq?: number;
  records: Record<string, unknown[]>;
  deleted: { key: string; deletedAt: number; pendingInCloud: boolean }[];
  revisions: Record<string, { at: number; source: string; data: unknown }[]>;
  cloudVersions: Record<string, { rev: number; hash: string; deleted: boolean }>;
  pending: { dirty: string[]; tombstones: string[]; conflicts: Conflict[]; errors: Record<string, string> };
  files: ManifestFile[];
}

export async function buildBackupManifest(store: Store, now = Date.now()): Promise<BackupManifest> {
  const st = store.getState();
  const m = st.meta;
  const records: Record<string, unknown[]> = {};
  for (const c of COLLECTIONS) records[c] = (st[c] as unknown as { sample?: boolean }[]).filter(r => !r.sample);
  const revisions: BackupManifest['revisions'] = {};
  for (const { key, value } of await store.listLocal('rev:')) revisions[key.slice(4)] = (value as { at: number; source: string; data: unknown }[]).map(r => ({ at: r.at, source: r.source, data: r.data }));
  const deleted = (await store.listLocal('del:')).map(({ key, value }) => ({ key: key.slice(4), deletedAt: (value as { at: number }).at, pendingInCloud: m.tombstones.includes(key.slice(4)) }));
  const cloudVersions: BackupManifest['cloudVersions'] = {};
  for (const k of store.baseKeys()) { const b = store.getBase(k)!; cloudVersions[k] = { rev: b.rev, hash: b.hash, deleted: b.deleted }; }
  const ws = m.syncSession?.workspaceId ?? m.syncWorkspaceId;
  const files: ManifestFile[] = fileRefs(st).map(r => {
    const e = store.fileEntry(r.fileId);
    return { id: r.fileId, collection: r.collection, recordId: r.recordId, kind: r.kind, name: r.name, sha256: e?.sha256, bytes: e?.bytes, status: e?.status ?? 'local', cloudPath: ws && e?.sha256 ? `${ws}/${e.sha256}` : undefined };
  });
  return {
    format: 'eab-backup-manifest', version: MANIFEST_VERSION, localSchema: LOCAL_SCHEMA_VERSION, createdAt: now,
    workspaceId: ws, deviceId: m.deviceId, lastSeq: m.lastSeq,
    records, deleted, revisions, cloudVersions,
    pending: { dirty: [...m.dirty], tombstones: [...m.tombstones], conflicts: structuredClone(m.conflicts ?? []), errors: { ...(m.recErrors ?? {}) } },
    files,
  };
}

/** Shape check a later restore can run before touching anything. Returns the problems found (empty = readable). */
export function checkManifest(x: unknown): string[] {
  const p: string[] = [];
  const m = x as Partial<BackupManifest> | null;
  if (!m || typeof m !== 'object') return ['not an object'];
  if (m.format !== 'eab-backup-manifest') p.push('wrong format');
  if (typeof m.version !== 'number') p.push('no version'); else if (m.version > MANIFEST_VERSION) p.push(`newer than this app understands (${m.version})`);
  if (!m.records || typeof m.records !== 'object') p.push('no records');
  for (const k of ['deleted', 'files']) if (!Array.isArray((m as Record<string, unknown>)[k])) p.push(`no ${k}`);
  if (!m.pending || !Array.isArray(m.pending.dirty)) p.push('no pending state');
  return p;
}
