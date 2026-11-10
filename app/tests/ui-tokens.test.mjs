// Batch B: the Ai Buddy Token wallet in Settings, in a real Chromium browser at phone width, signed in as one account. The
// company's database is a stand-in that answers like the real one (eab_my_tokens, eab_my_billing, eab_my_flags). A browser is
// not the Android app, so Google Play cannot be tried here: the Buy and Restore buttons must say "Only in the Android app" and
// stay disabled. Not a phone, not Supabase, not Google Play.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { chromium } from 'playwright';

const DIST = new URL('../dist/', import.meta.url).pathname;
const SHOTS = new URL('./screens/', import.meta.url).pathname;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.map': 'application/json' };
const SB = 'https://tok-ui.supabase.co';
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
  return { page, ctx, calls, fnCalls, errors };
}
const openSettings = async page => {
  await page.getByTestId('top-profile').click();
  await page.getByTestId('open-settings').click();
  await page.getByTestId('settings').waitFor();
};
async function waitFor(f, timeout = 10000) { const end = Date.now() + timeout; while (!(await f())) { if (Date.now() > end) throw new Error('timed out'); await new Promise(r => setTimeout(r, 50)); } }

const WALLET = { balances: { sandbox: 120, live: 999 }, history: [
  { delta: 100, kind: 'purchase', pack_id: 'tokens_100', env: 'sandbox', created_at: '2026-11-03T09:00:00Z' },
  { delta: 20, kind: 'purchase', pack_id: 'tokens_20', env: 'sandbox', created_at: '2026-11-02T09:00:00Z' },
  { delta: 999, kind: 'adjust', pack_id: null, env: 'live', created_at: '2026-11-01T09:00:00Z' },
] };

test('TU1 billing off (the default): no wallet in Settings, and the database is never asked for tokens', async () => {
  const { page, ctx, calls, errors } = await phone({ billing: [], tokens: WALLET });
  await openSettings(page);
  await page.waitForTimeout(400);
  assert.equal(await page.getByTestId('token-wallet').count(), 0);
  assert.ok(!calls.includes('eab_my_tokens'));
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('TU2 billing on: the wallet shows the test-mode balance and history from the database, the four packs, and Google Play only', async () => {
  const { page, ctx, calls, fnCalls, errors } = await phone({ billing: [], tokens: WALLET }, { billing: true });
  await openSettings(page);
  await page.getByTestId('token-wallet').waitFor();
  await waitFor(async () => calls.includes('eab_my_tokens'));
  await waitFor(async () => (await page.getByTestId('token-balance').innerText()) === 'Balance: 120 tokens');
  assert.match(await page.getByTestId('token-banner').innerText(), /Test mode/);
  assert.match(await page.getByTestId('token-what').innerText(), /1 token = USD 0\.25/);
  const prices = { tokens_20: 'USD 5', tokens_100: 'USD 25', tokens_400: 'USD 100', tokens_1000: 'USD 250' };
  for (const [id, p] of Object.entries(prices)) {
    assert.equal(await page.getByTestId(`token-price-${id}`).innerText(), p);
    assert.equal(await page.getByTestId(`token-buy-${id}`).isDisabled(), true, `${id}: not in a browser`);
  }
  assert.match(await page.getByTestId(`token-pack-tokens_1000`).innerText(), /1,150 tokens/);
  // Batch D: the bonus is shown on the bigger packs only
  assert.equal(await page.getByTestId('token-bonus-tokens_20').count(), 0);
  assert.equal(await page.getByTestId('token-bonus-tokens_100').innerText(), '100 + 5 bonus (+5%)');
  assert.equal(await page.getByTestId('token-bonus-tokens_400').innerText(), '400 + 40 bonus (+10%)');
  assert.equal(await page.getByTestId('token-bonus-tokens_1000').innerText(), '1,000 + 150 bonus (+15%)');
  assert.equal(await page.getByTestId('token-restore').isDisabled(), true);
  assert.match(await page.getByTestId('token-unavailable').innerText(), /Only in the Android app/);
  // only test-mode rows; the live row is a separate balance and is not shown while billing is not live
  assert.equal(await page.getByTestId('token-history-row').count(), 2);
  assert.match(await page.getByTestId('token-history').innerText(), /Bought[\s\S]*\+100[\s\S]*Bought[\s\S]*\+20/);
  assert.doesNotMatch(await page.getByTestId('token-wallet').innerText(), /999/);
  for (const id of ['token-buy-tokens_20', 'token-restore', 'token-refresh']) {
    const box = await page.getByTestId(id).boundingBox(); assert.ok(box && box.height >= 44, `${id} is at least 44px tall`);
  }
  const smallest = await page.getByTestId('token-wallet').evaluate(el => Math.min(...[...el.querySelectorAll('*')].filter(e => e.childElementCount === 0 && e.textContent.trim()).map(e => parseFloat(getComputedStyle(e).fontSize))));
  assert.ok(smallest >= 14, `smallest text ${smallest}px`);
  assert.ok((await page.evaluate(() => document.documentElement.scrollWidth)) <= 384, 'no sideways scrolling');
  await page.getByTestId('token-wallet').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}token-wallet.png`, fullPage: true });
  assert.deepEqual(fnCalls, [], 'nothing was bought');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('TU3 Refresh balance reads the database again; a database without the wallet shows 0 and no history', async () => {
  let n = 0;
  const { page, ctx, calls, errors } = await phone({ billing: [], tokens: () => ({ balances: { sandbox: n === 0 ? (n++, 20) : 420 }, history: [] }) }, { billing: true });
  await openSettings(page);
  await waitFor(async () => (await page.getByTestId('token-balance').innerText()) === 'Balance: 20 tokens');
  await page.getByTestId('token-refresh').click();
  await waitFor(async () => (await page.getByTestId('token-balance').innerText()) === 'Balance: 420 tokens');
  assert.ok(calls.filter(c => c === 'eab_my_tokens').length >= 2);
  assert.equal(await page.getByTestId('token-history-empty').innerText(), 'No tokens bought yet.');
  await ctx.close();
  const empty = await phone({ billing: [] }, { billing: true });
  await openSettings(empty.page);
  await waitFor(async () => empty.calls.includes('eab_my_tokens'));
  await empty.page.waitForTimeout(300);
  assert.equal(await empty.page.getByTestId('token-balance').innerText(), 'Balance: 0 tokens');
  assert.deepEqual([...errors, ...empty.errors], []);
  await empty.ctx.close();
});

test('TU4 the wallet is readable in Malay and Chinese', async () => {
  for (const [lang, re] of [['bm', /Baki: 120 token/], ['zh', /余额：120 个代币/]]) {
    const { page, ctx, errors } = await phone({ billing: [], tokens: WALLET }, { billing: true, lang });
    await openSettings(page);
    await page.getByTestId('token-wallet').waitFor();
    await waitFor(async () => re.test(await page.getByTestId('token-balance').innerText()));
    assert.match(await page.getByTestId('token-what').innerText(), /0\.25/);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});
