// Screen tests for JoyChange003 Batch C (photos): Change 67 (Reorder Photos screen), Change 68 (Main label), Change 53 (smooth
// swipes). Chromium at Samsung S23 Ultra width (384 x 824). Touch feel (momentum, press-and-hold) is checked on the phone.
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
const ids = page => page.getByTestId('form-photo').evaluateAll(xs => xs.map(x => x.dataset.photoId));

test('BC1 Change 68: "Main" lies along the bottom of the main picture only, centred and bigger; the list has no drag handle', async () => {
  const page = await phone();
  await formWithPhotos(page, 3);
  assert.equal(await page.getByTestId('photo-main').count(), 1, 'only one Main label');
  assert.equal(await page.getByTestId('form-photo').first().getByTestId('photo-main').count(), 1, 'on the first picture');
  assert.equal((await page.getByTestId('photo-main').innerText()).trim(), 'Main');
  const g = await page.evaluate(() => {
    const item = document.querySelector('[data-testid="form-photo"]'); const img = item.querySelector('img');
    const m = item.querySelector('[data-testid="photo-main"]'); const r = m.getBoundingClientRect(); const ir = img.getBoundingClientRect();
    const range = document.createRange(); range.selectNodeContents(m); const tr = range.getBoundingClientRect();
    return { imgBottom: ir.bottom, imgTop: ir.top, mBottom: r.bottom, mTop: r.top, textMid: tr.left + tr.width / 2, imgMid: ir.left + ir.width / 2, font: parseFloat(getComputedStyle(m).fontSize) };
  });
  assert.ok(g.mBottom <= g.imgBottom + 1 && g.mTop >= g.imgTop, `the label sits inside the picture, along its bottom (${JSON.stringify(g)})`);
  assert.ok(Math.abs(g.textMid - g.imgMid) < 4, 'centred');
  assert.ok(g.font >= 20, `bigger (${g.font}px)`);
  assert.equal(await page.getByTestId('photo-drag').count(), 0, 'no drag handle on the list');
  assert.equal(await page.getByTestId('drag-hint').count(), 0, 'no drag hint on the list');
  await page.context().close();
});

test('BC2 Change 67: Reorder Photos opens from the 3-dot menu; four per row, nothing drawn on them; tap enlarges with an X; drag moves; Done closes', async () => {
  const page = await phone();
  await formWithPhotos(page, 8);
  const ids0 = await ids(page);
  await page.getByTestId('form-photo').nth(3).getByTestId('photo-menu').click();
  const items = (await page.getByTestId('photo-menu-list').getByRole('menuitem').allInnerTexts()).map(x => x.trim());
  assert.deepEqual(items, ['Set as Main Photo', 'Reorder Photos', 'Delete']);
  await page.getByTestId('photo-reorder-open').click();
  await page.getByTestId('photo-reorder').waitFor();
  assert.equal(await page.getByTestId('photo-reorder-hint').innerText(), 'Click to enlarge, drag to move order');
  const tops = await page.getByTestId('reorder-tile').evaluateAll(xs => xs.map(x => Math.round(x.getBoundingClientRect().top)));
  assert.equal(tops.length, 8);
  assert.equal(tops.filter(t => t === tops[0]).length, 4, `four pictures per row (${tops.join(',')})`);
  assert.equal(await page.getByTestId('photo-reorder').locator('button:not([data-testid^="photo-reorder"]), .pg-main, .pg-menu-btn').count(), 0, 'no icons, labels, menus or delete on the pictures');
  // Tap: enlarges, with an X.
  await page.getByTestId('reorder-tile').nth(2).click();
  await page.getByTestId('photo-viewer').waitFor();
  assert.equal(await page.getByTestId('photo-viewer').getAttribute('data-index'), '2');
  await page.getByTestId('photo-viewer-close').click();
  await page.getByTestId('photo-viewer').waitFor({ state: 'detached' });
  // Drag picture 5 onto picture 1.
  const rt = page.getByTestId('reorder-tile');
  const a = await rt.nth(4).boundingBox(); const b = await rt.nth(0).boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2); await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
  assert.equal(await rt.nth(4).evaluate(e => e.classList.contains('dragging')), true, 'the dragged picture is marked');
  await page.mouse.up();
  await page.getByTestId('photo-reorder-done').click();
  await page.getByTestId('photo-reorder').waitFor({ state: 'detached' });
  assert.deepEqual(await ids(page), [ids0[4], ids0[0], ids0[1], ids0[2], ids0[3], ids0[5], ids0[6], ids0[7]], 'moved to the front, so it is the main picture');
  assert.equal(await page.getByTestId('form-photo').first().getByTestId('photo-main').count(), 1);
  await page.context().close();
});

test('BC3 Change 67: the screen scrolls by itself while a picture is dragged near the bottom edge, and the drop lands on the picture under the finger', async () => {
  const page = await phone();
  await formWithPhotos(page, 40);
  const ids0 = await ids(page);
  await page.getByTestId('form-photo').first().getByTestId('photo-menu').click();
  await page.getByTestId('photo-reorder-open').click();
  await page.getByTestId('photo-reorder').waitFor();
  const sc = page.getByTestId('photo-reorder-scroll');
  assert.ok(await sc.evaluate(e => e.scrollHeight > e.clientHeight + 100), 'forty pictures need scrolling');
  assert.equal(await sc.evaluate(e => e.scrollTop), 0);
  const box = await sc.boundingBox();
  const t0 = await page.getByTestId('reorder-tile').nth(0).boundingBox();
  await page.mouse.move(t0.x + t0.width / 2, t0.y + t0.height / 2); await page.mouse.down();
  await page.mouse.move(t0.x + t0.width / 2, box.y + box.height - 10, { steps: 6 });
  await page.waitForTimeout(900);
  const moved = await sc.evaluate(e => e.scrollTop);
  assert.ok(moved > 150, `it scrolled by itself (${moved}px)`);
  // Drop on whichever picture is under the finger now.
  const under = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('[data-ri]')?.getAttribute('data-ri'), [t0.x + t0.width / 2, box.y + box.height - 10]);
  assert.ok(under !== null && Number(under) > 4, `a picture further down is under the finger (${under})`);
  await page.mouse.up();
  await page.getByTestId('photo-reorder-done').click();
  const after = await ids(page);
  assert.equal(after[Number(under)], ids0[0], 'the first picture was dropped where the finger was');
  assert.equal(after.length, 40);
  await page.context().close();
});

test('BC4 Change 53: a swipe in the photo viewer moves on and the next photo glides in; a tiny drag springs back', async () => {
  const page = await phone();
  await formWithPhotos(page, 3);
  await page.getByTestId('photo-open').first().click();
  await page.getByTestId('photo-viewer').waitFor();
  const stage = await page.getByTestId('photo-viewer-stage').boundingBox();
  const y = stage.y + stage.height / 2;
  // A tiny drag does nothing (it springs back).
  await page.mouse.move(stage.x + 200, y); await page.mouse.down(); await page.mouse.move(stage.x + 194, y, { steps: 2 }); await page.mouse.up();
  assert.equal(await page.getByTestId('photo-viewer').getAttribute('data-index'), '0', 'a tiny drag stays on the photo');
  // A swipe left moves on, and the incoming photo carries the glide.
  await page.mouse.move(stage.x + 300, y); await page.mouse.down(); await page.mouse.move(stage.x + 150, y, { steps: 5 }); await page.mouse.up();
  assert.equal(await page.getByTestId('photo-viewer').getAttribute('data-index'), '1');
  assert.equal(await page.getByTestId('photo-viewer-photo').getAttribute('data-slide'), '1', 'gliding in from the right');
  assert.match(await page.getByTestId('photo-viewer-photo').getAttribute('class'), /sliding-[ab]/);
  await page.waitForTimeout(600);
  assert.equal(await page.getByTestId('photo-viewer-photo').getAttribute('data-slide'), null, 'the glide ends');
  // The arrow glides too, and the keyboard arrow works after a swipe (no stale photo number).
  await page.getByTestId('photo-viewer-next').click();
  assert.equal(await page.getByTestId('photo-viewer').getAttribute('data-index'), '2');
  await page.keyboard.press('ArrowLeft');
  assert.equal(await page.getByTestId('photo-viewer').getAttribute('data-index'), '1');
  await page.context().close();
});
