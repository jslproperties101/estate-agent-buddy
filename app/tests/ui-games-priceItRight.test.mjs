// v1buddychange013 screen tests (Chromium at phone width) for the Price It Right game: play a whole round, the Games result card,
// Bahasa Melayu / Chinese, large text, My listings and Exit.
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

async function phone({ sample = false, lang } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 384, height: 824 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(base); await page.waitForSelector('nav.grid');
  await page.getByTestId('start-choice').waitFor({ timeout: 5000 });
  await page.getByTestId(sample ? 'start-sample' : 'start-empty').click();
  await page.getByTestId('start-choice').waitFor({ state: 'detached' });
  if (lang && lang !== 'en') {
    await page.getByTestId('lang-btn').click();
    await page.locator(`.lang-menu button[data-lang="${lang}"]`).click();
    await page.getByTestId('lang-menu').waitFor({ state: 'detached' });
  }
  return { page, errors, ctx };
}
async function openGame(page) {
  await page.getByTestId('open-games').click();
  await page.getByTestId('game-priceItRight').click();
  await page.getByTestId('game-frame-priceItRight').waitFor();
  await page.getByTestId('pir-menu').waitFor();
}
/** Nothing in the game sticks out past the phone edges, and the page itself does not scroll sideways. */
async function fits(page, label) {
  const r = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth, body: document.body.scrollWidth, vw: window.innerWidth,
    out: [...document.querySelectorAll('.pir *')].filter(e => { const b = e.getBoundingClientRect(); return b.width > 0 && (b.right > window.innerWidth + 0.5 || b.left < -0.5); }).map(e => String(e.className?.baseVal ?? e.className ?? e.tagName)).slice(0, 5),
  }));
  assert.ok(r.doc <= r.vw && r.body <= r.vw, `${label}: no horizontal scroll (doc ${r.doc}, body ${r.body}, viewport ${r.vw})`);
  assert.deepEqual(r.out, [], `${label}: nothing past the screen edge`);
}
/** The four options are stacked without overlapping, and each option's words stay inside its own button. */
async function optionsDoNotOverlap(page, label) {
  const g = await page.evaluate(() => [0, 1, 2, 3].map(k => {
    const b = document.querySelector(`[data-testid="pir-opt-${k}"]`); const r = b.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, kids: [...b.children].map(c => { const q = c.getBoundingClientRect(); return { l: q.left, r: q.right, t: q.top, b: q.bottom }; }) };
  }));
  for (let k = 0; k < 4; k++) {
    if (k) assert.ok(g[k].top >= g[k - 1].bottom - 0.5, `${label}: option ${k} below option ${k - 1}`);
    for (const c of g[k].kids) assert.ok(c.l >= g[k].left - 0.5 && c.r <= g[k].right + 0.5 && c.t >= g[k].top - 0.5 && c.b <= g[k].bottom + 0.5, `${label}: option ${k} text inside its button`);
  }
}
/** Answers every question by clicking; returns the number of right answers seen on screen and the texts seen. */
async function playRound(page, { pick = k => k % 4, label = 'round', onQuestion } = {}) {
  let right = 0, seen = [];
  const total = Number((await page.getByTestId('pir-progress-text').innerText()).match(/(\d+)\D*$/)[1]);
  for (let q = 0; q < total; q++) {
    await page.getByTestId('pir-card').waitFor();
    assert.equal(await page.getByTestId('pir-feedback').count(), 0, `${label} q${q + 1}: no feedback before answering`);
    assert.equal(await page.locator('[data-testid^="pir-opt-"]').count(), 4);
    const texts = await page.locator('[data-testid^="pir-opt-"] .pir-amt').allInnerTexts();
    assert.equal(new Set(texts).size, 4, `${label} q${q + 1}: four different prices (${texts})`);
    seen.push({ question: await page.getByTestId('pir-question').innerText(), card: await page.getByTestId('pir-card').innerText(), texts });
    await fits(page, `${label} q${q + 1}`); await optionsDoNotOverlap(page, `${label} q${q + 1}`);
    if (onQuestion) await onQuestion(q);
    await page.getByTestId(`pir-opt-${pick(q)}`).click();
    const fb = page.getByTestId('pir-feedback');
    await fb.waitFor();
    const result = await fb.getAttribute('data-result');
    if (result === 'correct') right++;
    assert.equal(await page.locator('[data-testid^="pir-opt-"][data-state="right"]').count(), 1, 'the right price is marked');
    assert.equal(await page.getByTestId(`pir-opt-${pick(q)}`).getAttribute('data-state'), result === 'correct' ? 'right' : 'wrong');
    // the right price is shown in words, and it is one of the four options
    const shown = await page.getByTestId('pir-answer').innerText();
    assert.ok(texts.some(t => shown.includes(t)), `${label} q${q + 1}: the feedback names the right price (${shown} / ${texts})`);
    // answering twice does nothing
    await page.getByTestId(`pir-opt-${(pick(q) + 1) % 4}`).click({ force: true });
    assert.equal(await page.getByTestId('pir-feedback').getAttribute('data-result'), result, 'a second tap does not change the answer');
    assert.match(await page.getByTestId('pir-score').innerText(), new RegExp(`\\b${right}\\b`));
    await fits(page, `${label} q${q + 1} answered`);
    await page.getByTestId('pir-next').click();
  }
  return { right, seen, total };
}

test('priceItRight-U0 the game opens from the Games list and shows the mode choice with the practice-figures label', async () => {
  const { page, errors, ctx } = await phone();
  await openGame(page);
  assert.match(await page.getByTestId('pir-disclaimer').innerText(), /Practice figures - illustrative, not valuations/);
  assert.match(await page.getByTestId('pir-menu').innerText(), /Price It Right/i);
  assert.equal(await page.getByTestId('pir-mode-bank').getAttribute('aria-disabled'), null);
  await fits(page, 'menu');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('priceItRight-U1 Home > Games > Price It Right: play a full round, the Games result card shows the same score', async () => {
  const { page, errors, ctx } = await phone();
  await openGame(page);
  await page.getByTestId('pir-mode-bank').click();
  const first = await page.getByTestId('pir-progress-text').innerText();
  assert.match(first, /Question 1 of 8/);
  assert.match(await page.getByTestId('pir-disclaimer').innerText(), /Practice figures/);
  assert.equal(await page.getByTestId('game-result').count(), 0, 'no result card mid-round');
  const { right, seen, total } = await playRound(page, { pick: k => (k * 3 + 1) % 4, label: 'bank' });
  assert.equal(total, 8);
  assert.ok(seen.some(s => /monthly rent/.test(s.question)) && seen.some(s => /asking price/.test(s.question)), 'sale and rent questions both appear');
  assert.ok(seen.every(s => /RM [\d,]+/.test(s.texts[0])), 'prices are shown in RM');
  await page.getByTestId('game-result').waitFor();
  assert.equal(await page.getByTestId('game-result').count(), 1);
  const text = await page.getByTestId('game-result-score').innerText();
  assert.equal(text, `You scored ${right} out of 8`);
  assert.ok(right >= 0 && right <= 8);
  assert.equal(await page.getByTestId('game-frame-priceItRight').getByTestId('pir-root').count(), 0, 'the game is gone behind the result card');
  // the score was saved once: back in the Games list the game shows 1 play
  await page.getByTestId('game-back').click();
  await page.getByTestId('games-hub').waitFor();
  assert.match(await page.getByTestId('game-priceItRight').innerText(), new RegExp(`Best ${right}/8 · 1 play\\b`));
  await fits(page, 'hub');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('priceItRight-U2 Play again starts a fresh round (new questions) and a second round is saved as 2 plays', async () => {
  const { page, errors, ctx } = await phone();
  await openGame(page);
  await page.getByTestId('pir-mode-bank').click();
  const r1 = await playRound(page, { label: 'r1' });
  await page.getByTestId('game-result').waitFor();
  await page.getByTestId('game-again').click();
  await page.getByTestId('pir-menu').waitFor();
  await page.getByTestId('pir-mode-bank').click();
  const r2 = await playRound(page, { label: 'r2' });
  await page.getByTestId('game-result').waitFor();
  assert.notDeepEqual(r1.seen.map(s => s.card), r2.seen.map(s => s.card), 'a new round is a different round');
  await page.getByTestId('game-back').click();
  assert.match(await page.getByTestId('game-priceItRight').innerText(), /2 plays/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('priceItRight-U3 Exit during a round goes back to the Games list with no result and no score saved', async () => {
  const { page, errors, ctx } = await phone();
  await openGame(page);
  await page.getByTestId('pir-mode-bank').click();
  await page.getByTestId('pir-opt-0').click();
  await page.getByTestId('pir-exit').click();
  await page.getByTestId('games-hub').waitFor();
  assert.equal(await page.getByTestId('game-result').count(), 0);
  assert.match(await page.getByTestId('game-priceItRight').innerText(), /Not played yet/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('priceItRight-U4 My listings is shown as unavailable with a reason when there are fewer than 4 priced listings', async () => {
  const { page, errors, ctx } = await phone();
  await openGame(page);
  const mine = page.getByTestId('pir-mode-mine');
  assert.equal(await mine.getAttribute('aria-disabled'), 'true');
  assert.match(await page.getByTestId('pir-mine-locked').innerText(), /at least 4 listings with an asking price or rent\. You have 0\./);
  await mine.click({ force: true });
  assert.equal(await page.getByTestId('pir-menu').count(), 1, 'tapping it does not start a round');
  assert.equal(await page.getByTestId('pir-card').count(), 0);
  await fits(page, 'locked menu');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('priceItRight-U5 My listings (with the sample listings): a round from the agent\'s own listings, ending on the Games result card', async () => {
  const { page, errors, ctx } = await phone({ sample: true });
  await openGame(page);
  assert.equal(await page.getByTestId('pir-mode-mine').getAttribute('aria-disabled'), 'false');
  assert.equal(await page.getByTestId('pir-mine-locked').count(), 0);
  await page.getByTestId('pir-mode-mine').click();
  assert.match(await page.getByTestId('pir-disclaimer').innerText(), /Practice only, not valuations/);
  const total = Number((await page.getByTestId('pir-progress-text').innerText()).match(/of (\d+)/)[1]);
  assert.ok(total >= 4 && total <= 8, `round length ${total}`);
  const { right } = await playRound(page, { label: 'mine' });
  await page.getByTestId('game-result').waitFor();
  assert.equal(await page.getByTestId('game-result-score').innerText(), `You scored ${right} out of ${total}`);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('priceItRight-U6 Bahasa Melayu: the menu, questions, rent suffix and feedback are in Malay, and nothing overlaps', async () => {
  const { page, errors, ctx } = await phone({ lang: 'bm' });
  await openGame(page);
  const menu = await page.getByTestId('pir-menu').innerText();
  assert.match(menu, /Teka Harga/i);
  assert.match(menu, /Angka latihan - sekadar contoh, bukan penilaian/);
  assert.match(menu, /Senario latihan/); assert.match(menu, /Senarai saya/);
  assert.match(menu, /Perlu sekurang-kurangnya 4 senarai/);
  assert.doesNotMatch(menu, /Practice figures/);
  await fits(page, 'bm menu');
  await page.getByTestId('pir-mode-bank').click();
  assert.match(await page.getByTestId('pir-progress-text').innerText(), /Soalan 1 daripada 8/);
  let rentSeen = false;
  const { seen } = await playRound(page, { label: 'bm', onQuestion: async () => { rentSeen ||= /\/bulan/.test(await page.getByTestId('pir-opt-0').innerText()); } });
  for (const s of seen) assert.match(s.question, /Berapakah (harga mohon|sewa sebulan)\?/);
  assert.ok(rentSeen, 'rent options end with /bulan');
  assert.ok(seen.some(s => /Pegangan bebas|Pajakan/.test(s.card)), 'tenure in Malay');
  assert.ok(seen.every(s => !/Freehold|Leasehold|bedroom/.test(s.card)), 'no English words on the card');
  await page.getByTestId('game-result').waitFor();
  assert.match(await page.getByTestId('game-result-score').innerText(), /Markah anda \d daripada 8/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('priceItRight-U7 Chinese: the menu and questions are in Chinese', async () => {
  const { page, errors, ctx } = await phone({ lang: 'zh' });
  await openGame(page);
  const menu = await page.getByTestId('pir-menu').innerText();
  assert.match(menu, /估价达人/); assert.match(menu, /练习数字 - 仅供示例，并非估价/); assert.match(menu, /练习场景/); assert.match(menu, /我的房源/);
  await page.getByTestId('pir-mode-bank').click();
  assert.match(await page.getByTestId('pir-progress-text').innerText(), /第 1 \/ 8 题/);
  const { seen } = await playRound(page, { label: 'zh' });
  for (const s of seen) assert.match(s.question, /叫价是多少|每月租金是多少/);
  assert.ok(seen.some(s => /\/月/.test(s.texts[0])), 'rent options end with /月');
  await page.getByTestId('game-result').waitFor();
  assert.match(await page.getByTestId('game-result-score').innerText(), /得分 \d+ \/ 8/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('priceItRight-U8 large text (zoom 1.4) in Malay and Chinese: no sideways scroll and no overlap on the menu or a question', async () => {
  for (const lang of ['bm', 'zh']) {
    const { page, errors, ctx } = await phone({ lang });
    await openGame(page);
    await page.evaluate(() => { document.body.style.zoom = '1.4'; });
    await fits(page, `${lang} menu large`);
    await page.getByTestId('pir-mode-bank').click();
    for (let q = 0; q < 3; q++) {
      await page.getByTestId('pir-card').waitFor();
      await fits(page, `${lang} q${q + 1} large`); await optionsDoNotOverlap(page, `${lang} q${q + 1} large`);
      await page.getByTestId('pir-opt-1').click();
      await page.getByTestId('pir-feedback').waitFor();
      await fits(page, `${lang} q${q + 1} answered large`); await optionsDoNotOverlap(page, `${lang} q${q + 1} answered large`);
      await page.getByTestId('pir-next').click();
    }
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});

test('priceItRight-U9 screenshots for the owner (not asserted): menu, question, answered', async () => {
  const { page, errors, ctx } = await phone();
  await openGame(page);
  const dir = process.env.PIR_SHOTS;
  if (dir) await page.screenshot({ path: join(dir, 'pir-menu.png') });
  await page.getByTestId('pir-mode-bank').click();
  await page.getByTestId('pir-card').waitFor();
  if (dir) await page.screenshot({ path: join(dir, 'pir-question.png') });
  await page.getByTestId('pir-opt-2').click();
  await page.getByTestId('pir-feedback').waitFor();
  if (dir) await page.screenshot({ path: join(dir, 'pir-answered.png') });
  assert.deepEqual(errors, []);
  await ctx.close();
});
