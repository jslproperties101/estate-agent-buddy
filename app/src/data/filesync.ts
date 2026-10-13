// Photos, documents and banner pictures in the cloud (private storage bucket "eab-files").
//  - The phone's copy is the working copy: records and pictures open offline, and a file is NEVER removed from the phone
//    because an upload failed (or even succeeded: removal only follows the record, with a 30-day safety period).
//  - A file is identified by what is in it (SHA-256). It is stored in the cloud at <workspace>/<sha256>, so sending it again
//    (a retry, or the same picture added twice) cannot create a second copy.
//  - Metadata (which record and workspace the file belongs to) lives in eab_files; the database decides who may see or add
//    it, following the record's own permissions. The bucket is private; downloads need the signed-in person's token.
//  - Uploads wait until the record that uses the file is itself in the cloud (the database refuses files for unknown records).
//  - Failed uploads are retried later with a growing pause. The phone's copy keeps working in the meantime.
//  - Pictures are sent as they are kept on the phone (already shrunk when added). A picture that is still large (over
//    2.5 MB) is shrunk for the upload only; the copy on the phone is never changed.
import type { Store, FileEntry } from './store';
import { fileRefs, FileRef } from './fileRefs';
import { sha256Hex } from './hash';
import { SyncConfig, SyncError, Session, supabaseHeaders } from './sync';

type FetchFn = typeof fetch;
export interface FileSyncOptions {
  /** Makes the copy that is uploaded. Default: shrink large pictures; leave everything else as it is. */
  prepare?: (blob: Blob, ref: FileRef) => Promise<Blob>;
  now?: () => number;
}
export interface FileSyncResult { uploaded: number; downloaded: number; failed: number }

export const LARGE_IMAGE_BYTES = 2_500_000;
export const MAX_FILE_BYTES = 26_214_400;     // the bucket's own limit (25 MB)

export async function defaultPrepare(blob: Blob): Promise<Blob> {
  if (!blob.type.startsWith('image/') || blob.size <= LARGE_IMAGE_BYTES || typeof createImageBitmap === 'undefined') return blob;
  try {
    const { compressImage } = await import('../lib/images');
    const c = await compressImage(blob, 2000, 0.8);
    return c.blob.size < blob.size ? c.blob : blob;
  } catch { return blob; }
}

const backoff = (tries: number) => Math.min(30_000 * 2 ** Math.max(0, tries - 1), 3600_000);
const kindOf = (r: FileRef) => r.kind;

async function raw(fetchFn: FetchFn, url: string, init: RequestInit): Promise<Response> {
  try { return await fetchFn(url, init); } catch (e) { throw new SyncError('network', String(e)); }
}

function note(store: Store, e: FileEntry, patch: Partial<FileEntry>) { store.setFileEntry({ ...e, ...patch }); }
function failed(store: Store, e: FileEntry, err: unknown, now: number): void {
  const tries = (e.tries ?? 0) + 1;
  const why = err instanceof SyncError ? err.code : 'error';
  note(store, e, { tries, nextTry: now + backoff(tries), lastError: why, status: tries >= 3 ? 'failed' : 'pending' });
}

/** True when the record that uses a file has been accepted by the cloud and nothing newer is waiting. */
function recordInCloud(store: Store, r: FileRef): boolean {
  const m = store.getState().meta;
  const key = `${r.collection}:${r.recordId}`;
  const base = store.getBase(key);
  return !!base && !base.deleted && !m.dirty.includes(key) && !(m.conflicts ?? []).some(c => c.key === key);
}

async function upload(store: Store, cfg: SyncConfig, session: Session, ws: string, fetchFn: FetchFn, ref: FileRef, e: FileEntry, prepare: NonNullable<FileSyncOptions['prepare']>): Promise<void> {
  const blob = await store.getFile(ref.fileId);
  if (!blob) return;
  const out = await prepare(blob, ref);
  if (out.size > MAX_FILE_BYTES) { note(store, e, { status: 'failed', lastError: 'too-large' }); return; }
  const sha = await sha256Hex(out);
  const h = supabaseHeaders(cfg, session.accessToken);
  // 1. who and what the file is (ignored if this exact row is already there: a retry)
  const meta = await raw(fetchFn, `${cfg.supabaseUrl}/rest/v1/eab_files`, {
    method: 'POST', headers: { ...h, prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify([{ workspace_id: ws, file_id: ref.fileId, collection: ref.collection, record_id: ref.recordId, kind: kindOf(ref), sha256: sha, bytes: out.size, mime: out.type || blob.type || null, name: ref.name?.slice(0, 200) ?? null }]),
  });
  if (meta.status === 401 || meta.status === 403) { note(store, e, { status: 'denied', lastError: 'denied' }); return; }
  if (!meta.ok) throw new SyncError('server', `files ${meta.status}`);
  // 2. the content, unless the cloud already has it (same checksum)
  const have = await raw(fetchFn, `${cfg.supabaseUrl}/rest/v1/eab_files?select=file_id&workspace_id=eq.${ws}&sha256=eq.${sha}&status=eq.uploaded&limit=1`, { headers: h });
  const already = have.ok && ((await have.json()) as unknown[]).length > 0;
  if (!already) {
    const put = await raw(fetchFn, `${cfg.supabaseUrl}/storage/v1/object/eab-files/${ws}/${sha}`, {
      method: 'POST', headers: { ...h, 'content-type': out.type || 'application/octet-stream', 'x-upsert': 'false', 'cache-control': 'max-age=31536000' }, body: out,
    });
    if (put.status === 401 || put.status === 403) { note(store, e, { status: 'denied', lastError: 'denied' }); return; }
    const text = put.ok ? '' : await put.text().catch(() => '');
    const duplicate = put.status === 409 || /duplicate|already exists/i.test(text);   // same content is already there: fine
    if (!put.ok && !duplicate) throw new SyncError('server', `upload ${put.status}`);
  }
  // 3. only now is it "uploaded"
  const mark = await raw(fetchFn, `${cfg.supabaseUrl}/rest/v1/eab_files?workspace_id=eq.${ws}&file_id=eq.${encodeURIComponent(ref.fileId)}`, {
    method: 'PATCH', headers: { ...h, prefer: 'return=representation' }, body: JSON.stringify({ status: 'uploaded', uploaded_at: new Date().toISOString() }),
  });
  if (!mark.ok) throw new SyncError('server', `mark ${mark.status}`);
  const rows = (await mark.json().catch(() => [])) as unknown[];
  if (!rows.length) throw new SyncError('server', 'not marked');
  store.setFileEntry({ ...e, status: 'uploaded', sha256: sha, bytes: out.size, uploadedAt: Date.now(), tries: 0, nextTry: undefined, lastError: undefined, cloudDeleted: false });
}

interface MetaRow { file_id: string; sha256: string; bytes: number; mime?: string | null; status: string; deleted: boolean }

async function download(store: Store, cfg: SyncConfig, session: Session, ws: string, fetchFn: FetchFn, refs: FileRef[], now: number): Promise<number> {
  if (!refs.length) return 0;
  const h = supabaseHeaders(cfg, session.accessToken);
  const rows = new Map<string, MetaRow>();
  for (let i = 0; i < refs.length; i += 50) {
    const ids = refs.slice(i, i + 50).map(r => `"${r.fileId.replace(/"/g, '')}"`).join(',');
    const r = await raw(fetchFn, `${cfg.supabaseUrl}/rest/v1/eab_files?select=file_id,sha256,bytes,mime,status,deleted&workspace_id=eq.${ws}&file_id=in.(${encodeURIComponent(ids)})`, { headers: h });
    if (!r.ok) throw new SyncError(r.status === 401 || r.status === 403 ? 'auth' : 'server', `files ${r.status}`);
    for (const row of (await r.json()) as MetaRow[]) rows.set(row.file_id, row);
  }
  let n = 0;
  for (const ref of refs) {
    const e = store.fileEntry(ref.fileId) ?? { id: ref.fileId, status: 'pending' as const, bytes: 0, addedAt: now };
    const row = rows.get(ref.fileId);
    if (!row || row.deleted) { note(store, e, { status: 'missing', lastError: row ? 'deleted' : 'not-in-cloud' }); continue; }
    if (row.status !== 'uploaded') { note(store, e, { status: 'pending', lastError: 'not-uploaded-yet' }); continue; }
    try {
      const r = await raw(fetchFn, `${cfg.supabaseUrl}/storage/v1/object/authenticated/eab-files/${ws}/${row.sha256}`, { headers: h });
      if (r.status === 401 || r.status === 403) { note(store, e, { status: 'denied', lastError: 'denied' }); continue; }
      if (r.status === 404 || r.status === 400) { note(store, e, { status: 'missing', lastError: 'object-missing' }); continue; }
      if (!r.ok) throw new SyncError('server', `download ${r.status}`);
      const blob = await r.blob();
      if ((await sha256Hex(blob)) !== row.sha256) { note(store, e, { status: 'failed', lastError: 'checksum', tries: (e.tries ?? 0) + 1, nextTry: now + backoff((e.tries ?? 0) + 1) }); continue; }
      await store.putFileAs(ref.fileId, blob.type || !row.mime ? blob : new Blob([blob], { type: row.mime }), 'uploaded', { sha256: row.sha256, uploadedAt: now, tries: 0 });
      n++;
    } catch (err) { failed(store, e, err, now); }
  }
  return n;
}

/** Runs the picture/document part of a sync. Never throws for one bad file; the file keeps its own status instead. */
export async function syncFiles(store: Store, cfg: SyncConfig, session: Session, ws: string, fetchFn: FetchFn, opts: FileSyncOptions = {}): Promise<FileSyncResult> {
  const now = (opts.now ?? Date.now)();
  const prepare = opts.prepare ?? defaultPrepare;
  const res: FileSyncResult = { uploaded: 0, downloaded: 0, failed: 0 };
  const refs = fileRefs(store.getState());
  const toDownload: FileRef[] = [];

  for (const ref of refs) {
    const blobHere = await store.hasFile(ref.fileId);
    let e = store.fileEntry(ref.fileId);
    if (blobHere && !e) { e = { id: ref.fileId, status: 'local', bytes: 0, addedAt: now }; store.setFileEntry(e); }
    if (!blobHere) {
      if (!(e?.status === 'failed' && (e.nextTry ?? 0) > now)) toDownload.push(ref);    // not on this phone: fetch it (unless waiting before a retry)
      continue;
    }
    if (!e) continue;
    if (e.status === 'uploaded') {
      if (e.cloudDeleted && !e.removedAt) {                      // brought back after a delete: the cloud row is switched back on
        const h = supabaseHeaders(cfg, session.accessToken);
        try { const r = await raw(fetchFn, `${cfg.supabaseUrl}/rest/v1/eab_files?workspace_id=eq.${ws}&file_id=eq.${encodeURIComponent(ref.fileId)}`, { method: 'PATCH', headers: { ...h, prefer: 'return=minimal' }, body: JSON.stringify({ deleted: false }) }); if (r.ok) note(store, e, { cloudDeleted: false }); } catch { /* next time */ }
      }
      continue;
    }
    if (e.status === 'denied' && session.role !== 'limited') { /* try again: a role may have changed */ }
    if (session.role === 'limited') continue;
    if ((e.nextTry ?? 0) > now) continue;                       // waiting before the next try
    if (!recordInCloud(store, ref)) continue;                   // the record goes first
    try { await upload(store, cfg, session, ws, fetchFn, ref, e, prepare); const after = store.fileEntry(ref.fileId); if (after?.status === 'uploaded') res.uploaded++; }
    catch (err) { failed(store, e, err, now); res.failed++; }
  }

  try { res.downloaded = await download(store, cfg, session, ws, fetchFn, toDownload, now); } catch { res.failed++; }

  // Files no record uses any more: switch the cloud row off (the stored content stays until the owner cleans up).
  if (!store.getState().meta.dirty.length && session.role !== 'limited') {
    const used = new Set(refs.map(r => r.fileId));
    const h = supabaseHeaders(cfg, session.accessToken);
    for (const e of store.allFileEntries()) {
      if (!e.removedAt || used.has(e.id) || e.status !== 'uploaded' || e.cloudDeleted) continue;
      try {
        const r = await raw(fetchFn, `${cfg.supabaseUrl}/rest/v1/eab_files?workspace_id=eq.${ws}&file_id=eq.${encodeURIComponent(e.id)}`, { method: 'PATCH', headers: { ...h, prefer: 'return=minimal' }, body: JSON.stringify({ deleted: true }) });
        if (r.ok) note(store, e, { cloudDeleted: true });
      } catch { /* next time */ }
    }
  }
  return res;
}

/** Number of a record's files in each state, for the small line under its pictures. */
export function recordFileSummary(store: Store, collection: string, recordId: string) {
  const out = { total: 0, uploaded: 0, waiting: 0, failed: 0, missing: 0, denied: 0 };
  for (const r of fileRefs(store.getState())) {
    if (r.collection !== collection || r.recordId !== recordId) continue;
    out.total++;
    const e = store.fileEntry(r.fileId);
    if (!e) out.waiting++;
    else if (e.status === 'uploaded') out.uploaded++;
    else if (e.status === 'failed') out.failed++;
    else if (e.status === 'missing') out.missing++;
    else if (e.status === 'denied') out.denied++;
    else out.waiting++;
  }
  return out;
}

/** "Try now" for a file that failed: forgets the pause and the count, so the next sync tries straight away. */
export function retryFile(store: Store, fileId: string) {
  const e = store.fileEntry(fileId);
  if (e && e.status !== 'uploaded') store.setFileEntry({ ...e, status: e.status === 'missing' ? 'pending' : e.status === 'failed' || e.status === 'denied' ? 'pending' : e.status, tries: 0, nextTry: undefined, lastError: undefined });
}
