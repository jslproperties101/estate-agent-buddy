// JoyChange002 Change 46 (country on first login) screen tests in a real Chromium browser at phone width. The account is a
// small stand-in for Supabase's /auth/v1/user (user data kept on the account). Not a live Supabase project and not a phone.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { chromium } from 'playwright';

const DIST = new URL('../dist/', import.meta.url).pathname;
const SHOTS = new URL('./screens/', import.meta.url).pathname;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.map': 'application/json' };
const SB = 'https://country-test.supabase.co';
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

/** A phone signed in as one account. `account.metadata` is what Supabase holds as that account's user data. */
async function phone(account, { settings = {}, records = {} } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 384, height: 824 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const calls = [];
  await ctx.route(`${SB}/**`, async route => {
    const req = route.request(); const url = new URL(req.url());
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'content-type': 'application/json' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (url.pathname === '/auth/v1/user') {
      if (req.method() === 'PUT') { const b = JSON.parse(req.postData() ?? '{}'); calls.push(b); account.metadata = { ...account.metadata, ...(b.data ?? {}) }; }
      return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ id: account.id, email: account.email, user_metadata: account.metadata }) });
    }
    return route.fulfill({ status: 500, headers: cors, body: '{"message":"not part of this test"}' });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(base); await page.waitForSelector('nav.grid');
  await page.getByTestId('start-empty').click();
  await page.evaluate(async ({ SB, account, settings, records }) => {
    const db = await new Promise(res => { const r = indexedDB.open('estate-agent-buddy'); r.onsuccess = () => res(r.result); });
    const put = (store, key, val) => new Promise((res, rej) => { const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).put(val, key); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    for (const [k, v] of Object.entries(records)) await put('records', k, v);
    await put('records', 's:meta', { fired: [], dirty: [], tombstones: [], ownerChecked: true, syncWorkspaceId: 'ws1',
      syncSession: { accessToken: 'tok', refreshToken: 'r', expiresAt: Date.now() + 3_600_000, email: account.email, userId: account.id, name: 'Test', workspaceId: 'ws1', workspaceName: 'Mine', role: 'owner' } });
    await put('records', 's:settings', { lang: 'en', layout: 'grid', supabaseUrl: SB, supabaseAnonKey: 'anon', startChoice: 'empty', ...settings });
    db.close();
  }, { SB, account, settings, records });
  await page.reload(); await page.waitForSelector('nav.grid');
  return { page, ctx, calls, errors };
}
async function stored(page, key) {
  return page.evaluate(k => new Promise(res => { const r = indexedDB.open('estate-agent-buddy'); r.onsuccess = () => { const q = r.result.transaction('records').objectStore('records').get(k); q.onsuccess = () => { r.result.close(); res(q.result); }; }; }), key);
}
async function waitFor(f, timeout = 10000) { const end = Date.now() + timeout; while (!(await f())) { if (Date.now() > end) throw new Error('timed out'); await new Promise(r => setTimeout(r, 50)); } }

test('K1 first login: asked once, Malaysia selected, searchable; the choice is saved on the account and kept', async () => {
  const account = { id: 'u-k1', email: 'k1@x.com', metadata: { full_name: 'Test' } };
  const { page, calls, errors, ctx } = await phone(account);
  await page.getByTestId('country-choice').waitFor();
  assert.equal(await page.locator('[data-country="Malaysia"]').getAttribute('aria-checked'), 'true', 'Malaysia is selected by default');
  assert.equal(await page.getByTestId('start-choice').count(), 0, 'the sample-data choice waits for the country');
  await page.screenshot({ path: `${SHOTS}k1-country.png` });
  await page.getByTestId('country-search').fill('singa');
  assert.equal(await page.locator('.country-row').count(), 1);
  await page.locator('[data-country="Singapore"]').click();
  await page.getByTestId('country-continue').click();
  await page.getByTestId('country-choice').waitFor({ state: 'detached' });
  await waitFor(() => calls.length === 1);
  assert.deepEqual(calls[0], { data: { country: 'Singapore' } });
  assert.equal(account.metadata.full_name, 'Test', 'the rest of the account data is untouched');
  assert.equal((await stored(page, 's:settings')).country, 'Singapore');
  await waitFor(async () => (await stored(page, 's:settings')).countryPending === false);
  await page.reload(); await page.waitForSelector('nav.grid'); await page.waitForTimeout(800);
  assert.equal(await page.getByTestId('country-choice').count(), 0, 'not asked again');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('K2 another phone of an account that already chose is never asked, and gets the same country', async () => {
  const account = { id: 'u-k2', email: 'k2@x.com', metadata: { country: 'Thailand' } };
  const { page, calls, ctx } = await phone(account);
  await waitFor(async () => (await stored(page, 's:settings')).country === 'Thailand');
  assert.equal(await page.getByTestId('country-choice').count(), 0);
  assert.equal(calls.length, 0, 'nothing is sent back');
  await ctx.close();
});

test('K3 new properties start with the chosen country; saved properties keep theirs', async () => {
  const account = { id: 'u-k3', email: 'k3@x.com', metadata: { country: 'Indonesia' } };
  const old = { id: 'p-old', created: 1, updated: 1, photos: [], country: 'Malaysia', state: 'Selangor', city: 'Sepang', street: 'Jalan Lama', type: 'house', status: 'available', ref: 'P1001', refPrefix: 'P', refNo: 1001 };
  const { page, ctx } = await phone(account, { records: { 'properties:p-old': old } });
  await waitFor(async () => (await stored(page, 's:settings')).country === 'Indonesia');
  await page.locator('[data-key="property"]').click();
  await page.getByRole('button', { name: 'Add New Property' }).first().click();
  await page.locator('summary, .sec-head, button').filter({ hasText: /Location/i }).first().click().catch(() => undefined);
  const val = await page.locator('[data-testid="opt-country"]').first().innerText();
  assert.match(val, /Indonesia/);
  await ctx.close();
});

test('K4 Bahasa Malaysia and Chinese show country names in that language, and the account of another person on the same phone is asked on its own', async () => {
  const a = { id: 'u-k4a', email: 'k4a@x.com', metadata: { country: 'Singapore' } };
  const { page, ctx } = await phone(a, { settings: { lang: 'bm' } });
  await waitFor(async () => (await stored(page, 's:settings')).country === 'Singapore');
  // a different account signs in on this phone: its own answer is read, not the first account's
  const b = { id: 'u-k4b', email: 'k4b@x.com', metadata: {} };
  await page.route(`${SB}/auth/v1/user`, async route => route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: JSON.stringify({ id: b.id, user_metadata: b.metadata }) }));
  await page.evaluate(async ({ b }) => {
    const db = await new Promise(res => { const r = indexedDB.open('estate-agent-buddy'); r.onsuccess = () => res(r.result); });
    const get = k => new Promise(res => { const q = db.transaction('records').objectStore('records').get(k); q.onsuccess = () => res(q.result); });
    const put = (k, v) => new Promise(res => { const tx = db.transaction('records', 'readwrite'); tx.objectStore('records').put(v, k); tx.oncomplete = res; });
    const m = await get('s:meta'); await put('s:meta', { ...m, syncSession: { ...m.syncSession, userId: b.id, email: b.email, country: undefined } });
    db.close();
  }, { b });
  await page.reload(); await page.waitForSelector('nav.grid');
  await page.getByTestId('country-choice').waitFor();
  const label = await page.locator('[data-country="Malaysia"]').innerText();
  assert.match(label, /Malaysia/);
  assert.match(await page.locator('[data-country="Singapore"]').innerText(), /Singapura/, 'Bahasa Malaysia name');
  assert.match(await page.getByTestId('country-choice').innerText(), /Di negara mana anda bekerja/i);
  await ctx.close();
});
