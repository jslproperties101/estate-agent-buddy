// MainForAdmin-E screen tests (Admin EAB feature flags hide home tiles; a tapped push alert opens that post) in a real
// Chromium browser at phone width. The company's database is a stand-in that answers like the real functions
// (eab_my_flags, eab_my_feed, eab_feed_mark). A browser cannot receive a real push alert: the screen-test build has a
// stand-in for "the agent tapped an alert" (window.__eabFeedTap, built only with --no-env). Not a phone, not Supabase.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { chromium } from 'playwright';

const DIST = new URL('../dist/', import.meta.url).pathname;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.map': 'application/json' };
const SB = 'https://mfae-test.supabase.co';
let server, browser, base;

before(async () => {
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

/** A phone signed in as one account. db.flags answers eab_my_flags (undefined = the function is not on the database);
 *  db.feed answers eab_my_feed; db.feedDown = eab_my_feed cannot be reached. Every rpc call is recorded. */
async function phone(db) {
  const ctx = await browser.newContext({ viewport: { width: 384, height: 824 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const calls = [];
  const user = { id: 'u-me', email: 'me@x.com', metadata: { full_name: 'Test', country: 'Malaysia' } };
  await ctx.route(`${SB}/**`, async route => {
    const req = route.request(); const url = new URL(req.url());
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'content-type': 'application/json' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (url.pathname === '/auth/v1/user') return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ id: user.id, email: user.email, user_metadata: user.metadata }) });
    const m = /\/rest\/v1\/rpc\/(\w+)$/.exec(url.pathname);
    if (m) {
      const body = JSON.parse(req.postData() || '{}');
      calls.push({ fn: m[1], body });
      if (m[1] === 'eab_my_account') return route.fulfill({ status: 200, headers: cors, body: JSON.stringify(account()) });
      if (['eab_log_login', 'eab_set_my_licence', 'eab_set_marketing'].includes(m[1])) return route.fulfill({ status: 200, headers: cors, body: '1' });
      if (m[1] === 'eab_public_settings') return route.fulfill({ status: 200, headers: cors, body: '{}' });
      if (m[1] === 'eab_my_feed') return db.feedDown ? route.abort('internetdisconnected') : route.fulfill({ status: 200, headers: cors, body: JSON.stringify(db.feed ?? []) });
      if (m[1] === 'eab_feed_mark') return route.fulfill({ status: 200, headers: cors, body: 'true' });
      if (m[1] === 'eab_my_flags') {
        if (db.flags === undefined) return route.fulfill({ status: 404, headers: cors, body: '{"code":"PGRST202","message":"Could not find the function public.eab_my_flags"}' });
        return route.fulfill({ status: 200, headers: cors, body: JSON.stringify(db.flags) });
      }
    }
    return route.fulfill({ status: 500, headers: cors, body: '{"message":"not part of this test"}' });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(base); await page.waitForSelector('nav.grid');
  await page.getByTestId('start-empty').click();
  await page.evaluate(async ({ SB, user }) => {
    const idb = await new Promise(res => { const r = indexedDB.open('estate-agent-buddy'); r.onsuccess = () => res(r.result); });
    const put = (store, key, val) => new Promise((res, rej) => { const tx = idb.transaction(store, 'readwrite'); tx.objectStore(store).put(val, key); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    await put('records', 's:meta', { fired: [], dirty: [], tombstones: [], ownerChecked: true, syncWorkspaceId: 'ws1',
      syncSession: { accessToken: 'tok', refreshToken: 'r', expiresAt: Date.now() + 3_600_000, email: user.email, userId: user.id, name: 'Test', workspaceId: 'ws1', workspaceName: 'Mine', role: 'owner', country: 'Malaysia', signedInAt: Date.now() - 3_600_000 } });
    await put('records', 's:settings', { lang: 'en', layout: 'grid', supabaseUrl: SB, supabaseAnonKey: 'anon', startChoice: 'empty', country: 'Malaysia', countryUser: user.id });
    idb.close();
  }, { SB, user });
  await page.reload(); await page.waitForSelector('nav.grid');
  return { page, ctx, calls, errors };
}
async function waitFor(f, timeout = 10000) { const end = Date.now() + timeout; while (!(await f())) { if (Date.now() > end) throw new Error('timed out'); await new Promise(r => setTimeout(r, 50)); } }
const tiles = page => page.locator('nav.grid > button').evaluateAll(es => es.map(e => `${e.dataset.key}:${e.dataset.tile}`));
const ID = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const tap = (page, id) => page.evaluate(i => window.__eabFeedTap(i), id);

test('ME1 a tile switched off in Admin EAB disappears; switched-on and unknown keys change nothing; the others keep their numbers', async () => {
  const { page, calls, ctx, errors } = await phone({ flags: { 'tile.gps': false, 'tile.finance': true, 'beta.pilot': true, 'other.key': false } });
  assert.equal(await page.locator('nav.grid > button').count() >= 14, true);
  await waitFor(() => calls.some(c => c.fn === 'eab_my_flags'), 15000);
  await page.locator('nav.grid > button[data-key="gps"]').waitFor({ state: 'detached' });
  const list = await tiles(page);
  assert.equal(list.length, 14, 'one of the 15 cards hidden');
  assert.ok(list.some(x => x.startsWith('finance:')), 'tile.finance ON: shown');
  assert.ok(!list.some(x => x.startsWith('gps:')), 'tile.gps OFF: hidden');
  assert.ok(list.includes('property:14') && list.includes('voice:15') && list.includes('creative:4'), 'other cards keep their numbers');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('ME2 a database without eab_my_flags: all 15 cards stay, nothing breaks', async () => {
  const { page, calls, ctx, errors } = await phone({ flags: undefined });
  await waitFor(() => calls.some(c => c.fn === 'eab_my_flags'), 15000);
  await page.waitForTimeout(300);
  assert.equal((await tiles(page)).length, 15);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('ME3 tapping a Market News alert opens Market News with that post open, and marks it read', async () => {
  const feed = [{ id: ID(1), kind: 'news', title: 'Older news', body: 'a' }, { id: ID(2), kind: 'news', title: 'OPR up 0.25%', body: 'Banks follow next week.', link_url: 'https://example.com/opr' }];
  const { page, calls, ctx, errors } = await phone({ flags: {}, feed });
  await waitFor(() => calls.some(c => c.fn === 'eab_my_feed'), 15000);
  await tap(page, ID(2));
  await page.getByTestId('market-news').waitFor();
  const card = page.locator(`[data-testid="news-card"][data-id="${ID(2)}"]`);
  assert.equal(await card.getByTestId('news-open').getAttribute('aria-expanded'), 'true');
  assert.equal(await card.getByTestId('feed-link').count(), 1, 'opened: the website button shows');
  assert.equal(await page.locator(`[data-testid="news-card"][data-id="${ID(1)}"] [data-testid="news-open"]`).getAttribute('aria-expanded'), 'false');
  await waitFor(() => calls.some(c => c.fn === 'eab_feed_mark' && c.body.p_item === ID(2) && c.body.p_what === 'opened'));
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('ME4 tapping a Project alert opens Projects with that project open', async () => {
  const feed = [{ id: ID(3), kind: 'project', title: 'Taman Kenanga Phase 2', body: 'Launch 1 Nov.', project: { developer: 'Kenanga Dev', location: 'Nilai' } }];
  const { page, calls, ctx, errors } = await phone({ flags: {}, feed });
  await waitFor(() => calls.some(c => c.fn === 'eab_my_feed'), 15000);
  await tap(page, ID(3));
  await page.getByTestId('projects').waitFor();
  const card = page.locator(`[data-testid="pushed-card"][data-id="${ID(3)}"]`);
  await card.waitFor();
  assert.equal(await card.locator('.feed-head').getAttribute('aria-expanded'), 'true');
  assert.match(await card.innerText(), /Launch 1 Nov\./);
  await waitFor(() => calls.some(c => c.fn === 'eab_feed_mark' && c.body.p_item === ID(3) && c.body.p_what === 'opened'));
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('ME5 tapping an announcement alert shows it on Home, even a banner that was closed before; OK does not count as acknowledged', async () => {
  const feed = [{ id: ID(4), kind: 'announcement', title: 'Office closed Friday', body: 'Deepavali holiday.', display: 'banner', dismissed_at: '2026-10-21T00:00:00Z', opened_at: '2026-10-21T00:00:00Z' }];
  const { page, calls, ctx, errors } = await phone({ flags: {}, feed });
  await waitFor(() => calls.some(c => c.fn === 'eab_my_feed'), 15000);
  assert.equal(await page.getByTestId('announcement-banner').count(), 0, 'closed before');
  await page.locator('nav.grid > button[data-key="calculator"]').click();   // somewhere else in the app
  await tap(page, ID(4));
  await page.getByTestId('announcement-popup').waitFor();
  assert.match(await page.getByTestId('announcement-popup').innerText(), /Office closed Friday[\s\S]*Deepavali holiday/);
  await page.getByTestId('announcement-ok').click();
  await page.getByTestId('announcement-popup').waitFor({ state: 'detached' });
  await page.locator('nav.grid').waitFor();
  assert.equal(await page.getByTestId('announcement-banner').count(), 0, 'the banner stays closed');
  assert.equal(calls.some(c => c.fn === 'eab_feed_mark' && c.body.p_what === 'acknowledged'), false);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('ME6 a withdrawn post: Market News opens with "no longer available"', async () => {
  const { page, calls, ctx, errors } = await phone({ flags: {}, feed: [] });
  await waitFor(() => calls.some(c => c.fn === 'eab_my_feed'), 15000);
  await tap(page, ID(9));
  await page.getByTestId('market-news').waitFor();
  await page.getByTestId('toast').waitFor();
  assert.equal(await page.getByTestId('toast').locator('span').innerText(), 'This post is no longer available.');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('ME7 the feed cannot be read when the alert is tapped: the agent is asked to connect, not told the post is gone', async () => {
  const db = { flags: {}, feed: [] };
  const { page, calls, ctx, errors } = await phone(db);
  await waitFor(() => calls.some(c => c.fn === 'eab_my_feed'), 15000);
  db.feedDown = true;
  await tap(page, ID(8));
  await page.getByTestId('market-news').waitFor();
  await page.getByTestId('toast').waitFor();
  assert.match(await page.getByTestId('toast').locator('span').innerText(), /could not be loaded[\s\S]*Connect to the internet/);
  assert.deepEqual(errors, []);
  await ctx.close();
});
