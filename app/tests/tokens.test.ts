// Batch B: Ai Buddy Tokens (sandbox / test mode). The pack list on the phone, the server and the database; the server's
// tokens_verify action against a stand-in Google and database; the phone's buy / restore / wallet against a stand-in Google
// Play plugin and server. Nothing here uses Google Play, a Supabase project or a phone, and nothing proves Google accepts
// what the code sends.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Capacitor } from '@capacitor/core';
import { MemoryBackend } from '../src/data/backend';
import { Store } from '../src/data/store';
import { BILLING_LIVE, TOKEN_PACKS, TOKEN_USD_CENTS, packById, usd } from '../src/billing/plans';
import { BillingError } from '../src/billing/api';
import { buyTokens, cachedTokens, refreshTokens, restoreTokens, tokenBalance, walletEnv } from '../src/billing/tokens';
import { billingStrings } from '../src/billing/strings';
import * as S from '../../supabase/functions/_shared/billing';
import { handleBilling } from '../../supabase/functions/billing/handler';

const cfg = { supabaseUrl: 'https://tok-test.supabase.co', supabaseAnonKey: 'anon' };
const NOW = Date.parse('2026-11-03T12:00:00Z');
const U1 = '11111111-1111-4111-8111-111111111111';
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const TOKEN = 'b'.repeat(40);
const PKG = 'com.jslproperties.eaaibuddy.qa';
const GP = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PKG}`;

// ── packs ───────────────────────────────────────────────────────────────────────────────────────────────────────────
test('T-1 four packs at 1 token = USD 0.25, the same on the phone, the server and in the database function', () => {
  assert.equal(TOKEN_USD_CENTS, 25); assert.equal(S.TOKEN_USD_CENTS, 25);
  assert.deepEqual(TOKEN_PACKS.map(p => [p.id, p.tokens, p.amountCents]), [['tokens_20', 20, 500], ['tokens_100', 100, 2500], ['tokens_400', 400, 10000], ['tokens_1000', 1000, 25000]]);
  for (const p of TOKEN_PACKS) assert.equal(p.tokens * TOKEN_USD_CENTS, p.amountCents, `${p.id} is priced at USD 0.25 a token`);
  assert.deepEqual(TOKEN_PACKS.map(p => ({ ...p })), Object.values(S.TOKEN_PACKS));
  const sql = readFileSync(new URL('../../supabase/proposed/20261103000000_tokens_sandbox.sql', import.meta.url), 'utf8');
  const inSql = [...sql.matchAll(/\('(tokens_\d+)', (\d+), (\d+)\)/g)].map(m => [m[1], Number(m[2]), Number(m[3])]);
  assert.deepEqual(inSql, TOKEN_PACKS.map(p => [p.id, p.tokens, p.amountCents]), 'eab_tokens_credit holds the same list');
  assert.equal(usd(500), 'USD 5'); assert.equal(usd(25000), 'USD 250'); assert.equal(usd(250), 'USD 2.50');
  assert.equal(packById('tokens_free'), undefined);
  assert.ok(S.isPackId('tokens_400')); assert.ok(!S.isPackId('tokens_5')); assert.ok(!S.isPackId('toString'));
});

test('T-2 every language has the wallet text, and it says what a token costs', () => {
  for (const lang of ['en', 'bm', 'zh'] as const) {
    const t = billingStrings[lang].tokens;
    assert.ok(t.title && t.buy && t.restore && t.via, lang);
    assert.match(t.what, /0\.25/, lang);
    assert.ok(t.balance(1520).includes('1,520'), lang);
  }
});

// ── server: Google's answer → one credit ───────────────────────────────────────────────────────────────────────────
const product = (o: Record<string, unknown> = {}) => ({ purchaseState: 0, consumptionState: 0, purchaseType: 0, orderId: 'GPA.9', obfuscatedExternalAccountId: hash(U1), ...o });

test('T-3 mapPlayProduct: only a purchased pack, quantity 1, for exactly the pack asked for; a tester purchase is sandbox', () => {
  const ctx = { userId: U1, packId: 'tokens_100' as const, ref: 'gp:x' };
  const ok = S.mapPlayProduct(product(), ctx);
  assert.ok('credit' in ok); assert.deepEqual(ok.credit, { userId: U1, packId: 'tokens_100', tokens: 100, amountCents: 2500, env: 'sandbox', ref: 'gp:x', consumed: false });
  const live = S.mapPlayProduct(product({ purchaseType: undefined }), ctx); assert.ok('credit' in live && live.credit.env === 'live');
  assert.deepEqual(S.mapPlayProduct(product({ purchaseState: 1 }), ctx), { ignored: 'canceled' });
  assert.deepEqual(S.mapPlayProduct(product({ purchaseState: 2 }), ctx), { ignored: 'pending' });
  assert.deepEqual(S.mapPlayProduct(product({ purchaseState: undefined }), ctx), { ignored: 'not-purchased' });
  assert.deepEqual(S.mapPlayProduct(product({ quantity: 3 }), ctx), { ignored: 'quantity' });
  assert.deepEqual(S.mapPlayProduct(product({ productId: 'tokens_1000' }), ctx), { ignored: 'pack-mismatch' });
  const consumed = S.mapPlayProduct(product({ consumptionState: 1 }), ctx); assert.ok('credit' in consumed && consumed.credit.consumed);
  assert.deepEqual(S.creditParams((ok as { credit: S.TokenCredit }).credit), { p_user: U1, p_pack: 'tokens_100', p_tokens: 100, p_amount_cents: 2500, p_env: 'sandbox', p_provider: 'google_play', p_ref: 'gp:x' });
});

// ── server: the billing function's tokens_verify action ─────────────────────────────────────────────────────────────
type Call = { url: string; method: string; body: string; headers: Record<string, string> };
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
function world(answer: Record<string, unknown> | null, o: { db?: string; consumeOk?: boolean; env?: Record<string, string>; googleStatus?: number } = {}) {
  const calls: Call[] = [];
  const env: Record<string, string> = {
    SUPABASE_URL: 'https://p.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service',
    PLAY_PACKAGE_NAME: PKG, PLAY_SERVICE_ACCOUNT_EMAIL: 'svc@p.iam.gserviceaccount.com', PLAY_SERVICE_ACCOUNT_PRIVATE_KEY: privateKey.replace(/\n/g, '\\n'), ...o.env,
  };
  const fetchFn = (async (url: string | URL, init?: RequestInit) => {
    const c: Call = { url: String(url), method: init?.method ?? 'GET', body: String(init?.body ?? ''), headers: Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v])) };
    calls.push(c);
    if (c.url === 'https://p.supabase.co/auth/v1/user') return Response.json({ id: U1, email: 'ann@x.com' });
    if (c.url === 'https://oauth2.googleapis.com/token') return Response.json({ access_token: 'gtok' });
    if (c.url.startsWith(`${GP}/purchases/products/`) && c.url.endsWith(':consume')) return new Response(null, { status: o.consumeOk === false ? 500 : 204 });
    if (c.url.startsWith(`${GP}/purchases/products/`)) return o.googleStatus ? new Response('{}', { status: o.googleStatus }) : Response.json(answer);
    if (c.url.startsWith('https://p.supabase.co/rest/v1/rpc/')) return Response.json(o.db ?? 'applied');
    return new Response('{}', { status: 500 });
  }) as typeof fetch;
  return { calls, deps: { env: (k: string) => env[k] ?? '', fetch: fetchFn, now: () => NOW } };
}
const post = (body: unknown) => new Request('https://p.supabase.co/functions/v1/billing', { method: 'POST', headers: { authorization: 'Bearer tok' }, body: JSON.stringify(body) });
const rpcCalls = (w: ReturnType<typeof world>) => w.calls.filter(c => c.url.includes('/rest/v1/rpc/'));

test('T-4 tokens_verify: checked with Google, the pack’s own tokens credited once through the database, then consumed', async () => {
  for (const pack of TOKEN_PACKS) {
    const w = world(product());
    const r = await handleBilling(post({ action: 'tokens_verify', packId: pack.id, purchaseToken: TOKEN, tokens: 999999, amount: 1, userId: 'someone-else' }), w.deps);
    assert.equal(r.status, 200, pack.id);
    assert.deepEqual(await r.json(), { result: 'applied', tokens: pack.tokens, env: 'sandbox', consumed: true });
    const all = rpcCalls(w); const rpc = all.filter(c => c.url.endsWith('/rpc/eab_tokens_credit')); assert.equal(rpc.length, 1);
    // Batch 5: the purchase is remembered as this agent's (a hash of the token), for Google's later refund notices
    const link = all.filter(c => c.url.endsWith('/rpc/eab_play_purchase_link')); assert.equal(link.length, 1); assert.equal(all.length, 2);
    const ls = JSON.parse(link[0].body);
    assert.deepEqual([ls.p_user, ls.p_kind, ls.p_product], [U1, 'inapp', pack.id]); assert.match(ls.p_token_hash, /^[0-9a-f]{64}$/);
    assert.ok(!link[0].body.includes(TOKEN), 'the purchase token itself is never stored');
    const sent = JSON.parse(rpc[0].body);
    assert.equal(sent.p_user, U1); assert.equal(sent.p_pack, pack.id); assert.equal(sent.p_tokens, pack.tokens, 'the server’s count, never the phone’s');
    assert.equal(sent.p_amount_cents, pack.amountCents); assert.equal(sent.p_env, 'sandbox');
    assert.ok(sent.p_ref.startsWith('gp:') && !sent.p_ref.includes(TOKEN), 'the purchase token itself is never stored');
    assert.equal(rpc[0].headers.authorization, 'Bearer service');
    const get = w.calls.find(c => c.url === `${GP}/purchases/products/${pack.id}/tokens/${TOKEN}`)!;
    assert.equal(get.headers.authorization, 'Bearer gtok');
    const consume = w.calls.findIndex(c => c.url.endsWith(`/purchases/products/${pack.id}/tokens/${TOKEN}:consume`) && c.method === 'POST');
    assert.ok(consume > w.calls.indexOf(rpc[0]), 'consumed only after the tokens were credited');
  }
});

test('T-5 tokens_verify: the same purchase again adds nothing but is still consumed; a failed consume is reported, not hidden', async () => {
  const dup = world(product(), { db: 'duplicate' });
  const r = await handleBilling(post({ action: 'tokens_verify', packId: 'tokens_20', purchaseToken: TOKEN }), dup.deps);
  assert.deepEqual(await r.json(), { result: 'duplicate', tokens: 20, env: 'sandbox', consumed: true });
  assert.ok(dup.calls.some(c => c.url.endsWith(':consume')));
  const already = world(product({ consumptionState: 1 }), { db: 'duplicate' });
  await handleBilling(post({ action: 'tokens_verify', packId: 'tokens_20', purchaseToken: TOKEN }), already.deps);
  assert.ok(!already.calls.some(c => c.url.endsWith(':consume')), 'not consumed twice');
  const noConsume = world(product(), { consumeOk: false });
  assert.equal((await (await handleBilling(post({ action: 'tokens_verify', packId: 'tokens_20', purchaseToken: TOKEN }), noConsume.deps)).json()).consumed, false);
  const nobody = world(product(), { db: 'unknown-user' });
  await handleBilling(post({ action: 'tokens_verify', packId: 'tokens_20', purchaseToken: TOKEN }), nobody.deps);
  assert.ok(!nobody.calls.some(c => c.url.endsWith(':consume')), 'a purchase nobody was credited for is never consumed');
});

test('T-6 tokens_verify refuses another agent’s purchase, pending or cancelled ones, live ones in test mode, bad input, and no setup', async () => {
  const cases: [Record<string, unknown> | null, number, Parameters<typeof world>[1]?, Record<string, unknown>?][] = [
    [product({ obfuscatedExternalAccountId: hash('someone-else') }), 403],
    [product({ obfuscatedExternalAccountId: undefined }), 403],
    [product({ purchaseState: 2 }), 202],
    [product({ purchaseState: 1 }), 422],
    [product({ productId: 'tokens_1000' }), 422],
    [product({ purchaseType: undefined }), 403],
    [product(), 404, { googleStatus: 404 }],
    [product(), 502, { googleStatus: 500 }],
    [product(), 503, { env: { PLAY_SERVICE_ACCOUNT_EMAIL: '' } }],
    [product(), 400, {}, { packId: 'tokens_9999' }],
    [product(), 400, {}, { packId: 'news_monthly' }],
    [product(), 400, {}, { purchaseToken: 'short' }],
  ];
  for (const [ans, status, o, body] of cases) {
    const w = world(ans, o);
    const r = await handleBilling(post({ action: 'tokens_verify', packId: 'tokens_100', purchaseToken: TOKEN, ...body }), w.deps);
    assert.equal(r.status, status, JSON.stringify({ ans, o, body }));
    assert.equal(rpcCalls(w).length, 0, 'nothing reached the database');
    assert.ok(!w.calls.some(c => c.url.endsWith(':consume')), 'nothing was consumed');
  }
  const pending = world(product({ purchaseState: 2 }));
  assert.equal((await (await handleBilling(post({ action: 'tokens_verify', packId: 'tokens_100', purchaseToken: TOKEN }), pending.deps)).json()).reason, 'pending');
  const allowed = world(product({ purchaseType: undefined }), { env: { BILLING_ALLOW_LIVE: 'true' } });
  const r = await handleBilling(post({ action: 'tokens_verify', packId: 'tokens_100', purchaseToken: TOKEN }), allowed.deps);
  assert.equal((await r.json()).env, 'live', 'a live purchase is credited as live only once live is allowed on purpose');
});

// ── phone: buy, restore, wallet ────────────────────────────────────────────────────────────────────────────────────
type Fake = { purchase: (o: Record<string, unknown>) => Promise<{ purchaseToken: string }>; owned?: (o: Record<string, unknown>) => Promise<{ purchases: { productId: string; purchaseToken: string }[] }> };
const fake: { impl: Fake; seen: Record<string, unknown>[] } = { impl: { purchase: async () => ({ purchaseToken: TOKEN }) }, seen: [] };
(globalThis as Record<string, unknown>).__eabStubPlugins = {
  PlayBilling: { purchase: (o: Record<string, unknown>) => { fake.seen.push(o); return fake.impl.purchase(o); }, owned: (o: Record<string, unknown>) => { fake.seen.push(o); return fake.impl.owned ? fake.impl.owned(o) : Promise.resolve({ purchases: [] }); } },
};
function asAndroid(on: boolean) {
  const c = Capacitor as unknown as Record<string, unknown>;
  c.isNativePlatform = () => on; c.getPlatform = () => (on ? 'android' : 'web'); c.isPluginAvailable = (n: string) => on && n === 'PlayBilling';
}
async function signedIn(user = U1) {
  const store = await Store.open(new MemoryBackend());
  store.setSingleton('settings', { supabaseUrl: cfg.supabaseUrl, supabaseAnonKey: cfg.supabaseAnonKey });
  store.setSingleton('meta', { syncSession: { accessToken: 'tok', refreshToken: 'r', expiresAt: Date.now() + 3600_000, email: 'a@x.c', userId: user } });
  return store;
}
/** A stand-in for the billing function and the database: what tokens_verify answers, and the wallet eab_my_tokens returns. */
function server(verify: (body: Record<string, unknown>) => unknown, wallet: () => unknown = () => ({ balances: { sandbox: 20 }, history: [] })) {
  const sent: Record<string, unknown>[] = []; const rpcs: string[] = [];
  const fetchFn = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.endsWith('/functions/v1/billing')) { const b = JSON.parse(String(init?.body)); sent.push(b); return Response.json(verify(b)); }
    const m = /\/rest\/v1\/rpc\/(\w+)$/.exec(u);
    if (m) { rpcs.push(m[1]); return Response.json(wallet()); }
    return new Response('{}', { status: 500 });
  }) as typeof fetch;
  return { sent, rpcs, fetchFn };
}

test('T-7 buy: Google Play is asked for the pack as a one-time product with this agent’s hash; the balance comes from the database', async () => {
  asAndroid(true); fake.seen = []; fake.impl = { purchase: async () => ({ purchaseToken: TOKEN }) };
  try {
    const store = await signedIn();
    const s = server(() => ({ result: 'applied', tokens: 100, env: 'sandbox', consumed: true }), () => ({ balances: { sandbox: 120, live: 7 }, history: [{ delta: 100, kind: 'purchase', pack_id: 'tokens_100', env: 'sandbox', created_at: '2026-11-03T10:00:00Z' }, { bad: true }] }));
    const r = await buyTokens(store, cfg, 'tokens_100', s.fetchFn);
    assert.deepEqual(r, { kind: 'credited', tokens: 100, env: 'sandbox' });
    assert.deepEqual(fake.seen[0], { productId: 'tokens_100', obfuscatedAccountId: hash(U1), type: 'inapp' });
    assert.deepEqual(s.sent, [{ action: 'tokens_verify', packId: 'tokens_100', purchaseToken: TOKEN }], 'no amount and no token count is sent');
    assert.deepEqual(s.rpcs, ['eab_my_tokens']);
    assert.equal(tokenBalance(store), 120, 'test-mode balance while billing is not live');
    assert.equal(tokenBalance(store, true), 7, 'live tokens are a separate balance');
    assert.equal(cachedTokens(store)!.history.length, 1, 'malformed rows are dropped');
    // pending, already credited, refused
    assert.deepEqual(await buyTokens(store, cfg, 'tokens_20', server(() => ({ error: 'not-applicable', reason: 'pending' })).fetchFn), { kind: 'pending' });
    assert.deepEqual(await buyTokens(store, cfg, 'tokens_20', server(() => ({ result: 'duplicate', tokens: 20 })).fetchFn), { kind: 'already' });
    await assert.rejects(buyTokens(store, cfg, 'tokens_20', server(() => ({ result: 'unknown-user' })).fetchFn), (e: BillingError) => e.code === 'refused');
    await assert.rejects(buyTokens(store, cfg, 'tokens_5', s.fetchFn), (e: BillingError) => /unknown pack/.test(e.message));
    // the Google Play sheet cancelled: nothing reaches the server
    fake.impl = { purchase: async () => { throw Object.assign(new Error('cancelled'), { code: 'USER_CANCELED' }); } };
    const quiet = server(() => ({ result: 'applied', tokens: 20 }));
    await assert.rejects(buyTokens(store, cfg, 'tokens_20', quiet.fetchFn), (e: { code?: string }) => e.code === 'USER_CANCELED');
    assert.deepEqual(quiet.sent, []);
  } finally { asAndroid(false); }
});

test('T-8 buy needs the Android app with the plugin, and a signed-in agent', async () => {
  const store = await signedIn();
  await assert.rejects(buyTokens(store, cfg, 'tokens_20'), (e: BillingError) => /android-only/.test(e.message));
  asAndroid(true);
  try {
    const out = await Store.open(new MemoryBackend());
    await assert.rejects(buyTokens(out, cfg, 'tokens_20'), (e: BillingError) => e.code === 'not-signed-in');
  } finally { asAndroid(false); }
});

test('T-9 restore: every pack purchase Google Play still holds is sent once; other products are ignored; a failure is counted', async () => {
  asAndroid(true); fake.seen = [];
  fake.impl = {
    purchase: async () => ({ purchaseToken: TOKEN }),
    owned: async () => ({ purchases: [{ productId: 'tokens_400', purchaseToken: 'p1'.repeat(12) }, { productId: 'news_monthly', purchaseToken: 'p2'.repeat(12) }, { productId: 'tokens_20', purchaseToken: 'p3'.repeat(12) }, { productId: 'tokens_100', purchaseToken: 'p4'.repeat(12) }] }),
  };
  try {
    const store = await signedIn();
    const s = server(b => (b.packId === 'tokens_400' ? { result: 'applied', tokens: 400 } : b.packId === 'tokens_20' ? { result: 'duplicate', tokens: 20 } : { error: 'google' }));
    const r = await restoreTokens(store, cfg, s.fetchFn);
    assert.deepEqual(r, { added: 400, checked: 3, failed: 1 });
    assert.deepEqual(s.sent.map(b => b.packId), ['tokens_400', 'tokens_20', 'tokens_100'], 'the subscription is not sent as a token pack');
    assert.deepEqual(fake.seen.at(-1), { type: 'inapp' });
    assert.ok(s.rpcs.includes('eab_my_tokens'));
  } finally { asAndroid(false); }
});

test('T-10 the wallet: another account’s is never shown; a database without the wallet reads as empty; offline keeps the last one', async () => {
  const store = await signedIn();
  assert.equal(await refreshTokens(store, cfg, server(() => ({}), () => ({ balances: { sandbox: 55, live: -3 }, history: 'x' })).fetchFn), true);
  assert.equal(tokenBalance(store), 55); assert.equal(cachedTokens(store)!.balances.live, undefined, 'a negative count is not trusted');
  const offline = (async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch;
  assert.equal(await refreshTokens(store, cfg, offline), false); assert.equal(tokenBalance(store), 55);
  store.setSingleton('meta', { syncSession: { ...store.getState().meta.syncSession!, userId: '22222222-2222-4222-8222-222222222222' } });
  assert.equal(cachedTokens(store), undefined); assert.equal(tokenBalance(store), 0);
  const missing = (async () => Response.json({ code: 'PGRST202', message: 'Could not find the function public.eab_my_tokens' }, { status: 404 })) as unknown as typeof fetch;
  await refreshTokens(store, cfg, missing);
  assert.deepEqual(cachedTokens(store)!.balances, {});
  assert.equal(walletEnv(false), 'sandbox'); assert.equal(walletEnv(true), 'live'); assert.equal(BILLING_LIVE, false);
});

test('T-11 the plugin: token packs bought as one-time products, restore lists held purchases, and the phone never consumes', () => {
  const setup = readFileSync(new URL('../scripts/android-setup.mjs', import.meta.url), 'utf8');
  assert.match(setup, /ProductType\.INAPP/); assert.match(setup, /public void owned\(final PluginCall call\)/);
  assert.match(setup, /queryPurchasesAsync\(/);
  assert.doesNotMatch(setup, /consumeAsync\s*\(|acknowledgePurchase\s*\(/, 'the server consumes and acknowledges, never the phone');
  assert.match(setup, /"inapp"\.equals\(call\.getString\("type", "subs"\)\)/, 'subscriptions stay the default (Batch A unchanged)');
});
