// JoyChange010-04 screen tests in a real Chromium browser at phone width: the Shared Documents folder on the Property list,
// and moving a property document between folders (form and property page). The Android share list itself is native and
// can only be tested on a phone (scripts/android-setup.mjs, EabSharePlugin).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { chromium } from 'playwright';

const DIST = new URL('../dist/', import.meta.url).pathname;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.map': 'application/json' };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
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

async function phone() {
  const ctx = await browser.newContext({ viewport: { width: 384, height: 824 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(base); await page.waitForSelector('nav.grid');
  await page.getByTestId('start-choice').waitFor({ timeout: 5000 });
  await page.getByTestId('start-empty').click();
  await page.getByTestId('start-choice').waitFor({ state: 'detached' });
  return { page, errors };
}
const propertyList = page => page.locator('nav.grid > button', { hasText: 'Subsale List' }).first().click();
async function setStreet(page, value) {
  const box = page.locator('[data-testid="opt-street"]');
  if (await box.locator('.opt-list').count() === 0) await box.locator('.opt-btn:not([data-locked]), .opt-field.locked .fx-edit').click();
  await page.getByTestId('opt-street-search').fill(value);
  const add = page.getByTestId('opt-street-add');
  if (await add.count()) await add.click(); else await box.getByRole('option', { name: value, exact: true }).click();
}
/** Chooses in one of the app's gold pick lists (the <select> stays in the page; the pop-up sets it). */
async function pick(page, scope, value) {
  await scope.getByTestId('doc-move-tap').click();
  await page.getByTestId('pick-popup').locator(`[data-value="${value}"]`).click();
  await page.getByTestId('pick-popup').waitFor({ state: 'detached' });
}

test('J10-U1 the Property list has a Shared Documents folder; empty, it explains how to share from WhatsApp', async () => {
  const { page, errors } = await phone();
  await propertyList(page);
  const btn = page.getByTestId('open-shared-docs');
  assert.match(await btn.innerText(), /Shared Documents/);
  await btn.click();
  await page.waitForSelector('[data-testid="shared-docs"]');
  assert.match(await page.locator('header').innerText(), /Shared Documents/);
  assert.match(await page.getByTestId('shared-empty').innerText(), /Estate Agent AI Buddy Document Upload/);
  assert.deepEqual(errors, []);
  await page.context().close();
});

test('J10-U2 a document moves to another folder in the form and on the property page', async () => {
  const { page, errors } = await phone();
  await propertyList(page);
  await page.locator('.add-property').click();
  await page.waitForSelector('[data-testid="listing-form"]');
  if ((await page.getByTestId('toggle-all').innerText()).match(/Open/)) await page.getByTestId('toggle-all').click();
  await setStreet(page, 'Jalan Share 1');
  await page.getByTestId('doc-input-floorplan').setInputFiles({ name: 'geran-scan.png', mimeType: 'image/png', buffer: PNG });
  await page.getByTestId('doc-floorplan').getByText('geran-scan.png').waitFor();
  // in the form: Floor plans → Title documents
  const sel = page.getByTestId('doc-floorplan').getByTestId('doc-move');
  assert.equal(await sel.inputValue(), 'floorplan');
  await pick(page, page.getByTestId('doc-floorplan'), 'title');
  await page.getByTestId('doc-title').getByText('geran-scan.png').waitFor();
  assert.equal(await page.getByTestId('doc-floorplan').getByText('geran-scan.png').count(), 0);
  await page.getByTestId('save-property').click();
  await page.waitForSelector('[data-testid="listing-details"]');
  // on the property page: Title documents → Other documents, saved at once
  const row = page.getByTestId('docs').getByTestId('doc-move');
  assert.equal(await row.inputValue(), 'title');
  await pick(page, page.getByTestId('docs'), 'other');
  await page.getByText('Moved to Other Documents.').waitFor();   // shown once it is saved on the phone
  await page.reload(); await page.waitForSelector('nav.grid');
  await propertyList(page);
  await page.locator('.sc-card').first().click();
  assert.equal(await page.getByTestId('docs').getByTestId('doc-move').inputValue(), 'other', 'kept after reopening');
  assert.deepEqual(errors, []);
  await page.context().close();
});
