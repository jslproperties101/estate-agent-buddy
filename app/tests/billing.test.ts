// Billing (sandbox / test mode): plans, access rules, the switch, the phone's calls, and the two server functions' logic.
// Stand-ins answer for Stripe, Billplz, Google and the database; nothing here uses a real payment provider, a real Supabase
// project or a real phone, and nothing proves those providers accept what the code sends.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, generateKeyPairSync, createVerify, createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { MemoryBackend } from '../src/data/backend';
import { Store } from '../src/data/store';
import { BILLING_LIVE, FEATURE_PRODUCT, GRACE_DAYS, PLANS, TRIAL_DAYS, planById, plansOf, rm } from '../src/billing/plans';
import { canPurchase, canUse, resolveEntitlement, resolveLine, type BillingRow } from '../src/billing/entitlement';
import { billingEnabled, featureAllowed } from '../src/billing/access';
import { BillingError, cachedEntitlement, cachedRows, refreshBilling, startCheckout, startTrial } from '../src/billing/api';
import { availability, sha256Hex, startPayment } from '../src/billing/providers';
import { billingStrings } from '../src/billing/strings';
import * as S from '../../supabase/functions/_shared/billing';
import { handleBilling } from '../../supabase/functions/billing/handler';
import { handleWebhook } from '../../supabase/functions/billing-webhook/handler';

const cfg = { supabaseUrl: 'https://bill-test.supabase.co', supabaseAnonKey: 'anon' };
const DAY = 86_400_000;
const NOW = Date.parse('2026-10-28T12:00:00Z');
const U1 = '11111111-1111-4111-8111-111111111111';
const iso = (ms: number) => new Date(ms).toISOString();
const row = (o: Partial<BillingRow> = {}): BillingRow => ({
  product: 'pro', plan_id: 'pro_monthly', status: 'active', provider: 'stripe', env: 'sandbox', trial_end: null, period_end: iso(NOW + 10 * DAY), cancel_at_period_end: false, ...o,
});

async function signedIn(user = U1) {
  const store = await Store.open(new MemoryBackend());
  store.setSingleton('settings', { supabaseUrl: cfg.supabaseUrl, supabaseAnonKey: cfg.supabaseAnonKey });
  store.setSingleton('meta', { syncSession: { accessToken: 'tok', refreshToken: 'r', expiresAt: Date.now() + 3600_000, email: 'a@x.c', userId: user } });
  return store;
}

// ── plans ───────────────────────────────────────────────────────────────────────────────────────────────────────────
test('B-1 the phone’s plan list equals the server’s price list (the server is the one that charges)', () => {
  assert.deepEqual(PLANS.map(p => ({ ...p })).sort((a, b) => a.id.localeCompare(b.id)), Object.values(S.PLANS).sort((a, b) => a.id.localeCompare(b.id)));
  assert.equal(TRIAL_DAYS, S.TRIAL_DAYS);
  assert.equal(planById('pro_monthly')?.amountSen, 4900);
  assert.equal(planById('nope'), undefined);
  assert.deepEqual(plansOf('pos').map(p => p.id), ['pos_monthly']);
  assert.equal(rm(4900), 'RM 49'); assert.equal(rm(4950), 'RM 49.50');
});

test('B-2 safe defaults: sandbox only, and nothing is gated until the owner decides', () => {
  assert.equal(BILLING_LIVE, false);
  assert.deepEqual(FEATURE_PRODUCT, {});
});

// ── access rules ────────────────────────────────────────────────────────────────────────────────────────────────────
test('B-3 a line is allowed while the trial or paid period runs, and for the grace days after a late payment', () => {
  const at = (r: Partial<BillingRow>, now = NOW) => resolveLine([row(r)], 'pro', now, false);
  assert.equal(resolveLine([], 'pro', NOW, false).state, 'none');
  assert.equal(at({}).state, 'active'); assert.equal(at({}).active, true);
  assert.equal(at({ cancel_at_period_end: true }).state, 'canceling');
  assert.equal(at({ status: 'trialing', provider: 'trial', trial_end: iso(NOW + DAY), period_end: null }).state, 'trialing');
  assert.equal(at({ status: 'trialing', provider: 'trial', trial_end: iso(NOW - 1), period_end: null }).state, 'expired');
  // period ended: grace, then expired
  const ended = { period_end: iso(NOW - DAY) };
  assert.equal(at(ended).state, 'grace'); assert.equal(at(ended).active, true);
  assert.equal(at({ period_end: iso(NOW - (GRACE_DAYS + 1) * DAY) }).state, 'expired');
  assert.equal(at({ status: 'past_due', period_end: iso(NOW - DAY) }).state, 'grace');
  assert.equal(at({ status: 'past_due', period_end: iso(NOW - (GRACE_DAYS + 1) * DAY) }).active, false);
  // cancelled keeps access to the end of the paid period only
  assert.equal(at({ status: 'canceled' }).state, 'canceling');
  assert.equal(at({ status: 'canceled', period_end: iso(NOW - 1) }).active, false);
  assert.equal(at({ status: 'expired' }).active, false);
});

test('B-4 a row that cannot be trusted gives no access (fails closed)', () => {
  assert.equal(resolveLine([row({ period_end: null })], 'pro', NOW, false).active, false, 'active with no end');
  assert.equal(resolveLine([row({ period_end: 'garbage' })], 'pro', NOW, false).active, false);
  assert.equal(resolveLine([row({ status: 'trialing', trial_end: null, period_end: null })], 'pro', NOW, false).active, false);
  assert.equal(resolveLine([row({ status: 'weird' as never })], 'pro', NOW, false).active, false);
  assert.equal(resolveLine([row({ product: 'pos' })], 'pro', NOW, false).state, 'none', 'another product’s row is not this product');
});

test('B-5 while live, a sandbox (test) purchase never counts; in sandbox mode both do', () => {
  const rows = [row({ env: 'sandbox' })];
  assert.equal(resolveEntitlement(rows, NOW, false).pro.active, true);
  assert.equal(resolveEntitlement(rows, NOW, false).pro.sandbox, true);
  assert.equal(resolveEntitlement(rows, NOW, true).pro.active, false);
  assert.equal(resolveEntitlement([row({ env: 'live' })], NOW, true).pro.active, true);
  const both = resolveEntitlement([row(), row({ product: 'pos', plan_id: 'pos_monthly' })], NOW, false);
  assert.equal(both.pro.active && both.pos.active, true);
});

test('B-6 with billing off everything works; with it on only listed features need their product', () => {
  const none = resolveEntitlement([], NOW, false); const pro = resolveEntitlement([row()], NOW, false);
  assert.equal(canUse('anything', none, false, { x: 'pro' }), true, 'switch off: as before');
  assert.equal(canUse('x', none, true, { x: 'pro' }), false);
  assert.equal(canUse('x', pro, true, { x: 'pro' }), true);
  assert.equal(canUse('x', pro, true, { x: 'pos' }), false);
  assert.equal(canUse('unlisted', none, true, {}), true, 'not listed: free');
  assert.equal(canUse('unlisted', none, true), true, 'the real table is empty: nothing is gated');
});

test('B-7 nobody pays twice for the same thing; a one-time FPX payment can be paid again', () => {
  const l = (r: Partial<BillingRow>) => resolveLine([row(r)], 'pro', NOW, false);
  assert.equal(canPurchase(resolveLine([], 'pro', NOW, false), 'stripe'), true);
  assert.equal(canPurchase(l({ status: 'trialing', provider: 'trial', trial_end: iso(NOW + DAY), period_end: null }), 'stripe'), true, 'trial can be converted');
  assert.equal(canPurchase(l({}), 'fpx'), false, 'active Stripe subscription');
  assert.equal(canPurchase(l({ provider: 'google_play' }), 'stripe'), false);
  assert.equal(canPurchase(l({ provider: 'fpx', cancel_at_period_end: true }), 'fpx'), true, 'renew by FPX');
  assert.equal(canPurchase(l({ provider: 'fpx', cancel_at_period_end: true }), 'stripe'), false);
  assert.equal(canPurchase(l({ period_end: iso(NOW - DAY) }), 'fpx'), true, 'late: allowed to fix it');
  assert.equal(canPurchase(l({ status: 'expired' }), 'stripe'), true);
});

// ── the switch and the phone's cache ────────────────────────────────────────────────────────────────────────────────
test('B-8 the billing switch is off by default; it turns on from Settings or from Admin EAB’s beta.billing', async () => {
  const store = await signedIn();
  assert.equal(billingEnabled(store), false);
  assert.equal(featureAllowed(store, 'x'), true);
  store.setSingleton('settings', { billing: true });
  assert.equal(billingEnabled(store), true);
  store.setSingleton('settings', { billing: false });
  assert.equal(billingEnabled(store), false);
  store.setSingleton('meta', { flags: { userId: U1, flags: { 'beta.billing': true }, at: 1 } });
  assert.equal(billingEnabled(store), true);
  store.setSingleton('meta', { flags: { userId: U1, flags: { 'tile.billing': true }, at: 1 } });
  assert.equal(billingEnabled(store), false, 'a tile key never turns a test feature on');
});

function fakeRpc(answer: unknown, opts: { offline?: boolean; missing?: boolean } = {}) {
  const calls: { url: string; body: string }[] = [];
  const fetchFn = (async (url: string, init?: RequestInit) => {
    if (opts.offline) throw new TypeError('Failed to fetch');
    calls.push({ url: String(url), body: String(init?.body ?? '') });
    if (opts.missing) return new Response('{"code":"PGRST202","message":"Could not find the function public.eab_my_billing"}', { status: 404 });
    return Response.json(answer);
  }) as typeof fetch;
  return { calls, fetchFn };
}

test('B-9 refreshBilling keeps the plans for the signed-in agent, drops malformed rows, and never uses another account’s', async () => {
  const store = await signedIn(U1);
  const db = fakeRpc([row(), { product: 'pro', status: 'active', provider: 'paypal', env: 'sandbox' }, null, { product: 'x' }]);
  assert.equal(await refreshBilling(store, cfg, db.fetchFn), true);
  assert.match(db.calls[0].url, /\/rest\/v1\/rpc\/eab_my_billing$/);
  assert.equal(cachedRows(store).length, 1);
  assert.equal(cachedEntitlement(store, NOW).pro.state, 'active');
  store.setSingleton('meta', { syncSession: { accessToken: 't', refreshToken: 'r', expiresAt: Date.now() + 3600_000, email: 'b@x.c', userId: 'u2' } });
  assert.deepEqual(cachedRows(store), [], 'another account never sees the last account’s plans');
  assert.equal(cachedEntitlement(store, NOW).pro.active, false);
});

test('B-10 offline keeps the last plans; a database without the function means no plans (the app as before)', async () => {
  const store = await signedIn();
  await refreshBilling(store, cfg, fakeRpc([row({ period_end: iso(Date.now() + 5 * DAY) })]).fetchFn);
  assert.equal(await refreshBilling(store, cfg, fakeRpc(null, { offline: true }).fetchFn), false);
  assert.equal(cachedRows(store).length, 1, 'offline: last answer kept');
  assert.equal(await refreshBilling(store, cfg, fakeRpc(null, { missing: true }).fetchFn), false);
  assert.equal(cachedRows(store).length, 0, 'function missing: no plans');
  const signedOut = await Store.open(new MemoryBackend());
  assert.equal(await refreshBilling(signedOut, cfg, fakeRpc([]).fetchFn), false);
});

test('B-11 the phone names a plan and a provider and never sends a price or a key', async () => {
  const store = await signedIn();
  const db = fakeRpc({ url: 'https://pay.example/x', env: 'sandbox' });
  await startCheckout(store, cfg, 'fpx', 'pro_monthly', db.fetchFn);
  assert.equal(db.calls[0].url, 'https://bill-test.supabase.co/functions/v1/billing');
  assert.deepEqual(JSON.parse(db.calls[0].body), { action: 'checkout', provider: 'fpx', planId: 'pro_monthly' });
  await startTrial(store, cfg, 'pos', db.fetchFn);
  assert.deepEqual(JSON.parse(db.calls[1].body), { action: 'trial', product: 'pos' });
  assert.doesNotMatch(db.calls.map(c => c.body).join(), /amount|price|secret|key/i);
});

test('B-12 a function that is not deployed says "not-configured"; offline says "network"; signed out says so; nothing pretends it worked', async () => {
  const store = await signedIn();
  const status = (code: number, body = '{}') => (async () => new Response(body, { status: code })) as typeof fetch;
  await assert.rejects(startTrial(store, cfg, 'pro', status(404)), (e: BillingError) => e.code === 'not-configured');
  await assert.rejects(startTrial(store, cfg, 'pro', status(503, '{"error":"not-configured"}')), (e: BillingError) => e.code === 'not-configured');
  await assert.rejects(startTrial(store, cfg, 'pro', (async () => { throw new TypeError('x'); }) as typeof fetch), (e: BillingError) => e.code === 'network');
  await assert.rejects(startTrial(store, cfg, 'pro', status(403, '{"error":"not-linked"}')), (e: BillingError) => e.code === 'not-linked');
  const out = await Store.open(new MemoryBackend());
  out.setSingleton('settings', { supabaseUrl: cfg.supabaseUrl, supabaseAnonKey: cfg.supabaseAnonKey });
  await assert.rejects(startTrial(out, cfg, 'pro', status(200)), (e: BillingError) => e.code === 'not-signed-in');
  await assert.rejects(startTrial(store, { supabaseUrl: '', supabaseAnonKey: '' }, 'pro', status(200)), (e: BillingError) => e.code === 'not-configured');
});

test('B-13 providers: Google Play is only offered in the Android app and says so when it is not there; an unknown plan is refused', async () => {
  assert.deepEqual(availability('fpx'), { ok: true });
  assert.deepEqual(availability('stripe'), { ok: true });
  assert.deepEqual(availability('google_play'), { ok: false, reason: 'android-only' });   // the tests run as "web"
  const store = await signedIn();
  await assert.rejects(startPayment(store, cfg, 'fpx', 'pro_lifetime'), (e: BillingError) => /unknown plan/.test(e.message));
  await assert.rejects(startPayment(store, cfg, 'google_play', 'pro_monthly'), (e: BillingError) => /android-only/.test(e.message));
  assert.equal(await sha256Hex(U1), createHash('sha256').update(U1).digest('hex'), 'same hash the server checks');
});

test('B-14 every screen text exists in English, Malay and Chinese, with the same shape', () => {
  const shape = (x: unknown, p = ''): string[] => typeof x === 'function' ? [p + '()'] : x && typeof x === 'object' ? Object.entries(x).flatMap(([k, v]) => shape(v, `${p}.${k}`)) : [p];
  const en = shape(billingStrings.en);
  assert.deepEqual(shape(billingStrings.bm), en); assert.deepEqual(shape(billingStrings.zh), en);
  for (const l of ['en', 'bm', 'zh'] as const) {
    const t = billingStrings[l];
    assert.ok(t.banner.length > 10 && t.title.length > 2 && t.pay('RM 49').includes('RM 49') && t.startTrial(14).includes('14'));
    assert.ok(t.state.active('1 Jan').length > 5 && t.state.grace('1 Jan').length > 5);
    for (const p of PLANS) assert.ok(t.planName[p.id], `${l} plan name ${p.id}`);
  }
});

test('B-15 no payment secret or provider key is written in the phone’s billing code', () => {
  const dir = new URL('../src/billing/', import.meta.url);
  const files = readdirSync(dir).filter(f => /\.tsx?$/.test(f));
  assert.ok(files.length >= 6);
  for (const f of files) {
    const text = readFileSync(new URL(f, dir), 'utf8');
    assert.doesNotMatch(text, /sk_(test|live)_|whsec_|rk_(test|live)_|BEGIN PRIVATE KEY|STRIPE_SECRET|BILLPLZ_API_KEY|SERVICE_ROLE/, f);
  }
});

// ── server logic: signatures ────────────────────────────────────────────────────────────────────────────────────────
const hmac = (secret: string, msg: string) => createHmac('sha256', secret).update(msg).digest('hex');

test('B-16 Stripe signature: right secret and body pass; wrong secret, changed body, old or future time, no header all fail', async () => {
  const body = '{"id":"evt_1"}'; const t = Math.floor(NOW / 1000);
  const header = `t=${t},v1=${hmac('whsec_a', `${t}.${body}`)}`;
  assert.equal(await S.verifyStripeSignature(body, header, 'whsec_a', NOW), true);
  assert.equal(await S.verifyStripeSignature(body, header, 'whsec_b', NOW), false, 'wrong secret');
  assert.equal(await S.verifyStripeSignature(body + ' ', header, 'whsec_a', NOW), false, 'changed body');
  assert.equal(await S.verifyStripeSignature(body, header, 'whsec_a', NOW + 6 * 60_000), false, 'replay after 5 minutes');
  assert.equal(await S.verifyStripeSignature(body, header, 'whsec_a', NOW - 6 * 60_000), false, 'timestamp from the future');
  assert.equal(await S.verifyStripeSignature(body, null, 'whsec_a', NOW), false);
  assert.equal(await S.verifyStripeSignature(body, header, '', NOW), false, 'no secret configured');
  assert.equal(await S.verifyStripeSignature(body, `t=${t}`, 'whsec_a', NOW), false, 'no v1');
  assert.equal(await S.verifyStripeSignature(body, `t=abc,v1=${hmac('whsec_a', `abc.${body}`)}`, 'whsec_a', NOW), false, 'bad timestamp');
  assert.equal(await S.verifyStripeSignature(body, `t=${t},v1=00,v1=${hmac('whsec_a', `${t}.${body}`)}`, 'whsec_a', NOW), true, 'any v1 may match (key rotation)');
  assert.equal(S.safeEqual('abc', 'abc'), true); assert.equal(S.safeEqual('abc', 'abd'), false); assert.equal(S.safeEqual('abc', 'ab'), false);
});

test('B-17 Billplz X Signature: sorted key+value pieces joined by "|"; a changed field or a wrong key fails', async () => {
  const p = { id: 'bill1', paid: 'true', amount: '4900', collection_id: 'c1' };
  assert.equal(S.billplzSourceString({ ...p, x_signature: 'zzz' }), 'amount4900|collection_idc1|idbill1|paidtrue');
  const sig = hmac('xkey', 'amount4900|collection_idc1|idbill1|paidtrue');
  assert.equal(await S.verifyBillplzSignature({ ...p, x_signature: sig }, 'xkey'), true);
  assert.equal(await S.verifyBillplzSignature({ ...p, amount: '100', x_signature: sig }, 'xkey'), false, 'changed amount');
  assert.equal(await S.verifyBillplzSignature({ ...p, x_signature: sig }, 'other'), false);
  assert.equal(await S.verifyBillplzSignature(p, 'xkey'), false, 'no signature');
  assert.equal(await S.verifyBillplzSignature({ ...p, x_signature: sig }, ''), false, 'no key');
});

test('B-18 live keys and the live Billplz address are refused unless the owner allowed live on purpose', () => {
  assert.equal(S.liveRefusal({ allowLive: false, stripeKey: 'sk_test_123' }), null);
  assert.equal(S.liveRefusal({ allowLive: false, stripeKey: 'sk_live_123' }), 'stripe-key-not-test');
  assert.equal(S.liveRefusal({ allowLive: false, stripeKey: 'whatever' }), 'stripe-key-not-test', 'unknown key kind is refused too');
  assert.equal(S.liveRefusal({ allowLive: false, billplzBase: S.BILLPLZ_SANDBOX }), null);
  assert.equal(S.liveRefusal({ allowLive: false, billplzBase: S.BILLPLZ_LIVE }), 'billplz-not-sandbox');
  assert.equal(S.liveRefusal({ allowLive: true, stripeKey: 'sk_live_123', billplzBase: S.BILLPLZ_LIVE }), null);
  assert.equal(S.liveRefusal({ allowLive: false }), null, 'nothing configured: nothing to refuse');
  assert.equal(S.stripeKeyMode('rk_test_x'), 'test'); assert.equal(S.stripeKeyMode('rk_live_x'), 'live'); assert.equal(S.stripeKeyMode(''), 'unknown');
});

test('B-19 the page the agent returns to must be https or the app’s own address', () => {
  assert.equal(S.safeReturnUrl('https://app.example/back'), 'https://app.example/back');
  assert.equal(S.safeReturnUrl('com.jslproperties.estateagentbuddy.qa://billing-return'), 'com.jslproperties.estateagentbuddy.qa://billing-return');
  for (const bad of ['http://x.example', 'javascript:alert(1)', 'https://user:pw@x.example', 'data:text/html,x', 'evil.app://x', '', undefined]) assert.equal(S.safeReturnUrl(bad as string | undefined), null, String(bad));
});

// ── server logic: provider answers ──────────────────────────────────────────────────────────────────────────────────
const stripeEvent = (o: Record<string, unknown> = {}, sub: Record<string, unknown> = {}) => ({
  id: 'evt_1', type: 'customer.subscription.updated', livemode: false, created: Math.floor(NOW / 1000),
  data: { object: { id: 'sub_1', status: 'active', cancel_at_period_end: false, metadata: { user_id: U1, product: 'pro', plan_id: 'pro_monthly' }, items: { data: [{ current_period_end: Math.floor(NOW / 1000) + 86400 * 30 }] }, ...sub } }, ...o,
});

test('B-20 a Stripe subscription event maps to one change; anything else, or anything not made by this app, changes nothing', () => {
  const m = S.mapStripeEvent(stripeEvent()) as { applied: S.Applied };
  assert.equal(m.applied.userId, U1); assert.equal(m.applied.planId, 'pro_monthly'); assert.equal(m.applied.status, 'active');
  assert.equal(m.applied.env, 'sandbox'); assert.equal(m.applied.periodEndMs, (Math.floor(NOW / 1000) + 86400 * 30) * 1000);
  assert.equal(m.applied.eventId, 'evt_1'); assert.equal(m.applied.provider, 'stripe');
  const old = S.mapStripeEvent(stripeEvent({}, { items: { data: [] }, current_period_end: 1_900_000_000 })) as { applied: S.Applied };
  assert.equal(old.applied.periodEndMs, 1_900_000_000_000, 'older API versions keep the period on the subscription');
  assert.equal((S.mapStripeEvent(stripeEvent({ livemode: true })) as { applied: S.Applied }).applied.env, 'live');
  assert.equal((S.mapStripeEvent(stripeEvent({ type: 'customer.subscription.deleted' })) as { applied: S.Applied }).applied.status, 'expired');
  assert.equal((S.mapStripeEvent(stripeEvent({}, { status: 'past_due' })) as { applied: S.Applied }).applied.status, 'past_due');
  assert.equal((S.mapStripeEvent(stripeEvent({}, { status: 'trialing' })) as { applied: S.Applied }).applied.status, 'trialing');
  assert.equal((S.mapStripeEvent(stripeEvent({}, { cancel_at_period_end: true })) as { applied: S.Applied }).applied.cancelAtPeriodEnd, true);
  for (const [name, ev] of [
    ['other event type', stripeEvent({ type: 'invoice.paid' })], ['incomplete', stripeEvent({}, { status: 'incomplete' })],
    ['no metadata', stripeEvent({}, { metadata: {} })], ['bad user id', stripeEvent({}, { metadata: { user_id: 'x', product: 'pro', plan_id: 'pro_monthly' } })],
    ['unknown plan', stripeEvent({}, { metadata: { user_id: U1, product: 'pro', plan_id: 'pro_lifetime' } })],
    ['plan/product mismatch', stripeEvent({}, { metadata: { user_id: U1, product: 'pos', plan_id: 'pro_monthly' } })], ['no event id', stripeEvent({ id: '' })], ['null', null],
  ] as const) assert.ok('ignored' in S.mapStripeEvent(ev), name);
});

const bill = (o: Record<string, unknown> = {}) => ({ id: 'bill1', collection_id: 'col1', paid: true, state: 'paid', amount: 4900, paid_amount: 4900, paid_at: iso(NOW), reference_1: U1, reference_2: 'pro_monthly', ...o });

test('B-21 a Billplz bill grants only when Billplz itself says it is paid, in our collection, for exactly the server’s price', () => {
  const m = S.mapBillplzBill(bill(), 'col1', 'sandbox') as { applied: S.Applied };
  assert.equal(m.applied.extendDays, 30); assert.equal(m.applied.status, 'active'); assert.equal(m.applied.provider, 'fpx');
  assert.equal(m.applied.amountSen, 4900); assert.equal(m.applied.eventId, 'bill1'); assert.equal(m.applied.cancelAtPeriodEnd, true);
  assert.equal((S.mapBillplzBill(bill({ reference_2: 'pro_yearly', amount: 49000, paid_amount: 49000 }), 'col1', 'sandbox') as { applied: S.Applied }).applied.extendDays, 365);
  for (const [name, b] of [
    ['not paid', bill({ paid: false, state: 'due' })], ['deleted', bill({ state: 'deleted' })], ['paid flag only', bill({ state: 'due' })],
    ['cheaper than the plan', bill({ amount: 100, paid_amount: 100 })], ['yearly price on a monthly plan', bill({ amount: 49000, paid_amount: 49000 })],
    ['other collection', bill({ collection_id: 'other' })], ['no references', bill({ reference_1: '', reference_2: '' })],
    ['unknown plan', bill({ reference_2: 'pro_lifetime' })], ['bad user', bill({ reference_1: 'not-a-uuid' })], ['no id', bill({ id: '' })], ['null', null],
  ] as const) assert.ok('ignored' in S.mapBillplzBill(b, 'col1', 'sandbox'), name);
});

test('B-22 a Google Play subscription maps by Google’s own state; a licence-tester purchase is sandbox', () => {
  const sub = (state: string, o: Record<string, unknown> = {}) => ({ subscriptionState: state, latestOrderId: 'GPA.1', lineItems: [{ productId: 'pro_monthly', expiryTime: iso(NOW + 5 * DAY), autoRenewingPlan: { autoRenewEnabled: true } }], ...o });
  const ctx = { userId: U1, planId: 'pro_monthly' as const, eventId: 'tok:GPA.1:ACTIVE' };
  const a = S.mapPlaySubscription(sub('SUBSCRIPTION_STATE_ACTIVE', { testPurchase: {} }), ctx, NOW) as { applied: S.Applied };
  assert.equal(a.applied.status, 'active'); assert.equal(a.applied.env, 'sandbox'); assert.equal(a.applied.periodEndMs, NOW + 5 * DAY); assert.equal(a.applied.cancelAtPeriodEnd, false);
  assert.equal((S.mapPlaySubscription(sub('SUBSCRIPTION_STATE_ACTIVE'), ctx, NOW) as { applied: S.Applied }).applied.env, 'live');
  const st = (s: string) => (S.mapPlaySubscription(sub(s), ctx, NOW) as { applied: S.Applied }).applied.status;
  assert.equal(st('SUBSCRIPTION_STATE_IN_GRACE_PERIOD'), 'past_due'); assert.equal(st('SUBSCRIPTION_STATE_CANCELED'), 'canceled');
  assert.equal(st('SUBSCRIPTION_STATE_ON_HOLD'), 'expired'); assert.equal(st('SUBSCRIPTION_STATE_PAUSED'), 'expired'); assert.equal(st('SUBSCRIPTION_STATE_EXPIRED'), 'expired');
  assert.ok('ignored' in S.mapPlaySubscription(sub('SUBSCRIPTION_STATE_PENDING'), ctx, NOW));
  assert.ok('ignored' in S.mapPlaySubscription(sub('SUBSCRIPTION_STATE_ACTIVE', { lineItems: [{ productId: 'pro_yearly', expiryTime: iso(NOW) }] }), ctx, NOW), 'the purchase is for another plan');
  assert.equal((S.mapPlaySubscription(sub('SUBSCRIPTION_STATE_ACTIVE', { lineItems: [{ productId: 'pro_monthly', expiryTime: iso(NOW), autoRenewingPlan: { autoRenewEnabled: false } }] }), ctx, NOW) as { applied: S.Applied }).applied.cancelAtPeriodEnd, true);
});

test('B-23 the database call carries only what the change needs, with real timestamps', () => {
  const p = S.applyParams((S.mapBillplzBill(bill(), 'col1', 'sandbox') as { applied: S.Applied }).applied);
  assert.deepEqual(Object.keys(p).sort(), ['p_amount_sen', 'p_cancel_at_end', 'p_env', 'p_event_at', 'p_event_id', 'p_extend_days', 'p_kind', 'p_period_end', 'p_plan', 'p_product', 'p_provider', 'p_ref', 'p_status', 'p_user'].sort());
  assert.equal(p.p_extend_days, 30); assert.equal(p.p_period_end, null); assert.equal(p.p_event_at, iso(NOW));
});

test('B-24 the Google service-account sign-in is a real RS256 JWT with the right claims', async () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  const jwt = await S.googleServiceJwt('svc@p.iam.gserviceaccount.com', privateKey, 'https://www.googleapis.com/auth/androidpublisher', 1_800_000_000);
  const [h, c, sig] = jwt.split('.');
  const dec = (x: string) => JSON.parse(Buffer.from(x, 'base64url').toString());
  assert.deepEqual(dec(h), { alg: 'RS256', typ: 'JWT' });
  assert.deepEqual(dec(c), { iss: 'svc@p.iam.gserviceaccount.com', scope: 'https://www.googleapis.com/auth/androidpublisher', aud: 'https://oauth2.googleapis.com/token', iat: 1_800_000_000, exp: 1_800_003_300 });
  assert.equal(createVerify('RSA-SHA256').update(`${h}.${c}`).verify(publicKey, Buffer.from(sig, 'base64url')), true);
});

// ── server functions: the handlers ──────────────────────────────────────────────────────────────────────────────────
type Call = { url: string; method: string; body: string; headers: Record<string, string> };
function world(env: Record<string, string>, answers: Record<string, (c: Call) => Response | Promise<Response>> = {}) {
  const calls: Call[] = [];
  const base = { SUPABASE_URL: 'https://p.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service', ...env };
  const fetchFn = (async (url: string | URL, init?: RequestInit) => {
    const c: Call = { url: String(url), method: init?.method ?? 'GET', body: String(init?.body ?? ''), headers: Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v])) };
    calls.push(c);
    for (const [prefix, fn] of Object.entries(answers)) if (c.url.startsWith(prefix)) return fn(c);
    return new Response('{}', { status: 500 });
  }) as typeof fetch;
  return { calls, deps: { env: (k: string) => base[k as keyof typeof base] ?? '', fetch: fetchFn, now: () => NOW } };
}
const userAnswer = { 'https://p.supabase.co/auth/v1/user': () => Response.json({ id: U1, email: 'ann@x.com' }) };
const applied = (result = 'applied') => ({ 'https://p.supabase.co/rest/v1/rpc/': () => Response.json(result) });
const post = (body: unknown, headers: Record<string, string> = { authorization: 'Bearer tok' }) => new Request('https://p.supabase.co/functions/v1/billing', { method: 'POST', headers, body: JSON.stringify(body) });
const STRIPE_ENV = { STRIPE_SECRET_KEY: 'sk_test_1', STRIPE_PRICE_PRO_MONTHLY: 'price_pm', STRIPE_PRICE_PRO_YEARLY: 'price_py', STRIPE_PRICE_POS_MONTHLY: 'price_pos', BILLING_RETURN_URL: 'https://app.example/back' };
const BILLPLZ_ENV = { BILLPLZ_API_KEY: 'bkey', BILLPLZ_COLLECTION_ID: 'col1', BILLPLZ_BASE_URL: S.BILLPLZ_SANDBOX, BILLING_RETURN_URL: 'https://app.example/back' };

test('B-25 billing function: not signed in, bad token, wrong method and unknown actions are refused', async () => {
  const w = world({}, { 'https://p.supabase.co/auth/v1/user': () => new Response('{}', { status: 401 }) });
  assert.equal((await handleBilling(post({ action: 'trial', product: 'pro' }, {}), w.deps)).status, 401);
  assert.equal((await handleBilling(post({ action: 'trial', product: 'pro' }), w.deps)).status, 401);
  assert.equal(w.calls.filter(c => c.url.includes('/rpc/')).length, 0, 'nothing reached the database');
  assert.equal((await handleBilling(new Request('https://p.supabase.co/x'), w.deps)).status, 405);
  assert.equal((await handleBilling(new Request('https://p.supabase.co/x', { method: 'OPTIONS' }), w.deps)).status, 200);
  const w2 = world({}, { ...userAnswer, ...applied() });
  assert.equal((await handleBilling(post({ action: 'refund' }), w2.deps)).status, 400);
  assert.equal((await handleBilling(post({ action: 'trial', product: 'gold' }), w2.deps)).status, 400);
  assert.equal((await handleBilling(post('not json' as never), w2.deps)).status, 400);
  assert.equal((await handleBilling(new Request('https://p.supabase.co/x', { method: 'POST', headers: { authorization: 'Bearer tok' }, body: '{' }), w2.deps)).status, 400);
  const w3 = world({ SUPABASE_URL: '' });
  assert.equal((await handleBilling(post({ action: 'trial', product: 'pro' }), w3.deps)).status, 503);
});

test('B-26 billing function: a live key is refused unless live was allowed on purpose', async () => {
  const w = world({ ...STRIPE_ENV, STRIPE_SECRET_KEY: 'sk_live_9' }, userAnswer);
  const r = await handleBilling(post({ action: 'checkout', provider: 'stripe', planId: 'pro_monthly' }), w.deps);
  assert.equal(r.status, 503); assert.equal((await r.json()).error, 'stripe-key-not-test');
  assert.equal(w.calls.length, 0, 'not even the sign-in was asked');
  const w2 = world({ ...BILLPLZ_ENV, BILLPLZ_BASE_URL: S.BILLPLZ_LIVE }, userAnswer);
  assert.equal((await handleBilling(post({ action: 'checkout', provider: 'fpx', planId: 'pro_monthly' }), w2.deps)).status, 503);
});

test('B-27 billing function: the free trial is asked of the database for this agent only, for the trial length, in sandbox', async () => {
  const w = world({}, { ...userAnswer, ...applied('started') });
  const r = await handleBilling(post({ action: 'trial', product: 'pos', user: 'someone-else', p_user: 'x' }), w.deps);
  assert.equal(r.status, 200); assert.equal((await r.json()).result, 'started');
  const rpc = w.calls.find(c => c.url.endsWith('/rpc/eab_billing_start_trial'))!;
  assert.deepEqual(JSON.parse(rpc.body), { p_user: U1, p_product: 'pos', p_days: TRIAL_DAYS, p_env: 'sandbox' });
  assert.equal(rpc.headers.authorization, 'Bearer service');
  const wl = world({ BILLING_ALLOW_LIVE: 'true' }, { ...userAnswer, ...applied('started') });
  await handleBilling(post({ action: 'trial', product: 'pro' }), wl.deps);
  assert.equal(JSON.parse(wl.calls.find(c => c.url.endsWith('/rpc/eab_billing_start_trial'))!.body).p_env, 'live');
});

test('B-28 billing function: Stripe Checkout uses the server’s price id and this agent’s id; an amount sent by the phone is ignored', async () => {
  const w = world(STRIPE_ENV, { ...userAnswer, 'https://api.stripe.com/v1/checkout/sessions': () => Response.json({ url: 'https://checkout.stripe.com/c/pay/x' }) });
  const r = await handleBilling(post({ action: 'checkout', provider: 'stripe', planId: 'pro_yearly', amount: 1, price: 'price_free', userId: 'other' }), w.deps);
  assert.equal(r.status, 200); const j = await r.json(); assert.equal(j.url, 'https://checkout.stripe.com/c/pay/x'); assert.equal(j.env, 'sandbox');
  const sent = new URLSearchParams(w.calls.find(c => c.url.includes('stripe.com'))!.body);
  assert.equal(sent.get('line_items[0][price]'), 'price_py'); assert.equal(sent.get('mode'), 'subscription');
  assert.equal(sent.get('client_reference_id'), U1); assert.equal(sent.get('subscription_data[metadata][user_id]'), U1);
  assert.equal(sent.get('subscription_data[metadata][plan_id]'), 'pro_yearly'); assert.equal(sent.get('subscription_data[metadata][product]'), 'pro');
  assert.equal(sent.get('success_url'), 'https://app.example/back'); assert.ok(!sent.has('amount') && !sent.has('unit_amount'));
  assert.equal(w.calls.find(c => c.url.includes('stripe.com'))!.headers.authorization, 'Bearer sk_test_1');
  const none = world({ ...STRIPE_ENV, STRIPE_PRICE_PRO_YEARLY: '' }, userAnswer);
  assert.equal((await handleBilling(post({ action: 'checkout', provider: 'stripe', planId: 'pro_yearly' }), none.deps)).status, 503);
  const bad = world(STRIPE_ENV, { ...userAnswer, 'https://api.stripe.com/': () => Response.json({ url: 'http://evil.example' }) });
  assert.equal((await handleBilling(post({ action: 'checkout', provider: 'stripe', planId: 'pro_monthly' }), bad.deps)).status, 502, 'a non-https page address is never handed on');
});

test('B-29 billing function: the Billplz bill is for the server’s price, names this agent and plan, and calls back to the webhook', async () => {
  const w = world(BILLPLZ_ENV, { ...userAnswer, [`${S.BILLPLZ_SANDBOX}/api/v3/bills`]: () => Response.json({ url: `${S.BILLPLZ_SANDBOX}/bills/abc` }) });
  const r = await handleBilling(post({ action: 'checkout', provider: 'fpx', planId: 'pos_monthly', amount: 1 }), w.deps);
  assert.equal(r.status, 200); const j = await r.json(); assert.equal(j.url, `${S.BILLPLZ_SANDBOX}/bills/abc`); assert.equal(j.env, 'sandbox');
  const c = w.calls.find(x => x.url.endsWith('/api/v3/bills'))!; const sent = new URLSearchParams(c.body);
  assert.equal(sent.get('amount'), '3900'); assert.equal(sent.get('collection_id'), 'col1');
  assert.equal(sent.get('reference_1'), U1); assert.equal(sent.get('reference_2'), 'pos_monthly');
  assert.equal(sent.get('callback_url'), 'https://p.supabase.co/functions/v1/billing-webhook?p=fpx'); assert.equal(sent.get('email'), 'ann@x.com');
  assert.equal(c.headers.authorization, `Basic ${Buffer.from('bkey:').toString('base64')}`);
  const off = world({ ...BILLPLZ_ENV, BILLPLZ_API_KEY: '' }, userAnswer);
  assert.equal((await handleBilling(post({ action: 'checkout', provider: 'fpx', planId: 'pro_monthly' }), off.deps)).status, 503);
  const elsewhere = world(BILLPLZ_ENV, { ...userAnswer, [`${S.BILLPLZ_SANDBOX}/`]: () => Response.json({ url: 'https://evil.example/pay' }) });
  assert.equal((await handleBilling(post({ action: 'checkout', provider: 'fpx', planId: 'pro_monthly' }), elsewhere.deps)).status, 502, 'only a Billplz address is handed on');
  for (const body of [{ action: 'checkout', provider: 'paypal', planId: 'pro_monthly' }, { action: 'checkout', provider: 'fpx', planId: 'free_forever' }, { action: 'checkout', provider: 'fpx' }])
    assert.equal((await handleBilling(post(body), w.deps)).status, 400);
});

function playWorld(sub: Record<string, unknown>, tokenOk = true) {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  return world({ PLAY_PACKAGE_NAME: 'com.jslproperties.estateagentbuddy.qa', PLAY_SERVICE_ACCOUNT_EMAIL: 'svc@p.iam.gserviceaccount.com', PLAY_SERVICE_ACCOUNT_PRIVATE_KEY: privateKey.replace(/\n/g, '\\n') }, {
    ...userAnswer, ...applied(),
    'https://oauth2.googleapis.com/token': () => (tokenOk ? Response.json({ access_token: 'gtok' }) : new Response('{}', { status: 400 })),
    'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.jslproperties.estateagentbuddy.qa/purchases/subscriptionsv2/': () => Response.json(sub),
    'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.jslproperties.estateagentbuddy.qa/purchases/subscriptions/': () => Response.json({}),
  });
}
const TOKEN = 'a'.repeat(40);
const playSub = (o: Record<string, unknown> = {}) => ({
  subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE', latestOrderId: 'GPA.1', acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING', testPurchase: {},
  externalAccountIdentifiers: { obfuscatedExternalAccountId: createHash('sha256').update(U1).digest('hex') },
  lineItems: [{ productId: 'pro_monthly', expiryTime: iso(NOW + 30 * DAY), autoRenewingPlan: { autoRenewEnabled: true } }], ...o,
});

test('B-30 billing function: a Google Play purchase is checked with Google, must belong to this agent, is applied once and then acknowledged', async () => {
  const w = playWorld(playSub());
  const r = await handleBilling(post({ action: 'play_verify', planId: 'pro_monthly', purchaseToken: TOKEN }), w.deps);
  assert.equal(r.status, 200); const j = await r.json(); assert.equal(j.status, 'active'); assert.equal(j.env, 'sandbox');
  const rpc = JSON.parse(w.calls.find(c => c.url.endsWith('/rpc/eab_billing_apply'))!.body);
  assert.equal(rpc.p_user, U1); assert.equal(rpc.p_provider, 'google_play'); assert.equal(rpc.p_plan, 'pro_monthly'); assert.equal(rpc.p_env, 'sandbox');
  assert.ok(!rpc.p_event_id.includes(TOKEN), 'the purchase token itself is never stored');
  assert.ok(w.calls.some(c => c.url.endsWith(`:acknowledge`) && c.method === 'POST'), 'acknowledged, or Google refunds it after 3 days');
  assert.equal(w.calls.find(c => c.url.includes('subscriptionsv2'))!.headers.authorization, 'Bearer gtok');
  // another agent's purchase, or one with no link to anyone
  const other = playWorld(playSub({ externalAccountIdentifiers: { obfuscatedExternalAccountId: createHash('sha256').update('someone-else').digest('hex') } }));
  assert.equal((await handleBilling(post({ action: 'play_verify', planId: 'pro_monthly', purchaseToken: TOKEN }), other.deps)).status, 403);
  assert.equal(other.calls.filter(c => c.url.includes('/rpc/')).length, 0);
  const unlinked = playWorld(playSub({ externalAccountIdentifiers: undefined }));
  assert.equal((await handleBilling(post({ action: 'play_verify', planId: 'pro_monthly', purchaseToken: TOKEN }), unlinked.deps)).status, 403);
  // a live purchase while live is not allowed, a purchase for another plan, a pending one, bad input, Google refusing
  const live = playWorld(playSub({ testPurchase: undefined }));
  assert.equal((await handleBilling(post({ action: 'play_verify', planId: 'pro_monthly', purchaseToken: TOKEN }), live.deps)).status, 403);
  const wrongPlan = playWorld(playSub());
  assert.equal((await handleBilling(post({ action: 'play_verify', planId: 'pro_yearly', purchaseToken: TOKEN }), wrongPlan.deps)).status, 422);
  assert.equal((await handleBilling(post({ action: 'play_verify', planId: 'pro_monthly', purchaseToken: 'short' }), w.deps)).status, 400);
  assert.equal((await handleBilling(post({ action: 'play_verify', planId: 'nope', purchaseToken: TOKEN }), w.deps)).status, 400);
  assert.equal((await handleBilling(post({ action: 'play_verify', planId: 'pro_monthly', purchaseToken: TOKEN }), playWorld(playSub(), false).deps)).status, 502);
  assert.equal((await handleBilling(post({ action: 'play_verify', planId: 'pro_monthly', purchaseToken: TOKEN }), world({}, userAnswer).deps)).status, 503, 'not configured');
});

const webhook = (provider: string, body: string, headers: Record<string, string> = {}, method = 'POST') => new Request(`https://p.supabase.co/functions/v1/billing-webhook?p=${provider}`, { method, headers, body: method === 'POST' ? body : undefined });
const stripeSigned = (ev: unknown, secret = 'whsec_t', at = Math.floor(NOW / 1000)) => { const raw = JSON.stringify(ev); return { raw, headers: { 'stripe-signature': `t=${at},v1=${hmac(secret, `${at}.${raw}`)}` } }; };
const WH_ENV = { ...STRIPE_ENV, ...BILLPLZ_ENV, STRIPE_WEBHOOK_SECRET: 'whsec_t', BILLPLZ_XSIGNATURE_KEY: 'xkey' };

test('B-31 webhook: a Stripe call with a wrong, old or missing signature changes nothing and never reaches the database', async () => {
  const w = world(WH_ENV, applied());
  const ev = stripeEvent();
  for (const [name, signed] of [['wrong secret', stripeSigned(ev, 'whsec_other')], ['replayed', stripeSigned(ev, 'whsec_t', Math.floor(NOW / 1000) - 3600)], ['unsigned', { raw: JSON.stringify(ev), headers: {} }]] as const) {
    const r = await handleWebhook(webhook('stripe', signed.raw, signed.headers), w.deps);
    assert.equal(r.status, 400, name);
  }
  assert.equal(w.calls.length, 0);
  const tampered = stripeSigned(ev); const body = tampered.raw.replace('pro_monthly', 'pro_yearly');
  assert.equal((await handleWebhook(webhook('stripe', body, tampered.headers), w.deps)).status, 400, 'body changed after signing');
  assert.equal((await handleWebhook(webhook('stripe', '', {}, 'GET'), w.deps)).status, 405);
  assert.equal((await handleWebhook(webhook('paypal', '{}'), w.deps)).status, 400);
  assert.equal((await handleWebhook(webhook('stripe', '{}'), world({ ...WH_ENV, STRIPE_WEBHOOK_SECRET: '' }, applied()).deps)).status, 503);
});

test('B-32 webhook: a properly signed Stripe subscription event is applied once through the database function; other events are answered 200 and change nothing', async () => {
  const w = world(WH_ENV, applied());
  const s = stripeSigned(stripeEvent());
  const r = await handleWebhook(webhook('stripe', s.raw, s.headers), w.deps);
  assert.equal(r.status, 200); assert.equal((await r.json()).result, 'applied');
  const rpcs = w.calls.filter(c => c.url.endsWith('/rpc/eab_billing_apply'));
  assert.equal(rpcs.length, 1); const p = JSON.parse(rpcs[0].body);
  assert.equal(p.p_user, U1); assert.equal(p.p_event_id, 'evt_1'); assert.equal(p.p_status, 'active'); assert.equal(p.p_env, 'sandbox');
  assert.equal(rpcs[0].headers.authorization, 'Bearer service');
  const other = world(WH_ENV, applied()); const o = stripeSigned(stripeEvent({ type: 'invoice.paid' }));
  const ro = await handleWebhook(webhook('stripe', o.raw, o.headers), other.deps);
  assert.equal(ro.status, 200); assert.equal((await ro.json()).result, 'ignored'); assert.equal(other.calls.length, 0);
  const liveEv = world(WH_ENV, applied()); const l = stripeSigned(stripeEvent({ livemode: true }));
  assert.equal((await (await handleWebhook(webhook('stripe', l.raw, l.headers), liveEv.deps)).json()).reason, 'live-refused'); assert.equal(liveEv.calls.length, 0);
  const dbDown = world(WH_ENV, { 'https://p.supabase.co/rest/v1/rpc/': () => new Response('x', { status: 500 }) });
  assert.equal((await handleWebhook(webhook('stripe', s.raw, s.headers), dbDown.deps)).status, 500, 'a 500 makes Stripe retry later');
  const dup = world(WH_ENV, applied('duplicate'));
  assert.equal((await (await handleWebhook(webhook('stripe', s.raw, s.headers), dup.deps)).json()).result, 'duplicate');
});

const billplzCallback = (params: Record<string, string>, key = 'xkey') => {
  const sig = hmac(key, S.billplzSourceString(params));
  return new URLSearchParams({ ...params, x_signature: sig }).toString();
};
const billAnswer = (b: unknown) => ({ [`${S.BILLPLZ_SANDBOX}/api/v3/bills/bill1`]: () => Response.json(b) });

test('B-33 webhook: a Billplz callback is checked, then the bill is read back from Billplz and only that answer can grant access', async () => {
  const cb = billplzCallback({ id: 'bill1', paid: 'true', amount: '4900', collection_id: 'col1' });
  const w = world(WH_ENV, { ...billAnswer(bill()), ...applied() });
  const r = await handleWebhook(webhook('fpx', cb, { 'content-type': 'application/x-www-form-urlencoded' }), w.deps);
  assert.equal(r.status, 200); assert.equal((await r.json()).result, 'applied');
  const read = w.calls.find(c => c.url.endsWith('/api/v3/bills/bill1'))!;
  assert.equal(read.headers.authorization, `Basic ${Buffer.from('bkey:').toString('base64')}`);
  const p = JSON.parse(w.calls.find(c => c.url.endsWith('/rpc/eab_billing_apply'))!.body);
  assert.equal(p.p_provider, 'fpx'); assert.equal(p.p_extend_days, 30); assert.equal(p.p_event_id, 'bill1'); assert.equal(p.p_user, U1);
  // the callback says paid, Billplz says it is not: nothing granted
  const liar = world(WH_ENV, { ...billAnswer(bill({ paid: false, state: 'due' })), ...applied() });
  const rl = await handleWebhook(webhook('fpx', cb), liar.deps);
  assert.equal((await rl.json()).result, 'ignored'); assert.equal(liar.calls.filter(c => c.url.includes('/rpc/')).length, 0);
  // paid, but for less than the plan costs
  const cheap = world(WH_ENV, { ...billAnswer(bill({ amount: 100, paid_amount: 100 })), ...applied() });
  assert.equal((await (await handleWebhook(webhook('fpx', cb), cheap.deps)).json()).reason, 'amount-mismatch');
  // a bad signature never reaches Billplz or the database
  const bad = world(WH_ENV, { ...billAnswer(bill()), ...applied() });
  assert.equal((await handleWebhook(webhook('fpx', billplzCallback({ id: 'bill1', paid: 'true' }, 'wrong-key')), bad.deps)).status, 400);
  assert.equal((await handleWebhook(webhook('fpx', 'id=bill1&paid=true'), bad.deps)).status, 400, 'unsigned');
  assert.equal(bad.calls.length, 0);
  // a bill id that is not a plain id is refused before any address is built from it
  const weird = world({ ...WH_ENV, BILLPLZ_XSIGNATURE_KEY: '' }, applied());
  assert.equal((await handleWebhook(webhook('fpx', 'id=../../x'), weird.deps)).status, 400); assert.equal(weird.calls.length, 0);
  // Billplz unreachable: 502 so Billplz retries
  const down = world(WH_ENV, { [`${S.BILLPLZ_SANDBOX}/`]: () => new Response('x', { status: 500 }) });
  assert.equal((await handleWebhook(webhook('fpx', cb), down.deps)).status, 502);
});

test('B-34 webhook: sandbox may rely on the read-back alone, but going live without the X Signature key is refused', async () => {
  const noKey = { ...WH_ENV, BILLPLZ_XSIGNATURE_KEY: '' };
  const sandbox = world(noKey, { ...billAnswer(bill()), ...applied() });
  assert.equal((await (await handleWebhook(webhook('fpx', 'id=bill1&paid=true'), sandbox.deps)).json()).result, 'applied');
  const live = world({ ...noKey, BILLING_ALLOW_LIVE: 'true' }, { ...billAnswer(bill()), ...applied() });
  assert.equal((await handleWebhook(webhook('fpx', 'id=bill1&paid=true'), live.deps)).status, 503);
  const liveKey = world({ ...WH_ENV, STRIPE_SECRET_KEY: 'sk_live_1' }, applied());
  assert.equal((await handleWebhook(webhook('stripe', '{}'), liveKey.deps)).status, 503, 'a live key is refused here too');
});

test('B-35 the server functions never write secrets or tokens to a log', () => {
  const files = ['billing/handler.ts', 'billing/index.ts', 'billing-webhook/handler.ts', 'billing-webhook/index.ts', '_shared/billing.ts'];
  for (const f of files) assert.doesNotMatch(readFileSync(new URL(`../../supabase/functions/${f}`, import.meta.url), 'utf8'), /console\.(log|info|debug|warn|error)/, f);
});
