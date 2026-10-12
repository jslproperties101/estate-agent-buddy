// Cloud copy in Supabase. The phone's own storage is always the working copy, so the app works offline; syncing sends
// changed records up and brings newer ones down for the signed-in person's team workspace.
// Needs SUPABASE URL + anon key (Agent Profile → Settings, or EAB_SUPABASE_URL / EAB_SUPABASE_ANON_KEY at build time),
// the tables in supabase/migrations/, and Google sign-in (data/auth.ts).
// Who sees what is decided by the database (row-level security), not by this code: owner and admin see the whole
// workspace, a team leader reads it all and edits own/assigned records, an agent sees own/assigned records, a limited
// user only reads own/assigned records (its changes stay on the phone).
// Conflicts: the most recently changed copy of a record wins. Photos and documents stay on the phone (not synced yet).
// Sample records are never sent up or taken down, so they never mix with real data in the team workspace.
import type { Store } from './store';
import { COLLECTIONS, CollectionName, Meta } from './types';
import { isSampleKey } from './sample';

export interface SyncConfig { supabaseUrl: string; supabaseAnonKey: string }
export type Session = NonNullable<Meta['syncSession']>;
type FetchFn = typeof fetch;

export class SyncError extends Error {
  constructor(public code: 'not-configured' | 'not-signed-in' | 'auth' | 'network' | 'server' | 'no-access', message?: string) { super(message ?? code); }
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

export interface TokenResponse { access_token: string; refresh_token: string; expires_in: number; user: { id: string; email: string; user_metadata?: { full_name?: string; name?: string; avatar_url?: string } } }
export function toSession(j: TokenResponse, keep?: Partial<Session>): Session {
  return {
    ...keep,
    accessToken: j.access_token, refreshToken: j.refresh_token, expiresAt: Date.now() + j.expires_in * 1000, email: j.user.email, userId: j.user.id,
    name: j.user.user_metadata?.full_name ?? j.user.user_metadata?.name ?? keep?.name,
  };
}
export { call as supabaseCall, headers as supabaseHeaders };

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

interface Row { collection: string; id: string; data: Record<string, unknown> | null; deleted: boolean; updated: number }

export interface SyncResult { pushed: number; pulled: number; removed: number }

export async function syncNow(store: Store, cfg: SyncConfig, fetchFn: FetchFn = fetch): Promise<SyncResult> {
  if (!configured(cfg)) throw new SyncError('not-configured');
  const start = store.getState().meta;
  if (!start.syncSession) throw new SyncError('not-signed-in');
  let session = await fresh(cfg, start.syncSession, fetchFn);
  if (!session.workspaceId) session = await membership(cfg, session, fetchFn);
  if (session !== start.syncSession) store.setSingleton('meta', { syncSession: session });
  const ws = session.workspaceId!;
  await store.flush();

  // 1. Bring down everything changed in the cloud since the last sync (with a 5-minute margin for clock drift).
  const since = Math.max(0, (start.lastSync ?? 0) - 300_000);
  const r = await call(fetchFn, `${cfg.supabaseUrl}/rest/v1/${TABLE}?select=collection,id,data,deleted,updated&workspace_id=eq.${ws}&updated=gt.${since}&order=updated.asc`, { headers: headers(cfg, session.accessToken) });
  const rows = (await r.json()) as Row[];
  let pulled = 0, removed = 0;
  const remoteNewer = new Set<string>();
  for (const row of rows) {
    if (!(COLLECTIONS as string[]).includes(row.collection)) continue;
    if (row.data && (row.data as { sample?: boolean }).sample) continue; // sample data never comes from the cloud
    const c = row.collection as CollectionName;
    const key = `${c}:${row.id}`;
    const local = (store.getState()[c] as { id: string; updated: number }[]).find(x => x.id === row.id);
    const localDirty = store.getState().meta.dirty.includes(key);
    if (local && local.updated >= row.updated && localDirty) continue; // ours is newer: it is pushed below
    if (row.deleted) { if (local) { store.remove(c, row.id, true); removed++; } }
    else if (!local || row.updated > local.updated) { store.upsert(c, row.data as never, true); pulled++; }
    remoteNewer.add(key);
  }

  // 2. Send up what changed here and was not overtaken by a newer cloud copy.
  const m = store.getState().meta;
  // A limited user can only read: their changes stay on this phone.
  const toPush = session.role === 'limited' ? [] : m.dirty.filter(k => !remoteNewer.has(k));
  const body: (Row & { user_id: string; workspace_id: string })[] = [];
  for (const key of toPush) {
    const [c, id] = key.split(':') as [CollectionName, string];
    const rec = (store.getState()[c] as { id: string; updated: number; sample?: boolean }[] | undefined)?.find(x => x.id === id);
    // Sample records stay on this phone: they must never mix with the team's real data in the cloud.
    if (rec?.sample || (!rec && isSampleKey(key))) continue;
    if (rec) body.push({ user_id: session.userId, workspace_id: ws, collection: c, id, data: rec as unknown as Record<string, unknown>, deleted: false, updated: rec.updated });
    else if (m.tombstones.includes(key)) body.push({ user_id: session.userId, workspace_id: ws, collection: c, id, data: null, deleted: true, updated: Date.now() });
  }
  for (let i = 0; i < body.length; i += 200) {
    await call(fetchFn, `${cfg.supabaseUrl}/rest/v1/${TABLE}?on_conflict=workspace_id,collection,id`, {
      method: 'POST', headers: { ...headers(cfg, session.accessToken), prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(body.slice(i, i + 200)),
    });
  }
  const after = store.getState().meta;
  // Done with: everything sent, and anything a newer cloud copy replaced. (A limited user's own edits stay pending.)
  const cleared = new Set(session.role === 'limited' ? [...remoteNewer] : m.dirty);
  store.setSingleton('meta', {
    dirty: after.dirty.filter(k => !cleared.has(k)),
    tombstones: after.tombstones.filter(k => !cleared.has(k)),
    lastSync: Date.now(),
    syncError: undefined,
  });
  return { pushed: body.length, pulled, removed };
}
