// MainForAdmin-D screen tests (Market News, pushed Projects + invitation codes, announcements, force update, maintenance) in a real Chromium browser at phone width. The company's database
// is a stand-in that answers like the real functions (eab_my_account, eab_accept_terms, eab_log_login, eab_set_my_licence).
// Not a live Supabase project and not a phone.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { chromium } from 'playwright';

const DIST = new URL('../dist/', import.meta.url).pathname;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.map': 'application/json' };
const SB = 'https://mfad-test.supabase.co';
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

/** A phone signed in as one account. `account(body)` answers eab_my_account; every rpc call is recorded. */
async function phone({ account, signedInAt, settings = {}, profile, local = {}, db = { settings: {}, feed: [], codeProjects: [] } } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 384, height: 824 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const calls = [];
  const user = { id: 'u-mb', email: 'mb@x.com', metadata: { full_name: 'Test', country: 'Malaysia' } };
  await ctx.route(`${SB}/**`, async route => {
    const req = route.request(); const url = new URL(req.url());
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'content-type': 'application/json' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (url.pathname === '/auth/v1/user') return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ id: user.id, email: user.email, user_metadata: user.metadata }) });
    const m = /\/rest\/v1\/rpc\/(\w+)$/.exec(url.pathname);
    if (m) {
      const body = JSON.parse(req.postData() || '{}');
      calls.push({ fn: m[1], body });
      if (m[1] === 'eab_my_account' && account) return route.fulfill({ status: 200, headers: cors, body: JSON.stringify(account()) });
      if (m[1] === 'eab_accept_terms') return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ ...account(), terms: { version: body.p_version, at: new Date().toISOString() } }) });
      if (['eab_log_login', 'eab_set_my_licence', 'eab_set_marketing'].includes(m[1])) return route.fulfill({ status: 200, headers: cors, body: '1' });
      if (m[1] === 'eab_public_settings') return route.fulfill({ status: 200, headers: cors, body: JSON.stringify(db.settings) });
      if (m[1] === 'eab_my_feed') return route.fulfill({ status: 200, headers: cors, body: JSON.stringify(db.feed) });
      if (m[1] === 'eab_feed_mark') return route.fulfill({ status: 200, headers: cors, body: 'true' });
      if (m[1] === 'eab_redeem_code') {
        if (body.p_code !== 'GOODCODE12') return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ ok: false, reason: 'not_found' }) });
        db.feed.push(...db.codeProjects); return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ ok: true, added: db.codeProjects.length, visible: db.codeProjects.length }) });
      }
    }
    return route.fulfill({ status: 500, headers: cors, body: '{"message":"not part of this test"}' });
  });
  for (const [k, v] of Object.entries(local)) await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), [k, v]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(base); await page.waitForSelector('nav.grid');
  await page.getByTestId('start-empty').click();
  await page.evaluate(async ({ SB, user, settings, profile, signedInAt }) => {
    const db = await new Promise(res => { const r = indexedDB.open('estate-agent-buddy'); r.onsuccess = () => res(r.result); });
    const put = (store, key, val) => new Promise((res, rej) => { const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).put(val, key); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    await put('records', 's:meta', { fired: [], dirty: [], tombstones: [], ownerChecked: true, syncWorkspaceId: 'ws1',
      syncSession: { accessToken: 'tok', refreshToken: 'r', expiresAt: Date.now() + 3_600_000, email: user.email, userId: user.id, name: 'Test', workspaceId: 'ws1', workspaceName: 'Mine', role: 'owner', country: 'Malaysia', signedInAt } });
    await put('records', 's:settings', { lang: 'en', layout: 'grid', supabaseUrl: SB, supabaseAnonKey: 'anon', startChoice: 'empty', country: 'Malaysia', countryUser: user.id, ...settings });
    if (profile) await put('records', 's:profile', profile);
    db.close();
  }, { SB, user, settings, profile, signedInAt: signedInAt ?? Date.now() - 3_600_000 });
  await page.reload(); await page.waitForSelector('nav.grid, [data-testid="login"]');
  return { page, ctx, calls, errors };
}
async function waitFor(f, timeout = 10000) { const end = Date.now() + timeout; while (!(await f())) { if (Date.now() > end) throw new Error('timed out'); await new Promise(r => setTimeout(r, 50)); } }
const active = (extra = {}) => () => ({ status: 'active', terms: { version: '1.1-draft', at: '2026-10-21T00:00:00Z' }, marketing: false, licence: null, company_name: 'JSL Global Trading', support_email: null, business_address: null, ...extra });


const news = (id, extra = {}) => ({ id, kind: 'news', title: `Rates news ${id}`, body: 'OPR up by 0.25%.\nBanks follow next week.', published_at: '2026-10-20T02:00:00Z', ...extra });

test('MD1 Market News and Intelligence: megaphone tile with the unread number; opening a post lowers it and tells the database', async () => {
  const { page, calls, ctx, errors } = await phone({ account: active(), db: { settings: {}, codeProjects: [],
    feed: [news('n1', { link_url: 'https://example.com/a', pdf_url: 'https://example.com/a.pdf' }), news('n2'), news('n3', { opened_at: '2026-10-20T03:00:00Z' })] } });
  const t = page.locator('nav.grid > button[data-key="market"]');
  assert.equal(await t.getAttribute('aria-label'), 'Market News and Intelligence');
  await page.getByTestId('market-badge').waitFor({ timeout: 15000 });
  assert.equal(await page.getByTestId('market-badge').innerText(), '2');
  await t.click();
  await page.getByTestId('market-news').waitFor();
  assert.equal(await page.locator('h1').innerText(), 'Market News and Intelligence');
  assert.equal(await page.getByTestId('news-card').count(), 3);
  assert.equal(await page.getByTestId('news-new').count(), 2);
  await page.getByTestId('news-open').first().click();
  assert.equal(await page.getByTestId('feed-link').count(), 1);
  assert.equal(await page.getByTestId('feed-pdf').count(), 1);
  await waitFor(() => calls.some(c => c.fn === 'eab_feed_mark' && c.body.p_item === 'n1' && c.body.p_what === 'opened'));
  assert.equal(await page.getByTestId('news-new').count(), 1);
  await page.goBack().catch(() => {});
  await page.locator('[aria-label="Back"]').click().catch(() => {});
  await page.getByTestId('market-badge').waitFor();
  assert.equal(await page.getByTestId('market-badge').innerText(), '1');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('MD2 Projects: Add New Project stays first; a wrong invitation code is explained; a right one adds the pushed projects', async () => {
  const { page, calls, ctx } = await phone({ account: active(), db: { settings: {}, feed: [],
    codeProjects: [{ id: 'p1', kind: 'project', title: 'Taman Kenanga Phase 2', project: { developer: 'Kenanga Dev', location: 'Nilai', price_from: 450000, price_to: 620000 }, from_code: true }] } });
  await page.locator('nav.grid > button[data-key="project"]').click();
  await page.getByTestId('projects').waitFor();
  const order = await page.locator('[data-testid="project-add"], [data-testid="code-input"], [data-testid="pushed-empty"]').evaluateAll(es => es.map(e => e.dataset.testid));
  assert.deepEqual(order, ['project-add', 'code-input', 'pushed-empty']);
  await page.getByTestId('code-input').fill('wrong-code');
  await page.getByTestId('code-add').click();
  assert.match(await page.getByTestId('code-error').innerText(), /not found/i);
  assert.equal(calls.find(c => c.fn === 'eab_redeem_code').body.p_code, 'WRONGCODE', 'cleaned before sending');
  await page.getByTestId('code-input').fill('goodcode12');
  await page.getByTestId('code-add').click();
  await page.getByTestId('code-ok').waitFor();
  assert.match(await page.getByTestId('code-ok').innerText(), /1 project added/);
  await page.getByTestId('pushed-card').waitFor();
  const card = await page.getByTestId('pushed-card').innerText();
  assert.match(card, /Taman Kenanga Phase 2[\s\S]*Kenanga Dev · Nilai[\s\S]*RM/);
  assert.match(card, /From invitation code/);
  await ctx.close();
});

test('MD3 announcements: a pop-up must be acknowledged; a banner on the home screen can be closed', async () => {
  const { page, calls, ctx } = await phone({ account: active(), db: { settings: {}, codeProjects: [], feed: [
    { id: 'a1', kind: 'announcement', title: 'Office closed Friday', body: 'Deepavali holiday.', display: 'banner' },
    { id: 'a2', kind: 'announcement', title: 'New commission rules', body: 'Read before Monday.', display: 'popup' }] } });
  await page.getByTestId('announcement-popup').waitFor({ timeout: 15000 });
  assert.match(await page.getByTestId('announcement-popup').innerText(), /New commission rules[\s\S]*Read before Monday/);
  await page.getByTestId('announcement-ok').click();
  await page.getByTestId('announcement-popup').waitFor({ state: 'detached' });
  await waitFor(() => calls.some(c => c.fn === 'eab_feed_mark' && c.body.p_item === 'a2' && c.body.p_what === 'acknowledged'));
  assert.match(await page.getByTestId('announcement-banner').innerText(), /Office closed Friday/);
  await page.getByTestId('announcement-close').click();
  await page.getByTestId('announcement-banner').waitFor({ state: 'detached' });
  await waitFor(() => calls.some(c => c.fn === 'eab_feed_mark' && c.body.p_item === 'a1' && c.body.p_what === 'dismissed'));
  await ctx.close();
});

test('MD4 maintenance blocks the app with the message in the app language; a required update blocks; a soft one can be closed', async () => {
  let { page, ctx } = await phone({ account: active(), settings: { lang: 'bm' }, db: { feed: [], codeProjects: [],
    settings: { maintenance_on: true, maintenance_message_en: 'Upgrading servers.', maintenance_message_bm: 'Naik taraf pelayan.', maintenance_back_at: '2026-10-22T02:00:00Z' } } });
  await page.getByTestId('maintenance').waitFor({ timeout: 15000 });
  assert.match(await page.getByTestId('maintenance').innerText(), /Dalam penyelenggaraan[\s\S]*Naik taraf pelayan\.[\s\S]*Dijangka kembali/);
  assert.equal(await page.locator('nav.grid').count(), 0, 'the app cannot be used');
  await ctx.close();
  ({ page, ctx } = await phone({ account: active(), db: { feed: [], codeProjects: [], settings: { min_version: '99.0.0', min_version_mode: 'hard', update_url: 'https://example.com/get' } } }));
  await page.getByTestId('update-required').waitFor({ timeout: 15000 });
  assert.match(await page.getByTestId('update-required').innerText(), /no longer supported[\s\S]*Needed: 99\.0\.0/);
  assert.equal(await page.getByTestId('update-now').count(), 1);
  await ctx.close();
  ({ page, ctx } = await phone({ account: active(), db: { feed: [], codeProjects: [], settings: { min_version: '99.0.0', min_version_mode: 'soft' } } }));
  await page.getByTestId('update-soft').waitFor({ timeout: 15000 });
  assert.equal(await page.locator('nav.grid').count(), 1, 'a soft update does not block');
  await page.getByTestId('update-soft-later').click();
  await page.getByTestId('update-soft').waitFor({ state: 'detached' });
  await ctx.close();
});
