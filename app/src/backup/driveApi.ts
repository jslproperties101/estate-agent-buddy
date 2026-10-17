// A small Google Drive REST client for the Change 006 Drive layers (readable folders and restore points). It uses only
// the "drive.file" permission, which lets the app see and change ONLY the folders and files it created itself, never
// anything else in the person's Drive. Nothing here is permanent deletion: removal always means the Drive bin
// ("trashed": recoverable for 30 days) or a move into a Recovery folder.
//
// The token is Google's short-lived access token (about an hour, no refresh token): every Drive run happens while the
// app is open (owner decision: no background server, no stored refresh token).

export type DriveFailure = 'auth' | 'network' | 'quota' | 'server' | 'notVerified' | 'notConnected';
export class DriveError extends Error { constructor(public code: DriveFailure, message?: string) { super(message ?? code); } }

type FetchFn = typeof fetch;
export const API = 'https://www.googleapis.com/drive/v3';
export const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
export const FOLDER_MIME = 'application/vnd.google-apps.folder';

/** One authorised Drive call; maps Google's answers to the app's failure kinds. */
export async function call(fetchFn: FetchFn, token: string, url: string, init: RequestInit = {}): Promise<Response> {
  let r: Response;
  try { r = await fetchFn(url, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), authorization: `Bearer ${token}` } }); }
  catch { throw new DriveError('network'); }
  if (r.ok) return r;
  const body = await r.text().catch(() => '');
  if (r.status === 401) throw new DriveError('auth', body.slice(0, 200));
  if (r.status === 403 && /storageQuotaExceeded|quotaExceeded|userRateLimit/i.test(body)) throw new DriveError(/storage/i.test(body) ? 'quota' : 'server', body.slice(0, 200));
  if (r.status === 404) throw new DriveError('server', `404 ${body.slice(0, 160)}`);
  if (r.status === 403) throw new DriveError('auth', body.slice(0, 200));
  throw new DriveError('server', `${r.status} ${body.slice(0, 160)}`);
}

/** Text inside a Drive query string. */
export const q = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

export interface DriveItem { id: string; name: string; mimeType?: string; parents?: string[]; version?: string; md5Checksum?: string; size?: string; createdTime?: string; modifiedTime?: string; trashed?: boolean }
const ITEM_FIELDS = 'id,name,mimeType,parents,version,md5Checksum,size,createdTime,modifiedTime,trashed';

const enc = new TextEncoder();

function multipart(meta: Record<string, unknown>, mime: string, bytes: Uint8Array): { body: Uint8Array<ArrayBuffer>; type: string } {
  const boundary = `eab${Math.random().toString(36).slice(2)}`;
  const head = enc.encode(`--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\ncontent-type: ${mime}\r\n\r\n`);
  const tail = enc.encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(head.length + bytes.length + tail.length);
  body.set(head, 0); body.set(bytes, head.length); body.set(tail, head.length + bytes.length);
  return { body, type: `multipart/related; boundary=${boundary}` };
}

export class DriveClient {
  constructor(private fetchFn: FetchFn, private token: string) {}

  private c(url: string, init: RequestInit = {}) { return call(this.fetchFn, this.token, url, init); }

  /** Every file and folder matching the query (all pages). */
  async list(query: string, fields = ITEM_FIELDS): Promise<DriveItem[]> {
    const out: DriveItem[] = []; let page: string | undefined;
    do {
      const p = new URLSearchParams({ q: query, fields: `nextPageToken,files(${fields})`, pageSize: '1000', ...(page ? { pageToken: page } : {}) });
      const j = (await (await this.c(`${API}/files?${p}`)).json()) as { files?: DriveItem[]; nextPageToken?: string };
      out.push(...(j.files ?? []));
      page = j.nextPageToken;
    } while (page);
    return out;
  }

  children(parentId: string) { return this.list(`'${q(parentId)}' in parents and trashed=false`); }

  async get(id: string): Promise<DriveItem | null> {
    try { return (await (await this.c(`${API}/files/${encodeURIComponent(id)}?fields=${ITEM_FIELDS}`)).json()) as DriveItem; }
    catch (e) { if (e instanceof DriveError && /^404/.test(e.message)) return null; throw e; }
  }

  /** The folder with this name inside `parentId` ("root" = top of My Drive), made if it is not there. */
  async folder(parentId: string, name: string): Promise<string> {
    const found = await this.list(`mimeType='${FOLDER_MIME}' and name='${q(name)}' and '${q(parentId)}' in parents and trashed=false`, 'id,name');
    if (found[0]) return found[0].id;
    const made = (await (await this.c(`${API}/files?fields=id`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }) })).json()) as { id?: string };
    if (!made.id) throw new DriveError('server', 'no folder id');
    return made.id;
  }

  /** Uploads a new file and checks Drive holds exactly that many bytes. An unverified upload is binned and reported. */
  async create(parentId: string, name: string, mime: string, bytes: Uint8Array): Promise<DriveItem> {
    const m = multipart({ name, parents: [parentId], mimeType: mime }, mime, bytes);
    const it = (await (await this.c(`${UPLOAD}/files?uploadType=multipart&fields=${ITEM_FIELDS}`, { method: 'POST', headers: { 'content-type': m.type }, body: m.body })).json()) as DriveItem;
    if (!it.id) throw new DriveError('notVerified', 'no file id');
    await this.verifySize(it, bytes.length);
    return it;
  }

  /** Replaces a file's content (same Drive file, so links keep working). */
  async update(id: string, mime: string, bytes: Uint8Array): Promise<DriveItem> {
    const m = multipart({ mimeType: mime }, mime, bytes);
    const it = (await (await this.c(`${UPLOAD}/files/${encodeURIComponent(id)}?uploadType=multipart&fields=${ITEM_FIELDS}`, { method: 'PATCH', headers: { 'content-type': m.type }, body: m.body })).json()) as DriveItem;
    await this.verifySize({ ...it, id }, bytes.length, false);
    return { ...it, id };
  }

  private async verifySize(it: DriveItem, want: number, binOnFail = true) {
    const size = it.size !== undefined ? Number(it.size) : Number((await this.get(it.id))?.size);
    if (size !== want) {
      if (binOnFail) { try { await this.trash(it.id); } catch { /* best effort */ } }
      throw new DriveError('notVerified', `size ${size} != ${want}`);
    }
  }

  /** Moves (and optionally renames) a file or folder. */
  async move(id: string, toParent: string, fromParents: string[], name?: string): Promise<DriveItem> {
    const p = new URLSearchParams({ addParents: toParent, fields: ITEM_FIELDS });
    const remove = fromParents.filter(x => x !== toParent);
    if (remove.length) p.set('removeParents', remove.join(','));
    return (await (await this.c(`${API}/files/${encodeURIComponent(id)}?${p}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(name ? { name } : {}) })).json()) as DriveItem;
  }

  async rename(id: string, name: string): Promise<DriveItem> {
    return (await (await this.c(`${API}/files/${encodeURIComponent(id)}?fields=${ITEM_FIELDS}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) })).json()) as DriveItem;
  }

  /** A copy of a file the app created, in another folder, under another name. */
  async copy(id: string, toParent: string, name: string): Promise<DriveItem> {
    return (await (await this.c(`${API}/files/${encodeURIComponent(id)}/copy?fields=${ITEM_FIELDS}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, parents: [toParent] }) })).json()) as DriveItem;
  }

  /** To the Drive bin (recoverable for 30 days). Never a permanent deletion. */
  async trash(id: string): Promise<void> {
    await this.c(`${API}/files/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ trashed: true }) });
  }

  async download(id: string): Promise<Uint8Array> {
    return new Uint8Array(await (await this.c(`${API}/files/${encodeURIComponent(id)}?alt=media`)).arrayBuffer());
  }
}

/** Drive-safe folder or file name: "/" and "\" become "-", control characters and repeated spaces go, length capped. */
export function cleanName(s: string | undefined, fallback: string): string {
  // eslint-disable-next-line no-control-regex
  const v = String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/[\\/]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 100).trim();
  return v && v !== '.' && v !== '..' ? v : fallback;
}

/** Time in Malaysia (fixed UTC+8, no daylight saving) for Recovery file names: 2026-10-15T09-42-07+0800. */
export function mytStamp(ms: number): string {
  const d = new Date(ms + 8 * 3600_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}-${p(d.getUTCMinutes())}-${p(d.getUTCSeconds())}+0800`;
}
/** The same time as ISO 8601 with the offset: 2026-10-15T09:42:07+08:00. */
export function mytIso(ms: number): string {
  const s = mytStamp(ms);
  return `${s.slice(0, 10)}T${s.slice(11, 19).replace(/-/g, ':')}+08:00`;
}
/** The time a Recovery name starts with, or undefined. */
export function stampTime(name: string): number | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})\+0800 /.exec(name);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) - 8 * 3600_000 : undefined;
}
