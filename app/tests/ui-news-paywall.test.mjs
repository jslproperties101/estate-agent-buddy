// Batch A: the Market News and Intelligence paywall in a real Chromium browser at phone width, signed in as one account.
// The company's database is a stand-in that answers like the real one (eab_my_feed, eab_my_billing, eab_my_flags); the billing
// function is a stand-in too. A browser is not the Android app, so Google Play itself cannot be tried here: the Subscribe
// buttons must say "Only in the Android app" and stay disabled. Not a phone, not Supabase, not Google Play.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { chromium } from 'playwright';

const DIST = new URL('../dist/', import.meta.url).pathname;
const SHOTS = new URL('./screens/', import.meta.url).pathname;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.map': 'application/json' };
const SB = 'https://news-ui.supabase.co';
const ID = n => `00000000-0000-4000-8000-00000000000${n}`;
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
const FEED = [
  { id: ID(1), kind: 'news', title: 'SECRET HEADLINE OPR up 0.25%', body: 'PAID BODY banks follow next week.', published_at: '2026-10-29T02:00:00Z' },
  { id: ID(2), kind: 'news', title: 'SECRET HEADLINE two', body: 'PAID BODY two', published_at: '2026-10-28T02:00:00Z' },
];
const newsRow = (o = {}) => ({ product: 'news', plan_id: 'news_monthly', status: 'active', provider: 'google_play', env: 'sandbox', trial_end: null, period_end: new Date(Date.now() + 20 * DAY).toISOString(), cancel_at_period_end: false, ...o });

/** db.billing: rows eab_my_billing answers (undefined = the function is not on the database), or a function giving them;
 *  db.flags: eab_my_flags. signedIn false: no account on this phone. Every rpc and billing function call is recorded. */
async function phone(db = {}, settings = {}, { signedIn = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 384, height: 824 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const calls = []; const fnCalls = [];
  const user = { id: 'u-me', email: 'me@x.com', metadata: { full_name: 'Test', country: 'Malaysia' } };
  await ctx.route(`${SB}/**`, async route => {
    const req = route.request(); const url = new URL(req.url());
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'content-type': 'application/json' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (url.pathname === '/auth/v1/user') return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ id: user.id, email: user.email, user_metadata: user.metadata }) });
    if (url.pathname.startsWith('/functions/v1/')) { fnCalls.push(url.pathname); return route.fulfill({ status: 404, headers: cors, body: '{"error":"not found"}' }); }
    const m = /\/rest\/v1\/rpc\/(\w+)$/.exec(url.pathname);
    if (m) {
      calls.push(m[1]);
      if (m[1] === 'eab_my_account') return route.fulfill({ status: 200, headers: cors, body: JSON.stringify(account()) });
      if (['eab_log_login', 'eab_set_my_licence', 'eab_set_marketing', 'eab_feed_mark'].includes(m[1])) return route.fulfill({ status: 200, headers: cors, body: 'true' });
      if (m[1] === 'eab_public_settings') return route.fulfill({ status: 200, headers: cors, body: '{}' });
      if (m[1] === 'eab_my_feed') return route.fulfill({ status: 200, headers: cors, body: JSON.stringify(FEED) });
      if (m[1] === 'eab_my_flags') return route.fulfill({ status: 200, headers: cors, body: JSON.stringify(db.flags ?? {}) });
      // Batch 5: the server's "Market News is paid" switch (db.newsPaid undefined = the function is not on the database)
      if (m[1] === 'eab_billing_public') {
        if (db.newsPaid === undefined) return route.fulfill({ status: 404, headers: cors, body: '{"code":"PGRST202","message":"Could not find the function public.eab_billing_public"}' });
        return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ news_paid: db.newsPaid, live: false }) });
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
  await page.evaluate(async ({ SB, user, settings, signedIn }) => {
    const idb = await new Promise(res => { const r = indexedDB.open('estate-agent-buddy'); r.onsuccess = () => res(r.result); });
    const put = (store, key, val) => new Promise((res, rej) => { const tx = idb.transaction(store, 'readwrite'); tx.objectStore(store).put(val, key); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    await put('records', 's:meta', { fired: [], dirty: [], tombstones: [], ownerChecked: true, syncWorkspaceId: 'ws1',
      ...(signedIn ? { syncSession: { accessToken: 'tok', refreshToken: 'r', expiresAt: Date.now() + 3_600_000, email: user.email, userId: user.id, name: 'Test', workspaceId: 'ws1', workspaceName: 'Mine', role: 'owner', country: 'Malaysia', signedInAt: Date.now() - 3_600_000 } } : {}) });
    await put('records', 's:settings', { lang: 'en', layout: 'grid', supabaseUrl: SB, supabaseAnonKey: 'anon', startChoice: 'empty', country: 'Malaysia', countryUser: user.id, ...settings });
    idb.close();
  }, { SB, user, settings, signedIn });
  await page.reload(); await page.waitForSelector('nav.grid');
  return { page, ctx, calls, fnCalls, errors };
}
const openNews = async page => { await page.locator('nav.grid > button[data-key="market"]').click(); await page.getByTestId('market-news').waitFor(); };
async function waitFor(f, timeout = 10000) { const end = Date.now() + timeout; while (!(await f())) { if (Date.now() > end) throw new Error('timed out'); await new Promise(r => setTimeout(r, 50)); } }

test('NP1 billing off (the default): Market News exactly as before, with its unread badge; no paywall and no plans asked for', async () => {
  const { page, ctx, calls, errors } = await phone({ billing: [] });
  await page.getByTestId('market-badge').waitFor({ timeout: 15000 });
  assert.equal(await page.getByTestId('market-badge').innerText(), '2');
  await openNews(page);
  await waitFor(async () => (await page.getByTestId('news-card').count()) === 2);
  assert.equal(await page.getByTestId('news-paywall').count(), 0);
  await page.waitForTimeout(300);
  // Batch 5: opening the screen reads the plans and the server's "news is paid" switch; with the switch off nothing changes
  assert.ok(calls.includes('eab_my_billing') && calls.includes('eab_billing_public'));
  assert.equal(await page.getByTestId('news-paywall').count(), 0);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('NP10 Batch 5: the server switched "Market News is paid" on: the box shows with the phone switch off; a news plan opens the news', async () => {
  const { page, ctx, errors } = await phone({ billing: [], newsPaid: true });
  await openNews(page);
  await page.getByTestId('news-paywall').waitFor();
  const text = await page.locator('body').innerText();
  assert.ok(!/SECRET HEADLINE|PAID BODY/.test(text), 'no post shown');
  await ctx.close();
  const paid = await phone({ billing: [newsRow()], newsPaid: true });
  await openNews(paid.page);
  await waitFor(async () => (await paid.page.getByTestId('news-card').count()) === 2);
  assert.equal(await paid.page.getByTestId('news-paywall').count(), 0);
  // switch off on the server: news as before, even without a plan
  const off = await phone({ billing: [], newsPaid: false });
  await openNews(off.page);
  await waitFor(async () => (await off.page.getByTestId('news-card').count()) === 2);
  assert.deepEqual([...errors, ...paid.errors, ...off.errors], []);
  await paid.ctx.close(); await off.ctx.close();
});

test('NP2 billing on, no plan: the subscription box replaces the news; no post title, body or unread number is shown anywhere', async () => {
  const { page, ctx, calls, fnCalls, errors } = await phone({ billing: [] }, { billing: true });
  await waitFor(async () => calls.includes('eab_my_feed'));
  await page.waitForTimeout(400);
  assert.equal(await page.getByTestId('market-badge').count(), 0, 'the Home tile does not advertise posts that cannot be opened');
  await openNews(page);
  await page.getByTestId('news-paywall').waitFor();
  await waitFor(async () => calls.includes('eab_my_billing'));
  assert.equal(await page.getByTestId('news-card').count(), 0);
  assert.equal(await page.getByTestId('news-unread').count(), 0);
  const all = await page.locator('body').innerText();
  assert.doesNotMatch(all, /SECRET HEADLINE|PAID BODY/);
  assert.match(await page.getByTestId('news-paywall-title').innerText(), /Subscribe to read Market News and Intelligence/);
  assert.match(await page.getByTestId('news-paywall-unlocks').innerText(), /unlocks the Market News and Intelligence menu only/);
  assert.match(await page.getByTestId('news-paywall-banner').innerText(), /Test mode/);
  assert.equal(await page.getByTestId('news-price-news_monthly').innerText(), 'USD 1 per month');
  assert.equal(await page.getByTestId('news-price-news_yearly').innerText(), 'USD 9 per year');
  assert.equal(await page.getByTestId('news-saving').innerText(), 'Saves about 25% versus 12 months');
  // Google Play only, and not in a browser: both Subscribe buttons disabled, and it says why
  for (const id of ['news_monthly', 'news_yearly']) assert.equal(await page.getByTestId(`news-subscribe-${id}`).isDisabled(), true);
  assert.match(await page.getByTestId('news-paywall-unavailable').innerText(), /Only in the Android app/);
  assert.equal(await page.locator('[data-testid^="billing-provider-"]').count(), 0, 'no card or FPX choice for news');
  assert.match(await page.getByTestId('news-paywall').innerText(), /Paid through Google Play/);
  // touch targets and text sizes
  for (const id of ['news-subscribe-news_monthly', 'news-subscribe-news_yearly', 'news-paywall-refresh']) {
    const box = await page.getByTestId(id).boundingBox(); assert.ok(box && box.height >= 44, `${id} is at least 44px tall`);
  }
  const smallest = await page.getByTestId('news-paywall').evaluate(el => Math.min(...[...el.querySelectorAll('*')].filter(e => e.childElementCount === 0 && e.textContent.trim()).map(e => parseFloat(getComputedStyle(e).fontSize))));
  assert.ok(smallest >= 14, `smallest text ${smallest}px`);
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(width <= 384, 'no sideways scrolling');
  await page.screenshot({ path: `${SHOTS}news-paywall.png`, fullPage: true });
  assert.deepEqual(fnCalls, [], 'nothing was bought or asked of the billing function');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('NP3 billing on with an active news plan from the database: the news and the badge are back', async () => {
  const { page, ctx, errors } = await phone({ billing: [newsRow()] }, { billing: true });
  await openNews(page);
  await waitFor(async () => (await page.getByTestId('news-card').count()) === 2);
  assert.equal(await page.getByTestId('news-paywall').count(), 0);
  await page.locator('[aria-label="Back"]').click().catch(() => {});
  await page.getByTestId('market-badge').waitFor();
  assert.equal(await page.getByTestId('market-badge').innerText(), '2');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('NP4 Restore / Refresh reads the plans again: "none found" first, then the news once the database has the plan', async () => {
  let rows = [];
  const { page, ctx, calls, errors } = await phone({ billing: () => rows }, { billing: true });
  await openNews(page);
  await page.getByTestId('news-paywall').waitFor();
  await waitFor(async () => calls.includes('eab_my_billing'));
  const before = calls.filter(c => c === 'eab_my_billing').length;
  await page.getByTestId('news-paywall-refresh').click();
  await page.getByTestId('news-paywall-msg').waitFor();
  assert.match(await page.getByTestId('news-paywall-msg').innerText(), /No active subscription found/);
  assert.ok(calls.filter(c => c === 'eab_my_billing').length > before);
  rows = [newsRow({ plan_id: 'news_yearly', period_end: new Date(Date.now() + 300 * DAY).toISOString() })];
  await page.getByTestId('news-paywall-refresh').click();
  await waitFor(async () => (await page.getByTestId('news-card').count()) === 2);
  assert.equal(await page.getByTestId('news-paywall').count(), 0);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('NP5 a Pro plan, an ended news plan or a database without billing never open Market News while billing is on', async () => {
  for (const billing of [
    [{ ...newsRow(), product: 'pro', plan_id: 'pro_monthly', provider: 'stripe' }],
    [newsRow({ status: 'canceled', period_end: new Date(Date.now() - DAY).toISOString() })],
    undefined,
  ]) {
    const { page, ctx, errors } = await phone({ billing }, { billing: true });
    await openNews(page);
    await page.getByTestId('news-paywall').waitFor();
    await page.waitForTimeout(400);
    assert.equal(await page.getByTestId('news-card').count(), 0, JSON.stringify(billing));
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});

test('NP6 Admin EAB’s beta.billing turns the paywall on without the phone switch', async () => {
  const { page, ctx } = await phone({ billing: [], flags: { 'beta.billing': true } });
  await openNews(page);
  await page.getByTestId('news-paywall').waitFor();
  assert.equal(await page.getByTestId('news-card').count(), 0);
  await ctx.close();
});

test('NP7 a tapped push alert for a news post opens the subscription box, not the post, for an account without a plan', async () => {
  const { page, ctx, errors } = await phone({ billing: [] }, { billing: true });
  await page.evaluate(id => window.__eabFeedTap(id), ID(1));
  await page.getByTestId('news-paywall').waitFor();
  await page.waitForTimeout(400);
  assert.doesNotMatch(await page.locator('body').innerText(), /SECRET HEADLINE|PAID BODY/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('NP8 not signed in (phone used without a company connection) with billing on: the box asks to sign in and offers nothing to buy', async () => {
  // With a company connection set, a signed-out phone stops at the sign-in screen and never reaches Market News.
  const { page, ctx, errors } = await phone({ billing: [] }, { billing: true, supabaseUrl: '', supabaseAnonKey: '' }, { signedIn: false });
  await openNews(page);
  await page.getByTestId('news-paywall').waitFor();
  assert.match(await page.getByTestId('news-paywall-signin').innerText(), /Sign in/);
  assert.equal(await page.locator('[data-testid^="news-subscribe-"]').count(), 0);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('NP9 the box is readable in Malay and Chinese', async () => {
  for (const [lang, title, saves] of [['bm', /Langgan untuk membaca/, /Jimat kira-kira 25%/], ['zh', /订阅以阅读市场新闻与情报/, /节省约 25%/]]) {
    const { page, ctx } = await phone({ billing: [] }, { billing: true, lang });
    await openNews(page);
    await page.getByTestId('news-paywall').waitFor();
    assert.match(await page.getByTestId('news-paywall-title').innerText(), title);
    assert.match(await page.getByTestId('news-saving').innerText(), saves);
    await ctx.close();
  }
});
