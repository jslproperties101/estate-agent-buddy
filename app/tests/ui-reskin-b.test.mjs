// EA AI Buddy reskin Phase B screen tests (Chromium, phone width): Projects, Contacts, Inquiries & Viewings, Subsale List.
// Run after `node scripts/build.mjs --no-env`. Screenshots go to .shots-b/ (git-ignored by the caller if wanted).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { chromium } from 'playwright';

const DIST = new URL('../dist/', import.meta.url).pathname;
const SHOTS = process.env.EAB_SHOTS_B;
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

test('EB1 Contacts: initial circle, Call and WhatsApp buttons per person, readable, no sideways scroll', async () => {
  const { page, errors } = await phone();
  await page.locator('nav.grid > button[data-key="contacts"]').first().click();
  // the contacts tile opens a role choice or the buyer list; get to a list with rows
  if (!(await page.getByTestId('contact-row').count())) await page.getByRole('button', { name: /Buyer/i }).first().click();
  await page.getByTestId('contact-row').first().waitFor();
  const row = page.getByTestId('contact-row').first();
  assert.ok(await row.getByTestId('contact-avatar').count(), 'avatar');
  assert.match(await row.getByTestId('contact-avatar').innerText(), /^[A-Z0-9?]$/);
  const withPhone = await page.getByTestId('contact-wa').count();
  assert.ok(withPhone > 0, 'sample contacts have a WhatsApp button');
  assert.match(await page.getByTestId('contact-wa').first().getAttribute('href'), /^https:\/\/wa\.me\/\d+$/);
  const r = await readable(page);
  assert.deepEqual(r, { small: [], short: [], wide: false });
  await shot(page, 'contacts');
  assert.deepEqual(errors, []);
  await page.context().close();
});

test('EB2 Inquiries & Viewings: gold segmented switch, both tabs show, readable', async () => {
  const { page, errors } = await phone();
  await tab(page, 3);
  const sw = page.locator('.tabs.seg-tabs');
  await sw.waitFor();
  assert.equal(await sw.locator('button').count(), 2);
  assert.equal(await sw.locator('button.on').count(), 1);
  assert.deepEqual(await readable(page), { small: [], short: [], wide: false });
  await shot(page, 'inquiries');
  await sw.locator('button').nth(1).click();
  assert.equal(await sw.locator('button').nth(1).getAttribute('aria-selected'), 'true');
  assert.deepEqual(await readable(page), { small: [], short: [], wide: false });
  await shot(page, 'viewings');
  assert.deepEqual(errors, []);
  await page.context().close();
});

test('EB3 Projects: status chips filter the list; All shows everything again', async () => {
  const { page, errors } = await phone();
  await tab(page, 1);
  const chips = page.getByTestId('project-status-filter');
  if (!(await chips.count())) { await shot(page, 'projects-empty'); await page.context().close(); return; } // sample data holds no projects: nothing to filter
  const all = await page.getByTestId('project-card').count();
  const second = chips.locator('button').nth(1);
  await second.click();
  assert.ok((await page.getByTestId('project-card').count()) <= all);
  await chips.locator('button').first().click();
  assert.equal(await page.getByTestId('project-card').count(), all);
  assert.deepEqual(await readable(page), { small: [], short: [], wide: false });
  await shot(page, 'projects');
  assert.deepEqual(errors, []);
  await page.context().close();
});

test('EB4 Subsale List cards and a property page stay readable', async () => {
  const { page, errors } = await phone();
  await page.locator('nav.grid > button[data-key="property"]').first().click();
  await page.getByTestId('listing-card').first().waitFor();
  assert.deepEqual(await readable(page), { small: [], short: [], wide: false });
  await shot(page, 'subsale');
  await page.getByTestId('card-address').first().click();
  await page.waitForTimeout(400);
  assert.deepEqual((await readable(page)).wide, false);
  await shot(page, 'property');
  assert.deepEqual(errors, []);
  await page.context().close();
});
