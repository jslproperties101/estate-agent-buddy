// Cloud copy in Supabase. The phone's own storage is always the working copy, so the app works offline; syncing sends
// changed records up and brings newer ones down for the signed-in person's team workspace.
// Needs SUPABASE URL + anon key (Agent Profile → Settings, or EAB_SUPABASE_URL / EAB_SUPABASE_ANON_KEY at build time),
// the tables in supabase/migrations/, and Google sign-in (data/auth.ts).
// Who sees what is decided by the database (row-level security), not by this code: owner and admin see the whole
// workspace, a team leader reads it all and edits own/assigned records, an agent sees own/assigned records, a limited
// user only reads own/assigned records (its changes stay on the phone).
// Phase 2 protocol (supabase/migrations/20261014000000_phase2_sync_refs_files.sql):
//  - Every cloud record has a version number (rev) that the DATABASE increases on each write, and a change number (seq).
//    This phone remembers, per record, the version the cloud last accepted or sent (the "base"). Nothing here compares
//    device clocks.
//  - A change is sent with the base version it was made from. The cloud accepts it only if that is still the current
//    version; otherwise it answers "conflict" with its current copy and writes nothing.
//  - A conflict is joined field by field (data/merge.ts). Fields changed on only one side are combined; a field changed
//    differently on both sides stays as it is on this phone and is listed for the person (Sync review). The cloud's
//    version is always kept in the record's history first. A record deleted on one side and edited on the other is also a
//    conflict, never a silent delete or resurrection.
//  - Each send carries an operation id, so a retry after a lost answer is recognised and not applied twice.
//  - "Synced" is only ever set from the cloud's own answer, for the exact content that was sent; an edit made while the
//    upload ran stays "waiting".
//  - Property numbers must be unique across prefixes; the cloud refuses a duplicate with "ref_conflict" and the local
//    record stays untouched, with the reason shown to the person.
// Sample records are never sent up or taken down, so they never mix with real data in the team workspace.
import type { CloudBase, Store } from './store';
import { AppState, COLLECTIONS, CollectionName, Conflict, Meta } from './types';
import { isSampleKey } from './sample';
import { hash53, recordHash } from './hash';
import { applyChoices, merge3 } from './merge';
import { syncFiles, FileSyncOptions } from './filesync';
import { syncShared, sharedWorkspaces } from '../team/sharedSync';
import { TeamError, dropAllShared } from '../team/api';
import { syncAudit } from '../audit/auditSync';

export interface SyncConfig { supabaseUrl: string; supabaseAnonKey: string }
export type Session = NonNullable<Meta['syncSession']>;
type FetchFn = typeof fetch;

export class SyncError extends Error {
  constructor(public code: 'not-configured' | 'not-signed-in' | 'auth' | 'network' | 'server' | 'no-access' | 'other-workspace' | 'owner-unknown', message?: string) { super(message ?? code); }
}

const TABLE = 'eab_records';

function headers(cfg: SyncConfig, token?: string): Record<string, string> {
  return { apikey: cfg.supabaseAnonKey, 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) };
}

async function call(fetchFn: FetchFn, url: string, init: RequestInit): Promise<Response> {
  let r: Response;
  try { r = await fetchFn(url, init); } catch (e) { throw new SyncError('network', String(e)); }
  if (r.status === 401 || r.status === 403) throw new SyncError('auth', await r.text().catch(() => ''));
  if (!r.ok) throw new SyncError(r.status === 400 && url.includes('/auth/') ? 'auth' : 'server', `${r.status} ${await r.text().catch(() => '')}`);
  return r;
}

export interface TokenResponse { access_token: string; refresh_token: string; expires_in: number; provider_token?: string; user: { id: string; email: string; user_metadata?: { full_name?: string; name?: string; avatar_url?: string; country?: string } } }
export function toSession(j: TokenResponse, keep?: Partial<Session>): Session {
  return {
    ...keep,
    accessToken: j.access_token, refreshToken: j.refresh_token, expiresAt: Date.now() + j.expires_in * 1000, email: j.user.email, userId: j.user.id,
    name: j.user.user_metadata?.full_name ?? j.user.user_metadata?.name ?? keep?.name,
    country: j.user.user_metadata?.country ?? keep?.country,
  };
}
export { call as supabaseCall, headers as supabaseHeaders };

/** JoyChange002 Change 46: the country is kept on the account itself (Supabase user data), so another phone, a laptop or a
 *  reinstall already knows it. No table is involved. Reads the account's country (undefined when never chosen). */
export async function fetchAccountCountry(cfg: SyncConfig, s: Session, fetchFn: FetchFn = fetch): Promise<string | undefined> {
  const r = await call(fetchFn, `${cfg.supabaseUrl}/auth/v1/user`, { method: 'GET', headers: headers(cfg, s.accessToken) });
  const c = ((await r.json()) as { user_metadata?: { country?: unknown } }).user_metadata?.country;
  return typeof c === 'string' && c.trim() ? c.trim() : undefined;
}
/** Saves the country on the account. Other user data (name, picture) is kept: Supabase merges what is sent. */
export async function saveAccountCountry(cfg: SyncConfig, s: Session, country: string, fetchFn: FetchFn = fetch): Promise<void> {
  await call(fetchFn, `${cfg.supabaseUrl}/auth/v1/user`, { method: 'PUT', headers: headers(cfg, s.accessToken), body: JSON.stringify({ data: { country } }) });
}

export const configured = (cfg: SyncConfig) => !!(cfg.supabaseUrl && cfg.supabaseAnonKey);

export async function signIn(cfg: SyncConfig, email: string, password: string, fetchFn: FetchFn = fetch): Promise<Session> {
  if (!configured(cfg)) throw new SyncError('not-configured');
  const r = await call(fetchFn, `${cfg.supabaseUrl}/auth/v1/token?grant_type=password`, { method: 'POST', headers: headers(cfg), body: JSON.stringify({ email, password }) });
  return toSession(await r.json());
}

/** A session that is valid for at least another minute (refreshed with the refresh token when needed). */
export async function fresh(cfg: SyncConfig, s: Session, fetchFn: FetchFn = fetch): Promise<Session> {
  if (s.expiresAt - Date.now() > 60_000) return s;
  const r = await call(fetchFn, `${cfg.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: headers(cfg), body: JSON.stringify({ refresh_token: s.refreshToken }) });
  return toSession(await r.json(), s);
}

export type Role = 'owner' | 'admin' | 'team_leader' | 'agent' | 'limited';
/** The person's team workspace and role. First sign-in creates their own workspace (owner); an invitation joins
 *  the inviter's workspace with the invited role. No row back = access deactivated. */
export async function membership(cfg: SyncConfig, s: Session, fetchFn: FetchFn = fetch): Promise<Session> {
  const r = await call(fetchFn, `${cfg.supabaseUrl}/rest/v1/rpc/eab_my_membership`, { method: 'POST', headers: headers(cfg, s.accessToken), body: '{}' });
  const rows = (await r.json()) as { workspace_id: string; workspace_name: string; role: Role }[];
  if (!rows?.length) throw new SyncError('no-access');
  return { ...s, workspaceId: rows[0].workspace_id, workspaceName: rows[0].workspace_name, role: rows[0].role };
}

type Rec = Record<string, unknown>;

function holdsRealData(state: AppState): boolean {
  if (state.meta.tombstones.length || state.meta.dirty.length) return true;
  return COLLECTIONS.some(c => (state[c] as unknown as { sample?: boolean }[]).some(r => !r.sample));
}

/** True when this phone still holds real records (or waiting deletions) that belong to a DIFFERENT team workspace than
 *  the one `sessionWorkspaceId` signs in to. Sample data does not count. Such a phone must neither show those records
 *  to the new account nor send anything to the new workspace. */
export function holdsOtherWorkspaceData(state: AppState, sessionWorkspaceId: string | undefined): boolean {
  const owner = state.meta.syncWorkspaceId;
  if (!owner || !sessionWorkspaceId || owner === sessionWorkspaceId) return false;
  return holdsRealData(state);
}

/** True when real records are on this phone, nothing says which team they belong to, and the phone is NOT positively known
 *  to be a genuinely new one. "Genuinely new" means: this version's first start found the database empty (`ownerFresh`) and
 *  the phone has never synced. Anything else - an older version's data, an intermediate build's marker without a history, or
 *  a previous sync - cannot be told apart reliably, so the person must say before anything is sent or shown (the app
 *  cannot verify the answer). Occasionally this asks a new phone once. */
export function ownerUnknownWithData(state: AppState, sessionWorkspaceId: string | undefined): boolean {
  const m = state.meta;
  return !m.syncWorkspaceId && !!sessionWorkspaceId && (!!m.lastSync || !m.ownerFresh) && holdsRealData(state);
}

/** The person says the records on this phone belong to the team they are signed in to. Nothing is changed or removed. */
export function confirmOwner(store: Store): void {
  const ws = store.getState().meta.syncSession?.workspaceId;
  if (ws) store.setSingleton('meta', { syncWorkspaceId: ws, ownerUnknown: undefined });
}

export interface CloudRow { collection: string; id: string; data: Rec | null; deleted: boolean; rev: number; seq?: number }

export interface SyncResult { pushed: number; pulled: number; removed: number; conflicts: number; filesUp?: number; filesDown?: number; filesFailed?: number;
  /** Change 010: shared records taken in / dropped because access ended; the Team Workspace part failed (network). */
  sharedIn?: number; sharedGone?: number; teamFailed?: boolean; auditSent?: number; auditReceived?: number; auditFailed?: boolean }

/** Runs one sync. While it runs the store reports `syncing`, so the status line can say "Syncing…" and only say
 *  "Synced" after the cloud really answered. */
export type SyncOptions = FileSyncOptions & { /** false: skip the Change 010 Team Workspace part. */ team?: boolean };
export async function syncNow(store: Store, cfg: SyncConfig, fetchFn: FetchFn = fetch, opts: SyncOptions = {}): Promise<SyncResult> {
  if (!configured(cfg)) throw new SyncError('not-configured');
  if (!store.getState().meta.syncSession) throw new SyncError('not-signed-in');
  if (store.syncing) return { pushed: 0, pulled: 0, removed: 0, conflicts: 0 };   // one sync at a time
  store.setSyncing(true);
  try { return await syncOnce(store, cfg, fetchFn, opts); } finally { store.setInflight(store.getState().meta.dirty, false); store.setSyncing(false); }
}

const split = (key: string): [CollectionName, string] => { const i = key.indexOf(':'); return [key.slice(0, i) as CollectionName, key.slice(i + 1)]; };
const find = (store: Store, key: string): (Rec & { id: string }) | undefined => {
  const [c, id] = split(key);
  return (store.getState()[c] as unknown as (Rec & { id: string })[] | undefined)?.find(x => x.id === id);
};
const metaNow = (store: Store) => store.getState().meta;
const patchMeta = (store: Store, f: (m: Meta) => Partial<Meta>) => store.setSingleton('meta', f(metaNow(store)));
const clearPending = (store: Store, key: string) => patchMeta(store, m => ({
  dirty: m.dirty.filter(k => k !== key), tombstones: m.tombstones.filter(k => k !== key),
  recErrors: m.recErrors && key in m.recErrors ? Object.fromEntries(Object.entries(m.recErrors).filter(([k]) => k !== key)) : m.recErrors,
}));
const setConflict = (store: Store, c: Conflict) => patchMeta(store, m => ({ conflicts: [...(m.conflicts ?? []).filter(x => x.key !== c.key), c] }));
export const dropConflict = (store: Store, key: string) => patchMeta(store, m => ({ conflicts: (m.conflicts ?? []).filter(x => x.key !== key) }));
const cloudBase = (row: CloudRow): CloudBase => ({ rev: row.rev, deleted: row.deleted, data: row.deleted ? null : row.data, hash: recordHash(row.deleted ? null : row.data) });
const isSampleData = (d: Rec | null) => !!(d && (d as { sample?: boolean }).sample);

type Taken = 'skipped' | 'applied' | 'removed' | 'repush' | 'conflict' | 'cleared';

/** Takes one cloud row into this phone. Never overwrites a change that is still waiting to be sent. */
export function takeRemote(store: Store, row: CloudRow, role: string | undefined): Taken {
  if (!(COLLECTIONS as string[]).includes(row.collection) || isSampleData(row.data)) return 'skipped';
  const c = row.collection as CollectionName;
  const key = `${c}:${row.id}`;
  const base = store.getBase(key);
  if (base && base.rev >= row.rev) return 'skipped';                    // already known (our own write coming back, or an old row)
  const m = metaNow(store);
  const local = find(store, key);
  const dirty = m.dirty.includes(key);
  const tomb = m.tombstones.includes(key);
  const incoming = cloudBase(row);

  if (!dirty) {
    store.setBase(key, incoming);
    if (row.deleted) { if (local) { store.applyRemote(c, row.id, null); return 'removed'; } return 'skipped'; }
    if (!local || recordHash(local) !== incoming.hash) { store.applyRemote(c, row.id, row.data); return 'applied'; }
    return 'skipped';
  }

  // A change is waiting here AND the cloud has a newer version: never overwrite either side silently.
  if (role === 'limited') {
    // This person can only read. Their own edit is kept in the history, and the cloud's copy is taken.
    if (local) store.saveRevision(key, local, 'conflict', 'edit made while read-only');
    store.setBase(key, incoming);
    clearPending(store, key);
    if (row.deleted) { if (local) store.applyRemote(c, row.id, null); return 'removed'; }
    store.applyRemote(c, row.id, row.data);
    return 'applied';
  }
  const now = Date.now();
  if (tomb && !local) {                                                   // deleted here
    if (row.deleted) { store.setBase(key, incoming); clearPending(store, key); return 'cleared'; }
    if (row.data) store.saveRevision(key, row.data, 'conflict', 'edited elsewhere while deleted here');
    setConflict(store, { key, collection: c, id: row.id, at: now, kind: 'deleted-local', remote: { rev: row.rev, data: row.data, deleted: false } });
    return 'conflict';
  }
  if (!local) return 'skipped';
  if (row.deleted) {                                                      // deleted elsewhere, edited here
    store.saveRevision(key, local, 'conflict', 'edited here while deleted elsewhere');
    setConflict(store, { key, collection: c, id: row.id, at: now, kind: 'deleted-remote', remote: { rev: row.rev, data: null, deleted: true } });
    return 'conflict';
  }
  const remoteData = row.data as Rec;
  store.saveRevision(key, remoteData, 'cloud', 'cloud version when joining');
  const { merged, conflicts } = merge3(base?.data ?? null, local, remoteData);
  if (conflicts.length) {
    setConflict(store, { key, collection: c, id: row.id, at: now, kind: 'fields', fields: conflicts, remote: { rev: row.rev, data: remoteData, deleted: false } });
    return 'conflict';
  }
  // No field disagrees: the joined record keeps both sides' changes and is sent on top of the cloud's version.
  store.setBase(key, incoming);
  dropConflict(store, key);
  if (recordHash(merged) === incoming.hash) { store.applyRemote(c, row.id, remoteData); clearPending(store, key); return 'applied'; }
  store.upsert(c, merged as never, false, 'merge', 'joined with a change from another phone');
  return 'repush';
}

async function pullAll(store: Store, cfg: SyncConfig, session: Session, ws: string, fetchFn: FetchFn, tally: SyncResult): Promise<boolean> {
  let again = false;
  for (let page = 0; page < 200; page++) {
    const since = metaNow(store).lastSeq ?? 0;
    const r = await call(fetchFn, `${cfg.supabaseUrl}/rest/v1/${TABLE}?select=collection,id,data,deleted,rev,seq&workspace_id=eq.${ws}&seq=gt.${since}&order=seq.asc&limit=500`, { headers: headers(cfg, session.accessToken) });
    const rows = (await r.json()) as CloudRow[];
    for (const row of rows) {
      const t = takeRemote(store, row, session.role);
      if (t === 'applied') tally.pulled++; else if (t === 'removed') tally.removed++; else if (t === 'repush') again = true;
    }
    if (rows.length) patchMeta(store, () => ({ lastSeq: Math.max(since, ...rows.map(x => x.seq ?? 0)) }));
    if (rows.length < 500) break;
  }
  return again;
}

interface PushOut { collection: string; id: string; status: 'ok' | 'conflict' | 'ref_conflict' | 'denied'; rev?: number; deleted?: boolean; data?: Rec | null;
  ref_no?: number; ref?: string; other_ref?: string; other_id?: string | null; other_title?: string | null; other_visible?: boolean }

/** Sends waiting changes to workspace `ws`. `only` picks which waiting records belong there (Change 010: my own records go
 *  to my workspace; a record another agent shares with me goes to THEIR workspace). Default: every waiting record. */
export async function pushAll(store: Store, cfg: SyncConfig, session: Session, ws: string, fetchFn: FetchFn, tally: SyncResult, only?: (key: string) => boolean, asRole?: string): Promise<boolean> {
  if ((asRole ?? session.role) === 'limited') return false;
  const m = metaNow(store);
  const blocked = new Set((m.conflicts ?? []).map(c => c.key));
  const deviceId = m.deviceId ?? 'device';
  const rows: (Rec & { _hash: string; _key: string })[] = [];
  for (const key of m.dirty) {
    if (blocked.has(key)) continue;
    if (only && !only(key)) continue;
    const rec = find(store, key);
    if (rec?.sample || (!rec && isSampleKey(key))) { clearPending(store, key); continue; }   // sample data never goes up
    const base = store.getBase(key);
    if (rec) {
      const h = recordHash(rec);
      if (base && !base.deleted && base.hash === h) { clearPending(store, key); continue; }  // changed and changed back: nothing to send
      rows.push({ _key: key, _hash: h, collection: split(key)[0], id: rec.id, base_rev: base?.rev ?? 0, data: rec, deleted: false, updated: rec.updated, op_id: `${deviceId}.${hash53(`${key}|${h}|${base?.rev ?? 0}`)}` });
    } else if (m.tombstones.includes(key)) {
      if (!base) { clearPending(store, key); continue; }                                     // never reached the cloud: nothing to delete there
      rows.push({ _key: key, _hash: 'deleted', collection: split(key)[0], id: split(key)[1], base_rev: base.rev, data: null, deleted: true, updated: Date.now(), op_id: `${deviceId}.${hash53(`${key}|deleted|${base.rev}`)}` });
    } else clearPending(store, key);
  }
  let again = false;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    store.setInflight(chunk.map(r => r._key), true);
    const payload = chunk.map(({ _hash, _key, ...rest }) => { void _hash; void _key; return rest; });
    const r = await call(fetchFn, `${cfg.supabaseUrl}/rest/v1/rpc/eab_push_records`, { method: 'POST', headers: headers(cfg, session.accessToken), body: JSON.stringify({ ws, rows: payload }) });
    const out = (await r.json()) as PushOut[];
    store.setInflight(chunk.map(x => x._key), false);
    chunk.forEach((sent, idx) => {
      const res = out[idx] && out[idx].collection === sent.collection && out[idx].id === sent.id ? out[idx] : out.find(o => o.collection === sent.collection && o.id === sent.id);
      if (!res) return;                                                                      // no answer for it: stays waiting
      const key = sent._key;
      if (res.status === 'ok') {
        tally.pushed++;
        const wasDelete = sent.deleted === true;
        store.setBase(key, { rev: res.rev!, deleted: wasDelete, data: wasDelete ? null : (sent.data as Rec), hash: recordHash(wasDelete ? null : sent.data) });
        const now = find(store, key);
        // Only clear the waiting mark when this phone still holds exactly what was accepted. A change made during the
        // upload stays waiting and is sent next time (on top of the version just accepted).
        const unchanged = wasDelete ? !now : !!now && recordHash(now) === sent._hash;
        if (unchanged) clearPending(store, key); else again = true;
      } else if (res.status === 'conflict') {
        const t = takeRemote(store, { collection: sent.collection as string, id: sent.id as string, data: res.data ?? null, deleted: !!res.deleted, rev: res.rev! }, session.role);
        if (t === 'repush') again = true;
        if (t === 'skipped') {   // the base was already at that version: treat as a refusal we cannot explain, keep waiting
          patchMeta(store, mm => ({ recErrors: { ...(mm.recErrors ?? {}), [key]: 'conflict-unresolved' } }));
        }
      } else if (res.status === 'ref_conflict') {
        const rec = find(store, key);
        setConflict(store, { key, collection: split(key)[0], id: split(key)[1], at: Date.now(), kind: 'reference',
          ref: { ref: res.ref ?? String(rec?.ref ?? ''), refNo: res.ref_no ?? 0, otherRef: res.other_ref, otherId: res.other_id ?? undefined, otherTitle: res.other_title ?? undefined, otherVisible: !!res.other_visible } });
      } else {
        patchMeta(store, mm => ({ recErrors: { ...(mm.recErrors ?? {}), [key]: 'denied' } }));
      }
    });
  }
  return again;
}

async function syncOnce(store: Store, cfg: SyncConfig, fetchFn: FetchFn, opts: SyncOptions): Promise<SyncResult> {
  const start = metaNow(store);
  if (!start.syncSession) throw new SyncError('not-signed-in');
  let session = await fresh(cfg, start.syncSession, fetchFn);
  // Checked on every sync, so a deactivated account or a changed role is noticed straight away (and "no access" is
  // never reported as "synced").
  try { session = await membership(cfg, session, fetchFn); }
  catch (e) {
    // Access switched off (or the account disabled): nothing another agent shared stays readable on this phone.
    if (e instanceof SyncError && e.code === 'no-access' && Object.keys(metaNow(store).shared ?? {}).length) { dropAllShared(store); store.setSingleton('meta', { team: undefined }); }
    throw e;
  }
  // Another team's records are still on this phone: stop before anything is read, changed or sent.
  if (holdsOtherWorkspaceData(store.getState(), session.workspaceId)) throw new SyncError('other-workspace');
  if (ownerUnknownWithData(store.getState(), session.workspaceId)) throw new SyncError('owner-unknown');
  if (JSON.stringify(session) !== JSON.stringify(start.syncSession)) store.setSingleton('meta', { syncSession: session });
  const ws = session.workspaceId!;
  if (!metaNow(store).deviceId) store.setSingleton('meta', { deviceId: `d${hash53(`${Math.random()}|${Date.now()}`).slice(0, 10)}` });
  if (metaNow(store).syncWorkspaceId !== ws) {
    // A different team workspace: its change numbers and versions have nothing to do with the last one's.
    for (const k of store.baseKeys()) store.setBase(k, undefined);
    store.setSingleton('meta', { syncWorkspaceId: ws, lastSeq: 0 });
  }
  await store.flush();

  // A property-number conflict is lifted once the number was changed; the person can also ask to check again.
  for (const cf of metaNow(store).conflicts ?? []) {
    if (cf.kind !== 'reference') continue;
    const rec = find(store, cf.key);
    if (!rec || String(rec.ref ?? '').toUpperCase() !== (cf.ref?.ref ?? '').toUpperCase()) dropConflict(store, cf.key);
  }

  const tally: SyncResult = { pushed: 0, pulled: 0, removed: 0, conflicts: 0 };
  // Change 010: records another agent shares with me are sent to THEIR workspace by syncShared, never to mine.
  const mine = (key: string) => !metaNow(store).shared?.[key];
  let again = await pullAll(store, cfg, session, ws, fetchFn, tally);
  again = (await pushAll(store, cfg, session, ws, fetchFn, tally, mine)) || again;
  for (let round = 0; again && round < 3; round++) {
    again = await pullAll(store, cfg, session, ws, fetchFn, tally);
    again = (await pushAll(store, cfg, session, ws, fetchFn, tally, mine)) || again;
  }
  // Change 010: Team Workspace, records shared with me (fetch new, drop revoked, send my edits). A cloud without the
  // Change 010 functions simply has no Team Workspace; that never fails the sync of my own records.
  if (opts.team !== false) {
    try { await syncShared(store, cfg, session, fetchFn, tally); }
    catch (e) {
      if (!(e instanceof TeamError && e.code === 'unavailable')) tally.teamFailed = true;
      else if (metaNow(store).team || Object.keys(metaNow(store).shared ?? {}).length) { dropAllShared(store); store.setSingleton('meta', { team: undefined }); }
    }
  }
  tally.conflicts = (metaNow(store).conflicts ?? []).length;
  // Change 010: audit history up and down (never fails the sync of the records themselves).
  if (opts.team !== false) {
    try { const a = await syncAudit(store, cfg, fetchFn); tally.auditSent = a.sent; tally.auditReceived = a.received; }
    catch { tally.auditFailed = true; }
  }
  // Pictures and documents go after the records they belong to. One bad file never fails the sync.
  try {
    const f = await syncFiles(store, cfg, session, ws, fetchFn, { ...opts, only: r => !metaNow(store).shared?.[`${r.collection}:${r.recordId}`] });
    tally.filesUp = f.uploaded; tally.filesDown = f.downloaded; tally.filesFailed = f.failed;
  } catch { tally.filesFailed = (tally.filesFailed ?? 0) + 1; }
  // Pictures of records shared with me live in their owner's workspace.
  for (const [sws, level] of sharedWorkspaces(store)) {
    try {
      const f = await syncFiles(store, cfg, session, sws, fetchFn, { ...opts, noCleanup: true, readOnly: level !== 'edit', only: r => metaNow(store).shared?.[`${r.collection}:${r.recordId}`]?.workspaceId === sws });
      tally.filesUp = (tally.filesUp ?? 0) + f.uploaded; tally.filesDown = (tally.filesDown ?? 0) + f.downloaded; tally.filesFailed = (tally.filesFailed ?? 0) + f.failed;
    } catch { tally.filesFailed = (tally.filesFailed ?? 0) + 1; }
  }
  // "Synced" needs a finished sync. Whatever is still waiting (an edit made during the upload, a record that is in
  // conflict) keeps its own waiting/conflict state and the overall line will not say Synced.
  patchMeta(store, () => ({ lastSync: Date.now(), syncError: undefined }));
  return tally;
}

/** Puts a record's pending state back to "send again" after the person chose how to settle a conflict. */
export function resolveConflict(store: Store, key: string, choice: { fields?: Record<string, 'local' | 'remote'>; whole?: 'local' | 'remote' }) {
  const cf = (metaNow(store).conflicts ?? []).find(c => c.key === key);
  if (!cf) return false;
  const [c, id] = split(key);
  const local = find(store, key);
  const remote = cf.remote;
  if (cf.kind === 'fields' && local && remote?.data) {
    const base = store.getBase(key);
    const { merged, conflicts } = merge3(base?.data ?? null, local, remote.data);
    const picks: Record<string, 'local' | 'remote'> = {};
    for (const f of conflicts) picks[f.field] = choice.fields?.[f.field] ?? choice.whole ?? 'local';
    const resolved = applyChoices(merged, conflicts, picks);
    store.setBase(key, { rev: remote.rev, deleted: false, data: remote.data, hash: recordHash(remote.data) });
    dropConflict(store, key);
    if (recordHash(resolved) === recordHash(remote.data)) { store.applyRemote(c, id, remote.data, 'merge'); clearPending(store, key); }
    else store.upsert(c, { ...resolved, id } as never, false, 'merge', 'settled by you');
    return true;
  }
  if (cf.kind === 'deleted-remote') {
    store.setBase(key, { rev: remote!.rev, deleted: true, data: null, hash: recordHash(null) });
    dropConflict(store, key);
    if (choice.whole === 'remote') { store.applyRemote(c, id, null); clearPending(store, key); }   // accept the deletion
    else if (local) store.upsert(c, local as never, false, 'merge', 'kept after it was deleted elsewhere');    // keep it: send it again
    return true;
  }
  if (cf.kind === 'deleted-local') {
    store.setBase(key, { rev: remote!.rev, deleted: false, data: remote!.data, hash: recordHash(remote!.data) });
    dropConflict(store, key);
    if (choice.whole === 'remote' && remote?.data) { store.applyRemote(c, id, remote.data, 'merge'); clearPending(store, key); }   // bring it back
    // otherwise the deletion stays pending and is sent on top of the newer version
    return true;
  }
  if (cf.kind === 'reference') { dropConflict(store, key); return true; }   // check again on the next sync
  return false;
}
