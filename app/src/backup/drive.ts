// Google Drive: the daily run (Change 006 Layers 1-3) and the older backup-file (.zip) folder.
//
// Uses only the Drive REST API with the "drive.file" permission, which lets the app see ONLY the files and folders it
// created itself (never the rest of the person's Drive).
//
// Since the Change 006 integration (app 2.2.0, release 2.0.010) each run writes:
//   - a verified restore point under "Estate Agent AI Buddy/Disaster Recovery" (restorePoints.ts; newest 30 kept), and
//   - the readable folders with their Recovery copies under "Estate Agent AI Buddy" (driveTree.ts).
// It no longer uploads .zip files. Older versions put them in the folder "Estate Agent AI Buddy backups"; those stay
// there, are still listed, and still restore (listBackups / downloadBackup and backup.ts's inspectBackup). The upload and
// pruning functions for that folder are kept for those older copies and their tests; the app does not call them.
//
// What this cannot do: Google gives the app a short-lived access token (about an hour) when the person connects Drive,
// and the phone cannot renew it quietly. So a run happens when the person connects or presses "Back up now", and once a
// day at app start while that token is still valid. Owner decision (Oct 2026): backups only while the app is open; no
// server holding a long-lived refresh token.
import type { Store } from '../data/store';
import { DriveClient } from './driveApi';
import { createRestorePoint, PointRun } from './restorePoints';
import { exportTree, TreeRun } from './driveTree';

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const FOLDER_NAME = 'Estate Agent AI Buddy backups';
export const KEEP_COPIES = 30;
export const DUE_AFTER_MS = 20 * 3600_000;
export const BACKUP_NAME = /^EstateAgentBuddy-backup-\d{4}-\d{2}-\d{2}-\d{4}\.zip$/;

import { API, call, DriveError, DriveFailure, q, UPLOAD } from './driveApi';
export { DriveError } from './driveApi';
export type { DriveFailure } from './driveApi';

type FetchFn = typeof fetch;

export interface DriveFile { id: string; name: string; createdTime: string; size?: string }

/** The folder this app created, or a new one. */
export async function ensureFolder(fetchFn: FetchFn, token: string): Promise<string> {
  const find = await call(fetchFn, token, `${API}/files?${new URLSearchParams({ q: `mimeType='application/vnd.google-apps.folder' and name='${q(FOLDER_NAME)}' and trashed=false`, fields: 'files(id,name)', pageSize: '10' })}`);
  const found = ((await find.json()) as { files?: { id: string }[] }).files?.[0];
  if (found) return found.id;
  const made = await call(fetchFn, token, `${API}/files?fields=id`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }) });
  const id = ((await made.json()) as { id?: string }).id;
  if (!id) throw new DriveError('server', 'no folder id');
  return id;
}

export async function listBackups(fetchFn: FetchFn, token: string, folderId: string): Promise<DriveFile[]> {
  const out: DriveFile[] = []; let page: string | undefined;
  do {
    const p = new URLSearchParams({ q: `'${q(folderId)}' in parents and trashed=false`, fields: 'nextPageToken,files(id,name,createdTime,size)', orderBy: 'createdTime desc', pageSize: '100', ...(page ? { pageToken: page } : {}) });
    const j = (await (await call(fetchFn, token, `${API}/files?${p}`)).json()) as { files?: DriveFile[]; nextPageToken?: string };
    out.push(...(j.files ?? []).filter(f => BACKUP_NAME.test(f.name)));
    page = j.nextPageToken;
  } while (page);
  return out.sort((a, b) => (a.createdTime < b.createdTime ? 1 : a.createdTime > b.createdTime ? -1 : 0));
}

/** Uploads and then CHECKS the file is on Drive with the right size. An unverified upload is removed and reported as a failure. */
export async function uploadBackup(fetchFn: FetchFn, token: string, folderId: string, name: string, bytes: Uint8Array): Promise<string> {
  const boundary = `eab${Math.random().toString(36).slice(2)}`;
  const enc = new TextEncoder();
  const head = enc.encode(`--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, parents: [folderId], mimeType: 'application/zip' })}\r\n--${boundary}\r\ncontent-type: application/zip\r\n\r\n`);
  const tail = enc.encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(head.length + bytes.length + tail.length);
  body.set(head, 0); body.set(bytes, head.length); body.set(tail, head.length + bytes.length);
  const r = await call(fetchFn, token, `${UPLOAD}/files?uploadType=multipart&fields=id`, { method: 'POST', headers: { 'content-type': `multipart/related; boundary=${boundary}` }, body });
  const id = ((await r.json()) as { id?: string }).id;
  if (!id) throw new DriveError('notVerified', 'no file id');
  const meta = (await (await call(fetchFn, token, `${API}/files/${id}?fields=id,size,trashed`)).json()) as { size?: string; trashed?: boolean };
  if (Number(meta.size) !== bytes.length || meta.trashed) {
    try { await call(fetchFn, token, `${API}/files/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ trashed: true }) }); } catch { /* best effort */ }
    throw new DriveError('notVerified', `size ${meta.size} != ${bytes.length}`);
  }
  return id;
}

/** Moves backups beyond the newest `keep` to the Drive bin. Never touches a file whose name is not a backup name. */
export async function pruneBackups(fetchFn: FetchFn, token: string, folderId: string, keep = KEEP_COPIES): Promise<{ kept: number; binned: number }> {
  const all = await listBackups(fetchFn, token, folderId);
  const old = all.slice(keep);
  let binned = 0;
  for (const f of old) {
    await call(fetchFn, token, `${API}/files/${f.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ trashed: true }) });
    binned++;
  }
  return { kept: all.length - binned, binned };
}

export async function downloadBackup(fetchFn: FetchFn, token: string, id: string): Promise<Uint8Array> {
  return new Uint8Array(await (await call(fetchFn, token, `${API}/files/${id}?alt=media`)).arrayBuffer());
}

export interface DriveRun { fileName: string; copies: number; binned: number }
export async function backupToDrive(fetchFn: FetchFn, token: string, name: string, bytes: Uint8Array): Promise<DriveRun> {
  const folder = await ensureFolder(fetchFn, token);
  await uploadBackup(fetchFn, token, folder, name, bytes);
  const { kept, binned } = await pruneBackups(fetchFn, token, folder);   // only after the new copy is verified
  return { fileName: name, copies: kept, binned };
}

/** Due when no backup has succeeded yet, or the last success is 20 hours old or more. */
export const backupDue = (lastOkAt: number | undefined, now = Date.now()) => !lastOkAt || now - lastOkAt >= DUE_AFTER_MS;
/** The Drive permission is usable only while Google's short-lived token has not run out. */
export const driveUsable = (d: { token: string; expiresAt: number } | undefined, now = Date.now()) => !!d && d.expiresAt - now > 60_000;

export interface DriveRunResult {
  ok: boolean;
  error?: DriveFailure;
  /** The restore point made by this run (Layer 3), when one was due or asked for. */
  point?: PointRun;
  pointError?: DriveFailure;
  /** The readable folders update (Layer 2). */
  tree?: TreeRun;
  treeError?: DriveFailure;
}

/** One Drive run (Change 006), while the app is open and Google's short-lived permission is valid:
 *   1. a verified restore point (Layer 3) when one is due (once a day) or `force` is set ("Back up now");
 *   2. the readable folders and their Recovery copies (Layers 2 and 1), every run.
 *  The two fail independently: a failed folder update never undoes a good restore point, and the other way round.
 *  Outcomes are recorded on the phone (meta.driveLast / driveLastOkAt for restore points, meta.driveTree for folders).
 *  Since this version the app no longer uploads backup .zip files to Drive; older ones stay listed and restorable. */
export async function runDriveBackup(store: Store, fetchFn: FetchFn = fetch, now = Date.now(), opts: { force?: boolean; tree?: boolean } = {}): Promise<DriveRunResult> {
  const d = store.getState().meta.drive;
  if (!driveUsable(d, now)) return { ok: false, error: 'notConnected' };
  const client = new DriveClient(fetchFn, d!.token);
  const out: DriveRunResult = { ok: true };
  const failure = (e: unknown): DriveFailure => (e instanceof DriveError ? e.code : 'server');
  if (opts.force || backupDue(store.getState().meta.driveLastOkAt, now)) {
    try {
      out.point = await createRestorePoint(store, client, opts.force ? 'manual' : 'daily', now);
      store.setSingleton('meta', { driveLastOkAt: now, lastBackupAt: now, driveLast: { at: now, ok: true, copies: out.point.kept, fileName: out.point.name } });
    } catch (e) {
      out.pointError = failure(e); out.ok = false; out.error = out.pointError;
      store.setSingleton('meta', { driveLast: { at: now, ok: false, error: out.pointError }, ...(out.pointError === 'auth' ? { drive: undefined } : {}) });
      if (out.pointError === 'auth') return out;
    }
  }
  if (opts.tree !== false) {
    try {
      out.tree = await exportTree(store, client, now);
      store.setSingleton('meta', { driveTree: { at: now, ok: true, status: out.tree.status, waiting: out.tree.waiting.length, failed: out.tree.failed.length, editedOutside: out.tree.editedOutside.length } });
    } catch (e) {
      out.treeError = failure(e); out.ok = false; out.error = out.error ?? out.treeError;
      store.setSingleton('meta', { driveTree: { at: now, ok: false, error: out.treeError }, ...(out.treeError === 'auth' ? { drive: undefined } : {}) });
    }
  }
  return out;
}
