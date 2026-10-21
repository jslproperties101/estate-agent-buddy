// A stand-in for a Supabase project with the Change 010 proposal applied: every agent has their OWN workspace, and a
// two-person Team Workspace with owner-controlled sharing. It follows the same rules as
// supabase/proposed/20261016000000_change010_team_sharing_audit.sql (tested against real PostgreSQL in
// supabase/tests/change010-test.sh) so the phone's code can be tested end to end. Nothing here touches a live project.
import { MemoryBackend } from '../../src/data/backend';
import { Store } from '../../src/data/store';
import type { SyncConfig } from '../../src/data/sync';

type Rec = Record<string, unknown>;
export const cfg: SyncConfig = { supabaseUrl: 'https://team.fake.co', supabaseAnonKey: 'anon' };
interface Row { data: Rec | null; deleted: boolean; rev: number; seq: number; op_id?: string; user_id: string }
interface User { id: string; email: string; name?: string; ws: string; disabled?: boolean }
type Level = 'view' | 'edit';
const BUYER = ['buyer', 'tenant', 'investor'], VENDOR = ['vendor', 'landlord'];

export class FakeTeamCloud {
  users = new Map<string, User>();            // by email
  rows = new Map<string, Row>();              // `${ws}|${collection}|${id}`
  seq = 0;
  team: { id: string; createdBy: string; members: string[]; ended?: boolean } | null = null;
  teamsEver = 0;
  invites: { id: string; teamId: string; by: string; email: string | null; token: string; status: string; expiresAt: number; answeredBy?: string; answeredAt?: number }[] = [];
  shares = new Map<string, Level>();           // `${teamId}|${ws}|${collection}|${id}` (recipient = the other member)
  shareAll = new Map<string, Level>();         // `${teamId}|${ownerId}|${scope}`
  /** JoyChange010-05: "Include confidential documents" switches, `${teamId}|${ownerId}|all` or `${teamId}|${ownerId}|${ws}|${id}`. */
  confidential = new Set<string>();
  deleteRequests: { id: string; teamId: string; ws: string; collection: string; recordId: string; ownerId: string; requesterId: string; status: string }[] = [];
  audit: Rec[] = [];
  auditSeq = 0;
  log: string[] = [];
  online = true;
  available = true;                            // false = the Change 010 functions are not in the project (404)

  addUser(email: string, name?: string) { const u = { id: `u-${email}`, email, name, ws: `ws-${email}` }; this.users.set(email, u); return u; }
  private byId(id: string) { return [...this.users.values()].find(u => u.id === id); }
  private wsOwner(ws: string) { return [...this.users.values()].find(u => u.ws === ws); }
  private activeTeamOf(uid: string) { return this.team && !this.team.ended && this.team.members.includes(uid) ? this.team : null; }
  private partnerOf(uid: string) { const t = this.activeTeamOf(uid); return t?.members.find(m => m !== uid); }

  /** Same as eab_shared_level: what `uid` may do with someone else's record. */
  level(uid: string, ws: string, collection: string, id: string, data: Rec | null): Level | null {
    const owner = this.wsOwner(ws);
    if (!owner || owner.id === uid) return null;
    const me = this.byId(uid);
    if (!me || me.disabled || owner.disabled) return null;
    const t = this.activeTeamOf(uid);
    if (!t || !t.members.includes(owner.id)) return null;
    const lv: Level[] = [];
    const sel = this.shares.get(`${t.id}|${ws}|${collection}|${id}`);
    if (sel) lv.push(sel);
    for (const scope of this.scopesOf(collection, data)) { const a = this.shareAll.get(`${t.id}|${owner.id}|${scope}`); if (a) lv.push(a); }
    return lv.includes('edit') ? 'edit' : lv.length ? 'view' : null;
  }
  private scopesOf(collection: string, data: Rec | null): string[] {
    if (collection === 'contacts') { const roles = (data?.roles as string[] | undefined) ?? []; return [...(roles.some(r => BUYER.includes(r)) ? ['buyers'] : []), ...(roles.some(r => VENDOR.includes(r)) ? ['vendors'] : [])]; }
    return ['properties', 'tasks', 'appointments'].includes(collection) ? [collection] : [];
  }
  canRead(uid: string, ws: string, collection: string, id: string, r: Row) { return this.wsOwner(ws)?.id === uid || !!this.level(uid, ws, collection, id, r.data); }

  fetch = (async (url: string, init: RequestInit = {}) => {
    if (!this.online) throw new TypeError('network down');
    return this.handle(url, init);
  }) as typeof fetch;
  private json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status }); }
  private err(status: number, message: string) { return new Response(JSON.stringify({ code: 'P0001', message }), { status }); }

  private async handle(url: string, init: RequestInit): Promise<Response> {
    const method = init.method ?? 'GET';
    const u = new URL(url);
    const path = u.pathname;
    this.log.push(`${method} ${path}`);
    const me = [...this.users.values()].find(x => `Bearer tok-${x.id}` === ((init.headers ?? {}) as Record<string, string>).authorization);
    if (!me) return new Response('no', { status: 401 });
    const body = init.body ? JSON.parse(String(init.body)) : {};
    if (path === '/rest/v1/rpc/eab_my_membership') return me.disabled ? this.json([]) : this.json([{ workspace_id: me.ws, workspace_name: 'Mine', role: 'owner' }]);
    if (path === '/rest/v1/eab_records' && method === 'GET') return this.getRecords(me, u);
    if (path === '/rest/v1/rpc/eab_push_records') return this.push(me, body);
    if (path === '/rest/v1/eab_files') return this.json([]);
    if (path.startsWith('/rest/v1/rpc/eab_') || path === '/rest/v1/eab_audit_events') {
      if (!this.available) return new Response(JSON.stringify({ code: 'PGRST202', message: 'Could not find the function' }), { status: 404 });
      return this.teamCall(me, path.replace('/rest/v1/rpc/', '').replace('/rest/v1/', ''), method, u, body);
    }
    return new Response('not found', { status: 404 });
  }

  private getRecords(me: User, u: URL) {
    const ws = u.searchParams.get('workspace_id')?.replace('eq.', '') ?? me.ws;
    const since = Number(u.searchParams.get('seq')?.replace('gt.', '') ?? 0);
    const coll = u.searchParams.get('collection')?.replace('eq.', '');
    const idsParam = u.searchParams.get('id');
    const ids = idsParam?.startsWith('in.(') ? idsParam.slice(4, -1).split(',').map(x => x.replace(/"/g, '')) : null;
    const out = [...this.rows].map(([k, r]) => { const [w, collection, id] = k.split('|'); return { w, collection, id, r }; })
      .filter(x => x.w === ws && x.r.seq > since && (!coll || x.collection === coll) && (!ids || ids.includes(x.id)) && this.canRead(me.id, ws, x.collection, x.id, x.r))
      .sort((a, b) => a.r.seq - b.r.seq)
      .map(x => ({ collection: x.collection, id: x.id, data: x.r.data, deleted: x.r.deleted, rev: x.r.rev, seq: x.r.seq }));
    return this.json(out);
  }

  private push(me: User, body: { ws: string; rows: Rec[] }) {
    if (me.ws !== body.ws && !(this.partnerOf(me.id) && this.wsOwner(body.ws)?.id === this.partnerOf(me.id))) return this.err(403, 'not allowed');
    const out: Rec[] = [];
    for (const r of body.rows) {
      const collection = String(r.collection), id = String(r.id);
      const key = `${body.ws}|${collection}|${id}`;
      const cur = this.rows.get(key);
      const deleted = !!r.deleted;
      const data = deleted ? null : (r.data as Rec);
      const op = r.op_id ? String(r.op_id) : undefined;
      if (cur && op && cur.op_id === op) { out.push({ collection, id, status: 'ok', rev: cur.rev, duplicate: true }); continue; }
      const own = this.wsOwner(body.ws)?.id === me.id;
      if (!own) {
        // Someone else's workspace: an update with View and Edit only, and never an owner-only change.
        const lv = cur ? this.level(me.id, body.ws, collection, id, cur.data) : null;
        const newLv = cur && data ? this.level(me.id, body.ws, collection, id, data) : lv;
        const ownerOnly = (deleted && !cur?.deleted && !['tasks', 'appointments'].includes(collection))
          || (collection === 'properties' && !deleted && !!data?.archived && !cur?.data?.archived);
        if (!cur || lv !== 'edit' || newLv !== 'edit' || ownerOnly) { out.push({ collection, id, status: 'denied' }); continue; }
      }
      if (cur && cur.rev !== Number(r.base_rev ?? 0)) { out.push({ collection, id, status: 'conflict', rev: cur.rev, deleted: cur.deleted, data: cur.data }); continue; }
      const rev = (cur?.rev ?? 0) + 1;
      this.rows.set(key, { data, deleted, rev, seq: ++this.seq, op_id: op, user_id: cur?.user_id ?? me.id });
      out.push({ collection, id, status: 'ok', rev });
    }
    return this.json(out);
  }

  // ---------- Change 010 functions ----------
  private logAudit(me: User, action: string, extra: Rec) {
    this.audit.push({ id: `srv-${++this.auditSeq}`, actor: me.id, actor_name: me.name ?? null, actor_email: me.email, action, at: new Date().toISOString(), seq: this.auditSeq, team_id: this.team?.id ?? null, ...extra });
  }
  endTeam(by: User, reason: string) {
    if (!this.team || this.team.ended) return;
    this.logAudit(by, 'membership', { detail: { event: reason, email: by.email } });
    this.team.ended = true;
    for (const k of [...this.shares.keys()]) if (k.startsWith(`${this.team.id}|`)) this.shares.delete(k);
    for (const k of [...this.shareAll.keys()]) if (k.startsWith(`${this.team.id}|`)) this.shareAll.delete(k);
    for (const i of this.invites) if (i.teamId === this.team.id && i.status === 'pending') i.status = 'cancelled';
    for (const d of this.deleteRequests) if (d.teamId === this.team.id && d.status === 'pending') d.status = 'void';
  }
  /** Disables a Google account: every sharing permission goes at once. */
  disable(email: string) { const u = this.users.get(email)!; u.disabled = true; if (this.activeTeamOf(u.id)) this.endTeam(u, 'account_disabled'); }

  private teamCall(me: User, fn: string, method: string, u: URL, b: Rec): Response {
    const t = this.activeTeamOf(me.id);
    switch (fn) {
      case 'eab_team_status': {
        const partner = this.partnerOf(me.id);
        return this.json({
          team: t ? { id: t.id, created_by: t.createdBy, created_at: '2026-10-15T00:00:00Z' } : null,
          members: t ? t.members.map(id => { const x = this.byId(id)!; return { user_id: id, email: x.email, name: x.name ?? null, joined_at: '2026-10-15T00:00:00Z' }; }) : [],
          invites_sent: this.invites.filter(i => t && i.teamId === t.id && i.status === 'pending' && i.expiresAt > Date.now()).map(i => ({ id: i.id, email: i.email, created_at: '', expires_at: new Date(i.expiresAt).toISOString() })),
          invites_for_me: this.invites.filter(i => i.status === 'pending' && i.expiresAt > Date.now() && i.email === me.email).map(i => ({ id: i.id, from_email: this.byId(i.by)!.email, from_name: this.byId(i.by)!.name ?? null, created_at: '', expires_at: new Date(i.expiresAt).toISOString() })),
          invites_answered: this.invites.filter(i => i.by === me.id && (i.status === 'accepted' || i.status === 'declined') && i.answeredAt && i.answeredAt > Date.now() - 7 * 86_400_000)
            .map(i => { const who = this.byId(i.answeredBy ?? ''); return { id: i.id, status: i.status, email: who?.email ?? i.email, name: i.status === 'accepted' ? who?.name ?? null : null, answered_at: new Date(i.answeredAt!).toISOString() }; }),
          shares_given: t ? [...this.shares].filter(([k]) => k.startsWith(`${t.id}|${me.ws}|`)).map(([k, level]) => { const [, ws, collection, record_id] = k.split('|'); return { workspace_id: ws, collection, record_id, level }; }) : [],
          share_all_given: t ? [...this.shareAll].filter(([k]) => k.startsWith(`${t.id}|${me.id}|`)).map(([k, level]) => ({ scope: k.split('|')[2], level })) : [],
          share_all_received: t && partner ? [...this.shareAll].filter(([k]) => k.startsWith(`${t.id}|${partner}|`)).map(([k, level]) => ({ scope: k.split('|')[2], level, owner_id: partner })) : [],
          delete_requests: this.deleteRequests.filter(d => t && d.teamId === t.id && d.status === 'pending' && (d.ownerId === me.id || d.requesterId === me.id))
            .map(d => ({ id: d.id, workspace_id: d.ws, collection: d.collection, record_id: d.recordId, owner_id: d.ownerId, requester_id: d.requesterId, created_at: '' })),
        });
      }
      case 'eab_team_invite': {
        const email = b.p_email ? String(b.p_email).toLowerCase() : null;
        if (email === me.email) return this.err(400, 'cannot invite yourself');
        let team = t;
        if (!team) { team = this.team = { id: `team-${++this.teamsEver}`, createdBy: me.id, members: [me.id] }; }
        if (team.members.length >= 2) return this.err(403, 'team is full');
        if (this.invites.some(i => i.teamId === team!.id && i.status === 'pending' && i.expiresAt > Date.now())) return this.err(403, 'an invitation is already waiting');
        const token = `${'ab'.repeat(12)}${this.invites.length}`.padEnd(48, '0');
        const inv = { id: `inv-${this.invites.length + 1}`, teamId: team.id, by: me.id, email, token, status: 'pending', expiresAt: Date.now() + 7 * 86_400_000 };
        this.invites.push(inv);
        this.logAudit(me, 'membership', { detail: { event: 'invited', email } });
        return this.json({ invite_id: inv.id, token, team_id: team.id, expires_at: new Date(inv.expiresAt).toISOString() });
      }
      case 'eab_team_cancel_invite': {
        const inv = this.invites.find(i => i.id === b.p_invite);
        if (!inv || inv.by !== me.id) return this.err(403, 'not allowed');
        inv.status = 'cancelled';
        return this.json(null);
      }
      case 'eab_team_accept': case 'eab_team_decline': {
        const inv = this.invites.find(i => (b.p_token ? i.token === b.p_token : i.id === b.p_invite));
        if (!inv) return this.err(400, 'invitation not found');
        if (inv.status === 'pending' && inv.expiresAt <= Date.now()) return this.err(400, 'invitation expired');
        if (inv.status !== 'pending') return this.err(400, `invitation is no longer valid (${inv.status})`);
        if (inv.by === me.id) return this.err(403, 'cannot accept your own invitation');
        if (inv.email && inv.email !== me.email) return this.err(403, 'invitation is for another Google account');
        if (fn === 'eab_team_decline') { inv.status = 'declined'; inv.answeredBy = me.id; inv.answeredAt = Date.now(); return this.json(null); }
        if (me.disabled) return this.err(403, 'account disabled');
        if (!this.team || this.team.id !== inv.teamId || this.team.ended) return this.err(400, 'invitation is no longer valid (team ended)');
        if (this.team.members.length >= 2) return this.err(403, 'team is full');
        this.team.members.push(me.id);
        inv.status = 'accepted'; inv.answeredBy = me.id; inv.answeredAt = Date.now();
        this.logAudit(me, 'membership', { detail: { event: 'joined', email: me.email } });
        return this.json(this.team.id);
      }
      case 'eab_team_leave': if (!t) return this.err(400, 'not in a Team Workspace'); this.endTeam(me, 'left'); return this.json(null);
      case 'eab_team_remove': if (!t || b.p_user === me.id) return this.err(403, 'not allowed'); this.endTeam(me, 'removed'); return this.json(null);
      case 'eab_share_set': {
        const partner = this.partnerOf(me.id);
        if (!t || !partner) return this.err(403, 'no active Team Workspace with another agent');
        if (b.p_ws !== me.ws) return this.err(403, 'only your own records can be shared');
        const out: Rec[] = [];
        for (const it of b.p_items as Rec[]) {
          const collection = String(it.collection), id = String(it.id);
          if (!['properties', 'contacts', 'tasks', 'appointments'].includes(collection)) { out.push({ collection, id, status: 'not_shareable' }); continue; }
          if (!this.rows.get(`${me.ws}|${collection}|${id}`)) { out.push({ collection, id, status: 'not_owner' }); continue; }
          const k = `${t.id}|${me.ws}|${collection}|${id}`;
          const before = this.shares.get(k) ?? null;
          if (it.level) this.shares.set(k, it.level as Level); else this.shares.delete(k);
          if (before !== (it.level ?? null)) this.logAudit(me, 'permission', { workspace_id: me.ws, collection, record_id: id, owner_id: me.id, detail: { event: !before ? 'granted' : !it.level ? 'revoked' : 'changed', from: before, to: it.level ?? null, via: 'selected' } });
          out.push({ collection, id, status: 'ok', level: it.level ?? null });
        }
        return this.json(out);
      }
      case 'eab_share_all_set': {
        if (!t || !this.partnerOf(me.id)) return this.err(403, 'no active Team Workspace with another agent');
        const k = `${t.id}|${me.id}|${b.p_scope}`;
        const before = this.shareAll.get(k) ?? null;
        if (b.p_level) this.shareAll.set(k, b.p_level as Level); else this.shareAll.delete(k);
        if (before !== (b.p_level ?? null)) this.logAudit(me, 'permission', { collection: b.p_scope, owner_id: me.id, detail: { event: !before ? 'granted' : !b.p_level ? 'revoked' : 'changed', from: before, to: b.p_level ?? null, via: 'share_all', scope: b.p_scope } });
        return this.json(null);
      }
      case 'eab_share_confidential_set': {
        if (!t || !this.partnerOf(me.id)) return this.err(403, 'no active Team Workspace with another agent');
        if ((b.p_ws === null) !== (b.p_id === null)) return this.err(400, 'workspace and property both needed');
        if (b.p_ws !== null && (b.p_ws !== me.ws || !this.rows.get(`${me.ws}|properties|${b.p_id}`))) return this.err(403, 'only your own properties');
        const k = b.p_ws === null ? `${t.id}|${me.id}|all` : `${t.id}|${me.id}|${b.p_ws}|${b.p_id}`;
        const was = this.confidential.has(k);
        if (b.p_on) this.confidential.add(k); else this.confidential.delete(k);
        if (was !== !!b.p_on) this.logAudit(me, 'permission', { workspace_id: b.p_ws ?? null, collection: 'properties', record_id: b.p_id ?? null, owner_id: me.id, detail: { event: b.p_on ? 'confidential_on' : 'confidential_off', via: b.p_ws === null ? 'share_all' : 'selected' } });
        return this.json(!!b.p_on);
      }
      case 'eab_share_confidential_list': {
        if (!t) return this.json({ all: false, records: [] });
        const mine = [...this.confidential].filter(k => k.startsWith(`${t.id}|${me.id}|`)).map(k => k.split('|').slice(2));
        return this.json({ all: mine.some(x => x[0] === 'all'), records: mine.filter(x => x.length === 2).map(([ws, id]) => ({ workspace_id: ws, record_id: id })) });
      }
      case 'eab_shared_index': {
        const partner = this.partnerOf(me.id);
        if (!partner) return this.json([]);
        const owner = this.byId(partner)!;
        return this.json([...this.rows].map(([k, r]) => { const [ws, collection, id] = k.split('|'); return { ws, collection, id, r }; })
          .filter(x => x.ws === owner.ws && this.level(me.id, x.ws, x.collection, x.id, x.r.data))
          .map(x => ({ workspace_id: x.ws, collection: x.collection, id: x.id, rev: x.r.rev, deleted: x.r.deleted, level: this.level(me.id, x.ws, x.collection, x.id, x.r.data), owner_id: owner.id, owner_email: owner.email, owner_name: owner.name ?? null })));
      }
      case 'eab_request_delete': {
        const r = this.rows.get(`${b.p_ws}|${b.p_coll}|${b.p_id}`);
        if (!t || !r || this.level(me.id, String(b.p_ws), String(b.p_coll), String(b.p_id), r.data) !== 'edit') return this.err(403, 'not allowed');
        const d = { id: `del-${this.deleteRequests.length + 1}`, teamId: t.id, ws: String(b.p_ws), collection: String(b.p_coll), recordId: String(b.p_id), ownerId: r.user_id, requesterId: me.id, status: 'pending' };
        this.deleteRequests.push(d);
        return this.json(d.id);
      }
      case 'eab_decide_delete': {
        const d = this.deleteRequests.find(x => x.id === b.p_request);
        if (!d || d.ownerId !== me.id) return this.err(403, 'not allowed');
        d.status = b.p_approve ? 'approved' : 'rejected';
        return this.json(null);
      }
      case 'eab_audit_events': {
        if (method === 'POST') {
          const list = (Array.isArray(b) ? b : [b]) as Rec[];
          for (const e of list) {
            const r = this.rows.get(`${e.workspace_id}|${e.collection}|${e.record_id}`);
            if (!r || !this.canRead(me.id, String(e.workspace_id), String(e.collection), String(e.record_id), r)) return this.err(403, 'new row violates row-level security policy');
            if (this.audit.some(x => x.id === e.id)) continue;   // on conflict do nothing
            this.audit.push({ ...e, actor: me.id, actor_name: me.name ?? null, actor_email: me.email, owner_id: r.user_id, seq: ++this.auditSeq });
          }
          return new Response('', { status: 201 });
        }
        const since = Number(u.searchParams.get('seq')?.replace('gt.', '') ?? 0);
        return this.json(this.audit.filter(e => Number(e.seq) > since && this.auditReadable(me, e)).sort((a, b) => Number(a.seq) - Number(b.seq)));
      }
    }
    return new Response('not found', { status: 404 });
  }
  private auditReadable(me: User, e: Rec) {
    if (e.record_id) { const r = this.rows.get(`${e.workspace_id}|${e.collection}|${e.record_id}`); return !!r && this.canRead(me.id, String(e.workspace_id), String(e.collection), String(e.record_id), r); }
    if (e.action === 'permission') return e.owner_id === me.id || (this.partnerOf(me.id) === e.owner_id);
    if (e.action === 'membership') return (this.activeTeamOf(me.id)?.id === e.team_id) || (this.team?.id === e.team_id && this.team.createdBy === me.id);
    return false;
  }
}

/** A phone signed in as `email` (a fresh store unless one is given). */
export async function agentPhone(cloud: FakeTeamCloud, email: string, name?: string, backend = new MemoryBackend()) {
  const user = cloud.users.get(email) ?? cloud.addUser(email, name);
  const store = await Store.open(backend);
  store.setSingleton('meta', { syncSession: { accessToken: `tok-${user.id}`, refreshToken: 'r', expiresAt: Date.now() + 3600_000, email, userId: user.id, name } });
  return { store, backend, user };
}
