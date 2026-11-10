// Batch C: Property Lookups (Oneharta, paid with Ai Buddy Tokens) in a real Chromium browser at phone width, signed in as one
// account. The lookup server function and the database are stand-ins that answer like the real ones (functions/v1/lookup,
// eab_my_tokens, eab_my_lookups). Not a phone, not Supabase, not Oneharta: nothing here spends a real credit.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { chromium } from 'playwright';

const DIST = new URL('../dist/', import.meta.url).pathname;
const SHOTS = new URL('./screens/', import.meta.url).pathname;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.map': 'application/json' };
const SB = 'https://lk-ui.supabase.co';
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

/** db.tokens: what eab_my_tokens answers (undefined = the function is not on the database); db.billing: rows eab_my_billing answers (undefined = the function is not on the database); db.flags: eab_my_flags;
 *  db.fn(body): the billing function's answer ({ status, json }); every rpc and function call is recorded. */
async function phone(db = {}, settings = {}) {
  const ctx = await browser.newContext({ viewport: { width: 384, height: 824 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const calls = []; const fnCalls = []; const lk = [];
  const user = { id: 'u-me', email: 'me@x.com', metadata: { full_name: 'Test', country: 'Malaysia' } };
  await ctx.route(`${PAY}/**`, route => route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body><h1 id="pay">Test payment page</h1></body></html>' }));
  await ctx.route(`${SB}/**`, async route => {
    const req = route.request(); const url = new URL(req.url());
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'content-type': 'application/json' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (url.pathname === '/auth/v1/user') return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ id: user.id, email: user.email, user_metadata: user.metadata }) });
    if (url.pathname === '/functions/v1/lookup') {
      const body = JSON.parse(req.postData() || '{}'); lk.push(body);
      const a = db.lookup ? db.lookup(body) : { status: 404, json: null };
      return route.fulfill({ status: a.status, headers: cors, body: JSON.stringify(a.json) });
    }
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
      if (m[1] === 'eab_my_lookups') return route.fulfill({ status: 200, headers: cors, body: JSON.stringify(db.history ?? []) });
      if (m[1] === 'eab_my_tokens') {
        if (db.tokens === undefined) return route.fulfill({ status: 404, headers: cors, body: '{"code":"PGRST202","message":"Could not find the function public.eab_my_tokens"}' });
        return route.fulfill({ status: 200, headers: cors, body: JSON.stringify(typeof db.tokens === 'function' ? db.tokens() : db.tokens) });
      }
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
  return { page, ctx, calls, fnCalls, lk, errors };
}
const openSettings = async page => {
  await page.getByTestId('top-profile').click();
  await page.getByTestId('open-settings').click();
  await page.getByTestId('settings').waitFor();
};
async function waitFor(f, timeout = 10000) { const end = Date.now() + timeout; while (!(await f())) { if (Date.now() > end) throw new Error('timed out'); await new Promise(r => setTimeout(r, 50)); } }

let bal = 120;
const wallet = () => ({ balances: { sandbox: bal }, history: [] });
const TITLE = { titleNo: '12345', titleType: 'GRN', lotNo: 'Lot 777', ownerName: 'TAN AH KOW', ownerIdentityNo: '800101-14-5555', landArea: '1,650 sq ft', address: 'No 1 Jalan Contoh', contact: { phones: ['012-3456789'], emails: [] } };
/** A stand-in lookup function: free lists, and paid lookups that charge like the real one (3 tokens per credit). */
function lookupFn(over = {}) {
  return body => {
    if (over[body.action]) return over[body.action](body);
    const paid = (credits, result) => { bal -= credits * 3; return { status: 200, json: { lookupId: '33333333-3333-4333-8333-333333333333', tokensCharged: credits * 3, balance: bal, costChecked: true, result } }; };
    switch (body.action) {
      case 'ct_states': return { status: 200, json: { result: { states: ['Selangor', 'W.P. Kuala Lumpur'] } } };
      case 'ct_districts': return { status: 200, json: { result: { districts: ['Petaling'] } } };
      case 'ct_mukims': return { status: 200, json: { result: { mukims: ['Damansara'] } } };
      case 'ct_sections': return { status: 200, json: { result: { sections: [] } } };
      case 'ct_search': return paid(3, { numbersSearched: 1, numbersWithData: 1, record: { token: '9f2c', titles: [TITLE] } });
      case 'infosearch': return paid(0, { results: [], total: 0 });
      case 'sale_search': return paid(1, { results: [{ id: 100012345, region: 'Selangor', date: '2025-06-01', price: 'RM 650,000', address: 'Jalan Contoh 1', project: 'Taman Contoh', propertyType: 'Terrace', tenure: 'Freehold', hasVendor: true, hasPurchaser: true }], total: 1 });
      case 'sale_unlock': return paid(3, { vendor: 'LIM BOON', purchaser: 'WONG MEI' });
      default: return { status: 400, json: { error: 'bad request' } };
    }
  };
}
const openLookups = async page => {
  await openSettings(page);
  await page.getByTestId('token-wallet').waitFor();
  await page.getByTestId('open-lookups').click();
  await page.getByTestId('lookups').waitFor();
};

test('LU1 billing off (the default): no way into lookups from Settings or Market News, and the lookup function is never called', async () => {
  bal = 120;
  const { page, ctx, lk, errors } = await phone({ billing: [], tokens: wallet, lookup: lookupFn() });
  await openSettings(page);
  await page.waitForTimeout(300);
  assert.equal(await page.getByTestId('open-lookups').count(), 0);
  await page.goBack().catch(() => {});
  await page.reload(); await page.waitForSelector('nav.grid');
  await page.locator('nav.grid > button[data-key="market"]').click(); await page.getByTestId('market-news').waitFor();
  assert.equal(await page.getByTestId('market-ask').count(), 0, 'billing off: the Market News button opens the news straight away');
  assert.equal(await page.getByTestId('open-lookups').count(), 0);
  assert.deepEqual(lk, []); assert.deepEqual(errors, []);
  await ctx.close();
});

test('LU2 land tax: dropdowns are free; the cost and balance are shown before anything is charged; Cancel charges nothing; Confirm shows the record', async () => {
  bal = 120;
  const { page, ctx, lk, errors } = await phone({ billing: [], tokens: wallet, lookup: lookupFn() }, { billing: true });
  await openLookups(page);
  assert.match(await page.getByTestId('lookup-banner').innerText(), /Test mode/);
  await waitFor(async () => (await page.getByTestId('lookup-balance').innerText()) === 'Your tokens: 120');
  assert.match(await page.getByTestId('lookup-pdpa').innerText(), /Personal Data Protection Act 2010/);
  await waitFor(async () => (await page.getByTestId('ct-state').locator('option').count()) === 3);
  await page.getByTestId('ct-state').selectOption('Selangor');
  await waitFor(async () => (await page.getByTestId('ct-district').locator('option').count()) === 2);
  await page.getByTestId('ct-district').selectOption('Petaling');
  await waitFor(async () => (await page.getByTestId('ct-mukim').locator('option').count()) === 2);
  await page.getByTestId('ct-mukim').selectOption('Damansara');
  assert.equal(await page.getByTestId('ct-search').isDisabled(), true, 'no number yet');
  await page.getByTestId('ct-number').fill('777');
  assert.equal(await page.getByTestId('ct-search').innerText(), 'Search · up to 9 tokens');
  await page.getByTestId('ct-search').click();
  assert.match(await page.getByTestId('lookup-confirm').innerText(), /up to 9 tokens \(you have 120\)\. If nothing is found, nothing is charged/);
  await page.getByTestId('lookup-confirm-cancel').click();
  assert.equal(lk.filter(b => b.action === 'ct_search').length, 0, 'Cancel sends nothing');
  assert.deepEqual(lk.map(b => b.action), ['ct_states', 'ct_districts', 'ct_mukims', 'ct_sections']);
  await page.getByTestId('ct-search').click();
  await page.getByTestId('lookup-confirm-go').click();
  await page.getByTestId('ct-title').waitFor();
  const card = await page.getByTestId('ct-title').innerText();
  assert.match(card, /GRN 12345 · Lot 777/); assert.match(card, /TAN AH KOW/); assert.match(card, /800101-14-5555/); assert.match(card, /012-3456789/);
  assert.equal(await page.getByTestId('lookup-msg').innerText(), '9 tokens charged. Balance: 111.');
  const sent = lk.find(b => b.action === 'ct_search');
  assert.deepEqual(sent, { state: 'Selangor', district: 'Petaling', mukim: 'Damansara', section: '', searchBy: 'lotNo', titleType: 'GRN', number: '777', action: 'ct_search' });
  assert.ok(!JSON.stringify(sent).includes('token'), 'the phone sends no token count or price');
  await waitFor(async () => (await page.getByTestId('lookup-balance').innerText()) === 'Your tokens: 111');
  for (const id of ['ct-search', 'lookup-tab-company', 'lookup-tab-history']) {
    const box = await page.getByTestId(id).boundingBox(); assert.ok(box && box.height >= 44, `${id} is at least 44px tall`);
  }
  assert.ok((await page.evaluate(() => document.documentElement.scrollWidth)) <= 384, 'no sideways scrolling');
  await page.screenshot({ path: `${SHOTS}lookups-land-tax.png`, fullPage: true });
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('LU3 sales: search, then names unlocked for one record; InfoSearch with nothing found says nothing was charged', async () => {
  bal = 120;
  const { page, ctx, lk, errors } = await phone({ billing: [], tokens: wallet, lookup: lookupFn() }, { billing: true });
  await openLookups(page);
  await page.getByTestId('lookup-tab-sale').click();
  await page.getByTestId('sale-project').fill('Taman Contoh');
  await page.getByTestId('sale-search').click(); await page.getByTestId('lookup-confirm-go').click();
  await page.getByTestId('sale-row').waitFor();
  assert.match(await page.getByTestId('sale-row').innerText(), /RM 650,000/);
  assert.equal(await page.getByTestId('lookup-msg').first().innerText(), '3 tokens charged. Balance: 117.');
  await page.getByTestId('sale-unlock').click();
  assert.match(await page.getByTestId('lookup-confirm').innerText(), /up to 9 tokens/);
  await page.getByTestId('lookup-confirm-go').click();
  await waitFor(async () => /LIM BOON/.test(await page.getByTestId('sale-row').innerText()));
  assert.match(await page.getByTestId('sale-row').innerText(), /WONG MEI/);
  assert.deepEqual(lk.filter(b => b.action === 'sale_unlock'), [{ id: 100012345, action: 'sale_unlock' }]);
  await page.getByTestId('lookup-tab-info').click();
  await page.getByTestId('info-name').fill('Nobody Here');
  await page.getByTestId('info-search').click(); await page.getByTestId('lookup-confirm-go').click();
  await page.getByTestId('info-nothing').waitFor();
  assert.equal(await page.getByTestId('lookup-msg').innerText(), 'No tokens charged. Balance: 108.');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('LU4 refusals: not enough tokens and the daily limit are explained; the history lists lookups and reopens a land tax record for free', async () => {
  bal = 2;
  const history = [
    { id: '33333333-3333-4333-8333-333333333333', kind: 'ct_search', summary: 'Land tax lot 777, Damansara, Selangor', status: 'done', tokens: 9, reopen: true, created_at: '2026-11-10T03:00:00Z' },
    { id: '44444444-4444-4444-8444-444444444444', kind: 'infosearch', summary: 'InfoSearch by name', status: 'empty', tokens: 0, reopen: false, created_at: '2026-11-10T02:00:00Z' },
  ];
  const { page, ctx, lk, errors } = await phone({ billing: [], tokens: wallet, history, lookup: lookupFn({
    company: () => ({ status: 402, json: { error: 'not-enough-tokens', balance: 2, needed: 9 } }),
    infosearch: () => ({ status: 429, json: { error: 'agent-limit' } }),
    ct_record: () => ({ status: 200, json: { result: { token: '9f2c', titles: [TITLE] } } }),
  }) }, { billing: true });
  await openLookups(page);
  await page.getByTestId('lookup-tab-company').click();
  assert.equal(await page.getByTestId('company-search').isDisabled(), true, 'not 12 digits yet');
  await page.getByTestId('company-reg').fill('2019-0100-0005');
  await page.getByTestId('company-search').click(); await page.getByTestId('lookup-confirm-go').click();
  await waitFor(async () => /Not enough tokens: this needs up to 9, you have 2/.test(await page.getByTestId('lookup-msg').innerText()));
  assert.deepEqual(lk.find(b => b.action === 'company'), { registrationNo: '201901000005', action: 'company' });
  await page.getByTestId('lookup-tab-info').click();
  await page.getByTestId('info-ic').fill('800101145555');
  await page.getByTestId('info-search').click(); await page.getByTestId('lookup-confirm-go').click();
  await waitFor(async () => /today’s lookup limit/.test(await page.getByTestId('lookup-msg').innerText()));
  await page.getByTestId('lookup-tab-history').click();
  await waitFor(async () => (await page.getByTestId('history-row').count()) === 2);
  assert.match(await page.getByTestId('history-row').first().innerText(), /Land tax[\s\S]*9 · Found[\s\S]*Land tax lot 777/);
  assert.match(await page.getByTestId('history-row').nth(1).innerText(), /InfoSearch[\s\S]*0 · Nothing found/);
  assert.equal(await page.getByTestId('history-reopen').count(), 1, 'only reopenable lookups offer it');
  await page.getByTestId('history-reopen').click();
  await page.getByTestId('ct-title').waitFor();
  assert.deepEqual(lk.at(-1), { action: 'ct_record', lookupId: '33333333-3333-4333-8333-333333333333' });
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('LU5 the home Market News button asks News or Property Lookups (Batch D), and the screen reads in Malay and Chinese', async () => {
  bal = 30;
  const { page, ctx, errors } = await phone({ billing: [], tokens: wallet, lookup: lookupFn() }, { billing: true });
  const market = page.locator('nav.grid > button[data-key="market"]');
  assert.equal(await page.locator('nav.grid > button').count(), 15, 'the home grid keeps its 15 buttons');
  await market.click();
  await page.getByTestId('market-ask').waitFor();
  assert.match(await page.getByTestId('market-ask').innerText(), /Market News or Property Lookups\?[\s\S]*Market News and Intelligence[\s\S]*Property Lookups/);
  await page.getByTestId('market-lookups-pick').click();
  await page.getByTestId('lookups').waitFor();
  await page.goBack(); await page.waitForSelector('nav.grid');
  await market.click();
  await page.getByTestId('market-news-pick').click();
  await page.getByTestId('market-news').waitFor();
  assert.equal(await page.getByTestId('open-lookups').count(), 0, 'no second button inside Market News');
  assert.deepEqual(errors, []);
  await ctx.close();
  for (const [lang, re] of [['bm', /Token anda: 30/], ['zh', /您的代币：30/]]) {
    const x = await phone({ billing: [], tokens: wallet, lookup: lookupFn() }, { billing: true, lang });
    await openLookups(x.page);
    await waitFor(async () => re.test(await x.page.getByTestId('lookup-balance').innerText()));
    assert.match(await x.page.getByTestId('lookup-pdpa').innerText(), /2010/);
    assert.deepEqual(x.errors, []);
    await x.ctx.close();
  }
});
