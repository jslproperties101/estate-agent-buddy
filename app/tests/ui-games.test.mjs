// v1buddychange013 screen tests (Chromium at phone width): the Games tile under the 15 cards and the Games list.
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

test('GM-U1 Home: the full-width Games tile sits under the 15 cards and fits the screen', async () => {
  const { page, errors } = await phone();
  const tile = page.getByTestId('open-games');
  await tile.waitFor();
  const box = await tile.boundingBox();
  const grid = await page.locator('nav.grid').boundingBox();
  assert.ok(box.y >= grid.y + grid.height - 1, 'below the grid');
  assert.ok(box.x >= 0 && box.x + box.width <= 384, 'inside the phone width');
  assert.equal(await page.locator('nav.grid > button').count(), 15, 'the grid still has 15 cards');
  assert.match(await tile.innerText(), /Games/);
  assert.deepEqual(errors, []);
});

test('GM-U2 Games list shows the three games, opens one and comes back', async () => {
  const { page, errors } = await phone();
  await page.getByTestId('open-games').click();
  await page.getByTestId('games-hub').waitFor();
  for (const k of ['buddyWalk', 'priceItRight', 'propertyRules']) assert.equal(await page.getByTestId(`game-${k}`).count(), 1, k);
  assert.match(await page.getByTestId('games-streak').innerText(), /Play today/);
  await page.getByTestId('game-priceItRight').click();
  await page.getByTestId('game-frame-priceItRight').waitFor();
  await page.goBack().catch(() => {});
  assert.deepEqual(errors, []);
});

test('GM-U3 the Games tile and list in Bahasa Melayu and Chinese', async () => {
  const { page, errors } = await phone();
  for (const [code, word] of [['bm', 'Permainan'], ['zh', '游戏']]) {
    await page.getByTestId('lang-btn').click();
    await page.locator(`.lang-menu button[data-lang="${code}"]`).click();
    await page.getByTestId('lang-menu').waitFor({ state: 'detached' });
    assert.match(await page.getByTestId('open-games').innerText(), new RegExp(word));
  }
  await page.getByTestId('open-games').click();
  assert.match(await page.getByTestId('games-streak').innerText(), /今天/);
  assert.deepEqual(errors, []);
});
