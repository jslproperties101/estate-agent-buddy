// JoyChange002 Change 47 (laptop website) screen tests in a real Chromium browser at laptop width (1440 x 900), on the
// website build (EAB_WEBSITE=1, built here into .test-web-dist). Not a live web address and not InfinityFree.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { extname, join } from 'node:path';
import { chromium } from 'playwright';

const ROOT = new URL('..', import.meta.url).pathname;
const WEB = new URL('../.test-web-dist/', import.meta.url).pathname;
const DIST = new URL('../dist/', import.meta.url).pathname;
const SHOTS = new URL('./screens/', import.meta.url).pathname;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.map': 'application/json' };
let servers = [], browser, web, phone;

function serve(dir) {
  const s = createServer(async (req, res) => {
    const clean = req.url.split('?')[0];
    const path = join(dir, clean === '/' ? 'index.html' : clean);
    try { res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' }); res.end(await readFile(path)); }
    catch { res.writeHead(404); res.end(); }
  });
  servers.push(s);
  return new Promise(r => s.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${s.address().port}/`)));
}

before(async () => {
  await mkdir(SHOTS, { recursive: true });
  const r = spawnSync(process.execPath, ['scripts/build.mjs', '--no-env'], { cwd: ROOT, env: { ...process.env, EAB_WEBSITE: '1', EAB_OUTDIR: '.test-web-dist' }, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  web = await serve(WEB);
  phone = await serve(DIST);
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); servers.forEach(s => s.close()); });

async function open(base, viewport = { width: 1440, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(base);
  await page.waitForSelector('nav.grid');
  await page.getByTestId('start-sample').click();
  await page.waitForTimeout(300);
  return { page, ctx, errors };
}

test('W1 the website build carries its web-server file and is marked as the website', async () => {
  await access(join(WEB, '.htaccess'));
  const ht = await readFile(join(WEB, '.htaccess'), 'utf8');
  assert.match(ht, /RewriteRule \^ index\.html/);
  assert.match(ht, /HTTPS/);
  await assert.rejects(access(join(DIST, '.htaccess')), 'the phone app build has no .htaccess');
});

test('W2 laptop: wide layout, five tiles a row, no adverts', async () => {
  const { page, ctx, errors } = await open(web);
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('website')), true);
  assert.equal(await page.getByTestId('bottom-ad').count(), 0, 'no bottom advert');
  const tops = await page.locator('nav.grid .tile').evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().top)));
  assert.equal(tops.length, 15);
  assert.equal(new Set(tops).size, 3, 'three rows of five');
  const shell = await page.locator('.shell').evaluate(e => e.getBoundingClientRect().width);
  assert.ok(shell > 1200, `shell ${shell}px wide`);
  await page.screenshot({ path: `${SHOTS}w2-website-home.png` });
  await page.locator('[data-key="property"]').click();
  await page.waitForSelector('.lc-list, .lc-grid');
  assert.equal(await page.getByTestId('feed-ad').count(), 0, 'no in-feed adverts');
  if (await page.locator('.lc-list').count()) {
    const cols = await page.locator('.lc-list > li').evaluateAll(els => new Set(els.slice(0, 3).map(e => Math.round(e.getBoundingClientRect().top))).size);
    assert.equal(cols, 1, 'the first three Large Cards sit side by side');
  }
  await page.screenshot({ path: `${SHOTS}w2-website-list.png` });
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('W3 laptop: no phone book, and GPS journeys are view-only', async () => {
  const { page, ctx, errors } = await open(web);
  await page.locator('[data-key="contacts"]').click();
  await page.locator('.hub button, .big-card, button').filter({ hasText: /Buyers/ }).first().click();
  await page.waitForSelector('[data-testid="contacts-buyer"]');
  assert.equal(await page.getByRole('button', { name: /phone/i }).filter({ hasText: /Import/i }).count(), 0, 'no import from phone');
  await page.goto(web); await page.waitForSelector('nav.grid');
  await page.locator('[data-key="gps"]').click();
  await page.getByTestId('card-house-shopping').click();
  await page.waitForSelector('[data-testid="house-shopping"]');
  assert.equal(await page.getByTestId('gps-phone-only').count(), 1);
  assert.equal(await page.getByTestId('trk-start').count(), 0, 'cannot start recording on a laptop');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('W4 the phone build is unchanged: adverts and journey recording still there', async () => {
  const { page, ctx } = await open(phone, { width: 384, height: 824 });
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('website')), false);
  assert.equal(await page.getByTestId('bottom-ad').count(), 1);
  await page.locator('[data-key="gps"]').click();
  await page.getByTestId('card-house-shopping').click();
  await page.waitForSelector('[data-testid="trk-start"]');
  await ctx.close();
});
