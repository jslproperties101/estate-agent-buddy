// Screen tests for JoyChange006 Part 2 Batch 3: E (splash covered in ui.test.mjs U39b), F (new status) and G (Check-status
// pop-up colours). Chromium at Samsung S23 Ultra width (384 x 824).
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
async function expandForm(page) {
  await page.waitForSelector('[data-testid="listing-form"]');
  if ((await page.getByTestId('toggle-all').innerText()).match(/Open|Buka|展开/)) await page.getByTestId('toggle-all').click();
}

test('B6-5 Change F: "Rented - Pending TA Signing" is offered in the property form, just before "Rented"', async () => {
  const page = await phone();
  await page.locator('nav.grid > button[data-key="property"]').evaluate(b => b.click());
  await page.locator('.add-property').click();
  await expandForm(page);
  const sel = page.locator('[data-field="availability"]');
  const labels = await sel.locator('option').allTextContents();
  const ta = labels.indexOf('Rented - Pending TA Signing');
  assert.ok(ta > -1, 'the new option is present');
  assert.equal(labels[ta + 1], 'Rented', 'just before Rented');
});

test('B6-6 Change G: each option in a Check-status pop-up is coloured the same as the field already shows for that status', async () => {
  const page = await phone();
  await page.locator('nav.grid > button[data-key="property"]').evaluate(b => b.click());
  await page.locator('.add-property').click();
  await expandForm(page);
  const tap = page.locator('label:has([data-verify="tenure"]) .sel-tap');
  await tapOn(page, tap);
  await page.getByTestId('pick-popup').waitFor();
  const colours = await page.evaluate(() => {
    const items = [...document.querySelectorAll('.opt-list.verify-colors .opt-item')];
    return Object.fromEntries(items.map(b => [b.dataset.value, getComputedStyle(b).color]));
  });
  assert.notEqual(colours.confirmed, colours.owner);
  assert.notEqual(colours.owner, colours.check);
  assert.notEqual(colours.confirmed, colours.check);
  // The same colours the field itself already uses (styles.css --ok / --orange / --red).
  const fieldColours = await page.evaluate(() => {
    const css = getComputedStyle(document.documentElement);
    return { ok: css.getPropertyValue('--ok').trim(), orange: css.getPropertyValue('--orange').trim(), red: css.getPropertyValue('--red').trim() };
  });
  const toRgb = async hex => page.evaluate(h => { const d = document.createElement('div'); d.style.color = h; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; }, hex);
  assert.equal(colours.confirmed, await toRgb(fieldColours.ok));
  assert.equal(colours.owner, await toRgb(fieldColours.orange));
  assert.equal(colours.check, await toRgb(fieldColours.red));
});

test('B6-7 Change G: a picker that is not a Check-status field gets no verify colouring', async () => {
  const page = await phone();
  await page.locator('nav.grid > button[data-key="property"]').evaluate(b => b.click());
  await page.locator('.add-property').click();
  await expandForm(page);
  await tapOn(page, page.locator('label:has([data-field="availability"]) .sel-tap'));
  await page.getByTestId('pick-popup').waitFor();
  assert.equal(await page.locator('.opt-list.verify-colors').count(), 0, 'an ordinary dropdown is never coloured');
  await page.getByTestId('pick-popup-close').click();
});
