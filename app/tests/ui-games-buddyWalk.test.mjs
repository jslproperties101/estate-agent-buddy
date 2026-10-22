// v1buddychange014 screen tests for the Buddy Walk game (Chromium at phone width, 384 x 824): it opens from Home > Games,
// draws the 3D gallery, the arrow buttons / keys / drag move the agent, the gold info card appears in front of a listing,
// a visit counts, Finish shows the hub's result card, Exit goes back, the empty workspace gets a friendly message, the
// layout fits 384 px with bigger text, and the drawing stops when nothing moves (battery).
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
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.close(); });

/** A fresh phone. sample: true fills the app with the sample listings (the walk needs listings); false starts empty. */
async function phone({ sample = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 384, height: 824 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  // Counts animation frames asked for, so the battery test can see that drawing stops when nothing moves.
  await ctx.addInitScript(() => {
    window.__raf = 0;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = cb => { window.__raf++; return raf(cb); };
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(base); await page.waitForSelector('nav.grid');
  await page.getByTestId('start-choice').waitFor({ timeout: 5000 });
  await page.getByTestId(sample ? 'start-sample' : 'start-empty').click();
  await page.getByTestId('start-choice').waitFor({ state: 'detached' });
  return { page, errors };
}
async function openWalk(page) {
  await page.getByTestId('open-games').click();
  await page.getByTestId('game-buddyWalk').click();
  await page.getByTestId('game-frame-buddyWalk').waitFor();
}
async function startWalk(page, which = 'bw-start') {
  await openWalk(page);
  await page.getByTestId('bw-intro').waitFor();
  await page.getByTestId(which).click();
  await page.getByTestId('bw-canvas').waitFor();
}
const pos = async page => (await page.getByTestId('bw-root').getAttribute('data-pos')).split(',').map(Number);
/** Holds a control button down with the mouse for `ms` milliseconds (the same pointer events as a finger). */
async function hold(page, testId, ms) {
  const b = await page.getByTestId(testId).boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}
/** Keyboard taps on a control button (Enter): one small step or a 15-degree turn each. */
async function tap(page, testId, times) {
  await page.getByTestId(testId).focus();
  for (let i = 0; i < times; i++) await page.keyboard.press('Enter');
}
const noSideScroll = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth && document.body.scrollWidth <= window.innerWidth);

test('buddyWalk-U1 opens from Home > Games > Buddy Walk with sample data; intro, then the 3D gallery and the 60-second clock', async () => {
  const { page, errors } = await phone();
  await openWalk(page);
  const intro = page.getByTestId('bw-intro');
  await intro.waitFor();
  assert.match(await intro.innerText(), /Visit challenge/);
  await page.getByTestId('bw-start').click();
  await page.getByTestId('bw-canvas').waitFor();
  assert.match(await page.getByTestId('bw-time').innerText(), /60 s left|59 s left/);
  assert.match(await page.getByTestId('bw-visited').innerText(), /Visited 0 of \d+/);
  assert.match(await page.getByTestId('bw-canvas').getAttribute('aria-label'), /3D gallery of \d+ listings/);
  for (const k of ['fwd', 'back', 'left', 'right']) assert.ok(await page.getByTestId(`bw-${k}`).getAttribute('aria-label'), k);
  await page.waitForTimeout(1300);
  assert.match(await page.getByTestId('bw-time').innerText(), /5\d s left/, 'the clock counts down');
  assert.ok(await noSideScroll(page), 'no sideways scrolling at 384 px');
  assert.deepEqual(errors, []);
});

test('buddyWalk-U2 the canvas really draws the gallery (many non-blank pixels)', async () => {
  const { page, errors } = await phone();
  await startWalk(page);
  await page.waitForTimeout(200);
  const png = (await page.getByTestId('bw-canvas').screenshot()).toString('base64');
  const stats = await page.evaluate(async b64 => {
    const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const colours = new Set(); let bright = 0, gold = 0;
    for (let i = 0; i < d.length; i += 4) {
      colours.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
      if (d[i] + d[i + 1] + d[i + 2] > 90) bright++;
      if (d[i] > 150 && d[i + 1] > 120 && d[i + 2] < 140) gold++;
    }
    return { colours: colours.size, bright, gold, total: d.length / 4 };
  }, png);
  assert.ok(stats.colours > 30, `many colours (${stats.colours})`);
  assert.ok(stats.bright > stats.total * 0.03, `not a blank/black picture (${stats.bright} bright of ${stats.total})`);
  assert.ok(stats.gold > 50, `gold frames and trims visible (${stats.gold})`);
  assert.deepEqual(errors, []);
});

test('buddyWalk-U3 hold-to-move arrow buttons, arrow keys and dragging on the picture all move the agent', async () => {
  const { page, errors } = await phone();
  await startWalk(page, 'bw-free');
  const [x0, y0, a0] = await pos(page);
  await hold(page, 'bw-fwd', 350);
  await page.waitForTimeout(60);
  const [, y1, a1] = await pos(page);
  assert.ok(y1 > y0 + 0.3, `forward button walks forward (${y0} -> ${y1})`);
  assert.ok(Math.abs(a1 - a0) < 1e-6, 'walking does not turn');
  await hold(page, 'bw-left', 250);
  await page.waitForTimeout(60);
  const [, , a2] = await pos(page);
  assert.ok(a2 > a1 + 0.2, `left button turns left (${a1} -> ${a2})`);
  await hold(page, 'bw-right', 250);
  await page.waitForTimeout(60);
  const [, , a3] = await pos(page);
  assert.ok(a3 < a2 - 0.2, 'right button turns right');
  // Keyboard on the laptop website.
  await page.getByTestId('bw-canvas').focus();
  await page.keyboard.down('ArrowDown'); await page.waitForTimeout(250); await page.keyboard.up('ArrowDown');
  await page.waitForTimeout(60);
  const [, y4] = await pos(page);
  assert.ok(y4 < y1 - 0.2, `arrow-down walks back (${y1} -> ${y4})`);
  // Dragging sideways on the picture looks around.
  const c = await page.getByTestId('bw-canvas').boundingBox();
  await page.mouse.move(c.x + c.width * 0.7, c.y + c.height / 2);
  await page.mouse.down();
  await page.mouse.move(c.x + c.width * 0.3, c.y + c.height / 2, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(60);
  const [x5, , a5] = await pos(page);
  assert.ok(Math.abs(a5 - a3) > 0.5, `dragging turns the view (${a3} -> ${a5})`);
  assert.ok(x5 >= 1.25 && x5 <= 2.75 && Math.abs(x5 - x0) < 1, 'still inside the corridor');
  assert.deepEqual(errors, []);
});

test('buddyWalk-U4 facing a listing shows the gold info card; staying counts a visit; Finish shows the hub result card', async () => {
  const { page, errors } = await phone();
  await startWalk(page);
  assert.equal(await page.getByTestId('bw-hint').count(), 1, 'no card before reaching a listing');
  await tap(page, 'bw-fwd', 2);
  await tap(page, 'bw-left', 6);
  const card = page.getByTestId('bw-info');
  await page.getByTestId('bw-info-title').waitFor({ timeout: 3000 });
  const text = await card.innerText();
  assert.match(text, /Listing 1 of \d+/);
  assert.match(await page.getByTestId('bw-info-price').innerText(), /RM [\d,]+|Price Not Set/i);
  assert.match(text, /Sample/, 'sample listings are marked');
  assert.ok((await page.getByTestId('bw-info-title').innerText()).length > 3);
  assert.match(await page.getByTestId('bw-canvas').getAttribute('aria-label'), /In front of you:/);
  await page.getByTestId('bw-info-visited').waitFor({ timeout: 3000 });
  assert.match(await page.getByTestId('bw-visited').innerText(), /Visited 1 of \d+/);
  const n = Number((await page.getByTestId('bw-visited').innerText()).match(/of (\d+)/)[1]);
  await page.getByTestId('bw-finish').click();
  await page.getByTestId('game-result').waitFor();
  assert.match(await page.getByTestId('game-result-score').innerText(), new RegExp(`You scored 1 out of ${n}`));
  // The round was saved once by the hub.
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('eab.games.v1')));
  assert.equal(saved.games.buddyWalk.plays, 1);
  assert.equal(saved.games.buddyWalk.best, 1);
  assert.deepEqual(errors, []);
});

test('buddyWalk-U5 Exit goes back to the Games list; the empty workspace shows a friendly message in 3 languages', async () => {
  const { page, errors } = await phone();
  await startWalk(page);
  await page.getByTestId('bw-exit').click();
  await page.getByTestId('games-hub').waitFor();
  const saved = await page.evaluate(() => localStorage.getItem('eab.games.v1'));
  assert.ok(!saved || !JSON.parse(saved).games.buddyWalk, 'Exit does not record a round');
  assert.deepEqual(errors, []);

  const empty = await phone({ sample: false });
  for (const [code, word] of [['en', /No listings to walk through yet/], ['bm', /Belum ada senarai/], ['zh', /还没有可浏览的房源/]]) {
    if (code !== 'en') {
      await empty.page.getByTestId('lang-btn').click();
      await empty.page.locator(`.lang-menu button[data-lang="${code}"]`).click();
      await empty.page.getByTestId('lang-menu').waitFor({ state: 'detached' });
    }
    if (code === 'en') await openWalk(empty.page);
    assert.match(await empty.page.getByTestId('bw-empty').innerText(), word, code);
  }
  await empty.page.getByTestId('bw-exit').click();
  await empty.page.getByTestId('games-hub').waitFor();
  assert.deepEqual(empty.errors, []);
});

test('buddyWalk-U6 Bahasa Melayu with bigger text at 384 px: nothing overlaps, nothing sticks out, buttons stay big', async () => {
  const { page, errors } = await phone();
  await page.getByTestId('lang-btn').click();
  await page.locator('.lang-menu button[data-lang="bm"]').click();
  await page.getByTestId('lang-menu').waitFor({ state: 'detached' });
  await openWalk(page);
  await page.addStyleTag({ content: '.bw-root { --bw-fs: 1.4 !important; }' });
  await page.getByTestId('bw-start').click();
  await page.getByTestId('bw-canvas').waitFor();
  await tap(page, 'bw-fwd', 2);
  await tap(page, 'bw-left', 6);
  await page.getByTestId('bw-info-title').waitFor({ timeout: 3000 });
  const report = await page.evaluate(() => {
    const box = el => el.getBoundingClientRect();
    const hits = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
    const hud = [...document.querySelectorAll('.bw-hud > .bw-stat, .bw-hud-btns > .btn')].map(box);
    const overlaps = [];
    for (let i = 0; i < hud.length; i++) for (let j = i + 1; j < hud.length; j++) if (hits(hud[i], hud[j])) overlaps.push([i, j]);
    const parts = ['.bw-hud', '.bw-view', '.bw-pad', '.bw-info, [data-testid="bw-info"]', '.bw-help'].map(s => document.querySelector(s)).filter(Boolean).map(box);
    for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) if (hits(parts[i], parts[j])) overlaps.push(['part', i, j]);
    const outside = [...document.querySelectorAll('.bw-root *')].filter(el => { const r = box(el); return r.width > 0 && (r.left < -0.5 || r.right > window.innerWidth + 0.5); }).map(el => el.className || el.tagName);
    const clipped = [...document.querySelectorAll('.bw-root p, .bw-root dd, .bw-root dt, .bw-stat, .bw-chip, .bw-root .btn')].filter(el => el.scrollWidth > el.clientWidth + 1).map(el => el.textContent);
    const keys = [...document.querySelectorAll('.bw-key')].map(box).map(r => Math.min(r.width, r.height));
    return { overlaps, outside, clipped, keys, time: document.querySelector('[data-testid="bw-time"]').textContent };
  });
  assert.match(report.time, /saat lagi/);
  assert.deepEqual(report.overlaps, [], 'no overlapping text or controls');
  assert.deepEqual(report.outside, [], 'nothing wider than the phone');
  assert.deepEqual(report.clipped, [], 'no text cut off');
  assert.ok(report.keys.every(s => s >= 44), `arrow buttons at least 44 px (${report.keys})`);
  assert.match(await page.getByTestId('bw-info').innerText(), /Senarai 1 daripada/);
  assert.ok(await noSideScroll(page));
  assert.deepEqual(errors, []);
});

test('buddyWalk-U7 battery: drawing stops when nothing moves, restarts on input, and ends when the game closes', async () => {
  const { page, errors } = await phone();
  await startWalk(page, 'bw-free');
  await page.waitForTimeout(400);
  const idle0 = await page.evaluate(() => window.__raf);
  await page.waitForTimeout(1000);
  const idle1 = await page.evaluate(() => window.__raf);
  assert.ok(idle1 - idle0 <= 3, `idle: almost no frames (${idle1 - idle0} in 1 s)`);
  await hold(page, 'bw-fwd', 500);
  const moving = await page.evaluate(() => window.__raf);
  assert.ok(moving - idle1 >= 10, `walking: frames are drawn (${moving - idle1})`);
  await page.getByTestId('bw-exit').click();
  await page.getByTestId('games-hub').waitFor();
  await page.waitForTimeout(300);
  const after0 = await page.evaluate(() => window.__raf);
  await page.waitForTimeout(800);
  const after1 = await page.evaluate(() => window.__raf);
  assert.ok(after1 - after0 <= 3, `after leaving: no more frames (${after1 - after0})`);
  assert.deepEqual(errors, []);
});
