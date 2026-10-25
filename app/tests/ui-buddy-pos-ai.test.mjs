// AI Buddy POS Phase 1 screen tests in a real Chromium browser at phone width, signed out (everything on the phone).
// Not a phone, not Supabase and not LHDN: the e-Invoice test only checks that nothing is claimed as sent.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { chromium } from 'playwright';

const DIST = new URL('../dist/', import.meta.url).pathname;
const SHOTS = new URL('./screens/', import.meta.url).pathname;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.map': 'application/json' };
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

async function phone(settings = {}) {
  const ctx = await browser.newContext({ viewport: { width: 384, height: 824 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(base); await page.waitForSelector('nav.grid');
  await page.getByTestId('start-empty').click();
  await page.evaluate(async settings => {
    const db = await new Promise(res => { const r = indexedDB.open('estate-agent-buddy'); r.onsuccess = () => res(r.result); });
    const put = (store, key, val) => new Promise((res, rej) => { const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).put(val, key); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    await put('records', 's:settings', { lang: 'en', layout: 'grid', startChoice: 'empty', ...settings });
    db.close();
  }, settings);
  await page.reload(); await page.waitForSelector('nav.grid');
  return { page, ctx, errors };
}
const openFinance = async page => { await page.locator('nav.grid > button[data-key="finance"]').click(); await page.getByTestId('finance').waitFor(); };

test('B1 switch off by default: Agent Financial shows no AI Buddy POS entry', async () => {
  const { page, ctx, errors } = await phone();
  await openFinance(page);
  assert.equal(await page.getByTestId('buddy-entry').count(), 0);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('B2 switch on: example books, POS sale posts to the ledger, reports balance', async () => {
  const { page, ctx, errors } = await phone({ buddyPos: true });
  await openFinance(page);
  await page.getByTestId('open-buddy').click();
  await page.getByTestId('buddy').waitFor();
  await page.getByTestId('bp-load-sample').click();
  await page.getByTestId('bp-sample-on').waitFor();
  assert.ok((await page.getByTestId('bp-insights').locator('li').count()) >= 3, 'insights from the example books');
  await page.screenshot({ path: `${SHOTS}buddy-overview.png`, fullPage: true });

  await page.getByRole('tab', { name: 'POS' }).click();
  await page.getByTestId('bp-product').filter({ hasText: 'Tenancy agreement preparation' }).click();
  assert.equal(await page.getByTestId('bp-cart-total').textContent(), 'RM 378.00', 'RM350 + 8% service tax');
  const before = await page.getByTestId('bp-receipt').count();
  await page.getByTestId('bp-charge').click();
  await page.waitForFunction(n => document.querySelectorAll('[data-testid="bp-receipt"]').length === n + 1, before);
  await page.screenshot({ path: `${SHOTS}buddy-pos.png`, fullPage: true });

  await page.getByRole('tab', { name: 'Journal' }).click();
  assert.ok(await page.getByTestId('bp-journal').filter({ hasText: 'POS sale' }).count() >= 1, 'the sale has its journal entry');

  await page.getByRole('tab', { name: 'Reports' }).click();
  assert.equal(await page.getByTestId('bp-tb-dr').textContent(), await page.getByTestId('bp-tb-cr').textContent(), 'trial balance debits = credits');
  assert.equal(await page.getByTestId('bp-bs-balanced').textContent(), 'Balanced');
  await page.screenshot({ path: `${SHOTS}buddy-reports.png`, fullPage: true });
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('B3 journal: unbalanced entry cannot be posted; posted entry is reversed, not edited', async () => {
  const { page, ctx, errors } = await phone({ buddyPos: true });
  await openFinance(page); await page.getByTestId('open-buddy').click();
  await page.getByRole('tab', { name: 'Journal' }).click();
  await page.getByTestId('bp-new-journal').click();
  await page.getByTestId('bp-j-memo').fill('Office rent');
  const accs = page.getByTestId('bp-j-acc');
  await accs.nth(0).selectOption('6100'); await accs.nth(1).selectOption('1010');
  await page.locator('[data-field="bp-j-dr"]').nth(0).fill('3000');
  await page.locator('[data-field="bp-j-cr"]').nth(1).fill('2999');
  assert.equal(await page.getByTestId('bp-j-balanced').textContent(), 'Not balanced');
  assert.equal(await page.getByTestId('bp-j-post').isDisabled(), true);
  await page.locator('[data-field="bp-j-cr"]').nth(1).fill('3000');
  assert.equal(await page.getByTestId('bp-j-balanced').textContent(), 'Balanced');
  await page.getByTestId('bp-j-post').click();
  await page.getByTestId('bp-journal').first().waitFor();
  assert.match(await page.getByTestId('bp-journal').first().textContent(), /JV-0001/);
  await page.getByTestId('bp-j-reverse').first().click();
  await page.getByRole('button', { name: 'Reverse' }).last().click();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="bp-journal"]').length === 2);
  assert.ok(await page.getByTestId('bp-journal').filter({ hasText: 'Reversed by JV-0002' }).count() === 1);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('B4 e-Invoice without a connected server: submit says the sandbox is not connected and nothing is marked sent', async () => {
  const { page, ctx, errors } = await phone({ buddyPos: true, lang: 'bm' });
  await openFinance(page); await page.getByTestId('open-buddy').click();
  await page.getByTestId('bp-load-sample').click();
  await page.getByRole('tab', { name: 'e-Invois' }).click();
  await page.getByTestId('bp-einv').first().waitFor();
  const card = page.getByTestId('bp-einv').filter({ has: page.getByTestId('bp-einv-submit') }).first();
  await card.getByTestId('bp-einv-submit').click();
  await page.getByText('Kotak pasir LHDN belum disambungkan', { exact: false }).first().waitFor();
  assert.equal(await page.locator('[data-testid="bp-einv"] [data-status="valid"]').count(), 0, 'nothing claims LHDN validated it');
  await page.screenshot({ path: `${SHOTS}buddy-einvoice-bm.png`, fullPage: true });
  assert.deepEqual(errors, []);
  await ctx.close();
});
