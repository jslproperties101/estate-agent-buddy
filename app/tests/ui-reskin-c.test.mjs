// EA AI Buddy reskin Phase C screen tests (Chromium, phone width): Track My Sales, AI Assistant, Calendar & To-Do,
// Property Calculator (Market News: ui-news-paywall.test.mjs NP11). Run after `node scripts/build.mjs --no-env`.
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

async function phone() {
  const ctx = await browser.newContext({ viewport: { width: 384, height: 824 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(base); await page.waitForSelector('nav.grid');
  await page.getByTestId('start-choice').waitFor({ timeout: 5000 });
  await page.getByTestId('start-sample').click();
  await page.getByTestId('start-choice').waitFor({ state: 'detached' });
  return { page, ctx, errors };
}
const openTile = (page, key) => page.locator(`nav.grid > button[data-key="${key}"]`).first().click();
/** No sideways overflow, no text under 14 px, no button under 44 px on the open screen (owner's rules). */
const readable = page => page.evaluate(() => {
  const small = [], short = [];
  for (const el of document.querySelectorAll('main *')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || el.closest('svg, .card-foot, .sc-gear')) continue;
    const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (own && parseFloat(cs.fontSize) < 14) small.push(`${el.tagName} ${el.textContent.trim().slice(0, 20)} ${cs.fontSize}`);
    if ((el.tagName === 'BUTTON' || (el.tagName === 'A' && el.classList.contains('btn'))) && el.getBoundingClientRect().height < 44 && !el.classList.contains('link-btn') && el.offsetParent) short.push(`${el.textContent.trim().slice(0, 20)} ${Math.round(el.getBoundingClientRect().height)}`);
  }
  return { small, short, wide: document.documentElement.scrollWidth > document.documentElement.clientWidth };
});

test('EC1 Track My Sales (mockup 4): gold year card with one bar per month so far, four tiles, readable; tiles open their lists', async () => {
  const { page, ctx, errors } = await phone();
  await openTile(page, 'sales');
  await page.getByTestId('track-sales').waitFor();
  const months = new Date().getMonth() + 1;
  assert.equal(await page.locator('[data-testid="sales-chart"] .ts-bar').count(), months);
  assert.match(await page.getByTestId('sales-chart').getAttribute('aria-label'), new RegExp(String(new Date().getFullYear())));
  for (const id of ['sales-year', 'sales-month', 'sales-pending', 'sales-received', 'sales-closed', 'sales-progress', 'sales-leads', 'sales-viewings']) assert.equal(await page.getByTestId(id).count(), 1, id);
  assert.match(await page.getByTestId('sales-year').innerText(), /^RM/);
  const g = await page.evaluate(() => ({ bg: getComputedStyle(document.querySelector('.ts-bar')).backgroundImage, hero: getComputedStyle(document.querySelector('.ts-hero')).backgroundImage }));
  assert.match(g.bg, /gradient/); assert.match(g.hero, /gradient/);
  const r = await readable(page);
  assert.deepEqual(r.small, []); assert.deepEqual(r.short, []); assert.equal(r.wide, false);
  await page.getByTestId('sales-leads').click();
  await page.locator('[role="tab"][aria-selected="true"]').first().waitFor();
  assert.match(await page.locator('[role="tab"][aria-selected="true"]').first().innerText(), /Inquir/i);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('EC2 AI Assistant (mockup 5): the robot beside "Your Personal Real Estate Assistant"; one gold row per kind of command fills the box', async () => {
  const { page, ctx, errors } = await phone();
  await openTile(page, 'voice');
  await page.getByTestId('cmd-brand').waitFor();
  const g = await page.evaluate(() => {
    const robot = document.querySelector('.cmd-hero-robot').getBoundingClientRect(), title = document.querySelector('.cmd-hero-title').getBoundingClientRect();
    return { side: robot.right <= title.left + 1 && Math.abs((robot.top + robot.bottom) / 2 - (title.top + title.bottom) / 2) < 50 };
  });
  assert.ok(g.side, 'robot on the left of the title');
  assert.match(await page.getByTestId('cmd-brand').innerText(), /Your Personal Real Estate Assistant/);
  const rows = page.getByTestId('cmd-suggest-row');
  assert.ok((await rows.count()) >= 6);
  assert.match(await rows.first().innerText(), /Add a new property/);
  const r = await readable(page);
  assert.deepEqual(r.small, []); assert.deepEqual(r.short, []); assert.equal(r.wide, false);
  await rows.first().click();
  assert.match(await page.locator('[data-testid="voice-cmd"] textarea').inputValue(), /^Create a new terrace house/);
  assert.equal(await page.getByTestId('cmd-suggest').count(), 0, 'the rows step aside once there is text');
  assert.equal(await page.getByTestId('cmd-process').isDisabled(), false);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('EC3 Calendar (mockup 6): gold Month / Week switch, the chosen day a gold circle without boxes, filter pills, the day on a time line', async () => {
  const { page, ctx, errors } = await phone();
  await openTile(page, 'agenda');
  await page.getByRole('button', { name: 'Calendar', exact: true }).click();
  await page.getByTestId('calendar').waitFor();
  const g = await page.evaluate(() => {
    const sel = document.querySelector('.cal-day.sel'); const num = sel.querySelector('span');
    const other = document.querySelector('.cal-day:not(.sel)');
    const cs = getComputedStyle(num); const r = num.getBoundingClientRect();
    return { circle: /gradient/.test(cs.backgroundImage) && parseFloat(cs.borderRadius) >= r.height / 2 - 1, cellBox: getComputedStyle(other).borderTopColor,
      seg: getComputedStyle(document.querySelector('.calendar-c .seg button[aria-pressed="true"]')).backgroundImage,
      pills: getComputedStyle(document.querySelector('.calendar-c .tabs.chip-tabs')).flexWrap, line: !!document.querySelector('ul.cal-tl') };
  });
  assert.ok(g.circle, 'gold circle'); assert.match(g.cellBox, /rgba\(0, 0, 0, 0\)|transparent/); assert.match(g.seg, /gradient/);
  assert.equal(g.pills, 'wrap', 'pills wrap, never scroll sideways'); assert.ok(g.line);
  const r = await readable(page);
  assert.deepEqual(r.small, []); assert.equal(r.wide, false);
  await page.locator('.cal-day:not(.other)').nth(3).click();
  assert.equal(await page.locator('.cal-day.sel').count(), 1);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('EC4 Property Calculator (mockup 9): section pills, label beside box, the monthly instalment in a gold card that follows the inputs', async () => {
  const { page, ctx, errors } = await phone();
  await openTile(page, 'calculator');
  await page.getByTestId('calculator').waitFor();
  await page.locator('[data-field="price"]').fill('500000');
  await page.locator('[data-field="downPct"]').fill('10');
  await page.locator('[data-field="tenure"]').fill('35');
  await page.locator('[data-field="rate"]').fill('4.5');
  const hero = page.getByTestId('calc-hero-monthly');
  await hero.waitFor();
  assert.equal(await hero.innerText(), await page.getByTestId('out-monthly').innerText(), 'same figure as the result list');
  assert.equal(await hero.innerText(), 'RM 2,129.66', 'RM 450,000 over 35 years at 4.5% a year');
  const g = await page.evaluate(() => {
    const lab = document.querySelector('.calc > .card > label.ff'); const box = lab.querySelector('input, .money-wrap, select, button');
    const a = lab.firstChild && lab.getBoundingClientRect(); const b = box.getBoundingClientRect();
    return { beside: b.left > a.left + 60, hero: getComputedStyle(document.querySelector('.calc-hero')).backgroundImage, pills: getComputedStyle(document.querySelector('.calc .tabs.chip-tabs')).flexWrap };
  });
  assert.ok(g.beside, 'box to the right of its label'); assert.match(g.hero, /gradient/); assert.equal(g.pills, 'wrap');
  const r = await readable(page);
  assert.deepEqual(r.small, []); assert.equal(r.wide, false);
  assert.deepEqual(errors, []);
  await ctx.close();
});
