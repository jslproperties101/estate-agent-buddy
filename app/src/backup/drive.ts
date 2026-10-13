// Google Drive copy of the backup file. Uses only the Drive REST API with the "drive.file" permission, which lets the
// app see ONLY the files and folder it created itself (never the rest of the person's Drive). Backups live in a visible
// folder "Estate Agent AI Buddy backups", one .zip per backup, and the newest 30 are kept: older ones go to the Drive
// bin (recoverable for 30 days), never straight to permanent deletion, and only files whose names match the backup
// pattern are ever touched.
//
// What this cannot do: Google gives the app a short-lived access token (about an hour) when the person connects Drive,
// and the phone cannot renew it quietly. So a backup runs when the person connects or presses "Back up now" (and once a
// day at app start while that token is still valid). A backup that runs every day on its own, without the app open,
// needs a scheduled server job holding Google's long-lived refresh token; that is NOT built (docs/MASTER_REQUIREMENTS_AUDIT.md).
import type { Store } from '../data/store';
import { createBackup } from './backup';

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const FOLDER_NAME = 'Estate Agent AI Buddy backups';
export const KEEP_COPIES = 30;
export const DUE_AFTER_MS = 20 * 3600_000;
export const BACKUP_NAME = /^EstateAgentBuddy-backup-\d{4}-\d{2}-\d{2}-\d{4}\.zip$/;

export type DriveFailure = 'auth' | 'network' | 'quota' | 'server' | 'notVerified' | 'notConnected';
export class DriveError extends Error { constructor(public code: DriveFailure, message?: string) { super(message ?? code); } }

type FetchFn = typeof fetch;
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

async function call(fetchFn: FetchFn, token: string, url: string, init: RequestInit = {}): Promise<Response> {
  let r: Response;
  try { r = await fetchFn(url, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), authorization: `Bearer ${token}` } }); }
  catch { throw new DriveError('network'); }
  if (r.ok) return r;
  const body = await r.text().catch(() => '');
  if (r.status === 401) throw new DriveError('auth', body.slice(0, 200));
  if (r.status === 403 && /storageQuotaExceeded|quotaExceeded|userRateLimit/i.test(body)) throw new DriveError(/storage/i.test(body) ? 'quota' : 'server', body.slice(0, 200));
  if (r.status === 403 || r.status === 404) throw new DriveError(r.status === 404 ? 'server' : 'auth', body.slice(0, 200));
  throw new DriveError('server', `${r.status} ${body.slice(0, 160)}`);
}
const q = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

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

/** Makes a backup and puts it on Drive. Records the outcome on the phone (meta.driveLast / driveLastOkAt). */
export async function runDriveBackup(store: Store, fetchFn: FetchFn = fetch, now = Date.now()): Promise<{ ok: true; run: DriveRun } | { ok: false; error: DriveFailure }> {
  const d = store.getState().meta.drive;
  if (!driveUsable(d, now)) return { ok: false, error: 'notConnected' };
  try {
    const b = await createBackup(store, now);
    const run = await backupToDrive(fetchFn, d!.token, b.fileName, b.bytes);
    store.setSingleton('meta', { driveLastOkAt: now, lastBackupAt: now, driveLast: { at: now, ok: true, copies: run.copies, fileName: run.fileName } });
    return { ok: true, run };
  } catch (e) {
    const error = e instanceof DriveError ? e.code : 'server';
    store.setSingleton('meta', { driveLast: { at: now, ok: false, error }, ...(error === 'auth' ? { drive: undefined } : {}) });
    return { ok: false, error };
  }
}
