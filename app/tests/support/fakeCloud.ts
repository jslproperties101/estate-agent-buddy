// A stand-in for the Supabase project, written to follow the SAME rules as supabase/migrations/20261014000000_phase2_*.sql
// (version numbers, compare-and-set push, operation ids, history, unique property numbers, files, access by role).
// The real SQL is tested separately against PostgreSQL (supabase/tests/rls-test.sh); this lets the phone's sync code be
// tested end to end, including a phone that goes offline, an answer that gets lost, or two phones writing in turn.
import { MemoryBackend } from '../../src/data/backend';
import { Store } from '../../src/data/store';
import type { SyncConfig } from '../../src/data/sync';

type Rec = Record<string, unknown>;
export const cfg: SyncConfig = { supabaseUrl: 'https://fake.supabase.co', supabaseAnonKey: 'anon' };
export type RoleName = 'owner' | 'admin' | 'team_leader' | 'agent' | 'limited';
interface Row { data: Rec | null; deleted: boolean; rev: number; seq: number; op_id?: string; user_id: string; updated: number }
interface FileRow { file_id: string; collection: string; record_id: string; kind: string; sha256: string; bytes: number; mime?: string; name?: string; status: string; deleted: boolean; uploaded_by: string }

export const refNumber = (d: Rec | null): number | null => {
  if (!d) return null;
  if (typeof d.refNo === 'number' && Number.isInteger(d.refNo)) return d.refNo;
  const m = /^[A-Z]{1,6}-?([0-9]{1,9})$/.exec(String(d.ref ?? '').trim().toUpperCase());
  return m ? Number(m[1]) : null;
};

export class FakeCloud {
  rows = new Map<string, Row>();
  history = new Map<string, { rev: number; data: Rec | null; deleted: boolean }[]>();
  refs = new Map<number, string>();                       // number → property id (one workspace is enough for the tests)
  files = new Map<string, FileRow>();
  objects = new Map<string, Blob>();
  users = new Map<string, { id: string; role: RoleName | null }>();
  seq = 0;
  ws = 'ws1';
  log: string[] = [];
  /** Faults: the next N requests whose URL contains `match` fail before reaching the cloud / after it has acted. */
  private faults: { match: string; before: number; after: number }[] = [];
  /** Runs after the cloud has accepted a push but before the phone hears about it (to edit "during the upload"). */
  duringPush?: () => void;
  uploads = 0;

  addUser(email: string, role: RoleName | null = 'owner') { this.users.set(email, { id: `u-${email}`, role }); return this.users.get(email)!; }
  setRole(email: string, role: RoleName | null) { this.users.get(email)!.role = role; }
  failNext(match: string, n = 1, mode: 'before' | 'after' = 'before') {
    const f = this.faults.find(x => x.match === match) ?? { match, before: 0, after: 0 };
    f[mode] += n; if (!this.faults.includes(f)) this.faults.push(f);
  }
  online = true;

  private userOf(auth: string | null) {
    const id = (auth ?? '').replace('Bearer tok-', '');
    return [...this.users.values()].find(u => u.id === id);
  }
  private canRead(u: { id: string; role: RoleName | null }, r: Row) {
    if (!u.role) return false;
    return ['owner', 'admin', 'team_leader'].includes(u.role) || r.user_id === u.id;
  }
  private canWrite(u: { id: string; role: RoleName | null }, r: Row | undefined) {
    if (!u.role || u.role === 'limited') return false;
    if (!r) return true;
    return ['owner', 'admin'].includes(u.role) || r.user_id === u.id;
  }

  fetch = (async (url: string, init: RequestInit = {}) => {
    if (!this.online) throw new TypeError('network down');
    const fault = this.faults.find(f => url.includes(f.match));
    if (fault?.before) { fault.before--; throw new TypeError('network down'); }
    const res = await this.handle(url, init);
    if (fault?.after) { fault.after--; throw new TypeError('answer lost'); }
    return res;
  }) as typeof fetch;

  private json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status }); }

  private async handle(url: string, init: RequestInit): Promise<Response> {
    const method = init.method ?? 'GET';
    const hdr = (init.headers ?? {}) as Record<string, string>;
    const auth = hdr.authorization ?? null;
    const u = new URL(url);
    const path = u.pathname;
    this.log.push(`${method} ${path}`);
    if (path === '/auth/v1/token') {
      const b = JSON.parse(String(init.body));
      const user = this.users.get(b.email);
      if (!user) return this.json({ error: 'bad' }, 400);
      return this.json({ access_token: `tok-${user.id}`, refresh_token: 'r', expires_in: 3600, user: { id: user.id, email: b.email } });
    }
    const me = this.userOf(auth);
    if (!me) return new Response('no', { status: 401 });
    if (path === '/rest/v1/rpc/eab_my_membership') {
      return this.json(me.role ? [{ workspace_id: this.ws, workspace_name: 'Team', role: me.role }] : []);
    }
    if (!me.role) return this.json([]);                                               // deactivated: row-level security shows nothing
    if (path === '/rest/v1/eab_records' && method === 'GET') {
      const since = Number(u.searchParams.get('seq')?.replace('gt.', '') ?? 0);
      const limit = Number(u.searchParams.get('limit') ?? 1000);
      const out = [...this.rows].filter(([, r]) => r.seq > since && this.canRead(me, r)).sort((a, b) => a[1].seq - b[1].seq).slice(0, limit)
        .map(([k, r]) => { const [, collection, id] = k.split('|'); return { collection, id, data: r.data, deleted: r.deleted, rev: r.rev, seq: r.seq }; });
      return this.json(out);
    }
    if (path === '/rest/v1/rpc/eab_push_records') return this.push(me, JSON.parse(String(init.body)));
    if (path === '/rest/v1/eab_files') return this.filesTable(me, method, u, init);
    if (path.startsWith('/storage/v1/object/')) return this.storage(me, method, path, init);
    return new Response('not found', { status: 404 });
  }

  private ownerOfRef(no: number) { return this.refs.get(no); }
  private push(me: { id: string; role: RoleName | null }, body: { ws: string; rows: Rec[] }): Response {
    if (!me.role) return new Response('not allowed', { status: 403 });
    const out: Rec[] = [];
    for (const r of body.rows) {
      const collection = String(r.collection), id = String(r.id);
      const key = `${body.ws}|${collection}|${id}`;
      const cur = this.rows.get(key);
      const deleted = !!r.deleted;
      const data = deleted ? null : (r.data as Rec);
      const base = Number(r.base_rev ?? 0);
      const op = r.op_id ? String(r.op_id) : undefined;
      if (cur && op && cur.op_id === op) { out.push({ collection, id, status: 'ok', rev: cur.rev, duplicate: true }); continue; }
      if (cur && cur.rev !== base) { out.push({ collection, id, status: 'conflict', rev: cur.rev, deleted: cur.deleted, data: cur.data }); continue; }
      if (!this.canWrite(me, cur)) { out.push({ collection, id, status: 'denied' }); continue; }
      if (collection === 'properties' && data && !data.sample) {
        const no = refNumber(data);
        const holder = no == null ? undefined : this.ownerOfRef(no);
        if (no != null && holder && holder !== id) {
          const hr = this.rows.get(`${body.ws}|properties|${holder}`);
          const visible = !!hr && this.canRead(me, hr);
          out.push({ collection, id, status: 'ref_conflict', ref_no: no, ref: String(data.ref ?? '').toUpperCase(), other_ref: String(hr?.data?.ref ?? ''),
            other_id: visible ? holder : null, other_title: visible ? (hr?.data?.headline ?? null) : null, other_visible: visible });
          continue;
        }
      }
      if (cur) {
        const h = this.history.get(key) ?? [];
        if (JSON.stringify(cur.data) !== JSON.stringify(data) || cur.deleted !== deleted) {
          h.unshift({ rev: cur.rev, data: cur.data, deleted: cur.deleted });
          this.history.set(key, h.slice(0, 25));
        }
      }
      const rev = (cur?.rev ?? 0) + 1;
      this.rows.set(key, { data, deleted, rev, seq: ++this.seq, op_id: op, user_id: cur?.user_id ?? me.id, updated: Number(r.updated ?? 0) });
      if (collection === 'properties') {
        for (const [no, pid] of [...this.refs]) if (pid === id) this.refs.delete(no);
        const no = data && !data.sample ? refNumber(data) : null;
        if (no != null) this.refs.set(no, id);
      }
      out.push({ collection, id, status: 'ok', rev });
    }
    this.duringPush?.();
    return this.json(out);
  }

  private recordReadable(me: { id: string; role: RoleName | null }, collection: string, id: string) {
    const r = this.rows.get(`${this.ws}|${collection}|${id}`);
    return !!r && this.canRead(me, r);
  }
  private async filesTable(me: { id: string; role: RoleName | null }, method: string, u: URL, init: RequestInit): Promise<Response> {
    const prefer = ((init.headers ?? {}) as Record<string, string>).prefer ?? '';
    if (method === 'GET') {
      const eq = (k: string) => u.searchParams.get(k)?.replace(/^eq\./, '');
      const inList = u.searchParams.get('file_id')?.startsWith('in.(') ? u.searchParams.get('file_id')!.slice(4, -1).split(',').map(x => x.replace(/"/g, '')) : null;
      const out = [...this.files.values()].filter(f => this.recordReadable(me, f.collection, f.record_id)
        && (!inList || inList.includes(f.file_id)) && (!eq('sha256') || f.sha256 === eq('sha256')) && (!eq('status') || f.status === eq('status')) && (!eq('file_id') || f.file_id === eq('file_id')) && (!eq('deleted') || String(f.deleted) === eq('deleted')));
      return this.json(out);
    }
    if (method === 'POST') {
      const rows = JSON.parse(String(init.body)) as FileRow[];
      for (const r of [...(Array.isArray(rows) ? rows : [rows])]) {
        if (!me.role || me.role === 'limited') return new Response('denied', { status: 403 });
        const rec = this.rows.get(`${this.ws}|${r.collection}|${r.record_id}`);
        if (!rec || !this.canRead(me, rec) || !this.canWrite(me, rec)) return new Response('denied', { status: 403 });
        if (this.files.has(r.file_id)) { if (prefer.includes('ignore-duplicates')) continue; return new Response('dup', { status: 409 }); }
        this.files.set(r.file_id, { ...r, status: 'pending', deleted: false, uploaded_by: me.id });
      }
      return new Response('', { status: 201 });
    }
    if (method === 'PATCH') {
      const id = u.searchParams.get('file_id')?.replace(/^eq\./, '') ?? '';
      const f = this.files.get(id);
      if (!f || (f.uploaded_by !== me.id && !['owner', 'admin'].includes(me.role ?? ''))) return this.json([]);
      Object.assign(f, JSON.parse(String(init.body)));
      return this.json([f]);
    }
    return new Response('no', { status: 405 });
  }
  private async storage(me: { id: string; role: RoleName | null }, method: string, path: string, init: RequestInit): Promise<Response> {
    const m = /^\/storage\/v1\/object\/(?:authenticated\/)?eab-files\/(.+)$/.exec(path);
    if (!m) return new Response('no', { status: 404 });
    const objPath = m[1];
    const sha = objPath.split('/')[1];
    if (method === 'POST') {
      const meta = [...this.files.values()].find(f => f.sha256 === sha && f.uploaded_by === me.id && !f.deleted);
      if (!meta) return new Response(JSON.stringify({ statusCode: '403', error: 'Unauthorized' }), { status: 403 });
      if (this.objects.has(objPath)) return new Response(JSON.stringify({ statusCode: '409', error: 'Duplicate' }), { status: 400 });
      const blob = init.body as Blob;
      this.objects.set(objPath, blob);
      this.uploads++;
      return this.json({ Key: `eab-files/${objPath}` });
    }
    if (method === 'GET') {
      const readable = [...this.files.values()].some(f => f.sha256 === sha && this.recordReadable(me, f.collection, f.record_id));
      if (!readable) return new Response(JSON.stringify({ statusCode: '404', error: 'not_found' }), { status: 404 });
      const blob = this.objects.get(objPath);
      if (!blob) return new Response(JSON.stringify({ statusCode: '404', error: 'not_found' }), { status: 404 });
      return new Response(blob, { status: 200 });
    }
    return new Response('no', { status: 405 });
  }
}

/** A phone: its own storage, signed in as `email` against the shared cloud. */
export async function phone(cloud: FakeCloud, email: string, opts: { role?: RoleName | null; backend?: MemoryBackend } = {}) {
  const user = cloud.users.get(email) ?? cloud.addUser(email, opts.role ?? 'owner');
  const backend = opts.backend ?? new MemoryBackend();
  const store = await Store.open(backend);
  store.setSingleton('meta', { syncSession: { accessToken: `tok-${user.id}`, refreshToken: 'r', expiresAt: Date.now() + 3600_000, email, userId: user.id } });
  return { store, backend, cloud, email };
}
