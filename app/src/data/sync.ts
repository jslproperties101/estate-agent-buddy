// Optional cloud copy in Supabase (the backend approved in the master document). The phone's own storage is always
// the working copy, so the app works offline; "Sync now" sends changed records up and brings newer ones down.
// Needs SUPABASE URL + anon key (Profile → Settings, or EAB_SUPABASE_URL / EAB_SUPABASE_ANON_KEY at build time),
// the table in supabase/migrations/, and a Supabase user (email + password) created by the owner.
// Conflicts: the most recently changed copy of a record wins. Photos and documents stay on the phone (not synced yet).
import type { Store } from './store';
import { COLLECTIONS, CollectionName, Meta } from './types';

export interface SyncConfig { supabaseUrl: string; supabaseAnonKey: string }
export type Session = NonNullable<Meta['syncSession']>;
type FetchFn = typeof fetch;

export class SyncError extends Error {
  constructor(public code: 'not-configured' | 'not-signed-in' | 'auth' | 'network' | 'server', message?: string) { super(message ?? code); }
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

function toSession(j: { access_token: string; refresh_token: string; expires_in: number; user: { id: string; email: string } }): Session {
  return { accessToken: j.access_token, refreshToken: j.refresh_token, expiresAt: Date.now() + j.expires_in * 1000, email: j.user.email, userId: j.user.id };
}

export const configured = (cfg: SyncConfig) => !!(cfg.supabaseUrl && cfg.supabaseAnonKey);

export async function signIn(cfg: SyncConfig, email: string, password: string, fetchFn: FetchFn = fetch): Promise<Session> {
  if (!configured(cfg)) throw new SyncError('not-configured');
  const r = await call(fetchFn, `${cfg.supabaseUrl}/auth/v1/token?grant_type=password`, { method: 'POST', headers: headers(cfg), body: JSON.stringify({ email, password }) });
  return toSession(await r.json());
}

async function fresh(cfg: SyncConfig, s: Session, fetchFn: FetchFn): Promise<Session> {
  if (s.expiresAt - Date.now() > 60_000) return s;
  const r = await call(fetchFn, `${cfg.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: headers(cfg), body: JSON.stringify({ refresh_token: s.refreshToken }) });
  return toSession(await r.json());
}

interface Row { collection: string; id: string; data: Record<string, unknown> | null; deleted: boolean; updated: number }

export interface SyncResult { pushed: number; pulled: number; removed: number }

export async function syncNow(store: Store, cfg: SyncConfig, fetchFn: FetchFn = fetch): Promise<SyncResult> {
  if (!configured(cfg)) throw new SyncError('not-configured');
  const start = store.getState().meta;
  if (!start.syncSession) throw new SyncError('not-signed-in');
  const session = await fresh(cfg, start.syncSession, fetchFn);
  if (session !== start.syncSession) store.setSingleton('meta', { syncSession: session });
  await store.flush();

  // 1. Bring down everything changed in the cloud since the last sync (with a 5-minute margin for clock drift).
  const since = Math.max(0, (start.lastSync ?? 0) - 300_000);
  const r = await call(fetchFn, `${cfg.supabaseUrl}/rest/v1/${TABLE}?select=collection,id,data,deleted,updated&updated=gt.${since}&order=updated.asc`, { headers: headers(cfg, session.accessToken) });
  const rows = (await r.json()) as Row[];
  let pulled = 0, removed = 0;
  const remoteNewer = new Set<string>();
  for (const row of rows) {
    if (!(COLLECTIONS as string[]).includes(row.collection)) continue;
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
  const toPush = m.dirty.filter(k => !remoteNewer.has(k));
  const body: (Row & { user_id: string })[] = [];
  for (const key of toPush) {
    const [c, id] = key.split(':') as [CollectionName, string];
    const rec = (store.getState()[c] as { id: string; updated: number }[] | undefined)?.find(x => x.id === id);
    if (rec) body.push({ user_id: session.userId, collection: c, id, data: rec as unknown as Record<string, unknown>, deleted: false, updated: rec.updated });
    else if (m.tombstones.includes(key)) body.push({ user_id: session.userId, collection: c, id, data: null, deleted: true, updated: Date.now() });
  }
  for (let i = 0; i < body.length; i += 200) {
    await call(fetchFn, `${cfg.supabaseUrl}/rest/v1/${TABLE}?on_conflict=user_id,collection,id`, {
      method: 'POST', headers: { ...headers(cfg, session.accessToken), prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(body.slice(i, i + 200)),
    });
  }
  const after = store.getState().meta;
  store.setSingleton('meta', {
    dirty: after.dirty.filter(k => !m.dirty.includes(k)),
    tombstones: after.tombstones.filter(k => !m.tombstones.includes(k)),
    lastSync: Date.now(),
  });
  return { pushed: body.length, pulled, removed };
}
