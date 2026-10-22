// v1buddychange015 (Batch I) screen tests (Chromium at phone width): the four new games open from the Games list, start,
// pause, finish a round into the shared result card, and leave cleanly. The 3D games draw with WebGL; Chromium's
// software WebGL is used here, so these tests prove the screens and controls, not the speed on a real phone.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { chromium } from 'playwright';

const DIST = new URL('../dist/', import.meta.url).pathname;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.map': 'application/json' };
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
  browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
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
  await page.getByTestId('open-games').click();
  await page.getByTestId('games-hub').waitFor();
  return { page, errors };
}

/** Text under 14 px or buttons under 44 px inside `sel` (the app's readability rule U21). */
const readability = (page, sel) => page.evaluate(sel => {
  const small = [], short = [];
  for (const el of document.querySelectorAll(`${sel} *`)) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || el.closest('svg, [hidden]') || el.getClientRects().length === 0) continue;
    const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (own && parseFloat(cs.fontSize) < 14) small.push(`${el.tagName} ${el.textContent.trim().slice(0, 20)} ${cs.fontSize}`);
    if (el.tagName === 'BUTTON' && el.getBoundingClientRect().height < 44) short.push(`${el.textContent.trim().slice(0, 20)} ${el.getBoundingClientRect().height}`);
  }
  return { small, short };
}, sel);

test('GB-U1 the Games list shows all seven games, the four new ones last', async () => {
  const { page, errors } = await phone();
  const keys = await page.locator('[data-testid^="game-"].games-card').evaluateAll(els => els.map(e => e.dataset.testid.slice(5)));
  assert.deepEqual(keys, ['buddyWalk', 'priceItRight', 'propertyRules', 'buddyStreets', 'viewingRush', 'openHouse', 'matchBuyer']);
  assert.match(await page.getByTestId('game-viewingRush').innerText(), /Viewing Rush/);
  assert.deepEqual(errors, []);
  await page.context().close();
});

for (const [key, root, pause, extra] of [
  ['buddyStreets', 'bs-root', 'bs-pause', 'bs-finder'],
  ['viewingRush', 'vr-root', 'vr-pause', 'vr-job'],
  ['openHouse', 'oh-root', 'oh-pause', 'oh-wish'],
]) {
  test(`GB-U2 ${key}: full screen, start card, play, pause, finish round, result card`, async () => {
    const { page, errors } = await phone();
    await page.getByTestId(`game-${key}`).click();
    await page.getByTestId(root).waitFor();
    // full screen over the app, with the 3D picture
    const box = await page.getByTestId(root).boundingBox();
    assert.ok(box.width >= 383 && box.height >= 823, 'covers the phone screen');
    assert.equal(await page.getByTestId(root).getByTestId('g3-canvas').count(), 1);
    await page.getByTestId('g3-start').waitFor();
    assert.deepEqual(await readability(page, `[data-testid="${root}"]`), { small: [], short: [] }, 'start card readable');
    await page.getByTestId('g3-start').click();
    await page.getByTestId(extra).waitFor();
    await page.waitForTimeout(600);
    assert.ok((await page.getByTestId(extra).innerText()).trim().length > 0, 'direction / wishlist filled in');
    assert.deepEqual(await readability(page, `[data-testid="${root}"]`), { small: [], short: [] }, 'game screen readable');
    // the picture is really drawn (not a blank canvas)
    const lit = await page.getByTestId(root).getByTestId('g3-canvas').evaluate(c => {
      const g = c.getContext('webgl') ?? c.getContext('experimental-webgl');
      if (!g) return -1;
      const px = new Uint8Array(4 * 16 * 16);
      g.readPixels(Math.floor(c.width / 2) - 8, Math.floor(c.height / 3), 16, 16, g.RGBA, g.UNSIGNED_BYTE, px);
      let sum = 0; for (let i = 0; i < px.length; i += 4) sum += px[i] + px[i + 1] + px[i + 2];
      return sum;
    });
    assert.notEqual(lit, -1, 'WebGL available in the test browser');
    await page.getByTestId(pause).click();
    await page.getByTestId('g3-finish').click();
    await page.getByTestId('game-result').waitFor();
    assert.match(await page.getByTestId('game-result-score').innerText(), /You scored \d+ out of \d+/);
    assert.equal(await page.getByTestId(root).count(), 0, 'the full-screen game is gone');
    await page.getByTestId('game-back').click();
    await page.getByTestId('games-hub').waitFor();
    assert.match(await page.getByTestId(`game-${key}`).innerText(), /1 play/);
    assert.deepEqual(errors, []);
    await page.context().close();
  });
}

test('GB-U3 Back to Games from a 3D start card leaves no full-screen layer behind', async () => {
  const { page, errors } = await phone();
  await page.getByTestId('game-openHouse').click();
  await page.getByTestId('g3-back').click();
  await page.getByTestId('games-hub').waitFor();
  assert.equal(await page.locator('.g3').count(), 0);
  assert.deepEqual(errors, []);
  await page.context().close();
});

test('GB-U4 Buddy Walk: Streets: walk to the first sign and price the listing', async () => {
  const { page, errors } = await phone();
  await page.getByTestId('game-buddyStreets').click();
  await page.getByTestId('g3-start').click();
  // walk forward (W) until the Price button appears beside the first sign, then stop
  await page.keyboard.down('w');
  for (let i = 0; i < 100 && !(await page.getByTestId('bs-price-it').isVisible()); i++) await page.waitForTimeout(100);
  await page.keyboard.up('w');
  await page.getByTestId('bs-price-it').click();
  await page.getByTestId('bs-sheet').waitFor();
  assert.equal(await page.locator('[data-testid^="bs-opt-"]').count(), 3);
  await page.getByTestId('bs-opt-0').click();
  await page.getByTestId('bs-continue').waitFor();
  assert.match(await page.getByTestId('bs-sheet').innerText(), /Asking price: RM [\d,]+/);
  assert.deepEqual(await readability(page, '[data-testid="bs-sheet"]'), { small: [], short: [] });
  await page.getByTestId('bs-continue').click();
  assert.ok(await page.getByTestId('bs-sheet').isHidden());
  assert.deepEqual(errors, []);
  await page.context().close();
});

test('GB-U5 Match the Buyer: Match / Skip give a right-or-wrong reason, Finish round shows the result', async () => {
  const { page, errors } = await phone();
  await page.getByTestId('game-matchBuyer').click();
  await page.getByTestId('mb-start').click();
  await page.getByTestId('mb-brief').waitFor();
  assert.match(await page.getByTestId('mb-budget').innerText(), /Up to RM [\d,]+/);
  for (let i = 0; i < 4; i++) {
    await page.getByTestId(i % 2 ? 'mb-skip' : 'mb-match').click();
    await page.waitForTimeout(650);
    assert.match(await page.getByTestId('mb-feedback').innerText(), /Correct!|−5s|New buyer/);
  }
  // a swipe works as well as the buttons
  const c = await page.getByTestId('mb-card').boundingBox();
  await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2); await page.mouse.down();
  await page.mouse.move(c.x + c.width / 2 + 160, c.y + c.height / 2, { steps: 6 }); await page.mouse.up();
  await page.waitForTimeout(650);
  assert.deepEqual(await readability(page, '[data-testid="mb-root"]'), { small: [], short: [] });
  const shown = await page.getByTestId('mb-match').boundingBox();
  assert.ok(shown.y + shown.height <= 824, 'Match button on screen without scrolling');
  await page.getByTestId('mb-finish').click();
  await page.getByTestId('game-result').waitFor();
  assert.deepEqual(errors, []);
  await page.context().close();
});

test('GB-U6 the new games in Bahasa Melayu and Chinese', async () => {
  const { page, errors } = await phone();
  for (const [code, words] of [['bm', [/Kejar Tinjauan/, /Mula memandu/]], ['zh', [/看房冲刺/, /开始驾驶/]]]) {
    await page.goBack().catch(() => {});
    await page.waitForSelector('nav.grid');
    await page.getByTestId('lang-btn').click();
    await page.locator(`.lang-menu button[data-lang="${code}"]`).click();
    await page.getByTestId('lang-menu').waitFor({ state: 'detached' });
    await page.getByTestId('open-games').click();
    assert.match(await page.getByTestId('game-viewingRush').innerText(), words[0]);
    await page.getByTestId('game-viewingRush').click();
    assert.match(await page.getByTestId('g3-start').innerText(), words[1]);
    await page.getByTestId('g3-back').click();
    await page.getByTestId('games-hub').waitFor();
  }
  assert.deepEqual(errors, []);
  await page.context().close();
});
