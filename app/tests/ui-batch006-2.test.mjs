// Screen tests for JoyChange006 Batch 2 (Change D): with the keyboard open, the field being typed in sits about 30% from the top
// of the visible screen and is never covered. The keyboard is imitated the way Android shows it to the app (adjustResize): the
// page shrinks to the part above the keyboard. 470 px left of 824 is a tall keyboard with a toolbar row, like SwiftKey.
// Chromium at Samsung S23 Ultra width (384 x 824). Not a phone: a real keyboard is checked on the device.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { chromium } from 'playwright';

const DIST = new URL('../dist/', import.meta.url).pathname;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.map': 'application/json' };
const SB = 'https://kb-test.supabase.co';
const FULL = 824, WITH_KB = 470;
let server, browser, base;
const errors = [];
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
after(async () => { await browser?.close(); server?.close(); assert.deepEqual(errors, [], 'no page errors'); });

async function phone() {
  const ctx = await browser.newContext({ viewport: { width: 384, height: FULL }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(base);
  await page.waitForSelector('nav.grid');
  await page.getByTestId('start-choice').waitFor({ timeout: 5000 });
  await page.getByTestId('start-sample').click();
  await page.getByTestId('start-choice').waitFor({ state: 'detached' });
  return page;
}
const keyboardUp = async page => { await page.setViewportSize({ width: 384, height: WITH_KB }); await page.waitForTimeout(350); };
const keyboardDown = async page => { await page.setViewportSize({ width: 384, height: FULL }); await page.waitForTimeout(350); };
/** Where the focused field is, as a share of the visible height, and whether it is fully visible. */
const focusedAt = page => page.evaluate(() => {
  const el = document.activeElement; const r = el.getBoundingClientRect(); const h = window.visualViewport?.height ?? innerHeight;
  return { at: r.top / h, top: r.top, bottom: r.bottom, h, tag: el.tagName };
});

test('K6-1 a field low on the calculator page comes up to about 30% from the top; the advert hides while typing and comes back', async () => {
  const page = await phone();
  await page.locator('nav.grid > button[data-key="calculator"]').click();
  assert.equal(await page.getByTestId('bottom-ad').count(), 1, 'advert shown before typing');
  const fields = page.locator('.content input:is([type="text"], [type="number"], [type="search"], :not([type])), .content textarea');
  const n = await fields.count();
  assert.ok(n > 2);
  const f = fields.nth(n - 1);
  await f.scrollIntoViewIfNeeded();
  await f.focus();
  await keyboardUp(page);
  const p = await focusedAt(page);
  assert.ok(p.top >= 0 && p.bottom <= p.h, `field fully visible (${Math.round(p.top)}–${Math.round(p.bottom)} of ${p.h})`);
  assert.ok(Math.abs(p.at - 0.3) <= 0.06, `field at ${(p.at * 100).toFixed(0)}% from the top`);
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('kb-open')), true);
  assert.equal(await page.getByTestId('bottom-ad').count(), 0, 'advert hidden while typing');
  await page.evaluate(() => document.activeElement.blur());
  await keyboardDown(page);
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('kb-open')), false, 'back to normal');
  assert.equal(await page.getByTestId('bottom-ad').count(), 1, 'advert back');
});

test('K6-2 a field near the top of the page is not pushed under the title bar', async () => {
  const page = await phone();
  await page.locator('nav.grid > button[data-key="calculator"]').click();
  const f = page.locator('.content input:is([type="text"], [type="number"], [type="search"], :not([type]))').first();
  await f.focus();
  await keyboardUp(page);
  const p = await focusedAt(page);
  const headBottom = await page.evaluate(() => document.querySelector('header')?.getBoundingClientRect().bottom ?? 0);
  assert.ok(p.top >= headBottom, `field (${Math.round(p.top)}) below the title bar (${Math.round(headBottom)})`);
  assert.ok(p.bottom <= p.h, 'field above the keyboard');
});

test('K6-3 the pick-list pop-up moves to the top while typing in its search bar; the search bar is fully visible', async () => {
  const page = await phone();
  await page.locator('nav.grid > button[data-key="calculator"]').click();
  const sel = page.getByTestId('calc-client');
  await sel.scrollIntoViewIfNeeded();
  const b = await sel.boundingBox();
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await page.getByTestId('pick-popup').waitFor();
  await page.getByTestId('pick-search').focus();
  await keyboardUp(page);
  const p = await focusedAt(page);
  assert.ok(p.top >= 0 && p.bottom <= p.h, 'search bar fully visible');
  assert.ok(p.at <= 0.36, `search bar near the top (${(p.at * 100).toFixed(0)}%)`);
  await page.getByTestId('pick-search').fill('zzzz');
  assert.equal(await page.getByTestId('pick-none').isVisible(), true, '"No results" visible above the keyboard');
});

test('K6-4 first-login country screen: the search bar is fully visible with the keyboard open; Continue stays on screen', async () => {
  const account = { id: 'u-k6', email: 'k6@x.com', metadata: { full_name: 'Test' } };
  const ctx = await browser.newContext({ viewport: { width: 384, height: FULL }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await ctx.route(`${SB}/**`, async route => {
    const req = route.request(); const url = new URL(req.url());
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'content-type': 'application/json' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (url.pathname === '/auth/v1/user') return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ id: account.id, email: account.email, user_metadata: account.metadata }) });
    return route.fulfill({ status: 500, headers: cors, body: '{"message":"not part of this test"}' });
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(base); await page.waitForSelector('nav.grid');
  await page.getByTestId('start-empty').click();
  await page.evaluate(async ({ SB, account }) => {
    const db = await new Promise(res => { const r = indexedDB.open('estate-agent-buddy'); r.onsuccess = () => res(r.result); });
    const put = (store, key, val) => new Promise((res, rej) => { const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).put(val, key); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    await put('records', 's:meta', { fired: [], dirty: [], tombstones: [], ownerChecked: true, syncWorkspaceId: 'ws1',
      syncSession: { accessToken: 'tok', refreshToken: 'r', expiresAt: Date.now() + 3_600_000, email: account.email, userId: account.id, name: 'Test', workspaceId: 'ws1', workspaceName: 'Mine', role: 'owner' } });
    await put('records', 's:settings', { lang: 'en', layout: 'grid', supabaseUrl: SB, supabaseAnonKey: 'anon', startChoice: 'empty' });
    db.close();
  }, { SB, account });
  await page.reload(); await page.waitForSelector('nav.grid');
  await page.getByTestId('country-choice').waitFor();
  // MainForAdmin-B: the country is one box now (no inline list); its search bar sits in the pop-up at the top of the screen.
  await page.getByTestId('country-select-tap').click();
  await page.getByTestId('pick-search').focus();
  await keyboardUp(page);
  const p = await focusedAt(page);
  assert.ok(p.top >= 0 && p.bottom <= p.h, `search fully visible (${Math.round(p.top)}–${Math.round(p.bottom)} of ${p.h})`);
  await page.getByTestId('pick-search').fill('singa');
  await page.getByTestId('pick-option').first().click();
  await keyboardDown(page);
  const c = await page.getByTestId('country-continue').boundingBox();
  assert.ok(c && c.y >= 0 && c.y + c.height <= FULL + 1, 'Continue on screen');
  await ctx.close();
});
