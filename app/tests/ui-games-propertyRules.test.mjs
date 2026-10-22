// v1buddychange013 screen tests for the Property Rules Quiz game.
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

async function openQuiz(page) {
  await page.getByTestId('open-games').click();
  await page.getByTestId('game-propertyRules').click();
  await page.getByTestId('game-frame-propertyRules').waitFor();
  await page.getByTestId('prq-question').waitFor();
}
async function noSideScroll(page, label) {
  const w = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth, body: document.body.scrollWidth }));
  assert.ok(w.doc <= w.win + 1 && w.body <= w.win + 1, `${label}: horizontal scroll ${JSON.stringify(w)}`);
}
async function playAll(page, pickFor, from = 0) {
  for (let i = from; i < 10; i++) {
    await page.getByTestId('prq-question').waitFor();
    assert.match(await page.getByTestId('prq-count').innerText(), new RegExp(`${i + 1}`));
    await noSideScroll(page, `question ${i + 1}`);
    await page.getByTestId(`prq-opt-${pickFor(i)}`).click();
    await page.getByTestId('prq-feedback').waitFor();
    await noSideScroll(page, `feedback ${i + 1}`);
    await page.getByTestId('prq-next').click();
  }
}
async function setLang(page, code) {
  await page.getByTestId('lang-btn').click();
  await page.locator(`.lang-menu button[data-lang="${code}"]`).click();
  await page.getByTestId('lang-menu').waitFor({ state: 'detached' });
}

test('propertyRules-U0 the game opens from the Games list', async () => {
  const { page, errors } = await phone();
  await openQuiz(page);
  assert.match(await page.getByTestId('prq-note').innerText(), /For practice only/);
  assert.deepEqual(errors, []);
});

test('propertyRules-U1 answer all 10 questions and the hub result card appears', async () => {
  const { page, errors } = await phone();
  await openQuiz(page);
  // first answer: feedback shows, options lock
  await page.getByTestId('prq-opt-0').click();
  await page.getByTestId('prq-feedback').waitFor();
  assert.equal(await page.getByTestId('prq-opt-1').isDisabled(), true);
  assert.equal(await page.getByTestId('prq-feedback').innerText().then(t => t.length > 20), true);
  await page.getByTestId('prq-next').click();
  await playAll(page, i => (i + 1) % 4, 1);
  await page.getByTestId('game-result').waitFor();
  assert.match(await page.getByTestId('game-result-score').innerText(), /10/);
  assert.deepEqual(errors, []);
});

test('propertyRules-U2 a full round of 10 shows the result card once', async () => {
  const { page, errors } = await phone();
  await openQuiz(page);
  await playAll(page, i => i % 4);
  await page.getByTestId('game-result').waitFor();
  assert.equal(await page.getByTestId('game-result').count(), 1);
  assert.match(await page.getByTestId('game-result-score').innerText(), /10/);
  await noSideScroll(page, 'result');
  assert.deepEqual(errors, []);
});

test('propertyRules-U3 Exit goes back to the Games list', async () => {
  const { page, errors } = await phone();
  await openQuiz(page);
  await page.getByTestId('prq-exit').click();
  await page.getByTestId('games-hub').waitFor();
  assert.deepEqual(errors, []);
});

test('propertyRules-U4 Chinese text shows when the language is ZH, and it fits with large fonts', async () => {
  const { page, errors } = await phone();
  await setLang(page, 'zh');
  await openQuiz(page);
  assert.match(await page.getByTestId('prq-question').innerText(), /[一-鿿]/);
  assert.match(await page.getByTestId('prq-note').innerText(), /仅供练习/);
  await page.addStyleTag({ content: 'html{font-size:150% !important}' });
  await playAll(page, i => (i * 3) % 4);
  await page.getByTestId('game-result').waitFor();
  assert.deepEqual(errors, []);
});

test('propertyRules-U5 Bahasa Melayu text and large fonts fit at 384px', async () => {
  const { page, errors } = await phone();
  await setLang(page, 'bm');
  await openQuiz(page);
  assert.match(await page.getByTestId('prq-note').innerText(), /Untuk latihan sahaja/);
  await page.addStyleTag({ content: 'html{font-size:150% !important}' });
  await playAll(page, i => (i + 2) % 4);
  await page.getByTestId('game-result').waitFor();
  assert.deepEqual(errors, []);
});
