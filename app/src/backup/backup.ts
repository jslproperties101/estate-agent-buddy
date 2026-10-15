// Whole-app backup and protected restore.
//
// A backup is one ZIP file: manifest.json (all real records, history, deleted records, the profile, remembered dropdown
// values, the cloud-version bookkeeping and the list of files with their SHA-256) plus files/<id> for every picture
// and document a record uses. It never contains sign-in tokens, the Supabase keys, the Maps key or the expert URL, and
// never sample data.
//
// Restore is protected, in this order:
//   1. The file is read and checked end to end (ZIP checksums, manifest shape, version, every file's SHA-256).
//      One bad byte refuses the whole restore: nothing is changed.
//   2. Workspace guard: a backup from another workspace is refused; a backup that names a workspace is refused on a
//      phone that holds real records of unknown ownership. Records of two teams are never mixed.
//   3. A safety copy of the phone's present records is stored first (the latest three are kept).
//   4. Records are applied as ordinary edits (source "restore"), so the version replaced is kept in each record's
//      history and the change syncs like any other edit. Nothing is deleted by a restore: records that are only on the
//      phone stay. Mode "missing" (default) only brings back records the phone does not have; mode "all" also
//      replaces records whose content differs from the backup.
import type { Store } from '../data/store';
import { buildBackupManifest, checkManifest, BackupManifest, LOCAL_SCHEMA_VERSION } from '../data/manifest';
import { fileRefs } from '../data/fileRefs';
import { COLLECTIONS, CollectionName, Profile, OptionLists } from '../data/types';
import { recordHash, sha256Hex } from '../data/hash';
import { makeZip, readZip } from './zip';
import { BUILD } from '../native/updates';

export const BACKUP_FORMAT = 'eab-backup-zip';
export interface PackageManifest extends BackupManifest {
  package: typeof BACKUP_FORMAT;
  app: { version: string; sha: string };
  singletons: { profile: Profile; options: OptionLists };
}

const enc = new TextEncoder();
const dec = new TextDecoder();

/** Every stored file a real record (or the profile) uses. */
function usedFileIds(store: Store): string[] {
  const st = store.getState();
  // Change 010: never the pictures of records another agent shares with me.
  const ids = new Set(fileRefs(st).filter(r => !st.meta.shared?.[`${r.collection}:${r.recordId}`]).map(r => r.fileId));
  for (const k of ['photoFileId', 'cardFrontFileId', 'cardBackFileId'] as const) { const v = st.profile[k]; if (v) ids.add(v); }
  return [...ids];
}

export interface BackupResult { bytes: Uint8Array; fileName: string; records: number; files: number; missingFiles: string[] }

export async function createBackup(store: Store, now = Date.now()): Promise<BackupResult> {
  await store.flush();
  const base = await buildBackupManifest(store, now);
  const st = store.getState();
  const entries: { name: string; data: Uint8Array }[] = [];
  const files: BackupManifest['files'] = [];
  const missing: string[] = [];
  const refs = new Map(fileRefs(st).map(r => [r.fileId, r]));
  for (const id of usedFileIds(store)) {
    const blob = await store.getFile(id);
    const r = refs.get(id);
    if (!blob) { missing.push(id); continue; }
    const data = new Uint8Array(await blob.arrayBuffer());
    files.push({ id, collection: r?.collection ?? ('properties' as CollectionName), recordId: r?.recordId ?? '', kind: r?.kind ?? 'photo', name: r?.name, sha256: await sha256Hex(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer), bytes: data.length, status: 'backup' });
    entries.push({ name: `files/${id}`, data });
  }
  const manifest: PackageManifest = {
    ...base, files, package: BACKUP_FORMAT, app: { version: BUILD.version, sha: BUILD.sha },
    singletons: { profile: structuredClone(st.profile), options: structuredClone(st.options) },
  };
  entries.unshift({ name: 'manifest.json', data: enc.encode(JSON.stringify(manifest)) });
  const d = new Date(now); const p = (n: number) => String(n).padStart(2, '0');
  const records = COLLECTIONS.reduce((n, c) => n + (manifest.records[c]?.length ?? 0), 0);
  return { bytes: makeZip(entries, d), fileName: `EstateAgentBuddy-backup-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.zip`, records, files: files.length, missingFiles: missing };
}

export type Problem = 'not-a-backup' | 'damaged' | 'unsupported' | 'wrong-format' | 'newer-version' | 'file-mismatch' | 'file-missing';
export interface Inspection {
  ok: boolean;
  problems: Problem[];
  manifest?: PackageManifest;
  blobs: Map<string, Uint8Array>;
  counts: Record<string, number>;
  files: number;
}

export async function inspectBackup(bytes: Uint8Array): Promise<Inspection> {
  const out: Inspection = { ok: false, problems: [], blobs: new Map(), counts: {}, files: 0 };
  let entries;
  try { entries = readZip(bytes); } catch (e) { out.problems.push(((e as Error).message as Problem) || 'not-a-backup'); return out; }
  const mf = entries.find(e => e.name === 'manifest.json');
  if (!mf) { out.problems.push('not-a-backup'); return out; }
  let m: PackageManifest;
  try { m = JSON.parse(dec.decode(mf.data)) as PackageManifest; } catch { out.problems.push('damaged'); return out; }
  if (m?.package !== BACKUP_FORMAT) { out.problems.push('not-a-backup'); return out; }
  const shape = checkManifest(m);
  if (shape.some(s => s.startsWith('newer'))) out.problems.push('newer-version');
  else if (shape.length) out.problems.push('wrong-format');
  if (typeof m.localSchema === 'number' && m.localSchema > LOCAL_SCHEMA_VERSION && !out.problems.includes('newer-version')) out.problems.push('newer-version');
  if (out.problems.length) return out;
  for (const e of entries) if (e.name.startsWith('files/')) out.blobs.set(e.name.slice(6), e.data);
  for (const f of m.files) {
    const data = out.blobs.get(f.id);
    if (!data) { out.problems.push('file-missing'); break; }
    if (f.sha256 && (await sha256Hex(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer)) !== f.sha256) { out.problems.push('file-mismatch'); break; }
  }
  out.manifest = m; out.files = m.files.length;
  for (const c of COLLECTIONS) out.counts[c] = (m.records[c] ?? []).length;
  out.ok = out.problems.length === 0;
  return out;
}

export type RestoreMode = 'missing' | 'all';
export type Refusal = 'other-workspace' | 'unknown-owner';
export interface RestorePlan {
  refusal?: Refusal;
  add: { collection: CollectionName; id: string }[];
  replace: { collection: CollectionName; id: string }[];
  kept: number;          // on the phone and left exactly as it is
  files: number;         // files to bring back (not on the phone yet)
}

const wsOf = (store: Store) => store.getState().meta.syncSession?.workspaceId ?? store.getState().meta.syncWorkspaceId;
const hasReal = (store: Store) => COLLECTIONS.some(c => (store.getState()[c] as { sample?: boolean }[]).some(r => !r.sample));

export async function planRestore(store: Store, insp: Inspection, mode: RestoreMode): Promise<RestorePlan> {
  const m = insp.manifest!;
  const plan: RestorePlan = { add: [], replace: [], kept: 0, files: 0 };
  const here = wsOf(store);
  if (m.workspaceId && here && m.workspaceId !== here) plan.refusal = 'other-workspace';
  else if (m.workspaceId && !here && hasReal(store)) plan.refusal = 'unknown-owner';
  for (const c of COLLECTIONS) {
    const mine = new Map((store.getState()[c] as { id: string; sample?: boolean }[]).filter(r => !r.sample).map(r => [r.id, r]));
    for (const r of (m.records[c] ?? []) as { id: string }[]) {
      const cur = mine.get(r.id);
      if (!cur) plan.add.push({ collection: c, id: r.id });
      else if (mode === 'all' && recordHash(cur) !== recordHash(r)) plan.replace.push({ collection: c, id: r.id });
      else plan.kept++;
    }
  }
  for (const f of m.files) if (!(await store.hasFile(f.id))) plan.files++;
  return plan;
}

export interface RestoreResult { added: number; replaced: number; kept: number; filesRestored: number; safetyAt: number; /** Change 010: audit entries brought back. */ auditRestored?: number }

/** Applies a checked backup. Throws Error('refused:<reason>') or Error('bad-backup') without having changed anything. */
export async function restoreBackup(store: Store, insp: Inspection, mode: RestoreMode, now = Date.now()): Promise<RestoreResult> {
  if (!insp.ok || !insp.manifest) throw new Error('bad-backup');
  const plan = await planRestore(store, insp, mode);
  if (plan.refusal) throw new Error(`refused:${plan.refusal}`);
  const m = insp.manifest;
  // 3. safety copy of what the phone holds now
  await store.putSafety(now, await buildBackupManifest(store, now));
  // files first, so a restored record never points at a picture that is not there
  let filesRestored = 0;
  for (const f of m.files) {
    if (await store.hasFile(f.id)) { store.keepFile(f.id); continue; }
    const data = insp.blobs.get(f.id)!;
    await store.putFileAs(f.id, new Blob([data as BlobPart], { type: mimeOf(f.name, f.kind) }), 'local');
    filesRestored++;
  }
  // 4. records, as ordinary edits that keep the replaced version in history
  const todo = new Set([...plan.add, ...plan.replace].map(x => `${x.collection}:${x.id}`));
  for (const c of COLLECTIONS) for (const r of (m.records[c] ?? []) as { id: string }[]) {
    if (!todo.has(`${c}:${r.id}`)) continue;
    const exists = (store.getState()[c] as { id: string }[]).some(x => x.id === r.id);
    store.upsert(c, structuredClone(r) as never, false, 'restore', exists ? 'replaced by backup' : 'brought back from backup');
  }
  // Change 010: audit history of the account's own records, merged by id (nothing on the phone is replaced or lost).
  // Entries the cloud never received are queued to be sent; entries it already has are not sent twice.
  let auditRestored = 0;
  for (const [key, list] of Object.entries(m.audit ?? {})) {
    if (store.getState().meta.shared?.[key] || !Array.isArray(list)) continue;
    const have = new Set((await store.auditEntries(key)).map(e => e.id));
    const fresh = list.filter(e => e && typeof e.id === 'string' && !have.has(e.id));
    store.appendAudit(key, fresh.filter(e => e.seq !== undefined));
    store.appendAudit(key, fresh.filter(e => e.seq === undefined), true);
    auditRestored += fresh.length;
  }
  // the profile only when the phone has none; dropdown values are added, never removed
  const st = store.getState();
  if (!st.profile.fullName && m.singletons?.profile?.fullName) store.setSingleton('profile', structuredClone(m.singletons.profile));
  for (const [list, vals] of Object.entries(m.singletons?.options ?? {})) for (const v of vals) if (!(st.options[list] ?? []).some(o => o.value === v.value)) store.addOption(list, v.value);
  store.setSingleton('meta', { lastRestoreAt: now });
  await store.flush();
  return { added: plan.add.length, replaced: plan.replace.length, kept: plan.kept, filesRestored, safetyAt: now, auditRestored };
}

function mimeOf(name: string | undefined, kind: string): string {
  const n = (name ?? '').toLowerCase();
  if (n.endsWith('.pdf')) return 'application/pdf';
  if (n.endsWith('.png')) return 'image/png';
  if (n.endsWith('.webp')) return 'image/webp';
  if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image/jpeg';
  return kind === 'document' ? 'application/octet-stream' : 'image/jpeg';
}

/** Records the time a backup file was made (shown in Settings). */
export function noteBackupMade(store: Store, at = Date.now()) { store.setSingleton('meta', { lastBackupAt: at }); }
