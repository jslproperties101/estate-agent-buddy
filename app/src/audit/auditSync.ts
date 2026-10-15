// Change 010: audit history in the cloud (eab_audit_events, insert-only). Runs inside every sync, after the records:
//  - my entries go up to the workspace their record lives in (mine, or the owner's for a record shared with me), once
//    that record has reached the cloud. Who wrote them is stamped by the database from the sign-in, not by the phone.
//  - entries come down for every record I may read right now (the cloud's row-level security decides), plus Team
//    Workspace events. Entries are merged by id: never duplicated, never edited.
// A cloud without the Change 010 update answers 404: audit history then stays on this phone, and nothing fails.
import type { Store } from '../data/store';
import { supabaseCall, supabaseHeaders, fresh, SyncConfig, SyncError } from '../data/sync';
import type { AuditEntry, AuditAction } from './model';

type FetchFn = typeof fetch;
const SENDABLE: AuditAction[] = ['create', 'edit', 'archive', 'restore', 'delete', 'export'];
interface Row { id: string; workspace_id: string | null; collection: string | null; record_id: string | null; owner_id: string | null; team_id: string | null;
  actor: string; actor_name: string | null; actor_email: string | null; action: AuditAction; changes: AuditEntry['changes'] | null; detail: Record<string, unknown> | null; at: string; seq: number }

export const entryFromRow = (r: Row): AuditEntry => ({
  id: r.id, collection: r.collection ?? undefined, recordId: r.record_id ?? undefined, workspaceId: r.workspace_id ?? undefined, ownerId: r.owner_id ?? undefined,
  teamId: r.team_id ?? undefined, actorId: r.actor, actorName: r.actor_name, actorEmail: r.actor_email, action: r.action,
  changes: r.changes ?? undefined, detail: r.detail ?? undefined, at: Date.parse(r.at), seq: r.seq,
});
const keyOfRow = (r: Row) => (r.record_id && r.collection ? `${r.collection}:${r.record_id}` : 'team');

export interface AuditSyncResult { sent: number; received: number; unavailable?: boolean }

export async function syncAudit(store: Store, cfg: SyncConfig, fetchFn: FetchFn = fetch): Promise<AuditSyncResult> {
  const res: AuditSyncResult = { sent: 0, received: 0 };
  const s0 = store.getState().meta.syncSession;
  if (!s0) return res;
  const s = await fresh(cfg, s0, fetchFn);
  if (s !== s0) store.setSingleton('meta', { syncSession: s });
  const h = supabaseHeaders(cfg, s.accessToken);
  try {
    // ---- up ----
    const outbox = await store.auditOutbox();
    const groups = new Map<string, { row: Record<string, unknown>; id: string }[]>();
    for (const { key, id } of outbox) {
      const e = (await store.auditEntries(key)).find(x => x.id === id);
      if (!e || !SENDABLE.includes(e.action)) { store.auditSent(id); continue; }
      const info = store.getState().meta.shared?.[key];
      const ws = info?.workspaceId ?? s.workspaceId;
      const i = key.indexOf(':');
      const c = key.slice(0, i), rid = key.slice(i + 1);
      const mine = !info;
      const here = (store.getState()[c as 'properties'] as { id: string }[] | undefined)?.some(x => x.id === rid);
      if (!mine && !here) { store.auditSent(id); continue; }                    // access ended: nothing more to send
      const base = store.getBase(key);
      if (!base) continue;                                                       // the record goes first
      if (!ws) continue;
      if (!groups.has(ws)) groups.set(ws, []);
      groups.get(ws)!.push({ id, row: { id: e.id, workspace_id: ws, collection: c, record_id: rid, action: e.action, changes: e.changes ?? null, detail: e.detail ?? null, at: new Date(e.at).toISOString() } });
    }
    for (const items of groups.values()) {
      const post = (rows: Record<string, unknown>[]) => supabaseCall(fetchFn, `${cfg.supabaseUrl}/rest/v1/eab_audit_events`, { method: 'POST', headers: { ...h, prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify(rows) });
      try { await post(items.map(x => x.row)); for (const x of items) { store.auditSent(x.id); res.sent++; } }
      catch (e) {
        if (e instanceof SyncError && e.code === 'network') throw e;
        for (const x of items) { try { await post([x.row]); store.auditSent(x.id); res.sent++; } catch (e2) { if (e2 instanceof SyncError && e2.code === 'network') throw e2; } }
      }
    }
    // ---- down ----
    for (let page = 0; page < 50; page++) {
      const since = store.getState().meta.lastAuditSeq ?? 0;
      const r = await supabaseCall(fetchFn, `${cfg.supabaseUrl}/rest/v1/eab_audit_events?select=*&seq=gt.${since}&order=seq.asc&limit=1000`, { headers: h });
      const rows = (await r.json()) as Row[];
      const byKey = new Map<string, AuditEntry[]>();
      for (const row of rows) { const k = keyOfRow(row); if (!byKey.has(k)) byKey.set(k, []); byKey.get(k)!.push(entryFromRow(row)); }
      for (const [k, list] of byKey) store.appendAudit(k, list);
      res.received += rows.length;
      if (rows.length) store.setSingleton('meta', { lastAuditSeq: Math.max(since, ...rows.map(x => x.seq)) });
      if (rows.length < 1000) break;
    }
  } catch (e) {
    if (e instanceof SyncError && e.code === 'server' && /^404\b/.test(e.message)) return { ...res, unavailable: true };
    throw e;
  }
  return res;
}
