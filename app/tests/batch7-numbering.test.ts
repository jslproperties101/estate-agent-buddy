// Batch 7 (9 Nov 2026), AI Buddy POS go-live basics: document numbers that never repeat in a business. The server is a
// small stand-in that follows supabase/proposed/20261109200000_buddy_pos_numbering.sql (the SQL itself is tested by
// supabase/tests/buddy_pos_numbering_test.sql). Nothing here calls a real project.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryBackend } from '../src/data/backend';
import { Store } from '../src/data/store';
import { BuddyError, makeSale, postInvoice, postJournal, newJournal, reverseJournal, runPayroll, nextNo } from '../src/buddy/engine';
import { BLOCK, LOW, highest, left, numState, numberer, prepareNumbers, setNumberingMode } from '../src/buddy/numbering';
import { buddyStrings } from '../src/buddy/strings';
import type { AcctInvoice, AcctJournal, AcctSale, AcctStaff, SaleLine } from '../src/buddy/model';

const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: k => mem.get(k) ?? null, setItem: (k, v) => { mem.set(k, String(v)); }, removeItem: k => { mem.delete(k); },
  clear: () => mem.clear(), key: i => [...mem.keys()][i] ?? null, get length() { return mem.size; },
};

const WS = '11111111-1111-4111-8111-111111111111';
const WS2 = '22222222-2222-4222-8222-222222222222';
const U1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const cfg = { supabaseUrl: 'https://b7.supabase.co', supabaseAnonKey: 'anon' };
let k = 0;
const ids = { id: () => `id-${++k}`, now: () => 1_790_000_000_000 };
const lines: SaleLine[] = [{ desc: 'Key cutting', qty: 1, price: 50, taxPct: 0, acc: '4100' }];

/** The server: one business's numbering, as the SQL keeps it. */
function server() {
  const st = { mode: 'device' as 'device' | 'blocks' | 'server', letters: new Map<string, string>(), next: { JV: 1, INV: 1, POS: 1 } as Record<string, number>, log: [] as { series: string; from: number; to: number; device: string }[], offline: false, missing: false, role: 'agent', calls: [] as { fn: string; body: Record<string, unknown> }[] };
  const fetchFn = (async (url: string, init?: RequestInit) => {
    const fn = String(url).split('/rpc/')[1] ?? '';
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    st.calls.push({ fn, body });
    if (st.offline) throw new TypeError('Failed to fetch');
    if (st.missing) return new Response(`{"code":"PGRST202","message":"Could not find the function public.${fn}"}`, { status: 404 });
    if (fn === 'eab_acct_numbering_get') {
      let letter: string | null = null;
      if (st.mode === 'device') {
        const dev = String(body.p_device);
        if (!st.letters.has(dev)) st.letters.set(dev, String.fromCharCode(65 + st.letters.size));
        letter = st.letters.get(dev)!;
      }
      return Response.json({ mode: st.mode, letter });
    }
    if (fn === 'eab_acct_numbering_set') {
      if (!['owner', 'admin'].includes(st.role)) return new Response('{"message":"only the owner or an admin can change numbering"}', { status: 403 });
      st.mode = body.p_mode as typeof st.mode; return Response.json(st.mode);
    }
    if (fn === 'eab_acct_take') {
      if (st.mode === 'device') return new Response('{"message":"this business numbers by phone letter"}', { status: 400 });
      const s = String(body.p_series), c = Number(body.p_count);
      const from = Math.max(st.next[s], Number(body.p_min ?? 0) + 1);
      st.next[s] = from + c;
      st.log.push({ series: s, from, to: from + c - 1, device: String(body.p_device) });
      return Response.json({ from, to: from + c - 1, mode: st.mode });
    }
    return new Response('{}', { status: 404 });
  }) as typeof fetch;
  return { st, fetchFn };
}

async function phone(ws: string | null = WS) {
  const store = await Store.open(new MemoryBackend());
  store.setSingleton('settings', { supabaseUrl: cfg.supabaseUrl, supabaseAnonKey: cfg.supabaseAnonKey });
  store.setSingleton('meta', { syncSession: { accessToken: 'tok', refreshToken: 'r', expiresAt: Date.now() + 3600_000, email: 'a@x.c', userId: U1, workspaceId: ws ?? undefined, role: 'agent' } });
  return store;
}
const books = { journals: [] as AcctJournal[], invoices: [] as AcctInvoice[], sales: [] as AcctSale[] };
const used = (b = books) => ({ JV: b.journals.map(j => j.no), INV: b.invoices.map(i => i.no), POS: b.sales.map(x => x.no) });
/** Posts a sale the way the POS screen does: numbers first, then the entry, then the numbers count as used. */
async function sell(store: Store, fetchFn: typeof fetch, b: typeof books) {
  await prepareNumbers(store, cfg, { POS: 1, JV: 1 }, used(b), fetchFn);
  const { num, commit } = numberer(store);
  const r = makeSale({ ...ids, num }, { date: '2026-11-09', time: '10:00:00', lines, method: 'cash' }, b.sales, b.journals);
  commit();
  b.sales.push(r.sale); b.journals.push(r.journal);
  return r;
}
const fresh = () => ({ journals: [] as AcctJournal[], invoices: [] as AcctInvoice[], sales: [] as AcctSale[] });
const isNeeds = (e: unknown) => e instanceof BuddyError && e.code === 'needs-numbers';

test('not in a business: the phone counts on its own, as before Batch 7, and asks the server nothing', async () => {
  const { st, fetchFn } = server();
  const store = await phone(null);
  const b = fresh();
  const r = await sell(store, fetchFn, b);
  assert.equal(r.sale.no, 'POS-0001'); assert.equal(r.journal.no, 'JV-0001');
  assert.equal(st.calls.length, 0);
  assert.equal(numberer(store).num, undefined);
});

test('own series per phone (the default): each phone gets its own letter once, then numbers offline', async () => {
  const { st, fetchFn } = server();
  const a = await phone(); localStorage.clear(); const bA = fresh();
  const r1 = await sell(a, fetchFn, bA);
  assert.equal(r1.sale.no, 'POS-A-0001'); assert.equal(r1.journal.no, 'JV-A-0001');
  assert.equal(numState(a)?.letter, 'A');
  // a second phone (another phone name) in the same business
  localStorage.clear();
  const b = await phone(); const bB = fresh();
  const r2 = await sell(b, fetchFn, bB);
  assert.equal(r2.sale.no, 'POS-B-0001', 'never the same number as phone A');
  // phone B offline: it keeps its letter
  st.offline = true;
  const r3 = await sell(b, fetchFn, bB);
  assert.equal(r3.sale.no, 'POS-B-0002');
  assert.equal(st.log.length, 0, 'no blocks are taken in this mode');
});

test('own series per phone: a phone that never reached the server cannot post offline (it has no letter yet)', async () => {
  const { st, fetchFn } = server();
  localStorage.clear();
  const store = await phone();
  st.offline = true;
  await assert.rejects(sell(store, fetchFn, fresh()), isNeeds);
});

test('blocks: 50 numbers per series, used offline, topped up when fewer than 10 are left; two phones never clash', async () => {
  const { st, fetchFn } = server(); st.mode = 'blocks';
  localStorage.clear(); const a = await phone(); const bA = fresh();
  const r1 = await sell(a, fetchFn, bA);
  assert.equal(r1.sale.no, 'POS-0001'); assert.equal(r1.journal.no, 'JV-0001');
  assert.equal(left(numState(a)!.pools.POS), BLOCK - 1);
  localStorage.clear(); const b = await phone(); const bB = fresh();
  const r2 = await sell(b, fetchFn, bB);
  assert.equal(r2.sale.no, `POS-${String(BLOCK + 1).padStart(4, '0')}`, 'phone B gets the next block');
  // phone A offline uses what it holds
  st.offline = true;
  for (let i = 2; i <= BLOCK; i++) assert.equal((await sell(a, fetchFn, bA)).sale.no, `POS-${String(i).padStart(4, '0')}`);
  await assert.rejects(sell(a, fetchFn, bA), isNeeds, 'out of numbers and offline');
  // back online: a new block after both phones' numbers
  st.offline = false;
  const r3 = await sell(a, fetchFn, bA);
  assert.equal(r3.sale.no, `POS-${String(2 * BLOCK + 1).padStart(4, '0')}`);
  // every number handed out is in the log, and no two ranges overlap
  const pos = st.log.filter(x => x.series === 'POS').sort((x, y) => x.from - y.from);
  for (let i = 1; i < pos.length; i++) assert.ok(pos[i].from > pos[i - 1].to, 'ranges overlap');
});

test('blocks: topped up early, before the phone runs out', async () => {
  const { st, fetchFn } = server(); st.mode = 'blocks';
  localStorage.clear(); const a = await phone(); const bA = fresh();
  await sell(a, fetchFn, bA);
  const takes = () => st.log.filter(x => x.series === 'POS').length;
  assert.equal(takes(), 1);
  while (left(numState(a)!.pools.POS) - 1 >= LOW) await sell(a, fetchFn, bA);
  assert.equal(takes(), 1, 'no top-up while enough are left');
  await sell(a, fetchFn, bA);
  assert.equal(takes(), 2, 'topped up once fewer than 10 would be left');
});

test('server: one number at a time, posting needs internet', async () => {
  const { st, fetchFn } = server(); st.mode = 'server';
  localStorage.clear(); const a = await phone(); const bA = fresh();
  const r1 = await sell(a, fetchFn, bA);
  assert.equal(r1.sale.no, 'POS-0001');
  assert.deepEqual(st.log.map(x => x.to - x.from + 1), [1, 1], 'exactly one POS and one JV number');
  assert.equal(left(numState(a)!.pools.POS), 0);
  st.offline = true;
  await assert.rejects(sell(a, fetchFn, bA), isNeeds);
});

test('a posting that fails keeps the numbers: the next posting uses them', async () => {
  const { st, fetchFn } = server(); st.mode = 'blocks';
  localStorage.clear(); const a = await phone(); const bA = fresh();
  await prepareNumbers(a, cfg, { POS: 1, JV: 1 }, used(bA), fetchFn);
  const { num } = numberer(a);
  assert.throws(() => makeSale({ ...ids, num }, { date: '2026-11-09', time: '10:00:00', lines: [], method: 'cash' }, [], []), (e: unknown) => e instanceof BuddyError && e.code === 'empty');
  // no commit: still 50 held, and the next sale is number 1
  assert.equal(left(numState(a)!.pools.POS), BLOCK);
  assert.equal((await sell(a, fetchFn, bA)).sale.no, 'POS-0001');
});

test('a business that starts using the server never goes back over numbers this phone already issued', async () => {
  const { st, fetchFn } = server(); st.mode = 'blocks';
  localStorage.clear(); const a = await phone(null); const bA = fresh();
  await sell(a, fetchFn, bA); await sell(a, fetchFn, bA);                 // POS-0001, POS-0002 counted on its own
  a.setSingleton('meta', { syncSession: { ...a.getState().meta.syncSession!, workspaceId: WS } });
  assert.equal(highest('POS', bA.sales.map(x => x.no)), 2);
  assert.equal(st.calls.length, 0);
  const r = await sell(a, fetchFn, bA);
  assert.equal(r.sale.no, 'POS-0003');
  assert.equal(st.calls.find(c => c.fn === 'eab_acct_take' && c.body.p_series === 'POS')?.body.p_min, 2);
});

test('every posting kind takes the business number: invoice, payment, journal, reversal, payroll', async () => {
  const { st, fetchFn } = server(); st.mode = 'blocks';
  localStorage.clear(); const a = await phone(); const b = fresh();
  const go = async <T>(need: Record<string, number>, fn: (x: typeof ids & { num?: ReturnType<typeof numberer>['num'] }) => T) => {
    await prepareNumbers(a, cfg, need, used(b), fetchFn);
    const { num, commit } = numberer(a); const out = fn({ ...ids, num }); commit(); return out;
  };
  const inv: AcctInvoice = { id: 'i1', created: 0, updated: 0, date: '2026-11-09', due: '2026-12-09', status: 'draft', buyer: { name: 'X', tin: 'C1', addr: '', city: '', state: '14', postcode: '' }, lines: [{ desc: 'Fee', qty: 1, price: 100, taxPct: 0, acc: '4000' }] };
  const p = await go({ INV: 1, JV: 1 }, x => postInvoice(x, inv, b.invoices, b.journals));
  b.invoices.push(p.invoice); b.journals.push(p.journal);
  assert.equal(p.invoice.no, 'INV-0001'); assert.equal(p.journal.no, 'JV-0001');
  const j = await go({ JV: 1 }, x => postJournal(newJournal(x, { date: '2026-11-09', memo: 'Rent', lines: [{ acc: '6100', dr: 10, cr: 0 }, { acc: '1010', dr: 0, cr: 10 }] }), b.journals, 1, x.num));
  b.journals.push(j); assert.equal(j.no, 'JV-0002');
  const rv = await go({ JV: 1 }, x => reverseJournal(x, j, b.journals, '2026-11-09'));
  assert.equal(rv.reversal.no, 'JV-0003'); assert.equal(rv.original.reversedBy, 'JV-0003');
  const staff: AcctStaff[] = [{ id: 's1', created: 0, updated: 0, name: 'Ali', role: 'Clerk', active: true, basic: 3000, allowance: 0, commission: 0, pcb: 0 }];
  const pr = await go({ JV: 1 }, x => runPayroll(x, '2026-11', staff, [], b.journals));
  assert.equal(pr.journal.no, 'JV-0004');
});

test('the way of numbering changes: numbers held for the old way are dropped; another business is not mixed in', async () => {
  const { st, fetchFn } = server(); st.mode = 'blocks';
  localStorage.clear(); const a = await phone(); const bA = fresh();
  await sell(a, fetchFn, bA);
  assert.ok(left(numState(a)!.pools.POS) > 0);
  st.mode = 'device';
  const r = await sell(a, fetchFn, bA);
  assert.equal(r.sale.no, 'POS-A-0001');
  assert.deepEqual(numState(a)!.pools, {});
  a.setSingleton('meta', { syncSession: { ...a.getState().meta.syncSession!, workspaceId: WS2 } });
  assert.equal(numState(a), undefined, 'the other business\'s numbering is not used');
});

test('owner or admin changes the way; an agent is refused', async () => {
  const { st, fetchFn } = server();
  localStorage.clear(); const a = await phone();
  await assert.rejects(setNumberingMode(a, cfg, 'server', fetchFn), (e: unknown) => (e as { code?: string }).code === 'not-allowed');
  assert.equal(st.mode, 'device');
  st.role = 'owner';
  await setNumberingMode(a, cfg, 'server', fetchFn);
  assert.equal(st.mode, 'server'); assert.equal(numState(a)?.mode, 'server');
});

test('a database without the Batch 7 functions: the phone counts on its own, as before', async () => {
  const { st, fetchFn } = server(); st.missing = true;
  localStorage.clear(); const a = await phone(); const bA = fresh();
  assert.equal((await sell(a, fetchFn, bA)).sale.no, 'POS-0001');
  assert.equal(numState(a)?.mode, 'local');
  st.offline = true;                                                        // remembered: still counts on its own offline
  assert.equal((await sell(a, fetchFn, bA)).sale.no, 'POS-0002');
  st.offline = false; st.missing = false;                                    // the functions arrive: the business's way from now on
  assert.equal((await sell(a, fetchFn, bA)).sale.no, 'POS-A-0001');
});

test('a phone whose storage is blocked (no lasting phone name) is refused rather than given a shared letter', async () => {
  const { fetchFn } = server();
  const saved = globalThis.localStorage;
  (globalThis as unknown as { localStorage: unknown }).localStorage = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  try { const a = await phone(); await assert.rejects(sell(a, fetchFn, fresh()), isNeeds); }
  finally { (globalThis as unknown as { localStorage: Storage }).localStorage = saved; }
});

test('the device format never collides with the one-series format', () => {
  assert.equal(nextNo('INV', ['INV-A-0009', 'INV-0003']), 'INV-0004');
  assert.equal(nextNo('INV-A', ['INV-A-0009', 'INV-0003']), 'INV-A-0010');
  assert.equal(highest('INV', ['INV-A-0099', 'INV-0003']), 3);
});

test('words: the new messages exist in English, Malay and Chinese', () => {
  for (const l of ['en', 'bm', 'zh'] as const) {
    const s = buddyStrings[l];
    for (const key of ['needs-numbers', 'numbers-failed']) assert.ok(s.err[key], `${l} err.${key}`);
    for (const m of ['device', 'blocks', 'server']) assert.ok(s.numMode[m], `${l} numMode.${m}`);
    assert.ok(s.numTitle && s.numLocal && s.numNotAllowed && s.numSave && s.numCheck && s.numLetter('A').includes('A'));
  }
});
