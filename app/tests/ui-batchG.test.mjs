// Screen tests for JoyChange003 Batch G (Change 82): every pick list opens the app's gold list in the middle of the screen
// instead of the phone's grey picker. Chromium at Samsung S23 Ultra width (384 x 824).
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


async function phone(sample = false) {
  const ctx = await browser.newContext({ viewport: { width: 384, height: 824 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(base);
  await page.waitForSelector('nav.grid');
  await page.getByTestId('start-choice').waitFor({ timeout: 5000 });
  await page.getByTestId(sample ? 'start-sample' : 'start-empty').click();
  await page.getByTestId('start-choice').waitFor({ state: 'detached' });
  return page;
}
const storedRecords = (page, collection) => page.evaluate(c => new Promise(res => {
  const r = indexedDB.open('estate-agent-buddy');
  r.onsuccess = () => {
    const db = r.result;
    const q = db.transaction('records').objectStore('records').openCursor();
    const out = [];
    q.onsuccess = () => { const cur = q.result; if (cur) { if (String(cur.key).startsWith(`c:${c}:`)) out.push(cur.value); cur.continue(); } else { db.close(); res(out); } };
  };
}), collection);
/** A finger tap on the middle of the list, whatever lies on top of it. */
async function tapOn(page, locator) {
  await locator.scrollIntoViewIfNeeded();
  const b = await locator.boundingBox();
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
}
/** Every <select> on the page sits in the wrapper with the tap area over it. */
const bareSelects = page => page.evaluate(() => [...document.querySelectorAll('select')].filter(s => !s.parentElement?.classList.contains('sel-wrap') || !s.parentElement.querySelector(':scope > .sel-tap')).length);

test('BG1 Change 82: tapping a pick list opens the gold list in the middle of the screen; choosing sets the field; X and a tap outside close it', async () => {
  const page = await phone();
  await page.locator('nav.grid > button[data-key="agenda"]').click();
  await page.getByTestId('agenda-todo').click();
  await page.getByRole('button', { name: '+ Add New To-do' }).click();
  const sel = page.locator('[data-field="priority"]');
  const before = await sel.inputValue();
  await tapOn(page, sel);
  const pop = page.getByTestId('pick-popup');
  await pop.waitFor();
  const g = await page.evaluate(() => {
    const d = document.querySelector('[data-testid="pick-popup"] .dialog').getBoundingClientRect();
    return { mid: d.left + d.width / 2, vw: innerWidth, top: d.top, bottom: d.bottom, vh: innerHeight };
  });
  assert.ok(Math.abs(g.mid - g.vw / 2) < 4, 'centred across');
  assert.ok(g.top > 0 && g.bottom < g.vh, 'fully on screen');
  const opts = await page.getByTestId('pick-option').allInnerTexts();
  const native = await sel.locator('option').allInnerTexts();
  assert.deepEqual(opts.map(x => x.trim()), native.map(x => x.trim()), 'the same choices as the field');
  assert.equal(await page.locator('[data-testid="pick-option"][aria-selected="true"]').getAttribute('data-value'), before, 'the current value is marked');
  assert.match(await pop.locator('.opt-pop-head strong').innerText(), /priority/i, 'the field name on top');
  const bg = await page.getByTestId('pick-option').first().evaluate(el => getComputedStyle(el.closest('.dialog')).borderTopColor);
  assert.notEqual(bg, 'rgba(0, 0, 0, 0)');
  // choose another value
  const target = (await page.getByTestId('pick-option').evaluateAll(xs => xs.map(x => x.dataset.value))).find(v => v !== before);
  await page.locator(`[data-testid="pick-option"][data-value="${target}"]`).click();
  await pop.waitFor({ state: 'detached' });
  assert.equal(await sel.inputValue(), target, 'the field took the choice');
  // the form saw the change (saving keeps it)
  await page.locator('[data-field="title"]').fill('Pick test');
  await page.getByTestId('save-task').click();
  for (let i = 0; i < 50 && !(await storedRecords(page, 'tasks')).some(x => x.title === 'Pick test'); i++) await page.waitForTimeout(100);
  assert.equal((await storedRecords(page, 'tasks')).find(x => x.title === 'Pick test')?.priority, target, 'saved with the chosen priority');
  // X and a tap outside close without changing anything
  await page.getByRole('button', { name: '+ Add New To-do' }).click();
  await tapOn(page, sel);
  await page.getByTestId('pick-popup-close').click();
  await pop.waitFor({ state: 'detached' });
  await tapOn(page, sel);
  await page.mouse.click(6, 140);
  await pop.waitFor({ state: 'detached' });
  assert.equal(await sel.inputValue(), before);
  await page.context().close();
});

test('BG2 Change 82: no pick list is left with the phone\'s own picker, on the busiest screens', async () => {
  const page = await phone(true);
  // property form (all sections open)
  await page.locator('nav.grid > button[data-key="property"]').click();
  await page.locator('.add-property').click();
  await page.waitForSelector('[data-testid="listing-form"]');
  if ((await page.getByTestId('toggle-all').innerText()).match(/Open/)) await page.getByTestId('toggle-all').click();
  const n = await page.locator('select').count();
  assert.ok(n >= 5, `the form has lists (${n})`);
  assert.equal(await bareSelects(page), 0, 'every list on the property form');
  // the tap area covers the list exactly
  const cover = await page.evaluate(() => { const s = document.querySelector('.sel-wrap > select'); const t = s.parentElement.querySelector('.sel-tap'); const a = s.getBoundingClientRect(), b = t.getBoundingClientRect(); return Math.abs(a.width - b.width) + Math.abs(a.height - b.height) + Math.abs(a.top - b.top) + Math.abs(a.left - b.left); });
  assert.ok(cover < 2, `covered exactly (${cover})`);
  // appointment form and calculator
  await page.locator('header .icon-btn').first().click();
  while (await page.locator('header button[aria-label="Back"]').count()) await page.locator('header .icon-btn').first().click();
  await page.locator('nav.grid > button[data-key="agenda"]').click();
  await page.getByTestId('agenda-calendar').click();
  await page.waitForTimeout(200);
  assert.equal(await bareSelects(page), 0, 'calendar');
  await page.context().close();
});

test('BG3 Change 82: the keyboard opens it too (Enter on the focused field); Escape closes it; Bahasa Malaysia close button', async () => {
  const page = await phone();
  await page.locator('nav.grid > button[data-key="agenda"]').click();
  await page.getByTestId('agenda-todo').click();
  await page.getByRole('button', { name: '+ Add New To-do' }).click();
  await page.locator('[data-field="priority"]').focus();
  await page.keyboard.press('Enter');
  await page.getByTestId('pick-popup').waitFor();
  await page.keyboard.press('Escape');
  await page.getByTestId('pick-popup').waitFor({ state: 'detached' });
  await page.evaluate(() => { document.documentElement.lang = 'ms'; });
  await tapOn(page, page.locator('[data-field="priority"]'));
  assert.equal(await page.getByTestId('pick-popup-close').getAttribute('aria-label'), 'Tutup');
  await page.context().close();
});
