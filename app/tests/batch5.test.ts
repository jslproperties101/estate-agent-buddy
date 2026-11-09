// Batch 5 (9 Nov 2026): payments hardening, part 1. Against stand-ins for Google and the database: Google Play's notices
// (renewals, cancellations, refunds) read back from Google before anything changes; the Android app offering only Google
// Play; and the app reading the server's "Market News is paid" switch. Nothing here uses Google, Supabase or a phone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Capacitor } from '@capacitor/core';
import { MemoryBackend } from '../src/data/backend';
import { Store } from '../src/data/store';
import { BillingError, cachedRows, refreshBilling, serverNewsPaid } from '../src/billing/api';
import { featureAllowed } from '../src/billing/access';
import { availability, offeredProviders, startPayment } from '../src/billing/providers';
import { billingStrings } from '../src/billing/strings';
import * as S from '../../supabase/functions/_shared/billing';
import { handleWebhook } from '../../supabase/functions/billing-webhook/handler';
import { handleBilling } from '../../supabase/functions/billing/handler';

const NOW = Date.parse('2026-11-09T08:00:00Z');
const DAY = 86_400_000;
const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const iso = (ms: number) => new Date(ms).toISOString();
const PKG = 'com.jslproperties.eaaibuddy.qa';
const GP = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PKG}`;
const SUB_TOKEN = 's'.repeat(40); const NEW_TOKEN = 'n'.repeat(40); const PACK_TOKEN = 'p'.repeat(40);
const RTDN = 'rtdn-secret-1';
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
const PLAY_ENV = {
  PLAY_PACKAGE_NAME: PKG, PLAY_SERVICE_ACCOUNT_EMAIL: 'svc@p.iam.gserviceaccount.com', PLAY_SERVICE_ACCOUNT_PRIVATE_KEY: privateKey.replace(/\n/g, '\\n'), PLAY_RTDN_TOKEN: RTDN,
};

type Call = { url: string; method: string; body: string; headers: Record<string, string> };
function world(env: Record<string, string>, answers: [string, (c: Call) => Response | Promise<Response>][]) {
  const calls: Call[] = [];
  const base: Record<string, string> = { SUPABASE_URL: 'https://p.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service', ...env };
  const fetchFn = (async (url: string | URL, init?: RequestInit) => {
    const c: Call = { url: String(url), method: init?.method ?? 'GET', body: String(init?.body ?? ''), headers: Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v])) };
    calls.push(c);
    for (const [prefix, fn] of answers) if (c.url.startsWith(prefix)) return fn(c);
    return new Response('{}', { status: 500 });
  }) as typeof fetch;
  return { calls, deps: { env: (k: string) => base[k] ?? '', fetch: fetchFn, now: () => NOW } };
}
const RPC = 'https://p.supabase.co/rest/v1/rpc/';
const rpcCalls = (w: { calls: Call[] }, name?: string) => w.calls.filter(c => c.url.startsWith(RPC) && (!name || c.url === RPC + name));
const sub = (o: Record<string, unknown> = {}) => ({
  subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE', latestOrderId: 'GPA.1..1', testPurchase: {},
  externalAccountIdentifiers: { obfuscatedExternalAccountId: hash(U1) },
  lineItems: [{ productId: 'news_monthly', expiryTime: iso(NOW + 30 * DAY), autoRenewingPlan: { autoRenewEnabled: true } }], ...o,
});
/** Owners known to the database: token hash -> { user_id, kind }. */
function playWorld(o: { owners?: Record<string, { user_id: string; kind: string; product_id?: string }>; sub?: unknown; subStatus?: number; voided?: string[]; voidedStatus?: number; db?: 'down'; env?: Record<string, string> } = {}) {
  const owners = o.owners ?? { [hash(SUB_TOKEN)]: { user_id: U1, kind: 'subs', product_id: 'news_monthly' } };
  return world({ ...PLAY_ENV, ...(o.env ?? {}) }, [
    ['https://oauth2.googleapis.com/token', () => Response.json({ access_token: 'gtok' })],
    [`${GP}/purchases/subscriptionsv2/tokens/`, () => (o.subStatus ? new Response('{}', { status: o.subStatus }) : Response.json(o.sub ?? sub()))],
    [`${GP}/purchases/voidedpurchases`, () => (o.voidedStatus ? new Response('{}', { status: o.voidedStatus }) : Response.json({ voidedPurchases: (o.voided ?? []).map(t => ({ purchaseToken: t, orderId: 'GPA.x' })) }))],
    [`${RPC}eab_play_purchase_owner`, c => (o.db === 'down' ? new Response('{}', { status: 503 }) : Response.json(owners[JSON.parse(c.body).p_token_hash] ?? null))],
    [`${RPC}eab_billing_apply`, () => (o.db === 'down' ? new Response('{}', { status: 503 }) : Response.json('applied'))],
    [`${RPC}eab_tokens_refund`, () => Response.json({ result: 'applied', due: 100, taken: 70 })],
    [`${RPC}eab_play_purchase_link`, () => Response.json('linked')],
  ]);
}
const notice = (n: Record<string, unknown>, pkg = PKG) => ({ message: { data: Buffer.from(JSON.stringify({ version: '1.0', packageName: pkg, eventTimeMillis: String(NOW), ...n })).toString('base64'), messageId: '1' }, subscription: 'projects/x/subscriptions/y' });
const subNotice = (type: number, token = SUB_TOKEN) => notice({ subscriptionNotification: { version: '1.0', notificationType: type, purchaseToken: token, subscriptionId: 'news_monthly' } });
const voidNotice = (token: string, productType: number) => notice({ voidedPurchaseNotification: { purchaseToken: token, orderId: 'GPA.9', productType, refundType: 1 } });
const hook = (body: unknown, k: string | null = RTDN) => new Request(`https://p.supabase.co/functions/v1/billing-webhook?p=google_play${k === null ? '' : `&k=${encodeURIComponent(k)}`}`, { method: 'POST', body: JSON.stringify(body) });

// ── Google's notices: reading them ──────────────────────────────────────────────────────────────────────────────────
test('P-1 a notice is decoded only for this app; test, subscription, voided and other notices are told apart; bad ones refused', () => {
  assert.deepEqual(S.parsePlayNotice(notice({ testNotification: { version: '1.0' } }), PKG), { kind: 'test' });
  assert.deepEqual(S.parsePlayNotice(subNotice(2), PKG), { kind: 'subscription', token: SUB_TOKEN, productId: 'news_monthly', type: 2 });
  assert.deepEqual(S.parsePlayNotice(voidNotice(PACK_TOKEN, 2), PKG), { kind: 'voided', token: PACK_TOKEN, productType: 2, orderId: 'GPA.9' });
  assert.deepEqual(S.parsePlayNotice(notice({ oneTimeProductNotification: { purchaseToken: PACK_TOKEN, sku: 'tokens_20', notificationType: 1 } }), PKG), { kind: 'other', what: 'one-time-product' });
  assert.deepEqual(S.parsePlayNotice(subNotice(2), ''), { bad: 'other-package' }, 'no package configured: nothing is trusted');
  assert.deepEqual(S.parsePlayNotice(notice({ testNotification: {} }, 'com.someone.else'), PKG), { bad: 'other-package' });
  assert.deepEqual(S.parsePlayNotice({ message: { data: 'not base64 json' } }, PKG), { bad: 'not-json' });
  assert.deepEqual(S.parsePlayNotice({}, PKG), { bad: 'no-data' });
  assert.deepEqual(S.parsePlayNotice(subNotice(2, 'short'), PKG), { bad: 'token' });
  // the ids the phone's own checks use, so a notice and the phone never apply the same thing twice
  assert.equal(S.tokenPurchaseRef(hash(PACK_TOKEN)), `gp:${hash(PACK_TOKEN).slice(0, 40)}`);
  assert.equal(S.playSubEventId(hash(SUB_TOKEN), 'GPA.1', 'SUBSCRIPTION_STATE_ACTIVE'), `${hash(SUB_TOKEN).slice(0, 32)}:GPA.1:SUBSCRIPTION_STATE_ACTIVE`);
});

test('P-2 a notice without the right secret, or with Google Play not set up, changes nothing and reaches nobody', async () => {
  const w = playWorld();
  assert.equal((await handleWebhook(hook(subNotice(2), 'wrong'), w.deps)).status, 401);
  assert.equal((await handleWebhook(hook(subNotice(2), null), w.deps)).status, 401);
  assert.equal(w.calls.length, 0, 'neither Google nor the database was called');
  const off = playWorld({ env: { PLAY_RTDN_TOKEN: '' } });
  assert.equal((await handleWebhook(hook(subNotice(2)), off.deps)).status, 503);
  const noPkg = playWorld({ env: { PLAY_PACKAGE_NAME: '' } });
  assert.equal((await handleWebhook(hook(subNotice(2)), noPkg.deps)).status, 503);
  // right secret, but not something to act on: 200 so Pub/Sub stops sending it
  const ok = playWorld();
  assert.deepEqual(await (await handleWebhook(hook(notice({ testNotification: {} })), ok.deps)).json(), { result: 'test' });
  assert.equal((await (await handleWebhook(hook(notice({ testNotification: {} }, 'com.someone.else')), ok.deps)).json()).reason, 'other-package');
  assert.equal((await (await handleWebhook(new Request(`https://p.supabase.co/functions/v1/billing-webhook?p=google_play&k=${RTDN}`, { method: 'POST', body: '{nope' }), ok.deps)).json()).reason, 'not-json');
  assert.equal(ok.calls.length, 0);
});

// ── renewals, cancellations, expiry ─────────────────────────────────────────────────────────────────────────────────
test('P-3 a renewal is read back from Google and applied for the agent the purchase belongs to, with the phone’s own event id', async () => {
  const w = playWorld();
  const r = await handleWebhook(hook(subNotice(2)), w.deps);
  assert.equal(r.status, 200); assert.deepEqual(await r.json(), { result: 'applied', status: 'active' });
  assert.equal(w.calls.find(c => c.url.startsWith(`${GP}/purchases/subscriptionsv2/tokens/`))!.headers.authorization, 'Bearer gtok');
  const owner = JSON.parse(rpcCalls(w, 'eab_play_purchase_owner')[0].body);
  assert.deepEqual(owner, { p_token_hash: hash(SUB_TOKEN) });
  const ap = JSON.parse(rpcCalls(w, 'eab_billing_apply')[0].body);
  assert.equal(ap.p_user, U1); assert.equal(ap.p_provider, 'google_play'); assert.equal(ap.p_product, 'news'); assert.equal(ap.p_plan, 'news_monthly');
  assert.equal(ap.p_status, 'active'); assert.equal(ap.p_env, 'sandbox'); assert.equal(ap.p_period_end, iso(NOW + 30 * DAY));
  assert.equal(ap.p_event_id, S.playSubEventId(hash(SUB_TOKEN), 'GPA.1..1', 'SUBSCRIPTION_STATE_ACTIVE'));
  for (const c of w.calls.filter(x => x.url.startsWith(RPC))) assert.ok(!c.body.includes(SUB_TOKEN), 'the purchase token itself never reaches the database');
  assert.equal(rpcCalls(w, 'eab_play_purchase_link').length, 0, 'already linked: not linked again');
});

test('P-4 cancelled runs to its end, then expires; grace and hold follow Google; a live purchase is not applied while live is off', async () => {
  const cases: [string, string, boolean][] = [
    ['SUBSCRIPTION_STATE_CANCELED', 'canceled', true], ['SUBSCRIPTION_STATE_EXPIRED', 'expired', true],
    ['SUBSCRIPTION_STATE_IN_GRACE_PERIOD', 'past_due', true], ['SUBSCRIPTION_STATE_ON_HOLD', 'expired', true],
  ];
  for (const [state, status] of cases) {
    const w = playWorld({ sub: sub({ subscriptionState: state, lineItems: [{ productId: 'news_monthly', expiryTime: iso(NOW + 3 * DAY), autoRenewingPlan: { autoRenewEnabled: false } }] }) });
    const j = await (await handleWebhook(hook(subNotice(3)), w.deps)).json();
    assert.equal(j.status, status, state);
    const ap = JSON.parse(rpcCalls(w, 'eab_billing_apply')[0].body);
    assert.equal(ap.p_status, status); assert.equal(ap.p_cancel_at_end, true);
  }
  const live = playWorld({ sub: sub({ testPurchase: undefined }) });
  assert.equal((await (await handleWebhook(hook(subNotice(2)), live.deps)).json()).reason, 'live-refused');
  assert.equal(rpcCalls(live, 'eab_billing_apply').length, 0);
});

test('P-5 nothing in the notice is trusted: unknown purchases, another agent’s id, unknown plans and Google’s "not found" change nothing', async () => {
  const unknown = playWorld({ owners: {} });
  assert.equal((await (await handleWebhook(hook(subNotice(2)), unknown.deps)).json()).reason, 'unknown-purchase');
  const other = playWorld({ sub: sub({ externalAccountIdentifiers: { obfuscatedExternalAccountId: hash(U2) } }) });
  assert.equal((await (await handleWebhook(hook(subNotice(2)), other.deps)).json()).reason, 'not-linked');
  const plan = playWorld({ sub: sub({ lineItems: [{ productId: 'gold_forever', expiryTime: iso(NOW + DAY) }] }) });
  assert.equal((await (await handleWebhook(hook(subNotice(2)), plan.deps)).json()).reason, 'unknown-plan');
  const tokenKind = playWorld({ owners: { [hash(SUB_TOKEN)]: { user_id: U1, kind: 'inapp' } } });
  assert.equal((await (await handleWebhook(hook(subNotice(2)), tokenKind.deps)).json()).reason, 'unknown-purchase', 'a token-pack link never applies a subscription');
  const gone = playWorld({ subStatus: 410 });
  assert.equal((await (await handleWebhook(hook(subNotice(13)), gone.deps)).json()).reason, 'not-found');
  for (const w of [unknown, other, plan, tokenKind, gone]) assert.equal(rpcCalls(w, 'eab_billing_apply').length, 0);
});

test('P-6 a new token that replaces a known one (upgrade, re-subscribe) follows the same agent and is linked', async () => {
  const w = playWorld({ sub: sub({ linkedPurchaseToken: SUB_TOKEN, latestOrderId: 'GPA.2' }) });
  const j = await (await handleWebhook(hook(subNotice(4, NEW_TOKEN)), w.deps)).json();
  assert.equal(j.result, 'applied');
  assert.deepEqual(rpcCalls(w, 'eab_play_purchase_owner').map(c => JSON.parse(c.body).p_token_hash), [hash(NEW_TOKEN), hash(SUB_TOKEN)]);
  const link = JSON.parse(rpcCalls(w, 'eab_play_purchase_link')[0].body);
  assert.deepEqual(link, { p_token_hash: hash(NEW_TOKEN), p_user: U1, p_kind: 'subs', p_product: 'news_monthly' });
  assert.equal(JSON.parse(rpcCalls(w, 'eab_billing_apply')[0].body).p_user, U1);
});

test('P-7 Google or the database not answering gives 5xx, so Pub/Sub sends the notice again later', async () => {
  assert.equal((await handleWebhook(hook(subNotice(2)), playWorld({ subStatus: 503 }).deps)).status, 502);
  assert.equal((await handleWebhook(hook(subNotice(2)), playWorld({ db: 'down' }).deps)).status, 500);
  const noGoogle = world(PLAY_ENV, [['https://oauth2.googleapis.com/token', () => new Response('{}', { status: 400 })]]);
  assert.equal((await handleWebhook(hook(subNotice(2)), noGoogle.deps)).status, 502);
});

// ── refunds ─────────────────────────────────────────────────────────────────────────────────────────────────────────
test('P-8 a refunded token pack takes its tokens back once Google’s voided list confirms it; otherwise nothing changes', async () => {
  const owners = { [hash(PACK_TOKEN)]: { user_id: U1, kind: 'inapp', product_id: 'tokens_100' } };
  const w = playWorld({ owners, voided: ['x'.repeat(30), PACK_TOKEN] });
  const r = await handleWebhook(hook(voidNotice(PACK_TOKEN, 2)), w.deps);
  assert.equal(r.status, 200); assert.deepEqual((await r.json()).result, { result: 'applied', due: 100, taken: 70 });
  assert.deepEqual(JSON.parse(rpcCalls(w, 'eab_tokens_refund')[0].body), { p_ref: S.tokenPurchaseRef(hash(PACK_TOKEN)) });
  const q = new URL(w.calls.find(c => c.url.startsWith(`${GP}/purchases/voidedpurchases`))!.url).searchParams;
  assert.equal(q.get('startTime'), String(NOW - 30 * DAY));
  // not (yet) in Google's list, unknown purchase, Google down
  const notListed = playWorld({ owners, voided: [] });
  assert.equal((await (await handleWebhook(hook(voidNotice(PACK_TOKEN, 2)), notListed.deps)).json()).reason, 'not-voided');
  const unknown = playWorld({ owners: {}, voided: [PACK_TOKEN] });
  assert.equal((await (await handleWebhook(hook(voidNotice(PACK_TOKEN, 2)), unknown.deps)).json()).reason, 'unknown-purchase');
  assert.equal((await handleWebhook(hook(voidNotice(PACK_TOKEN, 2)), playWorld({ owners, voidedStatus: 500 }).deps)).status, 502);
  for (const x of [notListed, unknown]) assert.equal(rpcCalls(x, 'eab_tokens_refund').length, 0);
});

test('P-9 a refunded subscription is read back from Google like any other change (it then says expired)', async () => {
  const w = playWorld({ sub: sub({ subscriptionState: 'SUBSCRIPTION_STATE_EXPIRED', latestOrderId: 'GPA.1..1' }) });
  const j = await (await handleWebhook(hook(voidNotice(SUB_TOKEN, 1)), w.deps)).json();
  assert.equal(j.status, 'expired'); assert.equal(rpcCalls(w, 'eab_tokens_refund').length, 0);
});

test('P-10 the phone’s own Google Play check remembers whose purchase it is (a hash, never the token)', async () => {
  const w = world(PLAY_ENV, [
    ['https://p.supabase.co/auth/v1/user', () => Response.json({ id: U1, email: 'a@x.com' })],
    ['https://oauth2.googleapis.com/token', () => Response.json({ access_token: 'gtok' })],
    [`${GP}/purchases/subscriptionsv2/tokens/`, () => Response.json(sub())],
    [`${GP}/purchases/subscriptions/`, () => Response.json({})],
    [RPC, () => Response.json('applied')],
  ]);
  const r = await handleBilling(new Request('https://p.supabase.co/functions/v1/billing', { method: 'POST', headers: { authorization: 'Bearer tok' }, body: JSON.stringify({ action: 'play_verify', planId: 'news_monthly', purchaseToken: SUB_TOKEN }) }), w.deps);
  assert.equal(r.status, 200);
  assert.deepEqual(JSON.parse(rpcCalls(w, 'eab_play_purchase_link')[0].body), { p_token_hash: hash(SUB_TOKEN), p_user: U1, p_kind: 'subs', p_product: 'news_monthly' });
  assert.equal(JSON.parse(rpcCalls(w, 'eab_billing_apply')[0].body).p_event_id, S.playSubEventId(hash(SUB_TOKEN), 'GPA.1..1', 'SUBSCRIPTION_STATE_ACTIVE'));
  // a database without the Batch 5 function still records the purchase
  const old = world(PLAY_ENV, [
    ['https://p.supabase.co/auth/v1/user', () => Response.json({ id: U1, email: 'a@x.com' })],
    ['https://oauth2.googleapis.com/token', () => Response.json({ access_token: 'gtok' })],
    [`${GP}/purchases/subscriptionsv2/tokens/`, () => Response.json(sub())],
    [`${GP}/purchases/subscriptions/`, () => Response.json({})],
    [`${RPC}eab_play_purchase_link`, () => new Response('{"code":"PGRST202"}', { status: 404 })],
    [RPC, () => Response.json('applied')],
  ]);
  const r2 = await handleBilling(new Request('https://p.supabase.co/functions/v1/billing', { method: 'POST', headers: { authorization: 'Bearer tok' }, body: JSON.stringify({ action: 'play_verify', planId: 'news_monthly', purchaseToken: SUB_TOKEN }) }), old.deps);
  assert.equal(r2.status, 200); assert.equal((await r2.json()).result, 'applied');
});

// ── the app ─────────────────────────────────────────────────────────────────────────────────────────────────────────
function asAndroid(on: boolean) {
  const c = Capacitor as unknown as Record<string, unknown>;
  c.isNativePlatform = () => on; c.getPlatform = () => (on ? 'android' : 'web'); c.isPluginAvailable = (n: string) => on && n === 'PlayBilling';
}
const appCfg = { supabaseUrl: 'https://b5.supabase.co', supabaseAnonKey: 'anon' };
async function signedIn(user = U1) {
  const store = await Store.open(new MemoryBackend());
  store.setSingleton('settings', { supabaseUrl: appCfg.supabaseUrl, supabaseAnonKey: appCfg.supabaseAnonKey });
  store.setSingleton('meta', { syncSession: { accessToken: 'tok', refreshToken: 'r', expiresAt: Date.now() + 3600_000, email: 'a@x.c', userId: user } });
  return store;
}
function fakeDb(answers: Record<string, unknown | 'missing' | 'offline'>) {
  const calls: string[] = [];
  const fetchFn = (async (url: string) => {
    const name = String(url).split('/rpc/')[1] ?? '';
    calls.push(name);
    const a = answers[name];
    if (a === 'offline') throw new TypeError('Failed to fetch');
    if (a === 'missing' || a === undefined) return new Response(`{"code":"PGRST202","message":"Could not find the function public.${name}"}`, { status: 404 });
    return Response.json(a);
  }) as typeof fetch;
  return { calls, fetchFn };
}

test('A-1 Google Play rules: inside the Android app only Google Play is offered; FPX and card stay on the website', async () => {
  try {
    asAndroid(true);
    assert.deepEqual(offeredProviders(), ['google_play']);
    assert.deepEqual(availability('fpx'), { ok: false, reason: 'not-in-app' });
    assert.deepEqual(availability('stripe'), { ok: false, reason: 'not-in-app' });
    assert.deepEqual(availability('google_play'), { ok: true });
    const store = await signedIn();
    let called = false;
    const spy = (async () => { called = true; return Response.json({ url: 'https://checkout.stripe.com/x', env: 'sandbox' }); }) as unknown as typeof fetch;
    await assert.rejects(startPayment(store, appCfg, 'fpx', 'pro_monthly', spy), (e: BillingError) => /not-in-app/.test(e.message));
    await assert.rejects(startPayment(store, appCfg, 'stripe', 'pro_yearly', spy), (e: BillingError) => /not-in-app/.test(e.message));
    assert.equal(called, false, 'no checkout page is even asked for');
    asAndroid(false);
    assert.deepEqual(offeredProviders(), ['fpx', 'stripe'], 'the website (laptop) keeps FPX and card');
    assert.deepEqual(availability('fpx'), { ok: true });
  } finally { asAndroid(false); }
  // the words never point to another way to pay
  for (const lang of ['en', 'bm', 'zh'] as const) {
    const t = billingStrings[lang].unavailable['not-in-app'];
    assert.ok(t && !/web|site|laman|网站|FPX|card|kad|卡|agency|agensi/i.test(t), `${lang}: ${t}`);
  }
  const ui = readFileSync(new URL('../src/billing/BillingUI.tsx', import.meta.url), 'utf8');
  assert.match(ui, /offeredProviders\(\)/); assert.doesNotMatch(ui, /PROVIDER_IDS\.map/);
});

test('A-2 the app reads the server’s "Market News is paid" switch: news is gated even with the phone switch off; nothing else is', async () => {
  const store = await signedIn();
  const db = fakeDb({ eab_my_billing: [], eab_billing_public: { news_paid: true, live: false } });
  assert.equal(await refreshBilling(store, appCfg, db.fetchFn), true);
  assert.deepEqual(db.calls, ['eab_my_billing', 'eab_billing_public']);
  assert.equal(serverNewsPaid(store), true);
  assert.equal(featureAllowed(store, 'marketNews'), false, 'no news plan: the subscription box shows');
  assert.equal(featureAllowed(store, 'aiCommand'), true, 'other features are not gated by the news switch');
  // a news plan opens it
  const until = new Date(Date.now() + 20 * DAY).toISOString();
  const paid = fakeDb({ eab_my_billing: [{ product: 'news', plan_id: 'news_monthly', status: 'active', provider: 'google_play', env: 'sandbox', trial_end: null, period_end: until, cancel_at_period_end: false }], eab_billing_public: { news_paid: true } });
  await refreshBilling(store, appCfg, paid.fetchFn);
  assert.equal(cachedRows(store).length, 1); assert.equal(featureAllowed(store, 'marketNews'), true);
  // switch off on the server: news is open again
  await refreshBilling(store, appCfg, fakeDb({ eab_my_billing: [], eab_billing_public: { news_paid: false } }).fetchFn);
  assert.equal(featureAllowed(store, 'marketNews'), true);
  // a database without the Batch 5 function: off; offline: the last answer is kept
  await refreshBilling(store, appCfg, fakeDb({ eab_my_billing: [], eab_billing_public: { news_paid: true } }).fetchFn);
  await refreshBilling(store, appCfg, fakeDb({ eab_my_billing: [], eab_billing_public: 'offline' }).fetchFn);
  assert.equal(serverNewsPaid(store), true, 'offline: last answer kept');
  await refreshBilling(store, appCfg, fakeDb({ eab_my_billing: [], eab_billing_public: 'missing' }).fetchFn);
  assert.equal(serverNewsPaid(store), false, 'function missing: switch off (the app as before)');
  // another account never inherits the last account's switch
  await refreshBilling(store, appCfg, fakeDb({ eab_my_billing: [], eab_billing_public: { news_paid: true } }).fetchFn);
  store.setSingleton('meta', { syncSession: { accessToken: 't', refreshToken: 'r', expiresAt: Date.now() + 3600_000, email: 'b@x.c', userId: U2 } });
  assert.equal(serverNewsPaid(store), false);
});

test('A-3 the database file: the switch is off by default, the feed rule keeps the old checks, and the undo puts the old rule back', () => {
  const sql = readFileSync(new URL('../../supabase/proposed/20261109100000_batch5_news_gate_play_events.sql', import.meta.url), 'utf8');
  const undo = readFileSync(new URL('../../supabase/proposed/20261109100000_batch5_news_gate_play_events_rollback.sql', import.meta.url), 'utf8');
  const feed = readFileSync(new URL('../../supabase/migrations/20261021200000_mainforadmin_d_feed.sql', import.meta.url), 'utf8');
  assert.match(sql, /news_paid\s+boolean not null default false/);
  const body = (s: string) => (s.match(/create or replace function public\.eab_feed_visible[\s\S]*?\$\$([\s\S]*?)\$\$;/) ?? [])[1]?.replace(/\s+/g, ' ').trim() ?? '';
  const old = body(feed); assert.ok(old.length > 100);
  assert.ok(body(sql).startsWith(old), 'the new rule = the old rule + the news line');
  assert.equal(body(undo), old, 'the undo restores the old rule exactly');
  // service-only functions are never granted to the phone
  for (const fn of ['eab_play_purchase_link', 'eab_play_purchase_owner', 'eab_tokens_refund']) {
    assert.match(sql, new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to service_role;`));
    assert.doesNotMatch(sql, new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to authenticated`));
  }
});
