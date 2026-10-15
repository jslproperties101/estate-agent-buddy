// Change 010: keeping the records other agents share with me in step with the cloud. Runs inside every sync, after my
// own records. The cloud's answer is the only source of truth for who may see what:
//  1. eab_team_status   → my Team Workspace (members, invitations, what I share, deletion requests).
//  2. eab_shared_index  → every record shared with me RIGHT NOW, with its version and my level.
//  3. A record that is no longer listed is forgotten on this phone at once (the record, its history, drafts, waiting
//     changes and pictures): access ends the moment the owner stops sharing, the team ends, or an account is disabled.
//  4. New or newer records are fetched from their owner's workspace (row-level security allows exactly these).
//  5. My edits to records shared with me as View and Edit are sent to the OWNER's workspace, with the same version
//     checks and conflict handling as my own records. Nothing is ever sent for a View Only record.
import type { Store } from '../data/store';
import { pushAll, takeRemote, supabaseCall, supabaseHeaders, fresh, CloudRow, SyncConfig, SyncResult, Session } from '../data/sync';
import type { CollectionName, ShareLevel, SharedInfo } from '../data/types';
import { refreshTeam, rpc } from './api';
import { SHAREABLE } from './access';

type FetchFn = typeof fetch;
interface IndexRow { workspace_id: string; collection: CollectionName; id: string; rev: number; deleted: boolean; level: ShareLevel; owner_id: string; owner_email: string; owner_name: string | null }

/** Workspaces I hold shared records from, with the highest level I have in each. */
export function sharedWorkspaces(store: Store): Map<string, ShareLevel> {
  const out = new Map<string, ShareLevel>();
  for (const info of Object.values(store.getState().meta.shared ?? {})) {
    if (info.level === 'edit' || !out.has(info.workspaceId)) out.set(info.workspaceId, info.level);
  }
  return out;
}

const split = (key: string): [CollectionName, string] => { const i = key.indexOf(':'); return [key.slice(0, i) as CollectionName, key.slice(i + 1)]; };

export async function syncShared(store: Store, cfg: SyncConfig, session: Session, fetchFn: FetchFn, tally: SyncResult): Promise<void> {
  await refreshTeam(store, cfg, fetchFn);
  const index = await rpc<IndexRow[]>(store, cfg, 'eab_shared_index', {}, fetchFn);
  const prev = store.getState().meta.shared ?? {};
  const next: Record<string, SharedInfo> = {};
  for (const r of index ?? []) {
    if (!SHAREABLE.includes(r.collection) || r.deleted) continue;
    next[`${r.collection}:${r.id}`] = { workspaceId: r.workspace_id, ownerId: r.owner_id, ownerEmail: r.owner_email, ownerName: r.owner_name, level: r.level === 'edit' ? 'edit' : 'view' };
  }
  // 3. No longer shared (or deleted by its owner): forget it here.
  let gone = 0;
  for (const key of Object.keys(prev)) {
    if (next[key]) continue;
    const [c, id] = split(key);
    store.forgetRecord(c, id);
    gone++;
  }
  // A record I own is never treated as someone else's, whatever the list says.
  for (const key of Object.keys(next)) {
    const [c, id] = split(key);
    if (!prev[key] && (store.getState()[c] as { id: string }[]).some(x => x.id === id)) delete next[key];
  }
  store.setSingleton('meta', { shared: next });
  tally.sharedGone = gone;

  // 4. Fetch what is new or newer, per owner workspace and kind of record.
  const want = new Map<string, { ws: string; c: CollectionName; ids: string[] }>();
  for (const r of index ?? []) {
    const key = `${r.collection}:${r.id}`;
    if (!next[key]) continue;
    const base = store.getBase(key);
    if (base && base.rev >= r.rev) continue;            // already have this version (or deleted it here, waiting to send)
    const g = `${r.workspace_id}|${r.collection}`;
    if (!want.has(g)) want.set(g, { ws: r.workspace_id, c: r.collection, ids: [] });
    want.get(g)!.ids.push(r.id);
  }
  let s = await fresh(cfg, store.getState().meta.syncSession ?? session, fetchFn);
  if (s !== store.getState().meta.syncSession) store.setSingleton('meta', { syncSession: s });
  let taken = 0;
  for (const { ws, c, ids } of want.values()) {
    for (let i = 0; i < ids.length; i += 100) {
      const list = ids.slice(i, i + 100).map(x => `"${x.replace(/"/g, '')}"`).join(',');
      const r = await supabaseCall(fetchFn, `${cfg.supabaseUrl}/rest/v1/eab_records?select=collection,id,data,deleted,rev,seq&workspace_id=eq.${ws}&collection=eq.${c}&id=in.(${encodeURIComponent(list)})`, { headers: supabaseHeaders(cfg, s.accessToken) });
      for (const row of (await r.json()) as CloudRow[]) {
        const key = `${row.collection}:${row.id}`;
        const info = store.getState().meta.shared?.[key];
        if (!info) continue;
        const t = takeRemote(store, row, info.level === 'view' ? 'limited' : undefined);
        if (t === 'applied') taken++;
      }
    }
  }
  tally.sharedIn = taken;

  // 5. Send my edits of records shared with me as View and Edit, to their owner's workspace.
  s = store.getState().meta.syncSession ?? s;
  for (const [ws] of sharedWorkspaces(store)) {
    const only = (key: string) => { const info = store.getState().meta.shared?.[key]; return !!info && info.workspaceId === ws && info.level === 'edit'; };
    let again = await pushAll(store, cfg, s, ws, fetchFn, tally, only, 'agent');
    for (let round = 0; again && round < 2; round++) again = await pushAll(store, cfg, s, ws, fetchFn, tally, only, 'agent');
  }
}
