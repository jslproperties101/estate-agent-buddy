// EA AI Buddy reskin Phase C screen tests (Chromium, phone width): Track My Sales, Calculator, Calendar & To-Do, Market News, AI Assistant.
// Run after `node scripts/build.mjs --no-env`. Screenshots go to .shots-c/ (git-ignored by the caller if wanted).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { chromium } from 'playwright';

const DIST = new URL('../dist/', import.meta.url).pathname;
const SHOTS = process.env.EAB_SHOTS_C;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.map': 'application/json' };
let server, browser, base;
before(async () => {
  if (SHOTS) await mkdir(SHOTS, { recursive: true });
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
  const ctx = await browser.newContext({ viewport: { width: 384, height: 824 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(base); await page.waitForSelector('nav.grid');
  await page.getByTestId('start-choice').waitFor({ timeout: 5000 });
  await page.getByTestId('start-sample').click();
  await page.getByTestId('start-choice').waitFor({ state: 'detached' });
  return { page, errors };
}
const shot = (page, n) => SHOTS ? page.screenshot({ path: `${SHOTS}/${n}.png` }) : null;
const tab = (page, i) => page.getByTestId('tab-bar').locator('.tab').nth(i).click();
/** No sideways overflow, no text under 14 px, no button under 44 px on the open screen. */
const readable = page => page.evaluate(() => {
  const small = [], short = [];
  for (const el of document.querySelectorAll('main *')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || el.closest('svg, .card-foot, .sc-gear')) continue; // the card footer (12 px) and the gear (44 px touch area) are earlier approved designs
    const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (own && parseFloat(cs.fontSize) < 14) small.push(`${el.tagName} ${el.textContent.trim().slice(0, 20)} ${cs.fontSize}`);
    if ((el.tagName === 'BUTTON' || (el.tagName === 'A' && el.classList.contains('btn'))) && el.getBoundingClientRect().height < 44 && !el.classList.contains('link-btn')) short.push(`${el.textContent.trim().slice(0, 20)} ${Math.round(el.getBoundingClientRect().height)}`);
  }
  return { small, short, wide: document.documentElement.scrollWidth > document.documentElement.clientWidth };
});


const open = (page, key) => page.locator(`nav.grid > button[data-key="${key}"]`).first().click();
const clean = async (page, errors, name) => {
  assert.deepEqual(await readable(page), { small: [], short: [], wide: false });
  await shot(page, name);
  assert.deepEqual(errors, []);
  await page.context().close();
};

test('EC1 Track My Sales: four number tiles, the first one wide', async () => {
  const { page, errors } = await phone();
  await open(page, 'sales');
  await page.getByTestId('sales-totals').waitFor();
  assert.equal(await page.locator('.kpi-grid .kpi').count(), 4);
  const [a, b] = await page.locator('.kpi-grid .kpi').evaluateAll(els => els.map(e => e.getBoundingClientRect().width));
  assert.ok(a > b * 1.7, `hero tile wider (${a} vs ${b})`);
  await clean(page, errors, 'sales');
});

test('EC2 Calculator opens and shows its result card', async () => {
  const { page, errors } = await phone();
  await open(page, 'calculator');
  await page.getByTestId('calculator').waitFor();
  await clean(page, errors, 'calculator');
});

test('EC3 Calendar & To-Do opens with its month grid', async () => {
  const { page, errors } = await phone();
  await open(page, 'agenda');
  await page.getByTestId('agenda-calendar').click();
  await page.locator('.cal-grid').first().waitFor();
  assert.ok((await page.locator('.cal-day').count()) >= 28);
  await clean(page, errors, 'calendar');
});

test('EC4 Market News opens', async () => {
  const { page, errors } = await phone();
  await open(page, 'market');
  await page.getByTestId('market-news').waitFor();
  await clean(page, errors, 'news');
});

test('EC5 AI Assistant opens with its command box', async () => {
  const { page, errors } = await phone();
  await open(page, 'voice');
  await page.getByTestId('voice-command').waitFor();
  await clean(page, errors, 'assistant');
});
