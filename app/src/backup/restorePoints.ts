// Change 006 Layer 3: full-workspace restore points in the person's own Google Drive.
//
//   Estate Agent AI Buddy/Disaster Recovery/
//     README.txt                         do not edit; how to restore
//     Objects/<sha256>                   every photo or document once, named by its checksum
//     Restore Points/2026-10-15T02-00-00Z/
//       records.json                     the same backup content as the backup file (data/manifest.ts + profile + options)
//       manifest.json                    format, app version, schema, counts, the SHA-256 of records.json, every object
//                                        hash, and its own checksum (written LAST: a point without it is incomplete)
//       Restore Point.txt                plain-English summary
//
// Rules (from the approved design):
//  - Complete by reference: every point names every object it needs, so removing an old point never breaks a newer one.
//  - Objects are uploaded once; an object goes to the Drive bin only when no kept point refers to it.
//  - Written last, marked last: objects, then records.json (read back and checked), then manifest.json (read back and
//    checked). An interrupted run leaves an incomplete point that is never offered and is binned on a later run.
//  - Retention: the newest 30 complete points (owner default: daily restore points, 30 copies).
//  - Restore checks the manifest's own checksum, records.json and every object's SHA-256 before anything is changed,
//    then goes through the same protected restore as a backup file (backup.ts): preview, workspace guard, safety copy,
//    nothing deleted.
//  - Same content as the backup file: only this account's records, never records another agent shares in (Change 010).
//    Confidential documents ARE included: this is the person's own backup, so losing the phone does not lose them.
//  - No secrets: sign-in tokens, the Drive token and the Supabase/Maps keys are never in records.json.
import type { Store } from '../data/store';
import { sha256Hex, stableStringify } from '../data/hash';
import { COLLECTIONS } from '../data/types';
import { BUILD } from '../native/updates';
import { collectPackage, inspectPackage, Inspection, PackageManifest } from './backup';
import { DriveClient, DriveError, DriveItem, FOLDER_MIME, mytIso, q } from './driveApi';
import { MANIFEST_VERSION, LOCAL_SCHEMA_VERSION } from '../data/manifest';

export const ROOT_NAME = 'Estate Agent AI Buddy';
export const DR_NAME = 'Disaster Recovery';
export const POINT_FORMAT = 'eab-restore-point';
export const POINT_VERSION = 1;
export const KEEP_POINTS = 30;
/** An incomplete point older than this is binned by the next run. */
export const STALE_INCOMPLETE_MS = 24 * 3600_000;
export const POINT_NAME = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z$/;

export type PointReason = 'daily' | 'manual' | 'before-restore';
export interface PointManifest {
  format: typeof POINT_FORMAT;
  version: number;
  createdAt: number;
  createdLocal: string;
  reason: PointReason;
  app: { version: string; sha: string; release?: string };
  schema: { manifest: number; local: number };
  workspaceId?: string;
  counts: Record<string, number>;
  files: number;
  records: { name: 'records.json'; sha256: string; bytes: number };
  objects: { sha256: string; bytes: number }[];
  /** SHA-256 of this manifest written without this field (stable key order). */
  checksum: string;
}

const enc = new TextEncoder();
const dec = new TextDecoder();
const buf = (d: Uint8Array) => d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength) as ArrayBuffer;
const shaOf = (d: Uint8Array) => sha256Hex(buf(d));

export const pointName = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace(/:/g, '-') + 'Z';
export const pointTime = (name: string) => Date.parse(`${name.slice(0, 10)}T${name.slice(11, 19).replace(/-/g, ':')}Z`);

async function manifestChecksum(m: Omit<PointManifest, 'checksum'> | PointManifest): Promise<string> {
  const { checksum: _c, ...rest } = m as PointManifest; void _c;
  return shaOf(enc.encode(stableStringify(rest)));
}

const README = `Estate Agent AI Buddy - Disaster Recovery

Do not edit, rename or move anything in this folder.

These are restore points: complete copies of your workspace that the app can bring back.
- Objects holds each photo or document once, named by its SHA-256 checksum.
- Restore Points holds one folder per restore point. A restore point is complete only when its manifest.json exists.

To restore: open the app > Agent Profile > Settings > Backup and restore > Restore points.
The app checks every checksum first, shows what will change, and keeps a safety copy before it changes anything.
Records on the phone are never deleted by a restore.

Your readable folders (Property Listing, Contacts, To-Do...) are a view for you to open, not a backup format.
`;

export interface DrFolders { root: string; dr: string; objects: string; points: string }
export async function drFolders(d: DriveClient): Promise<DrFolders> {
  const root = await d.folder('root', ROOT_NAME);
  const dr = await d.folder(root, DR_NAME);
  const [objects, points] = [await d.folder(dr, 'Objects'), await d.folder(dr, 'Restore Points')];
  const kids = await d.children(dr);
  if (!kids.some(k => k.name === 'README.txt')) await d.create(dr, 'README.txt', 'text/plain', enc.encode(README));
  return { root, dr, objects, points };
}

export interface PointInfo { id: string; name: string; createdAt: number; manifestId: string }

/** Complete restore points (with a manifest.json), newest first. One query for every manifest the app wrote. */
export async function listPoints(d: DriveClient, f: DrFolders): Promise<{ complete: PointInfo[]; incomplete: DriveItem[] }> {
  const folders = (await d.children(f.points)).filter(x => x.mimeType === FOLDER_MIME && POINT_NAME.test(x.name));
  const manifests = await d.list(`name='manifest.json' and mimeType!='${FOLDER_MIME}' and trashed=false`, 'id,name,parents');
  const byParent = new Map<string, string>();
  for (const m of manifests) for (const p of m.parents ?? []) byParent.set(p, m.id);
  const complete: PointInfo[] = []; const incomplete: DriveItem[] = [];
  for (const x of folders) {
    const mid = byParent.get(x.id);
    if (mid) complete.push({ id: x.id, name: x.name, createdAt: pointTime(x.name), manifestId: mid });
    else incomplete.push(x);
  }
  complete.sort((a, b) => b.createdAt - a.createdAt || (a.name < b.name ? 1 : -1));
  return { complete, incomplete };
}

async function readManifest(d: DriveClient, manifestId: string): Promise<PointManifest> {
  const m = JSON.parse(dec.decode(await d.download(manifestId))) as PointManifest;
  if (m?.format !== POINT_FORMAT) throw new Error('not-a-backup');
  if (typeof m.version !== 'number' || m.version > POINT_VERSION) throw new Error('newer-version');
  if (m.checksum !== await manifestChecksum(m)) throw new Error('damaged');
  return m;
}

export interface PointRun { name: string; records: number; files: number; uploadedObjects: number; kept: number; binnedPoints: number; binnedObjects: number }

/** Makes one verified restore point, then applies retention. Throws DriveError on failure (nothing half-marked as done). */
export async function createRestorePoint(store: Store, d: DriveClient, reason: PointReason, now = Date.now()): Promise<PointRun> {
  const pkg = await collectPackage(store, now);
  const f = await drFolders(d);
  // 1. objects, once each
  const have = new Map((await d.children(f.objects)).map(o => [o.name, o]));
  const objects = new Map<string, number>();
  let uploadedObjects = 0;
  for (const file of pkg.manifest.files) {
    const data = pkg.blobs.get(file.id)!;
    const sha = file.sha256 ?? await shaOf(data);
    objects.set(sha, data.length);
    const there = have.get(sha);
    if (there && Number(there.size) === data.length) continue;
    const made = await d.create(f.objects, sha, 'application/octet-stream', data);
    have.set(sha, made); uploadedObjects++;
  }
  // 2. the point's folder and records.json, read back and checked
  const name = pointName(now);
  const folder = await d.folder(f.points, name);
  const recBytes = enc.encode(JSON.stringify(pkg.manifest));
  const recSha = await shaOf(recBytes);
  const rec = await d.create(folder, 'records.json', 'application/json', recBytes);
  if (await shaOf(await d.download(rec.id)) !== recSha) throw new DriveError('notVerified', 'records.json');
  // 3. manifest.json last, read back and checked
  const counts: Record<string, number> = {};
  for (const c of COLLECTIONS) counts[c] = (pkg.manifest.records[c] ?? []).length;
  const body: Omit<PointManifest, 'checksum'> = {
    format: POINT_FORMAT, version: POINT_VERSION, createdAt: now, createdLocal: mytIso(now), reason,
    app: { version: BUILD.version, sha: BUILD.sha, ...(BUILD.release ? { release: BUILD.release } : {}) },
    schema: { manifest: MANIFEST_VERSION, local: LOCAL_SCHEMA_VERSION }, workspaceId: pkg.manifest.workspaceId,
    counts, files: pkg.manifest.files.length,
    records: { name: 'records.json', sha256: recSha, bytes: recBytes.length },
    objects: [...objects].map(([sha256, bytes]) => ({ sha256, bytes })).sort((a, b) => (a.sha256 < b.sha256 ? -1 : 1)),
  };
  const manifest: PointManifest = { ...body, checksum: await manifestChecksum(body) };
  const mBytes = enc.encode(JSON.stringify(manifest, null, 1));
  const mf = await d.create(folder, 'manifest.json', 'application/json', mBytes);
  if (await shaOf(await d.download(mf.id)) !== await shaOf(mBytes)) throw new DriveError('notVerified', 'manifest.json');
  await d.create(folder, 'Restore Point.txt', 'text/plain', enc.encode(summaryText(manifest)));
  const pruned = await prunePoints(store, d, f, now, name);
  return { name, records: pkg.records, files: pkg.manifest.files.length, uploadedObjects, ...pruned };
}

function summaryText(m: PointManifest): string {
  const lines = [
    'Estate Agent AI Buddy - restore point', '',
    `Made: ${m.createdLocal} (${m.reason})`,
    `App version: ${m.app.version}${m.app.release ? ` (release ${m.app.release})` : ''} (${m.app.sha})`,
    `Status: verified (every object and records.json were checked after upload)`,
    `Records: ${Object.values(m.counts).reduce((a, b) => a + b, 0)}`,
    ...Object.entries(m.counts).filter(([, n]) => n).map(([c, n]) => `  ${c}: ${n}`),
    `Photos and documents: ${m.files}`, '',
    'Restore from the app: Agent Profile > Settings > Backup and restore > Restore points.',
  ];
  return lines.join('\n') + '\n';
}

/** Keeps the newest KEEP_POINTS complete points (the one just made always counts), bins older ones, bins incomplete
 *  points older than a day, then bins objects no kept point refers to. Everything goes to the Drive bin, not deleted. */
export async function prunePoints(store: Store, d: DriveClient, f: DrFolders, now: number, justMade?: string, keep = KEEP_POINTS): Promise<{ kept: number; binnedPoints: number; binnedObjects: number }> {
  const { complete, incomplete } = await listPoints(d, f);
  const kept = complete.slice(0, keep);
  const old = complete.slice(keep).filter(p => p.name !== justMade);
  let binnedPoints = 0;
  for (const p of old) { await d.trash(p.id); binnedPoints++; }
  for (const x of incomplete) if (x.name !== justMade && now - pointTime(x.name) > STALE_INCOMPLETE_MS) { await d.trash(x.id); binnedPoints++; }
  // Mark and sweep. Manifests are small; each kept one's object list is cached on the phone by its Drive id.
  const cache = ((await store.listLocal('drive:')).find(r => r.key === 'drive:pointObjects')?.value as Record<string, string[]> | undefined) ?? {};
  const next: Record<string, string[]> = {};
  const used = new Set<string>();
  for (const p of kept) {
    let objs = cache[p.manifestId];
    if (!objs) { try { objs = (await readManifest(d, p.manifestId)).objects.map(o => o.sha256); } catch { return { kept: kept.length, binnedPoints, binnedObjects: 0 }; } }
    next[p.manifestId] = objs;
    for (const o of objs) used.add(o);
  }
  await store.putLocalNow('drive:pointObjects', next);
  let binnedObjects = 0;
  if (kept.length) for (const o of await d.children(f.objects)) if (!used.has(o.name)) { await d.trash(o.id); binnedObjects++; }
  return { kept: kept.length, binnedPoints, binnedObjects };
}

export interface PointPreview { info: PointInfo; manifest: PointManifest; inspection: Inspection }

/** Downloads a restore point and checks everything before anything changes. Problems are reported in the
 *  inspection (`ok: false`), exactly as for a backup file; a damaged point never reaches restoreBackup. */
export async function loadRestorePoint(d: DriveClient, f: DrFolders, info: PointInfo): Promise<PointPreview | { problem: string }> {
  let m: PointManifest;
  try { m = await readManifest(d, info.manifestId); } catch (e) { return { problem: e instanceof DriveError ? 'drive' : (e as Error).message || 'damaged' }; }
  const kids = await d.children(info.id);
  const rec = kids.find(k => k.name === 'records.json');
  if (!rec) return { problem: 'file-missing' };
  const recBytes = await d.download(rec.id);
  if (recBytes.length !== m.records.bytes || await shaOf(recBytes) !== m.records.sha256) return { problem: 'damaged' };
  let pkg: PackageManifest;
  try { pkg = JSON.parse(dec.decode(recBytes)) as PackageManifest; } catch { return { problem: 'damaged' }; }
  const objs = new Map((await d.list(`'${q(f.objects)}' in parents and trashed=false`, 'id,name,size')).map(o => [o.name, o]));
  const bySha = new Map<string, Uint8Array>();
  for (const o of m.objects) {
    const it = objs.get(o.sha256);
    if (!it) return { problem: 'file-missing' };
    const data = await d.download(it.id);
    if (await shaOf(data) !== o.sha256) return { problem: 'file-mismatch' };
    bySha.set(o.sha256, data);
  }
  const blobs = new Map<string, Uint8Array>();
  for (const file of pkg.files ?? []) { const b = file.sha256 ? bySha.get(file.sha256) : undefined; if (b) blobs.set(file.id, b); }
  const inspection = await inspectPackage(pkg, blobs);
  return { info, manifest: m, inspection };
}
