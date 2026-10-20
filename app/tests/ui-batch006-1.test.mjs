// Screen tests for JoyChange006 Batch 1 (Changes A, B, C): no overlapping text, one dropdown look, a search bar in pick lists.
// Chromium at Samsung S23 Ultra width (384 x 824).
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
async function tapOn(page, locator) {
  await locator.scrollIntoViewIfNeeded();
  const b = await locator.boundingBox();
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
}

test('B6-1 Change A: a property card in the picker is tall enough for its text (no overlap)', async () => {
  const page = await phone();
  await page.locator('nav.grid > button[data-key="calculator"]').click();
  await page.getByTestId('calc-pick-property').click();
  const items = page.getByTestId('calc-pick-item');
  await items.first().waitFor();
  const bad = await items.evaluateAll(els => els.filter(e => e.scrollHeight > e.clientHeight + 1).length);
  assert.equal(bad, 0, 'no card is shorter than its content');
});

test('B6-2 Change B: the property button and the client dropdown have the same look', async () => {
  const page = await phone();
  await page.locator('nav.grid > button[data-key="calculator"]').click();
  await page.mouse.move(1, 1);   // no finger resting on either one (hover is a touch-up of the same look)
  await page.waitForTimeout(400);
  const style = loc => loc.evaluate(e => { const c = getComputedStyle(e); return [c.borderTopColor, c.borderTopWidth, c.borderRadius, c.backgroundColor, c.color, c.boxShadow, c.textAlign].join('|'); });
  const a = await style(page.getByTestId('calc-pick-property'));
  const b = await style(page.locator('.sel-wrap > select').first());
  assert.equal(a, b);
});

test('B6-3 Change C: the client pop-up has a search bar; no match shows "No results"; clearing restores the list', async () => {
  const page = await phone();
  await page.locator('nav.grid > button[data-key="calculator"]').click();
  await tapOn(page, page.getByTestId('calc-client'));
  await page.getByTestId('pick-popup').waitFor();
  const all = await page.getByTestId('pick-option').count();
  assert.ok(all > 1);
  await page.getByTestId('pick-search').fill('zzzzqq');
  assert.equal(await page.getByTestId('pick-option').count(), 0);
  assert.equal(await page.getByTestId('pick-none').count(), 1);
  await page.getByTestId('pick-search').fill('');
  assert.equal(await page.getByTestId('pick-option').count(), all);
});

test('B6-4 Change C: the calculator property list has a search bar and says when nothing matches', async () => {
  const page = await phone();
  await page.locator('nav.grid > button[data-key="calculator"]').click();
  await page.getByTestId('calc-pick-property').click();
  await page.getByTestId('calc-pick-item').first().waitFor();
  await page.getByTestId('calc-search').fill('zzzzqq');
  assert.equal(await page.getByTestId('calc-pick-item').count(), 0);
  assert.equal(await page.getByTestId('calc-no-match').count(), 1);
});
