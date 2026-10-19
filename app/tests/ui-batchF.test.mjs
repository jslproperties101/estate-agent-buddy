// Screen tests for JoyChange003 Batch F: Marketing Studio (Changes 75, 76, 81) and Photo Studio (Changes 78, 79).
// Chromium at Samsung S23 Ultra width (384 x 824). Saving to Downloads / Gallery (Change 77) works only in the Android app.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { chromium } from 'playwright';

const DIST = new URL('../dist/', import.meta.url).pathname;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.map': 'application/json' };
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
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
  const ctx = await browser.newContext({ viewport: { width: 384, height: 824 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(base);
  await page.waitForSelector('nav.grid');
  await page.getByTestId('start-choice').waitFor({ timeout: 5000 });
  await page.getByTestId('start-empty').click();
  await page.getByTestId('start-choice').waitFor({ state: 'detached' });
  return page;
}
async function formWithPhotos(page, n) {
  await page.locator('nav.grid > button[data-key="property"]').click();
  await page.locator('.add-property').click();
  await page.waitForSelector('[data-testid="listing-form"]');
  if ((await page.getByTestId('toggle-all').innerText()).match(/Open/)) await page.getByTestId('toggle-all').click();
  const buf = Buffer.from(PNG, 'base64');
  await page.getByTestId('photo-input').setInputFiles(Array.from({ length: n }, (_, i) => ({ name: `p${i + 1}.png`, mimeType: 'image/png', buffer: buf })));
  await page.locator('[data-testid="form-photo"]').nth(n - 1).waitFor({ timeout: 60000 });
  await page.getByTestId('photo-progress').waitFor({ state: 'detached', timeout: 60000 }).catch(() => undefined);
}

async function saved(page, n) {
  await formWithPhotos(page, n);
  await page.getByTestId('save-property').click();
  await page.waitForSelector('[data-testid="listing-details"]');
}

test('BF1 Changes 75 / 81: A4 takes up to 9 photos; 8 styles in a gold-bordered picker', async () => {
  const page = await phone();
  await saved(page, 6);
  await page.getByTestId('open-marketing-studio').click();
  await page.getByTestId('marketing-studio').waitFor();
  await page.getByTestId('ms-format-a4').check();
  assert.match(await page.getByTestId('ms-photo-count').innerText(), /6 of 9/i);
  // Change 81: the picker
  const tiles = page.getByTestId('ms-theme').locator('[role="radio"]');
  assert.equal(await tiles.count(), 8);
  assert.deepEqual((await tiles.allInnerTexts()).map(x => x.trim().toLowerCase()), ['black and gold', 'white and gold', 'navy and gold', 'burgundy and gold', 'charcoal and silver', 'cream and gold', 'minimal black and white', 'sky blue and white']);
  const box = await page.getByTestId('ms-theme').evaluate(el => { const s = getComputedStyle(el); return { bg: s.backgroundColor, border: s.borderTopColor, w: s.borderTopWidth }; });
  assert.equal(box.bg, 'rgb(8, 8, 10)', 'black box');
  assert.equal(box.border, 'rgb(168, 127, 27)', 'darker gold border');
  assert.equal(await page.getByTestId('ms-style-dark').getAttribute('aria-checked'), 'true');
  await page.getByTestId('ms-style-navy').click();
  assert.equal(await page.getByTestId('ms-style-navy').getAttribute('aria-checked'), 'true');
  assert.equal(await page.getByTestId('ms-style-dark').getAttribute('aria-checked'), 'false');
  // the design is made with the chosen style and all photos
  await page.getByTestId('ms-make').click();
  await page.waitForFunction(() => document.querySelector('[data-testid="ms-result"]')?.getAttribute('data-format') === 'a4');
  await page.context().close();
});

test('BF2 Changes 78 / 79: Photo Studio grid 2 to a row, tap opens one photo, 7 icons drive one control, picture pinned, swipe moves on', async () => {
  const page = await phone();
  await saved(page, 3);
  await page.getByTestId('open-photo-studio').click();
  await page.getByTestId('photo-studio').waitFor();
  assert.equal(await page.getByTestId('ps-stage').count(), 0, 'grid first, no editor');
  const cells = await page.getByTestId('ps-photo').evaluateAll(xs => xs.map(x => { const r = x.getBoundingClientRect(); return { top: Math.round(r.top), left: Math.round(r.left) }; }));
  assert.equal(cells.length, 3);
  assert.equal(cells[0].top, cells[1].top, 'two to a row'); assert.ok(cells[2].top > cells[0].top, 'third on the next row');
  await page.getByTestId('ps-photo').nth(0).click();
  await page.getByTestId('ps-preview').waitFor();
  assert.match(await page.getByTestId('ps-pos').innerText(), /1 of 3/i);
  assert.equal(await page.getByTestId('ps-tools').locator('button').count(), 7);
  assert.equal(await page.getByTestId('ps-control').locator('input[type="range"]').count(), 1, 'one slider');
  assert.equal(await page.getByTestId('ps-brightness').count(), 1);
  await page.getByTestId('ps-tool-contrast').click();
  assert.equal(await page.getByTestId('ps-brightness').count(), 0);
  assert.equal(await page.getByTestId('ps-contrast').count(), 1);
  await page.getByTestId('ps-tool-rotate').click();
  assert.equal(await page.getByTestId('ps-rotate-right').count(), 1);
  assert.equal(await page.locator('.ps-pin').evaluate(el => getComputedStyle(el).position), 'sticky', 'picture pinned');
  // swipe left moves to photo 2 (mouse drag sideways on the picture)
  const b = await page.getByTestId('ps-stage').boundingBox();
  await page.mouse.move(b.x + b.width * 0.8, b.y + b.height / 2); await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.2, b.y + b.height / 2, { steps: 5 }); await page.mouse.up();
  assert.match(await page.getByTestId('ps-pos').innerText(), /2 of 3/i);
  await page.getByTestId('ps-prev').click();
  assert.match(await page.getByTestId('ps-pos').innerText(), /1 of 3/i);
  // with an unsaved change, moving on is held back
  await page.getByTestId('ps-tool-brightness').click();
  await page.getByTestId('ps-brightness').fill('60');
  await page.getByTestId('ps-next').click();
  assert.match(await page.getByTestId('ps-pos').innerText(), /1 of 3/i);
  assert.match(await page.getByTestId('ps-note').innerText(), /save or reset/i);
  // save it: the grid shows the "Enhanced copy" label below the picture, not on it
  await page.getByTestId('ps-save-new').click();
  await page.getByTestId('ps-msg').waitFor();
  await page.getByTestId('ps-all').click();
  await page.getByTestId('ps-chip').first().waitFor();
  const g = await page.evaluate(() => { const c = document.querySelector('[data-testid="ps-chip"]'); const btn = c.parentElement.querySelector('[data-testid="ps-photo"]'); return { chipTop: c.getBoundingClientRect().top, imgBottom: btn.getBoundingClientRect().bottom, inside: btn.contains(c) }; });
  assert.ok(!g.inside && g.chipTop >= g.imgBottom - 1, `label below the picture (${JSON.stringify(g)})`);
  await page.context().close();
});
