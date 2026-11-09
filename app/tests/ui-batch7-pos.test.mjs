// Batch 7 (9 Nov 2026) screen tests for AI Buddy POS document numbers, in a real Chromium browser at phone width, signed in to a
// business. The company's database is a stand-in that answers eab_acct_numbering_get / _set / eab_acct_take like
// supabase/proposed/20261109200000_buddy_pos_numbering.sql. Not a phone and not Supabase.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { chromium } from 'playwright';

const DIST = new URL('../dist/', import.meta.url).pathname;
const SHOTS = new URL('./screens/', import.meta.url).pathname;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.map': 'application/json' };
const SB = 'https://pos7-ui.supabase.co';
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

/** db.mode: the business's way of numbering; db.offline: every database call fails as if there were no internet. */
async function phone(db, role = 'owner', signedIn = true) {
  const ctx = await browser.newContext({ viewport: { width: 384, height: 824 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const takes = [];
  const user = { id: 'u-me', email: 'me@x.com', metadata: { full_name: 'Test', country: 'Malaysia' } };
  const next = { JV: 1, INV: 1, POS: 1 };
  await ctx.route(`${SB}/**`, async route => {
    const req = route.request(); const url = new URL(req.url());
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'content-type': 'application/json' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (db.offline) return route.abort('internetdisconnected');
    if (url.pathname === '/auth/v1/user') return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ id: user.id, email: user.email, user_metadata: user.metadata }) });
    const m = /\/rest\/v1\/rpc\/(\w+)$/.exec(url.pathname);
    if (m) {
      const body = JSON.parse(req.postData() || '{}');
      if (m[1] === 'eab_my_account') return route.fulfill({ status: 200, headers: cors, body: JSON.stringify(account()) });
      if (m[1] === 'eab_acct_numbering_get') return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ mode: db.mode, letter: db.mode === 'device' ? 'A' : null }) });
      if (m[1] === 'eab_acct_numbering_set') {
        if (!['owner', 'admin'].includes(role)) return route.fulfill({ status: 403, headers: cors, body: '{"message":"only the owner or an admin can change numbering"}' });
        db.mode = body.p_mode; return route.fulfill({ status: 200, headers: cors, body: JSON.stringify(db.mode) });
      }
      if (m[1] === 'eab_acct_take') {
        const from = Math.max(next[body.p_series], (body.p_min ?? 0) + 1); next[body.p_series] = from + body.p_count;
        takes.push({ ...body, from });
        return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ from, to: from + body.p_count - 1, mode: db.mode }) });
      }
      if (['eab_log_login', 'eab_set_my_licence', 'eab_set_marketing'].includes(m[1])) return route.fulfill({ status: 200, headers: cors, body: '1' });
      if (['eab_public_settings', 'eab_my_flags'].includes(m[1])) return route.fulfill({ status: 200, headers: cors, body: '{}' });
      if (m[1] === 'eab_my_feed') return route.fulfill({ status: 200, headers: cors, body: '[]' });
    }
    return route.fulfill({ status: 500, headers: cors, body: '{"message":"not part of this test"}' });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(base); await page.waitForSelector('nav.grid');
  await page.getByTestId('start-empty').click();
  await page.evaluate(async ({ SB, user, role, signedIn }) => {
    const idb = await new Promise(res => { const r = indexedDB.open('estate-agent-buddy'); r.onsuccess = () => res(r.result); });
    const put = (store, key, val) => new Promise((res, rej) => { const tx = idb.transaction(store, 'readwrite'); tx.objectStore(store).put(val, key); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    if (signedIn) await put('records', 's:meta', { fired: [], dirty: [], tombstones: [], ownerChecked: true, syncWorkspaceId: 'ws1',
      syncSession: { accessToken: 'tok', refreshToken: 'r', expiresAt: Date.now() + 3_600_000, email: user.email, userId: user.id, name: 'Test', workspaceId: 'ws1', workspaceName: 'Mine', role, country: 'Malaysia', signedInAt: Date.now() - 3_600_000 } });
    await put('records', 's:settings', { lang: 'en', layout: 'grid', ...(signedIn ? { supabaseUrl: SB, supabaseAnonKey: 'anon', country: 'Malaysia', countryUser: user.id } : {}), startChoice: 'empty', buddyPos: true });
    idb.close();
  }, { SB, user, role, signedIn });
  await page.reload(); await page.waitForSelector('nav.grid');
  await page.locator('nav.grid > button[data-key="finance"]').click(); await page.getByTestId('finance').waitFor();
  await page.getByTestId('open-buddy').click(); await page.getByTestId('buddy').waitFor();
  return { page, ctx, errors, takes };
}
const tab = (page, name) => page.getByRole('tab', { name, exact: true }).click();
async function charge(page) {
  await tab(page, 'POS');
  await page.getByTestId('bp-product').first().click();
  const before = await page.getByTestId('bp-receipt').count();
  await page.getByTestId('bp-charge').click();
  return before;
}
const firstReceipt = page => page.getByTestId('bp-receipt').first().locator('b').innerText();

test('N1 owner, own series per phone: the sale is POS-A-0001; switching to blocks gives one-series numbers after the old ones', async () => {
  const db = { mode: 'device' };
  const { page, ctx, errors, takes } = await phone(db);
  await page.getByTestId('bp-load-sample').click(); await page.getByTestId('bp-sample-on').waitFor();
  const n = await charge(page);
  await page.waitForFunction(n => document.querySelectorAll('[data-testid="bp-receipt"]').length === n + 1, n);
  assert.equal(await firstReceipt(page), 'POS-A-0001');
  await tab(page, 'Setup');
  await page.getByTestId('bp-numbering').waitFor();
  assert.match(await page.getByTestId('bp-num-now').innerText(), /Own series per phone.*this phone is A/);
  await page.getByTestId('bp-num-mode').selectOption('blocks');
  await page.getByTestId('bp-num-save').click();
  await page.getByTestId('bp-num-left').waitFor();
  assert.equal(db.mode, 'blocks');
  await page.screenshot({ path: `${SHOTS}buddy-numbering.png`, fullPage: true });
  const m = await charge(page);
  await page.waitForFunction(n => document.querySelectorAll('[data-testid="bp-receipt"]').length === n + 1, m);
  const posTake = takes.find(t => t.p_series === 'POS');
  assert.ok(posTake.p_min >= 1, 'the server is told the highest one-series number already on this phone');
  assert.equal(await page.getByTestId('bp-receipt').locator('b').filter({ hasText: new RegExp(`^POS-${String(posTake.from).padStart(4, '0')}$`) }).count(), 1);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('N2 a phone in a business that never reached the server cannot charge offline, and says why', async () => {
  const { page, ctx, errors } = await phone({ mode: 'device', offline: true }, 'agent');
  await page.getByTestId('bp-load-sample').click(); await page.getByTestId('bp-sample-on').waitFor();
  const n = await charge(page);
  await page.getByTestId('toast').filter({ hasText: 'needs document numbers' }).waitFor();
  assert.equal(await page.getByTestId('bp-receipt').count(), n, 'nothing was posted');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('N3 an agent sees the way but cannot change it; signed out (no database) the phone numbers on its own', async () => {
  const { page, ctx } = await phone({ mode: 'blocks' }, 'agent');
  await tab(page, 'Setup');
  await page.getByTestId('bp-num-check').click();
  await page.getByTestId('bp-num-now').waitFor();
  assert.match(await page.getByTestId('bp-num-now').innerText(), /50 numbers at a time/);
  assert.equal(await page.getByTestId('bp-num-mode').count(), 0);
  await ctx.close();
  const out = await phone({ mode: 'device' }, 'owner', false);
  await tab(out.page, 'Setup');
  await out.page.getByTestId('bp-num-local').waitFor();
  const n = await charge(out.page);
  await out.page.waitForFunction(n => document.querySelectorAll('[data-testid="bp-receipt"]').length === n + 1, n);
  assert.equal(await firstReceipt(out.page), 'POS-0001');
  await out.ctx.close();
});
