// Screen tests for JoyChange003 Batch D: Change 65 (logo and name strip at the top of the main page) and Change 72 (notification
// boxes: Dismiss, Remind me later, History). Chromium at Samsung S23 Ultra width (384 x 824).
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

async function todo(page, title, days) {
  await page.locator('nav.grid > button[data-key="agenda"]').click();
  await page.getByTestId('agenda-todo').click();
  await page.getByRole('button', { name: '+ Add New To-do' }).click();
  await page.locator('[data-field="title"]').fill(title);
  const d = new Date(Date.now() + days * 86_400_000); const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  await page.locator('[data-field="due"]').fill(ymd);
  await page.getByTestId('reminders').getByRole('button', { name: '1 day before' }).click();
  await page.getByTestId('save-task').click();
  while (await page.locator('header button[aria-label="Back"]').count()) await page.locator('header .icon-btn').first().click();
  await page.waitForSelector('nav.grid');
}

test('BD1 Change 65: logo and app name are a strip at the top of the main page, about a tenth of the screen, inside the scrolling page', async () => {
  const page = await phone();
  const g = await page.evaluate(() => {
    const s = document.querySelector('[data-testid="brand-strip"]'); const r = s.getBoundingClientRect();
    return { h: r.height, inContent: !!s.closest('main.content'), inBar: !!document.querySelector('header.topbar .brand'), img: !!s.querySelector('img, svg'), text: s.innerText.replace(/\s+/g, ' ').trim(), vh: innerHeight };
  });
  assert.ok(g.inContent && !g.inBar, 'in the page, not in the fixed bar');
  assert.ok(g.img && /Estate Agent/i.test(g.text), g.text);
  assert.ok(g.h >= g.vh * 0.08 && g.h <= g.vh * 0.14, `about 10% of the screen (${g.h} of ${g.vh})`);
  assert.equal(await page.getByTestId('top-notifications').count(), 1, 'bell still in the bar');
  assert.equal(await page.getByTestId('top-profile').count(), 1, 'profile still in the bar');
  await page.context().close();
});

test('BD2 Change 72: each notification is its own box with a gap; Dismiss moves it to History, Put back returns it', async () => {
  const page = await phone();
  await todo(page, 'Call the lawyer', 2);
  await todo(page, 'Send the contract', 3);
  await page.getByTestId('top-notifications').click();
  await page.getByTestId('notifications').waitFor();
  const boxes = page.getByTestId('notif-system').getByTestId('notif-box');
  const n0 = await boxes.count();
  assert.ok(n0 >= 2, `one box per reminder (${n0})`);
  const gap = await page.evaluate(() => { const b = [...document.querySelectorAll('[data-testid="notif-system"] [data-testid="notif-box"]')].map(x => x.getBoundingClientRect()); return b[1].top - b[0].bottom; });
  assert.ok(gap >= 8, `gap between boxes ${gap}`);
  assert.equal(await page.getByTestId('notif-dismiss').count(), n0);
  assert.equal(await page.getByTestId('notif-later').count(), n0);
  assert.equal(await page.getByTestId('notif-sync').count(), 0, 'no sync message in notifications');
  await page.getByTestId('notif-dismiss').first().click();
  assert.equal(await boxes.count(), n0 - 1);
  await page.getByTestId('notif-history').locator('summary').click();
  assert.equal(await page.getByTestId('notif-history-row').count(), 1);
  await page.getByTestId('notif-restore').click();
  assert.equal(await boxes.count(), n0);
  assert.equal(await page.getByTestId('notif-history-row').count(), 0);
  await page.context().close();
});

test('BD3 Change 72: Remind me later offers times and hides the notification; it stays out of History', async () => {
  const page = await phone();
  await todo(page, 'Call the lawyer', 2);
  await page.getByTestId('top-notifications').click();
  await page.getByTestId('notif-box').first().waitFor();
  await page.getByTestId('notif-later').first().click();
  const choices = await page.getByTestId('notif-snooze').locator('button').allInnerTexts();
  assert.deepEqual(choices.map(x => x.toLowerCase()), ['in 1 hour', 'in 4 hours', 'tomorrow, 9:00', 'in 3 days, 9:00']);
  await page.getByTestId('notif-snooze-hour').click();
  while (await page.getByTestId('notif-box').count()) { await page.getByTestId('notif-later').first().click(); await page.getByTestId('notif-snooze-hour').click(); }
  assert.equal(await page.getByTestId('notif-box').count(), 0);
  assert.equal(await page.getByTestId('notif-empty-system').count(), 1);
  assert.match(await page.getByTestId('notif-history').locator('summary').innerText(), /History \(0\)/);
  // still hidden after leaving and coming back (the choice is remembered on the phone)
  while (await page.locator('header button[aria-label="Back"]').count()) await page.locator('header .icon-btn').first().click();
  await page.waitForSelector('nav.grid');
  await page.getByTestId('top-notifications').click();
  assert.equal(await page.getByTestId('notif-box').count(), 0);
  await page.context().close();
});
