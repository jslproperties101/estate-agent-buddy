// Real Google Maps check (GitHub Actions, where Google can be reached). Opens the built app in Chromium at
// https://localhost/ — the same address the Android app uses, so the key's website restriction is tested as on the
// phone — runs Agent Profile → Settings → Check Google Maps, and saves a screenshot and a text summary.
// The browser's GPS is set to Nilai here (a runner has no GPS); real GPS can only be checked on the phone.
// Usage: node scripts/maps-check.mjs <screenshot.png> <summary.txt>
import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const [shotPath = 'maps-check.png', textPath = 'maps-check.txt'] = process.argv.slice(2);
// MAPS_CHECK_DIST: a build without sign-in (the check must reach Settings without a Google account).
const DIST = process.env.MAPS_CHECK_DIST ? `${process.env.MAPS_CHECK_DIST.replace(/\/$/, '')}/` : new URL('../dist/', import.meta.url).pathname;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  permissions: ['geolocation'], geolocation: { latitude: 2.8167, longitude: 101.7972, accuracy: 10 },
});
// Serve the app as https://localhost/ (answered here, nothing listens on the network).
await ctx.route('https://localhost/**', async route => {
  const path = new URL(route.request().url()).pathname;
  const file = join(DIST, path === '/' ? 'index.html' : path);
  try { await route.fulfill({ status: 200, contentType: types[extname(file)] ?? 'application/octet-stream', body: await readFile(file) }); }
  catch { await route.fulfill({ status: 404, body: '' }); }
});
const page = await ctx.newPage();
const googleErrors = [];
page.on('console', m => { const t = m.text(); if (/Google Maps JavaScript API (error|warning)/.test(t)) googleErrors.push(t.split('\n')[0]); });

const lines = [];
try {
  await page.goto('https://localhost/');
  await page.waitForSelector('nav.grid');
  // A clean install first asks "How would you like to start?" (added 13 Oct); that dialog covers the screen, so answer it.
  const start = page.getByRole('button', { name: /Start Without Sample Data/ });
  if (await start.isVisible().catch(() => false)) await start.click();
  await page.locator('nav.grid > button', { hasText: 'Agent Profile' }).click();
  await page.getByRole('button', { name: /Settings/ }).click();
  await page.getByTestId('maps-check-run').click();
  await page.waitForFunction(() => [...document.querySelectorAll('[data-testid^="check-"]')].length === 5
    && [...document.querySelectorAll('[data-testid^="check-"]')].every(e => e.getAttribute('data-ok') !== 'pending'), null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(3000); // let map tiles finish drawing for the screenshot
  for (const k of ['map', 'geocode', 'places', 'routes', 'gps']) {
    const el = page.getByTestId(`check-${k}`);
    const ok = await el.getAttribute('data-ok');
    lines.push(`${ok === 'true' ? 'OK  ' : ok === 'false' ? 'FAIL' : 'WAIT'} ${(await el.innerText()).replace(/\s+/g, ' ').trim()}`);
  }
  lines.push(`Key source: ${await page.getByTestId('maps-key-source').innerText()}`);
  const tiles = await page.locator('[data-testid="maps-check-map"] img').count();
  lines.push(`Map images drawn: ${tiles}`);
  await page.getByTestId('maps-check').screenshot({ path: shotPath });
} catch (e) {
  lines.push(`Check could not finish: ${String(e).split('\n')[0]}`);
  await page.screenshot({ path: shotPath, fullPage: true }).catch(() => {});
}
for (const e of [...new Set(googleErrors)]) lines.push(`Google says: ${e}`);
lines.push('GPS in this check is simulated (Nilai); real GPS is checked on the phone.');
await writeFile(textPath, lines.join('\n') + '\n');
console.log(lines.join('\n'));
await browser.close();
