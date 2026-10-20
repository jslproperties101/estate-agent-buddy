// Screen tests for Batch 4 (JoyChange008 locations): parent-only lists, the confirm before clearing lower levels, deleting
// an added place keeps saved properties' names, and the credits line. Chromium at Samsung S23 Ultra width (384 x 824).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { chromium } from 'playwright';

const DIST = new URL('../dist/', import.meta.url).pathname;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.map': 'application/json' };
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
  const ctx = await browser.newContext({ viewport: { width: 384, height: 824 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(base);
  await page.waitForSelector('nav.grid');
  await page.getByTestId('start-choice').waitFor({ timeout: 5000 });
  await page.getByTestId('start-sample').click();
  await page.getByTestId('start-choice').waitFor({ state: 'detached' });
  return page;
}
async function expandForm(page) {
  await page.waitForSelector('[data-testid="listing-form"]');
  if ((await page.getByTestId('toggle-all').innerText()).match(/Open|Buka|展开/)) await page.getByTestId('toggle-all').click();
}
async function newProperty(page) {
  await page.locator('nav.grid > button[data-key="property"]').evaluate(b => b.click());
  await page.locator('.add-property').click();
  await expandForm(page);
}
/** Opens one location level's list. */
async function openLevel(page, k) {
  const box = page.getByTestId(`opt-${k}`);
  await box.locator('.opt-btn').click();
  await box.getByTestId('opt-popup').waitFor();
  return box;
}
async function choose(page, k, name) {
  const box = await openLevel(page, k);
  await box.getByRole('option', { name, exact: true }).click();
}
async function addPlace(page, k, name) {
  const box = await openLevel(page, k);
  await box.getByTestId(`opt-${k}-search`).fill(name);
  await box.getByTestId(`opt-${k}-add`).click();
}
const stored = (page) => page.evaluate(() => new Promise(res => {
  const r = indexedDB.open('estate-agent-buddy');
  r.onsuccess = () => { const q = r.result.transaction('records').objectStore('records').getAll(); q.onsuccess = () => { r.result.close(); res(q.result); }; };
}));

test('B6-8 City / Town shows only the chosen state\'s towns; Township only the chosen town\'s', async () => {
  const page = await phone();
  await newProperty(page);
  await choose(page, 'state', 'Negeri Sembilan');
  let box = await openLevel(page, 'city');
  const towns = await box.locator('.opt-item').allInnerTexts();
  assert.ok(towns.includes('Nilai') && towns.includes('Seremban'), 'Negeri Sembilan towns');
  assert.ok(!towns.includes('Shah Alam') && !towns.includes('Johor Bahru'), 'no other state\'s towns');
  await box.getByTestId('opt-city-search').fill('nil');
  assert.deepEqual(await box.locator('.opt-item:not(.others)').allInnerTexts(), ['Nilai'], 'the search bar narrows the long list');
  await box.getByRole('option', { name: 'Nilai', exact: true }).click();
  box = await openLevel(page, 'township');
  const ts = await box.locator('.opt-item').allInnerTexts();
  assert.ok(ts.includes('Kota Seriemas') && !ts.includes('Bangsar'), 'Nilai\'s townships only');
  await box.getByTestId('opt-popup-close').click();
});

test('B6-9 changing a level with filled places below asks first; Cancel keeps them, Change clears them', async () => {
  const page = await phone();
  await newProperty(page);
  await choose(page, 'state', 'Negeri Sembilan');
  await choose(page, 'city', 'Nilai');
  await choose(page, 'township', 'Kota Seriemas');
  await choose(page, 'state', 'Selangor');
  const dlg = page.getByRole('alertdialog');
  assert.match(await dlg.innerText(), /Change State\?[\s\S]*City, Township/);
  await dlg.getByRole('button', { name: 'Cancel' }).click();
  assert.match(await page.getByTestId('opt-state').locator('.opt-btn').innerText(), /Negeri Sembilan/, 'Cancel keeps the old state');
  assert.match(await page.getByTestId('opt-township').locator('.opt-btn').innerText(), /Kota Seriemas/);
  await choose(page, 'state', 'Selangor');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Change' }).click();
  assert.match(await page.getByTestId('opt-state').locator('.opt-btn').innerText(), /Selangor/);
  assert.doesNotMatch(await page.getByTestId('opt-city').locator('.opt-btn').innerText(), /Nilai/, 'City cleared');
  assert.doesNotMatch(await page.getByTestId('opt-township').locator('.opt-btn').innerText(), /Kota Seriemas/, 'Township cleared');
});

test('B6-10 deleting a place the agent added: 008 warning; the saved property keeps its place name', async () => {
  const page = await phone();
  await newProperty(page);
  await choose(page, 'state', 'Negeri Sembilan');
  await choose(page, 'city', 'Nilai');
  await addPlace(page, 'township', 'Taman Uji Coba');
  await page.locator('[data-field="headline"]').fill('Ujian').catch(() => undefined);
  await page.getByTestId('save-property').click();
  const dlg = page.getByRole('alertdialog');
  if (await dlg.count()) await dlg.getByRole('button').last().click();
  await page.getByTestId('listing-details').waitFor();
  // A second property: the added township is offered under Nilai, with its X.
  await page.goBack().catch(() => undefined);
  await page.goto(base); await page.waitForSelector('nav.grid');
  await newProperty(page);
  await choose(page, 'state', 'Negeri Sembilan');
  await choose(page, 'city', 'Nilai');
  const box = await openLevel(page, 'township');
  await box.getByRole('button', { name: 'Remove Taman Uji Coba' }).click();
  const warn = page.getByTestId('opt-ask-place');
  assert.match(await warn.innerText(), /Properties you already saved keep their place names/);
  await page.getByTestId('opt-place-delete').click();
  assert.equal(await box.getByRole('option', { name: 'Taman Uji Coba', exact: true }).count(), 0, 'gone from the list');
  const all = await stored(page);
  assert.ok(all.some(v => v && v.township === 'Taman Uji Coba'), 'the saved property still says Taman Uji Coba');
});

test('B6-11 the place-list credits show in About', async () => {
  const page = await phone();
  await page.getByTestId('top-profile').click();
  await page.getByRole('button', { name: /Settings/i }).click();
  assert.match(await page.getByTestId('about-credits').innerText(), /Place lists:.*malaysia-postcodes/i);
});
