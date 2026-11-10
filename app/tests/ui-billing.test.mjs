// Billing (sandbox / test mode) screen tests in a real Chromium browser at phone width, signed in as one account. The company's
// database and the billing function are stand-ins that answer like the real ones (eab_my_billing, eab_my_flags, functions/v1/billing);
// the payment page is a stand-in page. Not a phone, not Supabase, not Stripe, not Billplz, not Google Play.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { chromium } from 'playwright';

const DIST = new URL('../dist/', import.meta.url).pathname;
const SHOTS = new URL('./screens/', import.meta.url).pathname;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.map': 'application/json' };
const SB = 'https://bill-ui.supabase.co';
const PAY = 'https://www.billplz-sandbox.com';
let server, browser, base;

before(async () => {
  await mkdir(SHOTS, { recursive: true });
  server = createServer(async (req, res) => {
    const clean = req.url.split('?')[0];
    const path = join(DIST, clean === '/' ? 'index.html' : clean);
    try { res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' }); res.end(await readFile(path)); }
    catch { res.writeHead(404); res.end(); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}/`;
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.close(); });

const account = () => ({ status: 'active', terms: { version: '1.1-draft', at: '2026-10-21T00:00:00Z' }, marketing: false, licence: null, company_name: 'JSL Global Trading', support_email: null, business_address: null });
const DAY = 86_400_000;
const row = (o = {}) => ({ product: 'pro', plan_id: 'pro_monthly', status: 'active', provider: 'stripe', env: 'sandbox', trial_end: null, period_end: new Date(Date.now() + 20 * DAY).toISOString(), cancel_at_period_end: false, ...o });

/** db.billing: rows eab_my_billing answers (undefined = the function is not on the database); db.flags: eab_my_flags;
 *  db.fn(body): the billing function's answer ({ status, json }); every rpc and function call is recorded. */
async function phone(db = {}, settings = {}) {
  const ctx = await browser.newContext({ viewport: { width: 384, height: 824 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const calls = []; const fnCalls = [];
  const user = { id: 'u-me', email: 'me@x.com', metadata: { full_name: 'Test', country: 'Malaysia' } };
  await ctx.route(`${PAY}/**`, route => route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body><h1 id="pay">Test payment page</h1></body></html>' }));
  await ctx.route(`${SB}/**`, async route => {
    const req = route.request(); const url = new URL(req.url());
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'content-type': 'application/json' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (url.pathname === '/auth/v1/user') return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ id: user.id, email: user.email, user_metadata: user.metadata }) });
    if (url.pathname === '/functions/v1/billing') {
      const body = JSON.parse(req.postData() || '{}'); fnCalls.push(body);
      const a = db.fn ? db.fn(body) : { status: 404, json: { error: 'not found' } };
      return route.fulfill({ status: a.status, headers: cors, body: JSON.stringify(a.json) });
    }
    const m = /\/rest\/v1\/rpc\/(\w+)$/.exec(url.pathname);
    if (m) {
      calls.push(m[1]);
      if (m[1] === 'eab_my_account') return route.fulfill({ status: 200, headers: cors, body: JSON.stringify(account()) });
      if (['eab_log_login', 'eab_set_my_licence', 'eab_set_marketing'].includes(m[1])) return route.fulfill({ status: 200, headers: cors, body: '1' });
      if (m[1] === 'eab_public_settings') return route.fulfill({ status: 200, headers: cors, body: '{}' });
      if (m[1] === 'eab_my_feed') return route.fulfill({ status: 200, headers: cors, body: '[]' });
      if (m[1] === 'eab_my_flags') return route.fulfill({ status: 200, headers: cors, body: JSON.stringify(db.flags ?? {}) });
      // Batch 5 part 2: the agency licence (db.agency: what eab_my_agency answers; undefined = not on the database)
      if (m[1] === 'eab_my_agency') {
        if (db.agency === undefined) return route.fulfill({ status: 404, headers: cors, body: '{"code":"PGRST202","message":"Could not find the function public.eab_my_agency"}' });
        return route.fulfill({ status: 200, headers: cors, body: JSON.stringify(typeof db.agency === 'function' ? db.agency() : db.agency) });
      }
      if (m[1] === 'eab_agency_price_list') return route.fulfill({ status: 200, headers: cors, body: JSON.stringify(db.prices ?? []) });
      if (m[1] === 'eab_agency_seat_set') { const b = JSON.parse(req.postData() || '{}'); (db.seatCalls ??= []).push(b); return route.fulfill({ status: 200, headers: cors, body: '1' }); }
      if (m[1] === 'eab_my_billing') {
        if (db.billing === undefined) return route.fulfill({ status: 404, headers: cors, body: '{"code":"PGRST202","message":"Could not find the function public.eab_my_billing"}' });
        return route.fulfill({ status: 200, headers: cors, body: JSON.stringify(typeof db.billing === 'function' ? db.billing() : db.billing) });
      }
    }
    return route.fulfill({ status: 500, headers: cors, body: '{"message":"not part of this test"}' });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(base); await page.waitForSelector('nav.grid');
  await page.getByTestId('start-empty').click();
  await page.evaluate(async ({ SB, user, settings }) => {
    const idb = await new Promise(res => { const r = indexedDB.open('estate-agent-buddy'); r.onsuccess = () => res(r.result); });
    const put = (store, key, val) => new Promise((res, rej) => { const tx = idb.transaction(store, 'readwrite'); tx.objectStore(store).put(val, key); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    await put('records', 's:meta', { fired: [], dirty: [], tombstones: [], ownerChecked: true, syncWorkspaceId: 'ws1',
      syncSession: { accessToken: 'tok', refreshToken: 'r', expiresAt: Date.now() + 3_600_000, email: user.email, userId: user.id, name: 'Test', workspaceId: 'ws1', workspaceName: 'Mine', role: 'owner', country: 'Malaysia', signedInAt: Date.now() - 3_600_000 } });
    await put('records', 's:settings', { lang: 'en', layout: 'grid', supabaseUrl: SB, supabaseAnonKey: 'anon', startChoice: 'empty', country: 'Malaysia', countryUser: user.id, ...settings });
    idb.close();
  }, { SB, user, settings });
  await page.reload(); await page.waitForSelector('nav.grid');
  return { page, ctx, calls, fnCalls, errors };
}
const openSettings = async page => {
  await page.getByTestId('top-profile').click();
  await page.getByTestId('open-settings').click();
  await page.getByTestId('settings').waitFor();
};
async function waitFor(f, timeout = 10000) { const end = Date.now() + timeout; while (!(await f())) { if (Date.now() > end) throw new Error('timed out'); await new Promise(r => setTimeout(r, 50)); } }

test('BU1 switch off by default: Settings shows the switch, no plans card, and the database is never asked for plans', async () => {
  const { page, ctx, calls, errors } = await phone({ billing: [] });
  await openSettings(page);
  assert.equal(await page.getByTestId('billing-toggle').isChecked(), false);
  assert.equal(await page.getByTestId('billing-card').count(), 0);
  await page.waitForTimeout(400);
  assert.ok(!calls.includes('eab_my_billing'));
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('BU2 switch on: the card says test mode, shows both products as not active, the website’s two ways to pay and the proposed prices', async () => {
  const { page, ctx, errors } = await phone({ billing: [] });
  await openSettings(page);
  await page.getByTestId('billing-toggle').check();
  await page.getByTestId('billing-card').waitFor();
  assert.match(await page.getByTestId('billing-banner').innerText(), /Test mode.*No real money is charged/);
  assert.match(await page.getByTestId('billing-state-pro').innerText(), /Not active/);
  assert.match(await page.getByTestId('billing-state-pos').innerText(), /Not active/);
  const card = await page.getByTestId('billing-card').innerText();
  assert.match(card, /Pro, monthly[\s\S]*RM 49 per month/); assert.match(card, /Pro, yearly[\s\S]*RM 490 per year/); assert.match(card, /AI Buddy POS, monthly[\s\S]*RM 39 per month/);
  assert.match(card, /proposals until the owner approves/);
  assert.match(await page.getByTestId('billing-trial-pro').innerText(), /Start 14-day free trial/);
  // Batch 5 (Google Play rules): the website offers FPX and card; Google Play only exists inside the Android app, where it is
  // the ONLY way offered (tests/batch5.test.ts A-1)
  for (const id of ['fpx', 'stripe']) assert.equal(await page.getByTestId(`billing-provider-${id}`).count(), 1);
  assert.equal(await page.getByTestId('billing-provider-google_play').count(), 0);
  await page.getByTestId('billing-provider-fpx').click();
  assert.equal(await page.getByTestId('billing-pay-pro_monthly').isDisabled(), false);
  await page.screenshot({ path: `${SHOTS}billing-card.png`, fullPage: true });
  // the switch stays on after a restart
  await page.reload(); await page.waitForSelector('nav.grid');
  await openSettings(page);
  assert.equal(await page.getByTestId('billing-toggle').isChecked(), true);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('BU3 Admin EAB’s beta.billing shows the card without the phone switch', async () => {
  const { page, ctx } = await phone({ billing: [], flags: { 'beta.billing': true } });
  await openSettings(page);
  await page.getByTestId('billing-card').waitFor();
  assert.equal(await page.getByTestId('billing-toggle').isChecked(), false);
  await ctx.close();
  const off = await phone({ billing: [], flags: { 'tile.billing': true } });
  await openSettings(off.page);
  assert.equal(await off.page.getByTestId('billing-card').count(), 0, 'a tile key never turns a test feature on');
  await off.ctx.close();
});

test('BU4 the free trial: the phone asks the server for the product only, then shows the trial from the database', async () => {
  let rows = [];
  const { page, ctx, fnCalls, errors } = await phone({ billing: () => rows, fn: b => { if (b.action === 'trial') { rows = [row({ status: 'trialing', provider: 'trial', plan_id: null, trial_end: new Date(Date.now() + 14 * DAY).toISOString(), period_end: null })]; return { status: 200, json: { result: 'started' } }; } return { status: 400, json: {} }; } }, { billing: true });
  await openSettings(page);
  await page.getByTestId('billing-trial-pro').click();
  await waitFor(async () => /Free trial until/.test(await page.getByTestId('billing-state-pro').innerText()));
  assert.deepEqual(fnCalls, [{ action: 'trial', product: 'pro' }]);
  assert.match(await page.getByTestId('billing-state-pro').innerText(), /· test/);
  assert.equal(await page.getByTestId('billing-trial-pro').count(), 0, 'one trial: the button is gone');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('BU5 paying by FPX: the phone names the plan and provider, never a price, and opens the page the server answered', async () => {
  const { page, ctx, fnCalls } = await phone({ billing: [], fn: b => b.action === 'checkout' ? { status: 200, json: { url: `${PAY}/bills/abc`, env: 'sandbox' } } : { status: 400, json: {} } }, { billing: true });
  await openSettings(page);
  await page.getByTestId('billing-provider-fpx').click();
  await Promise.all([page.waitForURL(`${PAY}/bills/abc`), page.getByTestId('billing-pay-pro_monthly').click()]);
  assert.deepEqual(fnCalls, [{ action: 'checkout', provider: 'fpx', planId: 'pro_monthly' }]);
  assert.equal(await page.locator('#pay').innerText(), 'Test payment page');
  await ctx.close();
});

test('BU6 a server that is not set up says so; nothing opens and nothing pretends it was paid', async () => {
  const { page, ctx, fnCalls } = await phone({ billing: [], fn: () => ({ status: 503, json: { error: 'not-configured' } }) }, { billing: true });
  await openSettings(page);
  await page.getByTestId('billing-provider-stripe').click();
  await page.getByTestId('billing-pay-pro_yearly').click();
  await page.getByText('Payments are not set up on the server yet.').waitFor();
  assert.equal(fnCalls.length, 1); assert.ok(page.url().startsWith(base), 'still in the app');
  assert.match(await page.getByTestId('billing-state-pro').innerText(), /Not active/);
  await ctx.close();
});

test('BU7 an active Stripe subscription shows when it renews and blocks paying again by another method', async () => {
  const { page, ctx } = await phone({ billing: [row()] }, { billing: true });
  await openSettings(page);
  await waitFor(async () => /Active, renews around/.test(await page.getByTestId('billing-state-pro').innerText()));
  await page.getByTestId('billing-provider-fpx').click();
  assert.equal(await page.getByTestId('billing-pay-pro_monthly').isDisabled(), true);
  assert.equal(await page.getByTestId('billing-pay-pro_yearly').isDisabled(), true);
  assert.equal(await page.getByTestId('billing-pay-pos_monthly').isDisabled(), false, 'the other product is separate');
  assert.match(await page.getByTestId('billing-card').innerText(), /Already paid by another method/);
  await ctx.close();
});

test('BU8 a one-time FPX payment shows when it ends and can be paid again to add a period; a late one shows its grace', async () => {
  const fpx = row({ provider: 'fpx', cancel_at_period_end: true });
  const { page, ctx } = await phone({ billing: [fpx] }, { billing: true });
  await openSettings(page);
  await waitFor(async () => /Paid until .*then it stops/.test(await page.getByTestId('billing-state-pro').innerText()));
  assert.equal(await page.getByTestId('billing-pay-pro_monthly').isDisabled(), false);
  await ctx.close();
  const late = await phone({ billing: [row({ status: 'past_due', period_end: new Date(Date.now() - 2 * DAY).toISOString() })] }, { billing: true });
  await openSettings(late.page);
  await waitFor(async () => /Payment late: still allowed until/.test(await late.page.getByTestId('billing-state-pro').innerText()));
  await late.ctx.close();
});

test('BU9 a database without the billing function leaves the app as before: no plans, no errors', async () => {
  const { page, ctx, errors } = await phone({ billing: undefined }, { billing: true });
  await openSettings(page);
  await page.getByTestId('billing-card').waitFor();
  await page.waitForTimeout(400);
  assert.match(await page.getByTestId('billing-state-pro').innerText(), /Not active/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('BU10 the card is readable in Malay and Chinese', async () => {
  for (const [lang, banner] of [['bm', /Mod ujian/], ['zh', /测试模式/]]) {
    const { page, ctx } = await phone({ billing: [] }, { billing: true, lang });
    await openSettings(page);
    await page.getByTestId('billing-card').waitFor();
    assert.match(await page.getByTestId('billing-banner').innerText(), banner);
    await ctx.close();
  }
});

// ── Batch 5 part 2: the agency licence ──────────────────────────────────────────────────────────────────────────────
const PRICES = [
  { plan: 'agency_monthly', style: 'agency', amount_sen: 39900, days: 30, seats_included: 15 }, { plan: 'agency_seat_monthly', style: 'seats', amount_sen: 4900, days: 30, seats_included: null },
  { plan: 'agency_seat_yearly', style: 'seats', amount_sen: 49000, days: 365, seats_included: null }, { plan: 'agency_yearly', style: 'agency', amount_sen: 399000, days: 365, seats_included: 15 },
];
const TOKEN = 'ab'.repeat(32);
const ownerView = () => ({
  role: 'owner', my_seat: true, seats_used: 2,
  licence: { plan: 'agency_seat_monthly', style: 'seats', seats: 3, status: 'active', env: 'sandbox', period_end: new Date(Date.now() + 20 * DAY).toISOString(), provider: 'fpx', in_force: true },
  members: [{ user_id: 'u-me', email: 'me@x.com', role: 'owner', seat: true }, { user_id: 'u-ali', email: 'ali@x.com', role: 'agent', seat: true }, { user_id: 'u-siti', email: 'siti@x.com', role: 'agent', seat: false }],
  invoices: [{ id: '44444444-4444-4444-8444-444444444444', no: 'AGI-00003', plan: 'agency_seat_monthly', seats: 3, amount_sen: 14700, days: 30, status: 'open', created_at: new Date().toISOString(), paid_at: null, origin: 'invoice', fpx_url: 'https://www.billplz-sandbox.com/bills/bill3', pay_token: TOKEN }],
});

test('BU-A1 website, agency owner: licence and seats, seats moved, a plan priced and paid by FPX, an open invoice with its two links', async () => {
  const db = { billing: [row({ provider: 'agency', plan_id: 'agency_seat_monthly', cancel_at_period_end: true })], agency: ownerView, prices: PRICES,
    fn: b => (b.action === 'agency_checkout' ? { status: 200, json: { url: `${PAY}/bills/new`, env: 'sandbox', invoice: { id: 'x', no: 'AGI-00004', amount_sen: 14700, seats: 3, days: 30 } } } : { status: 404, json: {} }) };
  const { page, ctx, fnCalls, errors } = await phone(db);
  await openSettings(page);
  await page.getByTestId('billing-toggle').check();
  await page.getByTestId('agency-card').waitFor();
  assert.match(await page.getByTestId('billing-state-pro').innerText(), /Included in your agency's licence until/);
  assert.match(await page.getByTestId('agency-state').innerText(), /Agency licence until .* · test/);
  assert.match(await page.getByTestId('agency-seats').innerText(), /2 of 3 seats in use/);
  assert.equal(await page.getByTestId('agency-member').count(), 3);
  await page.getByTestId('agency-member').filter({ hasText: 'ali@x.com' }).getByTestId('agency-take').click();
  await waitFor(async () => (db.seatCalls ?? []).length === 1);
  assert.deepEqual(db.seatCalls[0], { p_ws: 'ws1', p_user: 'u-ali', p_on: false });
  // buying: per agent, 3 agents, monthly
  await page.getByTestId('agency-style-seats').click();
  await page.getByTestId('agency-seat-count').fill('3');
  assert.match(await page.getByTestId('agency-total').innerText(), /RM 147 for 30 days/);
  await page.getByTestId('agency-style-agency').click();
  assert.match(await page.getByTestId('agency-total').innerText(), /RM 399 for 30 days/);
  assert.match(await page.getByTestId('agency-card').innerText(), /Covers up to 15 agents/);
  await page.getByTestId('agency-style-seats').click();
  // the open invoice: FPX bill and the card link
  const inv = page.getByTestId('agency-invoice');
  assert.match(await inv.innerText(), /AGI-00003 · RM 147 · 30d/);
  assert.equal(await inv.getByRole('link', { name: 'Pay by FPX' }).getAttribute('href'), 'https://www.billplz-sandbox.com/bills/bill3');
  assert.equal(await inv.getByRole('link', { name: 'Pay by card' }).getAttribute('href'), `${SB}/functions/v1/billing-webhook?p=pay&i=44444444-4444-4444-8444-444444444444&t=${TOKEN}`);
  await page.getByTestId('agency-card').screenshot({ path: `${SHOTS}agency-card-owner.png` });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, 'nothing sticks out sideways');
  assert.deepEqual(errors, []);
  // paying opens the payment page (the website goes there in the same tab)
  await page.getByTestId('agency-pay-fpx').click();
  await waitFor(async () => fnCalls.some(c => c.action === 'agency_checkout'));
  assert.deepEqual(fnCalls.find(c => c.action === 'agency_checkout'), { action: 'agency_checkout', workspaceId: 'ws1', plan: 'agency_seat_monthly', seats: 3, provider: 'fpx' });
  await page.waitForURL(`${PAY}/bills/new`);
  await ctx.close();
});

test('BU-A2 an agent of the agency: covered, told who manages it; no members, prices, payments or invoices', async () => {
  const db = { billing: [row({ provider: 'agency', plan_id: 'agency_monthly', cancel_at_period_end: true })], prices: PRICES,
    agency: { role: 'agent', my_seat: true, seats_used: 4, licence: { plan: 'agency_monthly', style: 'agency', seats: 15, status: 'active', env: 'sandbox', period_end: new Date(Date.now() + 20 * DAY).toISOString(), provider: 'manual', in_force: true } } };
  const { page, ctx, calls, errors } = await phone(db);
  await openSettings(page);
  await page.getByTestId('billing-toggle').check();
  await page.getByTestId('agency-card').waitFor();
  assert.match(await page.getByTestId('agency-my-seat').innerText(), /You hold a seat: Pro is included/);
  const t = await page.getByTestId('agency-card').innerText();
  assert.match(t, /The agency owner and admins manage this licence/);
  for (const id of ['agency-member', 'agency-pay-fpx', 'agency-pay-card', 'agency-invoice', 'agency-total']) assert.equal(await page.getByTestId(id).count(), 0, id);
  assert.ok(!calls.includes('eab_agency_price_list'), 'prices are not even asked for');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('BU-A3 a database without agency licences: no agency card, the Plans card as before', async () => {
  const { page, ctx, errors } = await phone({ billing: [] });
  await openSettings(page);
  await page.getByTestId('billing-toggle').check();
  await page.getByTestId('billing-card').waitFor();
  await page.waitForTimeout(500);
  assert.equal(await page.getByTestId('agency-card').count(), 0);
  assert.deepEqual(errors, []);
  await ctx.close();
});
