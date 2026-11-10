// Batch 5 part 2 (10 Nov 2026): agency licences paid outside the Android app. The billing function (website checkout, owner's
// invoice) and billing-webhook (FPX bill read back, Stripe Checkout, the card link on an invoice) against stand-ins for
// Billplz, Stripe and the database. The database rules themselves: supabase/tests/agency_licences_test.sql.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import * as S from '../../supabase/functions/_shared/billing';
import * as A from '../../supabase/functions/_shared/agency';
import { handleWebhook } from '../../supabase/functions/billing-webhook/handler';
import { handleBilling } from '../../supabase/functions/billing/handler';

const NOW = Date.parse('2026-11-10T08:00:00Z');
const WS = '33333333-3333-4333-8333-333333333333';
const U1 = '11111111-1111-4111-8111-111111111111';
const INV = '44444444-4444-4444-8444-444444444444';
const TOKEN = 'ab'.repeat(32);
const SB = 'https://p.supabase.co';
const RPC = `${SB}/rest/v1/rpc/`;
const BASE = { SUPABASE_URL: SB, SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service', BILLING_RETURN_URL: 'https://app.example/back' };
const STRIPE = { STRIPE_SECRET_KEY: 'sk_test_1', STRIPE_WEBHOOK_SECRET: 'whsec_t' };
const BILLPLZ = { BILLPLZ_API_KEY: 'bkey', BILLPLZ_COLLECTION_ID: 'col1', BILLPLZ_BASE_URL: S.BILLPLZ_SANDBOX };
const inv = (o: Record<string, unknown> = {}) => ({ id: INV, no: 'AGI-00007', plan: 'agency_seat_monthly', seats: 3, amount_sen: 14700, days: 30, workspace: 'Tan Realty', pay_token: TOKEN, status: 'open', ...o });

type Call = { url: string; method: string; body: string; headers: Record<string, string> };
function world(env: Record<string, string>, answers: [string, (c: Call) => Response | Promise<Response>][]) {
  const calls: Call[] = [];
  const all: Record<string, string> = { ...BASE, ...env };
  const fetchFn = (async (url: string | URL, init?: RequestInit) => {
    const c: Call = { url: String(url), method: init?.method ?? 'GET', body: String(init?.body ?? ''), headers: Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v])) };
    calls.push(c);
    for (const [prefix, fn] of answers) if (c.url.startsWith(prefix)) return fn(c);
    return new Response('{}', { status: 500 });
  }) as typeof fetch;
  return { calls, deps: { env: (k: string) => all[k] ?? '', fetch: fetchFn, now: () => NOW } };
}
const signedIn: [string, (c: Call) => Response] = [`${SB}/auth/v1/user`, () => Response.json({ id: U1, email: 'boss@tanrealty.my' })];
const rpcBody = (w: { calls: Call[] }, name: string) => w.calls.filter(c => c.url === RPC + name).map(c => JSON.parse(c.body));
const post = (body: unknown, auth = 'Bearer agent-jwt') => new Request('https://fn/billing', { method: 'POST', headers: { authorization: auth, 'content-type': 'application/json' }, body: JSON.stringify(body) });
const hmac = (secret: string, msg: string) => createHmac('sha256', secret).update(msg).digest('hex');
const stripeSigned = (ev: unknown, at = Math.floor(NOW / 1000)) => { const raw = JSON.stringify(ev); return { raw, sig: `t=${at},v1=${hmac('whsec_t', `${at}.${raw}`)}` }; };
const session = (o: Record<string, unknown> = {}, type = 'checkout.session.completed', live = false) => ({
  id: 'evt_1', type, created: NOW / 1000, livemode: live,
  data: { object: { id: 'cs_test_1', mode: 'payment', payment_status: 'paid', currency: 'myr', amount_total: 14700, metadata: { agency_invoice: INV }, ...o } },
});
const bill = (o: Record<string, unknown> = {}) => ({ id: 'bill9', collection_id: 'col1', paid: true, state: 'paid', paid_amount: 14700, paid_at: '2026-11-10T07:59:00Z',
  reference_1_label: 'agency_invoice', reference_1: INV, reference_2_label: 'invoice_no', reference_2: 'AGI-00007', ...o });

test('A-1 Billplz bill and Stripe session → one agency payment; anything else is left to the personal-plan code', () => {
  assert.equal(A.mapAgencyBill({ ...bill(), reference_1_label: 'user', reference_1: U1 }, 'col1', 'sandbox'), null, 'a personal-plan bill');
  assert.deepEqual(A.mapAgencyBill(bill(), 'col1', 'sandbox'), { paid: { provider: 'fpx', eventId: 'billplz:bill9', invoiceId: INV, env: 'sandbox', ref: 'bill9', amountSen: 14700, eventAtMs: Date.parse('2026-11-10T07:59:00Z') } });
  assert.deepEqual(A.mapAgencyBill(bill({ collection_id: 'other' }), 'col1', 'sandbox'), { ignored: 'other-collection' });
  assert.deepEqual(A.mapAgencyBill(bill({ paid: false, state: 'due' }), 'col1', 'sandbox'), { ignored: 'not-paid' });
  assert.deepEqual(A.mapAgencyBill(bill({ reference_1: 'not-a-uuid' }), 'col1', 'sandbox'), { ignored: 'no-invoice' });
  assert.equal(A.mapAgencyStripe({ type: 'customer.subscription.updated', data: { object: { metadata: { user_id: U1 } } } }), null);
  assert.equal(A.mapAgencyStripe({ type: 'checkout.session.completed', data: { object: { mode: 'subscription', metadata: {} } } }), null, 'a personal checkout');
  const ok = A.mapAgencyStripe(session());
  assert.ok(ok && 'paid' in ok && ok.paid.eventId === 'stripe:cs_test_1' && ok.paid.amountSen === 14700 && ok.paid.env === 'sandbox');
  const late = A.mapAgencyStripe(session({}, 'checkout.session.async_payment_succeeded'));
  assert.ok(late && 'paid' in late && late.paid.eventId === 'stripe:cs_test_1', 'the same session applies once');
  assert.deepEqual(A.mapAgencyStripe(session({ payment_status: 'unpaid' })), { ignored: 'not-paid' });
  assert.deepEqual(A.mapAgencyStripe(session({ currency: 'usd' })), { ignored: 'not-ringgit' });
  assert.deepEqual(A.mapAgencyStripe(session({}, 'checkout.session.expired')), { ignored: 'checkout.session.expired' });
});

test('A-2 website checkout: only the agency owner or an admin; the database makes the invoice; FPX bill for exactly its amount', async () => {
  const w = world(BILLPLZ, [signedIn,
    [`${RPC}eab_agency_member_role`, () => Response.json('owner')],
    [`${RPC}eab_agency_open_checkout`, () => Response.json(inv())],
    [`${RPC}eab_agency_invoice_links`, () => Response.json(null)],
    [`${S.BILLPLZ_SANDBOX}/api/v3/bills`, () => Response.json({ id: 'bill9', url: `${S.BILLPLZ_SANDBOX}/bills/bill9` })]]);
  const r = await handleBilling(post({ action: 'agency_checkout', workspaceId: WS, plan: 'agency_seat_monthly', seats: 3, provider: 'fpx' }), w.deps);
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.url, `${S.BILLPLZ_SANDBOX}/bills/bill9`); assert.equal(j.invoice.amount_sen, 14700);
  const sent = new URLSearchParams(w.calls.find(c => c.url.endsWith('/api/v3/bills'))!.body);
  assert.equal(sent.get('amount'), '14700'); assert.equal(sent.get('reference_1_label'), 'agency_invoice'); assert.equal(sent.get('reference_1'), INV);
  assert.equal(sent.get('callback_url'), `${SB}/functions/v1/billing-webhook?p=fpx`);
  assert.deepEqual(rpcBody(w, 'eab_agency_open_checkout')[0], { p_ws: WS, p_user: U1, p_plan: 'agency_seat_monthly', p_seats: 3, p_env: 'sandbox' });
  assert.equal(rpcBody(w, 'eab_agency_invoice_links')[0].p_bill_id, 'bill9');

  const agent = world(BILLPLZ, [signedIn, [`${RPC}eab_agency_member_role`, () => Response.json('agent')]]);
  assert.equal((await handleBilling(post({ action: 'agency_checkout', workspaceId: WS, plan: 'agency_seat_monthly', seats: 3, provider: 'fpx' }), agent.deps)).status, 403);
  assert.equal(rpcBody(agent, 'eab_agency_open_checkout').length, 0, 'no invoice for an agent');
  for (const bad of [{ plan: 'pro_monthly' }, { seats: 0 }, { seats: 501 }, { provider: 'google_play' }, { workspaceId: 'x' }]) {
    const b = world(BILLPLZ, [signedIn]);
    assert.equal((await handleBilling(post({ action: 'agency_checkout', workspaceId: WS, plan: 'agency_seat_monthly', seats: 3, provider: 'fpx', ...bad }), b.deps)).status, 400, JSON.stringify(bad));
  }
  const none = world({}, [signedIn]);
  assert.equal((await handleBilling(post({ action: 'agency_checkout', workspaceId: WS, plan: 'agency_monthly', provider: 'stripe' }), none.deps)).status, 503, 'card not set up');
});

test('A-3 website checkout by card: one Stripe payment in ringgit for the invoice amount, marked with the invoice', async () => {
  const w = world(STRIPE, [signedIn,
    [`${RPC}eab_agency_member_role`, () => Response.json('admin')],
    [`${RPC}eab_agency_open_checkout`, () => Response.json(inv({ plan: 'agency_monthly', seats: 15, amount_sen: 39900 }))],
    [`${RPC}eab_agency_invoice_links`, () => Response.json(null)],
    ['https://api.stripe.com/v1/checkout/sessions', () => Response.json({ id: 'cs_test_9', url: 'https://checkout.stripe.com/c/pay/cs_test_9' })]]);
  const r = await handleBilling(post({ action: 'agency_checkout', workspaceId: WS, plan: 'agency_monthly', provider: 'stripe' }), w.deps);
  assert.equal((await r.json()).url, 'https://checkout.stripe.com/c/pay/cs_test_9');
  const b = new URLSearchParams(w.calls.find(c => c.url.includes('checkout/sessions'))!.body);
  assert.equal(b.get('mode'), 'payment'); assert.equal(b.get('line_items[0][price_data][currency]'), 'myr');
  assert.equal(b.get('line_items[0][price_data][unit_amount]'), '39900'); assert.equal(b.get('metadata[agency_invoice]'), INV);
  assert.equal(b.get('payment_intent_data[metadata][agency_invoice]'), INV);
});

test('A-4 owner invoice: raised with the owner\'s own sign-in (the database checks it), answers an FPX link and a card link', async () => {
  const w = world({ ...BILLPLZ, ...STRIPE }, [signedIn,
    [`${RPC}eab_admin_agency_invoice_create`, () => Response.json(inv({ origin: 'invoice', amount_sen: 9900 }))],
    [`${RPC}eab_agency_invoice_links`, () => Response.json(null)],
    [`${S.BILLPLZ_SANDBOX}/api/v3/bills`, () => Response.json({ id: 'bill10', url: `${S.BILLPLZ_SANDBOX}/bills/bill10` })]]);
  const r = await handleBilling(post({ action: 'agency_invoice', workspaceId: WS, plan: 'agency_seat_monthly', seats: 3, amountSen: 9900, payerEmail: 'accounts@tanrealty.my', billTo: 'Tan Realty Sdn Bhd', reason: 'first month discount' }, 'Bearer owner-jwt'), w.deps);
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.fpxUrl, `${S.BILLPLZ_SANDBOX}/bills/bill10`);
  assert.equal(j.cardUrl, `${SB}/functions/v1/billing-webhook?p=pay&i=${INV}&t=${TOKEN}`);
  const create = w.calls.find(c => c.url === RPC + 'eab_admin_agency_invoice_create')!;
  assert.equal(create.headers.authorization, 'Bearer owner-jwt', 'the owner\'s sign-in, not the service key');
  assert.equal(create.headers.apikey, 'anon');
  assert.equal(JSON.parse(create.body).p_amount_sen, 9900);
  assert.equal(new URLSearchParams(w.calls.find(c => c.url.endsWith('/api/v3/bills'))!.body).get('email'), 'accounts@tanrealty.my');

  const refused = world(BILLPLZ, [signedIn, [`${RPC}eab_admin_agency_invoice_create`, () => Response.json({ message: 'not allowed' }, { status: 403 })]]);
  const rr = await handleBilling(post({ action: 'agency_invoice', workspaceId: WS, plan: 'agency_monthly', payerEmail: 'a@b.my', reason: 'x' }), refused.deps);
  assert.equal(rr.status, 403);
  assert.equal(refused.calls.filter(c => c.url.includes('billplz')).length, 0, 'no bill without an invoice');
  const noEmail = world(BILLPLZ, [signedIn]);
  assert.equal((await handleBilling(post({ action: 'agency_invoice', workspaceId: WS, plan: 'agency_monthly', reason: 'x' }), noEmail.deps)).status, 400);
});

test('A-5 webhook: an FPX bill for an agency invoice is read back from Billplz and applied by the database', async () => {
  const w = world({ ...BILLPLZ }, [
    [`${S.BILLPLZ_SANDBOX}/api/v3/bills/bill9`, () => Response.json(bill())],
    [`${RPC}eab_agency_apply`, () => Response.json('applied')]]);
  const r = await handleWebhook(new Request('https://fn/billing-webhook?p=fpx', { method: 'POST', body: new URLSearchParams({ id: 'bill9', paid: 'true' }).toString() }), w.deps);
  assert.deepEqual(await r.json(), { result: 'applied' });
  const p = rpcBody(w, 'eab_agency_apply')[0];
  assert.deepEqual([p.p_provider, p.p_event_id, p.p_invoice, p.p_env, p.p_amount_sen], ['fpx', 'billplz:bill9', INV, 'sandbox', 14700]);
  assert.equal(rpcBody(w, 'eab_billing_apply').length, 0, 'not a personal plan');
  // the database could not be reached: 500, so Billplz sends it again
  const down = world({ ...BILLPLZ }, [[`${S.BILLPLZ_SANDBOX}/api/v3/bills/bill9`, () => Response.json(bill())], [`${RPC}eab_agency_apply`, () => new Response('{}', { status: 503 })]]);
  assert.equal((await handleWebhook(new Request('https://fn/billing-webhook?p=fpx', { method: 'POST', body: 'id=bill9' }), down.deps)).status, 500);
  // an unpaid bill changes nothing
  const unpaid = world({ ...BILLPLZ }, [[`${S.BILLPLZ_SANDBOX}/api/v3/bills/bill9`, () => Response.json(bill({ paid: false, state: 'due' }))]]);
  assert.deepEqual(await (await handleWebhook(new Request('https://fn/billing-webhook?p=fpx', { method: 'POST', body: 'id=bill9' }), unpaid.deps)).json(), { result: 'ignored', reason: 'not-paid' });
});

test('A-6 webhook: a signed Stripe Checkout for an agency invoice is applied; unsigned or live-in-sandbox is not', async () => {
  const w = world(STRIPE, [[`${RPC}eab_agency_apply`, () => Response.json('applied')]]);
  const s = stripeSigned(session());
  const r = await handleWebhook(new Request('https://fn/billing-webhook?p=stripe', { method: 'POST', headers: { 'stripe-signature': s.sig }, body: s.raw }), w.deps);
  assert.deepEqual(await r.json(), { result: 'applied' });
  assert.deepEqual(rpcBody(w, 'eab_agency_apply')[0].p_event_id, 'stripe:cs_test_1');
  const unsigned = world(STRIPE, []);
  assert.equal((await handleWebhook(new Request('https://fn/billing-webhook?p=stripe', { method: 'POST', headers: { 'stripe-signature': 't=1,v1=00' }, body: s.raw }), unsigned.deps)).status, 400);
  const live = world(STRIPE, [[`${RPC}eab_agency_apply`, () => Response.json('applied')]]);
  const l = stripeSigned(session({}, 'checkout.session.completed', true));
  assert.deepEqual(await (await handleWebhook(new Request('https://fn/billing-webhook?p=stripe', { method: 'POST', headers: { 'stripe-signature': l.sig }, body: l.raw }), live.deps)).json(), { result: 'ignored', reason: 'live-refused' });
  assert.equal(rpcBody(live, 'eab_agency_apply').length, 0);
});

test('A-7 the card link on an invoice: a fresh Stripe page for an open invoice with the right token; nothing else', async () => {
  const open = world(STRIPE, [
    [`${RPC}eab_agency_invoice_get`, c => Response.json(JSON.parse(c.body).p_token === TOKEN ? inv() : null)],
    [`${RPC}eab_agency_invoice_links`, () => Response.json(null)],
    ['https://api.stripe.com/v1/checkout/sessions', () => Response.json({ id: 'cs_test_2', url: 'https://checkout.stripe.com/c/pay/cs_test_2' })]]);
  const r = await handleWebhook(new Request(`https://fn/billing-webhook?p=pay&i=${INV}&t=${TOKEN}`), open.deps);
  assert.equal(r.status, 303); assert.equal(r.headers.get('location'), 'https://checkout.stripe.com/c/pay/cs_test_2');
  assert.equal(new URLSearchParams(open.calls.find(c => c.url.includes('checkout/sessions'))!.body).get('line_items[0][price_data][unit_amount]'), '14700');
  assert.equal((await handleWebhook(new Request(`https://fn/billing-webhook?p=pay&i=${INV}&t=${'cd'.repeat(32)}`), open.deps)).status, 404, 'wrong token');
  assert.equal((await handleWebhook(new Request(`https://fn/billing-webhook?p=pay&i=${INV}&t=short`), open.deps)).status, 404);
  const paid = world(STRIPE, [[`${RPC}eab_agency_invoice_get`, () => Response.json(inv({ status: 'paid' }))]]);
  const p = await handleWebhook(new Request(`https://fn/billing-webhook?p=pay&i=${INV}&t=${TOKEN}`), paid.deps);
  assert.equal(p.status, 410); assert.match(await p.text(), /already paid/);
  assert.equal(paid.calls.filter(c => c.url.includes('stripe.com')).length, 0);
  const noCard = world({}, []);
  assert.equal((await handleWebhook(new Request(`https://fn/billing-webhook?p=pay&i=${INV}&t=${TOKEN}`), noCard.deps)).status, 503);
});

test('A-8 personal plans still work as before through the same webhook', async () => {
  const w = world({ ...BILLPLZ }, [
    [`${S.BILLPLZ_SANDBOX}/api/v3/bills/bill1`, () => Response.json({ id: 'bill1', collection_id: 'col1', paid: true, state: 'paid', paid_amount: S.PLANS.pro_monthly.amountSen, reference_1: U1, reference_2: 'pro_monthly', paid_at: '2026-11-10T07:00:00Z' })],
    [`${RPC}eab_billing_apply`, () => Response.json('applied')]]);
  assert.deepEqual(await (await handleWebhook(new Request('https://fn/billing-webhook?p=fpx', { method: 'POST', body: 'id=bill1' }), w.deps)).json(), { result: 'applied' });
  assert.equal(rpcBody(w, 'eab_agency_apply').length, 0);
});

// ── the app ─────────────────────────────────────────────────────────────────────────────────────────────────────────
import { readFileSync } from 'node:fs';
import { Capacitor } from '@capacitor/core';
import { MemoryBackend } from '../src/data/backend';
import { Store } from '../src/data/store';
import { cachedRows, refreshBilling } from '../src/billing/api';
import { canPurchase, resolveEntitlement, resolveLine, type BillingRow } from '../src/billing/entitlement';
import { agencyTotal, invoiceCardLink, startAgencyCheckout, type AgencyInvoiceRow } from '../src/billing/agency';
import { agencyStrings } from '../src/billing/agencyStrings';
import { billingStrings } from '../src/billing/strings';

function asAndroid(on: boolean) {
  const c = Capacitor as unknown as Record<string, unknown>;
  c.isNativePlatform = () => on; c.getPlatform = () => (on ? 'android' : 'web');
}
const appCfg = { supabaseUrl: 'https://b5b.supabase.co', supabaseAnonKey: 'anon' };
const DAY = 86_400_000;
const row = (o: Partial<BillingRow>): BillingRow => ({ product: 'pro', plan_id: null, status: 'active', provider: 'stripe', env: 'sandbox', trial_end: null, period_end: new Date(NOW + 10 * DAY).toISOString(), cancel_at_period_end: false, ...o });

test('A-9 Pro through an agency seat: the line that allows the most wins; no personal Pro is sold on top of it', () => {
  const agency = row({ provider: 'agency', plan_id: 'agency_monthly' as never, period_end: new Date(NOW + 30 * DAY).toISOString(), cancel_at_period_end: true });
  const expiredOwn = row({ provider: 'fpx', period_end: new Date(NOW - 20 * DAY).toISOString(), cancel_at_period_end: true });
  const l = resolveLine([expiredOwn, agency], 'pro', NOW, false);
  assert.equal(l.provider, 'agency'); assert.equal(l.active, true);
  assert.equal(canPurchase(l, 'google_play'), false); assert.equal(canPurchase(l, 'fpx'), false);
  const own = row({ provider: 'stripe', period_end: new Date(NOW + 60 * DAY).toISOString() });
  assert.equal(resolveLine([agency, own], 'pro', NOW, false).provider, 'stripe', 'the later end wins');
  assert.equal(resolveEntitlement([agency], NOW, false).pos.active, false, 'an agency seat is Pro only');
  const ended = row({ provider: 'agency', period_end: new Date(NOW - 8 * DAY).toISOString() });
  assert.equal(canPurchase(resolveLine([ended], 'pro', NOW, false), 'google_play'), true);
  for (const lang of ['en', 'bm', 'zh'] as const) assert.ok(billingStrings[lang].state.agency('1 Dec').includes('1 Dec'));
});

test('A-10 the phone keeps the agency row it reads; checkout and prices are never offered inside the Android app', async () => {
  asAndroid(false);
  const store = await Store.open(new MemoryBackend());
  store.setSingleton('settings', { supabaseUrl: appCfg.supabaseUrl, supabaseAnonKey: appCfg.supabaseAnonKey });
  store.setSingleton('meta', { syncSession: { accessToken: 'tok', refreshToken: 'r', expiresAt: Date.now() + 3600_000, email: 'a@x.c', userId: U1, workspaceId: WS } });
  const fetchFn = (async (url: string) => {
    const name = String(url).split('/rpc/')[1] ?? '';
    if (name === 'eab_my_billing') return Response.json([{ product: 'pro', plan_id: 'agency_yearly', status: 'active', provider: 'agency', env: 'sandbox', trial_end: null, period_end: new Date(Date.now() + 300 * DAY).toISOString(), cancel_at_period_end: true }]);
    if (name === 'eab_billing_public') return Response.json({ news_paid: false });
    return new Response('{}', { status: 404 });
  }) as typeof fetch;
  assert.equal(await refreshBilling(store, appCfg, fetchFn), true);
  assert.equal(cachedRows(store).length, 1, 'the agency row is kept');
  assert.equal(resolveEntitlement(cachedRows(store), Date.now(), false).pro.active, true);

  asAndroid(true);
  let called = false;
  await assert.rejects(startAgencyCheckout(store, appCfg, WS, 'agency_monthly', 1, 'fpx', (async () => { called = true; return Response.json({}); }) as typeof fetch));
  assert.equal(called, false, 'nothing sent from the Android app');
  asAndroid(false);
  const ui = readFileSync(new URL('../src/billing/AgencyUI.tsx', import.meta.url), 'utf8');
  assert.match(ui, /boss && pays && prices\.length > 0/); assert.match(ui, /boss && pays && \(a\.invoices/);
  // what any agent can read on Android names no way to pay and no website
  for (const lang of ['en', 'bm', 'zh'] as const) {
    const s = agencyStrings[lang];
    for (const t of [s.title, s.none, s.inForce('1 Dec'), s.ended, s.seatsUsed(1, 2), s.mySeat, s.noSeat, s.managed, s.members, s.give, s.take, billingStrings[lang].state.agency('1 Dec')]) {
      assert.ok(!/web|site|laman|网站|FPX|card|kad|卡|invoice|invois|发票|pay|bayar|付款/i.test(t), `${lang}: ${t}`);
    }
  }
});

test('A-11 totals shown match the server\'s rule; the card link on an open invoice only', () => {
  assert.deepEqual(agencyTotal({ plan: 'agency_seat_monthly', style: 'seats', amount_sen: 4900, days: 30, seats_included: null }, 3), { seats: 3, sen: 14700 });
  assert.deepEqual(agencyTotal({ plan: 'agency_seat_monthly', style: 'seats', amount_sen: 4900, days: 30, seats_included: null }, 9999), { seats: 500, sen: 2450000 });
  assert.deepEqual(agencyTotal({ plan: 'agency_monthly', style: 'agency', amount_sen: 39900, days: 30, seats_included: 15 }, 3), { seats: 15, sen: 39900 });
  const i: AgencyInvoiceRow = { id: INV, no: 'AGI-00001', plan: 'agency_monthly', seats: 15, amount_sen: 39900, days: 30, status: 'open', created_at: '', paid_at: null, origin: 'invoice', fpx_url: null, pay_token: TOKEN };
  assert.equal(invoiceCardLink(appCfg, i), `https://b5b.supabase.co/functions/v1/billing-webhook?p=pay&i=${INV}&t=${TOKEN}`);
  assert.equal(invoiceCardLink(appCfg, { ...i, status: 'paid' }), null);
});
