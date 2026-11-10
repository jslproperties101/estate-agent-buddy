// Batch C: Oneharta lookups paid with Ai Buddy Tokens. The lookup function (supabase/functions/lookup) against a stand-in
// Oneharta and a stand-in database that answers like eab_lookup_begin / finish / refund. Nothing here calls Oneharta, a
// Supabase project or a phone, and nothing proves Oneharta answers exactly like its documentation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as O from '../../supabase/functions/_shared/oneharta';
import { handleLookup } from '../../supabase/functions/lookup/handler';

const U1 = '11111111-1111-4111-8111-111111111111';
const LID = '33333333-3333-4333-8333-333333333333';
const OH = 'https://oneharta.com/api/v1';
type Call = { url: string; method: string; body: string; headers: Record<string, string> };

// ── prices and request rules ────────────────────────────────────────────────────────────────────────────────────────
test('C-1 prices: 3 tokens per Oneharta credit; the most each lookup can cost; the database holds the same rule', () => {
  assert.equal(O.TOKENS_PER_CREDIT, 3);
  assert.deepEqual(O.CREDITS_MAX, { infosearch: 1, ct_search: 3, company: 3, sale_search: 1, sale_unlock: 3, rental_search: 1, rental_unlock: 3 });
  const sql = readFileSync(new URL('../../supabase/proposed/20261110200000_oneharta_lookups.sql', import.meta.url), 'utf8');
  assert.match(sql, /tokens_held = credits_max \* 3/); assert.match(sql, /held integer := p_credits_max \* 3/); assert.match(sql, /charge := least\(p_credits, l\.credits_max\) \* 3/);
  assert.match(sql, /credits_max between 1 and 3/, 'nothing dearer than 3 credits (no HSD / HSM parcels, ranges or Request Search)');
  for (const k of Object.keys(O.CREDITS_MAX)) assert.ok(sql.includes(`'${k}'`), `the database knows ${k}`);
});

test('C-2 buildPaid passes on only the listed fields, refuses bad input, and never puts personal details in the history note', () => {
  const info = O.buildPaid('infosearch', { name: 'Tan Ah Kow', identityNo: '800101-14-5555', phone: '012-345 6789', extra: 'x', creditsMax: 0 });
  assert.ok(typeof info !== 'string');
  assert.deepEqual(info.body, { name: 'Tan Ah Kow', identityNo: '800101145555', phone: '0123456789', address: '' });
  assert.equal(info.summary, 'InfoSearch by name, IC, phone'); assert.doesNotMatch(info.summary, /Tan|800101|0123/);
  assert.equal(info.creditsMax, 1);
  assert.match(String(O.buildPaid('infosearch', {})), /bad request/);
  assert.match(String(O.buildPaid('infosearch', { identityNo: '12;drop' })), /IC/);
  const ct = O.buildPaid('ct_search', { state: 'Selangor', district: 'Petaling', mukim: 'Damansara', searchBy: 'titleNo', titleType: 'grn', number: '1234', numberFrom: '1', numberTo: '201' });
  assert.ok(typeof ct !== 'string');
  assert.deepEqual(ct.body, { state: 'Selangor', district: 'Petaling', mukim: 'Damansara', section: '', searchBy: 'titleNo', titleType: 'GRN', number: '1234' }, 'never a range');
  assert.match(String(O.buildPaid('ct_search', { state: 'Selangor', district: 'P', mukim: 'D', searchBy: 'titleNo', titleType: 'XXX', number: '1' })), /title type/);
  assert.match(String(O.buildPaid('ct_search', { state: 'Selangor', district: 'P', mukim: 'D', searchBy: 'lotNo', number: '1-201' })), /one lot/);
  const co = O.buildPaid('company', { registrationNo: '2019-0100-0005', registrationNos: ['1', '2'] });
  assert.ok(typeof co !== 'string'); assert.deepEqual(co.body, { registrationNos: ['201901000005'] }); assert.equal(co.ref, '201901000005');
  assert.match(String(O.buildPaid('company', { registrationNo: '1234567-A' })), /12-digit/);
  assert.match(String(O.buildPaid('sale_search', { region: 'Mars', address: 'x' })), /region/);
  assert.match(String(O.buildPaid('sale_search', { region: 'Selangor' })), /give an address/);
  assert.match(String(O.buildPaid('rental_unlock', { id: -4 })), /record id/);
  assert.deepEqual(O.buildFree('ct_mukims', { state: 'Selangor', district: 'Petaling' }), { path: '/cukai-tanah/mukims?state=Selangor&district=Petaling' });
  assert.match(String(O.buildFree('sale_projects', { region: 'Selangor', q: 'ab' })), /3\+ letters/);
});

test('C-3 creditsCharged: Oneharta’s figure, never above the most; a missing figure on success counts as the most; refusals cost nothing', () => {
  assert.deepEqual(O.creditsCharged({ creditsCharged: 0 }, true, 3), { credits: 0, trusted: true });
  assert.deepEqual(O.creditsCharged({ creditsCharged: 3 }, true, 3), { credits: 3, trusted: true });
  assert.deepEqual(O.creditsCharged({ creditsCharged: 9 }, true, 3), { credits: 3, trusted: false });
  assert.deepEqual(O.creditsCharged({}, true, 1), { credits: 1, trusted: false });
  assert.deepEqual(O.creditsCharged({ creditsCharged: 0, error: 'x' }, false, 3), { credits: 0, trusted: true });
  assert.deepEqual(O.creditsCharged({ error: 'x' }, false, 3), { credits: 0, trusted: true });
  assert.deepEqual(O.creditsCharged({ creditsCharged: 1 }, false, 3), { credits: 1, trusted: true }, 'a 5xx that says it charged');
});

// ── the lookup function ─────────────────────────────────────────────────────────────────────────────────────────────
/** A stand-in Supabase (auth + the lookup functions with a real token balance) and a stand-in Oneharta. */
function world(oh: (c: Call) => Response | 'throw', o: { balance?: number; env?: Record<string, string>; owned?: Record<string, unknown> | null; begin?: Record<string, unknown> } = {}) {
  const calls: Call[] = [];
  const db = { balance: o.balance ?? 50, held: 0, finished: [] as Record<string, unknown>[], refunds: [] as string[] };
  const env: Record<string, string> = { SUPABASE_URL: 'https://p.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service', ONEHARTA_API_KEY: 'ohk_secret', ...o.env };
  const fetchFn = (async (url: string | URL, init?: RequestInit) => {
    const c: Call = { url: String(url), method: init?.method ?? 'GET', body: String(init?.body ?? ''), headers: Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v])) };
    calls.push(c);
    if (c.url === 'https://p.supabase.co/auth/v1/user') return Response.json({ id: U1 });
    const m = /\/rest\/v1\/rpc\/(\w+)$/.exec(c.url);
    if (m) {
      const b = JSON.parse(c.body);
      if (m[1] === 'eab_lookup_begin') {
        if (o.begin) return Response.json(o.begin);
        const held = b.p_credits_max * 3;
        if (db.balance < held) return Response.json({ result: 'not-enough-tokens', balance: db.balance, needed: held });
        db.balance -= held; db.held = held;
        return Response.json({ result: 'ok', id: LID, held, balance: db.balance });
      }
      if (m[1] === 'eab_lookup_finish') {
        db.finished.push(b);
        if (b.p_status === 'unknown') return Response.json({ result: 'unknown', tokens_charged: db.held });
        const charge = Math.min(b.p_credits, db.held / 3) * 3; db.balance += db.held - charge;
        return Response.json({ result: 'ok', tokens_charged: charge, refunded: db.held - charge, balance: db.balance });
      }
      if (m[1] === 'eab_lookup_owned') return Response.json(o.owned === undefined ? null : o.owned);
      if (m[1] === 'eab_lookup_refund') { db.refunds.push(b.p_id); return Response.json({ result: 'ok', refunded: 9 }); }
    }
    if (c.url.startsWith(OH)) { const r = oh(c); if (r === 'throw') throw new TypeError('network'); return r; }
    return new Response('{}', { status: 500 });
  }) as typeof fetch;
  return { calls, db, deps: { env: (k: string) => env[k] ?? '', fetch: fetchFn, now: () => Date.parse('2026-11-10T12:00:00Z') } };
}
const post = (body: unknown) => new Request('https://p.supabase.co/functions/v1/lookup', { method: 'POST', headers: { authorization: 'Bearer tok' }, body: JSON.stringify(body) });
const ohCalls = (w: ReturnType<typeof world>) => w.calls.filter(c => c.url.startsWith(OH));

test('C-4 a found land tax record: 9 tokens held, Oneharta asked with the server’s key, 9 kept, record token saved, no key or cost leaked', async () => {
  const w = world(() => Response.json({ numbersSearched: 1, numbersWithData: 1, record: { token: '9f2c', titles: [{ ownerName: 'X', ownerIdentityNo: '800101145555' }] }, creditsCharged: 3 }));
  const r = await handleLookup(post({ action: 'ct_search', state: 'Selangor', district: 'Petaling', mukim: 'Damansara', searchBy: 'lotNo', number: '12345' }), w.deps);
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.tokensCharged, 9); assert.equal(j.balance, 41); assert.equal(j.lookupId, LID); assert.equal(j.costChecked, true);
  assert.equal(j.result.record.token, '9f2c'); assert.equal(j.result.creditsCharged, undefined);
  const begin = JSON.parse(w.calls.find(c => c.url.endsWith('/eab_lookup_begin'))!.body);
  assert.deepEqual(begin, { p_user: U1, p_env: 'sandbox', p_kind: 'ct_search', p_credits_max: 3, p_summary: 'Land tax lot 12345, Damansara, Selangor', p_agent_cap: 30, p_global_cap: 100 });
  const oh = ohCalls(w); assert.equal(oh.length, 1);
  assert.equal(oh[0].url, `${OH}/cukai-tanah/search`); assert.equal(oh[0].headers.authorization, 'Bearer ohk_secret');
  assert.ok(w.calls.findIndex(c => c.url.endsWith('/eab_lookup_begin')) < w.calls.indexOf(oh[0]), 'tokens are held before Oneharta is asked');
  assert.deepEqual(w.db.finished[0], { p_id: LID, p_credits: 3, p_status: 'done', p_ref: '9f2c' });
  assert.doesNotMatch(JSON.stringify(j), /ohk_secret/);
  assert.doesNotMatch(JSON.stringify(w.db.finished) + begin.p_summary, /800101145555/, 'no IC number reaches the database');
});

test('C-5 nothing found is free; a lot with several titles is free until one is chosen; a refused call costs nothing', async () => {
  const empty = world(() => Response.json({ results: [], total: 0, creditsCharged: 0 }));
  const j = await (await handleLookup(post({ action: 'infosearch', name: 'Nobody Here' }), empty.deps)).json();
  assert.equal(j.tokensCharged, 0); assert.equal(j.balance, 50); assert.equal(empty.db.finished[0].p_status, 'empty');
  const choose = world(() => Response.json({ selectionRequired: true, choices: [{ choiceId: 'c1', titleNo: 'GRN 1' }], creditsCharged: 0 }));
  const k = await (await handleLookup(post({ action: 'ct_search', state: 'Selangor', district: 'P', mukim: 'D', searchBy: 'lotNo', number: '7' }), choose.deps)).json();
  assert.equal(k.tokensCharged, 0); assert.equal(k.result.choices[0].choiceId, 'c1');
  const second = world(() => Response.json({ record: { token: 't2', titles: [] }, creditsCharged: 3 }));
  await handleLookup(post({ action: 'ct_search', state: 'Selangor', district: 'P', mukim: 'D', searchBy: 'lotNo', number: '7', choiceId: 'c1' }), second.deps);
  assert.equal(JSON.parse(ohCalls(second)[0].body).choiceId, 'c1');
  for (const [status, code] of [[402, 422], [404, 422], [429, 429], [500, 502]] as const) {
    const w = world(() => Response.json({ error: 'Not enough credits on the Oneharta account', creditsCharged: 0 }, { status }));
    const r = await handleLookup(post({ action: 'sale_search', region: 'Selangor', address: 'Jalan 1' }), w.deps);
    assert.equal(r.status, code, `oneharta ${status}`);
    const b = await r.json(); assert.equal(b.tokensCharged, 0); assert.equal(b.balance, 50); assert.equal(w.db.finished[0].p_status, 'failed');
  }
});

test('C-6 not enough tokens or a daily limit: Oneharta is never asked; no setup: nothing runs', async () => {
  const poor = world(() => Response.json({}), { balance: 5 });
  const r = await handleLookup(post({ action: 'company', registrationNo: '201901000005' }), poor.deps);
  assert.equal(r.status, 402); assert.deepEqual(await r.json(), { error: 'not-enough-tokens', balance: 5, needed: 9 });
  assert.equal(ohCalls(poor).length, 0);
  for (const result of ['agent-limit', 'app-limit']) {
    const w = world(() => Response.json({}), { begin: { result } });
    const x = await handleLookup(post({ action: 'infosearch', name: 'Someone' }), w.deps);
    assert.equal(x.status, 429); assert.equal((await x.json()).error, result); assert.equal(ohCalls(w).length, 0);
  }
  const none = world(() => Response.json({}), { env: { ONEHARTA_API_KEY: '' } });
  assert.equal((await handleLookup(post({ action: 'infosearch', name: 'Someone' }), none.deps)).status, 503);
  assert.equal(none.calls.filter(c => c.url.includes('/rpc/')).length, 0);
  const caps = world(() => Response.json({}), { env: { ONEHARTA_AGENT_DAILY_CREDITS: '5', ONEHARTA_APP_DAILY_CREDITS: '12' } });
  await handleLookup(post({ action: 'infosearch', name: 'Someone' }), caps.deps);
  const b = JSON.parse(caps.calls.find(c => c.url.endsWith('/eab_lookup_begin'))!.body);
  assert.equal(b.p_agent_cap, 5); assert.equal(b.p_global_cap, 12);
  const bad = world(() => Response.json({}));
  assert.equal((await handleLookup(post({ action: 'ct_search', state: 'Selangor' }), bad.deps)).status, 400);
  assert.equal(bad.calls.filter(c => c.url.includes('/rpc/')).length, 0, 'bad input holds no tokens');
  assert.equal((await handleLookup(post({ action: 'request_search' }), bad.deps)).status, 400);
  const anon = world(() => Response.json({}));
  assert.equal((await handleLookup(new Request('https://p.supabase.co/functions/v1/lookup', { method: 'POST', body: '{}' }), anon.deps)).status, 401);
});

test('C-7 no answer from Oneharta: the tokens stay held and the lookup is marked for the owner to check', async () => {
  const w = world(() => 'throw');
  const r = await handleLookup(post({ action: 'rental_unlock', id: 123456 }), w.deps);
  assert.equal(r.status, 504);
  assert.deepEqual(await r.json(), { error: 'no-answer', lookupId: LID, tokensHeld: 9 });
  assert.deepEqual(w.db.finished, [{ p_id: LID, p_credits: null, p_status: 'unknown', p_ref: null }]);
  assert.equal(w.db.balance, 41);
});

test('C-8 an answer that does not say what it cost is charged at its most and flagged; an already-bought unlock is free', async () => {
  const odd = world(() => Response.json({ vendor: 'A', purchaser: 'B' }));
  const j = await (await handleLookup(post({ action: 'sale_unlock', id: 100012345 }), odd.deps)).json();
  assert.equal(j.tokensCharged, 9); assert.equal(j.costChecked, false); assert.equal(odd.db.finished[0].p_ref, '100012345');
  const again = world(() => Response.json({ vendor: 'A', purchaser: 'B', creditsCharged: 0 }));
  assert.equal((await (await handleLookup(post({ action: 'sale_unlock', id: 100012345 }), again.deps)).json()).tokensCharged, 0);
});

test('C-9 reopening: only the agent’s own land tax record or company; a company Oneharta found no data for gives the tokens back', async () => {
  const mine = { id: LID, kind: 'ct_search', oh_ref: '9f2c', status: 'done', created_at: '2026-11-10T11:00:00Z' };
  const w = world(c => (c.url === `${OH}/cukai-tanah/records/9f2c` ? Response.json({ token: '9f2c', titles: [] }) : Response.json({}, { status: 404 })), { owned: mine });
  const r = await handleLookup(post({ action: 'ct_record', lookupId: LID }), w.deps);
  assert.equal(r.status, 200); assert.equal((await r.json()).result.token, '9f2c');
  assert.equal(w.calls.filter(c => c.url.includes('eab_lookup_begin')).length, 0, 'free');
  const notMine = world(() => Response.json({}), { owned: null });
  assert.equal((await handleLookup(post({ action: 'ct_record', lookupId: LID }), notMine.deps)).status, 404);
  assert.equal(ohCalls(notMine).length, 0);
  const wrongKind = world(() => Response.json({}), { owned: { ...mine, kind: 'company' } });
  assert.equal((await handleLookup(post({ action: 'ct_record', lookupId: LID }), wrongKind.deps)).status, 404);

  const co = { id: LID, kind: 'company', oh_ref: '201901000005', status: 'done', created_at: '2026-11-10T11:00:00Z' };
  const ready = world(c => (c.url.includes('/company?') ? Response.json({ searches: [{ registrationNo: '201901000005', status: 'success' }] }) : Response.json({ company: { name: 'ACME SDN BHD' } })), { owned: co });
  const rr = await (await handleLookup(post({ action: 'company_status', lookupId: LID }), ready.deps)).json();
  assert.equal(rr.status, 'ready'); assert.equal(rr.result.company.name, 'ACME SDN BHD');
  assert.equal(ohCalls(ready)[0].url, `${OH}/company?q=201901000005`);
  const waiting = world(() => Response.json({ searches: [{ registrationNo: '201901000005', status: 'pending' }] }), { owned: co });
  assert.equal((await (await handleLookup(post({ action: 'company_status', lookupId: LID }), waiting.deps)).json()).status, 'pending');
  const gone = world(() => Response.json({ searches: [] }), { owned: co });
  assert.deepEqual(await (await handleLookup(post({ action: 'company_status', lookupId: LID }), gone.deps)).json(), { status: 'no-data', refunded: 9 });
  assert.deepEqual(gone.db.refunds, [LID]);
  const fresh = world(() => Response.json({ searches: [] }), { owned: { ...co, created_at: '2026-11-10T11:59:30Z' } });
  assert.equal((await (await handleLookup(post({ action: 'company_status', lookupId: LID }), fresh.deps)).json()).status, 'pending', 'a brand-new search is not refunded yet');
  assert.deepEqual(fresh.db.refunds, []);
});

test('C-10 the free lists pass through; prices answer without a key; the key is never sent anywhere but Oneharta', async () => {
  const w = world(c => Response.json({ districts: ['Petaling', 'Klang'], url: c.url }));
  const r = await (await handleLookup(post({ action: 'ct_districts', state: 'Selangor' }), w.deps)).json();
  assert.deepEqual(r.result.districts, ['Petaling', 'Klang']); assert.equal(ohCalls(w)[0].method, 'GET');
  assert.equal(w.calls.filter(c => c.url.includes('/rpc/')).length, 0, 'free lists hold no tokens');
  const p = await (await handleLookup(post({ action: 'prices' }), world(() => Response.json({}), { env: { ONEHARTA_API_KEY: '' } }).deps)).json();
  assert.deepEqual(p.tokens, { infosearch: 3, ct_search: 9, company: 9, sale_search: 3, sale_unlock: 9, rental_search: 3, rental_unlock: 9 });
  assert.equal(p.configured, false); assert.equal(p.agentDailyCredits, 30);
  const all = world(() => Response.json({ results: [{ id: 1 }], creditsCharged: 1 }));
  await handleLookup(post({ action: 'sale_search', region: 'Penang', project: 'Gurney' }), all.deps);
  for (const c of all.calls) if (!c.url.startsWith(OH)) assert.doesNotMatch(JSON.stringify(c), /ohk_secret/);
  const src = readFileSync(new URL('../src/lookups/api.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /oneharta\.com|ohk_/, 'the app never talks to Oneharta directly');
});
