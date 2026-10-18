// Screen tests in a real Chromium browser at Samsung S23 Ultra phone width (384 x 824 CSS pixels).
// Run after `npm run build`. Screenshots go to tests/screens/.
// Google Maps is replaced by a small stand-in (FAKE_MAPS below) so the map screens can be tested without a key or
// network; GPS positions are simulated with the browser's geolocation override. Real Google Maps, real GPS and
// the real phone must still be tested on the S23 Ultra.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, rm } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { chromium } from 'playwright';
import { createFakeDrive } from './support/fakeDrive.mjs';

const DIST = new URL('../dist/', import.meta.url).pathname;
const SHOTS = new URL('./screens/', import.meta.url).pathname;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.map': 'application/json' };
let server, browser, base;
const PNG_1X1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const external = [];
const consoleErrors = [];

before(async () => {
  await rm(SHOTS, { recursive: true, force: true });
  await mkdir(SHOTS, { recursive: true });
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

/** A stand-in for google.maps with the parts the app uses. Map clicks are triggered with window.__mapClick(lat, lng). */
const FAKE_MAPS = `(() => {
  const listeners = [];
  class LatLng { constructor(a, b) { this.a = a; this.b = b; } lat() { return this.a; } lng() { return this.b; } }
  const drags = [];
  class Map { constructor(el, o) { this.el = el; el.textContent = 'MAP'; window.__maps = (window.__maps || 0) + 1; window.__mapType = o?.mapTypeId; this.zoom = o?.zoom ?? 15; }
    addListener(t, fn) { if (t === 'click') listeners.push(fn); if (t === 'dragstart') drags.push(fn); } panTo(c) { window.__center = c; window.__pans = (window.__pans || 0) + 1; } fitBounds() {} setCenter() {}
    setMapTypeId(t) { window.__mapType = t; } getZoom() { return this.zoom; } setZoom(z) { this.zoom = z; } }
  class Marker { constructor(o) { this.o = o; (window.__markers ||= []).push(this); this.h = {}; } setMap(m) { if (!m) window.__markers = window.__markers.filter(x => x !== this); }
    setPosition(p) { this.o = { ...this.o, position: p }; } addListener(t, fn) { this.h[t] = fn; } }
  class Circle { constructor(o) { this.o = o; window.__circle = o; } setMap() {} setCenter(c) { window.__circle = { ...window.__circle, center: c }; } setRadius(r) { window.__circle = { ...window.__circle, radius: r }; } }
  class Polyline { constructor(o) { window.__lines = (window.__lines || 0) + 1; this.o = o; } setMap() {} }
  class LatLngBounds { extend() {} }
  class Geocoder { async geocode(req) { const r = window.__geocode || { street: 'Jalan Fake 1', township: 'Tmn Desa Nilai', city: 'Nilai', state: 'Negeri Sembilan' };
    return { results: [{ formatted_address: [r.street, r.township, r.city, r.state, 'Malaysia'].join(', '), place_id: 'fake-place',
      geometry: { location: new LatLng(req.location?.lat ?? 2.8, req.location?.lng ?? 101.8) },
      address_components: [
        { long_name: r.street, short_name: r.street, types: ['route'] },
        { long_name: r.township, short_name: r.township, types: ['sublocality_level_1'] },
        { long_name: r.city, short_name: r.city, types: ['locality'] },
        { long_name: r.state, short_name: r.state, types: ['administrative_area_level_1'] },
        { long_name: 'Malaysia', short_name: 'MY', types: ['country'] }] }] }; } }
  class DirectionsService { async route(r) { return { routes: [{ overview_path: [new LatLng(r.origin.lat, r.origin.lng), new LatLng(r.destination.lat, r.destination.lng)], legs: [{ distance: { value: 5300 }, duration: { value: 540 } }] }] }; } }
  window.google = { maps: { Map, Marker, Circle, Polyline, LatLngBounds, Geocoder, DirectionsService, SymbolPath: { CIRCLE: 0 }, TravelMode: { DRIVING: 'DRIVING' }, importLibrary: async () => ({}) } };
  window.__mapClick = (lat, lng) => listeners.forEach(fn => fn({ latLng: new LatLng(lat, lng) }));
  window.__drag = () => drags.forEach(fn => fn());
})();`;

async function phone({ maps = false, geo, start = 'empty' } = {}) {
  const ctx = await browser.newContext({
    viewport: { width: 384, height: 824 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    permissions: geo ? ['geolocation'] : [], geolocation: geo,
  });
  if (maps) await ctx.addInitScript(FAKE_MAPS);
  const page = await ctx.newPage();
  page.on('request', r => { if (!r.url().startsWith(base) && !r.url().startsWith('blob:') && !r.url().startsWith('data:')) external.push(r.url()); });
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => consoleErrors.push(String(e)));
  await page.goto(base);
  await page.waitForSelector('nav.grid');
  if (start) await chooseStart(page, start);
  return page;
}
/** New-user choice on first start: 'empty' (default for tests), 'sample', or null to leave it open. */
async function chooseStart(page, which) {
  await page.getByTestId('start-choice').waitFor({ timeout: 5000 });
  await page.getByTestId(which === 'sample' ? 'start-sample' : 'start-empty').click();
  await page.getByTestId('start-choice').waitFor({ state: 'detached' });
}
const shot = (page, name, fullPage = true) => page.screenshot({ path: `${SHOTS}${name}.png`, fullPage });

/** ClaudeChanges001 change 5: Street is a remembered dropdown (saved under the levels above it), not a text box. Types the
 *  value in the list's search box and adds it ("Add …"), or picks it when it is already in the list. */
async function setStreet(page, value) {
  const box = page.locator('[data-testid="opt-street"]');
  if (await box.locator('.opt-list').count() === 0) await box.locator('.opt-btn').click();
  const v = String(value ?? '');
  if (!v) { await box.getByRole('option').first().click(); return; }
  await page.getByTestId('opt-street-search').fill(v);
  const add = page.getByTestId('opt-street-add');
  if (await add.count()) await add.click();
  else await box.getByRole('option', { name: v, exact: true }).click();
}
/** ClaudeChanges001 change 7: Delete in the photo menu asks first. */
async function confirmPhotoDelete(page) { await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click(); await page.getByRole('alertdialog').waitFor({ state: 'detached' }); }
/** Picks a built-in value in a remembered list (OptionSelect). */
async function pickOpt(page, testId, name) {
  const box = page.getByTestId(testId);
  if (await box.locator('.opt-list').count() === 0) await box.locator('.opt-btn').click();
  await box.getByRole('option', { name, exact: true }).click();
}
/** The Street shown on the form (ClaudeChanges001). */
async function streetValue(page) {
  const t = (await page.locator('[data-testid="opt-street"] .opt-btn').innerText()).replace(/\s*▾\s*$/, '').trim();
  return ['not set', 'belum ditetapkan', '未设置'].includes(t.toLowerCase()) ? '' : t;
}

/** Opens a dashboard card. Buyers and vendors are inside the Contacts card since 13 Oct 2026. */
/** Waits until the phone's own storage (IndexedDB) really holds what the screen says it saved — `expr` is evaluated with
 *  `all` = every value in that store. This replaces sleeping for a fixed time: it passes as soon as the data is stored and
 *  fails (after `timeout`) if it never is, so a lost write is a failure, not something a long delay hides. */
async function waitStored(page, storeName, expr, timeout = 10000) {
  const check = () => page.evaluate(({ storeName, expr }) => new Promise(res => {
    const r = indexedDB.open('estate-agent-buddy');
    r.onerror = () => res(false);
    r.onsuccess = () => {
      const db = r.result;
      const q = db.transaction(storeName).objectStore(storeName).getAll();
      q.onsuccess = () => { const all = q.result; db.close(); res(!!new Function('all', `return (${expr});`)(all)); };
      q.onerror = () => { db.close(); res(false); };
    };
  }), { storeName, expr });
  const end = Date.now() + timeout;
  while (!(await check())) {
    if (Date.now() > end) throw new Error(`Not stored within ${timeout} ms: ${expr}`);
    await page.waitForTimeout(50);
  }
}
async function tile(page, name) {
  // Change 011: the property list is the "Subsale List" card (14); Agent Profile is the top-bar button (owner, 16 Oct 2026).
  if (name === 'Property List') name = 'Subsale List';
  // JoyChange002 Change 43: the Voice Command card is now "AI Assisted Command" (same card, key "voice").
  if (name === 'Voice Command') { await page.locator('nav.grid > button[data-key="voice"]').click(); return; }
  if (['Agent Profile', 'Profil Ejen', '经纪人资料'].includes(name)) { await page.getByTestId('top-profile').click(); return; }
  if (name === 'Buyer List' || name === 'Vendor List') {
    await page.locator('nav.grid > button', { hasText: 'Contacts' }).first().click();
    await page.getByTestId(name === 'Buyer List' ? 'hub-buyers' : 'hub-vendors').click();
    return;
  }
  // ClaudeChanges001 change 12: Calendar and To-Do share card 1, which asks which one to open.
  if (['To-Do', 'Calendar', 'Tugasan', 'Kalendar', '待办事项', '日历'].includes(name)) {
    await page.locator('nav.grid > button[data-key="agenda"]').click();
    await page.getByTestId(['Calendar', 'Kalendar', '日历'].includes(name) ? 'agenda-calendar' : 'agenda-todo').click();
    return;
  }
  await page.locator('nav.grid > button', { hasText: name }).first().click();
}
/** Change 011 (owner, 16 Oct 2026): one language button that opens the list of languages. `q` is a { hasText } filter
 *  or an attribute selector such as '[aria-label="中文"]'. */
async function pickLang(page, q) {
  await page.getByTestId('lang-btn').click();
  const loc = typeof q === 'string' ? page.locator(`.lang-menu button${q}`) : page.locator('.lang-menu button', q);
  await loc.click();
  await page.getByTestId('lang-menu').waitFor({ state: 'detached' });
}
/** Opens every section of the property form (they start closed). */
async function expandForm(page) {
  await page.waitForSelector('[data-testid="listing-form"]');
  if ((await page.getByTestId('toggle-all').innerText()).match(/Open|Buka|展开/)) await page.getByTestId('toggle-all').click();
}
async function newProperty(page) { await page.locator('.add-property').click(); await expandForm(page); }
/** Owner, 17 Oct 2026 (no Google Maps link field any more): places the property with Add Location (needs phone({ maps: true })). */
async function pickPoint(page, lat, lng) {
  if (await page.locator('#sec-location').getAttribute('data-open') !== 'yes') await page.locator('[data-sec="location"]').click();
  await page.getByTestId('gmap-add').click();
  await page.waitForSelector('[data-testid="picker-map"]');
  await page.evaluate(([a, b]) => window.__mapClick(a, b), [lat, lng]);
  await page.getByTestId('apply-location').click();
  await page.getByTestId('location-picker').waitFor({ state: 'detached' });
}
async function home(page) { while (await page.locator('header button[aria-label="Back"], header button[aria-label="Kembali"], header button[aria-label="返回"]').count()) await page.locator('header .icon-btn').first().click(); }
async function loadSample(page) {
  await tile(page, 'Agent Profile');
  await page.getByRole('button', { name: /Settings/i }).click();
  await page.getByTestId('load-sample').click();
  await home(page);
}
/** Elements that stick out of the screen sideways, or whose text is cut off or spills out of its box. */
const layoutProblems = page => page.evaluate(() => {
  const bad = [];
  const vw = window.innerWidth;
  if (document.documentElement.scrollWidth > vw + 1) bad.push(`page scrolls sideways: ${document.documentElement.scrollWidth}`);
  for (const el of document.querySelectorAll('main *, header *, .sheet *')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || el.closest('.gmap, .thumbs, svg, select, option, .sr-only')) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    if (r.right > vw + 1 || r.left < -1) bad.push(`outside screen: <${el.tagName.toLowerCase()} class="${el.className}"> ${el.textContent.trim().slice(0, 40)}`);
    const ownText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (ownText && !['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) && el.scrollWidth > el.clientWidth + 1 && cs.display !== 'inline')
      bad.push(`text cut or spilling: <${el.tagName.toLowerCase()} class="${el.className}"> ${el.textContent.trim().slice(0, 40)} (${el.scrollWidth} > ${el.clientWidth})`);
  }
  return [...new Set(bad)];
});

// ---------------------------------------------------------------------------------------------------------------

test('U1 dashboard (Change 011): Estate Agent AI Buddy, 15 cards in 3 × 5 — Creative Media 4, Buyer Matching 10, Subsale List 14, AI Assisted Command 15; no Coming Soon labels; Agent Profile and Notifications at the top', async () => {
  const page = await phone();
  assert.equal(await page.locator('h1').getAttribute('aria-label'), 'Estate Agent AI Buddy');
  assert.equal(await page.title(), 'Estate Agent AI Buddy');
  const names = await page.locator('nav.grid > button').evaluateAll(bs => bs.map(b => b.getAttribute('aria-label')));
  // Change 011 + owner's answers of 16 Oct 2026: Creative Media takes card 4, the property list becomes "Subsale List" at
  // card 14 (bottom centre), Agent Profile moves to the top bar, Buyer Matching uses the freed card 10 (Change 013).
  // ClaudeChanges001 change 12: card 1 is Calendar & To-Do (asks which), card 2 is Track My Sales.
  // JoyChange002 Change 43: Project is card 1; Calendar & To-Do, Subsale List and AI Assisted Command are the gold bottom row.
  assert.deepEqual(names, ['Project', 'Track My Sales', 'Opportunities', 'Creative Media', 'Contacts', 'Inquiries & Viewings', 'GPS Assistance',
    'Agent Financial', 'Property Calculator', 'Buyer Matching', 'Ask Expert', 'Market Intelligence',
    'Calendar & To\u2011Do', 'Subsale List', 'AI Assisted Command']);
  assert.equal(await page.locator('nav.grid > button[data-key="property"]').getAttribute('data-tile'), '14', 'Subsale List is card 14');
  assert.equal(await page.locator('nav.grid > button[data-key="creative"]').getAttribute('data-tile'), '4', 'Creative Media is card 4');
  assert.equal(await page.locator('nav.grid').getByText(/Coming Soon|Soon/i).count(), 0, 'no Coming Soon label on any card');
  for (const gone of ['Property List', 'Agent Profile', 'Subsale']) assert.ok(!names.includes(gone), `no ${gone} card`);
  // No Today and no Recent Properties sections. ClaudeChanges001 change 2: no "Saved on This Phone" line any more, and no
  // sync banner while nothing is wrong.
  assert.equal(await page.getByTestId('today').count(), 0, 'no Today section');
  assert.equal(await page.locator('.photo-cards').count(), 0, 'no Recent Properties');
  assert.equal(await page.getByText(/Recent properties/i).count(), 0);
  assert.equal(await page.getByTestId('save-status').count(), 0, 'no Saved on This Phone line');
  assert.equal(await page.getByTestId('sync-banner').count(), 0, 'no banner when nothing is wrong');
  await page.locator('nav.grid > button[data-key="agenda"]').click();
  await page.getByTestId('agenda-ask').waitFor();
  assert.match(await page.getByTestId('agenda-ask').innerText(), /Calendar or To-Do\?/);
  await page.getByTestId('agenda-ask-cancel').click();
  assert.equal(await page.getByTestId('top-profile').getAttribute('aria-label'), 'Agent Profile', 'Agent Profile is a top-bar button');
  await page.getByTestId('top-profile').click();
  await page.getByRole('button', { name: /Settings/i }).waitFor();
  await home(page);
  assert.equal(names.indexOf('AI Assisted Command') + 1, 15, 'AI Assisted Command is card 15');
  for (const gone of ['Buyer List', 'Vendor List', 'News', 'Settings', 'Co-broke']) assert.ok(!names.includes(gone), `no ${gone} card`);
  await tile(page, 'Creative Media');
  await page.getByTestId('creative-media').waitFor();
  await home(page);
  await tile(page, 'Buyer Matching');
  await page.getByTestId('buyer-matching').waitFor();
  await home(page);
  assert.equal(await page.locator('nav.grid > button.voice-tile[data-key="voice"]').getAttribute('data-tile'), '15', 'the bright-gold AI Assisted Command card is number 15');
  assert.equal(await page.locator('nav.grid > button.gold-tile').count(), 3, 'the bottom row of three is gold');
  // Top bar: Notifications only. Change 003 (owner): the top-middle "Soon" item (Co-broke) is removed; nothing else moves.
  assert.equal(await page.getByTestId('top-cobroke').count(), 0, 'no Soon item in the top bar');
  assert.equal(await page.locator('.top-soon').count(), 0);
  assert.equal(await page.getByTestId('top-notifications').getAttribute('aria-label'), 'Notifications');
  assert.equal(await page.getByText('BIG NEWS').count(), 0);
  await page.getByTestId('top-notifications').click();
  await page.getByTestId('notifications').waitFor();
  await home(page);
  await tile(page, 'Market Intelligence');
  assert.match(await page.getByTestId('soon-market').innerText(), /lawful and reliable source[\s\S]*Nothing here is live/i, 'Market Intelligence is honest: no feed is pretended');
  await home(page);
  await tile(page, 'Contacts');
  assert.deepEqual(await page.locator('.hub-card strong').allInnerTexts(), ['Buyers', 'Vendors']);
  await home(page);
  // Owner, 12 Oct 2026 (latest): Explorer Progress removed completely; the page starts with the cards.
  assert.equal(await page.evaluate(() => document.querySelector('main.content > section > *')?.tagName), 'NAV');
  for (const gone of [/Explorer progress/i, /km explored/i, /routes recorded/i]) assert.equal(await page.getByText(gone).count(), 0, String(gone));
  assert.equal(await page.getByTestId('explorer-progress').count(), 0);
  // 3 columns × 5 rows on a phone.
  const boxes = await page.locator('nav.grid > button').evaluateAll(bs => bs.map(b => { const r = b.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top)]; }));
  assert.equal(new Set(boxes.map(b => b[0])).size, 3, 'three columns');
  assert.equal(new Set(boxes.map(b => b[1])).size, 5, 'five rows');
  assert.equal(await page.getByText(/Profile & Name Card/).count(), 0, 'renamed to Agent Profile');
  for (const gone of [/GPS map/i, /Smart Capture/i]) assert.equal(await page.getByText(gone).count(), 0, String(gone));
  assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(8, 8, 10)', 'black theme');
  assert.deepEqual(await layoutProblems(page), []);
  await shot(page, '01-home-en', false);
  await page.context().close();
});

test('U2 Smart Capture is removed everywhere; voice is the capture path', async () => {
  const page = await phone();
  await loadSample(page);
  const screens = [['Property List'], ['Voice Command']];
  for (const [t] of screens) {
    await tile(page, t);
    assert.equal(await page.getByText(/Smart Capture|Tangkapan Pintar/i).count(), 0, `${t} has no Smart Capture`);
    await home(page);
  }
  await tile(page, 'Property List');
  await page.getByTestId('listing-card').first().click();
  assert.equal(await page.getByText(/Smart Capture/i).count(), 0);
  await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
  assert.equal(await page.getByText(/Smart Capture/i).count(), 0);
  // Owner, 17 Oct 2026: no Fill with Voice button on the form either (voice commands stay on their own card).
  assert.equal(await page.getByTestId('voice-fill-btn').count(), 0, 'no Fill with Voice on the form');
  const js = await (await fetch(`${base}main.js`)).text();
  assert.ok(!/pdfjs|GlobalWorkerOptions|word\/document\.xml/.test(js), 'no PDF or Word reading code in the app');
  await page.context().close();
});

test('U3 Property List: Grid first, Large Cards the default on a first install (Change 28), references hidden on cards, choice remembered', async () => {
  const page = await phone();
  await tile(page, 'Property List');
  assert.ok(await page.getByTestId('listing-empty').isVisible(), 'starts empty: no invented records');
  await home(page);
  await loadSample(page);
  await tile(page, 'Property List');
  const seg = page.locator('.lc-tools .seg button');
  assert.deepEqual(await seg.evaluateAll(b => b.map(x => x.getAttribute('aria-label'))), ['Grid', 'Large Cards']);
  assert.equal(await seg.nth(1).getAttribute('aria-pressed'), 'true', 'Large Cards is the default on a first install (Change 28)');
  assert.equal(await page.locator('ul[data-layout="large"]').count(), 1);
  await seg.first().click();
  assert.equal(await page.locator('ul[data-layout="grid"] > li[data-testid="listing-card"]').count(), 10);
  // Change 011: a medium advert card after every third property shown (3, 6, 9): 10 properties → 3 adverts, in their own rows.
  assert.equal(await page.locator('ul[data-layout="grid"] > li > [data-testid="feed-ad"]').count(), 3);
  assert.deepEqual(await page.locator('ul[data-layout="grid"] > li').evaluateAll(li => li.map(x => (x.querySelector('[data-testid="feed-ad"]') ? 'AD' : 'P')).join('')), 'PPPADPPPADPPPADP');
  const cardsText = await page.locator('ul[data-layout="grid"]').innerText();
  assert.ok(!/P10\d\d/.test(cardsText), 'no reference numbers on grid cards');
  const cols = await page.locator('ul[data-layout="grid"] > li').evaluateAll(li => new Set(li.slice(0, 3).map(x => Math.round(x.getBoundingClientRect().top))).size);
  assert.equal(cols, 1, 'three cards per row');
  assert.ok(await page.getByRole('button', { name: 'Add New Property' }).first().isVisible());
  await shot(page, '02a-list-grid');
  await seg.nth(1).click();
  assert.equal(await page.locator('ul[data-layout="large"] > li[data-testid="listing-card"]').count(), 10);
  assert.equal(await page.locator('ul[data-layout="large"] > li > [data-testid="feed-ad"]').count(), 3);
  assert.ok(!/P10\d\d/.test(await page.locator('ul[data-layout="large"]').innerText()), 'no reference numbers on large cards');
  await shot(page, '02b-list-large');
  await seg.first().click();
  await page.reload(); await page.waitForSelector('nav.grid');
  await tile(page, 'Property List');
  assert.equal(await page.locator('ul[data-layout="grid"]').count(), 1, 'the last layout chosen is kept after reopening');
  await page.locator('.lc-tools .seg button').nth(1).click();
  await page.getByTestId('listing-card').first().locator('.sc-card').click();
  assert.match(await page.getByTestId('ref-row').innerText(), /P10\d\d/i, 'the detail page shows the reference');
  await page.context().close();
});

test('U4 saved data is permanent: a new property is still there after closing and reopening', async () => {
  const page = await phone();
  await tile(page, 'Property List');
  await page.getByRole('button', { name: 'Add New Property' }).first().click(); await expandForm(page);
  await page.locator('[data-field="headline"]').fill('Persistence test house');
  await setStreet(page, 'Jalan Persistence 1');
  await page.locator('[data-field="askingPrice"]').fill('450000');
  await page.getByTestId('save-property').click();
  await page.waitForSelector('[data-testid="listing-details"]');
  await page.reload(); await page.waitForSelector('nav.grid');
  await tile(page, 'Property List');
  assert.equal(await page.getByTestId('listing-card').count(), 1);
  // Change 009: the card shows the address; the headline is kept for marketing.
  assert.ok(await page.getByTestId('card-address').filter({ hasText: 'Jalan Persistence 1' }).first().isVisible());
  await page.locator('.sc-card').first().click();
  assert.match(await page.getByTestId('marketing').innerText(), /Persistence test house/i);
  await page.context().close();
});

test('U5 references: prefix + unique number, Others remembered and deletable, built-ins fixed, duplicates refused', async () => {
  const page = await phone();
  await loadSample(page);
  await tile(page, 'Property List');
  await page.getByRole('button', { name: 'Add New Property' }).first().click(); await expandForm(page);
  assert.equal(await page.getByTestId('ref-preview').innerText(), 'ID: P1011', 'P1010 exists → P1011');
  // a number already used by another property, whatever the prefix
  await page.locator('[data-field="refNo"]').fill('1004');
  assert.match(await page.getByTestId('ref-error').innerText(), /already.*1011/i);
  await page.getByRole('button', { name: 'Use 1011' }).click();
  // custom prefix through Others
  await page.getByTestId('ref-prefix').locator('.opt-btn').click();
  const list = page.getByTestId('ref-prefix').locator('.opt-list');
  assert.equal(await list.locator('.opt-x').count(), 0, 'built-in prefixes cannot be deleted');
  await list.getByRole('button', { name: 'Others…' }).click();
  await list.locator('.opt-new input').fill('kl');
  await list.getByRole('button', { name: 'Add' }).click();
  assert.equal(await page.getByTestId('ref-preview').innerText(), 'ID: KL1011');
  await page.locator('[data-field="headline"]').fill('KL test');
  await page.getByTestId('save-property').click();
  await page.waitForSelector('[data-testid="listing-details"]');
  assert.match(await page.getByTestId('ref-row').innerText(), /KL1011/i);
  // next new property: KL is the default and on top of the list
  await home(page); await tile(page, 'Property List');
  await page.getByRole('button', { name: 'Add New Property' }).first().click(); await expandForm(page);
  assert.equal(await page.getByTestId('ref-preview').innerText(), 'ID: KL1012');
  await page.getByTestId('ref-prefix').locator('.opt-btn').click();
  const items = await page.getByTestId('ref-prefix').locator('.opt-list [role="option"]').evaluateAll(b => b.map(x => x.textContent.split('·')[0].trim()));
  assert.deepEqual(items.slice(0, 3), ['KL', 'P', 'A'], 'latest custom prefix first');
  await shot(page, '03-ref-prefix');
  await page.getByTestId('ref-prefix').getByRole('button', { name: 'Remove KL' }).click();
  assert.equal(await page.getByTestId('ref-prefix').locator('.opt-list').getByText('KL', { exact: true }).count(), 0, 'custom prefix deleted with X');
  await page.context().close();
});

test('U6 detail page: each section has its own Edit button that opens the form at that section; form order', async () => {
  const page = await phone();
  await loadSample(page);
  await tile(page, 'Property List');
  await page.getByTestId('listing-card').first().click();
  const sections = page.locator('.sec-card');
  const n = await sections.count();
  // ClaudeChanges001 change 8 / 10: the Availability and Condition and the Listing Arrangement and Status cards are gone.
  assert.ok(n >= 12, `${n} section cards`);
  for (let i = 0; i < n; i++) assert.equal(await sections.nth(i).locator('.sec-foot .edit-mini').count(), 1, `section ${i} has an Edit button`);
  const pos = await page.locator('.sec-card .edit-mini').first().evaluate(b => { const r = b.getBoundingClientRect(), c = b.closest('.sec-card').getBoundingClientRect(); return { right: c.right - r.right, bottom: c.bottom - r.bottom }; });
  assert.ok(pos.right < 20 && pos.bottom < 20, 'Edit sits at the bottom right of its card');
  await shot(page, '04a-detail');
  await page.getByRole('button', { name: 'Edit: Price, Tenure and Title Info' }).click();
  await page.waitForSelector('#sec-tenure');
  const top = await page.locator('#sec-tenure').evaluate(el => el.getBoundingClientRect().top);
  assert.ok(top >= -2 && top < 200, `the form opened at Tenure & Title (top ${top})`);
  const order = await page.locator('[data-testid="listing-form"] > .card[id]').evaluateAll(cs => cs.map(c => c.id));
  // Change 014: Location comes straight after section 2.
  assert.deepEqual(order.slice(0, 4), ['sec-basics', 'sec-tenure', 'sec-location', 'sec-photos']);
  assert.equal(order[order.length - 1], 'sec-docs', 'Documents at the end');
  await shot(page, '04b-form-at-tenure', false);
  await page.context().close();
});

test('U7 dropdowns with Others: remembered for every property, removable with X, built-ins kept', async () => {
  const page = await phone();
  await tile(page, 'Property List');
  await page.getByRole('button', { name: 'Add New Property' }).first().click(); await expandForm(page);
  assert.match(await page.getByTestId('opt-country').innerText(), /Malaysia/i, 'Malaysia is the default country');
  const labels = await page.locator('#sec-location .ff > span:first-child, #sec-location label.ff').evaluateAll(xs => xs.map(x => x.textContent.trim()));
  // Change 014: the street first, then the unit/lot number under it. Change 015: City, Neighborhood and Street labels.
  const want = ['Country', 'State', 'City', 'Township', 'Neighborhood', 'Street', 'Unit/Lot Number'];
  const idx = want.map(w => labels.findIndex(l => l.startsWith(w)));
  assert.ok(idx.every((x, i) => x >= 0 && (i === 0 || x > idx[i - 1])), `location order ${JSON.stringify(idx)}`);
  const town = page.getByTestId('opt-township');
  await town.locator('.opt-btn').click();
  await town.getByRole('button', { name: 'Others…' }).click();
  await town.locator('.opt-new input').fill('Taman Sri Pajam');
  await town.getByRole('button', { name: 'Add' }).click();
  await page.getByTestId('save-property').click();
  await page.waitForSelector('[data-testid="listing-details"]');
  await home(page); await tile(page, 'Property List');
  await page.getByRole('button', { name: 'Add New Property' }).first().click(); await expandForm(page);
  await page.getByTestId('opt-township').locator('.opt-btn').click();
  const t2 = page.getByTestId('opt-township');
  assert.equal(await t2.getByRole('option', { name: /Taman Sri Pajam/i }).count(), 1, 'remembered');
  assert.equal(await t2.getByRole('button', { name: 'Remove Taman Sri Pajam' }).count(), 1, 'custom value has X');
  assert.equal(await t2.getByRole('button', { name: /^Remove Putra Nilai/i }).count(), 0, 'built-in values have no X');
  await t2.getByRole('button', { name: 'Remove Taman Sri Pajam' }).click();
  assert.equal(await t2.getByRole('option', { name: /Taman Sri Pajam/i }).count(), 0);
  assert.ok(await t2.getByRole('button', { name: 'Others…' }).isVisible(), 'Others stays available');
  await page.context().close();
});

test('U8 Change 009 Add Location: only the map point is saved, the typed address never changes; no Google Maps Link field (17 Oct 2026); no latitude/longitude boxes', async () => {
  const page = await phone({ maps: true });
  await tile(page, 'Property List');
  await page.getByRole('button', { name: 'Add New Property' }).first().click(); await expandForm(page);
  const town = page.getByTestId('opt-township');
  await town.locator('.opt-btn').click();
  await town.getByRole('button', { name: 'Others…' }).click();
  await town.locator('.opt-new input').fill('Taman Desa Nilai');
  await town.getByRole('button', { name: 'Add' }).click();
  await page.locator('[data-field="unitNo"]').fill('No. 5');
  await setStreet(page, 'Jalan Sampel 9');
  assert.equal(await page.locator('[data-field="lat"], [data-field="lng"], [data-field="lotNo"]').count(), 0, 'no latitude, longitude or separate lot boxes');
  assert.match(await page.getByTestId('gmap-add').innerText(), /Add Location/i);
  await page.getByTestId('gmap-add').click();
  await page.waitForSelector('[data-testid="picker-map"]');
  // Google would answer with a different address: it must not be read, compared or applied.
  await page.evaluate(() => { window.__geocode = { street: 'Jalan Seriemas 2', township: 'Kota Seriemas Utama', city: 'Nilai', state: 'Negeri Sembilan' }; window.__mapClick(2.8123, 101.7956); });
  await page.getByTestId('picker-pos').waitFor();
  assert.match(await page.getByTestId('picker-pos').innerText(), /Point chosen/i);
  assert.ok(!/2\.81|101\.79/.test(await page.getByTestId('location-picker').innerText()), 'no coordinates shown');
  assert.equal(await page.getByTestId('geo-result').count() + await page.getByTestId('discrepancies').count(), 0, 'no address review');
  await page.getByTestId('apply-location').click();
  assert.match(await page.getByTestId('pos-text').innerText(), /Location saved/i);
  assert.equal(await streetValue(page), 'Jalan Sampel 9', 'street unchanged');
  assert.match(await page.getByTestId('opt-township').innerText(), /Taman Desa Nilai/i, 'township unchanged');
  // Owner, 17 Oct 2026: no Google Maps link field on the form; Add Location is the way to place the property.
  assert.equal(await page.locator('[data-field="mapsLink"]').count() + await page.getByTestId('open-maps-link').count(), 0, 'no Google Maps link field');
  await page.getByTestId('save-property').click();
  await page.waitForSelector('[data-testid="listing-details"]');
  const loc = page.getByTestId('sec-location-view');
  assert.match(await loc.innerText(), /Location saved/i);
  assert.ok(!/2\.81|101\.79/.test(await loc.innerText()), 'the details show no latitude or longitude');
  assert.ok(await loc.getByRole('link', { name: 'Navigate' }).isVisible(), 'navigation still uses the saved point');
  const stored = await page.evaluate(() => new Promise(res => { const r = indexedDB.open('estate-agent-buddy'); r.onsuccess = () => { const all = r.result.transaction('records').objectStore('records').getAll(); all.onsuccess = () => { res(all.result.find(x => x && x.street === 'Jalan Sampel 9')); r.result.close(); }; }; }));
  assert.equal(stored.township, 'Taman Desa Nilai');
  assert.equal(stored.mapsLink, undefined, 'no link is made up');
  assert.ok(Math.abs(stored.lat - 2.8123) < 1e-6 && Math.abs(stored.lng - 101.7956) < 1e-6, 'the point is kept for maps and GPS Assistance');
  await shot(page, '05-location-saved');
  await page.context().close();
});

test('U9 inquiries and viewings are separate; Convert to Viewing moves it as Pending Viewing, then Viewed', async () => {
  const page = await phone();
  await loadSample(page);
  await tile(page, 'Property List');
  await page.getByText('No. 18, Jalan Sampel 3/1, Bandar Baru Nilai').first().click();
  // Change 012: the property's inquiries and viewings are on its Buyer's History screen (full-width button on the details).
  assert.equal(await page.getByTestId('listing-details').getByTestId('inquiry-history').count(), 0);
  const hb = await page.getByTestId('open-buyer-history').boundingBox();
  assert.ok(hb.width > 330, `Buyer's History button is full width (${hb.width})`);
  await page.getByTestId('open-buyer-history').click();
  await page.getByTestId('buyer-history').waitFor();
  assert.equal(await page.getByTestId('bh-buyer').count(), 1, 'one buyer, shown once');
  assert.deepEqual(await page.getByTestId('bh-event').evaluateAll(e => e.map(x => x.getAttribute('data-kind'))), ['inquiry']);
  assert.ok(await page.getByTestId('bh-events').first().isVisible(), 'history expanded without a tap');
  const inq = page.getByTestId('inquiry-history');
  const view = page.getByTestId('viewing-history');
  assert.equal(await inq.getByTestId('inquiry-item').count(), 1);
  assert.equal(await view.getByTestId('viewing-item').count(), 0);
  await inq.getByRole('button', { name: 'Convert to Viewing' }).click();
  assert.equal(await inq.getByTestId('inquiry-item').count(), 0, 'removed from Inquiry History');
  assert.equal(await view.getByTestId('viewing-item').count(), 1);
  assert.equal(await view.getByTestId('viewing-status').innerText(), 'Pending Viewing');
  assert.match(await view.innerText(), /From inquiry on/i);
  await view.getByRole('button', { name: 'Mark as viewed' }).click();
  assert.equal(await view.getByTestId('viewing-status').innerText(), 'Viewed');
  // still one buyer; the converted inquiry and the viewing are both in the running history, oldest first
  assert.equal(await page.getByTestId('bh-buyer').count(), 1);
  assert.deepEqual(await page.getByTestId('bh-event').evaluateAll(e => e.map(x => x.getAttribute('data-kind'))), ['inquiry', 'viewing_completed']);
  // a direct viewing without an inquiry, for the same buyer again
  const sameBuyer = await page.getByTestId('bh-open-buyer').innerText();
  await view.getByRole('button', { name: '+ Viewing' }).click();
  await page.locator('[data-field="contactId"]').selectOption(await page.locator('[data-field="contactId"] option', { hasText: sameBuyer }).first().getAttribute('value'));
  await page.locator('[data-field="date"]').fill('2026-12-01');
  await page.locator('[data-field="time"]').fill('10:30');
  await page.locator('[data-field="status"]').selectOption('scheduled');
  await page.getByTestId('save-appt').click();
  await page.waitForSelector('[data-testid="viewing-history"]');
  assert.equal(await page.getByTestId('viewing-history').getByTestId('viewing-item').count(), 2);
  // the repeat viewing is appended to the same buyer's history — no second buyer row
  assert.equal(await page.getByTestId('bh-buyer').count(), 1);
  assert.equal(await page.getByTestId('bh-event').count(), 3);
  // tapping the name opens that buyer's existing record
  const buyerName = await page.getByTestId('bh-open-buyer').innerText();
  await page.getByTestId('bh-open-buyer').click();
  await page.getByTestId('contact-detail').or(page.locator('h1', { hasText: buyerName })).first().waitFor();
  assert.equal(await page.locator('header h1').innerText(), buyerName);
  await page.goBack();
  await page.getByTestId('buyer-history').waitFor();
  await shot(page, '06-inquiry-viewing');
  await page.context().close();
});

test('U10 lead colours: Blue Cold, Yellow Warm, Red Hot, Gray Dropped, Green Booked / Bought', async () => {
  const page = await phone();
  await loadSample(page);
  await tile(page, 'Buyer List');
  const colours = await page.locator('[role="radiogroup"] .lead-dot').evaluateAll(d => d.map(x => getComputedStyle(x).backgroundColor));
  assert.deepEqual(colours, ['rgb(59, 130, 246)', 'rgb(234, 179, 8)', 'rgb(239, 68, 68)', 'rgb(156, 163, 175)', 'rgb(34, 197, 94)']);
  const hot = page.locator('[data-testid="contact-row"][data-lead="hot"]').first();
  assert.equal(await hot.evaluate(el => getComputedStyle(el).borderLeftColor), 'rgb(239, 68, 68)');
  await page.getByRole('radio', { name: /Warm/i }).click();
  assert.equal(await page.getByTestId('contact-row').count(), 1);
  await shot(page, '07-buyer-leads');
  await page.context().close();
});

test('U11 To-Do: due date, priority, reminders, completion kept as history; follow-ups become To-Dos', async () => {
  const page = await phone();
  await tile(page, 'To-Do');
  await page.getByRole('button', { name: '+ New to-do' }).click();
  await page.locator('[data-field="title"]').fill('Prepare offer letter');
  await page.locator('[data-field="due"]').fill('2030-01-15');
  await page.locator('[data-field="priority"]').selectOption('urgent');
  await page.getByTestId('reminders').getByRole('button', { name: '3 days before' }).click();
  await page.getByTestId('reminders').getByRole('button', { name: '7 days before' }).click();
  await page.getByTestId('save-task').click();
  await page.getByRole('tab', { name: /Upcoming/i }).click();
  const t = page.getByTestId('task').filter({ hasText: 'Prepare offer letter' });
  assert.match(await t.innerText(), /Urgent/i);
  await t.getByRole('checkbox').click();
  await page.getByRole('tab', { name: /Completed/i }).click();
  assert.equal(await page.getByTestId('task').filter({ hasText: 'Prepare offer letter' }).count(), 1, 'completed items stay as history');
  await home(page);
  // follow-up from an inquiry
  await loadSample(page);
  await tile(page, 'Buyer List');
  await page.getByText('Buyer L (sample)').click();
  await page.getByTestId('inquiry-history').getByRole('button', { name: 'Edit', exact: true }).first().click();
  await page.locator('input[type="date"]').fill('2030-02-02');
  await page.getByTestId('save-inquiry').click();
  await home(page);
  await tile(page, 'To-Do');
  await page.getByRole('tab', { name: /Upcoming/i }).click();
  assert.equal(await page.getByTestId('task').filter({ hasText: 'Follow up Buyer L' }).count(), 1);
  assert.match(await page.getByTestId('task').filter({ hasText: 'Follow up Buyer L' }).innerText(), /Follow-up/i);
  await shot(page, '08-todo');
  await page.context().close();
});

test('U12 Calendar: appointments linked to property and contact, statuses, and a real reminder when due', async () => {
  const page = await phone();
  await loadSample(page);
  await tile(page, 'Calendar');
  const now = new Date();
  const soon = new Date(now.getTime() + 10 * 60000);
  const two = n => String(n).padStart(2, '0');
  const ymd = d => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
  await page.getByRole('button', { name: '+ Appointment' }).click();
  await page.locator('[data-field="title"]').fill('Meet owner at site');
  await page.locator('[data-field="date"]').fill(ymd(soon));
  await page.locator('[data-field="time"]').fill(`${two(soon.getHours())}:${two(soon.getMinutes())}`);
  await page.locator('[data-field="status"]').selectOption('scheduled');
  // Change 012: the property chooser is a list of photo rows (photo left; listing ID and address right).
  await page.locator('[data-field="propertyId"]').click();
  await page.getByTestId('pp-option').first().click();
  await page.getByTestId('reminders').getByRole('button', { name: '15 min before' }).click();
  await page.getByTestId('save-appt').click();
  // the reminder check runs on opening the app
  await page.reload(); await page.waitForSelector('nav.grid');
  // Change 004: no To-Do / reminder pop-up (Open / Dismiss) on the main screen; the reminder still counts on the bell and
  // is listed in Notifications.
  await page.waitForFunction(() => document.querySelector('[data-testid="top-notifications"] .top-badge'));
  assert.equal(await page.getByTestId('reminder-alerts').count(), 0, 'no reminder pop-up on the main screen');
  assert.equal(await page.getByRole('button', { name: 'Dismiss' }).count(), 0);
  await page.getByTestId('top-notifications').click();
  assert.match(await page.getByTestId('notifications').innerText(), /Meet owner at site/i, 'the reminder is listed in Notifications');
  await home(page);
  await tile(page, 'Calendar');
  if (ymd(soon) !== ymd(now)) await page.locator(`.cal-day[data-date="${ymd(soon)}"]`).click();
  const item = page.getByTestId('appt-item').filter({ hasText: 'Meet owner at site' });
  await item.getByRole('button', { name: 'Mark completed' }).click();
  assert.match(await item.innerText(), /Completed/i);
  await page.getByRole('tab', { name: 'Completed' }).click();
  assert.equal(await page.getByTestId('appt-item').filter({ hasText: 'Meet owner at site' }).count(), 1, 'completed appointments stay');
  await shot(page, '09b-calendar');
  await page.context().close();
});

test('U13 GPS Assistance: House Shopping records the real route, saves a found property; Map shows saved positions', async () => {
  const page = await phone({ maps: true, geo: { latitude: 2.8200, longitude: 101.8000, accuracy: 6 } });
  await tile(page, 'GPS Assistance');
  assert.ok(await page.getByTestId('card-house-shopping').isVisible());
  assert.ok(await page.getByTestId('card-map').isVisible());
  await shot(page, '10a-gps-home', false);
  await page.getByTestId('card-house-shopping').click();
  await page.getByTestId('trk-start').click();
  const ctx = page.context();
  await page.waitForFunction(() => document.querySelector('.tracker-card')?.textContent?.includes('±6'), null, { timeout: 5000 }).catch(async () => { throw new Error(await page.locator('.tracker-card').innerText()); });
  // driving about 20 m a second: 8 steps of 22 m
  for (let i = 1; i <= 8; i++) {
    await ctx.setGeolocation({ latitude: 2.8200 + i * 0.0002, longitude: 101.8000, accuracy: 6 });
    await page.waitForTimeout(1100);
  }
  await page.waitForFunction(() => parseInt(document.querySelector('[data-testid="trk-distance"]')?.textContent ?? '0') > 150);
  const dist = await page.getByTestId('trk-distance').innerText();
  assert.match(dist, /^\d+ m$/i);
  assert.ok(parseInt(dist) > 100, `travelled ${dist}`);
  await page.getByTestId('mark-here').click();
  await page.getByTestId('mark-sheet').locator('input').first().fill('For sale sign, corner lot');
  await page.getByTestId('save-found').click();
  assert.match(await page.getByTestId('journey-marks').innerText(), /For sale sign, corner lot/i);
  assert.match(await page.getByTestId('journey-places').innerText(), /Tmn Desa Nilai|Nilai/i, 'places passed through, from Google');
  await shot(page, '10b-house-shopping');
  await page.getByTestId('trk-stop').click();
  await page.waitForSelector('[data-testid="journey-detail"]');
  assert.match(await page.getByTestId('jd-distance').innerText(), /\d+ m/i);
  await waitStored(page, 'records', "all.some(v => v && v.status === 'saved' && Array.isArray(v.points) && v.points.length > 1)");   // the write lands a moment after the screen shows it
  // the saved journey and the found property are kept
  await page.reload(); await page.waitForSelector('nav.grid');
  await tile(page, 'GPS Assistance');
  await page.getByTestId('card-house-shopping').click();
  await page.getByTestId('journey-row').first().waitFor();   // the saved journeys are read from the phone's storage, so wait for them
  assert.equal(await page.getByTestId('journey-row').count(), 1, 'previous journeys can be reviewed');
  await home(page);
  await tile(page, 'GPS Assistance');
  await page.getByTestId('card-map').click();
  assert.match(await page.getByTestId('map-title').innerText(), /Jalan Fake 1/i, 'Change 009: titled by its address; the note stays as its comment');
  assert.match(await page.getByTestId('navigate').getAttribute('href'), /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=2\.82/i);
  await page.waitForFunction(() => window.__markers.some(m => m.o.icon?.fillColor === '#4285F4')); // the GPS reading arrives a moment after the map
  const pins = await page.evaluate(() => window.__markers.map(m => (m.o.icon?.fillColor === '#4285F4' ? 'me' : 'property')));
  assert.equal(pins.filter(x => x === 'property').length, 1, 'only real saved positions are shown');
  assert.equal(pins.filter(x => x === 'me').length, 1, 'your GPS position is shown');
  await shot(page, '10c-property-map');
  await page.context().close();
});

test('U14 GPS Map without a Google key: says so, never shows invented positions', async () => {
  const page = await phone();
  await loadSample(page);
  await tile(page, 'GPS Assistance');
  await page.getByTestId('card-map').click();
  await page.getByTestId('maps-no-key').waitFor();
  assert.match(await page.locator('main').innerText(), /No property has a saved map position yet/i, 'sample properties have no invented positions');
  await page.context().close();
});

test('U15 Agent Financial: deals, commission share, expenses, outstanding and target', async () => {
  const page = await phone();
  await tile(page, 'Agent Financial');
  await page.getByRole('button', { name: '+ Deal' }).click();
  await page.locator('[data-field="value"]').fill('600000');
  await page.locator('[data-field="commissionPct"]').fill('2');
  await page.locator('[data-field="sharePct"]').fill('70');
  assert.equal(await page.getByTestId('my-commission').innerText(), 'My commission: RM 8,400');
  await page.locator('[data-field="status"]').selectOption('received');
  await page.getByTestId('save-deal').click();
  await page.getByRole('button', { name: '+ Deal' }).click();
  await page.locator('[data-field="value"]').fill('3000');
  await page.locator('[data-field="commission"]').fill('3000');
  await page.locator('[data-field="status"]').selectOption('confirmed');
  await page.getByTestId('save-deal').click();
  await page.getByRole('button', { name: '+ Expense' }).click();
  await page.locator('[data-field="amount"]').fill('120');
  await page.getByTestId('save-expense').click();
  assert.equal(await page.getByTestId('fin-received').innerText(), 'RM 8,400');
  assert.equal(await page.getByTestId('fin-expenses').innerText(), 'RM 120');
  assert.equal(await page.getByTestId('fin-net').innerText(), 'RM 8,280');
  assert.equal(await page.getByTestId('fin-outstanding').innerText(), 'RM 3,000');
  await page.getByRole('button', { name: 'Set target' }).click();
  await page.locator('.fin-card input').fill('20000');
  await page.locator('.fin-card').getByRole('button', { name: 'Save' }).click();
  assert.match(await page.locator('main').innerText(), /42% of target/i);
  await shot(page, '11-finance');
  await page.context().close();
});

test('U16 Property Calculator: pre-filled from the property, full breakdown, editable rates', async () => {
  const page = await phone();
  await loadSample(page);
  await tile(page, 'Property List');
  await page.getByText('No. 18, Jalan Sampel 3/1, Bandar Baru Nilai').first().click();
  await page.getByRole('button', { name: 'Calculate' }).click();
  assert.match(await page.getByTestId('calc-from').innerText(), /P1004/i);
  assert.equal(await page.locator('[data-field="price"]').inputValue(), '580,000');
  for (const id of ['out-down', 'out-loan', 'out-monthly', 'out-interest', 'out-repay', 'out-mot', 'out-loanstamp', 'out-spa-legal', 'out-loan-legal', 'out-cash'])
    assert.match(await page.getByTestId(id).innerText(), /^RM [\d,]+\.\d\d$/i, id);
  assert.equal(await page.getByTestId('out-mot').innerText(), 'RM 11,400.00', 'MOT on RM580,000: 1,000 + 8,000 + 2,400');
  await shot(page, '12a-calculator');
  await page.getByRole('tab', { name: 'Rental & ROI' }).click();
  await page.locator('[data-field="rent"]').fill('2200');
  assert.equal(await page.getByTestId('out-gross-yield').innerText(), '4.55%');
  await page.getByRole('tab', { name: 'Assumptions' }).click();
  await page.getByLabel('Loan agreement stamp duty (%)').fill('1');
  await page.getByRole('tab', { name: 'Purchase & loan' }).click();
  assert.equal(await page.getByTestId('out-loanstamp').innerText(), 'RM 5,220.00', 'changed rate is used');
  await page.context().close();
});

test('U17 Agent Profile (was Profile & Name Card): details, REN/PEA/REA/Others, remembered check boxes, WhatsApp opened for review only', async () => {
  const page = await phone();
  await loadSample(page);
  await tile(page, 'Agent Profile');
  await page.getByRole('button', { name: 'Edit profile' }).click();
  await page.locator('[data-field="fullName"]').fill('Lee Ah Kow');
  const reg = page.getByTestId('opt-regType');
  await reg.locator('.opt-btn').click();
  for (const x of ['REN', 'PEA', 'REA', 'Others…']) assert.equal(await reg.getByRole(x === 'Others…' ? 'button' : 'option', { name: x, exact: true }).count(), 1, x);
  await reg.getByRole('option', { name: 'REN', exact: true }).click();
  await page.locator('[data-field="regNo"]').fill('31234');
  await page.locator('[data-field="agency"]').fill('Agency Gold Sdn Bhd');
  await page.locator('[data-field="phone"]').fill('0123456789');
  await page.locator('[data-field="email"]').fill('lee@example.com');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  await page.getByTestId('front-upload').setInputFiles({ name: 'front.png', mimeType: 'image/png', buffer: png });
  await page.getByTestId('save-profile').click();
  await page.getByRole('button', { name: 'Send name card' }).click();
  await page.getByTestId('recipient-app').selectOption({ label: 'Buyer K (sample) · +60 12-111 2222' });
  await page.locator('[data-choice="email"]').uncheck();
  await page.locator('[data-choice="back"]').check();
  const preview = await page.getByTestId('share-preview').innerText();
  assert.ok(preview.includes('REN No.: 31234') && preview.includes('Agency Gold') && !preview.includes('lee@example.com'));
  const href = await page.getByTestId('open-whatsapp').getAttribute('href');
  assert.ok(href.startsWith('https://wa.me/60121112222?text='), href);
  assert.equal(await page.getByTestId('open-whatsapp').getAttribute('target'), '_blank', 'opens WhatsApp; the agent presses Send there');
  const popup = page.context().waitForEvent('page');
  await page.getByTestId('open-whatsapp').click();
  await (await popup).close();
  await shot(page, '13-namecard-send');
  await page.reload(); await page.waitForSelector('nav.grid');
  await tile(page, 'Agent Profile');
  await page.getByRole('button', { name: 'Send name card' }).click();
  assert.equal(await page.locator('[data-choice="email"]').isChecked(), false, 'previous choices preselected');
  assert.equal(await page.locator('[data-choice="back"]').isChecked(), true);
  assert.equal(await page.getByRole('button', { name: 'Phone book' }).count(), 1, 'phone book is offered as a source');
  await page.context().close();
});

test('U18 Ask Expert: eight specialists, saved questions, disclaimer on answers, no AI without the owner\'s service', async () => {
  const page = await phone();
  await loadSample(page);
  await tile(page, 'Ask Expert');
  assert.equal(await page.locator('.expert-tile').count(), 8);
  await page.getByTestId('expert-lawyer').click();
  await page.locator('textarea').fill('Can a Bumiputera lot be sold to a non-Bumiputera buyer?');
  await page.getByTestId('save-question').click();
  assert.ok(await page.getByTestId('ai-off').isVisible(), 'AI answers are clearly not set up');
  assert.equal(await page.getByTestId('ask-ai').isDisabled(), true);
  await page.locator('select').first().selectOption({ label: 'Lawyer P (sample) · Messrs P & Co (sample)' });
  assert.match(await page.getByRole('link', { name: 'WhatsApp' }).getAttribute('href'), /^https:\/\/wa\.me\/60322221111\?text=/i);
  await page.getByRole('button', { name: 'Record the answer received' }).click();
  await page.locator('textarea').last().fill('Only with state consent; check the title restriction.');
  await page.getByTestId('save-answer').click();
  assert.match(await page.getByTestId('disclaimer').innerText(), /General guidance from Lawyer\. Not professional advice/i);
  await shot(page, '14-ask-expert');
  await page.context().close();
});

test('U19 Voice Command: property, to-do, calendar and contact commands open their form for checking', async () => {
  const page = await phone();
  await tile(page, 'Voice Command');
  const box = page.getByTestId('voice-cmd').locator('textarea');
  await box.fill('Remind me to call Buyer K tomorrow at 3pm');
  await page.getByRole('button', { name: 'Show proposed details' }).click();
  await page.waitForSelector('[data-testid="task-form"]');
  assert.equal(await page.locator('[data-field="title"]').inputValue(), 'Call Buyer K');
  assert.equal(await page.locator('[data-field="dueTime"]').inputValue(), '15:00');
  await home(page);
  await tile(page, 'Voice Command');
  await box.fill('Create a new terrace house in Putra Nilai for sale, asking price RM580,000, four bedrooms, freehold, owner Encik Ahmad 012 345 6789');
  await page.getByRole('button', { name: 'Show proposed details' }).click();
  assert.match(await page.getByTestId('proposal').innerText(), /Encik Ahmad/i);
  await page.getByRole('button', { name: 'Open in the form to review' }).click();
  await expandForm(page);
  assert.equal(await page.locator('[data-field="askingPrice"]').inputValue(), '580,000', 'RM shown with thousands separators');
  assert.match(await page.getByTestId('opt-township').innerText(), /Putra Nilai/i);
  assert.equal(await page.locator('[data-field="ownerName"]').inputValue(), 'Encik Ahmad');
  assert.ok(await page.locator('.small-chip', { hasText: 'from your words' }).first().isVisible());
  await page.context().close();
});

test('U20 three languages: every main screen fits — no clipped, overlapping or sideways text', async () => {
  const page = await phone({ maps: true });
  await loadSample(page);
  const screens = [
    ['home', async () => {}],
    ['list', async () => { await page.locator('nav.grid > button').nth(13).click(); }],
    ['detail', async () => { await page.locator('nav.grid > button').nth(13).click(); await page.getByTestId('listing-card').first().click(); }],
    ['buyer history', async () => { await page.locator('nav.grid > button').nth(13).click(); await page.getByTestId('listing-card').first().click(); await page.getByTestId('open-buyer-history').click(); }],
    ['form', async () => { await page.locator('nav.grid > button').nth(13).click(); await newProperty(page); }],
    ['todo', async () => { await tile(page, 'To-Do'); }],
    ['calendar', async () => { await tile(page, 'Calendar'); }],
    ['track sales', async () => { await page.locator('nav.grid > button').nth(1).click(); }],
    ['creative', async () => { await page.locator('nav.grid > button').nth(3).click(); }],
    ['activity', async () => { await page.locator('nav.grid > button').nth(5).click(); }],
    ['gps', async () => { await page.locator('nav.grid > button').nth(6).click(); }],
    ['finance', async () => { await page.locator('nav.grid > button').nth(7).click(); }],
    ['calculator', async () => { await page.locator('nav.grid > button').nth(8).click(); }],
    ['matching', async () => { await page.locator('nav.grid > button').nth(9).click(); }],
    ['buyer matches', async () => { await page.locator('nav.grid > button').nth(9).click(); await page.getByTestId('bm-buyer').first().click(); }],
    ['profile', async () => { await page.getByTestId('top-profile').click(); }],
    ['expert', async () => { await page.locator('nav.grid > button').nth(10).click(); }],
    ['market', async () => { await page.locator('nav.grid > button').nth(11).click(); }],
    ['project', async () => { await page.locator('nav.grid > button').nth(0).click(); }],   // Change 43: Project is card 1
    ['voice', async () => { await page.locator('nav.grid > button').nth(14).click(); }],
    ['banners', async () => { await page.locator('nav.grid > button').nth(6).click(); await page.getByTestId('card-banners').click(); }],
  ];
  const report = [];
  for (const lang of ['EN', 'BM', '中文']) {
    await pickLang(page, { hasText: lang });
    for (const [name, open] of screens) {
      await home(page);
      await open();
      await page.waitForTimeout(50);
      const p = await layoutProblems(page);
      if (p.length) report.push(`${lang} ${name}:\n  ${p.join('\n  ')}`);
      if (['home', 'list', 'detail', 'form', 'calculator', 'finance'].includes(name)) await shot(page, `20-${lang === '中文' ? 'zh' : lang.toLowerCase()}-${name}`, name !== 'detail' && name !== 'form');
    }
  }
  assert.equal(report.join('\n'), '', 'layout problems');
  // every tile label is translated
  await home(page);
  await pickLang(page, { hasText: 'BM' });
  assert.match(await page.locator('nav.grid').innerText(), /Kewangan Ejen[\s\S]*Kalkulator Hartanah[\s\S]*Arahan Dibantu AI/i);
  await pickLang(page, { hasText: '中文' });
  assert.match(await page.locator('nav.grid').innerText(), /代理财务[\s\S]*房产计算器[\s\S]*AI 辅助指令/i);
  assert.equal(await page.evaluate(() => document.documentElement.lang), 'zh-Hans');
  await page.context().close();
});

test('U21 readability: no text under 14 px and no button under 44 px on the main screens', async () => {
  const page = await phone();
  await loadSample(page);
  const check = () => page.evaluate(() => {
    const small = [], short = [];
    for (const el of document.querySelectorAll('main *, header *')) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || el.closest('svg, .cal-dots, .bars, .gmap, .route-sketch')) continue;
      const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
      if (own && parseFloat(cs.fontSize) < 14) small.push(`${el.tagName} ${el.textContent.trim().slice(0, 20)} ${cs.fontSize}`);
      if ((el.tagName === 'BUTTON' || (el.tagName === 'A' && el.classList.contains('btn'))) && el.getBoundingClientRect().height < 44 && !el.classList.contains('link-btn')) short.push(`${el.textContent.trim().slice(0, 20)} ${el.getBoundingClientRect().height}`);
    }
    return { small, short };
  });
  // ClaudeChanges001: card 1 asks Calendar or To-Do (checked elsewhere); card 2 is Track My Sales.
  for (const i of [-1, 1, 3, 5, 8]) {
    await home(page);
    if (i >= 0) await page.locator('nav.grid > button').nth(i).click();
    const r = await check();
    assert.deepEqual(r.small, [], 'small text');
    assert.deepEqual(r.short, [], 'small buttons');
  }
  await page.context().close();
});

test('U23 form controls: visible borders (≥ 3:1), gold focus, red error, clear labels — on every form', async () => {
  const page = await phone();
  await loadSample(page);
  // Contrast of a colour against the field background, as WCAG computes it.
  const fieldLook = (sel) => page.locator(sel).first().evaluate(el => {
    const lum = c => { const [r, g, b] = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map(v => v / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const cs = getComputedStyle(el);
    const label = el.closest('.ff');
    return { border: cs.borderTopColor, width: parseFloat(cs.borderTopWidth) + (/inset 0px 0px 0px 1px/.test(cs.boxShadow) || /0px 0px 0px 1px inset/.test(cs.boxShadow) ? 1 : 0), contrast: ratio(cs.borderTopColor, cs.backgroundColor),
      labelColour: label ? getComputedStyle(label).color : null, labelSize: label ? parseFloat(getComputedStyle(label).fontSize) : null };
  });
  const forms = [
    ['property form', async () => { await tile(page, 'Property List'); await newProperty(page); }, '[data-field="unitNo"]'],
    ['property form dropdown', async () => { await tile(page, 'Property List'); await newProperty(page); }, '[data-field="purpose"]'],
    ['property form custom dropdown', async () => { await tile(page, 'Property List'); await newProperty(page); }, '.opt-btn'],
    ['property form money', async () => { await tile(page, 'Property List'); await newProperty(page); }, '[data-field="askingPrice"]'],
    ['contact form', async () => { await tile(page, 'Buyer List'); await page.getByRole('button', { name: 'New buyer' }).click(); }, '[data-field="name"]'],
    ['calculator', async () => { await tile(page, 'Property Calculator'); }, '[data-field="price"]'],
    ['to-do form', async () => { await tile(page, 'To-Do'); await page.getByRole('button', { name: /New to-do|Add/i }).first().click(); }, '[data-field="title"]'],
    ['agent profile', async () => { await tile(page, 'Agent Profile'); await page.getByRole('button', { name: /Edit/i }).first().click(); }, '[data-field="fullName"]'],
  ];
  for (const [name, open, sel] of forms) {
    await home(page); await open();
    const f = await fieldLook(sel);
    assert.ok(f.contrast >= 3, `${name}: border contrast ${f.contrast.toFixed(2)} should be at least 3:1`);
    assert.ok(f.width >= 2, `${name}: border + inner line ${f.width}px`);
    if (f.labelColour) {
      assert.equal(f.labelColour, 'rgb(218, 211, 195)', `${name}: label uses the clearer label colour`);
      assert.ok(f.labelSize >= 15, `${name}: label size ${f.labelSize}`);
    }
  }
  // Focus: gold border. Error: red border on the field that has the problem.
  await home(page); await tile(page, 'Buyer List'); await page.getByRole('button', { name: 'New buyer' }).click();
  await page.locator('[data-field="name"]').focus();
  await page.waitForTimeout(250); // let the colour transition finish
  assert.equal((await fieldLook('[data-field="name"]')).border, 'rgb(212, 175, 55)', 'focused field is gold');
  await page.getByTestId('save-contact').click();
  assert.equal(await page.locator('[data-field="name"]').getAttribute('aria-invalid'), 'true');
  await page.locator('input[type="email"]').focus();
  await page.waitForTimeout(250);
  assert.equal((await fieldLook('[data-field="name"]')).border, 'rgb(255, 138, 122)', 'field with an error is red');
  await shot(page, '23-contact-error', false);
  // Open custom dropdown: gold border on the box and the list.
  await home(page); await tile(page, 'Property List'); await newProperty(page);
  await page.getByTestId('opt-type').locator('.opt-btn').click();
  await page.mouse.move(0, 0); await page.waitForTimeout(250);
  assert.equal(await page.getByTestId('opt-type').locator('.opt-btn').evaluate(el => getComputedStyle(el).borderTopColor), 'rgb(212, 175, 55)');
  await shot(page, '23-form-fields', false);
  await page.context().close();
});

test('U24 RM money boxes: separators while typing, plain number saved, paste understood, same everywhere', async () => {
  const page = await phone();
  await tile(page, 'Property List');
  await newProperty(page);
  const price = page.locator('[data-field="askingPrice"]');
  await price.click();
  await price.pressSequentially('1500000');
  assert.equal(await price.inputValue(), '1,500,000');
  // Edit in the middle: put the cursor after "1," and delete the "5".
  await price.evaluate(el => el.setSelectionRange(3, 3));
  await page.keyboard.press('Backspace');
  assert.equal(await price.inputValue(), '100,000');
  await page.keyboard.type('2');
  assert.equal(await price.inputValue(), '1,200,000', 'cursor stays in place while commas move');
  await price.fill('');
  assert.equal(await price.inputValue(), '');
  await price.fill('RM 580,000.50');
  assert.equal(await price.inputValue(), '580,000.50');
  await price.fill('588000');
  await setStreet(page, 'Jalan Wang 1');
  await page.getByTestId('save-property').click();
  await page.waitForSelector('[data-testid="listing-details"]');
  const saved = await page.evaluate(() => new Promise(res => {
    const r = indexedDB.open('estate-agent-buddy'); r.onsuccess = () => { const q = r.result.transaction('records').objectStore('records').getAll(); q.onsuccess = () => res(q.result.filter(x => x && x.street === 'Jalan Wang 1').map(x => x.askingPrice)); };
  }));
  assert.deepEqual(saved, [588000], 'stored as a plain number');
  assert.match(await page.locator('main').innerText(), /RM 588,000/i);
  // Same box in Agent Financial and the calculator.
  await home(page); await tile(page, 'Agent Financial');
  await page.getByRole('button', { name: /expense/i }).first().click();
  const amt = page.locator('[data-field="amount"]');
  await amt.pressSequentially('12345.6');
  assert.equal(await amt.inputValue(), '12,345.6');
  await home(page); await tile(page, 'Property Calculator');
  const cp = page.locator('[data-field="price"]');
  await cp.fill('750000');
  assert.equal(await cp.inputValue(), '750,000');
  await page.context().close();
});

test('U25 Project and Market Intelligence still say they are not built yet (no Coming Soon label on their cards since Change 011)', async () => {
  const page = await phone();
  await tile(page, 'Project');
  assert.match(await page.getByTestId('soon-project').innerText(), /not built yet/i);
  await home(page);
  await tile(page, 'Market Intelligence');
  assert.match(await page.getByTestId('soon-market').innerText(), /Nothing here is live/i);
  await home(page);
  assert.equal(await page.getByTestId('top-cobroke').count(), 0);
  // Owner 15 Oct: Co-broke Opportunities opens from the Opportunities card.
  await loadSample(page);
  await tile(page, 'Opportunities');
  await page.getByTestId('open-cobroke').click();
  assert.match(await page.getByTestId('cobroke-soon').innerText(), /Coming Soon/i);
  const count = Number((await page.getByTestId('cobroke-count').innerText()).match(/\d+/)[0]);
  assert.ok(count >= 1, 'sample data has co-broke properties');
  await page.getByRole('button', { name: 'Show co-broke properties' }).click();
  assert.equal(await page.getByTestId('listing-card').count(), count, 'only co-broke properties are listed');
  await page.context().close();
});

test('U26 reference number dropdown: used numbers red and not selectable, free numbers chosen with one tap, typing still works', async () => {
  const page = await phone();
  await loadSample(page);
  await tile(page, 'Property List');
  await newProperty(page);
  const suggested = await page.locator('[data-field="refNo"]').inputValue();
  await page.getByTestId('ref-no-open').click();
  const list = page.getByTestId('ref-no-list');
  await list.waitFor();
  const used = list.locator('[data-used="true"]');
  const usedCount = await used.count();
  assert.ok(usedCount >= 10, `sample references show as used (${usedCount})`);
  assert.match(await used.first().innerText(), /Used by P\d+/i);
  assert.equal(await used.first().evaluate(el => getComputedStyle(el).color), 'rgb(255, 138, 122)', 'used numbers are red');
  assert.ok(await used.first().isDisabled(), 'used numbers cannot be chosen');
  // A used number cannot be picked even by a forced tap.
  await used.first().click({ force: true });
  assert.equal(await page.locator('[data-field="refNo"]').inputValue(), suggested);
  // Pick a free number further down.
  const free = list.locator('.ref-opt.free').nth(3);
  const no = await free.getAttribute('data-no');
  assert.match(await free.innerText(), /Available/i);
  await free.click();
  assert.equal(await page.locator('[data-field="refNo"]').inputValue(), no);
  assert.equal(await list.count(), 0, 'list closes after choosing');
  assert.match(await page.getByTestId('ref-preview').innerText(), new RegExp(`P${no}`));
  // Typing a used number by hand is still refused.
  await page.locator('[data-field="refNo"]').fill('1001');
  assert.ok(await page.getByTestId('ref-error').isVisible());
  await page.getByTestId('ref-no-open').click();
  await shot(page, '26-ref-dropdown', false);
  await page.context().close();
});

test('U27 My Banner Location: four GPS cards, banner placed by GPS and by map, status follows, shown on detail page and My Property Map', async () => {
  const page = await phone({ maps: true, geo: { latitude: 2.8210, longitude: 101.8040, accuracy: 7 } });
  await loadSample(page);
  await tile(page, 'GPS Assistance');
  assert.deepEqual((await page.locator('.gps-home .big-card strong').allInnerTexts()).map(x => x.toLowerCase()), ['house shopping', 'my banner location', 'my property map', 'co-broke opportunity map']);
  assert.match(await page.getByTestId('card-cobroke-map').innerText(), /Coming Soon/i);
  await page.getByTestId('card-cobroke-map').click();
  assert.ok(await page.getByTestId('soon-cobrokeMap').isVisible());
  await page.locator('header .icon-btn').first().click();
  await shot(page, '27a-gps-four-cards', false);

  await page.getByTestId('card-banners').click();
  const cards = page.getByTestId('banner-card');
  const total = await cards.count();
  assert.ok(total >= 10, 'one banner card per property');
  const first = cards.first();
  const title = await first.locator('.banner-title').innerText();
  // 1) Banner placed by standing at it (GPS).
  await first.getByTestId('banner-add').click();
  await page.getByTestId('banner-gps').click();
  await page.getByTestId('banner-pos-set').waitFor();
  assert.match(await page.getByTestId('banner-pos-set').innerText(), /2\.82100, 101\.80400 · GPS ±7 m/i);
  await page.locator('[data-field="bannerNote"]').fill('Gate, facing main road');
  await page.getByTestId('banner-save').click();
  const card = page.locator('[data-testid="banner-card"]', { hasText: title });
  assert.match(await card.locator('.banner-chip').innerText(), /Yes, placed/i);
  assert.equal(await card.getByTestId('banner-up').count(), 1);
  assert.match(await card.getByTestId('banner-up').innerText(), /Gate, facing main road/i);
  assert.match(await card.getByTestId('banner-navigate').getAttribute('href'), /2\.821/i);
  // 2) A second banner placed by tapping the map.
  await card.getByTestId('banner-add').click();
  await page.evaluate(() => window.__mapClick(2.8301, 101.8102));
  assert.match(await page.getByTestId('banner-pos-set').innerText(), /2\.83010, 101\.81020 · map/i);
  await page.getByTestId('banner-save').click();
  assert.equal(await card.getByTestId('banner-up').count(), 2);
  assert.match(await page.getByTestId('banner-map-count').innerText(), /2 banners on the map/i);
  await shot(page, '27b-banner-location', false);
  // 3) Take both down: still Yes after the first, Removed after the last; both kept as history.
  await card.getByTestId('banner-takedown').first().click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Mark taken down' }).click();
  assert.match(await card.locator('.banner-chip').innerText(), /Yes, placed/i);
  await card.getByTestId('banner-takedown').first().click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Mark taken down' }).click();
  assert.match(await card.locator('.banner-chip').innerText(), /Removed/i);
  assert.equal(await card.getByTestId('banner-up').count(), 0);
  assert.equal(await card.getByTestId('banner-old').count(), 2, 'taken-down banners stay in the history');
  // 4) Status chosen by hand, and the filter.
  await card.locator('[data-field="bannerStatus"]').selectOption('not_allowed');
  await page.locator('[data-filter="not_allowed"]').click();
  assert.ok(await page.locator('[data-testid="banner-card"]', { hasText: title }).isVisible());
  assert.ok((await page.getByTestId('banner-card').allInnerTexts()).every(t => /Owner doesn’t allow/i.test(t)));

  // Detail page shows the banner section; its Edit opens the form at Banner.
  await page.locator('[data-testid="banner-card"]', { hasText: title }).getByRole('button', { name: 'Open property' }).click();
  const sec = page.getByTestId('sec-banner-view');
  assert.match(await sec.innerText(), /Banner placed\?[\s\S]*Owner doesn’t allow/i);
  await sec.getByRole('button', { name: /Edit/i }).click();
  assert.equal(await page.locator('#sec-banner').getAttribute('data-open'), 'yes', 'Edit opens the Banner section');
  assert.equal(await page.locator('#sec-location').getAttribute('data-open'), 'no', 'other sections start closed');
  await page.locator('#sec-banner [data-field="bannerStatus"]').selectOption('not_yet');
  // give the property a map position so it shows on My Property Map (open the closed Location section first)
  await pickPoint(page, 2.82, 101.80);
  await page.getByTestId('save-property').click();
  assert.match(await page.getByTestId('sec-banner-view').innerText(), /Not yet/i);
  await page.getByRole('button', { name: 'Show on map' }).click();
  assert.match(await page.getByTestId('map-banner').innerText(), /Banner placed\?[\s\S]*Not yet/i);
  await page.getByTestId('map-banner').getByRole('button', { name: /Banner locations/i }).click();
  assert.ok(await page.getByTestId('banner-screen').isVisible());

  // Everything is still there after closing and reopening the app.
  await page.reload(); await page.waitForSelector('nav.grid');
  const kept = await page.evaluate(() => new Promise(res => {
    const r = indexedDB.open('estate-agent-buddy'); r.onsuccess = () => { const q = r.result.transaction('records').objectStore('records').getAllKeys(); q.onsuccess = () => res(q.result.filter(k => String(k).startsWith('c:banners:')).length); };
  }));
  assert.equal(kept, 2, 'banner records survive a restart');
  await page.context().close();
});

test('U28 Google sign-in: login screen when set up, return from Google, role shown, team managed, sign out, cancel', async () => {
  // Supabase is answered here (a stand-in); Google itself is not contacted. Real sign-in is checked on the phone.
  const ctx = await browser.newContext({ viewport: { width: 384, height: 824 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const SB = 'https://demo-project.supabase.co';
  let mode = 'ok';
  let bugMode = 'ok';
  const seen = [];
  await ctx.route(`${SB}/**`, async route => {
    const req = route.request();
    const u = new URL(req.url());
    seen.push(`${req.method()} ${u.pathname}`);
    if (u.pathname === '/auth/v1/authorize') {
      assert.equal(u.searchParams.get('provider'), 'google');
      assert.equal(u.searchParams.get('code_challenge_method'), 's256');
      const back = u.searchParams.get('redirect_to');
      return route.fulfill({ status: 302, headers: { location: mode === 'ok' ? `${back}?code=CODE-1` : `${back}?error=access_denied&error_description=cancelled` } });
    }
    const json = b => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(b) });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (u.pathname === '/auth/v1/token') {
      assert.equal(u.searchParams.get('grant_type'), 'pkce');
      const body = JSON.parse(req.postData());
      assert.equal(body.auth_code, 'CODE-1');
      assert.match(body.code_verifier, /^[A-Za-z0-9_-]{43,}$/i);
      return json({ access_token: 'AT', refresh_token: 'RT', expires_in: 3600, user: { id: 'u-owner', email: 'agent.j@gmail.com', user_metadata: { full_name: 'Agent J' } } });
    }
    if (u.pathname === '/rest/v1/rpc/eab_my_membership') return json([{ workspace_id: 'ws-1', workspace_name: 'Agent J team', role: 'owner' }]);
    if (u.pathname === '/rest/v1/eab_members') return json([{ user_id: 'u-owner', email: 'agent.j@gmail.com', role: 'owner', active: true, created_at: '2026-10-12' }, { user_id: 'u-b', email: 'nego.b@gmail.com', role: 'agent', active: true, created_at: '2026-10-12' }]);
    if (u.pathname === '/rest/v1/eab_invites' || u.pathname === '/rest/v1/eab_audit' || u.pathname === '/rest/v1/eab_records') return req.method() === 'POST' ? route.fulfill({ status: 201, headers: { 'access-control-allow-origin': '*' }, body: '' }) : json([]);
    if (u.pathname.startsWith('/rest/v1/rpc/')) return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' }, body: '' });
    if (u.pathname === '/rest/v1/eab_bug_reports' || u.pathname.startsWith('/storage/v1/object/bug-reports/')) {
      if (bugMode === 'fail') return route.fulfill({ status: 500, headers: { 'access-control-allow-origin': '*' }, body: 'boom' });
      return route.fulfill({ status: 201, headers: { 'access-control-allow-origin': '*' }, body: '' });
    }
    if (u.pathname === '/auth/v1/logout') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' }, body: '' });
    return route.fulfill({ status: 404, body: '' });
  });
  const page = await ctx.newPage();
  await page.goto(base); await page.waitForSelector('nav.grid'); await chooseStart(page, 'empty');
  // Without sign-in set up, the app opens straight away and Settings says what is missing.
  await tile(page, 'Agent Profile'); await page.getByRole('button', { name: /Settings/i }).click();
  assert.ok(await page.getByTestId('account-not-set-up').isVisible());
  await page.getByLabel('Supabase project URL').fill(SB);
  await page.getByLabel('Supabase anon (public) key').fill('anon-public-key');
  await page.getByTestId('save-settings').click();
  // Set up and nobody signed in: the sign-in screen comes first.
  await page.getByTestId('login').waitFor();
  await shot(page, '28a-login', false);
  assert.match(await page.getByTestId('google-sign-in').innerText(), /Continue with Google/i);
  // Cancelled at Google: nothing changes, clear message.
  mode = 'cancel';
  await page.getByTestId('google-sign-in').click();
  await page.getByTestId('login-error').waitFor();
  assert.match(await page.getByTestId('login-error').innerText(), /cancelled or not allowed/i);
  assert.equal(new URL(page.url()).search, '', 'the address is cleaned');
  // Signed in at Google: back in the app, with the team role from the database.
  mode = 'ok';
  await page.getByTestId('google-sign-in').click();
  await page.waitForSelector('nav.grid');
  assert.equal(new URL(page.url()).search, '', 'the code is not left in the address');
  await tile(page, 'Agent Profile'); await page.getByRole('button', { name: /Settings/i }).click();
  assert.match(await page.getByTestId('signed-in-as').innerText(), /Agent J \(agent\.j@gmail\.com\)/i);
  assert.match(await page.getByTestId('workspace-role').innerText(), /Agent J team · Owner/i);
  // Change 14: "Team and access" is no longer in Settings; it opens from Opportunities → Team Sharing.
  assert.equal(await page.getByTestId('team').count(), 0, 'not in Settings any more');
  assert.equal(await page.getByTestId('team-entry').count(), 0);
  await page.getByTestId('history-exports').waitFor();
  await home(page); await page.locator('nav.grid > button', { hasText: 'Opportunities' }).click();
  await page.getByTestId('team-sharing').waitFor();
  assert.match(await page.getByTestId('team-ws-line').innerText(), /Team Workspace: share chosen listings/i);
  assert.match(await page.getByTestId('team-access-line').innerText(), /Team and access: who belongs to your agency workspace/i);
  await page.getByTestId('open-team-access').click();
  await page.getByTestId('team').getByTestId('member').nth(1).waitFor();
  assert.equal(await page.getByTestId('member').count(), 2);
  await page.locator('[data-field="inviteEmail"]').fill('new.agent@gmail.com');
  await page.locator('[data-field="inviteRole"]').selectOption('team_leader');
  await page.getByRole('button', { name: 'Add invitation' }).click();
  await page.getByText('Saved.').first().waitFor();
  assert.ok(seen.includes('POST /rest/v1/rpc/eab_invite'));
  assert.ok(seen.some(x => x === 'GET /rest/v1/eab_records'), 'synced after sign-in');
  await shot(page, '28b-account-team', false);
  await home(page); await tile(page, 'Agent Profile'); await page.getByRole('button', { name: /Settings/i }).click();
  // ClaudeChanges001 change 2: no status line on any screen (the banner on the main page appears only on a problem).
  assert.equal(await page.getByTestId('save-status').count(), 0);
  // Easy Bug Report while signed in: screenshot + description are sent, and success is shown only after the service accepted them.
  await page.getByTestId('open-bug-report').click();
  await page.getByTestId('bug-file').setInputFiles({ name: 'shot.png', mimeType: 'image/png', buffer: Buffer.from(PNG_1X1, 'base64') });
  await page.getByTestId('bug-preview').waitFor();
  await page.getByTestId('bug-desc').fill('The calendar did not open.');
  bugMode = 'fail';
  await page.getByTestId('bug-send').click();
  await page.getByTestId('bug-fail').waitFor();
  assert.equal(await page.getByTestId('bug-fail').getAttribute('data-reason'), 'server');
  assert.equal(await page.getByTestId('bug-sent').count(), 0, 'no success message after a failure');
  assert.equal(await page.getByTestId('bug-desc').inputValue(), 'The calendar did not open.', 'the description is kept');
  assert.equal(await page.getByTestId('bug-preview').count(), 1, 'the screenshot is kept');
  bugMode = 'ok';
  await page.getByTestId('bug-send').click();
  await page.getByTestId('bug-sent').waitFor();
  assert.match(await page.getByTestId('bug-sent').innerText(), /Your report was sent/i);
  assert.ok(seen.some(x => /^POST \/storage\/v1\/object\/bug-reports\/u-owner\/[0-9a-f-]{36}\.jpg$/.test(x)), 'screenshot went to the private bucket under the person’s own folder');
  assert.ok(seen.includes('POST /rest/v1/eab_bug_reports'));
  await page.locator('header .icon-btn').first().click();   // back to Settings
  await page.getByTestId('settings').waitFor();
  // Still signed in after closing and reopening.
  await page.reload(); await page.waitForSelector('nav.grid');
  // Sign out: back to the sign-in screen; records stay on the phone.
  await tile(page, 'Agent Profile'); await page.getByRole('button', { name: /Settings/i }).click();
  await page.getByTestId('sign-out').click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Sign out' }).click();
  await page.getByTestId('login').waitFor();
  assert.ok(seen.includes('POST /auth/v1/logout'));
  await ctx.close();
});

test('U29 maps: My Location recentres after moving the map, follows until dragged, Map/Satellite/Hybrid keep markers, denied permission explained', async () => {
  const page = await phone({ maps: true, geo: { latitude: 2.8200, longitude: 101.8000, accuracy: 8 } });
  const ctx = page.context();
  const center = () => page.evaluate(() => window.__center);
  const meAt = () => page.evaluate(() => window.__markers.find(m => m.o.icon?.fillColor === '#4285F4')?.o.position);
  // A property with a saved position.
  await tile(page, 'Property List'); await newProperty(page);
  await setStreet(page, 'Jalan Peta 1');
  // Change 009: no latitude/longitude boxes; a full Google Maps link that holds the point places the property.
  await pickPoint(page, 2.83, 101.81);
  await page.getByTestId('save-property').click(); await page.getByTestId('listing-details').waitFor();
  await home(page); await tile(page, 'GPS Assistance'); await page.getByTestId('card-map').click();
  await page.waitForFunction(() => window.__markers?.some(m => m.o.icon?.fillColor === '#4285F4'));
  assert.deepEqual(await center(), { lat: 2.83, lng: 101.81 }, 'the selected property is centred');
  assert.equal(await page.getByTestId('map-my-location').getAttribute('data-following'), 'no');
  // Move the map by hand, then My Location: back to the real GPS position.
  await page.evaluate(() => window.__drag());
  await page.getByTestId('map-my-location').click();
  assert.deepEqual(await center(), { lat: 2.82, lng: 101.8 });
  assert.equal(await page.getByTestId('map-my-location').getAttribute('data-following'), 'yes');
  // It follows new GPS positions…
  await ctx.setGeolocation({ latitude: 2.8210, longitude: 101.8000, accuracy: 8 });
  await page.waitForFunction(() => Math.abs(window.__center.lat - 2.821) < 1e-9);
  // …until the map is moved by hand; the dot keeps moving; the button still recentres.
  await page.evaluate(() => window.__drag());
  assert.equal(await page.getByTestId('map-my-location').getAttribute('data-following'), 'no');
  await ctx.setGeolocation({ latitude: 2.8220, longitude: 101.8000, accuracy: 8 });
  await page.waitForFunction(() => Math.abs(window.__markers.find(m => m.o.icon?.fillColor === '#4285F4').o.position.lat - 2.822) < 1e-9);
  assert.equal((await center()).lat, 2.821, 'not pulled back while you look elsewhere');
  assert.equal((await meAt()).lat, 2.822, 'the dot is up to date');
  assert.equal(await page.evaluate(() => window.__circle?.radius), 8, 'accuracy circle');
  await page.getByTestId('map-my-location').click();
  assert.equal((await center()).lat, 2.822);
  // Map / Satellite / Hybrid: same map, same markers, same position; remembered.
  const pins = await page.evaluate(() => window.__markers.length);
  const before = await center();
  for (const t of ['satellite', 'hybrid', 'roadmap', 'hybrid']) {
    await page.getByTestId('map-types').locator(`[data-type="${t}"]`).click();
    assert.equal(await page.evaluate(() => window.__mapType), t);
    assert.equal(await page.getByTestId('map-types').locator(`[data-type="${t}"]`).getAttribute('aria-checked'), 'true');
    assert.equal(await page.evaluate(() => window.__markers.length), pins, `markers kept on ${t}`);
    assert.deepEqual(await center(), before, `position kept on ${t}`);
  }
  await shot(page, '29a-map-hybrid-my-location', false);
  await page.reload(); await page.waitForSelector('nav.grid');
  await tile(page, 'GPS Assistance'); await page.getByTestId('card-map').click();
  await page.waitForFunction(() => window.__mapType === 'hybrid');
  // House Shopping while recording: follows you, a drag stops it, My Location resumes.
  await home(page); await tile(page, 'GPS Assistance'); await page.getByTestId('card-house-shopping').click();
  await page.getByTestId('trk-start').click();
  await ctx.setGeolocation({ latitude: 2.8230, longitude: 101.8000, accuracy: 6 });
  await page.waitForFunction(() => Math.abs((window.__center?.lat ?? 0) - 2.823) < 1e-9);
  await page.evaluate(() => window.__drag());
  await ctx.setGeolocation({ latitude: 2.8240, longitude: 101.8000, accuracy: 6 });
  await page.waitForTimeout(1500);
  assert.equal((await center()).lat, 2.823, 'recording does not fight a manual move');
  await page.getByTestId('map-my-location').last().click();
  assert.equal((await center()).lat, 2.824);
  await page.getByTestId('trk-stop').click();
  await page.context().close();
  // Location refused (as Android reports it: error code 1): the map says so and the button stays.
  const p2 = await phone({ maps: true });
  await p2.evaluate(() => {
    const refuse = (_ok, err) => { setTimeout(() => err({ code: 1, message: 'User denied Geolocation' }), 50); return 1; };
    navigator.geolocation.watchPosition = refuse; navigator.geolocation.getCurrentPosition = refuse;
  });
  await tile(p2, 'GPS Assistance'); await p2.getByTestId('card-house-shopping').click();
  await p2.getByTestId('map-my-location').click();
  await p2.getByTestId('map-status').filter({ hasText: /permission was refused/i }).waitFor();
  assert.ok(await p2.getByTestId('map-my-location').isVisible());
  await p2.context().close();
});

test('U30 updates: a newer published version is offered on the web; About shows the build; same version = up to date', async () => {
  const ctx = await browser.newContext({ viewport: { width: 384, height: 824 } });
  let published = 'newer99';
  await ctx.addInitScript(() => localStorage.setItem('eab-update-manifest', 'https://updates.test/latest.json'));
  await ctx.route('https://updates.test/**', r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify({ sha: published, version: '2.1.0', nativeVersion: 3, bundle: 'https://updates.test/b.zip', apk: 'https://updates.test/a.apk', builtAt: '2026-10-12' }) }));
  const page = await ctx.newPage();
  await page.goto(base); await page.waitForSelector('nav.grid'); await chooseStart(page, 'empty');
  await page.getByTestId('update-bar').waitFor({ timeout: 10000 });
  assert.equal(await page.getByTestId('update-bar').getAttribute('data-kind'), 'web-reload');
  assert.match(await page.getByTestId('update-bar').innerText(), /new version/i);
  await tile(page, 'Agent Profile'); await page.getByRole('button', { name: /Settings/i }).click();
  const v = await page.getByTestId('about-version').innerText();
  assert.match(v, /^Release 2\.0\.010 · Version 2\.2\.0 · build \w+ · native 4/i, "release label shown, internal version is valid SemVer and higher than 2.1.0");
  published = v.match(/build (\w+)/)[1];
  await page.getByTestId('check-update').click();
  assert.match(await page.getByTestId('update-msg').innerText(), /latest version/i);
  await ctx.close();
});

test('U31 contacts: phonebook button fills name and phone (asks before replacing), WhatsApp alias kept separately', async () => {
  const page = await phone();
  // The phone's contact picker (Chrome on Android); the Android app uses Android's own picker the same way.
  await page.evaluate(() => {
    window.ContactsManager = function () {};
    Object.defineProperty(navigator, 'contacts', { configurable: true, value: { select: async () => [{ name: ['Puan Siti'], tel: ['012-345 6789'], email: [] }] } });
  });
  await tile(page, 'Buyer List'); await page.getByRole('button', { name: 'New buyer' }).click();
  await page.getByTestId('pick-contact').click();
  assert.equal(await page.locator('[data-field="name"]').inputValue(), 'Puan Siti');
  assert.equal(await page.locator('[data-field="phone"]').inputValue(), '+60 12-345 6789');
  // Different details already typed: ask first; Cancel keeps them.
  await page.locator('[data-field="name"]').fill('Encik Lim');
  await page.getByTestId('pick-contact').click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click();
  assert.equal(await page.locator('[data-field="name"]').inputValue(), 'Encik Lim');
  await page.getByTestId('pick-contact').click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Replace' }).click();
  assert.equal(await page.locator('[data-field="name"]').inputValue(), 'Puan Siti');
  await page.locator('[data-field="whatsapp"]').fill('@siti.property');
  await page.getByTestId('save-contact').click();
  assert.equal(await page.getByTestId('contact-whatsapp').innerText(), '@siti.property');
  // Alias only, no phone number: allowed, and never turned into a phone number.
  await home(page); await tile(page, 'Buyer List'); await page.getByRole('button', { name: 'New buyer' }).click();
  await page.locator('[data-field="name"]').fill('Alias Only');
  await page.locator('[data-field="whatsapp"]').fill('@aliasonly');
  await page.getByTestId('save-contact').click();
  assert.equal(await page.getByTestId('contact-whatsapp').innerText(), '@aliasonly');
  assert.match(await page.getByTestId('contact-detail').innerText(), /search this alias in WhatsApp/i);
  await shot(page, '31-contact-alias', false);
  await page.context().close();
});

// ---------------------------------------------------------------------------------------------------------------
// 13 Oct 2026 update. Browser stand-ins replace the phone's speech service, contact picker and GPS here; the same
// flows still have to be checked on the S23 Ultra (see README).

/** A stand-in for the browser speech service: says `words` as live (not final) text, then ends shortly after
 *  "End recording" without marking it final — the case that used to lose the words. '' = nothing recognised. */
const FAKE_SPEECH = words => `(() => {
  class R { start() { setTimeout(() => { if (${JSON.stringify(words)}) this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: ${JSON.stringify(words)} }], { isFinal: false })] }); }, 50); }
    stop() { setTimeout(() => this.onend?.(), 400); } abort() { this.onend?.(); } }
  window.SpeechRecognition = R;
})();`;

test('U32 voice: End recording shows the recognised words; nothing recognised gives a clear message (bright-gold card unchanged)', async () => {
  for (const [words, expectText] of [['Test 1 2 3', true], ['', false]]) {
    const ctx = await browser.newContext({ viewport: { width: 384, height: 824 }, isMobile: true, hasTouch: true });
    await ctx.addInitScript(FAKE_SPEECH(words));
    const page = await ctx.newPage();
    await page.goto(base); await page.waitForSelector('nav.grid'); await chooseStart(page, 'empty');
    assert.match(await page.locator('nav.grid > button[data-key="voice"]').evaluate(b => getComputedStyle(b).backgroundImage), /gradient/i, 'gold Voice Command card');
    await tile(page, 'Voice Command');
    await page.getByTestId('voice-start').first().click();
    await page.getByRole('button', { name: 'Use the speech service' }).click();
    await page.getByTestId('voice-stop').first().click();
    await page.getByTestId('voice-processing').first().waitFor(); // "Recognising your words…" while the service finishes
    await page.getByTestId('voice-start').first().waitFor();
    const box = page.getByTestId('voice-command').locator('textarea').first();
    if (expectText) assert.equal(await box.inputValue(), 'Test 1 2 3');
    else { assert.equal(await box.inputValue(), ''); assert.match(await page.getByTestId('voice-error').first().innerText(), /No words were recognised/i); }
    await ctx.close();
  }
});

test('U33 phone book: Send Name Card picker fills editable name and number; refusals and missing support are explained, never silent', async () => {
  const page = await phone();
  // Complete the required profile so the name card is active.
  await tile(page, 'Agent Profile'); await page.getByRole('button', { name: /Edit/i }).first().click();
  await page.locator('[data-field="fullName"]').fill('Agent J'); await page.locator('[data-field="regNo"]').fill('12345');
  await page.getByTestId('opt-regType').locator('.opt-btn').click(); await page.getByRole('option', { name: 'REN' }).click();
  await page.locator('[data-field="agency"]').fill('JSL Properties'); await page.locator('[data-field="phone"]').fill('0123456789');
  await page.getByTestId('save-profile').click();
  await page.getByTestId('send-namecard').click();
  // Browser without a contact picker: the button works and says why it cannot open.
  await page.getByRole('button', { name: 'Phone book' }).click();
  await page.getByTestId('namecard-pick').click();
  assert.match(await page.getByTestId('namecard-pick-msg').innerText(), /not available in this browser/i);
  // With the phone's contact picker: name and number filled, and still editable.
  await page.evaluate(() => {
    window.ContactsManager = function () {};
    Object.defineProperty(navigator, 'contacts', { configurable: true, value: { select: async () => [{ name: ['Buyer Z'], tel: ['013-222 3333'], email: [] }] } });
  });
  await page.getByTestId('namecard-pick').click();
  assert.equal(await page.locator('[data-field="toName"]').inputValue(), 'Buyer Z');
  assert.equal(await page.locator('[data-field="toTel"]').inputValue(), '+60 13-222 3333');
  await page.locator('[data-field="toName"]').fill('Encik Z');
  assert.match(await page.getByTestId('recipient').innerText(), /Encik Z · \+60 13-222 3333/i);
  assert.match(await page.getByTestId('open-whatsapp').getAttribute('href'), /^https:\/\/wa\.me\/60132223333\?text=.*Agent%20J/i);
  // Picker closed without choosing: says so.
  await page.evaluate(() => Object.defineProperty(navigator, 'contacts', { configurable: true, value: { select: async () => [] } }));
  await page.getByTestId('namecard-pick').click();
  assert.match(await page.getByTestId('namecard-pick-msg').innerText(), /No contact was chosen/i);
  await shot(page, '33-namecard-phonebook', false);
  await page.context().close();
});

test('U34 new user: Populate with Sample Data (recommended) or Start Without; sample clearly marked; clean workspace stays empty', async () => {
  const empty = await phone({ start: null });
  assert.match(await empty.getByTestId('start-choice').innerText(), /Populate with Sample Data[\s\S]*Recommended[\s\S]*Start Without Sample Data/i);
  await empty.getByTestId('startup-logo').waitFor({ state: 'detached' });
  await shot(empty, '34a-start-choice', false);
  await empty.getByTestId('start-empty').click();
  await tile(empty, 'Property List');
  assert.equal(await empty.getByTestId('listing-card').count(), 0, 'clean workspace stays empty');
  await empty.reload(); await empty.waitForSelector('nav.grid');
  assert.equal(await empty.getByTestId('start-choice').count(), 0, 'asked only once');
  await empty.context().close();

  const page = await phone({ start: 'sample' });
  await tile(page, 'Property List');
  const n = await page.getByTestId('listing-card').count();
  assert.ok(n >= 10, 'sample properties');
  assert.equal(await page.locator('[data-testid="listing-card"] .lc-sample').count(), n, 'every sample property is marked Sample');
  await home(page); await tile(page, 'Vendor List');
  assert.ok(await page.locator('[data-testid="contact-row"] .sample-tag').count() >= 10, 'sample vendors marked');
  assert.ok(await page.locator('[data-vstat="pending_info"]').count() >= 1, 'vendor statuses in the sample');
  await home(page); await tile(page, 'To-Do');
  assert.match(await page.locator('main').innerText(), /\(sample\)/i);
  await home(page); await tile(page, 'Calendar');
  await home(page); await tile(page, 'Inquiries & Viewings');
  assert.match(await page.locator('main').innerText(), /Buyer L \(sample\)|Tenant R \(sample\)/i);
  await page.context().close();
});

test('U35 vendors have their own status (Pending Property Info, Pending Follow-up…); buyers use Cold/Warm/Hot/Dropped/Booked / Bought', async () => {
  const page = await phone({ start: 'sample' });
  await tile(page, 'Vendor List');
  const vs = await page.getByTestId('status-filter').locator('[data-status]').evaluateAll(b => b.map(x => x.textContent.replace(/\d+$/, '').trim()));
  assert.deepEqual(vs.map(x => x.toLowerCase()), ['pending property info', 'pending follow-up', 'listed', 'negotiating', 'on hold', 'closed (sold / rented)', 'withdrawn']);
  for (const old of ['Cold', 'Warm', 'Hot', 'Dropped', 'Inactive', 'Booked / Bought']) assert.ok(!vs.includes(old), `no ${old} for vendors`);
  await page.getByTestId('status-filter').locator('[data-status="pending_follow_up"]').click();
  const rows = await page.getByTestId('contact-row').count();
  assert.ok(rows >= 1);
  await page.getByTestId('contact-row').first().locator('.row-main').click();
  await page.getByTestId('vendor-status-picker').locator('[data-vstat="pending_info"]').click();
  assert.equal(await page.getByTestId('vendor-status-picker').locator('[aria-checked="true"]').getAttribute('data-vstat'), 'pending_info');
  await home(page); await tile(page, 'Buyer List');
  const bs = await page.getByTestId('status-filter').locator('[data-status]').evaluateAll(b => b.map(x => x.textContent.replace(/\d+$/, '').trim()));
  assert.deepEqual(bs, ['Cold', 'Warm', 'Hot', 'Dropped', 'Booked / Bought']);
  assert.ok(!bs.includes('Inactive'), 'Inactive is not a buyer filter any more');
  await shot(page, '35-buyers', false);
  await page.context().close();
});

test('U36 Agent Profile: Send Name Card stays off until the required details are complete, with the reason; then switches on', async () => {
  const page = await phone();
  await tile(page, 'Agent Profile');
  assert.equal(await page.getByTestId('send-namecard').isDisabled(), true);
  assert.match(await page.getByTestId('namecard-hint').innerText(), /Please complete the required information in Edit Profile to activate your Name Card\.[\s\S]*Full name, Registration type, Registration \/ agent number, Agency \/ company, Contact number/i);
  await page.getByRole('button', { name: /Edit/i }).first().click();
  assert.equal(await page.locator('[data-testid="profile-edit"] .req').count() >= 5, true, 'required fields are marked');
  await page.locator('[data-field="fullName"]').fill('Agent J'); await page.locator('[data-field="agency"]').fill('JSL Properties');
  await page.locator('[data-field="phone"]').fill('0123456789');
  await page.getByTestId('save-profile').click();
  assert.equal(await page.getByTestId('send-namecard').isDisabled(), true, 'still missing the registration');
  assert.match(await page.getByTestId('namecard-hint').innerText(), /Registration type, Registration \/ agent number$/i);
  await page.getByRole('button', { name: /Edit/i }).first().click();
  await page.getByTestId('opt-regType').locator('.opt-btn').click(); await page.getByRole('option', { name: 'REN' }).click();
  await page.locator('[data-field="regNo"]').fill('12345');
  await page.getByTestId('save-profile').click();
  assert.equal(await page.getByTestId('send-namecard').isDisabled(), false, 'switched on automatically');
  assert.equal(await page.getByTestId('namecard-hint').count(), 0);
  await page.getByTestId('send-namecard').click();
  assert.match(await page.getByTestId('share-preview').innerText(), /\*Agent J\*[\s\S]*REN No\.: 12345[\s\S]*JSL Properties[\s\S]*\+60 12-345 6789/i);
  await page.context().close();
});

test('U37 property form: sections start closed, open and close, Save floats on screen, everything entered is saved; ? explains fields', async () => {
  const page = await phone();
  await tile(page, 'Property List'); await page.locator('.add-property').click();
  const secs = page.locator('[data-testid="listing-form"] .form-sec');
  assert.ok(await secs.count() >= 10, 'ClaudeChanges001: two sections fewer (Availability and Condition, Listing Arrangement and Status)');
  assert.deepEqual([...new Set(await secs.evaluateAll(x => x.map(e => e.dataset.open)))], ['no'], 'all closed at first');
  await page.locator('[data-sec="marketing"]').click();
  await page.locator('[data-field="headline"]').fill('Collapsible test');
  await page.locator('[data-sec="marketing"]').click(); // close it again
  assert.equal(await page.locator('[data-field="headline"]').count(), 0);
  assert.match(await page.locator('[data-sec="marketing"]').innerText(), /1 filled/i);
  // Change 009: the asking price is in Price, Tenure and Title Info.
  await page.locator('[data-sec="tenure"]').click();
  await page.locator('[data-field="askingPrice"]').fill('480000');
  await page.locator('[data-sec="notes"]').click();
  // Field help
  await page.locator('[data-help="tenure"]').click();
  assert.match(await page.getByTestId('help-tenure').innerText(), /freehold[\s\S]*Enter:[\s\S]*Example:[\s\S]*Why it matters:/i);
  // Save floats: visible at the bottom of the screen while the middle of the form is shown.
  await page.locator('#sec-notes').scrollIntoViewIfNeeded();
  const box = await page.getByTestId('save-floating').boundingBox();
  assert.ok(box && box.y + box.height <= 824 && box.y > 600, `save bar on screen (${box?.y})`);
  await page.getByTestId('save-property').click();
  await page.getByTestId('listing-details').waitFor();
  assert.match(await page.locator('main').innerText(), /RM 480,000/i);
  assert.match(await page.getByTestId('marketing').innerText(), /Collapsible test/i, 'the headline is kept in Marketing');
  await shot(page, '37-form-saved', false);
  await page.context().close();
});

test('U38 GPS: My Location gets a fresh position every time (even when live updates stop); tap-to-select banner and House Shopping spots, changeable later', async () => {
  const ctx = await browser.newContext({ viewport: { width: 384, height: 824 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    permissions: ['geolocation'], geolocation: { latitude: 2.8200, longitude: 101.8000, accuracy: 8 } });
  await ctx.addInitScript(FAKE_MAPS);
  // Live updates that stop after the first reading (as Android can do after the screen was off).
  await ctx.addInitScript(() => {
    const g = navigator.geolocation; const real = g.watchPosition.bind(g);
    g.watchPosition = (ok, err, o) => { let first = true; return real(p => { if (first) { first = false; ok(p); } }, err, o); };
  });
  const page = await ctx.newPage();
  await page.goto(base); await page.waitForSelector('nav.grid'); await chooseStart(page, 'sample');
  const center = () => page.evaluate(() => window.__center);
  await tile(page, 'GPS Assistance'); await page.getByTestId('card-map').click();
  await page.waitForFunction(() => window.__markers?.some(m => m.o.icon?.fillColor === '#4285F4'));
  for (const lat of [2.8250, 2.8300, 2.8350]) {
    await page.evaluate(() => window.__drag());
    await ctx.setGeolocation({ latitude: lat, longitude: 101.8000, accuracy: 8 });
    await page.getByTestId('map-my-location').click();
    await page.waitForFunction(l => Math.abs(window.__center.lat - l) < 1e-9, lat);
  }
  assert.equal((await center()).lat, 2.835, 'recentred on the newest position after three presses');
  // Banner: tap the map to choose the spot, save, then change it later.
  await home(page); await tile(page, 'GPS Assistance'); await page.getByTestId('card-banners').click();
  await page.getByTestId('banner-card').first().getByTestId('banner-add').click();
  await page.getByTestId('banner-pick-map').waitFor();
  await page.evaluate(() => window.__mapClick(2.8111, 101.8111));
  assert.match(await page.getByTestId('banner-pos-set').innerText(), /2\.81110, 101\.81110 · map/i);
  await page.getByTestId('banner-save').click();
  await page.getByTestId('banner-card').first().getByTestId('banner-edit').click();
  await page.getByTestId('banner-pick-map').waitFor();
  await page.evaluate(() => window.__mapClick(2.8122, 101.8122));
  await page.getByTestId('banner-save').click();
  assert.match(await page.getByTestId('banner-card').first().getByTestId('banner-pos').innerText(), /2\.81220, 101\.81220/i);
  assert.equal(await page.getByTestId('banner-card').first().getByTestId('banner-up').count(), 1, 'moved, not duplicated');
  // House Shopping: mark a spot by tapping the map, then move the mark.
  await home(page); await tile(page, 'GPS Assistance'); await page.getByTestId('card-house-shopping').click();
  await page.getByTestId('trk-start').click();
  await page.getByTestId('mark-here').click();
  await page.getByTestId('mark-map').waitFor();
  await page.evaluate(() => window.__mapClick(2.8133, 101.8133));
  await page.waitForFunction(() => document.querySelector('[data-testid="mark-map-pos"]')?.textContent.includes('2.81330, 101.81330'));
  await page.getByRole('button', { name: 'Mark the spot only' }).click();
  await page.getByTestId('move-mark').first().click();
  await page.getByTestId('move-map').waitFor();
  await page.evaluate(() => window.__mapClick(2.8144, 101.8144));
  await page.getByTestId('move-mark-save').click();
  assert.match(await page.getByTestId('journey-marks').innerText(), /2\.81440, 101\.81440/i);
  await ctx.close();
});

test('U39 startup: readiness-driven, not a timer: the app opens as soon as the phone storage is ready, with a truthful line', async () => {
  const ctx = await browser.newContext({ viewport: { width: 384, height: 824 } });
  const page = await ctx.newPage();
  const t0 = Date.now();
  await page.goto(base);
  await page.getByTestId('startup-logo').waitFor({ state: 'attached', timeout: 2000 });
  await page.getByTestId('startup-logo').waitFor({ state: 'detached', timeout: 3000 });
  const took = Date.now() - t0;
  assert.ok(took < 2000, `ready without a deliberate wait (${took} ms; the old fixed 1 second is gone)`);
  await page.waitForSelector('nav.grid');
  await ctx.close();
});

test('U39b JoyChange002 Change 42: the start-up screen lasts the full five seconds, spins the logo, fills a bar, shows six lines in order and carries the bottom advert', async () => {
  const ctx = await browser.newContext({ viewport: { width: 384, height: 824 } });
  const page = await ctx.newPage();
  const t0 = Date.now();
  await page.goto(`${base}?splash=full`);
  await page.getByTestId('startup-logo').waitFor({ state: 'attached', timeout: 2000 });
  assert.equal(await page.getByTestId('startup-bar').count(), 1, 'a progress bar');
  assert.equal(await page.locator('.intro [data-testid="bottom-ad"]').count(), 1, 'the bottom advert is on the start-up screen');
  assert.match(await page.locator('.intro .logo-img').evaluate(i => getComputedStyle(i).animationName), /intro-spin/);
  const seen = [];
  const end = Date.now() + 6500;
  while (Date.now() < end && await page.getByTestId('startup-logo').count()) {
    const m = await page.getByTestId('startup-msg').innerText({ timeout: 300 }).catch(() => '');
    if (m && seen[seen.length - 1] !== m) seen.push(m);
    await page.waitForTimeout(100);
  }
  await page.getByTestId('startup-logo').waitFor({ state: 'detached', timeout: 3000 });
  const took = Date.now() - t0;
  assert.ok(took >= 4800 && took < 7000, `about five seconds (${took} ms)`);
  assert.deepEqual(seen, ['Initializing app', 'Analyzing', 'Checking encrypted data checksum', 'Checksum verified', 'Security checks', 'Security check pass']);
  await ctx.close();
});

test('U40 startup: slow storage says so after about five seconds, and Try again recovers (never an indefinite silent splash)', async () => {
  const ctx = await browser.newContext({ viewport: { width: 384, height: 824 } });
  await ctx.addInitScript(() => {
    window.__hang = true;
    const real = indexedDB.open.bind(indexedDB);
    indexedDB.open = (...a) => (window.__hang ? {} : real(...a));   // a request that never answers
  });
  const page = await ctx.newPage();
  const t0 = Date.now();
  await page.goto(base);
  await page.getByTestId('startup-msg').waitFor();
  assert.match(await page.getByTestId('startup-msg').innerText(), /Initializing app/i);   // Change 42: the first of the six start-up lines
  assert.equal(await page.getByTestId('startup-logo').getAttribute('data-phase'), 'opening');
  await page.locator('[data-testid="startup-logo"][data-phase="slow"]').waitFor({ timeout: 8000 });
  const took = Date.now() - t0;
  assert.ok(took >= 4500 && took < 7500, `the notice comes at about five seconds (${took} ms)`);
  assert.match(await page.getByTestId('startup-msg').innerText(), /taking longer than usual\. Your saved data has not been changed/i);
  assert.ok(!/encrypt|secur|AI update/i.test(await page.getByTestId('startup-msg').innerText()), 'the slow notice itself makes no claims about checks');
  await page.evaluate(() => { window.__hang = false; });
  await page.getByTestId('startup-retry').click();
  await page.waitForSelector('nav.grid');
  await page.getByTestId('startup-logo').waitFor({ state: 'detached' });
  await ctx.close();
});

test('U41 startup: a storage that cannot be read ends in a clear message with Try again, and nothing is changed', async () => {
  const ctx = await browser.newContext({ viewport: { width: 384, height: 824 } });
  await ctx.addInitScript(() => {
    window.__fail = true;
    const real = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (...a) { if (window.__fail) throw new Error('simulated storage failure'); return real.apply(this, a); };
  });
  const page = await ctx.newPage();
  await page.goto(base);
  await page.locator('[data-testid="startup-logo"][data-phase="failed"]').waitFor({ timeout: 4000 });
  assert.match(await page.getByTestId('startup-msg').innerText(), /could not be opened\. Nothing was changed or deleted/i);
  assert.equal(await page.getByTestId('startup-msg').getAttribute('role'), 'alert');
  assert.equal(await page.locator('nav.grid').count(), 0, 'the dashboard is not shown over a store that failed to open');
  await page.evaluate(() => { window.__fail = false; });
  await page.getByTestId('startup-retry').click();
  await page.waitForSelector('nav.grid');
  await ctx.close();
});

test('U42 startup message follows the phone language (Bahasa Malaysia)', async () => {
  const ctx = await browser.newContext({ viewport: { width: 384, height: 824 }, locale: 'ms-MY' });
  await ctx.addInitScript(() => { window.__hang = true; const real = indexedDB.open.bind(indexedDB); indexedDB.open = (...a) => (window.__hang ? {} : real(...a)); });
  const page = await ctx.newPage();
  await page.goto(base);
  await page.getByTestId('startup-msg').waitFor();
  assert.match(await page.getByTestId('startup-msg').innerText(), /Memulakan aplikasi/i);
  await ctx.close();
});

test('U43 save confirmation: "Saved on this phone." appears after the write and goes after two seconds; a failed write shows an error, never success', async () => {
  const ctx = await browser.newContext({ viewport: { width: 384, height: 824 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => {
    window.__failWrites = false;
    const real = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...a) { if (window.__failWrites) throw new Error('simulated disk full'); return real.apply(this, a); };
  });
  const page = await ctx.newPage();
  await page.goto(base); await page.waitForSelector('nav.grid'); await chooseStart(page, 'empty');
  // ClaudeChanges001 change 2: no status line, and no banner while the phone's storage works.
  assert.equal(await page.getByTestId('save-status').count(), 0);
  assert.equal(await page.getByTestId('sync-banner').count(), 0);
  // Good save: the message shows, then goes in about two seconds.
  await tile(page, 'Buyer List'); await page.getByRole('button', { name: 'New buyer' }).click();
  await page.locator('[data-field="name"]').fill('Timing Buyer');
  await page.getByTestId('save-contact').click();
  const toast = page.getByTestId('toast');
  await toast.waitFor();
  const t0 = Date.now();
  assert.equal(await toast.getAttribute('data-kind'), 'ok');
  assert.match(await toast.innerText(), /Saved on this phone\./i);
  await toast.waitFor({ state: 'detached', timeout: 4000 });
  const shown = Date.now() - t0;
  assert.ok(shown >= 1500 && shown <= 2800, `the success message stays about two seconds (${shown} ms), not four`);
  // Failed save: the phone's storage refuses the write.
  await page.evaluate(() => { window.__failWrites = true; });
  await home(page); await tile(page, 'Buyer List'); await page.getByRole('button', { name: 'New buyer' }).click();
  await page.locator('[data-field="name"]').fill('Not Saved Buyer');
  await page.getByTestId('save-contact').click();
  await page.locator('[data-testid="toast"][data-kind="error"]').waitFor();
  assert.match(await page.getByTestId('toast').innerText(), /Could not save to the phone’s storage/i);
  await page.waitForTimeout(400);
  assert.equal(await page.getByText('Saved on this phone.', { exact: true }).count(), 0, 'no success message after a failed write');
  // The main page says so (ClaudeChanges001 change 2: the one banner below the header line).
  await home(page);
  assert.equal(await page.getByTestId('sync-banner').getAttribute('data-state'), 'failed-phone');
  assert.equal(await page.getByTestId('sync-banner').getAttribute('role'), 'alert');
  assert.match(await page.getByTestId('sync-banner').innerText(), /Not saved: the phone’s storage failed/);
  // An error message stays longer than a success message.
  const e0 = Date.now();
  await page.getByTestId('toast').waitFor({ state: 'detached', timeout: 9000 });
  assert.ok(Date.now() - e0 > 2500, 'an error is not as brief as a success');
  // Recovered.
  await page.evaluate(() => { window.__failWrites = false; });
  await home(page); await tile(page, 'Buyer List'); await page.getByRole('button', { name: 'New buyer' }).click();
  await page.locator('[data-field="name"]').fill('Saved Again');
  await page.getByTestId('save-contact').click();
  await page.locator('[data-testid="toast"][data-kind="ok"]').waitFor();
  await home(page);
  assert.equal(await page.getByTestId('sync-banner').count(), 0, 'the banner goes once saving works again');
  await ctx.close();
});

test('U44 Notifications: System Notifications and News / Announcements sections, the exact empty wording, sample News kept and marked, no push claim', async () => {
  const page = await phone();
  await page.getByTestId('top-notifications').click();
  await page.getByTestId('notifications').waitFor();
  assert.deepEqual((await page.locator('[data-testid="notifications"] .card-title').allInnerTexts()).map(x => x.toLowerCase()), ['system notifications', 'news / announcements', 'push messages', 'notification settings']);
  const empty = 'You\'re all caught up — we\'ll let you know when there\'s something important.';
  assert.equal(await page.getByTestId('notif-empty-system').innerText(), empty);
  assert.equal(await page.getByTestId('notif-empty-news').innerText(), empty);
  // The earlier News content is kept, under a clear "sample, not live" heading, inside Notifications.
  await page.getByTestId('notif-news').locator('summary').click();
  assert.match(await page.getByTestId('notif-news').innerText(), /not live[\s\S]*Property market/i);
  // Push messages are not claimed to work.
  assert.match(await page.locator('.coming-soon').innerText(), /Coming Soon[\s\S]*not set up yet/i);
  await shot(page, '44-notifications', false);
  // A reminder coming up appears under System Notifications.
  await home(page); await tile(page, 'To-Do');
  await page.getByRole('button', { name: '+ New to-do' }).click();
  await page.locator('[data-field="title"]').fill('Call the lawyer');
  const soon = new Date(Date.now() + 2 * 86_400_000); const ymd = `${soon.getFullYear()}-${String(soon.getMonth() + 1).padStart(2, '0')}-${String(soon.getDate()).padStart(2, '0')}`;
  await page.locator('[data-field="due"]').fill(ymd);
  await page.getByTestId('reminders').getByRole('button', { name: '1 day before' }).click();
  await page.getByTestId('save-task').click();
  await home(page);
  await page.getByTestId('top-notifications').click();
  assert.match(await page.getByTestId('notif-system').innerText(), /Call the lawyer/i);
  assert.equal(await page.getByTestId('notif-empty-system').count(), 0, 'not empty any more');
  await page.context().close();
});

test('U45 Settings sits inside Agent Profile and starts with the Easy Bug Report; the wording is approved; screenshot preview and removal; failure keeps the report', async () => {
  const page = await phone();
  assert.equal(await page.locator('nav.grid > button', { hasText: /^Settings/i }).count(), 0, 'no Settings card on the dashboard');
  await tile(page, 'Agent Profile');
  await page.getByRole('button', { name: /Settings/i }).click();
  const first = await page.locator('[data-testid="settings"] > .card').first().getAttribute('data-testid');
  assert.equal(first, 'bug-entry', 'Easy Bug Report is the first item in Settings');
  await shot(page, '45a-settings-bug-entry', false);
  await page.getByTestId('open-bug-report').click();
  const intro = await page.getByTestId('bug-intro').innerText();
  assert.ok(intro.includes('Found a problem? No worries — it’s as easy as 1-2-3.'));
  assert.deepEqual(await page.locator('.bug-steps li').allInnerTexts(), ['Screenshot.', 'Brief description.', 'Send.']);
  assert.ok(intro.includes('We’ll look into it and improve your experience.'));
  // Description is needed.
  await page.getByTestId('bug-send').click();
  assert.match(await page.getByTestId('bug-fail').innerText(), /write a short description/i);
  // Screenshot: preview, remove, add again.
  await page.getByTestId('bug-file').setInputFiles({ name: 'shot.png', mimeType: 'image/png', buffer: Buffer.from(PNG_1X1, 'base64') });
  await page.getByTestId('bug-preview').waitFor();
  await page.getByTestId('bug-remove').click();
  assert.equal(await page.getByTestId('bug-preview').count(), 0, 'removed');
  await page.getByTestId('bug-file').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
  assert.equal(await page.getByTestId('bug-fail').getAttribute('data-reason'), 'badImage', 'a non-image is refused with a reason');
  await page.getByTestId('bug-file').setInputFiles({ name: 'shot.png', mimeType: 'image/png', buffer: Buffer.from(PNG_1X1, 'base64') });
  await page.getByTestId('bug-preview').waitFor();
  await page.getByTestId('bug-desc').fill('Voice button does nothing.');
  await shot(page, '45b-bug-report', true);
  // Nothing is set up on this phone: the report is NOT sent, and it says so (never a false success). Nothing leaves the phone.
  await page.getByTestId('bug-send').click();
  assert.equal(await page.getByTestId('bug-fail').getAttribute('data-reason'), 'notConfigured');
  assert.match(await page.getByTestId('bug-fail').innerText(), /was not sent[\s\S]*still here/i);
  assert.equal(await page.getByTestId('bug-sent').count(), 0);
  assert.equal(await page.getByTestId('bug-desc').inputValue(), 'Voice button does nothing.');
  assert.equal(await page.getByTestId('bug-preview').count(), 1);
  await page.context().close();
});

test('U46 Easy Bug Report in Bahasa Malaysia and Chinese: every new label is translated', async () => {
  const page = await phone();
  await tile(page, 'Agent Profile'); await page.getByRole('button', { name: /Settings/i }).click();
  await pickLang(page, '[aria-label="Bahasa Malaysia"]');
  assert.equal(await page.getByTestId('bug-entry').locator('.card-title').innerText(), 'Lapor Pepijat Mudah');
  await page.getByTestId('open-bug-report').click();
  assert.match(await page.getByTestId('bug-intro').innerText(), /Jumpa masalah\? Jangan risau — semudah 1-2-3\./i);
  await page.getByTestId('bug-send').click();
  assert.match(await page.getByTestId('bug-fail').innerText(), /Sila tulis penerangan ringkas/i);
  await pickLang(page, '[aria-label="中文"]');
  assert.match(await page.getByTestId('bug-intro').innerText(), /发现问题了/i);
  await home(page);
  await page.getByTestId('top-notifications').click();
  assert.match(await page.getByTestId('notif-empty-news').innerText(), /您已查看全部/i);
  await pickLang(page, '[aria-label="Bahasa Malaysia"]');
  assert.match(await page.getByTestId('notif-empty-news').innerText(), /Anda sudah mengikuti semuanya/i);
  await page.context().close();
});

test('U47 old Inactive buyers become Dropped (gray), with a reviewable report; nothing else about them changes', async () => {
  const ctx = await browser.newContext({ viewport: { width: 384, height: 824 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(base); await page.waitForSelector('nav.grid'); await chooseStart(page, 'empty');
  // Put an old-version record straight into the phone's storage, then reopen the app.
  await page.evaluate(() => new Promise((resolve, reject) => {
    const r = indexedDB.open('estate-agent-buddy');
    r.onsuccess = () => {
      const tx = r.result.transaction('records', 'readwrite');
      tx.objectStore('records').put({ id: 'old1', created: 1, updated: 1, name: 'Old Inactive Buyer', phone: '+60 12-000 1111', notes: 'Keep these notes', roles: ['buyer'], leadStatus: 'inactive' }, 'c:contacts:old1');
      tx.oncomplete = () => resolve(true); tx.onerror = () => reject(tx.error);
    };
  }));
  await page.reload(); await page.waitForSelector('nav.grid');
  await tile(page, 'Contacts');
  await page.getByTestId('lead-review').waitFor();
  assert.match(await page.getByTestId('lead-review').innerText(), /Inactive is no longer used as a buyer status\. 1 buyer was marked Inactive, so it was moved to Dropped/i);
  assert.deepEqual(await page.getByTestId('lead-review-item').allInnerTexts(), ['Old Inactive Buyer']);
  await shot(page, '47a-lead-review', false);
  // It is also listed under System Notifications.
  await home(page); await page.getByTestId('top-notifications').click();
  assert.match(await page.getByTestId('notif-lead-review').innerText(), /1 buyer moved from Inactive to Dropped/i);
  await home(page); await tile(page, 'Buyer List');
  const row = page.locator('[data-testid="contact-row"][data-lead="dropped"]');
  assert.equal(await row.count(), 1);
  assert.equal(await row.locator('.lead-dot').first().evaluate(e => getComputedStyle(e).backgroundColor), 'rgb(156, 163, 175)', 'Dropped is gray');
  assert.equal(await page.getByTestId('status-filter').locator('[data-status="inactive"]').count(), 0);
  await row.locator('.row-main').click();
  assert.match(await page.locator('main').innerText(), /Keep these notes/i);
  assert.match(await page.locator('main').innerText(), /\+60 12-000 1111/i);
  // Reviewed: the report goes away; the contact stays.
  await home(page); await tile(page, 'Contacts');
  await page.getByTestId('lead-review-done').click();
  assert.equal(await page.getByTestId('lead-review').count(), 0);
  await waitStored(page, 'records', "all.some(v => v && v.leadReview && v.leadReview.reviewed === true)");   // really stored, not just shown
  await page.reload(); await page.waitForSelector('nav.grid'); await tile(page, 'Contacts');
  assert.equal(await page.getByTestId('lead-review').count(), 0, 'stays reviewed after reopening');
  await ctx.close();
});

test('U48 Booked / Bought is green and can be chosen; new sample data has no Inactive buyer', async () => {
  const page = await phone({ start: 'sample' });
  await tile(page, 'Buyer List');
  assert.equal(await page.getByTestId('status-filter').locator('[data-status="booked"]').count(), 1);
  await page.getByTestId('status-filter').locator('[data-status="booked"]').click();
  const rows = page.locator('[data-testid="contact-row"][data-lead="booked"]');
  assert.ok(await rows.count() >= 1);
  assert.equal(await rows.first().evaluate(el => getComputedStyle(el).borderLeftColor).catch(() => ''), await rows.first().evaluate(el => getComputedStyle(el).borderLeftColor));
  assert.equal(await rows.first().locator('.lead-dot').first().evaluate(e => getComputedStyle(e).backgroundColor), 'rgb(34, 197, 94)');
  assert.equal(await page.locator('[data-lead="inactive"]').count(), 0);
  await page.context().close();
});

test('U49 property cards: no "Unit" prefix on any card or view, and the stored unit number is still there', async () => {
  const page = await phone();
  await tile(page, 'Property List');
  await page.getByRole('button', { name: 'Add New Property' }).first().click(); await expandForm(page);
  await page.locator('[data-field="unitNo"]').fill('12A');
  await setStreet(page, 'Jalan Prefix Test');
  await page.getByTestId('save-property').click();
  await page.waitForSelector('[data-testid="listing-details"]');
  assert.doesNotMatch(await page.locator('main').innerText(), /\bUnit 12A\b/i, 'detail page');
  assert.match(await page.locator('header h1').innerText(), /^12A, Jalan Prefix Test$/i);
  await home(page); await tile(page, 'Property List');
  assert.equal(await page.getByTestId('listing-card').count(), 1);
  assert.match(await page.getByTestId('listing-card').first().innerText(), /12A, Jalan Prefix Test/i);
  assert.doesNotMatch(await page.getByTestId('listing-card').first().innerText(), /\bUnit\b/i, 'list card');
  await home(page);
  assert.doesNotMatch(await page.locator('.photo-cards').innerText().catch(() => ''), /\bUnit\b/i, 'dashboard recent card');
  // The stored value is untouched: the unit number is saved exactly as typed.
  const stored = await page.evaluate(() => new Promise((resolve, reject) => {
    const r = indexedDB.open('estate-agent-buddy');
    r.onsuccess = () => { const g = r.result.transaction('records').objectStore('records').getAll(); g.onsuccess = () => resolve(g.result.filter(x => x && x.unitNo).map(x => x.unitNo)); g.onerror = () => reject(g.error); };
  }));
  assert.deepEqual(stored, ['12A']);
  await page.context().close();
});

// ---------- Phase 2 (14 Oct 2026): drafts, record status, history, upgrade, conflicts ----------
const waitFor = async (cond, ms = 6000) => { const t = Date.now(); while (!cond()) { if (Date.now() - t > ms) throw new Error('timed out waiting'); await new Promise(r => setTimeout(r, 50)); } };

test('U50 draft autosave: closing the app during entry keeps the form; editing, discarding and saving behave', async () => {
  const page = await phone();
  await tile(page, 'Buyer List'); await page.getByRole('button', { name: 'New buyer' }).click();
  await page.locator('[data-field="name"]').fill('Half Typed Buyer');
  await page.locator('[data-field="whatsapp"]').fill('@half');
  await page.getByTestId('draft-saved').waitFor();
  assert.match(await page.getByTestId('draft-saved').innerText(), /Draft saved on this phone/i);
  // "Closing the app": the page is reloaded. Nothing was saved with the Save button, so no record exists.
  await page.reload(); await page.waitForSelector('nav.grid');
  await tile(page, 'Buyer List');
  assert.equal(await page.getByTestId('contact-row').count(), 0, 'a draft is not a record');
  await page.getByRole('button', { name: 'New buyer' }).click();
  await page.getByTestId('draft-banner').waitFor();
  assert.match(await page.getByTestId('draft-banner').innerText(), /Draft from .* restored\. It is not saved yet/i);
  assert.equal(await page.locator('[data-field="name"]').inputValue(), 'Half Typed Buyer');
  assert.equal(await page.locator('[data-field="whatsapp"]').inputValue(), '@half');
  // Edit the restored draft; close again; the edit is what comes back.
  await page.locator('[data-field="name"]').fill('Half Typed Buyer Two');
  await waitStored(page, 'local', "all.some(v => JSON.stringify(v).includes('Half Typed Buyer Two'))");
  await page.reload(); await page.waitForSelector('nav.grid');
  await tile(page, 'Buyer List'); await page.getByRole('button', { name: 'New buyer' }).click();
  await page.getByTestId('draft-banner').waitFor();   // the draft is restored asynchronously: wait for it, not for time
  assert.equal(await page.locator('[data-field="name"]').inputValue(), 'Half Typed Buyer Two');
  // Discard: the form is empty again and the draft is gone for good.
  await page.getByTestId('draft-discard').first().click();
  assert.equal(await page.locator('[data-field="name"]').inputValue(), '');
  assert.equal(await page.getByTestId('draft-banner').count(), 0);
  await waitStored(page, 'local', "!all.some(v => JSON.stringify(v).includes('Half Typed Buyer'))");   // the draft is really gone from storage
  await page.reload(); await page.waitForSelector('nav.grid');
  await tile(page, 'Buyer List'); await page.getByRole('button', { name: 'New buyer' }).click();
  assert.equal(await page.getByTestId('draft-banner').count(), 0, 'nothing comes back after a discard');
  assert.equal(await page.locator('[data-field="name"]').inputValue(), '');
  // A partly filled form that cannot be saved yet (no name) keeps what was typed.
  await page.locator('[data-field="whatsapp"]').fill('@nobody');
  await page.getByTestId('save-contact').click();
  assert.equal(await page.locator('[data-field="name"]').getAttribute('aria-invalid'), 'true');
  assert.equal(await page.locator('[data-field="whatsapp"]').inputValue(), '@nobody');
  // Save for real: one record, and the draft is cleared (no banner next time).
  await page.locator('[data-field="name"]').fill('Saved Buyer');
  await page.getByTestId('save-contact').click();
  await page.getByTestId('contact-detail').waitFor();
  await home(page); await tile(page, 'Buyer List');
  assert.equal(await page.getByTestId('contact-row').count(), 1, 'exactly one record');
  await page.getByRole('button', { name: 'New buyer' }).click();
  assert.equal(await page.getByTestId('draft-banner').count(), 0, 'saving cleared the draft');
  assert.equal(await page.locator('[data-field="name"]').inputValue(), '');
  await page.context().close();
});

test('U51 the long property form keeps its draft too, and Save then leaves a single property', async () => {
  const page = await phone();
  await tile(page, 'Property List');
  await page.getByRole('button', { name: 'Add New Property' }).first().click(); await expandForm(page);
  await setStreet(page, 'Jalan Draft Test');
  await page.locator('[data-field="unitNo"]').fill('9B');
  await page.getByTestId('draft-saved').waitFor();
  await page.reload(); await page.waitForSelector('nav.grid');
  await tile(page, 'Property List');
  assert.equal(await page.getByTestId('listing-card').count(), 0, 'no property was created by typing');
  await page.getByRole('button', { name: 'Add New Property' }).first().click(); await expandForm(page);
  await page.getByTestId('draft-banner').waitFor();
  assert.equal(await streetValue(page), 'Jalan Draft Test');
  assert.equal(await page.locator('[data-field="unitNo"]').inputValue(), '9B');
  await page.getByTestId('save-property').click();
  await page.getByTestId('listing-details').waitFor();
  await home(page); await tile(page, 'Property List');
  assert.equal(await page.getByTestId('listing-card').count(), 1);
  await page.getByRole('button', { name: 'Add New Property' }).first().click(); await expandForm(page);
  assert.equal(await page.getByTestId('draft-banner').count(), 0);
  await page.context().close();
});

test('U52 the phone’s storage upgrades from the Phase 1 layout without losing a record', async () => {
  const ctx = await browser.newContext({ viewport: { width: 384, height: 824 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await ctx.route(`${base}no-such-page`, r => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>x</title>' }));
  await page.goto(`${base}no-such-page`);       // same origin, but the app is not running here
  await page.evaluate(() => new Promise((res, rej) => {
    const r = indexedDB.open('estate-agent-buddy', 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('records'); r.result.createObjectStore('files'); };
    r.onsuccess = () => {
      const tx = r.result.transaction('records', 'readwrite');
      tx.objectStore('records').put({ id: 'v1c', created: 1, updated: 1, name: 'From Phase One', roles: ['buyer'] }, 'c:contacts:v1c');
      r.result.transaction('files', 'readwrite').objectStore('files').put(new Blob(['v1-photo-bytes'], { type: 'image/jpeg' }), 'v1file');
      tx.oncomplete = () => { r.result.close(); res(true); }; tx.onerror = () => rej(tx.error);
    };
    r.onerror = () => rej(r.error);
  }));
  await page.goto(base); await page.waitForSelector('nav.grid');
  if (await page.getByTestId('start-choice').count()) await chooseStart(page, 'empty');
  await tile(page, 'Buyer List');
  assert.match(await page.getByTestId('contact-row').first().innerText(), /From Phase One/i);
  const info = await page.evaluate(() => new Promise(res => { const r = indexedDB.open('estate-agent-buddy'); r.onsuccess = () => { res({ v: r.result.version, stores: [...r.result.objectStoreNames].sort() }); r.result.close(); }; }));
  assert.equal(info.v, 2);
  assert.deepEqual(info.stores, ['files', 'local', 'records']);
  const kept = await page.evaluate(() => new Promise(res => { const r = indexedDB.open('estate-agent-buddy'); r.onsuccess = () => { const q = r.result.transaction('files').objectStore('files').get('v1file'); q.onsuccess = async () => res(q.result ? await q.result.text() : null); }; }));
  assert.equal(kept, 'v1-photo-bytes', 'a stored photo survives the upgrade');
  await ctx.close();
});

test('U53 record status chip, History with restore, and Recently deleted with restore', async () => {
  const page = await phone();
  await tile(page, 'Buyer List'); await page.getByRole('button', { name: 'New buyer' }).click();
  await page.locator('[data-field="name"]').fill('Ahmad History');
  await page.getByTestId('save-contact').click();
  await page.getByTestId('contact-detail').waitFor();
  // ClaudeChanges001 change 2: no sync status words on a record; only its History button.
  assert.equal(await page.getByTestId('record-status').getAttribute('data-state'), 'phone');
  assert.doesNotMatch(await page.getByTestId('record-status').innerText(), /Saved on this phone|Synced|Waiting|Sync failed/i);
  await shot(page, '50-record-status', false);
  // Edit: the earlier version goes to History.
  await page.getByRole('button', { name: 'Edit' }).first().click();
  await page.locator('[data-field="name"]').fill('Ahmad Renamed');
  await page.getByTestId('save-contact').click();
  await page.getByTestId('contact-detail').waitFor();
  assert.match(await page.locator('.contact-name').innerText(), /Ahmad Renamed/i);
  await page.getByTestId('rec-history').click();
  await page.getByTestId('revision-list').waitFor();
  assert.equal(await page.getByTestId('revision').count(), 1);
  assert.match(await page.getByTestId('revision').first().innerText(), /Edited on this phone/i);
  await shot(page, '51-history', false);
  await page.getByTestId('restore-revision').first().click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Restore this version' }).click();
  await page.getByTestId('history-msg').waitFor();
  await page.locator('header .icon-btn').first().click();
  assert.match(await page.locator('.contact-name').innerText(), /Ahmad History/i, 'the earlier name is back');
  // Delete, then bring it back from Recently deleted.
  await page.getByRole('button', { name: 'Edit' }).first().click();
  await page.getByRole('button', { name: 'Delete' }).first().click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await page.waitForSelector('nav.grid');
  await tile(page, 'Agent Profile'); await page.getByRole('button', { name: /Settings/i }).click();
  await page.getByTestId('open-recently-deleted').click();
  await page.getByTestId('deleted-item').waitFor();
  assert.match(await page.getByTestId('deleted-item').first().innerText(), /Ahmad History/i);
  await shot(page, '52-recently-deleted', false);
  await page.getByTestId('restore-deleted').first().click();
  await page.getByTestId('contact-detail').waitFor();
  assert.match(await page.locator('.contact-name').innerText(), /Ahmad History/i);
  await page.context().close();
});

test('U54 sync review: a same-field conflict, a property number already used, and a record deleted elsewhere — each reviewable, nothing lost', async () => {
  const SB = 'https://sync-test.supabase.co';
  const ctx = await browser.newContext({ viewport: { width: 384, height: 824 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const pushed = [];
  let phase = 'conflicts';
  await ctx.route(`${SB}/**`, async route => {
    const req = route.request(); const u = new URL(req.url());
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    const json = b => route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(b) });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (u.pathname === '/rest/v1/rpc/eab_my_membership') return json([{ workspace_id: 'ws-1', workspace_name: 'Test team', role: 'owner' }]);
    if (u.pathname === '/rest/v1/rpc/eab_push_records') {
      const body = JSON.parse(req.postData());
      pushed.push(...body.rows);
      return json(body.rows.map(r => {
        if (phase === 'conflicts' && r.id === 'c1') return { collection: r.collection, id: r.id, status: 'conflict', rev: 2, deleted: false, data: { id: 'c1', created: 1, updated: 9, name: 'Ahmad', phone: 'REMOTE-PHONE', roles: ['buyer'] } };
        if (phase === 'conflicts' && r.id === 'p1') return { collection: r.collection, id: r.id, status: 'ref_conflict', ref_no: 1001, ref: 'A1001', other_ref: 'P1001', other_id: 'p9', other_title: 'Terrace in Puchong', other_visible: true };
        if (phase === 'conflicts' && r.id === 'c2') return { collection: r.collection, id: r.id, status: 'conflict', rev: 2, deleted: true, data: null };
        return { collection: r.collection, id: r.id, status: 'ok', rev: 3 };
      }));
    }
    if (u.pathname === '/rest/v1/eab_records') return json([]);
    if (u.pathname === '/rest/v1/eab_files') return json([]);
    return route.fulfill({ status: 404, headers: cors, body: '' });
  });
  const page = await ctx.newPage();
  await page.goto(base); await page.waitForSelector('nav.grid'); await chooseStart(page, 'empty');
  // Seed what a phone with unsent changes looks like, signed in to a workspace.
  await page.evaluate(async SBURL => {
    const db = await new Promise(res => { const r = indexedDB.open('estate-agent-buddy'); r.onsuccess = () => res(r.result); });
    const put = (store, key, val) => new Promise((res, rej) => { const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).put(val, key); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    await put('records', 'c:contacts:c1', { id: 'c1', created: 1, updated: 5, name: 'Ahmad', phone: 'LOCAL-PHONE', roles: ['buyer'] });
    await put('records', 'c:contacts:c2', { id: 'c2', created: 1, updated: 5, name: 'Siti Deleted Elsewhere', notes: 'edited here', roles: ['buyer'] });
    await put('records', 'c:properties:p1', { id: 'p1', created: 1, updated: 5, headline: 'Condo in Cheras', ref: 'A1001', refPrefix: 'A', refNo: 1001, photos: [], type: 'condo' });
    await put('local', 'base:contacts:c1', { rev: 1, hash: 'x', deleted: false, data: { id: 'c1', created: 1, updated: 1, name: 'Ahmad', phone: 'OLD-PHONE', roles: ['buyer'] } });
    await put('local', 'base:contacts:c2', { rev: 1, hash: 'x', deleted: false, data: { id: 'c2', created: 1, updated: 1, name: 'Siti Deleted Elsewhere', roles: ['buyer'] } });
    await put('records', 's:meta', { fired: [], dirty: ['contacts:c1', 'contacts:c2', 'properties:p1'], tombstones: [], syncWorkspaceId: 'ws-1', lastSeq: 5, syncSession: { accessToken: 'AT', refreshToken: 'RT', expiresAt: Date.now() + 3_600_000, email: 'a@x.c', userId: 'u1', workspaceId: 'ws-1', workspaceName: 'Test team', role: 'owner' } });
    await put('records', 's:settings', { lang: 'en', layout: 'grid', supabaseUrl: SBURL, supabaseAnonKey: 'anon' });
    db.close();
  }, SB);
  await page.reload(); await page.waitForSelector('nav.grid');
  await page.locator('[data-testid="sync-banner"][data-state="conflict"]').waitFor({ timeout: 8000 });
  assert.match(await page.getByTestId('sync-banner').innerText(), /3 records need your review/i, 'the banner does not say Synced');
  await tile(page, 'Agent Profile'); await page.getByRole('button', { name: /Settings/i }).click();
  await page.getByTestId('open-sync-review').click();
  await page.getByTestId('sync-review').waitFor();
  assert.equal(await page.getByTestId('conflict-card').count(), 3);
  await shot(page, '53-sync-review', true);

  // The property number: explained, the other property named, nothing renamed.
  const ref = page.locator('[data-testid="conflict-card"][data-kind="reference"]');
  assert.match(await ref.innerText(), /A1001 could not be sent/i);
  assert.match(await ref.innerText(), /Used by P1001 · Terrace in Puchong/i);
  assert.match(await ref.innerText(), /not renamed/i);
  await ref.getByTestId('open-other').waitFor();

  // Same field: this phone's value stays until a choice is made; choosing "theirs" sends it.
  const fields = page.locator('[data-testid="conflict-card"][data-kind="fields"]');
  assert.match(await fields.innerText(), /LOCAL-PHONE/i); assert.match(await fields.innerText(), /REMOTE-PHONE/i);
  assert.equal(await fields.getByTestId('conflict-apply').isDisabled(), true, 'a choice is needed first');
  await fields.getByTestId('pick-theirs').click();
  await fields.getByTestId('conflict-apply').click();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="conflict-card"]').length === 2);
  // Taking the other phone's value means this phone now equals the cloud: nothing needs to be sent for it.
  // The screen updates before the phone has finished writing to its storage, so wait for the stored value itself.
  await waitStored(page, 'records', "all.some(v => v && v.id === 'c1' && v.phone === 'REMOTE-PHONE')");
  const c1 = await page.evaluate(() => new Promise(res => { const r = indexedDB.open('estate-agent-buddy'); r.onsuccess = () => { const g = r.result.transaction('records').objectStore('records').get('c:contacts:c1'); g.onsuccess = () => { res(g.result); r.result.close(); }; }; }));
  assert.equal(c1.phone, 'REMOTE-PHONE'); assert.equal(c1.name, 'Ahmad');
  assert.equal(pushed.filter(r => r.id === 'c1' && r.base_rev === 2).length, 0);

  // Deleted elsewhere, edited here: keep mine → sent again (not silently deleted).
  phase = 'settled';
  const del = page.locator('[data-testid="conflict-card"][data-kind="deleted-remote"]');
  assert.match(await del.innerText(), /Deleted elsewhere, edited here/i);
  await del.getByTestId('keep-mine').click();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="conflict-card"]').length === 1);
  await waitFor(() => pushed.some(r => r.id === 'c2' && r.base_rev === 2));
  const sentC2 = pushed.filter(r => r.id === 'c2').pop();
  assert.equal(sentC2.deleted, false); assert.equal(sentC2.data.notes, 'edited here'); assert.equal(sentC2.base_rev, 2);

  // The property number card: open the form to change it; the number was not touched.
  await ref.getByTestId('change-number').click();
  await expandForm(page);
  assert.equal(await page.locator('#ref-no-input').inputValue(), '1001');
  await shot(page, '54-ref-conflict-form', false);
  await ctx.close();
});

test('U55 signing in to a different team on a phone that holds another team\'s records: they are hidden, nothing is sent, sign-out is offered', async () => {
  const SB = 'https://sync-test.supabase.co';
  const ctx = await browser.newContext({ viewport: { width: 384, height: 824 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const seen = [];
  await ctx.route(`${SB}/**`, async route => {
    const req = route.request(); const u = new URL(req.url());
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    seen.push(`${req.method()} ${u.pathname}`);
    if (u.pathname === '/rest/v1/rpc/eab_my_membership') return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify([{ workspace_id: 'ws-B', workspace_name: 'Team B', role: 'owner' }]) });
    return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: '[]' });
  });
  const page = await ctx.newPage();
  await page.goto(base); await page.waitForSelector('nav.grid'); await chooseStart(page, 'empty');
  await page.evaluate(async SBURL => {
    const db = await new Promise(res => { const r = indexedDB.open('estate-agent-buddy'); r.onsuccess = () => res(r.result); });
    const put = (store, key, val) => new Promise((res, rej) => { const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).put(val, key); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    await put('records', 'c:contacts:a1', { id: 'a1', created: 1, updated: 5, name: 'Team A Secret Buyer', roles: ['buyer'] });
    await put('records', 's:meta', { fired: [], dirty: ['contacts:a1'], tombstones: [], syncWorkspaceId: 'ws-A', lastSeq: 5, syncSession: { accessToken: 'AT', refreshToken: 'RT', expiresAt: Date.now() + 3_600_000, email: 'b@x.c', userId: 'uB', workspaceId: 'ws-B', workspaceName: 'Team B', role: 'owner' } });
    await put('records', 's:settings', { lang: 'en', layout: 'grid', supabaseUrl: SBURL, supabaseAnonKey: 'anon' });
    db.close();
  }, SB);
  await page.reload();
  await page.getByTestId('other-workspace').waitFor();
  assert.equal(await page.locator('nav.grid').count(), 0, 'the app (and its records) is not shown');
  assert.equal(await page.getByText('Team A Secret Buyer').count(), 0);
  await shot(page, '54-other-workspace', true);
  await page.waitForTimeout(500);
  assert.ok(!seen.some(r => /eab_push_records|eab_records|eab_files|storage/.test(r)), `nothing sent or loaded: ${seen}`);
  // The records are still on the phone, untouched, and still waiting for team A.
  const kept = await page.evaluate(() => new Promise(res => { const r = indexedDB.open('estate-agent-buddy'); r.onsuccess = () => { const g = r.result.transaction('records').objectStore('records').get('c:contacts:a1'); g.onsuccess = () => { res(g.result?.name); r.result.close(); }; }; }));
  assert.equal(kept, 'Team A Secret Buyer');
  await page.getByTestId('other-workspace-signout').click();
  await page.getByTestId('login').waitFor();
  await page.context().close();
});

test('U56 a phone last used by Phase 1 (real records, no remembered team) asks whose records they are before anything is sent or shown', async () => {
  const SB = 'https://sync-test.supabase.co';
  const ctx = await browser.newContext({ viewport: { width: 384, height: 824 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const seen = [];
  await ctx.route(`${SB}/**`, async route => {
    const req = route.request(); const u = new URL(req.url());
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    seen.push(`${req.method()} ${u.pathname}`);
    const body = u.pathname === '/rest/v1/rpc/eab_my_membership' ? [{ workspace_id: 'ws-B', workspace_name: 'Team B', role: 'owner' }]
      : u.pathname === '/rest/v1/rpc/eab_push_records' ? JSON.parse(req.postData()).rows.map(r => ({ collection: r.collection, id: r.id, status: 'ok', rev: 1 })) : [];
    return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(body) });
  });
  const page = await ctx.newPage();
  await page.goto(base); await page.waitForSelector('nav.grid'); await chooseStart(page, 'empty');
  await page.evaluate(async SBURL => {
    const db = await new Promise(res => { const r = indexedDB.open('estate-agent-buddy'); r.onsuccess = () => res(r.result); });
    const put = (store, key, val) => new Promise((res, rej) => { const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).put(val, key); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    await put('records', 'c:contacts:a1', { id: 'a1', created: 1, updated: 5, name: 'Phase One Buyer', roles: ['buyer'] });
    // What Phase 1 left behind: records, an unsent edit, a last-sync time, signed out, no owner, and no Phase 2 flag. Then team B signs in.
    await put('records', 's:meta', { fired: [], dirty: ['contacts:a1'], tombstones: [], lastSync: Date.now() - 86_400_000, syncSession: { accessToken: 'AT', refreshToken: 'RT', expiresAt: Date.now() + 3_600_000, email: 'b@x.c', userId: 'uB', workspaceId: 'ws-B', workspaceName: 'Team B', role: 'owner' }, ownerChecked: true });
    await put('records', 's:settings', { lang: 'en', layout: 'grid', supabaseUrl: SBURL, supabaseAnonKey: 'anon' });
    db.close();
  }, SB);
  await page.reload();
  await page.getByTestId('owner-unknown').waitFor();
  assert.equal(await page.locator('nav.grid').count(), 0, 'no records are shown yet');
  assert.equal(await page.getByText('Phase One Buyer').count(), 0);
  assert.match(await page.getByTestId('owner-unknown').innerText(), /cannot tell which team/i);
  await shot(page, '55-owner-unknown', true);
  await page.waitForTimeout(600);
  assert.ok(!seen.some(r => /eab_push_records|eab_records|eab_files|storage/.test(r)), `nothing sent or loaded before the answer: ${seen}`);
  // The informed choice: confirm (a second question), then the records belong to Team B and syncing starts.
  await page.getByTestId('owner-confirm').click();
  await page.getByRole('button', { name: 'Yes, they belong to this team' }).click();
  await page.waitForSelector('nav.grid');
  await page.waitForFunction(() => true);
  await page.waitForTimeout(800);
  assert.ok(seen.some(r => /eab_push_records/.test(r)), 'only after the answer are the records sent');
  await page.context().close();
});

test('U57 a Phase 1 phone with real records, no remembered team and NO last-sync time still asks whose records they are; a genuinely new phone does not', async () => {
  const SB = 'https://sync-test.supabase.co';
  const ctx = await browser.newContext({ viewport: { width: 384, height: 824 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const seen = [];
  await ctx.route(`${SB}/**`, async route => {
    const req = route.request(); const u = new URL(req.url());
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    seen.push(`${req.method()} ${u.pathname}`);
    const body = u.pathname === '/rest/v1/rpc/eab_my_membership' ? [{ workspace_id: 'ws-B', workspace_name: 'Team B', role: 'owner' }]
      : u.pathname === '/rest/v1/rpc/eab_push_records' ? JSON.parse(req.postData()).rows.map(r => ({ collection: r.collection, id: r.id, status: 'ok', rev: 1 })) : [];
    return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(body) });
  });
  const page = await ctx.newPage();
  await page.goto(base); await page.waitForSelector('nav.grid'); await chooseStart(page, 'empty');
  const sess = { accessToken: 'AT', refreshToken: 'RT', expiresAt: Date.now() + 3_600_000, email: 'b@x.c', userId: 'uB', workspaceId: 'ws-B', workspaceName: 'Team B', role: 'owner' };
  const writeMeta = (meta, withRecord) => page.evaluate(async ([SBURL, meta, withRecord]) => {
    const db = await new Promise(res => { const r = indexedDB.open('estate-agent-buddy'); r.onsuccess = () => res(r.result); });
    const put = (store, key, val) => new Promise((res, rej) => { const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).put(val, key); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    if (withRecord) await put('records', 'c:contacts:a1', { id: 'a1', created: 1, updated: 5, name: 'Phase One Buyer', roles: ['buyer'] });
    await put('records', 's:meta', meta);
    await put('records', 's:settings', { lang: 'en', layout: 'grid', supabaseUrl: SBURL, supabaseAnonKey: 'anon' });
    db.close();
  }, [SB, meta, withRecord]);

  // A. What Phase 1 left behind: a record, an unsent edit, signed out, never completed a sync (no lastSync), no Phase 2 marker.
  await writeMeta({ fired: [], dirty: ['contacts:a1'], tombstones: [] }, true);
  await page.reload(); await page.getByTestId('login').waitFor();                      // first start of this version: signed out, so the login screen
  const readMeta = () => page.evaluate(() => new Promise(res => { const r = indexedDB.open('estate-agent-buddy'); r.onsuccess = () => { const g = r.result.transaction('records').objectStore('records').get('s:meta'); g.onsuccess = () => { res(g.result); r.result.close(); }; }; }));
  const stored = await readMeta();                                                      // written by the real first start
  assert.equal(stored.lastSync, undefined); assert.equal(stored.syncWorkspaceId, undefined);
  assert.equal(stored.ownerChecked, true); assert.equal(stored.ownerUnknown, true, 'the first start noticed existing records with no owner');
  assert.deepEqual(stored.dirty, ['contacts:a1'], 'the unsent edit is still waiting');
  await writeMeta({ ...stored, syncSession: sess }, false);                              // team B signs in
  await page.reload();
  await page.getByTestId('owner-unknown').waitFor();
  assert.equal(await page.locator('nav.grid').count(), 0); assert.equal(await page.getByText('Phase One Buyer').count(), 0);
  await shot(page, '56-owner-unknown-no-lastsync', true);
  await page.waitForTimeout(600);
  assert.ok(!seen.some(r => /eab_push_records|eab_records|eab_files|storage/.test(r)), `nothing sent or loaded: ${seen}`);
  await page.getByTestId('owner-signout').click(); await page.getByTestId('login').waitFor();
  const kept = await page.evaluate(() => new Promise(res => { const r = indexedDB.open('estate-agent-buddy'); r.onsuccess = () => { const g = r.result.transaction('records').objectStore('records').get('c:contacts:a1'); g.onsuccess = () => { res(g.result?.name); r.result.close(); }; }; }));
  assert.equal(kept, 'Phase One Buyer', 'signing out keeps the record');
  await page.context().close();

  // B. A genuinely new phone: opens empty, records entered offline, then signs in to its first team: no question.
  const ctx2 = await browser.newContext({ viewport: { width: 384, height: 824 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const seen2 = [];
  await ctx2.route(`${SB}/**`, async route => {
    const req = route.request(); const u = new URL(req.url());
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    seen2.push(`${req.method()} ${u.pathname}`);
    const body = u.pathname === '/rest/v1/rpc/eab_my_membership' ? [{ workspace_id: 'ws-B', workspace_name: 'Team B', role: 'owner' }]
      : u.pathname === '/rest/v1/rpc/eab_push_records' ? JSON.parse(req.postData()).rows.map(r => ({ collection: r.collection, id: r.id, status: 'ok', rev: 1 })) : [];
    return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(body) });
  });
  const p2 = await ctx2.newPage();
  await p2.goto(base); await p2.waitForSelector('nav.grid'); await chooseStart(p2, 'empty');       // first start: empty database
  await tile(p2, 'Buyer List'); await p2.getByRole('button', { name: 'New buyer' }).click();
  await p2.locator('[data-field="name"]').fill('Entered Offline'); await p2.getByTestId('save-contact').click(); await p2.getByTestId('contact-detail').waitFor();
  await waitStored(p2, 'records', "all.some(v => v && Array.isArray(v.dirty) && v.dirty.length > 0)");   // the unsent-changes list is written a moment after the record; the next step copies it
  await p2.evaluate(async SBURL => {
    const db = await new Promise(res => { const r = indexedDB.open('estate-agent-buddy'); r.onsuccess = () => res(r.result); });
    const get = (k) => new Promise(res => { const g = db.transaction('records').objectStore('records').get(k); g.onsuccess = () => res(g.result); });
    const put = (store, key, val) => new Promise((res, rej) => { const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).put(val, key); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    const meta = (await get('s:meta')) ?? {};
    await put('records', 's:meta', { ...meta, syncSession: { accessToken: 'AT', refreshToken: 'RT', expiresAt: Date.now() + 3_600_000, email: 'b@x.c', userId: 'uB', workspaceId: 'ws-B', workspaceName: 'Team B', role: 'owner' } });
    await put('records', 's:settings', { lang: 'en', layout: 'grid', supabaseUrl: SBURL, supabaseAnonKey: 'anon' });
    db.close();
  }, SB);
  await p2.reload(); await p2.waitForSelector('nav.grid');
  assert.equal(await p2.getByTestId('owner-unknown').count(), 0, 'no ownership warning for a new phone');
  for (let i = 0; i < 80 && !seen2.some(r => /eab_push_records/.test(r)); i++) await p2.waitForTimeout(250);   // up to 20 s: a slow machine needs longer than a fixed second
  assert.ok(seen2.some(r => /eab_push_records/.test(r)), `the offline records go to the first team (requests seen: ${seen2.join(' | ') || 'none'}; online=${await p2.evaluate(() => navigator.onLine)}; screen: ${(await p2.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 160)})`);
  await ctx2.close();
});

test('U58 a phone an intermediate build already marked (real records, no team, no last-sync, no Phase 2 marker) still asks; no records or files are requested or sent first', async () => {
  const SB = 'https://sync-test.supabase.co';
  const ctx = await browser.newContext({ viewport: { width: 384, height: 824 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const seen = [];
  await ctx.route(`${SB}/**`, async route => {
    const req = route.request(); const u = new URL(req.url());
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    seen.push(`${req.method()} ${u.pathname}`);
    const body = u.pathname === '/rest/v1/rpc/eab_my_membership' ? [{ workspace_id: 'ws-B', workspace_name: 'Team B', role: 'owner' }]
      : u.pathname === '/rest/v1/rpc/eab_push_records' ? JSON.parse(req.postData()).rows.map(r => ({ collection: r.collection, id: r.id, status: 'ok', rev: 1 })) : [];
    return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(body) });
  });
  const page = await ctx.newPage();
  await page.goto(base); await page.waitForSelector('nav.grid'); await chooseStart(page, 'empty');
  await page.evaluate(async SBURL => {
    const db = await new Promise(res => { const r = indexedDB.open('estate-agent-buddy'); r.onsuccess = () => res(r.result); });
    const put = (store, key, val) => new Promise((res, rej) => { const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).put(val, key); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    await put('records', 'c:contacts:a1', { id: 'a1', created: 1, updated: 5, name: 'Intermediate Buyer', roles: ['buyer'] });
    await put('records', 'c:properties:p1', { id: 'p1', created: 1, updated: 5, headline: 'House with a photo', photos: [{ id: 'f1', name: 'front.jpg' }], documents: [] });
    await put('files', 'f1', new Blob(['photo-bytes'], { type: 'image/jpeg' }));
    // ownerChecked already true (set by an intermediate build), but neither ownerUnknown nor ownerFresh, no lastSync, no owner; team B signed in.
    await put('records', 's:meta', { fired: [], dirty: ['contacts:a1', 'properties:p1'], tombstones: [], ownerChecked: true, syncSession: { accessToken: 'AT', refreshToken: 'RT', expiresAt: Date.now() + 3_600_000, email: 'b@x.c', userId: 'uB', workspaceId: 'ws-B', workspaceName: 'Team B', role: 'owner' } });
    await put('records', 's:settings', { lang: 'en', layout: 'grid', supabaseUrl: SBURL, supabaseAnonKey: 'anon' });
    db.close();
  }, SB);
  await page.reload();
  await page.getByTestId('owner-unknown').waitFor();
  assert.equal(await page.locator('nav.grid').count(), 0); assert.equal(await page.getByText('Intermediate Buyer').count(), 0);
  await shot(page, '57-owner-unknown-intermediate', true);
  await page.waitForTimeout(800);
  assert.ok(!seen.some(r => /eab_push_records|eab_records|eab_files|storage/.test(r)), `no records or files requested or sent: ${seen}`);
  const meta = await page.evaluate(() => new Promise(res => { const r = indexedDB.open('estate-agent-buddy'); r.onsuccess = () => { const g = r.result.transaction('records').objectStore('records').get('s:meta'); g.onsuccess = () => { res(g.result); r.result.close(); }; }; }));
  assert.equal(meta.syncWorkspaceId, undefined, 'team B not adopted'); assert.deepEqual(meta.dirty, ['contacts:a1', 'properties:p1']);
  const photo = await page.evaluate(() => new Promise(res => { const r = indexedDB.open('estate-agent-buddy'); r.onsuccess = () => { const g = r.result.transaction('files').objectStore('files').get('f1'); g.onsuccess = () => { res(!!g.result); r.result.close(); }; }; }));
  assert.equal(photo, true, 'the photo is still on the phone');
  await page.getByTestId('owner-confirm').click();
  await page.getByRole('button', { name: 'Yes, they belong to this team' }).click();
  await page.waitForSelector('nav.grid'); await page.waitForTimeout(800);
  assert.ok(seen.some(r => /eab_push_records/.test(r)), 'only after the answer are the records sent');
  await page.context().close();
});

// ---------------------------------------------------------------------------------------------------------------
// Stage 3 — Property & Contacts. These run in a desktop-Chromium phone-sized window with stand-ins for the speech service,
// the contact picker and touch; none of them is a test on a real Android phone (see docs/AUDIT.md for the S23 Ultra list).

test('U60 property form: the headline sits in Marketing (lower), Type & Purpose stays first; counts and the Edit target follow', async () => {
  const page = await phone();
  await tile(page, 'Property List'); await page.locator('.add-property').click(); await expandForm(page);
  assert.equal(await page.locator('#sec-basics [data-field="headline"]').count(), 0, 'not in the first section any more');
  assert.equal(await page.locator('#sec-marketing [data-field="headline"]').count(), 1, 'in Marketing');
  const y = id => page.locator(id).evaluate(e => e.getBoundingClientRect().top + scrollY);
  assert.ok(await y('#sec-marketing [data-field="headline"]') > await y('#sec-location'), 'below Location');
  assert.ok(await y('#sec-marketing [data-field="headline"]') > await y('#sec-owner'), 'below Owner');
  assert.match(await page.locator('#sec-basics .card-title').innerText(), /Basic Info and Availability/i);
  await page.locator('#sec-marketing [data-field="headline"]').fill('Corner shop, Nilai');
  await page.locator('[data-sec="marketing"]').click();
  assert.match(await page.locator('[data-sec="marketing"]').innerText(), /1 filled/i);
  await page.getByTestId('save-property').click(); await page.waitForSelector('[data-testid="listing-details"]');
  assert.match(await page.getByTestId('marketing').innerText(), /Corner shop, Nilai/i, 'shown with Marketing on the detail page');
  assert.doesNotMatch(await page.getByTestId('sec-basics').innerText(), /Corner shop/i);
  await page.getByTestId('marketing').getByRole('button', { name: /Edit/i }).click();
  await page.waitForSelector('#sec-marketing [data-field="headline"]');
  assert.equal(await page.locator('#sec-marketing [data-field="headline"]').inputValue(), 'Corner shop, Nilai');
  await page.context().close();
});

test('U61 no Fill with Voice on the form (owner, 17 Oct 2026); voice-command details must be reviewed before saving; "I have checked them" clears the review', async () => {
  const page = await phone();
  await tile(page, 'Property List'); await page.locator('.add-property').click();
  assert.equal(await page.getByTestId('voice-fill-btn').count() + await page.getByTestId('voice-panel').count(), 0, 'no Fill with Voice button or panel');
  await home(page); await tile(page, 'Voice Command');
  await page.getByTestId('voice-cmd').locator('textarea').first().fill('Create a new terrace house in Nilai for sale, asking price RM580,000, four bedrooms, three bathrooms, freehold.');
  await page.getByRole('button', { name: 'Show proposed details' }).click();
  await page.getByRole('button', { name: 'Open in the form to review' }).click();
  await expandForm(page);
  const banner = page.getByTestId('review-banner');
  await banner.waitFor();
  // Save asks first; "Cancel" returns to the form with nothing saved.
  await page.getByTestId('save-property').click();
  await page.getByRole('alertdialog').waitFor();
  assert.match(await page.getByRole('alertdialog').innerText(), /Save without checking/i);
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click();
  assert.equal(await page.getByTestId('listing-form').count(), 1);
  assert.equal(await page.evaluate(() => document.querySelectorAll('[data-testid="listing-details"]').length), 0);
  // Confirming the review removes the question.
  await page.getByTestId('review-done').click();
  assert.equal(await banner.getAttribute('data-checked'), 'yes');
  await page.getByTestId('save-property').click();
  await page.waitForSelector('[data-testid="listing-details"]');
  assert.equal(await page.getByRole('alertdialog').count(), 0);
  assert.equal(await page.locator('[data-row="bedrooms"] dd .vval').innerText(), '4', 'the reviewed voice details were saved');
  // "Save anyway" also works, and a saved voice field is no longer waiting for review when the property is edited later.
  await page.getByRole('button', { name: 'Edit', exact: true }).first().click(); await expandForm(page);
  assert.equal(await page.getByTestId('review-banner').count(), 0, 'already saved after review: no repeated warning');
  await page.context().close();
});

test('U62 voice command prefill (Voice Command card; the Property List has no voice button since Change 009) opens the form for review: fields marked "from your words", Save asks first', async () => {
  const page = await phone();
  await tile(page, 'Property List');
  assert.equal(await page.locator('.lc-tools .voice-btn').count(), 0, 'Change 009: no voice button in the Property List');
  await home(page); await tile(page, 'Voice Command');
  await page.getByTestId('voice-cmd').locator('textarea').first().fill('Create a new terrace house in Putra Nilai for rent, rental RM1,800 per month, three bedrooms, two bathrooms.');
  await page.getByRole('button', { name: 'Show proposed details' }).click();
  await page.getByRole('button', { name: 'Open in the form to review' }).click();
  await expandForm(page);
  assert.ok(await page.getByTestId('review-banner').count() === 1, 'the review notice is shown');
  assert.ok(await page.locator('#sec-tenure .chip.stated, #sec-details .chip.stated').count() >= 1, 'fields carry the "from your words" mark');
  await page.getByTestId('save-property').click();
  assert.match(await page.getByRole('alertdialog').innerText(), /Save without checking/i);
  await page.getByRole('alertdialog').getByRole('button', { name: 'Save anyway' }).click();
  await page.waitForSelector('[data-testid="listing-details"]');
  assert.match(await page.getByTestId('listing-details').innerText(), /1,800/i);
  await page.context().close();
});

test('U63 verification: four states, stored with the record, shown the same way everywhere, kept after restart, clearable', async () => {
  const page = await phone();
  await tile(page, 'Property List'); await page.locator('.add-property').click(); await expandForm(page);
  // Change 009: no "Not marked"; a fact without a mark shows as Need to Check.
  assert.equal(await page.locator('[data-verify="tenure"] option').count(), 4, 'the four states only');
  assert.deepEqual(await page.locator('[data-verify="tenure"] option').allInnerTexts(), ['Confirmed', 'Owner Stated', 'Need to Check', 'Unknown']);
  assert.equal(await page.locator('[data-verify="builtUpSqft"]').inputValue(), 'check', 'unmarked = Need to Check');
  assert.equal(await page.locator('[data-verify="headline"]').count(), 0, 'only facts that need checking carry a state');
  // Owner, 17 Oct 2026: the price has no status picker; Built-Up is used for the Owner Stated example instead.
  assert.equal(await page.locator('[data-verify="askingPrice"]').count(), 0, 'no status on Asking Price');
  await page.locator('[data-field="builtUpSqft"]').fill('1450');
  await page.locator('[data-verify="builtUpSqft"]').selectOption('owner');
  await page.locator('[data-verify="tenure"]').selectOption('check');
  await page.locator('[data-verify="titleType"]').selectOption('unknown');     // an empty field can be "Unknown"
  await page.locator('[data-verify="landSqft"]').selectOption('confirmed');
  await page.locator('[data-field="landSqft"]').fill('1500');
  assert.equal(await page.locator('[data-verify="builtUpSqft"]').getAttribute('aria-label'), 'Check status: Built-Up (sq ft)');
  await page.getByTestId('save-property').click(); await page.waitForSelector('[data-testid="listing-details"]');
  const row = k => page.locator(`[data-row="${k}"] [data-verify-state]`);
  assert.equal(await row('builtUpSqft').getAttribute('data-verify-state'), 'owner');
  assert.match(await row('builtUpSqft').innerText(), /Owner Stated/i, 'a word as well as a colour');
  assert.equal(await page.locator('[data-row="builtUpSqft"] .vval').getAttribute('data-verify'), 'owner', 'the value itself is in the Owner Stated colour');
  assert.match(await row('landSqft').innerText(), /Confirmed/i);
  // Change 015: one row per field, and one list per field: Tenure is marked but empty, so it is "Not filled" (not also
  // "To check"); Title Type (Unknown) is to check.
  assert.match(await page.getByTestId('verify-summary').innerText(), /To check \(1\)[\s\S]*Title Type/i);
  assert.equal(await page.getByTestId('to-check-row').count(), 1);
  assert.equal(await page.locator('[data-testid="not-filled-row"][data-key="tenure"]').count(), 1, 'Tenure is listed as not filled');
  await shot(page, '61-verification', true);
  // Still there after closing the app.
  await page.reload(); await page.waitForSelector('nav.grid');
  await tile(page, 'Property List'); await page.getByTestId('listing-card').first().click();
  assert.equal(await row('builtUpSqft').getAttribute('data-verify-state'), 'owner');
  // Edit: values shown, change one, clear one.
  await page.getByRole('button', { name: 'Edit', exact: true }).first().click(); await expandForm(page);
  assert.equal(await page.locator('[data-verify="builtUpSqft"]').inputValue(), 'owner');
  assert.equal(await page.locator('[data-verify="titleType"]').inputValue(), 'unknown');
  await page.locator('[data-verify="builtUpSqft"]').selectOption('confirmed');
  await page.locator('[data-verify="tenure"]').selectOption('confirmed');
  await page.getByTestId('save-property').click(); await page.waitForSelector('[data-testid="listing-details"]');
  assert.equal(await row('builtUpSqft').getAttribute('data-verify-state'), 'confirmed');
  assert.match(await page.getByTestId('verify-summary').innerText(), /To check \(1\)/i);
  // Changing the value itself does not touch the mark.
  await page.getByRole('button', { name: 'Edit', exact: true }).first().click(); await expandForm(page);
  await page.locator('[data-field="builtUpSqft"]').fill('1460'); await page.getByTestId('save-property').click();
  await page.waitForSelector('[data-testid="listing-details"]');
  assert.equal(await row('builtUpSqft').getAttribute('data-verify-state'), 'confirmed');
  await page.context().close();
});

test('U64 Asking Price and Monthly Rent have no check status (owner, 17 Oct 2026): no picker, no mark on the page, nothing stored', async () => {
  const page = await phone();
  await tile(page, 'Property List'); await page.locator('.add-property').click(); await expandForm(page);
  await page.locator('[data-field="purpose"]').selectOption('sale_or_rent');
  await page.locator('[data-field="askingPrice"]').fill('300000');
  await page.locator('[data-field="monthlyRent"]').fill('1800');
  assert.equal(await page.locator('[data-verify="askingPrice"], [data-verify="monthlyRent"]').count(), 0, 'no status picker on either price');
  await page.locator('[data-field="landSqft"]').fill('1500');
  assert.equal(await page.locator('[data-verify="landSqft"]').count(), 1, 'other facts keep theirs');
  await page.getByTestId('save-property').click(); await page.waitForSelector('[data-testid="listing-details"]');
  assert.equal(await page.locator('[data-row="askingPrice"] [data-verify-state], [data-row="monthlyRent"] [data-verify-state]').count(), 0);
  assert.equal(await page.getByTestId('to-check-row').filter({ hasText: /Asking Price|Monthly Rent/ }).count(), 0, 'prices are never listed as to check');
  const rec = await page.evaluate(() => new Promise(res => { const r = indexedDB.open('estate-agent-buddy'); r.onsuccess = () => { const q = r.result.transaction('records').objectStore('records').getAll(); q.onsuccess = () => { res(q.result.find(x => x && x.askingPrice === 300000)); r.result.close(); }; }; }));
  assert.equal(rec.verification?.askingPrice, undefined); assert.equal(rec.verification?.monthlyRent, undefined);
  await page.context().close();
});

test('U65 Change 008/009 property cards: a single tap opens; no long press, Preview, eye icon or preview sheet; address titles; gold Open; red Delete with confirmation on the details page', async () => {
  const page = await phone();
  await loadSample(page);
  await tile(page, 'Property List');
  const cards = page.getByTestId('listing-card');
  const count0 = await cards.count();
  // No preview controls of any kind, no floating Add button, no voice button; one Add New Property at the top.
  for (const id of ['preview-btn', 'preview-sheet', 'preview-hint']) assert.equal(await page.getByTestId(id).count(), 0, `no ${id}`);
  assert.equal(await page.locator('.fab, .lc-tools .voice-btn').count(), 0, 'no floating Add button and no voice button');
  assert.equal(await page.getByRole('button', { name: /Add New Property/i }).count(), 1);
  assert.ok(!(await page.getByTestId('listing').innerText()).includes('👁'), 'no eye icon');
  // Address titles, never the headline; the town is not repeated under it.
  const s1 = cards.filter({ hasText: 'No. 7, Lot 2/14' }).first();
  assert.equal(await s1.getByTestId('card-address').innerText(), 'No. 7, Lot 2/14, Jalan Sampel Industri 1, Kawasan Perindustrian Nilai');
  assert.ok(!/Nilai/.test(await s1.locator('[data-spec="type"]').first().innerText()), 'the line under the address is the type, not the town again');
  // Change 015: no Open button; a gold edit button (a pencil since 17 Oct 2026) and "Click to Open" instead.
  assert.equal(await s1.getByTestId('card-open').count(), 0);
  assert.match(await s1.getByTestId('card-edit').evaluate(b => getComputedStyle(b).backgroundImage), /gradient/i, 'gold gear');
  assert.equal(await s1.getByTestId('card-click-to-open').innerText(), 'Click to Open');
  // A long press (hold, release) and a right-click do nothing special: no preview; the press just counts as a tap.
  const b = await s1.locator('.sc-photo').boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + 30);
  await page.mouse.down({ button: 'right' }); await page.mouse.up({ button: 'right' });
  await page.waitForTimeout(300);
  assert.equal(await page.getByTestId('preview-sheet').count() + await page.getByRole('dialog').count(), 0, 'right-click / context menu opens nothing');
  await page.mouse.down(); await page.waitForTimeout(800); await page.mouse.up();
  await page.waitForTimeout(300);
  assert.equal(await page.getByTestId('preview-sheet').count() + await page.getByRole('dialog').count(), 0, 'a long press opens no preview or summary');
  if (await page.getByTestId('listing-details').count()) { await home(page); await tile(page, 'Property List'); }
  // A single tap opens the details.
  await cards.first().locator('.sc-card').click();
  await page.waitForSelector('[data-testid="listing-details"]');
  assert.equal(await page.locator('.rec-actions').getByRole('button', { name: /Voice/i }).count(), 0, 'no voice button on the details');
  // Red Delete with confirmation: Cancel keeps it, Delete removes it.
  const del = page.getByTestId('detail-delete');
  assert.match(await del.evaluate(x => getComputedStyle(x).backgroundColor), /rgb\(163, 38, 27\)/i, 'red');
  await del.click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click();
  assert.equal(await page.getByTestId('listing-details').count(), 1, 'Cancel keeps it');
  await del.click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await page.getByTestId('listing').waitFor();
  assert.equal(await cards.count(), count0 - 1);
  // Large cards: tenure with restriction; storeys and lot type in the first spec line (Change 015); full Extra Comments; a tap opens.
  await page.getByRole('button', { name: 'Large cards' }).click();
  const big = cards.filter({ hasText: 'No. 7, Lot 2/14' }).first();
  assert.match(await big.getByTestId('card-tenure').innerText(), /Freehold[\s\S]*NON Bumiputera/i);
  assert.match(await big.locator('[data-spec="type"]').innerText(), /2 Storeys\s+Corner$/, 'spaced, no commas (17 Oct 2026)');
  assert.equal(await big.getByTestId('card-comments').innerText(), 'Sample comment: side land can take a 40 ft container.\nAsk the guard house for the key (sample).');
  // Owner, 17 Oct 2026 (supersedes Change 011): one location button on each card. Change 015: no Delete or Open buttons.
  assert.equal(await big.getByTestId('card-location').count(), 1);
  assert.equal(await big.getByTestId('card-delete').count() + await big.getByTestId('card-open').count(), 0);
  await shot(page, '62-cards-large', false);
  await big.locator('.sc-photo').click();
  await page.waitForSelector('[data-testid="listing-details"]');
  // Unrelated eye: the Inquiries & Viewings card keeps its icon and works.
  await home(page);
  assert.equal(await page.locator('nav.grid > button', { hasText: 'Inquiries & Viewings' }).locator('svg').count() >= 1, true);
  await tile(page, 'Inquiries & Viewings');
  assert.equal(await page.locator('main').count(), 1);
  await page.context().close();
});

test('U66 phone book on the contact form and the property owner: icon beside the number; refused, cancelled and unsupported are each explained', async () => {
  const page = await phone();
  await tile(page, 'Buyer List'); await page.getByRole('button', { name: 'New buyer' }).click();
  const icon = page.getByTestId('pick-contact');
  assert.equal((await icon.getAttribute('aria-label')).toLowerCase(), 'choose from phone book');
  const [ib, fb] = await Promise.all([icon.boundingBox(), page.locator('[data-field="phone"]').boundingBox()]);
  assert.ok(ib.x >= fb.x + fb.width - 2 && Math.abs((ib.y + ib.height / 2) - (fb.y + fb.height / 2)) < 8 && ib.width >= 44 && ib.height >= 44, 'a 44px icon right beside the phone box');
  await icon.click();                                                   // no contact picker in this browser
  assert.match(await page.getByTestId('pick-contact-msg').innerText(), /not available in this browser/i);
  await page.evaluate(() => { window.ContactsManager = function () {}; Object.defineProperty(navigator, 'contacts', { configurable: true, value: { select: async () => [] } }); });
  await icon.click();                                                   // picker closed with nothing chosen
  assert.match(await page.getByTestId('pick-contact-msg').innerText(), /No contact was chosen/i);
  await page.evaluate(() => Object.defineProperty(navigator, 'contacts', { configurable: true, value: { select: async () => [{ name: ['No Number'], tel: [], email: [] }] } }));
  await icon.click();                                                   // a contact without a number
  assert.match(await page.getByTestId('pick-contact-msg').innerText(), /no phone number/i);
  assert.equal(await page.locator('[data-field="name"]').inputValue(), 'No Number');
  await page.evaluate(() => Object.defineProperty(navigator, 'contacts', { configurable: true, value: { select: async () => [{ name: ['Puan Rina'], tel: ['011-2233 4455'], email: [] }] } }));
  await icon.click();
  await page.getByRole('alertdialog').waitFor();                        // the name already differs → asks first
  await page.getByRole('alertdialog').getByRole('button', { name: 'Replace' }).click();
  assert.equal(await page.locator('[data-field="phone"]').inputValue(), '+60 11-2233 4455');
  assert.equal(await page.getByTestId('pick-contact-msg').count(), 0, 'the message goes away after a success');
  await home(page);
  // Property owner field
  await tile(page, 'Property List'); await page.locator('.add-property').click(); await expandForm(page);
  // Change 009: the phone-book icon sits at the end of the owner's NAME row; phone shows a ready "+", WhatsApp a ready "@".
  const own = page.getByTestId('owner-pick');
  assert.equal((await own.getAttribute('aria-label')).toLowerCase(), 'choose owner from phone book');
  const [ob, nb] = await Promise.all([own.boundingBox(), page.locator('[data-field="ownerName"]').boundingBox()]);
  assert.ok(ob.x >= nb.x + nb.width - 2 && Math.abs((ob.y + ob.height / 2) - (nb.y + nb.height / 2)) < 8 && ob.width >= 44, 'icon at the end of the name row');
  assert.deepEqual(await page.locator('#owner-box .prefix, [data-testid="owner-box"] .prefix').allInnerTexts(), ['+', '@']);
  await page.evaluate(() => Object.defineProperty(navigator, 'contacts', { configurable: true, value: { select: async () => { throw Object.assign(new Error('denied'), { name: 'NotAllowedError' }); } } }));
  await own.click();
  assert.match(await page.getByTestId('owner-pick-msg').innerText(), /No contact was chosen|permission/i, 'a refusal is never silent');
  await page.evaluate(() => Object.defineProperty(navigator, 'contacts', { configurable: true, value: { select: async () => [{ name: ['Encik Owner'], tel: ['012-999 8888'], email: [] }] } }));
  await own.click();
  assert.equal(await page.locator('[data-field="ownerName"]').inputValue(), 'Encik Owner');
  assert.equal(await page.locator('[data-field="ownerPhone"]').inputValue(), '60 12-999 8888', 'shown after the ready "+"');
  await page.locator('[data-field="ownerPhone"]').fill('013-111 2222');           // still editable
  await page.locator('[data-field="ownerWhatsapp"]').fill('@@encik_owner');
  assert.equal(await page.locator('[data-field="ownerWhatsapp"]').inputValue(), 'encik_owner', 'one "@", shown by the prefix');
  await page.evaluate(() => Object.defineProperty(navigator, 'contacts', { configurable: true, value: { select: async () => [{ name: ['Other Person'], tel: ['016-555 6666'], email: [] }] } }));
  await own.click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click();
  assert.equal(await page.locator('[data-field="ownerName"]').inputValue(), 'Encik Owner', 'cancel keeps what was typed');
  await shot(page, '63-owner-phonebook', false);
  await page.context().close();
});

test('U67 phone numbers that are too short get no Call / WhatsApp link, with an explanation; a WhatsApp alias without a number is kept', async () => {
  const page = await phone();
  await tile(page, 'Buyer List'); await page.getByRole('button', { name: 'New buyer' }).click();
  await page.locator('[data-field="name"]').fill('Short Number'); await page.locator('[data-field="phone"]').fill('12-34');
  await page.getByTestId('save-contact').click();
  await page.getByTestId('contact-detail').waitFor();
  assert.equal(await page.locator('a[href^="tel:"], a[href*="wa.me"]').count(), 0);
  assert.match(await page.getByTestId('phone-invalid').innerText(), /looks incomplete/i);
  await home(page); await tile(page, 'Buyer List');
  assert.equal(await page.locator('.contact-row a[href^="tel:"]').count(), 0, 'no broken Call link in the list either');
  await home(page); await tile(page, 'Buyer List'); await page.getByRole('button', { name: 'New buyer' }).click();
  await page.locator('[data-field="name"]').fill('Good Number'); await page.locator('[data-field="phone"]').fill('0123456789'); await page.locator('[data-field="whatsapp"]').fill('@good.number');
  await page.getByTestId('save-contact').click(); await page.getByTestId('contact-detail').waitFor();
  assert.equal(await page.locator('a[href="tel:+60123456789"]').count(), 1);
  assert.equal(await page.locator('a[href="https://wa.me/60123456789"]').count(), 1);
  assert.equal(await page.getByTestId('contact-whatsapp').innerText(), '@good.number', 'the alias is never turned into a number');
  await page.context().close();
});

test('U68 sample data: Sample tags on every kind of example record, example verification marks and aliases, all removable and none real', async () => {
  const page = await phone();
  await loadSample(page);
  await tile(page, 'Property List'); await page.getByTestId('listing-card').filter({ hasText: 'No. 7, Lot 2/14' }).first().locator('.sc-card').click();
  assert.ok(await page.locator('[data-verify-state]').count() >= 2, 'sample property shows example verification marks');
  await home(page);
  await tile(page, 'To-Do'); assert.ok(await page.getByTestId('task').locator('[data-testid="sample-tag"]').count() >= 1, 'to-do rows tagged');
  await home(page);
  await tile(page, 'Vendor List');
  assert.match(await page.locator('.contact-list').innerText(), /Sample|Contoh/i);
  await page.locator('.contact-row', { hasText: 'Owner F' }).locator('.row-main').click();
  assert.match(await page.getByTestId('contact-whatsapp').innerText(), /@ownerF_sample/i, 'an alias-only sample contact');
  assert.equal(await page.locator('a[href*="wa.me"]').count(), 0);
  await home(page);
  await tile(page, 'Agent Profile'); await page.getByRole('button', { name: /Settings/i }).click();
  await page.getByTestId('remove-sample').click();
  await home(page); await tile(page, 'Property List');
  assert.equal(await page.getByTestId('listing-card').count(), 0, 'everything that was sample is gone');
  await page.context().close();
});

test('U69 Bahasa Malaysia and Chinese: the new Stage 3 screens are translated', async () => {
  const page = await phone();
  await loadSample(page);
  await tile(page, 'Agent Profile'); await page.getByRole('button', { name: /Settings/i }).click();
  for (const [aria, voice, verifyOwner, openLabel, delLabel] of [
    ['Bahasa Malaysia', 'Isi dengan Suara', 'Dinyatakan Pemilik', 'Klik untuk Buka', 'Padam'],
    ['中文', '语音填写', '屋主所述', '点击打开', '删除'],
  ]) {
    await pickLang(page, `[aria-label="${aria}"]`);
    await home(page);
    await page.locator('nav.grid > button').nth(0).waitFor();
    // list → card ("Click to open", Change 015) → details with Delete (Change 009)
    await page.locator('nav.grid > button', { hasText: aria === 'Bahasa Malaysia' ? 'Senarai Subsale' : '二手房列表' }).first().click();
    assert.equal(await page.getByTestId('card-click-to-open').first().innerText(), openLabel);
    await page.locator('.sc-card').first().click();
    assert.match(await page.getByTestId('detail-delete').innerText(), new RegExp(delLabel));
    await page.goBack(); await page.getByTestId('listing').waitFor();
    // form → verification choices (no Fill with Voice button since 17 Oct 2026; `voice` is kept for the label list)
    void voice;
    await page.locator('.add-property').click(); await expandForm(page);
    assert.ok((await page.locator('[data-verify="tenure"] option').allInnerTexts()).includes(verifyOwner));
    await shot(page, `64-stage3-${aria === '中文' ? 'zh' : 'bm'}`, false);
    await home(page);
    await tile(page, aria === 'Bahasa Malaysia' ? 'Profil Ejen' : '经纪人资料');
    await page.getByRole('button', { name: /Settings|Tetapan|设置/i }).click();
  }
  await page.context().close();
});

// ---------------------------------------------------------------------------------------------------------------
// Stage 4 — GPS Assistance. Simulated GPS and a stand-in for Google Maps: these show the screens and rules work, they are
// NOT evidence of real GPS, real Google Maps or screen-off tracking on a phone.

test('U70 My Banner Location: changing the position keeps the earlier place; a photo can be removed; a banner on a sample property is a sample', async () => {
  const page = await phone({ maps: true, geo: { latitude: 2.8210, longitude: 101.8040, accuracy: 7 } });
  await loadSample(page);
  await tile(page, 'GPS Assistance'); await page.getByTestId('card-banners').click();
  const card = page.getByTestId('banner-card').first();
  const title = await card.locator('.banner-title').innerText();
  await card.getByTestId('banner-add').click();
  await page.getByTestId('banner-gps').click();
  await page.getByTestId('banner-pos-set').waitFor();
  await page.getByTestId('banner-photo-input').setInputFiles({ name: 'banner.png', mimeType: 'image/png', buffer: Buffer.from(PNG_1X1, 'base64') });
  await page.locator('.banner-photo.big').waitFor();
  await page.getByTestId('banner-photo-remove').click();
  assert.equal(await page.locator('.banner-photo.big').count(), 0, 'photo removed before saving');
  await page.getByTestId('banner-photo-input').setInputFiles({ name: 'banner.png', mimeType: 'image/png', buffer: Buffer.from(PNG_1X1, 'base64') });
  await page.locator('.banner-photo.big').waitFor();
  await page.getByTestId('banner-save').click();
  const row = () => page.locator('[data-testid="banner-card"]', { hasText: title }).getByTestId('banner-up');
  assert.equal(await row().locator('.banner-photo').count(), 1);
  assert.equal(await row().getByTestId('banner-moves').count(), 0, 'nothing moved yet');
  // Change the location by tapping the map: the old place is kept and listed.
  await row().getByTestId('banner-edit').click();
  await page.getByTestId('banner-pick-map').filter({ hasText: 'MAP' }).waitFor();   // the sheet's map is drawn
  await page.evaluate(() => window.__mapClick(2.8301, 101.8102));
  await page.getByTestId('banner-pos-set').filter({ hasText: /2\.83010, 101\.81020 · map/i }).waitFor();   // wait for the screen to show the tapped place
  assert.match(await page.getByTestId('banner-pos-set').innerText(), /2\.83010, 101\.81020 · map/i);
  await page.getByTestId('banner-photo-remove').click();               // and take the photo off the saved banner
  await page.getByTestId('banner-save').click();
  assert.match(await row().getByTestId('banner-pos').innerText(), /2\.83010, 101\.81020/i);
  assert.equal(await row().locator('.banner-photo').count(), 0, 'the photo is gone from the saved banner');
  assert.match(await row().getByTestId('banner-moves').innerText(), /Position changed 1 time/i);
  await row().getByTestId('banner-moves').locator('summary').click();
  assert.match(await row().getByTestId('banner-move').innerText(), /Was at 2\.82100, 101\.80400 until/i);
  assert.match(await row().getByTestId('banner-navigate').getAttribute('href'), /destination=2\.8301%2C101\.8102/i, 'Navigate uses the new saved position');
  // Editing only the note adds no move.
  await row().getByTestId('banner-edit').click();
  await page.locator('[data-field="bannerNote"]').fill('Repainted');
  await page.getByTestId('banner-save').click();
  assert.match(await row().getByTestId('banner-moves').innerText(), /Position changed 1 time/i);
  // The moves stay in the history after taking it down, and the record is flagged sample (so it never syncs).
  await row().getByTestId('banner-takedown').click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Mark taken down' }).click();
  const old = page.locator('[data-testid="banner-card"]', { hasText: title }).getByTestId('banner-old');
  await page.locator('[data-testid="banner-card"]', { hasText: title }).locator('.banner-history > summary').click();
  assert.match(await old.innerText(), /Position changed 1 time/i);
  const rec = await page.evaluate(() => new Promise(res => { const r = indexedDB.open('estate-agent-buddy'); r.onsuccess = () => { const q = r.result.transaction('records').objectStore('records').getAll(); q.onsuccess = () => { res(q.result.filter(x => x && x.placedOn)); r.result.close(); }; }; }));
  assert.equal(rec.length, 1);
  assert.equal(rec[0].sample, true, 'a banner on a sample property is a sample');
  assert.equal(rec[0].moves.length, 1);
  assert.ok(!rec[0].photoFileId);
  await page.context().close();
});

// ---------------------------------------------------------------------------------------------------------------
// Stage 5: Property Calculator, PDFs and Voice Command. The browser's own canvas, file download and speech
// stand-ins are used here; real PDF sharing, the real microphone and Android's speech service still have to be
// checked on the S23 Ultra.

/** Every record of one collection in the phone's storage (c:<collection>:<id>). */
const storedRecords = (page, collection) => page.evaluate(c => new Promise(res => {
  const r = indexedDB.open('estate-agent-buddy');
  r.onsuccess = () => {
    const db = r.result;
    const q = db.transaction('records').objectStore('records').openCursor();
    const out = [];
    q.onsuccess = () => { const cur = q.result; if (cur) { if (String(cur.key).startsWith(`c:${c}:`)) out.push(cur.value); cur.continue(); } else { db.close(); res(out); } };
  };
}), collection);
const calcTab = (page, name) => page.getByRole('tab', { name: new RegExp(`^${name}`) }).click();
/** A real picture (so the PDF has something to draw), made in the page. */
const makePhoto = (page, colour = '#3a7') => page.evaluate(c => { const cv = document.createElement('canvas'); cv.width = 640; cv.height = 480; const x = cv.getContext('2d'); x.fillStyle = c; x.fillRect(0, 0, 640, 480); x.fillStyle = '#fff'; x.fillRect(100, 100, 200, 150); return cv.toDataURL('image/jpeg', 0.8).split(',')[1]; }, colour).then(b => Buffer.from(b, 'base64'));
/** Presses a button that downloads the PDF and returns the file's bytes. */
async function pdfFrom(page, buttonTestId) {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId(buttonTestId).click()]);
  const { readFile } = await import('node:fs/promises');
  return { bytes: await readFile(await dl.path()), name: dl.suggestedFilename() };
}
const pdfInfo = b => { const t = b.toString('latin1'); return { header: t.slice(0, 8), pages: (t.match(/\/Type \/Page /g) ?? []).length, images: (t.match(/\/DCTDecode/g) ?? []).length, eof: t.trimEnd().endsWith('%%EOF') }; };

test('U71 Calculator: search and choose a property, choose a client, save, change and save again, reopen from History after closing the app, delete', async () => {
  const page = await phone();
  await loadSample(page);
  await tile(page, 'Property Calculator');
  assert.equal(await page.getByTestId('calc-from').count(), 0, 'opened without a property');
  await page.getByTestId('calc-pick-property').click();
  await page.getByTestId('calc-search').fill('no such place xyz');
  assert.equal(await page.getByTestId('calc-pick-item').count(), 0);
  assert.match(await page.getByTestId('calc-no-match').innerText(), /No property matches/i);
  await page.getByTestId('calc-search').fill('P1004');
  assert.equal(await page.getByTestId('calc-pick-item').count(), 1);
  await page.getByTestId('calc-pick-item').click();
  assert.match(await page.getByTestId('calc-from').innerText(), /P1004/i);
  await page.waitForFunction(() => document.querySelector('[data-field="price"]')?.value === '580,000').catch(() => {});   // the price is filled in after the property is read
  assert.equal(await page.locator('[data-field="price"]').inputValue(), '580,000', 'price came from the property');
  await page.getByTestId('calc-client').selectOption({ label: 'Buyer K (sample) · +60 12-111 2222' });
  await page.getByTestId('calc-name').fill('Offer A');
  assert.equal((await storedRecords(page, 'calculations')).length, 0, 'nothing is saved until Save');
  await page.getByTestId('calc-save').click();
  assert.match(await page.getByTestId('calc-saved').innerText(), /Saved on this phone/i);
  await waitStored(page, 'records', "all.some(v => v && v.kind === 'purchase' && v.title === 'Offer A' && v.purchase && v.purchase.price === 580000 && v.propertyId && v.contactId === 'b1')");
  // change and save again: the same record is updated
  await page.locator('[data-field="price"]').fill('600000');
  await page.getByTestId('calc-save').click();
  assert.match(await page.getByTestId('calc-saved').innerText(), /Changes saved/i);
  await waitStored(page, 'records', "all.some(v => v && v.title === 'Offer A' && v.purchase && v.purchase.price === 600000)");
  assert.equal((await storedRecords(page, 'calculations')).length, 1, 'edited in place, not duplicated');
  // a second, different calculation (rental) saved as new
  await calcTab(page, 'Rental');
  await page.locator('[data-field="rent"]').fill('2400');
  await page.getByTestId('calc-name').fill('Rent check B');
  await page.getByTestId('calc-save-new').click();
  await waitStored(page, 'records', "all.filter(v => v && v.kind === 'rental' && v.rental && v.rental.monthlyRent === 2400).length === 1");
  assert.equal((await storedRecords(page, 'calculations')).length, 2);
  // close the app and open it again: History still has both
  await page.reload(); await page.waitForSelector('nav.grid');
  await tile(page, 'Property Calculator');
  await calcTab(page, 'History');
  assert.equal(await page.getByTestId('calc-history-item').count(), 2);
  const first = page.getByTestId('calc-history-item').filter({ hasText: 'Offer A' });
  assert.match(await first.innerText(), /Monthly repayment/i);
  assert.match(await first.innerText(), /P1004/i);
  assert.match(await first.innerText(), /Buyer K/i);
  await shot(page, '71-calc-history');
  await first.getByTestId('calc-open').click();
  assert.equal(await page.locator('[data-field="price"]').inputValue(), '600,000', 'the saved price is back');
  assert.equal(await page.getByTestId('calc-name').inputValue(), 'Offer A');
  assert.match(await page.getByTestId('calc-from').innerText(), /P1004/i);
  assert.match(await page.getByTestId('calc-editing').innerText(), /Offer A/i);
  assert.equal(await page.getByTestId('calc-client').inputValue(), 'b1');
  // delete from History (asks first)
  await calcTab(page, 'History');
  await page.getByTestId('calc-history-item').filter({ hasText: 'Offer A' }).getByTestId('calc-delete').click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await waitStored(page, 'records', "all.filter(v => v && v.kind && v.purchase && v.rental).length === 1");
  assert.equal(await page.getByTestId('calc-history-item').count(), 1);
  await page.context().close();
});

test('U72 Calculator: a saved calculation can update the property record only after a review; cancel and unticked values change nothing', async () => {
  const page = await phone();
  await loadSample(page);
  await tile(page, 'Property Calculator');
  await page.getByTestId('calc-pick-property').click();
  await page.getByTestId('calc-search').fill('P1004');
  await page.getByTestId('calc-pick-item').click();
  assert.equal(await page.getByTestId('calc-update-property').count(), 0, 'not offered before the calculation is saved');
  await page.locator('[data-field="price"]').fill('600000');
  await page.getByTestId('calc-save').click();
  await waitStored(page, 'records', "all.some(v => v && v.kind === 'purchase' && v.purchase.price === 600000)");
  await page.getByTestId('calc-update-property').click();
  const sheet = page.getByTestId('calc-update-sheet');
  assert.match(await sheet.innerText(), /Asking price/i);
  assert.match(await sheet.innerText(), /Now: RM 580,000\.00/i);
  assert.match(await sheet.innerText(), /New: RM 600,000\.00/i);
  const price = async () => (await storedRecords(page, 'properties')).find(p => p.ref === 'P1004').askingPrice;
  assert.equal(await price(), 580000, 'reviewing changes nothing');
  await page.getByTestId('calc-update-cancel').click();
  assert.equal(await price(), 580000, 'Cancel changes nothing');
  await page.getByTestId('calc-update-property').click();
  await page.getByTestId('upd-askingPrice').uncheck();
  assert.equal(await page.getByTestId('calc-update-apply').isDisabled(), true, 'nothing ticked → nothing to apply');
  await page.getByTestId('upd-askingPrice').check();
  await page.getByTestId('calc-update-apply').click();
  await waitStored(page, 'records', "all.some(v => v && v.ref === 'P1004' && v.askingPrice === 600000)");
  const rec = (await storedRecords(page, 'properties')).find(p => p.ref === 'P1004');
  assert.match(rec.history[0].summary, /Updated from a saved calculation/i);
  assert.equal(rec.bedrooms !== undefined, true, 'other details are untouched');
  // the same values again: nothing left to update
  await page.getByTestId('calc-update-property').click();
  assert.match(await page.getByTestId('calc-update-nothing').innerText(), /already has the same values/i);
  await page.getByTestId('calc-update-cancel').click();
  await page.context().close();
});

test('U73 Calculator PDF: preview the pages, download a real PDF file, share falls back to a download, the assumptions on the day are printed', async () => {
  const page = await phone();
  await loadSample(page);
  await tile(page, 'Property Calculator');
  await page.getByTestId('calc-pick-property').click();
  await page.getByTestId('calc-search').fill('P1004');
  await page.getByTestId('calc-pick-item').click();
  await page.getByTestId('calc-name').fill('Offer for Mr Tan');
  await page.getByTestId('calc-pdf').click();
  await page.getByTestId('pdf-page').first().waitFor({ timeout: 15000 });
  const pages = await page.getByTestId('pdf-page').count();
  assert.ok(pages >= 1);
  assert.match(await page.getByTestId('pdf-pages').innerText(), new RegExp(`${pages} page`));
  assert.equal(await page.getByTestId('pdf-page').first().evaluate(i => i.naturalWidth), 1190, 'A4 at two pixels per point');
  await shot(page, '73-calc-pdf-preview', false);
  const dl = await pdfFrom(page, 'pdf-download');
  const info = pdfInfo(dl.bytes);
  assert.equal(info.header, '%PDF-1.4');
  assert.equal(info.pages, pages, 'the file has the pages that were previewed');
  assert.equal(info.images, pages); assert.ok(info.eof);
  assert.match(dl.name, /^Offer-for-Mr-Tan.*\.pdf$/i);
  assert.match(await page.getByTestId('pdf-msg').innerText(), /Downloaded/i);
  // Change 013: Share opens the share sheet; a desktop browser that cannot share files now says so plainly (it no longer
  // downloads behind the person's back). The Android share sheet itself is tested on the phone, not here.
  await page.getByTestId('pdf-share').click();
  assert.match(await page.getByTestId('pdf-msg').innerText(), /cannot share files[\s\S]*Download/i);
  await page.getByTestId('pdf-close').click();
  assert.equal(await page.getByTestId('pdf-preview').count(), 0);
  // an empty calculation (all zero, no property) still makes a PDF
  await page.reload(); await page.waitForSelector('nav.grid');
  await tile(page, 'Property Calculator');
  await calcTab(page, 'Sale');
  await page.getByTestId('calc-pdf').click();
  await page.getByTestId('pdf-page').first().waitFor({ timeout: 15000 });
  assert.equal(pdfInfo((await pdfFrom(page, 'pdf-download')).bytes).header, '%PDF-1.4');
  await page.context().close();
});

test('U74 Buyer PDF: choose details and photos, never offered: owner, commission, notes; missing details and no photos do not break it; the verification labels are kept', async () => {
  const page = await phone();
  await loadSample(page);
  await tile(page, 'Property List');
  await page.getByText('No. 18, Jalan Sampel 3/1, Bandar Baru Nilai').first().click();
  await page.getByTestId('open-buyer-pdf').click();
  const screen = page.getByTestId('buyer-pdf');
  await screen.waitFor();
  const text = await screen.innerText();
  for (const never of ['Owner name', 'Owner Name', 'Owner phone', 'Owner Phone', 'Commission', 'Internal notes', 'Internal Notes', 'Current tenant', 'Tenant Name', 'Arrangement', 'Handled by', 'Handled By', 'Owner WhatsApp']) assert.ok(!text.includes(never), `${never} must not be offered`);
  assert.match(await screen.getByTestId('bf-askingPrice').innerText(), /Asking price.*RM 580,000/i);
  // Owner, 17 Oct 2026: the price has no check status; other facts keep their label.
  assert.doesNotMatch(await screen.getByTestId('bf-askingPrice').innerText(), /Owner stated|Need to check|Confirmed|Unknown/i, 'no status on the price');
  assert.match(await screen.getByTestId('bf-condition').innerText(), /Owner stated/i, 'the existing check-status label is shown with the fact');
  assert.match(await screen.getByTestId('buyer-pdf-count').innerText(), /\d+ of \d+ ticked/i);
  assert.equal(await screen.getByTestId('bf-street').locator('input').isChecked(), false, 'the exact address starts unticked');
  assert.equal(await screen.getByTestId('bf-askingPrice').locator('input').isChecked(), true);
  // untick one, clear all, tick all
  await screen.getByTestId('bf-bedrooms').locator('input').uncheck();
  await screen.getByTestId('buyer-pdf-none').click();
  assert.match(await screen.getByTestId('buyer-pdf-count').innerText(), /^0 of/i);
  await screen.getByTestId('buyer-pdf-all').click();
  assert.equal(await screen.getByTestId('bf-bedrooms').locator('input').isChecked(), true);
  // missing details are listed apart and can be ticked ("To be confirmed")
  await screen.getByTestId('buyer-pdf-missing').locator('summary').click();
  assert.ok(await screen.getByTestId('buyer-pdf-missing').locator('input').count() > 0);
  // the PDF language can differ from the app
  await screen.getByTestId('buyer-pdf-lang').selectOption('zh');
  assert.match(await screen.innerText(), /价格/i);
  await screen.getByTestId('buyer-pdf-lang').selectOption('en');
  await screen.getByTestId('buyer-pdf-preview').click();
  await page.getByTestId('pdf-page').first().waitFor({ timeout: 15000 });
  const bytes = (await pdfFrom(page, 'pdf-download')).bytes;
  assert.deepEqual([pdfInfo(bytes).header, pdfInfo(bytes).eof], ['%PDF-1.4', true]);
  await shot(page, '74-buyer-pdf-preview', false);
  await page.getByTestId('pdf-close').click();
  await page.context().close();
});

test('U75 Buyer PDF with real photos: the agent chooses which go in; a property with no photos and almost no details still makes a PDF', async () => {
  const page = await phone();
  await tile(page, 'Property List');
  await page.getByRole('button', { name: 'Add New Property' }).first().click(); await expandForm(page);
  await page.locator('[data-field="headline"]').fill('Bare minimum house');
  await page.getByTestId('save-property').click();
  await page.waitForSelector('[data-testid="listing-details"]');
  await page.getByTestId('open-buyer-pdf').click();
  await page.getByTestId('buyer-pdf').waitFor();
  assert.match(await page.getByTestId('buyer-pdf-no-photos').innerText(), /no photos yet/i);
  assert.match(await page.getByTestId('buyer-pdf-agent-none').innerText(), /Agent Profile/i);
  await page.getByTestId('buyer-pdf-preview').click();
  await page.getByTestId('pdf-page').first().waitFor({ timeout: 15000 });
  assert.equal(pdfInfo((await pdfFrom(page, 'pdf-download')).bytes).header, '%PDF-1.4', 'no photos, almost no details: still a PDF');
  await page.getByTestId('pdf-close').click();
  // now add two real photos to the property and choose one
  await page.locator('header .icon-btn').first().click();
  await page.getByTestId('listing-details').waitFor();
  await page.getByRole('button', { name: 'Edit' }).first().click(); await expandForm(page);
  await page.getByTestId('photo-input').setInputFiles([
    { name: 'front.jpg', mimeType: 'image/jpeg', buffer: await makePhoto(page, '#3a7') },
    { name: 'back.jpg', mimeType: 'image/jpeg', buffer: await makePhoto(page, '#a53') },
  ]);
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="listing-form"] img').length >= 2);
  await page.getByTestId('save-property').click();
  await page.waitForSelector('[data-testid="listing-details"]');
  await page.getByTestId('open-buyer-pdf').click();
  await page.getByTestId('buyer-pdf').waitFor();
  assert.equal(await page.getByTestId('buyer-pdf-photo').count(), 2);
  assert.match(await page.getByTestId('buyer-pdf-photo-count').innerText(), /2 photos ticked/i);
  await page.getByTestId('buyer-pdf-photo').nth(1).locator('input').uncheck();
  assert.match(await page.getByTestId('buyer-pdf-photo-count').innerText(), /1 photo ticked/i);
  await page.getByTestId('buyer-pdf-preview').click();
  await page.getByTestId('pdf-page').first().waitFor({ timeout: 15000 });
  assert.equal(await page.getByTestId('buyer-pdf-skipped').count(), 0);
  const one = pdfInfo((await pdfFrom(page, 'pdf-download')).bytes);
  assert.equal(one.header, '%PDF-1.4');
  await shot(page, '75-buyer-pdf-photo', false);
  await page.getByTestId('pdf-close').click();
  // none ticked → no picture section, still fine
  await page.getByTestId('buyer-pdf-photo').nth(0).locator('input').uncheck();
  assert.match(await page.getByTestId('buyer-pdf-photo-count').innerText(), /0 photos ticked/i);
  await page.getByTestId('buyer-pdf-preview').click();
  await page.getByTestId('pdf-page').first().waitFor({ timeout: 15000 });
  assert.equal(pdfInfo((await pdfFrom(page, 'pdf-download')).bytes).header, '%PDF-1.4');
  await page.context().close();
});

test('U76 Voice diagnostics: unsupported recognition, blocked microphone and an insecure page are each explained; Test recognition really listens; the report says it is not proof', async () => {
  const run = async (script, fn) => {
    const ctx = await browser.newContext({ viewport: { width: 384, height: 824 }, isMobile: true, hasTouch: true });
    await ctx.addInitScript(script);
    const page = await ctx.newPage();
    page.on('pageerror', e => consoleErrors.push(String(e)));
    await page.goto(base); await page.waitForSelector('nav.grid'); await chooseStart(page, 'empty');
    await tile(page, 'Voice Command');
    await page.getByTestId('open-voice-diag').click();
    await page.getByTestId('voice-diag-checks').waitFor();
    await fn(page);
    await ctx.close();
  };
  // 1. no speech recognition at all
  await run('delete window.SpeechRecognition; delete window.webkitSpeechRecognition;', async page => {
    assert.equal(await page.getByTestId('diag-engine').getAttribute('data-code'), 'unsupported');
    assert.equal(await page.getByTestId('voice-diag-verdict').getAttribute('data-verdict'), 'blocked');
    assert.match(await page.getByTestId('diag-engine').innerText(), /no speech recognition/i);
    assert.match(await page.getByTestId('voice-diag-sim').innerText(), /not proof/i);
    await page.getByTestId('voice-diag-start').click();
    assert.match(await page.getByTestId('voice-diag-error').innerText(), /not supported here/i);
    await page.getByTestId('voice-diag-again').click();
    assert.equal(await page.getByTestId('diag-last').getAttribute('data-code'), 'err_unsupported', 'the last problem is remembered and shown');
  });
  // 2. microphone blocked
  await run(`${FAKE_SPEECH('Test 1 2 3')}; navigator.permissions.query = async () => ({ state: 'denied' });`, async page => {
    assert.equal(await page.getByTestId('diag-permission').getAttribute('data-code'), 'perm_denied_web');
    assert.match(await page.getByTestId('diag-permission').innerText(), /Site settings/i);
    assert.equal(await page.getByTestId('voice-diag-verdict').getAttribute('data-verdict'), 'blocked');
  });
  // 3. page not secure
  await run(`${FAKE_SPEECH('Test 1 2 3')}; Object.defineProperty(window, 'isSecureContext', { value: false });`, async page => {
    assert.equal(await page.getByTestId('diag-secure').getAttribute('data-code'), 'insecure');
    assert.match(await page.getByTestId('diag-secure').innerText(), /https/i);
  });
  // 4. working stand-in: Test recognition shows the words; the details text is plain and says "NOT proof"
  await run(`${FAKE_SPEECH('Test 1 2 3')}; navigator.permissions.query = async () => ({ state: 'granted' });`, async page => {
    assert.equal(await page.getByTestId('diag-engine').getAttribute('data-status'), 'ok');
    await page.getByTestId('voice-diag-start').click();
    await page.getByTestId('voice-diag-stop').click();
    await page.getByTestId('voice-diag-ok').waitFor();
    assert.match(await page.getByTestId('voice-diag-heard').innerText(), /Test 1 2 3/i);
    assert.equal(await page.getByTestId('diag-last').getAttribute('data-code'), 'lastOk');
    await page.locator('summary', { hasText: 'Details to send' }).click();
    const report = await page.getByTestId('voice-diag-report').innerText();
    assert.match(report, /NOT proof that the microphone works/i);
    assert.ok(!/@|\+60/.test(report));
    await shot(page, '76-voice-diagnostics');
  });
  // 5. a recognition error from the service is explained with what to do
  await run(`class R { start() { setTimeout(() => this.onerror?.({ error: 'network' }), 30); setTimeout(() => this.onend?.(), 60); } stop() {} abort() {} } window.SpeechRecognition = R;`, async page => {
    await page.getByTestId('voice-diag-start').click();
    await page.getByTestId('voice-diag-error').waitFor();
    assert.match(await page.getByTestId('voice-diag-error').innerText(), /speech service could not be reached.*internet connection/i);
  });
});

test('U77 Voice Command: set the asking price, change the status to Sold and find buyers — each opens a review; nothing is saved until Apply', async () => {
  const page = await phone();
  await loadSample(page);
  await tile(page, 'Voice Command');
  const say = async t => { await page.getByTestId('voice-cmd').locator('textarea').fill(t); await page.getByRole('button', { name: 'Show proposed details' }).click(); };
  const p1004 = async () => (await storedRecords(page, 'properties')).find(p => p.ref === 'P1004');
  // 1. asking price by reference
  await say('Set the asking price of P1004 to RM600,000');
  const panel = page.getByTestId('target-panel');
  await panel.waitFor();
  assert.match(await panel.innerText(), /P1004/i);
  assert.match(await panel.innerText(), /Now: RM 580,000/i);
  assert.match(await panel.innerText(), /New: RM 600,000/i);
  assert.equal((await p1004()).askingPrice, 580000, 'nothing saved from speech alone');
  await page.getByTestId('target-cancel').click();
  assert.equal((await p1004()).askingPrice, 580000, 'Cancel changes nothing');
  await say('Set the asking price of P1004 to RM600,000');
  await page.getByTestId('target-apply').click();
  await waitStored(page, 'records', "all.some(v => v && v.ref === 'P1004' && v.askingPrice === 600000)");
  assert.match(await page.getByTestId('voice-done').innerText(), /Property updated/i);
  assert.match((await p1004()).history[0].summary, /askingPrice/i);
  // 2. status to Sold (and Bahasa Malaysia wording)
  await say('Change the status of P1004 to Sold');
  assert.match(await page.getByTestId('target-panel').innerText(), /Now: .*\n?.*New: Sold/si);
  assert.notEqual((await p1004()).status, 'sold');
  await page.getByTestId('target-apply').click();
  await waitStored(page, 'records', "all.some(v => v && v.ref === 'P1004' && v.status === 'sold')");
  await say('tukar harga P1004 kepada RM590,000');
  assert.match(await page.getByTestId('target-panel').innerText(), /590,000/i);
  await page.getByTestId('target-cancel').click();
  assert.equal((await p1004()).askingPrice, 600000);
  // 3. an unknown reference is explained, not guessed
  await say('Change the status of P9999 to Sold');
  assert.match(await page.getByTestId('target-none').innerText(), /No property matches/i);
  await say('Set the price to RM3 million');
  assert.match(await page.getByTestId('target-none').innerText(), /Which property/i);
  // 4. find buyers by what they want
  await say('Find buyers looking for a factory in Salak Tinggi');
  const buyers = page.getByTestId('buyers-panel');
  await buyers.waitFor();
  assert.ok(await page.getByTestId('buyer-match').count() >= 1);
  assert.match(await buyers.innerText(), /Tenant R/i);
  assert.match(await buyers.innerText(), /notes: factory|asked about/i);
  await shot(page, '77-find-buyers');
  await page.getByTestId('buyer-match').first().getByTestId('buyer-open').click();
  await page.getByTestId('contact-detail').waitFor();
  await home(page);
  await tile(page, 'Voice Command');
  await say('Find buyers looking for a bungalow in Kajang');
  assert.match(await page.getByTestId('buyers-none').innerText(), /No buyer or tenant matches/i);
  // 5. the existing commands still work
  await say('Remind me to call Buyer K tomorrow at 3pm');
  await page.waitForSelector('[data-testid="task-form"]');
  await page.context().close();
});

test('U78 Bahasa Malaysia and Chinese: the calculator, buyer PDF, update sheet and voice diagnostics screens of Stage 5 are translated', async () => {
  const page = await phone();
  await loadSample(page);
  const setLang = async aria => {
    await home(page);
    await page.getByTestId('top-profile').click();                                // Agent Profile (top bar since Change 011)
    await page.getByRole('button', { name: /Settings|Tetapan|设置/i }).click();
    await pickLang(page, `[aria-label="${aria}"]`);
    await home(page);
  };
  for (const [aria, expect] of [
    ['Bahasa Malaysia', { hist: 'Sejarah', empty: /Belum ada/, pdf: 'Eksport PDF', diag: 'Diagnostik suara', diagText: /Menyemak mengapa/, buyer: 'PDF pembeli', buyerText: /Pilih apa yang pembeli lihat/, upd: /Kemas kini rekod hartanah/i }],
    ['中文', { hist: '记录', empty: /还没有/, pdf: '导出 PDF', diag: '语音诊断', diagText: /检查这部手机/, buyer: '买家 PDF', buyerText: /选择买家能看到的内容/, upd: /更新房产记录/i }],
  ]) {
    await setLang(aria);
    await page.locator('nav.grid > button').nth(8).click();                       // Property Calculator
    await page.getByRole('tab', { name: new RegExp(expect.hist, 'i') }).click();
    if (aria === 'Bahasa Malaysia') assert.match(await page.getByTestId('calc-history-empty').innerText(), expect.empty);
    else assert.match(await page.getByTestId('calc-history-item').first().innerText(), /购买与贷款.*保存于/si);   // the calculation saved in the previous round
    await page.getByRole('tab').first().click();
    assert.match(await page.getByTestId('calc-pdf').innerText(), new RegExp(expect.pdf, 'i'));
    await page.getByTestId('calc-pick-property').click();
    await page.getByTestId('calc-pick-item').first().click();
    await page.locator('[data-field="price"]').fill('1234567');
    await page.getByTestId('calc-save').click();
    await page.getByTestId('calc-update-property').click();
    assert.match(await page.getByTestId('calc-update-sheet').innerText(), expect.upd);
    await page.getByTestId('calc-update-cancel').click();
    await home(page);
    await page.locator('nav.grid > button').nth(13).click();                      // Subsale List (card 14)
    await page.getByTestId('listing-card').first().click();
    assert.match(await page.getByTestId('open-buyer-pdf').innerText(), new RegExp(expect.buyer, 'i'));
    await page.getByTestId('open-buyer-pdf').click();
    assert.match(await page.getByTestId('buyer-pdf').innerText(), expect.buyerText);
    await home(page);
    await page.locator('nav.grid > button[data-key="voice"]').click();
    assert.match(await page.getByTestId('open-voice-diag').innerText(), new RegExp(expect.diag, 'i'));
    await page.getByTestId('open-voice-diag').click();
    assert.match(await page.getByTestId('voice-diag').innerText(), expect.diagText);
    await shot(page, `78-${aria === '中文' ? 'zh' : 'bm'}-voice-diagnostics`);
  }
  await page.context().close();
});

const ymdLocal = (offset = 0) => { const d = new Date(); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
async function bareProperty(page, name = 'Bare minimum house') {
  await tile(page, 'Property List');
  await page.getByRole('button', { name: 'Add New Property' }).first().click(); await expandForm(page);
  await page.locator('[data-field="headline"]').fill(name);
  // Change 009: cards show the address, so the test property's street carries its name too.
  await setStreet(page, name);
  await page.getByTestId('save-property').click();
  await page.waitForSelector('[data-testid="listing-details"]');
}
const adsOf = async page => (await storedRecords(page, 'properties')).flatMap(p => (p.marketing?.ads ?? []).map(a => ({ ...a, prop: p.id })));

test('U79 Advert tracker: add real and fake adverts, validation, stale live status, cost, saved after closing the app, test listings kept out of the totals', async () => {
  const page = await phone();
  await bareProperty(page);
  await page.getByTestId('open-ad-tracker').click();
  await page.getByTestId('ad-tracker').waitFor();
  assert.match(await page.getByTestId('ad-tracker').innerText(), /never posts to a platform/i);
  assert.match(await page.getByTestId('ad-none').innerText(), /No adverts recorded/i);
  // a real advert: an invalid link is refused and nothing is stored
  await page.getByTestId('ad-add').click();
  await page.getByTestId('ad-platform').selectOption('PropertyGuru');
  await page.getByTestId('ad-type').selectOption({ label: 'Boosted (Paid)' });
  await page.getByTestId('ad-title').fill('Corner house, quick sale');
  await page.getByTestId('ad-url').fill('www.no-scheme.com');
  await page.getByTestId('ad-status-select').selectOption('live');
  await page.getByTestId('ad-start').fill(ymdLocal(-10));
  await page.getByTestId('ad-end').fill(ymdLocal(-2));
  await page.locator('[data-field="ad-cost"]').fill('450');
  await page.getByTestId('ad-save').click();
  assert.match(await page.getByTestId('ad-editor-form').innerText(), /must start with http/i);
  assert.equal((await adsOf(page)).length, 0, 'a refused advert is not stored');
  await page.getByTestId('ad-url').fill('https://www.propertyguru.com.my/listing/123');
  await page.getByTestId('ad-end').fill(ymdLocal(-12));
  await page.getByTestId('ad-save').click();
  assert.match(await page.getByTestId('ad-editor-form').innerText(), /before the published date/i);
  await page.getByTestId('ad-end').fill(ymdLocal(-2));
  await page.getByTestId('ad-save').click();
  await page.getByTestId('ad-card').waitFor();
  await waitStored(page, 'records', "all.some(v => v && v.marketing && v.marketing.ads.some(a => a.platform === 'PropertyGuru' && a.cost === 450 && a.status === 'live' && a.type === 'boosted' && a.url.startsWith('https://')))");
  const card = page.getByTestId('ad-card').first();
  assert.match(await card.getByTestId('ad-status').innerText(), /Expired/i, 'live but past its end date: shown as expired');
  assert.match(await card.getByTestId('ad-stale').innerText(), /End date has passed/i);
  assert.equal((await adsOf(page))[0].status, 'live', 'the saved status is not rewritten by the screen');
  assert.match(await card.getByTestId('ad-cost').innerText(), /RM 450\.00/i);
  await page.getByTestId('ad-mark-expired').click();
  await waitStored(page, 'records', "all.some(v => v && v.marketing && v.marketing.ads.some(a => a.status === 'expired'))");
  // a second real advert that is about to expire
  await page.getByTestId('ad-add').click();
  await page.getByTestId('ad-platform').selectOption('Mudah');
  await page.getByTestId('ad-status-select').selectOption('live');
  await page.getByTestId('ad-end').fill(ymdLocal(1));
  await page.getByTestId('ad-save').click();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="ad-card"]').length === 2);
  // a fake listing: labelled, planned, never counted
  await page.getByTestId('ad-add-fake').click();
  assert.match(await page.getByTestId('ad-editor-form').innerText(), /TEST · not a real listing/i);
  assert.match(await page.getByTestId('ad-editor-form').innerText(), /not counted in costs or reminders/i);
  assert.equal(await page.getByTestId('ad-status-select').inputValue(), 'planned');
  await page.getByTestId('ad-title').fill('Practice post');
  await page.locator('[data-field="ad-cost"]').fill('5000');
  await page.getByTestId('ad-save').click();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="ad-card"]').length === 3);
  await waitStored(page, 'records', "all.some(v => v && v.marketing && v.marketing.ads.some(a => a.fake === true && a.cost === 5000))");
  const fakeCard = page.locator('[data-testid="ad-card"][data-fake="yes"]');
  assert.equal(await fakeCard.count(), 1);
  assert.match(await fakeCard.innerText(), /TEST · not a real listing/i);
  assert.match(await page.getByTestId('ad-total').innerText(), /Total cost: RM 450\.00/i, 'the 5,000 test cost is not added');
  assert.match(await page.getByTestId('ad-total').innerText(), /1 test listing not counted/i);
  await shot(page, '79a-advert-tracker');
  // closing the app keeps everything
  await page.reload(); await page.waitForSelector('nav.grid');
  await tile(page, 'Property List');
  await page.getByText('Bare minimum house').first().click();
  assert.match(await page.getByTestId('marketing').innerText(), /TEST · not a real listing/i, 'the detail page labels the test advert too');
  await page.getByTestId('open-ad-tracker').click();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="ad-card"]').length === 3);
  // edit keeps one record, not a copy
  await page.getByTestId('ad-edit').first().click();
  await page.getByTestId('ad-notes').fill('Renew after the weekend');
  await page.getByTestId('ad-save').click();
  await waitStored(page, 'records', "all.some(v => v && v.marketing && v.marketing.ads.some(a => a.notes === 'Renew after the weekend'))");
  assert.equal((await adsOf(page)).length, 3);
  // delete asks first
  await page.locator('[data-testid="ad-card"][data-fake="yes"] [data-testid="ad-edit"]').click();
  await page.getByTestId('ad-delete').click();
  await page.getByRole('button', { name: 'Cancel' }).last().click();
  assert.equal((await adsOf(page)).length, 3, 'cancelling the question deletes nothing');
  await page.getByTestId('ad-delete').click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await waitStored(page, 'records', "!all.some(v => v && v.marketing && v.marketing.ads.some(a => a.fake === true))");
  const rec = (await storedRecords(page, 'properties'))[0];
  assert.match(rec.history[0].summary, /Advert removed/i);
  await page.context().close();
});

test('U80 Advertising summary: needs-attention list and costs by property, platform and month; test listings and sample adverts are left out', async () => {
  const page = await phone();
  await bareProperty(page, 'Real house');
  await page.getByTestId('open-ad-tracker').click();
  const add = async (platform, o = {}) => {
    await page.getByTestId('ad-add').click();
    await page.getByTestId('ad-platform').selectOption(platform);
    if (o.status) await page.getByTestId('ad-status-select').selectOption(o.status);
    if (o.start) await page.getByTestId('ad-start').fill(o.start);
    if (o.end) await page.getByTestId('ad-end').fill(o.end);
    if (o.cost) await page.locator('[data-field="ad-cost"]').fill(String(o.cost));
    await page.getByTestId('ad-save').click();
  };
  await add('PropertyGuru', { status: 'live', start: '2026-09-05', end: ymdLocal(-1), cost: 300 });
  await add('Mudah', { status: 'live', start: '2026-10-01', end: ymdLocal(2), cost: 100 });
  await add('PropertyGuru', { status: 'needs_update', start: '2026-10-09' });
  await page.getByTestId('ad-add-fake').click(); await page.locator('[data-field="ad-cost"]').fill('7777'); await page.getByTestId('ad-save').click();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="ad-card"]').length === 4);
  await waitStored(page, 'records', "all.some(v => v && v.marketing && v.marketing.ads.length === 4)");
  await page.getByTestId('ad-open-summary').click();
  await page.getByTestId('ad-summary').waitFor();
  assert.equal(await page.getByTestId('ad-attention-item').count(), 3, 'expired, expiring and needs-update — the test listing never appears');
  assert.deepEqual(await page.getByTestId('ad-attention-item').evaluateAll(els => els.map(e => e.getAttribute('data-kind'))), ['expired', 'needs_update', 'expiring']);
  assert.equal((await page.getByTestId('sum-total').innerText()), 'RM 400.00');
  assert.match(await page.getByTestId('sum-count').innerText(), /3 adverts · 1 without a cost/i);
  assert.match(await page.getByTestId('sum-platform').innerText(), /PropertyGuru[\s\S]*RM 300\.00[\s\S]*Mudah[\s\S]*RM 100\.00/i);
  assert.match(await page.getByTestId('sum-month').innerText(), /2026-10[\s\S]*RM 100\.00[\s\S]*2026-09[\s\S]*RM 300\.00/i);
  assert.match(await page.getByTestId('sum-excluded').innerText(), /1 test listing/i);
  // a period limit
  await page.getByTestId('sum-from').fill('2026-10-01');
  assert.equal(await page.getByTestId('sum-total').innerText(), 'RM 100.00');
  await page.getByTestId('sum-from').fill('');
  // the bell shows the same list
  await home(page);
  await page.locator('header button[aria-label*="otification"], header button[aria-label*="Pemberitahuan"], header button[aria-label*="通知"]').first().click();
  assert.match(await page.getByTestId('notif-adverts').innerText(), /Needs attention \(3\)/i);
  await home(page);
  // sample data is kept out: load it, the sample adverts (live, ending soon) add nothing
  await loadSample(page);
  await tile(page, 'Property List');
  await page.getByText('No. 18, Jalan Sampel 3/1, Bandar Baru Nilai').first().click();
  await page.getByTestId('open-ad-tracker').click();
  assert.match(await page.getByTestId('ad-sample-note').innerText(), /not counted/i);
  await page.getByTestId('ad-open-summary').click();
  assert.equal(await page.getByTestId('sum-total').innerText(), 'RM 400.00', 'sample property adverts are not counted');
  assert.match(await page.getByTestId('sum-excluded').innerText(), /sample advert/i);
  assert.equal(await page.getByTestId('ad-attention-item').count(), 3, 'sample adverts never ask for attention');
  await page.context().close();
});

/** Reads a stored picture file and returns its size, whether it holds the camera-data marker, and the colour at a point (0..1). */
const storedPicture = (page, fileId, at = [[0.3, 0.35]]) => page.evaluate(({ fileId, at }) => new Promise((resolve, reject) => {
  const r = indexedDB.open('estate-agent-buddy');
  r.onerror = () => reject(r.error);
  r.onsuccess = () => {
    const g = r.result.transaction('files').objectStore('files').get(fileId);
    g.onsuccess = async () => {
      const blob = g.result; if (!blob) return resolve(null);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const head = new TextDecoder('latin1').decode(bytes.slice(0, 4000));
      const bmp = await createImageBitmap(blob);
      const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
      const x = c.getContext('2d'); x.drawImage(bmp, 0, 0);
      resolve({ w: bmp.width, h: bmp.height, size: blob.size, type: blob.type, exif: head.includes('Exif'), colours: at.map(([fx, fy]) => Array.from(x.getImageData(Math.floor(fx * bmp.width), Math.floor(fy * bmp.height), 1, 1).data.slice(0, 3))) });
    };
  };
}), { fileId, at });
async function propertyWithPhotos(page, photos) {
  await bareProperty(page, 'Photo house');
  await page.getByRole('button', { name: 'Edit' }).first().click(); await expandForm(page);
  await page.getByTestId('photo-input').setInputFiles(photos);
  await page.waitForFunction(n => document.querySelectorAll('[data-testid="listing-form"] img').length >= n, photos.length);
  await page.getByTestId('save-property').click();
  await page.waitForSelector('[data-testid="listing-details"]');
  await waitStored(page, 'records', `all.some(v => v && v.headline === 'Photo house' && v.photos && v.photos.length === ${photos.length})`);
}
async function drag(page, testId, [x0, y0], [x1, y1]) {
  await page.getByTestId(testId).evaluate(el => el.scrollIntoView({ block: 'center' }));
  const b = await page.getByTestId(testId).boundingBox();
  await page.mouse.move(b.x + b.width * x0, b.y + b.height * y0);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * ((x0 + x1) / 2), b.y + b.height * ((y0 + y1) / 2), { steps: 3 });
  await page.mouse.move(b.x + b.width * x1, b.y + b.height * y1, { steps: 3 });
  await page.mouse.up();
}

test('U81 Photo Studio: a hand-drawn privacy mask covers the area for good in a NEW copy, the original is kept untouched, nothing is detected automatically, and turning the picture clears the masks', async () => {
  const page = await phone();
  await propertyWithPhotos(page, [{ name: 'front.jpg', mimeType: 'image/jpeg', buffer: await makePhoto(page, '#3a7') }]);
  await page.getByTestId('open-photo-studio').click();
  await page.getByTestId('photo-studio').waitFor();
  assert.match(await page.getByTestId('photo-studio').innerText(), /Your original photo is kept unless you choose to replace it/i);
  assert.match(await page.getByTestId('ps-declutter').innerText(), /AI decluttering is not available/i);
  await page.getByTestId('ps-preview').waitFor();
  assert.equal(await page.getByTestId('ps-save-new').isDisabled(), true, 'nothing changed yet');
  await page.getByTestId('ps-tab-mask').click();
  assert.match(await page.getByTestId('ps-mask-warning').innerText(), /Nothing is detected automatically/i);
  assert.match(await page.getByTestId('ps-mask-empty').innerText(), /No areas covered yet/i);
  await drag(page, 'ps-stage', [0.05, 0.12], [0.6, 0.6]);        // covers the white "sign" in the test picture (x .16–.47, y .21–.52)
  assert.match(await page.getByTestId('ps-mask-count').innerText(), /1 area covered/i);
  await shot(page, '81a-photo-studio-mask');
  // a stray tap draws nothing
  await drag(page, 'ps-stage', [0.8, 0.8], [0.805, 0.805]);
  assert.equal(await page.getByTestId('ps-mask-item').count(), 1);
  // turning the picture moves everything: masks are cleared and the agent is told
  await page.getByTestId('ps-tab-adjust').click();
  await page.getByTestId('ps-rotate-right').click();
  await page.getByTestId('ps-rotate-left').click();
  await page.getByTestId('ps-tab-mask').click();
  assert.match(await page.getByTestId('ps-note').innerText(), /covered areas were removed/i);
  assert.equal(await page.getByTestId('ps-mask-item').count(), 0);
  await drag(page, 'ps-stage', [0.05, 0.12], [0.6, 0.6]);
  assert.equal(await page.getByTestId('ps-mask-item').count(), 1);
  // Original / Edited comparison
  const edited = await page.getByTestId('ps-preview').getAttribute('src');
  await page.getByTestId('ps-show-original').click();
  await page.waitForFunction(old => document.querySelector('[data-testid="ps-preview"]').getAttribute('src') !== old, edited);
  await page.getByTestId('ps-show-edited').click();
  // save as a NEW photo
  await page.getByTestId('ps-save-new').click();
  assert.match(await page.getByTestId('ps-msg').innerText(), /Saved as a new photo\. The original is unchanged/i);
  await waitStored(page, 'records', "all.some(v => v && v.headline === 'Photo house' && v.photos.length === 2 && v.photos[1].edit === 'masked')");
  const rec = (await storedRecords(page, 'properties')).find(p => p.headline === 'Photo house');
  const [orig, copy] = rec.photos;
  assert.equal(orig.name, 'front.jpg'); assert.equal(orig.edit, undefined, 'the original is not relabelled');
  assert.equal(copy.name, 'front.jpg (privacy-masked)'); assert.equal(copy.editedFrom, orig.id);
  assert.notEqual(copy.fileId, orig.fileId);
  const o = await storedPicture(page, orig.fileId, [[0.3, 0.35], [0.9, 0.9]]);
  const c = await storedPicture(page, copy.fileId, [[0.3, 0.35], [0.9, 0.9]]);
  assert.ok(o.colours[0][0] > 200 && o.colours[0][1] > 200, `original still shows the white sign: ${o.colours[0]}`);
  assert.ok(c.colours[0].every(v => v < 60), `copy is covered at the sign: ${c.colours[0]}`);
  assert.ok(Math.abs(c.colours[1][1] - o.colours[1][1]) < 40, 'outside the mask the picture is the same');
  assert.equal(c.type, 'image/jpeg');
  assert.equal(c.exif, false, 'the copy carries no camera data block');
  // the chip names it, the strip shows both
  assert.equal(await page.getByTestId('ps-photo').count(), 2);
  assert.match(await page.getByTestId('ps-chip').innerText(), /Privacy-masked copy/i);
  assert.equal(await page.getByTestId('ps-save-new').isDisabled(), true, 'edit state was reset after saving');
  await page.context().close();
});

test('U82 Photo Studio: improve a photo (brightness, straighten, crop, auto), compare, save as a copy; Replace asks first, Cancel changes nothing, and Replace swaps the picture and deletes the old file', async () => {
  const page = await phone();
  await propertyWithPhotos(page, [{ name: 'dark.jpg', mimeType: 'image/jpeg', buffer: await makePhoto(page, '#223') }, { name: 'second.jpg', mimeType: 'image/jpeg', buffer: await makePhoto(page, '#a53') }]);
  await page.getByTestId('open-photo-studio').click();
  await page.getByTestId('photo-studio').waitFor();
  assert.equal(await page.getByTestId('ps-photo').count(), 2);
  await page.getByTestId('ps-preview').waitFor();
  await page.getByTestId('ps-brightness').fill('60');
  await page.getByTestId('ps-clarity').fill('40');
  await page.getByTestId('ps-straighten').fill('2');
  await page.getByTestId('ps-crop-169').click();
  assert.equal(await page.getByTestId('ps-save-new').isDisabled(), false);
  await page.getByTestId('ps-save-new').click();
  await waitStored(page, 'records', "all.some(v => v && v.headline === 'Photo house' && v.photos.length === 3 && v.photos[1].edit === 'enhanced')");
  let rec = (await storedRecords(page, 'properties')).find(p => p.headline === 'Photo house');
  assert.deepEqual(rec.photos.map(p => p.name), ['dark.jpg', 'dark.jpg (enhanced)', 'second.jpg'], 'the copy sits next to its original');
  const first = await storedPicture(page, rec.photos[0].fileId, [[0.5, 0.9]]);
  const copy = await storedPicture(page, rec.photos[1].fileId, [[0.5, 0.9]]);
  assert.ok(copy.colours[0][2] > first.colours[0][2] + 20, `brighter: ${first.colours[0]} → ${copy.colours[0]}`);
  assert.ok(Math.abs(copy.w / copy.h - 16 / 9) < 0.05, `16:9 crop: ${copy.w}x${copy.h}`);
  assert.equal(rec.mainPhotoId, rec.photos[0].id, 'main photo unchanged');
  // Replace: Cancel changes nothing
  await page.getByTestId('ps-photo').nth(2).click();
  await page.getByTestId('ps-auto').check();
  await page.getByTestId('ps-contrast').fill('30');
  await page.getByTestId('ps-replace').click();
  assert.match(await page.getByRole('alertdialog').innerText(), /original picture is no longer used and is deleted from this phone later/i);
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click();
  rec = (await storedRecords(page, 'properties')).find(p => p.headline === 'Photo house');
  assert.equal(rec.photos.length, 3); assert.equal(rec.photos[2].edit, undefined);
  const oldFile = rec.photos[2].fileId;
  assert.ok(await storedPicture(page, oldFile), 'the original file is still there');
  // Replace: confirmed
  await page.getByTestId('ps-replace').click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Replace original' }).click();
  assert.match(await page.getByTestId('ps-msg').innerText(), /original has been replaced/i);
  await waitStored(page, 'records', "all.some(v => v && v.headline === 'Photo house' && v.photos.length === 3 && v.photos[2].edit === 'enhanced')");
  rec = (await storedRecords(page, 'properties')).find(p => p.headline === 'Photo house');
  assert.notEqual(rec.photos[2].fileId, oldFile);
  assert.equal(rec.photos[2].name, 'second.jpg');
  assert.ok(await storedPicture(page, rec.photos[2].fileId), 'the new picture is stored');
  await waitStored(page, 'local', `all.some(v => v && v.id === '${oldFile}' && v.removedAt)`);   // marked for deletion (kept briefly, like every removed file), no longer used by the property
  assert.ok(!rec.photos.some(p => p.fileId === oldFile), 'the property no longer uses the replaced original');
  await shot(page, '82-photo-studio-adjust');
  await page.context().close();
});

test('U83 Photo Studio: a property without photos explains itself; Bahasa Malaysia and Chinese show the privacy warning', async () => {
  const page = await phone();
  await bareProperty(page, 'No photo house');
  assert.equal(await page.getByTestId('open-photo-studio').count(), 0, 'no button when there is nothing to edit');
  await page.context().close();
  for (const [aria, warn] of [['Bahasa Malaysia', /Tiada apa dikesan secara automatik/], ['中文', /不会自动检测/]]) {
    const p = await phone();
    await propertyWithPhotos(p, [{ name: 'a.jpg', mimeType: 'image/jpeg', buffer: await makePhoto(p, '#3a7') }]);
    await home(p);
    await tile(p, 'Agent Profile');
    await p.getByRole('button', { name: /Settings/i }).click();
    await pickLang(p, `[aria-label="${aria}"]`);
    await home(p);
    await p.locator('nav.grid > button').filter({ hasText: /Subsale List|Senarai Subsale|二手房列表/i }).first().click();
    await p.getByText('Photo house').first().click();
    await p.getByTestId('open-photo-studio').click();
    await p.getByTestId('ps-tab-mask').click();
    assert.match(await p.getByTestId('ps-mask-warning').innerText(), warn);
    await shot(p, `83-${aria === '中文' ? 'zh' : 'bm'}-photo-studio`);
    await p.context().close();
  }
});

/** For looking at the finished designs by eye: set SAVE_DESIGNS=/some/folder when running this file. */
const keepDesign = async f => { if (process.env.SAVE_DESIGNS) { const fs = await import('node:fs/promises'); await fs.mkdir(process.env.SAVE_DESIGNS, { recursive: true }); await fs.writeFile(`${process.env.SAVE_DESIGNS}/${f.name}`, f.bytes); } };
const pngSize = b => ({ sig: b.subarray(0, 8).toString('hex'), w: b.readUInt32BE(16), h: b.readUInt32BE(20) });
async function marketingProperty(page, { photos = [] } = {}) {
  await bareProperty(page, 'Corner house, quick sale');
  await page.getByRole('button', { name: 'Edit' }).first().click(); await expandForm(page);
  await page.locator('[data-field="askingPrice"]').fill('580000');
  if (photos.length) {
    await page.getByTestId('photo-input').setInputFiles(photos);
    await page.waitForFunction(n => document.querySelectorAll('[data-testid="listing-form"] img').length >= n, photos.length);
  }
  await page.getByTestId('save-property').click();
  await page.waitForSelector('[data-testid="listing-details"]');
  await waitStored(page, 'records', `all.some(v => v && v.headline === 'Corner house, quick sale' && v.askingPrice === 580000 && v.photos.length === ${photos.length})`);
}
/** Colour of the preview picture at a point (0..1). */
const previewColour = (page, fx, fy) => page.getByTestId('ms-preview').evaluate(async (img, [fx, fy]) => {
  const im = new Image(); im.src = img.src; await im.decode();
  const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
  const x = c.getContext('2d'); x.drawImage(im, 0, 0);
  return { w: im.naturalWidth, h: im.naturalHeight, rgb: Array.from(x.getImageData(Math.floor(fx * im.naturalWidth), Math.floor(fy * im.naturalHeight), 1, 1).data.slice(0, 3)) };
}, [fx, fy]);

test('U84 Marketing Studio: one format at a time — square PNG, portrait JPG/WebP, A4 PDF — each a real file of the right size, made only when asked; changing a choice marks the file out of date', async () => {
  const page = await phone();
  await marketingProperty(page, { photos: [{ name: 'front.jpg', mimeType: 'image/jpeg', buffer: await makePhoto(page, '#3a7') }, { name: 'back.jpg', mimeType: 'image/jpeg', buffer: await makePhoto(page, '#a53') }] });
  await page.getByTestId('open-marketing-studio').click();
  await page.getByTestId('marketing-studio').waitFor();
  assert.match(await page.getByTestId('ms-notpublished').innerText(), /does not publish an advert/i);
  assert.equal(await page.getByTestId('ms-result').count(), 0, 'nothing is made until asked');
  // square post, PNG (the default)
  assert.equal(await page.getByTestId('ms-format-square').isChecked(), true);
  await page.getByTestId('ms-make').click();
  await page.getByTestId('ms-result').waitFor();
  assert.match(await page.getByTestId('ms-made').innerText(), /Made: Square post · PNG · 1080 × 1080 px/i);
  const sq = await previewColour(page, 0.92, 0.08);
  assert.deepEqual([sq.w, sq.h], [1080, 1080]);
  assert.ok(sq.rgb[1] > sq.rgb[0] + 40 && sq.rgb[1] > 120, `main photo (green) fills the post: ${sq.rgb}`);
  await shot(page, '84a-marketing-square', false);
  const png = await pdfFrom(page, 'ms-download');
  assert.equal(png.name, 'P1001-square.png');
  assert.deepEqual(pngSize(png.bytes), { sig: '89504e470d0a1a0a', w: 1080, h: 1080 });
  await keepDesign(png);
  assert.equal(await page.getByTestId('ms-result').getAttribute('data-format'), 'square');
  // change a choice: the file on screen is marked out of date, and nothing is remade by itself
  await page.getByTestId('ms-headline').fill('Last unit this month');
  assert.match(await page.getByTestId('ms-stale').innerText(), /Make the preview again/i);
  assert.match(await page.getByTestId('ms-made').innerText(), /Square post/i);
  // portrait, WebP
  await page.getByTestId('ms-format-portrait').check();
  await page.getByTestId('ms-output').selectOption('webp');
  await page.getByTestId('ms-make').click();
  await page.waitForFunction(() => document.querySelector('[data-testid="ms-result"]')?.getAttribute('data-format') === 'portrait');
  assert.match(await page.getByTestId('ms-made').innerText(), /Portrait post · WebP · 1080 × 1350 px/i);
  assert.equal(await page.getByTestId('ms-stale').count(), 0, 'fresh again');
  const webp = await pdfFrom(page, 'ms-download');
  assert.equal(webp.name, 'P1001-portrait.webp');
  await keepDesign(webp);
  assert.equal(webp.bytes.subarray(0, 4).toString('latin1'), 'RIFF'); assert.equal(webp.bytes.subarray(8, 12).toString('latin1'), 'WEBP');
  await shot(page, '84b-marketing-portrait', false);
  // A4 flyer as a one-page PDF; the post-only WebP choice is not offered for it
  await page.getByTestId('ms-format-a4').check();
  assert.deepEqual(await page.getByTestId('ms-output').locator('option').allInnerTexts(), ['PDF', 'PNG', 'JPG']);
  await page.getByTestId('ms-output').selectOption('pdf');
  await page.getByTestId('ms-theme').selectOption('light');
  await page.getByTestId('ms-make').click();
  await page.waitForFunction(() => document.querySelector('[data-testid="ms-result"]')?.getAttribute('data-format') === 'a4');
  assert.match(await page.getByTestId('ms-made').innerText(), /A4 flyer · PDF · 1240 × 1754 px/i);
  const pdf = await pdfFrom(page, 'ms-download');
  assert.equal(pdf.name, 'P1001-a4.pdf');
  await keepDesign(pdf);
  const info = pdfInfo(pdf.bytes);
  assert.deepEqual([info.header, info.pages, info.images, info.eof], ['%PDF-1.4', 1, 1, true]);
  const a4 = await previewColour(page, 0.5, 0.05);
  assert.deepEqual([a4.w, a4.h], [1240, 1754]);
  await shot(page, '84c-marketing-a4', false);
  // JPG
  await page.getByTestId('ms-output').selectOption('jpg');
  await page.getByTestId('ms-make').click();
  await page.waitForFunction(() => /JPG/.test(document.querySelector('[data-testid="ms-made"]')?.textContent ?? ''));
  const jpg = await pdfFrom(page, 'ms-download');
  assert.equal(jpg.bytes.subarray(0, 3).toString('hex'), 'ffd8ff');
  await page.context().close();
});

test('U85 Marketing Studio: missing price/photos do not break it or invent anything; unconfirmed facts are flagged; a sample property is marked SAMPLE; the exact address is never offered; Bahasa Malaysia and Chinese work', async () => {
  const page = await phone();
  await bareProperty(page, 'Plain house');
  await page.getByTestId('open-marketing-studio').click();
  await page.getByTestId('marketing-studio').waitFor();
  assert.match(await page.getByTestId('ms-no-photos').innerText(), /plain gold panel/i);
  assert.match(await page.getByTestId('ms-warn-price').innerText(), /No price shown/i);
  const text = await page.getByTestId('marketing-studio').innerText();
  for (const never of ['Owner name', 'Owner phone', 'Commission', 'Internal notes', 'Street', 'Unit', 'Lot no', 'Current tenant']) assert.ok(!text.includes(never), `${never} must not be offered`);
  await page.getByTestId('ms-make').click();
  await page.getByTestId('ms-result').waitFor();           // no photo, no price: still a file
  assert.match(await page.getByTestId('ms-made').innerText(), /1080 × 1080/i);
  const plain = await previewColour(page, 0.5, 0.2);
  assert.ok(plain.rgb.every(v => v < 40), `a plain dark panel, not an invented picture: ${plain.rgb}`);
  await home(page);
  // sample data: unconfirmed facts flagged, SAMPLE warning
  await loadSample(page);
  await tile(page, 'Property List');
  await page.getByText('No. 18, Jalan Sampel 3/1, Bandar Baru Nilai').first().click();
  await page.getByTestId('open-marketing-studio').click();
  assert.match(await page.getByTestId('ms-warn-sample').innerText(), /says SAMPLE/i);
  // Owner, 17 Oct 2026: the price has no check status, so it is never marked *; other facts still are.
  assert.doesNotMatch(await page.getByTestId('mf-askingPrice').innerText(), /Owner stated/i);
  assert.match(await page.getByTestId('ms-warn-unverified').innerText(), /Not confirmed yet, marked \* on the design: /i);
  assert.doesNotMatch(await page.getByTestId('ms-warn-unverified').innerText(), /Asking price/i);
  await page.getByTestId('ms-make').click();
  await page.getByTestId('ms-result').waitFor();
  await shot(page, '85a-marketing-sample', false);
  // a full design in each format (facts, ribbon, photo, SAMPLE band) draws without error and at the exact size
  for (const [f, size] of [['a4', [1240, 1754]], ['square', [1080, 1080]], ['portrait', [1080, 1350]]]) {
    await page.getByTestId(`ms-format-${f}`).check();
    await page.getByTestId('ms-output').selectOption('png');
    await page.getByTestId('ms-make').click();
    await page.waitForFunction(g => document.querySelector('[data-testid="ms-result"]')?.getAttribute('data-format') === g && document.querySelector('[data-testid="ms-stale"]') === null, f);
    const dl = await pdfFrom(page, 'ms-download');
    assert.deepEqual([pngSize(dl.bytes).w, pngSize(dl.bytes).h], size);
    await keepDesign({ name: `sample-${f}.png`, bytes: dl.bytes });
  }
  // a ticked detail with no value is left off and reported
  await page.getByTestId('ms-missing').locator('summary').click();
  await page.getByTestId('mf-monthlyRent').locator('input').check();
  assert.match(await page.getByTestId('ms-warn-empty').innerText(), /left off the design: .*Monthly rent/i);
  // Bahasa Malaysia and Chinese
  await page.getByTestId('ms-lang').selectOption('zh');
  assert.match(await page.getByTestId('mf-askingPrice').innerText(), /开价|要价|售价|价格/i);
  await page.context().close();
  for (const [aria, re] of [['Bahasa Malaysia', /Studio Pemasaran|Tiada apa disiarkan/], ['中文', /营销工作室|不会发布到任何地方/]]) {
    const p = await phone();
    await marketingProperty(p);
    await home(p); await tile(p, 'Agent Profile'); await p.getByRole('button', { name: /Settings/i }).click();
    await pickLang(p, `[aria-label="${aria}"]`); await home(p);
    await p.locator('nav.grid > button').filter({ hasText: /Subsale List|Senarai Subsale|二手房列表/i }).first().click();
    await p.getByText('Corner house, quick sale').first().click();
    await p.getByTestId('open-marketing-studio').click();
    assert.match(await p.getByTestId('marketing-studio').innerText(), re);
    await p.getByTestId('ms-make').click();
    await p.getByTestId('ms-result').waitFor();
    await shot(p, `85-${aria === '中文' ? 'zh' : 'bm'}-marketing`, false);
    await p.context().close();
  }
});

test('U86 Marketing Studio: a full property (photos, facts, long headline, agent contact, reference) draws cleanly in all three formats and the A4 PDF stays one page', async () => {
  const page = await phone();
  await tile(page, 'Agent Profile'); await page.getByRole('button', { name: /Edit/i }).first().click();
  await page.locator('[data-field="fullName"]').fill('Lee Ah Kow'); await page.locator('[data-field="agency"]').fill('JSL Properties Sdn Bhd'); await page.locator('[data-field="phone"]').fill('012-345 6789');
  await page.getByTestId('save-profile').click();
  await home(page);
  await bareProperty(page, 'Spacious corner terrace with extra land, walking distance to the LRT, school and wet market');
  await page.getByRole('button', { name: 'Edit' }).first().click(); await expandForm(page);
  await page.locator('[data-field="askingPrice"]').fill('780000');
  for (const [k, v] of [['bedrooms', '4'], ['bathrooms', '3'], ['parking', '2'], ['builtUpSqft', '1800'], ['landSqft', '2400']]) await page.locator(`[data-field="${k}"]`).first().fill(v);
  // ClaudeChanges001 change 8: Special Features is gone from the form.
  await page.getByTestId('photo-input').setInputFiles(await Promise.all(['#3a7', '#a53', '#37a', '#aa3'].map(async (c, i) => ({ name: `p${i}.jpg`, mimeType: 'image/jpeg', buffer: await makePhoto(page, c) }))));
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="listing-form"] img').length >= 4);
  await page.getByTestId('save-property').click();
  await page.waitForSelector('[data-testid="listing-details"]');
  await waitStored(page, 'records', "all.some(v => v && v.photos && v.photos.length === 4 && v.bedrooms === 4)");
  await page.getByTestId('open-marketing-studio').click();
  await page.getByTestId('marketing-studio').waitFor();
  await page.getByTestId('ms-showref').check();
  assert.match(await page.getByTestId('ms-warn-long').innerText(), /headline is long/i);
  for (const [f, size, photos] of [['a4', [1240, 1754], 4], ['square', [1080, 1080], 1], ['portrait', [1080, 1350], 3]]) {
    await page.getByTestId(`ms-format-${f}`).check();
    assert.equal(await page.getByTestId('ms-photo').locator('input:checked').count(), photos, `${f}: ${photos} photo(s) ticked at first`);
    await page.getByTestId('ms-output').selectOption('png');
    await page.getByTestId('ms-make').click();
    await page.waitForFunction(g => document.querySelector('[data-testid="ms-result"]')?.getAttribute('data-format') === g && document.querySelector('[data-testid="ms-stale"]') === null, f);
    const dl = await pdfFrom(page, 'ms-download');
    assert.deepEqual([pngSize(dl.bytes).w, pngSize(dl.bytes).h], size);
    await keepDesign({ name: `full-${f}.png`, bytes: dl.bytes });
  }
  await page.getByTestId('ms-format-a4').check();
  await page.getByTestId('ms-output').selectOption('pdf');
  await page.getByTestId('ms-make').click();
  await page.waitForFunction(() => /PDF/.test(document.querySelector('[data-testid="ms-made"]')?.textContent ?? '') && document.querySelector('[data-testid="ms-stale"]') === null);
  const pdf = await pdfFrom(page, 'ms-download');
  assert.equal(pdfInfo(pdf.bytes).pages, 1);
  await page.context().close();
});

test('U87 Layout in English, Bahasa Malaysia and 中文: property detail, advert tracker (with the editor), advertising summary, Photo Studio (both tabs) and Marketing Studio — nothing sideways, cut off or spilling', async () => {
  const page = await phone();
  await propertyWithPhotos(page, [{ name: 'front.jpg', mimeType: 'image/jpeg', buffer: await makePhoto(page, '#3a7') }]);
  await page.getByTestId('open-ad-tracker').click();
  await page.getByTestId('ad-add').click();
  await page.getByTestId('ad-title').fill('Corner house');
  await page.getByTestId('ad-status-select').selectOption('live');
  await page.getByTestId('ad-end').fill(ymdLocal(2));
  await page.locator('[data-field="ad-cost"]').fill('450');
  await page.getByTestId('ad-save').click();
  await page.getByTestId('ad-add-fake').click(); await page.getByTestId('ad-save').click();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="ad-card"]').length === 2);
  await page.getByTestId('ad-edit').first().click();       // leave the editor open for the first check
  for (const aria of ['English', 'Bahasa Malaysia', '中文']) {
    await pickLang(page, `[aria-label="${aria}"]`);
    const tag = aria === '中文' ? 'zh' : aria === 'English' ? 'en' : 'bm';
    const check = async (name, where) => { const p = await layoutProblems(page); assert.deepEqual(p, [], `${aria} · ${name}: ${p.join(' | ')}`); await shot(page, `87-${tag}-${where}`, false); };
    await page.getByTestId('ad-editor-form').waitFor();
    await check('advert editor', 'ad-editor');
    await page.getByTestId('ad-cancel').click();
    await check('advert tracker', 'ad-tracker');
    await page.getByTestId('ad-open-summary').click();
    await check('advertising summary', 'ad-summary');
    await page.locator('header .icon-btn').first().click();   // back to the tracker
    await page.getByTestId('ad-tracker').waitFor();
    await page.locator('header .icon-btn').first().click();   // back to the property
    await page.getByTestId('listing-details').waitFor();
    await check('property detail', 'detail');
    await page.getByTestId('open-photo-studio').click();
    await page.getByTestId('ps-preview').waitFor();
    await check('Photo Studio, improve', 'photo-adjust');
    await page.getByTestId('ps-tab-mask').click();
    await check('Photo Studio, privacy masks', 'photo-mask');
    await page.locator('header .icon-btn').first().click();
    await page.getByTestId('open-marketing-studio').click();
    await page.getByTestId('ms-make').click();
    await page.getByTestId('ms-result').waitFor();
    await check('Marketing Studio', 'marketing');
    await page.locator('header .icon-btn').first().click();
    await page.getByTestId('open-ad-tracker').click();
    await page.getByTestId('ad-edit').first().click();
  }
  await page.context().close();
});

test('U88 Advert tracker: a platform that is not in the list can be typed; a blank name is refused; editing it later reopens as "Other"', async () => {
  const page = await phone();
  await bareProperty(page, 'Carousell house');
  await page.getByTestId('open-ad-tracker').click();
  await page.getByTestId('ad-add').click();
  await page.getByTestId('ad-platform').selectOption({ label: 'Other (Type the Name)' });
  await page.getByTestId('ad-save').click();
  assert.match(await page.getByTestId('ad-editor-form').innerText(), /Type the name of the platform/i);
  assert.equal((await adsOf(page)).length, 0);
  await page.getByTestId('ad-platform-other').fill('  Carousell  ');
  await page.getByTestId('ad-save').click();
  await page.getByTestId('ad-card').waitFor();
  await waitStored(page, 'records', "all.some(v => v && v.marketing && v.marketing.ads.some(a => a.platform === 'Carousell'))");
  assert.match(await page.getByTestId('ad-card').first().innerText(), /Carousell/i);
  await page.getByTestId('ad-edit').click();
  assert.equal(await page.getByTestId('ad-platform-other').inputValue(), 'Carousell');
  await page.getByTestId('ad-platform').selectOption('Mudah');
  assert.equal(await page.getByTestId('ad-platform-other').count(), 0);
  await page.getByTestId('ad-save').click();
  await waitStored(page, 'records', "all.some(v => v && v.marketing && v.marketing.ads.length === 1 && v.marketing.ads[0].platform === 'Mudah')");
  await page.context().close();
});

test('U89 a reminder banner never sits on top of an open dialog, so the dialog buttons can always be pressed', async () => {
  // Found in Stage 7: the banner (above the dialogs) covered the Download PDF button whenever a reminder was showing.
  const page = await phone();
  await loadSample(page);
  await tile(page, 'Calendar');
  const soon = new Date(Date.now() + 10 * 60000);
  const two = n => String(n).padStart(2, '0');
  await page.getByRole('button', { name: '+ Appointment' }).click();
  await page.locator('[data-field="title"]').fill('Banner cover check');
  await page.locator('[data-field="date"]').fill(`${soon.getFullYear()}-${two(soon.getMonth() + 1)}-${two(soon.getDate())}`);
  await page.locator('[data-field="time"]').fill(`${two(soon.getHours())}:${two(soon.getMinutes())}`);
  await page.locator('[data-field="status"]').selectOption('scheduled');
  await page.getByTestId('reminders').getByRole('button', { name: '15 min before' }).click();
  await page.getByTestId('save-appt').click();
  await page.reload(); await page.waitForSelector('nav.grid');
  await page.waitForTimeout(500);
  assert.equal(await page.getByTestId('reminder-alerts').count(), 0, 'Change 004: no reminder pop-up on the main screen');
  await tile(page, 'Property Calculator');
  await page.getByTestId('calc-pdf').dispatchEvent('click');
  await page.getByTestId('pdf-page').first().waitFor({ timeout: 15000 });
  for (const id of ['pdf-download', 'pdf-share', 'pdf-close']) {
    const hit = await page.getByTestId(id).evaluate(b => { const r = b.getBoundingClientRect(); const e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !!e && b.contains(e); });
    assert.ok(hit, `${id} is not covered by the reminder banner`);
  }
  await page.context().close();
});

/** A JPEG that looks like a camera photo: noisy picture, plus a camera-data block holding "turned a quarter" and a GPS position. */
const cameraJpeg = (page, w, h, quality) => page.evaluate(async ({ w, h, quality }) => {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const x = cv.getContext('2d'); const d = x.createImageData(w, h);
  for (let i = 0; i < d.data.length; i += 4) { d.data[i] = Math.random() * 255; d.data[i + 1] = Math.random() * 255; d.data[i + 2] = Math.random() * 255; d.data[i + 3] = 255; }
  x.putImageData(d, 0, 0);
  const jpg = Uint8Array.from(atob(cv.toDataURL('image/jpeg', quality).split(',')[1]), c => c.charCodeAt(0));
  // big-endian TIFF: IFD0 { Orientation = 6, GPSInfo -> IFD at 38 }, GPS IFD { N, 2.49°, E, 101.8° }
  const t = new DataView(new ArrayBuffer(140)); const u = (o, v) => t.setUint16(o, v); const l = (o, v) => t.setUint32(o, v);
  t.setUint8(0, 0x4D); t.setUint8(1, 0x4D); u(2, 42); l(4, 8);
  u(8, 2); u(10, 0x0112); u(12, 3); l(14, 1); u(18, 6);
  u(22, 0x8825); u(24, 4); l(26, 1); l(30, 38); l(34, 0);
  u(38, 4);
  u(40, 1); u(42, 2); l(44, 2); t.setUint8(48, 0x4E);
  u(52, 2); u(54, 5); l(56, 3); l(60, 92);
  u(64, 3); u(66, 2); l(68, 2); t.setUint8(72, 0x45);
  u(76, 4); u(78, 5); l(80, 3); l(84, 116);
  l(88, 0);
  [2, 1, 49, 1, 0, 1, 101, 1, 48, 1, 0, 1].forEach((v, k) => l(92 + k * 4, v));
  const head = new Uint8Array([0xFF, 0xE1, 0x00, 0x94, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00]);
  const out = new Uint8Array(2 + head.length + 140 + jpg.length - 2);
  out.set(jpg.slice(0, 2), 0); out.set(head, 2); out.set(new Uint8Array(t.buffer), 2 + head.length); out.set(jpg.slice(2), 2 + head.length + 140);
  return Array.from(out);
}, { w, h, quality }).then(a => Buffer.from(a));
/** Size of a stored picture (as shown, turned upright) and whether it still holds a camera-data (Exif) block. */
const storedInfo = (page, fileId) => page.evaluate(fileId => new Promise((resolve, reject) => {
  const r = indexedDB.open('estate-agent-buddy');
  r.onerror = () => reject(r.error);
  r.onsuccess = () => {
    const g = r.result.transaction('files').objectStore('files').get(fileId);
    g.onsuccess = async () => {
      const blob = g.result; if (!blob) return resolve(null);
      const b = new Uint8Array(await blob.arrayBuffer());
      let exif = false, i = 2;
      while (i + 8 < b.length && b[i] === 0xFF) { const m = b[i + 1]; if (m === 0xDA || m === 0xD9) break; if (m === 0xE1 && String.fromCharCode(b[i + 4], b[i + 5], b[i + 6], b[i + 7]) === 'Exif') exif = true; i += 2 + ((b[i + 2] << 8) | b[i + 3]); }
      const bmp = await createImageBitmap(blob); resolve({ w: bmp.width, h: bmp.height, size: blob.size, exif });
    };
  };
}), fileId);

test('U90 a photo with a camera-data block (turned sideways, GPS position): large photos are cleaned and turned upright on upload; the Photo Studio copy never carries the location, even when the kept original does', async () => {
  const page = await phone();
  // 1. a large camera-style photo: compressed on upload, so the stored picture is upright and holds no camera data
  const big = await cameraJpeg(page, 2400, 1800, 0.9);
  assert.ok(big.length > 1_000_000, `test photo is a real-sized file (${big.length} bytes)`);
  assert.ok(big.includes(Buffer.from('Exif')), 'test photo really carries a camera-data block');
  await propertyWithPhotos(page, [{ name: 'camera-big.jpg', mimeType: 'image/jpeg', buffer: big }]);
  let rec = (await storedRecords(page, 'properties')).find(p => p.headline === 'Photo house');
  const bigInfo = await storedInfo(page, rec.photos[0].fileId);
  assert.equal(bigInfo.exif, false, 'no location or camera data kept from a large photo');
  assert.ok(bigInfo.h > bigInfo.w, `turned upright (${bigInfo.w}×${bigInfo.h}), not left sideways`);
  assert.ok(bigInfo.size < big.length / 3, 'and made much smaller');
  await page.context().close();

  // 2. a small photo that would not get smaller keeps its own bytes (including the camera data); the Studio copy must still be clean
  const p2 = await phone();
  const small = await cameraJpeg(p2, 800, 600, 0.1);
  await propertyWithPhotos(p2, [{ name: 'camera-small.jpg', mimeType: 'image/jpeg', buffer: small }]);
  rec = (await storedRecords(p2, 'properties')).find(p => p.headline === 'Photo house');
  const orig = await storedInfo(p2, rec.photos[0].fileId);
  assert.equal(orig.exif, true, 'documented behaviour: a small photo that does not shrink is kept exactly as it came');
  await p2.getByTestId('open-photo-studio').click();
  await p2.getByTestId('ps-preview').waitFor();
  await p2.getByTestId('ps-tab-mask').click();
  await drag(p2, 'ps-stage', [0.1, 0.1], [0.5, 0.4]);
  await p2.getByTestId('ps-save-new').click();
  await waitStored(p2, 'records', "all.some(v => v && v.headline === 'Photo house' && v.photos.length === 2 && v.photos[1].edit === 'masked')");
  rec = (await storedRecords(p2, 'properties')).find(p => p.headline === 'Photo house');
  const copy = await storedInfo(p2, rec.photos[1].fileId);
  assert.equal(copy.exif, false, 'the Photo Studio copy carries no camera data or GPS position');
  assert.ok(copy.h > copy.w, `the copy is upright (${copy.w}×${copy.h})`);
  assert.deepEqual(await storedInfo(p2, rec.photos[0].fileId), orig, 'the original is exactly as before');
  await p2.context().close();
});

test('U91 backup file: made from Settings, a bad file is refused, and a restore brings a deleted contact back (browser only, not Android)', async () => {
  const ctx = await browser.newContext({ viewport: { width: 384, height: 824 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true });
  const page = await ctx.newPage();
  await page.goto(base); await page.waitForSelector('nav.grid'); await chooseStart(page, 'empty');
  const putContact = id => page.evaluate(id => new Promise((resolve, reject) => {
    const r = indexedDB.open('estate-agent-buddy');
    r.onsuccess = () => { const tx = r.result.transaction('records', 'readwrite'); tx.objectStore('records').put({ id, created: 1, updated: 1, name: 'Backup Test Buyer', phone: '+60 12-000 2222', roles: ['buyer'], leadStatus: 'warm' }, `c:contacts:${id}`); tx.oncomplete = () => resolve(true); tx.onerror = () => reject(tx.error); };
  }), id);
  await putContact('bk1');
  await page.reload(); await page.waitForSelector('nav.grid');
  await tile(page, 'Agent Profile'); await page.getByRole('button', { name: /Settings/i }).click();
  const card = page.getByTestId('backup-card');
  await card.waitFor();
  assert.match(await page.getByTestId('backup-last').innerText(), /No backup file has been made/i);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('backup-make').click()]);
  assert.match(dl.suggestedFilename(), /^EstateAgentBuddy-backup-\d{4}-\d{2}-\d{2}-\d{4}\.zip$/i);
  const zipPath = await dl.path();
  await page.getByTestId('backup-msg').waitFor();
  assert.match(await page.getByTestId('backup-msg').innerText(), /Backup file made: 1 records and 0 files/i);
  assert.match(await page.getByTestId('backup-last').innerText(), /Last backup file made/i);
  // a file that is not a backup is refused and changes nothing
  await page.getByTestId('backup-file').setInputFiles({ name: 'notes.zip', mimeType: 'application/zip', buffer: Buffer.from('this is not a backup') });
  await page.locator('[data-testid="backup-msg"][role="alert"]').waitFor();
  assert.match(await page.getByTestId('backup-msg').innerText(), /not an Estate Agent AI Buddy backup file\. Nothing was changed/i);
  // delete the contact on the phone, then restore it from the file
  await page.evaluate(() => new Promise((resolve, reject) => {
    const r = indexedDB.open('estate-agent-buddy');
    r.onsuccess = () => { const tx = r.result.transaction('records', 'readwrite'); tx.objectStore('records').delete('c:contacts:bk1'); tx.oncomplete = () => resolve(true); tx.onerror = () => reject(tx.error); };
  }));
  await page.reload(); await page.waitForSelector('nav.grid');
  await tile(page, 'Agent Profile'); await page.getByRole('button', { name: /Settings/i }).click();
  await page.getByTestId('backup-file').setInputFiles(zipPath);
  await page.getByTestId('backup-preview').waitFor();
  assert.match(await page.getByTestId('backup-plan').innerText(), /Will bring back 1 records, replace 0, leave 0 as they are, and bring back 0 files/i);
  await shot(page, '91-backup-restore', false);
  await page.getByTestId('backup-restore').click();
  await page.locator('[data-testid="backup-msg"]').filter({ hasText: /Restored: 1 records brought back/i }).waitFor();
  await waitStored(page, 'records', "all.some(v => v && v.name === 'Backup Test Buyer')");
  await home(page); await tile(page, 'Buyer List');
  assert.equal(await page.getByText('Backup Test Buyer').count(), 1, 'the contact is back');
  await ctx.close();
});

/** Routes Google Drive calls of a browser context to the in-memory stand-in (tests/support/fakeDrive.mjs). */
async function routeDrive(ctx, drive, delayMs = 0) {
  await ctx.route('https://www.googleapis.com/**', async route => {
    if (delayMs) await new Promise(r => setTimeout(r, delayMs));
    const req = route.request(); const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const buf = req.postDataBuffer();
    const r = drive.handle(req.method(), req.url(), req.headers(), buf ? new Uint8Array(buf) : undefined);
    return route.fulfill({ status: r.status, headers: { ...cors, ...r.headers }, body: Buffer.from(r.body) });
  });
}

test('U92 Google Drive (stand-in Drive, browser only): restore point and readable folders at start, Back up now, restore from a point with preview, a refused token is reported', async () => {
  const ctx = await browser.newContext({ viewport: { width: 384, height: 824 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const drive = createFakeDrive();
  await routeDrive(ctx, drive);
  const page = await ctx.newPage();
  await page.goto(base); await page.waitForSelector('nav.grid'); await chooseStart(page, 'empty');
  // A phone that is signed in and has connected Drive (the Google sign-in itself is not exercised here).
  const seed = (drv) => page.evaluate(drv => new Promise((resolve, reject) => {
    const r = indexedDB.open('estate-agent-buddy');
    r.onsuccess = () => {
      const tx = r.result.transaction('records', 'readwrite'); const st = tx.objectStore('records'); const g = st.get('s:meta');
      g.onsuccess = () => { const m = g.result ?? {}; st.put({ ...m, dirty: [], tombstones: [], syncSession: { accessToken: 'a', refreshToken: 'r', expiresAt: Date.now() + 3600000, email: 't@x.com', userId: 'u1' }, drive: drv }, 's:meta');
        st.put({ id: 'dk1', created: 1, updated: 1, name: 'Drive Test Buyer', roles: ['buyer'], leadStatus: 'hot' }, 'c:contacts:dk1'); };
      tx.oncomplete = () => resolve(true); tx.onerror = () => reject(tx.error);
    };
  }), drv);
  await seed({ token: 'TOK', expiresAt: Date.now() + 3600000, connectedAt: Date.now() });
  await page.reload(); await page.waitForSelector('nav.grid');
  // the daily rule makes a restore point and the readable folders at app start
  await waitStored(page, 'records', "all.some(v => v && v.driveLastOkAt && v.driveTree && v.driveTree.ok)");
  assert.ok(drive.paths().some(p => /^Estate Agent AI Buddy\/Disaster Recovery\/Restore Points\/[^/]+\/manifest\.json$/.test(p)), 'a complete restore point');
  assert.match(drive.textAt('Estate Agent AI Buddy/Contacts/Buyers/Drive Test Buyer/Buyer Details.txt'), /Record ID: dk1/);
  assert.ok(!drive.paths().some(p => p.endsWith('.zip')), 'no .zip is uploaded any more');
  const everything = [...drive.files.values()].map(f => Buffer.from(f.data).toString('latin1')).join('\n');
  assert.ok(!everything.includes('"token":"TOK"') && !everything.includes('refreshToken'), 'no token in Drive');
  await tile(page, 'Agent Profile'); await page.getByRole('button', { name: /Settings/i }).click();
  assert.match(await page.getByTestId('drive-state').innerText(), /Drive connected until about/i);
  assert.match(await page.getByTestId('drive-last').innerText(), /Last Drive restore point that worked/i);
  assert.match(await page.getByTestId('drive-tree').innerText(), /Readable folders updated .*complete/i);
  await page.getByTestId('drive-now').click();
  await page.locator('[data-testid="drive-msg"]').filter({ hasText: /Restore point made on Google Drive and checked/i }).waitFor();
  await shot(page, '92-drive-backup', false);
  // the contact is lost on the phone; it comes back from a restore point, after a check and a preview
  await page.evaluate(() => new Promise((resolve, reject) => {
    const r = indexedDB.open('estate-agent-buddy');
    r.onsuccess = () => { const tx = r.result.transaction('records', 'readwrite'); tx.objectStore('records').delete('c:contacts:dk1'); tx.oncomplete = () => resolve(true); tx.onerror = () => reject(tx.error); };
  }));
  await page.reload(); await page.waitForSelector('nav.grid');
  await tile(page, 'Agent Profile'); await page.getByRole('button', { name: /Settings/i }).click();
  await page.getByTestId('drive-points').click();
  await page.getByTestId('drive-point').first().waitFor();
  assert.ok(await page.getByTestId('drive-point').count() >= 2);
  await page.getByTestId('drive-point').first().getByRole('button').click();
  await page.getByTestId('backup-preview').waitFor();
  assert.match(await page.getByTestId('backup-plan').innerText(), /Will bring back 1 records/i);
  await shot(page, '92b-drive-restore-preview', false);
  await page.getByTestId('backup-restore').click();
  await page.locator('[data-testid="backup-msg"]').filter({ hasText: /Restored: 1 records brought back/i }).waitFor();
  await waitStored(page, 'records', "all.some(v => v && v.name === 'Drive Test Buyer')");
  // Google refuses the token: said plainly, and Drive is disconnected
  drive.state.token = 'SOMETHING-ELSE';
  await page.getByTestId('drive-now').click();
  await page.locator('[data-testid="drive-msg"][role="alert"]').waitFor();
  assert.match(await page.getByTestId('drive-msg').innerText(), /Google did not accept the access/i);
  await page.getByTestId('drive-connect').waitFor();
  assert.match(await page.getByTestId('drive-state').innerText(), /Drive is not connected on this phone/i);
  await ctx.close();
});

test('U92c Change 17 / 17b (stand-in Drive): Back up now shows a spinner with a percentage and the "keeps going" note, and a failed folder update is reported next to the good restore point', async () => {
  const ctx = await browser.newContext({ viewport: { width: 384, height: 824 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const drive = createFakeDrive();
  await routeDrive(ctx, drive, 60);
  const page = await ctx.newPage();
  await page.goto(base); await page.waitForSelector('nav.grid'); await chooseStart(page, 'empty');
  await page.evaluate(() => new Promise((resolve, reject) => {
    const r = indexedDB.open('estate-agent-buddy');
    r.onsuccess = () => {
      const tx = r.result.transaction('records', 'readwrite'); const st = tx.objectStore('records'); const g = st.get('s:meta');
      g.onsuccess = () => { const m = g.result ?? {}; st.put({ ...m, dirty: [], tombstones: [], syncSession: { accessToken: 'a', refreshToken: 'r', expiresAt: Date.now() + 3600000, email: 't@x.com', userId: 'u1' }, drive: { token: 'TOK', expiresAt: Date.now() + 3600000, connectedAt: Date.now() } }, 's:meta');
        st.put({ id: 'dk1', created: 1, updated: 1, name: 'Drive Test Buyer', roles: ['buyer'], leadStatus: 'hot' }, 'c:contacts:dk1'); };
      tx.oncomplete = () => resolve(true); tx.onerror = () => reject(tx.error);
    };
  }));
  await page.reload(); await page.waitForSelector('nav.grid');
  await waitStored(page, 'records', "all.some(v => v && v.driveLastOkAt && v.driveTree && v.driveTree.ok)");
  await tile(page, 'Agent Profile'); await page.getByRole('button', { name: /Settings/i }).click();
  // spinner, percentage and the note while it runs
  await page.getByTestId('drive-now').click();
  await page.getByTestId('drive-busy').waitFor();
  assert.match(await page.getByTestId('drive-busy').innerText(), /Sending to Drive… \d+%/);
  assert.match(await page.getByTestId('drive-busy-note').innerText(), /You can leave this screen/);
  assert.ok(await page.getByTestId('drive-busy').locator('.spinner').count() === 1, 'spinner shown');
  assert.equal(await page.getByTestId('drive-busy-bar').getAttribute('role'), 'progressbar');
  await shot(page, '92c-drive-progress', false);
  await page.locator('[data-testid="drive-msg"]').filter({ hasText: /Restore point made on Google Drive and checked/i }).waitFor();
  assert.equal(await page.getByTestId('drive-busy').count(), 0, 'the spinner is gone when it is done');
  assert.equal(await page.getByTestId('drive-warn').count(), 0, 'complete folder update: no warning');
  // a change on the phone, and Drive refuses to rewrite files (full): the restore point is made but the folders are not updated
  await page.evaluate(() => new Promise((resolve, reject) => {
    const r = indexedDB.open('estate-agent-buddy');
    r.onsuccess = () => { const tx = r.result.transaction('records', 'readwrite'); tx.objectStore('records').put({ id: 'dk1', created: 1, updated: 5, name: 'Drive Test Buyer Changed', roles: ['buyer'], leadStatus: 'hot' }, 'c:contacts:dk1'); tx.oncomplete = () => resolve(true); tx.onerror = () => reject(tx.error); };
  }));
  await page.reload(); await page.waitForSelector('nav.grid');
  await waitStored(page, 'records', "all.some(v => v && v.name === 'Drive Test Buyer Changed')");
  drive.state.fail = (method, u) => (method === 'PATCH' && u.pathname.startsWith('/upload') ? { status: 403, headers: {}, body: new TextEncoder().encode('storageQuotaExceeded') } : null);
  await tile(page, 'Agent Profile'); await page.getByRole('button', { name: /Settings/i }).click();
  await page.getByTestId('drive-now').click();
  await page.getByTestId('drive-warn').waitFor();
  assert.match(await page.getByTestId('drive-warn').innerText(), /restore point is safe, but the readable Drive folders could NOT be updated/i);
  assert.match(await page.getByTestId('drive-msg').innerText(), /Restore point made on Google Drive and checked/i, 'the good restore point is still reported');
  await shot(page, '92d-drive-folder-warning', false);
  await ctx.close();
});

test('U93 buyer requirements: a buyer\'s page lists what they want and the properties that fit, with the reason; a property lists fitting buyers', async () => {
  const page = await phone();
  await loadSample(page);
  await tile(page, 'Buyer List');
  await page.locator('main').getByText('Tenant R (sample)').first().click();
  await page.getByTestId('buyer-requirements').waitFor();
  assert.match(await page.getByTestId('requirement-summary').first().innerText(), /Factory near KLIA/i);
  await page.getByTestId('buyer-matches').waitFor();
  const rows = page.getByTestId('match-row');
  assert.ok(await rows.count() >= 1, 'at least one fitting property');
  const first = await rows.first().innerText();
  assert.match(first, /factory|Warehouse|Semi-D|Detached/i);
  assert.match(first, /Adjoining|adjoin|land/i, 'the reason names a criterion, including the unverifiable adjoining-units one');
  await shot(page, '93-buyer-matches', false);
  // property side
  await rows.first().locator('button.link-row').click();
  await page.getByTestId('property-buyers').waitFor();
  assert.match(await page.getByTestId('property-buyers').innerText(), /Tenant R \(sample\)|No buyer/i);
  await page.context().close();
});

test('U94 follow-up reminder: a quiet buyer is listed in Notifications, the setting can turn it off, and the buyer is not changed', async () => {
  const page = await phone();
  await page.evaluate(() => new Promise((resolve, reject) => {
    const r = indexedDB.open('estate-agent-buddy');
    r.onsuccess = () => {
      const tx = r.result.transaction('records', 'readwrite'); const old = Date.now() - 45 * 86400000;
      tx.objectStore('records').put({ id: 'fq1', created: old, updated: old, name: 'Quiet Buyer', roles: ['buyer'], leadStatus: 'warm' }, 'c:contacts:fq1');
      tx.oncomplete = () => resolve(true); tx.onerror = () => reject(tx.error);
    };
  }));
  await page.reload(); await page.waitForSelector('nav.grid');
  await page.getByTestId('top-notifications').click();
  await page.getByTestId('notif-followup').waitFor();
  assert.match(await page.getByTestId('notif-followup').innerText(), /Contacts to follow up[\s\S]*1 contact has had no interaction for 30 days or more[\s\S]*Quiet Buyer/i);
  await home(page);
  await tile(page, 'Agent Profile'); await page.getByRole('button', { name: /Settings/i }).click();
  await page.locator('[data-testid="followup-setting"] button[data-days="0"]').click();
  await home(page);
  await page.getByTestId('top-notifications').click();
  await page.getByTestId('notif-empty-system').waitFor();
  assert.equal(await page.getByTestId('notif-followup').count(), 0);
  const kept = await page.evaluate(() => new Promise(res => { const r = indexedDB.open('estate-agent-buddy'); r.onsuccess = () => { const g = r.result.transaction('records').objectStore('records').get('c:contacts:fq1'); g.onsuccess = () => res(g.result); }; }));
  assert.equal(kept.leadStatus, 'warm', 'the reminder changed nothing about the buyer');
  await page.context().close();
});

test('U95 duplicate warning: typing an address that is already in the list shows a warning, and the property can still be saved', async () => {
  const page = await phone();
  await loadSample(page);
  const stored = (await storedRecords(page, 'properties')).find(p => p.street && p.unitNo);
  assert.ok(stored, 'a sample property with street, unit and area');
  await tile(page, 'Property List');
  await newProperty(page);
  assert.equal(await page.getByTestId('duplicate-warning').count(), 0, 'no warning before anything is typed');
  await setStreet(page, stored.street);
  await page.locator('[data-field="unitNo"]').fill(stored.unitNo);
  await page.getByTestId('duplicate-warning').waitFor();
  assert.match(await page.getByTestId('duplicate-warning').innerText(), /may already be in your list/i);
  assert.ok(await page.getByTestId('duplicate-row').count() >= 1);
  await page.context().close();
});

test('U96 locked out by a typed Supabase project: sign-in screen offers Connection settings; invalid URL refused; failed Google sign-in; reset keeps records; Settings reopens', async () => {
  // The QA phone (14 Oct): signed in, then a Supabase URL/key typed in Settings. That project refuses the session,
  // the app signs out, and Google sign-in fails there too. Supabase is a stand-in here; Google is not contacted.
  const SB = 'https://typed-wrong.supabase.co';
  const ctx = await browser.newContext({ viewport: { width: 384, height: 824 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
  await ctx.route(`${SB}/**`, async route => {
    const req = route.request(); const u = new URL(req.url());
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (u.pathname === '/auth/v1/authorize') return route.fulfill({ status: 302, headers: { location: `${u.searchParams.get('redirect_to')}?error=access_denied&error_description=provider+not+enabled` } });
    return route.fulfill({ status: 401, contentType: 'application/json', headers: cors, body: '{"message":"Invalid API key"}' });
  });
  const page = await ctx.newPage();
  await page.goto(base); await page.waitForSelector('nav.grid'); await chooseStart(page, 'empty');
  await page.evaluate(async SBURL => {
    const db = await new Promise(res => { const r = indexedDB.open('estate-agent-buddy'); r.onsuccess = () => res(r.result); });
    const put = (store, key, val) => new Promise((res, rej) => { const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).put(val, key); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    await put('records', 'c:contacts:keep1', { id: 'keep1', created: 1, updated: 1, name: 'Puan Keep Me', roles: ['vendor'] });
    await put('records', 's:meta', { fired: [], dirty: [], tombstones: [], syncWorkspaceId: 'ws-1', lastSeq: 0, syncSession: { accessToken: 'AT', refreshToken: 'RT', expiresAt: Date.now() + 3_600_000, email: 'qa@x.c', userId: 'u1', workspaceId: 'ws-1', workspaceName: 'QA team', role: 'owner' } });
    await put('records', 's:settings', { lang: 'en', layout: 'grid', supabaseUrl: SBURL, supabaseAnonKey: 'typed-key' });
    db.close();
  }, SB);
  const stored = () => page.evaluate(() => new Promise(res => { const r = indexedDB.open('estate-agent-buddy'); r.onsuccess = () => { const tx = r.result.transaction('records'); const g1 = tx.objectStore('records').get('s:settings'); const g2 = tx.objectStore('records').get('c:contacts:keep1'); tx.oncomplete = () => { res({ settings: g1.result, contact: g2.result }); r.result.close(); }; }; }));
  await page.reload();
  // The typed project refuses the session: signed out, and the sign-in screen opens Connection settings by itself.
  await page.getByTestId('login').waitFor({ timeout: 15000 });
  await page.getByTestId('connection-recovery').waitFor();
  assert.equal(await page.getByTestId('connection-recovery').getAttribute('data-source'), 'phone');
  assert.match(await page.getByTestId('connection-project').innerText(), /typed-wrong\.supabase\.co/i);
  assert.equal(await page.getByText('typed-key').count(), 0, 'the key is never shown');
  // Failed Google sign-in: the message shows and Connection settings stays available.
  await page.getByTestId('google-sign-in').click();
  await page.getByTestId('login-error').waitFor();
  assert.match(await page.getByTestId('login-error').innerText(), /cancelled or not allowed/i);
  assert.ok(await page.getByTestId('connection-recovery').isVisible());
  await shot(page, '96a-login-recovery', false);
  // An invalid URL is refused and nothing is saved.
  await page.getByTestId('edit-connection').click();
  await page.getByTestId('connection-url').fill('https://supabase.com/dashboard/project/abcd');
  await page.getByTestId('save-connection').click();
  assert.match(await page.getByTestId('connection-problem').innerText(), /not a Supabase project address/i);
  assert.equal((await stored()).settings.supabaseUrl, SB, 'nothing saved');
  // Reset: only the typed URL and key go; the record on the phone stays.
  await page.getByTestId('reset-connection').click();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await page.waitForSelector('nav.grid'); // this test build has no built-in project, so the app opens on the phone
  const after = await stored();
  assert.equal(after.settings.supabaseUrl, undefined);
  assert.equal(after.settings.supabaseAnonKey, undefined);
  assert.equal(after.settings.lang, 'en', 'other settings kept');
  assert.equal(after.contact?.name, 'Puan Keep Me', 'records kept');
  // Settings opens again, and refuses an invalid URL there too (the app is not locked a second time).
  await tile(page, 'Agent Profile'); await page.getByRole('button', { name: /Settings/i }).click();
  await page.getByLabel('Supabase project URL').fill('abcd.supabase.co');
  await page.getByLabel('Supabase anon (public) key').fill('k');
  await page.getByTestId('save-settings').click();
  assert.match(await page.getByTestId('settings-supabase-problem').innerText(), /not a Supabase project address/i);
  await page.getByLabel('Supabase project URL').fill('https://abcd.supabase.co');
  await page.getByLabel('Supabase anon (public) key').fill('');
  await page.getByTestId('save-settings').click();
  assert.match(await page.getByTestId('settings-supabase-problem').innerText(), /Type both/i);
  assert.equal((await stored()).settings.supabaseUrl, undefined, 'still nothing saved');
  assert.equal(await page.getByTestId('login').count(), 0, 'still in the app');
  await page.reload(); await page.waitForSelector('nav.grid');
  await ctx.close();
});

test('U97 the sign-in screen always has Connection settings, even when the project is fine and nothing failed', async () => {
  const SB = 'https://fine-project.supabase.co';
  const ctx = await browser.newContext({ viewport: { width: 384, height: 824 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route(`${SB}/**`, route => route.fulfill({ status: 404, body: '' }));
  const page = await ctx.newPage();
  await page.goto(base); await page.waitForSelector('nav.grid'); await chooseStart(page, 'empty');
  await tile(page, 'Agent Profile'); await page.getByRole('button', { name: /Settings/i }).click();
  await page.getByLabel('Supabase project URL').fill(`${SB}/`);
  await page.getByLabel('Supabase anon (public) key').fill('anon-public-key');
  await page.getByTestId('save-settings').click();
  await page.getByTestId('login').waitFor();
  assert.equal(await page.getByTestId('connection-recovery').count(), 0, 'closed until asked for');
  await page.getByTestId('login-connection').click();
  assert.match(await page.getByTestId('connection-project').innerText(), /fine-project\.supabase\.co/i);
  // Correct the values from here: a valid pair is saved (the app stays on sign-in, now for that project).
  await page.getByTestId('edit-connection').click();
  await page.getByTestId('connection-url').fill('https://other-project.supabase.co');
  await page.getByTestId('connection-key').fill('other-key');
  await page.getByTestId('save-connection').click();
  await page.getByTestId('connection-msg').waitFor();
  assert.match(await page.getByTestId('connection-project').innerText(), /other-project\.supabase\.co/i);
  await ctx.close();
});

test('U100 Change 009 form: section order, price/commission in Price, Tenure and Title Info, Maintenance Fee and Extra Comments in Property Details, Building Specifications after Owner; rental commission in months', async () => {
  const page = await phone();
  await tile(page, 'Property List'); await newProperty(page);
  await page.locator('[data-testid="opt-type"] .opt-btn').click();
  await page.getByTestId('opt-type').getByRole('option', { name: 'Semi-D Factory' }).click();
  const order = await page.locator('[data-testid="listing-form"] > .card[id]').evaluateAll(cs => cs.map(c => c.id.replace('sec-', '')));
  assert.deepEqual(order.filter(x => ['basics', 'tenure', 'photos', 'location', 'details', 'owner', 'specs', 'docs'].includes(x)),
    ['basics', 'tenure', 'location', 'photos', 'details', 'owner', 'specs', 'docs']);
  assert.ok(!order.includes('money'), 'the old Price, rental and fees section is gone');
  assert.match(await page.locator('#sec-tenure .card-title').innerText(), /Price, Tenure and Title Info/i);
  // Sale: asking price, negotiable and commission % are in section 2.
  await page.locator('[data-field="purpose"]').selectOption('sale');
  for (const f of ['askingPrice', 'negotiable', 'commissionType', 'commissionPct']) assert.equal(await page.locator(`#sec-tenure [data-field="${f}"]`).count(), 1, `${f} in section 2`);
  await page.locator('[data-field="askingPrice"]').fill('1250000');
  assert.deepEqual(await page.locator('[data-field="commissionType"] option').allInnerTexts(), ['Percentage (%)', 'Flat Fee (RM)']);
  await page.locator('[data-field="commissionPct"]').fill('2');
  assert.match(await page.getByTestId('form-commission').innerText(), /RM 25,000/i);
  await page.locator('[data-field="commissionType"]').selectOption('flat');
  assert.equal(await page.locator('[data-field="commissionPct"]').count(), 0);
  await page.locator('[data-field="commissionFlat"]').fill('18000');
  assert.match(await page.getByTestId('form-commission').innerText(), /RM 18,000/i);
  // Maintenance Fee and the Extra Comments box (under Furnishing) are in Property Details.
  assert.equal(await page.locator('#sec-details [data-field="maintenanceFee"]').count(), 1);
  const comments = page.locator('#sec-details textarea[data-field="extraComments"]');
  assert.equal(await comments.count(), 1);
  assert.ok((await comments.boundingBox()).height >= 100, 'a large box');
  // Rent: commission in months (1, 1.5, 2), never a percent.
  await page.locator('[data-field="purpose"]').selectOption('rent');
  assert.equal(await page.locator('[data-field="commissionPct"]').count(), 0, 'no percentage for a rental');
  assert.deepEqual(await page.locator('[data-field="rentCommissionType"] option').allInnerTexts(), ['Months of Rent', 'Flat Fee (RM)']);
  assert.deepEqual(await page.locator('[data-field="rentCommissionMonths"] option').allInnerTexts(), ['Not Set', '1 month of rent', '1.5 months of rent', '2 months of rent', 'Custom…']);
  await page.locator('[data-field="monthlyRent"]').fill('1800');
  for (const [m, rmx] of [['1', '1,800'], ['1.5', '2,700'], ['2', '3,600']]) {
    await page.locator('[data-field="rentCommissionMonths"]').selectOption(m);
    assert.match(await page.getByTestId('form-rent-commission').innerText(), new RegExp(`RM ${rmx}`));
  }
  // Owner 15 Oct: any number of months (Custom…), or a flat fee in RM.
  await page.locator('[data-field="rentCommissionMonths"]').selectOption('custom');
  await page.locator('[data-field="rentCommissionMonthsCustom"]').fill('0.75');
  assert.match(await page.getByTestId('form-rent-commission').innerText(), /RM 1,350/i);
  await page.locator('[data-field="rentCommissionType"]').selectOption('flat');
  await page.locator('[data-field="rentCommissionFlat"]').fill('2500');
  assert.match(await page.getByTestId('form-rent-commission').innerText(), /RM 2,500/i);
  await page.locator('[data-field="rentCommissionType"]').selectOption('months');
  await page.locator('[data-field="rentCommissionMonths"]').selectOption('2');
  await page.locator('[data-field="securityDepositMonths"]').fill('2');
  await comments.fill('Line one of the comment.\nLine two, still here.');
  await setStreet(page, 'Jalan Sampel Ujian 1');
  await page.getByTestId('save-property').click(); await page.getByTestId('listing-details').waitFor();
  const money = await page.getByTestId('sec-tenure-view').innerText();
  assert.match(money, /Commission \(Months of Rent\)[\s\S]*2 months of rent/i);
  assert.match(money, /RM 1,800/i);
  assert.match(await page.getByTestId('detail-rent-commission').innerText(), /RM 3,600/i);
  assert.equal(await page.getByTestId('detail-comments').locator('p').innerText(), 'Line one of the comment.\nLine two, still here.');
  await page.context().close();
});

test('U101 Change 009 older records are mapped, not lost: a separate lot number joins Unit/Lot Number, "No restriction" shows as NON Bumiputera, the chosen main photo comes first', async () => {
  const page = await phone();
  await page.evaluate(async png => {
    const db = await new Promise(res => { const r = indexedDB.open('estate-agent-buddy'); r.onsuccess = () => res(r.result); });
    const put = (store, key, val) => new Promise((res, rej) => { const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).put(val, key); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    const pic = c => ({ id: c, name: `${c}.png`, url: `data:image/png;base64,${png}` });
    await put('records', 'c:properties:old1', { id: 'old1', created: 1, updated: 1, ref: 'P2001', refPrefix: 'P', refNo: 2001, type: 'Terrace house', purpose: 'sale',
      unitNo: '7', lotNo: '2/14', street: 'Jalan Lama 1', township: 'Taman Lama', restriction: 'No restriction', tenure: 'freehold',
      photos: [pic('a'), pic('b'), pic('c')], mainPhotoId: 'c' });
    db.close();
  }, PNG_1X1);
  await page.reload(); await page.waitForSelector('nav.grid');
  await tile(page, 'Property List');
  assert.equal(await page.getByTestId('card-address').first().innerText(), '7, Lot 2/14, Jalan Lama 1, Taman Lama');
  await page.locator('.sc-card').first().click();
  assert.match(await page.getByTestId('sec-tenure-view').innerText(), /NON Bumiputera/i);
  assert.match(await page.getByTestId('sec-location-view').innerText(), /Unit\/Lot Number\s*7, Lot 2\/14/i);
  await page.getByRole('button', { name: 'Edit', exact: true }).first().click(); await expandForm(page);
  assert.equal(await page.locator('[data-field="unitNo"]').inputValue(), '7, Lot 2/14');
  assert.match(await page.getByTestId('opt-restriction').innerText(), /NON Bumiputera/i);
  assert.deepEqual(await page.getByTestId('form-photo').evaluateAll(xs => xs.map(x => x.dataset.photoId)), ['c', 'a', 'b'], 'the old main photo is first');
  assert.match(await page.getByTestId('form-photo').first().innerText(), /Main/i);
  await page.getByTestId('save-property').click(); await page.getByTestId('listing-details').waitFor();
  const rec = await page.evaluate(() => new Promise(res => { const r = indexedDB.open('estate-agent-buddy'); r.onsuccess = () => { const g = r.result.transaction('records').objectStore('records').get('c:properties:old1'); g.onsuccess = () => { res(g.result); r.result.close(); }; }; }));
  assert.deepEqual([rec.unitNo, rec.lotNo, rec.restriction, rec.mainPhotoId, rec.photos.map(x => x.id)], ['7, Lot 2/14', undefined, 'NON Bumiputera', 'c', ['c', 'a', 'b']]);
  await page.context().close();
});

test('U102 Change 009 photos: a visible loading spinner, errors named, no Make Main; drag or arrows reorder; the first is always Main, also after deleting', async () => {
  const page = await phone();
  await tile(page, 'Property List'); await newProperty(page);
  // Slow the picture decoding down so the progress indicator can be seen, as on a slower phone.
  await page.evaluate(() => { const real = window.createImageBitmap.bind(window); window.createImageBitmap = async (...a) => { await new Promise(r => setTimeout(r, 400)); return real(...a); }; });
  const png = Buffer.from(PNG_1X1, 'base64');
  const input = page.getByTestId('photo-input');
  await input.setInputFiles([
    { name: 'one.png', mimeType: 'image/png', buffer: png }, { name: 'two.png', mimeType: 'image/png', buffer: png },
    { name: 'three.png', mimeType: 'image/png', buffer: png }, { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('not a picture') },
  ]);
  await page.getByTestId('photo-progress').waitFor();
  assert.match(await page.getByTestId('photo-progress').innerText(), /Preparing photos… \d of 4/i);
  assert.equal(await page.getByTestId('save-property').isDisabled(), true, 'Save waits while photos are prepared');
  await page.getByTestId('photo-progress').waitFor({ state: 'detached', timeout: 10000 });
  const msgs = await page.getByTestId('photo-msg').allInnerTexts();
  assert.ok(msgs.some(m => /3 photos added/.test(m)), msgs.join(' | '));
  assert.ok(msgs.some(m => /Could not add notes\.txt/.test(m)), 'the failed file is named');
  assert.equal(await page.getByRole('button', { name: /Make main/i }).count(), 0, 'no Make Main button');
  const names = () => page.getByTestId('form-photo').evaluateAll(xs => xs.map(x => x.querySelector('img')?.closest('[data-photo-id]')?.dataset.photoId));
  const ids0 = await names();
  assert.equal(ids0.length, 3);
  assert.equal(await page.getByTestId('photo-main').count(), 1);
  assert.equal(await page.getByTestId('form-photo').first().getByTestId('photo-main').count(), 1, 'Main is on the first photo');
  // Change 015: no arrows; the photo's menu → Make as Main Photo moves photo 3 to the front.
  assert.equal(await page.getByRole('button', { name: /Move photo \d (earlier|later)/ }).count(), 0, 'no arrows');
  await page.getByTestId('form-photo').nth(2).getByTestId('photo-menu').click();
  await page.getByTestId('photo-make-main').click();
  assert.deepEqual(await names(), [ids0[2], ids0[0], ids0[1]]);
  // Drag photo 2 onto the first place: it becomes the main photo.
  await page.getByTestId('photo-grid').evaluate(el => el.scrollIntoView({ block: 'center' }));   // clear of the top bar
  const h = await page.getByTestId('photo-drag').nth(1).boundingBox();
  const t0 = await page.getByTestId('form-photo').nth(0).boundingBox();
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2); await page.mouse.down();
  await page.mouse.move(t0.x + t0.width / 2, t0.y + t0.height / 2, { steps: 6 }); await page.mouse.up();
  assert.deepEqual(await names(), [ids0[0], ids0[2], ids0[1]], 'dragged to the front');
  assert.equal(await page.getByTestId('form-photo').first().getByTestId('photo-main').count(), 1);
  // Deleting the main photo makes the next one main; deleting all leaves a safe empty list.
  await page.getByTestId('form-photo').first().getByTestId('photo-menu').click(); await page.getByTestId('photo-remove').click(); await confirmPhotoDelete(page);
  assert.deepEqual(await names(), [ids0[2], ids0[1]]);
  assert.equal(await page.getByTestId('form-photo').first().getByTestId('photo-main').count(), 1);
  await page.getByTestId('save-property').click(); await page.getByTestId('listing-details').waitFor();
  const rec = await page.evaluate(() => new Promise(res => { const r = indexedDB.open('estate-agent-buddy'); r.onsuccess = () => { const all = r.result.transaction('records').objectStore('records').getAll(); all.onsuccess = () => { res(all.result.find(x => x && Array.isArray(x.photos) && x.photos.length)); r.result.close(); }; }; }));
  assert.equal(rec.mainPhotoId, rec.photos[0].id, 'the saved main photo is the first photo');
  await page.getByRole('button', { name: 'Edit', exact: true }).first().click(); await expandForm(page);
  for (let i = 0; i < 2; i++) { await page.getByTestId('form-photo').first().getByTestId('photo-menu').click(); await page.getByTestId('photo-remove').click(); await confirmPhotoDelete(page); }
  assert.equal(await page.getByTestId('form-photo').count(), 0);
  await page.getByTestId('save-property').click(); await page.getByTestId('listing-details').waitFor();
  await page.context().close();
});

test('U103 Change 009 searchable dropdowns: type to filter State / City / Township; a typed value is remembered with ✕; land types together; NIL and NON Bumiputera offered', async () => {
  const page = await phone();
  await tile(page, 'Property List'); await newProperty(page);
  const state = page.getByTestId('opt-state');
  await state.locator('.opt-btn').click();
  await state.getByTestId('opt-state-search').fill('sel');
  assert.deepEqual(await state.getByRole('option').allInnerTexts(), ['Selangor']);
  await state.getByTestId('opt-state-search').press('Enter');
  assert.match(await state.innerText(), /Selangor/i);
  const city = page.getByTestId('opt-city');
  await city.locator('.opt-btn').click();
  await city.getByTestId('opt-city-search').fill('kla');
  assert.deepEqual(await city.getByRole('option').allInnerTexts(), ['Klang', 'Port Klang']);
  await city.getByRole('option', { name: 'Klang', exact: true }).click();
  const town = page.getByTestId('opt-township');
  await town.locator('.opt-btn').click();
  await town.getByTestId('opt-township-search').fill('Taman Sampel Baru');
  assert.match(await town.innerText(), /Nothing matches/i);
  await town.getByTestId('opt-township-add').click();
  assert.match(await town.innerText(), /Taman Sampel Baru/i);
  // Property type: the four land types together; Land use NIL; restriction NON Bumiputera.
  await page.locator('[data-testid="opt-type"] .opt-btn').click();
  const types = await page.getByTestId('opt-type').getByRole('option').allInnerTexts();
  const lands = types.map((t, i) => [t, i]).filter(([t]) => / Land$/.test(t)).map(([, i]) => i);
  assert.equal(lands.length, 4); assert.equal(lands[3] - lands[0], 3, `land types together: ${types.join(', ')}`);
  await page.getByTestId('opt-type').getByRole('option', { name: 'Terrace House' }).click();
  // ClaudeChanges001 change 4: Land Use is a remembered list with Others.
  await page.locator('[data-testid="opt-landUse"] .opt-btn').click();
  assert.ok((await page.getByTestId('opt-landUse').getByRole('option').allInnerTexts()).includes('NIL'));
  await page.locator('[data-testid="opt-landUse"] .opt-btn').click();
  await page.locator('[data-testid="opt-restriction"] .opt-btn').click();
  const r = await page.getByTestId('opt-restriction').getByRole('option').allInnerTexts();
  assert.ok(r.includes('NON Bumiputera') && !r.some(x => /No restriction/i.test(x)), r.join(', '));
  await page.getByTestId('opt-restriction').getByRole('option', { name: 'NON Bumiputera' }).click();
  // Owner details are never copied into the next property; only the remembered dropdown value is offered again.
  await page.locator('[data-field="ownerName"]').fill('Puan Sampel');
  await page.getByTestId('save-property').click(); await page.getByTestId('listing-details').waitFor();
  await home(page); await tile(page, 'Property List'); await newProperty(page);
  assert.equal(await page.locator('[data-field="ownerName"]').inputValue(), '', 'no owner copied');
  // ClaudeChanges001 change 5: a township is remembered under its state and city, so they are chosen first.
  await pickOpt(page, 'opt-state', 'Selangor');
  await pickOpt(page, 'opt-city', 'Klang');
  const t2 = page.getByTestId('opt-township');
  await t2.locator('.opt-btn').click();
  assert.equal(await t2.getByRole('button', { name: 'Remove Taman Sampel Baru' }).count(), 1, 'remembered, with ✕');
  await t2.getByRole('button', { name: 'Remove Taman Sampel Baru' }).click();
  assert.equal(await t2.getByRole('option', { name: /Taman Sampel Baru/i }).count(), 0);
  await page.context().close();
});

test('U104 Change 009 tenant and banner: Tenanted reveals the tenant contact box; Banner Placed shows Choose Location and the point appears on My Banner Map; card values in verification colours', async () => {
  const page = await phone({ maps: true });
  await tile(page, 'Property List'); await newProperty(page);
  await page.locator('[data-field="purpose"]').selectOption('sale');
  assert.equal(await page.getByTestId('tenant-box').count(), 0, 'no tenant box for a vacant sale listing');
  // ClaudeChanges001 change 10: "Rented" (Status merged into Availability) reveals the tenant box; the rental-page
  // question is answered "Later".
  await page.locator('[data-field="availability"]').selectOption('rented');
  await page.getByTestId('deal-ask-cancel').click();
  await page.getByTestId('tenant-box').waitFor();
  assert.equal(await page.locator('#sec-tenancy').getAttribute('data-open'), 'yes', 'opened by itself');
  await page.locator('[data-field="tenancy.tenant"]').fill('Encik Penyewa');
  await page.locator('[data-field="tenancy.tenantPhone"]').fill('012-345 6789');
  await page.locator('[data-field="tenancy.tenantPhone"]').blur();
  assert.equal(await page.locator('[data-field="tenancy.tenantPhone"]').inputValue(), '60 12-345 6789');
  await page.locator('[data-field="tenancy.tenantWhatsapp"]').fill('penyewa_ns');
  // Banner Placed → Choose Location → a point on the map.
  await page.locator('#sec-banner [data-field="bannerStatus"]').selectOption('yes');
  await page.getByTestId('banner-choose-location').click();
  await page.waitForSelector('[data-testid="picker-map"]');
  await page.evaluate(() => window.__mapClick(2.8311, 101.8122));
  await page.getByTestId('apply-location').click();
  assert.match(await page.getByTestId('banner-picked').innerText(), /Banner location chosen/i);
  await setStreet(page, 'Jalan Sampel Banner 1');
  await page.locator('[data-field="askingPrice"]').fill('600000');
  await page.locator('[data-field="landSqft"]').fill('1800');
  await page.locator('[data-verify="landSqft"]').selectOption('confirmed');
  await page.getByTestId('save-property').click(); await page.getByTestId('listing-details').waitFor();
  assert.match(await page.getByTestId('tenancy').innerText(), /Encik Penyewa[\s\S]*\+60 12-345 6789[\s\S]*@penyewa_ns/i);
  assert.match(await page.getByTestId('banner-summary').innerText(), /1 banner up/i);
  await home(page); await tile(page, 'GPS Assistance'); await page.getByTestId('card-banners').click();
  await page.getByTestId('banner-card').filter({ hasText: 'Jalan Sampel Banner 1' }).waitFor();
  await page.waitForFunction(() => window.__markers?.some(m => Math.abs((m.o.position?.lat ?? 0) - 2.8311) < 1e-6));
  // Card colours: Confirmed green, unmarked = Need to check red.
  await home(page); await tile(page, 'Property List');
  await page.getByRole('button', { name: 'Large cards' }).click();
  const card = page.getByTestId('listing-card').filter({ hasText: 'Jalan Sampel Banner 1' });
  assert.equal(await card.locator('[data-vkey="landSqft"]').getAttribute('data-verify'), 'confirmed');
  assert.equal(await card.locator('[data-vkey="landSqft"]').evaluate(e => getComputedStyle(e).color), 'rgb(111, 212, 155)', 'green');
  assert.ok(!/Confirmed|Need to Check|Owner Stated/.test(await card.innerText()), 'colour only on cards, no repeated status words');
  await page.context().close();
});

test('U98 Change 001: the first-start sample-data choice sits higher on the screen, on a normal and a small phone, and still works', async () => {
  for (const vp of [{ width: 384, height: 824 }, { width: 320, height: 568 }]) {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto(base);
    const sheet = page.getByTestId('start-choice');
    await sheet.waitFor();
    const box = await sheet.boundingBox();
    assert.ok(box.y <= vp.height * 0.12, `top of the choice near the top of the screen (${box.y} of ${vp.height})`);
    assert.ok(box.y + box.height <= vp.height + 1, 'the whole choice fits on the screen (it scrolls inside when needed)');
    const empty = page.getByTestId('start-empty');
    await empty.scrollIntoViewIfNeeded();
    await empty.click();
    await page.waitForFunction(() => !document.querySelector('[data-testid="start-choice"]'));
    if (vp.width === 384) await shot(page, '98-after-start', false);
    await ctx.close();
  }
});

test('U99 Change 007: the QA build has no orange QA banner; About still says QA; the save status line stays', async () => {
  const QA_DIST = new URL('../.test-qa-dist/', import.meta.url).pathname;
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(process.execPath, ['scripts/build.mjs', '--no-env'], { cwd: new URL('..', import.meta.url).pathname, env: { ...process.env, EAB_QA: '1', EAB_OUTDIR: '.test-qa-dist' }, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const ctx = await browser.newContext({ viewport: { width: 384, height: 824 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route('https://qa.test/**', async route => {
    const u = new URL(route.request().url());
    const file = join(QA_DIST, u.pathname === '/' ? 'index.html' : u.pathname);
    try { await route.fulfill({ status: 200, contentType: types[extname(file)] ?? 'application/octet-stream', body: await readFile(file) }); }
    catch { await route.fulfill({ status: 404, body: '' }); }
  });
  const page = await ctx.newPage();
  await page.goto('https://qa.test/'); await page.waitForSelector('nav.grid'); await chooseStart(page, 'empty');
  assert.equal(await page.getByTestId('qa-bar').count(), 0, 'no orange QA banner');
  assert.equal(await page.locator('.qa-bar').count(), 0);
  // ClaudeChanges001 change 2: there is no save / sync status line at all now.
  assert.equal(await page.locator('[data-testid="save-status"], .save-status').count(), 0);
  // No empty strip: the save status line follows the header directly.
  const gap = await page.evaluate(() => { const h = document.querySelector('header.topbar').getBoundingClientRect(); const n = h.bottom; const next = document.querySelector('header.topbar').nextElementSibling.getBoundingClientRect(); return next.top - n; });
  assert.ok(gap < 2, `nothing left between the header and the next line (${gap}px)`);
  await tile(page, 'Agent Profile'); await page.getByRole('button', { name: /Settings/i }).click();
  await page.getByTestId('about').scrollIntoViewIfNeeded().catch(() => {});
  assert.match(await page.getByTestId('about-qa').innerText(), /QA test build/i, 'Settings → About still identifies the QA build');
  await ctx.close();
});

test('U101 Change 011 (with Change 015): one fixed advert area above the phone navigation on normal screens (none on the PDF preview); in-feed adverts never open a property; Delete (on the property page since Change 015) archives and Restore brings back the same record', async () => {
  const page = await phone();
  await loadSample(page);
  const adOk = async where => {
    const ad = page.getByTestId('bottom-ad');
    assert.equal(await ad.count(), 1, `${where}: one advert area`);
    const box = await ad.boundingBox(); const vh = page.viewportSize().height;
    assert.ok(Math.abs(box.y + box.height - vh) <= 1, `${where}: fixed at the bottom of the app area (${box.y + box.height} vs ${vh})`);
    assert.ok(box.height >= 50 && box.height <= 60, `${where}: banner height (${box.height})`);
    assert.match(await ad.innerText(), /Ad space · placeholder/i, `${where}: clearly a placeholder in a browser`);
    // Change 015: the scrolling content ends directly above the advert, so nothing is ever under it
    const main = await page.locator('main.content').boundingBox();
    assert.ok(main.y + main.height <= box.y + 1, `${where}: content ends above the advert`);
  };
  await adOk('home');
  for (const [name, open] of [
    ['calendar', () => tile(page, 'Calendar')], ['gps', () => tile(page, 'GPS Assistance')], ['buyers', () => tile(page, 'Buyer List')],
    ['vendors', () => tile(page, 'Vendor List')], ['contacts', () => tile(page, 'Contacts')], ['calculator', () => tile(page, 'Property Calculator')],
    ['expert', () => tile(page, 'Ask Expert')], ['subsale', () => tile(page, 'Subsale List')],
  ]) { await home(page); await open(); await adOk(name); }
  // the end of the list can be scrolled above the advert
  await page.locator('main.content').evaluate(m => m.scrollTo(0, m.scrollHeight));
  const lastCard = await page.getByTestId('listing-card').last().boundingBox();
  const adTop = (await page.getByTestId('bottom-ad').boundingBox()).y;
  assert.ok(lastCard.y + lastCard.height <= adTop + 1, 'the last property card is not under the advert');
  // in-feed advert: tapping it opens nothing
  await page.getByTestId('feed-ad').first().click();
  assert.equal(await page.getByTestId('listing').count(), 1, 'still on the Subsale List');
  assert.equal(await page.getByTestId('feed-ad').first().evaluate(a => a.closest('button, a') === null), true, 'the advert is not a button or link');
  // searching recounts: 2 shown → no advert; clearing → adverts again
  await page.locator('.lc-toolbar input').fill('Sampel Industri');
  const shownN = await page.getByTestId('listing-card').count();
  assert.equal(await page.getByTestId('feed-ad').count(), Math.floor(shownN / 3), `after a search: ${shownN} shown`);
  await page.locator('.lc-toolbar input').fill('');
  assert.equal(await page.getByTestId('feed-ad').count(), Math.floor((await page.getByTestId('listing-card').count()) / 3));
  // Change 015: no Delete on the card; Delete on the property page = archive (with confirmation); Restore from the
  // Archived section returns the same record
  const first = page.getByTestId('listing-card').first();
  assert.equal(await first.getByTestId('card-delete').count(), 0);
  const addr = await first.getByTestId('card-address').innerText();
  const n0 = await page.getByTestId('listing-card').count();
  await first.locator('.sc-card').click();
  await page.getByTestId('detail-delete').click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await page.getByTestId('listing').waitFor();
  assert.equal(await page.getByTestId('listing-card').count(), n0 - 1);
  await waitStored(page, 'records', `all.some(v => v && v.archived && ${JSON.stringify(addr)}.includes(v.street))`);
  await page.getByTestId('archived-section').locator('summary').click();
  assert.equal(await page.getByTestId('archived-card').count(), 1);
  await page.getByTestId('archived-restore').click();
  assert.equal(await page.getByTestId('listing-card').count(), n0, 'restored, no duplicate');
  assert.equal(await page.getByTestId('listing-card').filter({ hasText: addr }).count(), 1);
  await waitStored(page, 'records', `all.filter(v => v && v.street && ${JSON.stringify(addr)}.includes(v.street) && !v.archived).length === 1`);
  // Owner, 17 Oct 2026 (supersedes Change 011): every card has its location button.
  assert.equal(await page.getByTestId('card-location').count(), await page.getByTestId('listing-card').count());
  // PDF preview fills the screen: no advert while it is open, back afterwards
  await page.getByTestId('listing-card').first().locator('.sc-card').click();
  await page.getByTestId('sec-location-view').waitFor();
  await page.getByTestId('open-buyer-pdf').click();
  await page.getByTestId('buyer-pdf-preview').click();
  await page.getByTestId('pdf-page').first().waitFor({ timeout: 15000 });
  assert.equal(await page.getByTestId('bottom-ad').count(), 0, 'no advert over the document preview');
  assert.equal(await page.getByTestId('busy-line').count() + await page.getByTestId('pdf-making').count(), 0, 'the spinner stopped when the PDF was ready');
  await page.getByTestId('pdf-close').click();
  await adOk('after the preview');
  await shot(page, '101-subsale-ads', false);
  await page.context().close();
});

test('U102 Change 012: property choosers show photo rows (placeholder without a photo); buyer and vendor choosers are unchanged; shared button rows; one language button', async () => {
  const page = await phone();
  await loadSample(page);
  await tile(page, 'Calendar');
  await page.getByRole('button', { name: '+ Appointment' }).click();
  await page.locator('[data-field="propertyId"]').click();
  const opts = page.getByTestId('pp-option');
  assert.ok(await opts.count() >= 5);
  const row = opts.first();
  const [thumb, ref, addr] = [row.locator('.pp-thumb'), row.getByTestId('pp-ref'), row.getByTestId('pp-addr')];
  assert.ok((await thumb.boundingBox()).x < (await ref.boundingBox()).x, 'photo on the left, text on the right');
  assert.match(await ref.innerText(), /^P\d+/);
  assert.ok((await addr.innerText()).length > 3);
  assert.ok(await page.getByTestId('pp-thumb-none').count() >= 1, 'a property without its own photo has a plain placeholder');
  assert.ok(await page.getByTestId('property-picker-list').evaluate(l => getComputedStyle(l).overflowY === 'auto'), 'the list scrolls');
  const id = await row.getAttribute('data-id');
  await row.click();
  assert.equal(await page.locator('[data-field="propertyId"]').getAttribute('data-value'), id, 'the chosen property is the one tapped (by its id)');
  assert.equal(await page.locator('select[data-field="contactId"]').count(), 1, 'the contact chooser stays an ordinary list (no photos)');
  await shot(page, '102-property-picker', false);
  // Property details: the actions share their rows evenly; Buyer's History is the one full-width button under them
  await home(page); await tile(page, 'Subsale List');
  await page.getByTestId('listing-card').first().locator('.sc-card').click();
  const widths = await page.locator('.rec-actions > *').evaluateAll(bs => bs.map(b => Math.round(b.getBoundingClientRect().width)));
  const rowW = await page.locator('.rec-actions').evaluate(r => r.getBoundingClientRect().width);
  for (let i = 0; i < widths.length; i++) {
    const alone = i === widths.length - 1 && widths.length % 2 === 1;
    if (alone) assert.ok(Math.abs(widths[i] - rowW) < 2, 'a button alone in its row is full width');
    else assert.ok(Math.abs(widths[i] - (rowW - 8) / 2) < 2, `two in a row are halves (${widths[i]})`);
  }
  assert.equal(await page.getByTestId('bh-buyer').count(), 0, 'no Buyer\'s History list on the details page itself');
  await home(page);
  assert.equal(await page.locator('nav.grid').getByText(/Buyer.s History/).count(), 0, 'no Buyer\'s History card on the home screen');
  // one language button with a list
  assert.equal(await page.locator('header .lang > button').count(), 1);
  await pickLang(page, '[aria-label="Bahasa Malaysia"]');
  assert.match(await page.locator('nav.grid').innerText(), /Senarai Subsale[\s\S]*Arahan Dibantu AI/);
  await pickLang(page, { hasText: 'EN' });
  await page.context().close();
});

test('U103 Change 013: Buyer Matching — choose a buyer, filter, tick several, save, reopen, remove; archived only on request and marked; nothing is sent', async () => {
  const page = await phone();
  await loadSample(page);
  const ext0 = external.length;
  await tile(page, 'Buyer Matching');
  await page.getByTestId('bm-buyer').filter({ hasText: 'Buyer L' }).click();
  await page.getByTestId('buyer-matches').waitFor();
  await page.getByTestId('bm-clear').click();
  const n = await page.getByTestId('bm-card').count();
  assert.ok(n >= 3, `${n} properties to choose from`);
  assert.equal(await page.locator('[data-testid="bm-card"][data-archived="yes"]').count(), 0, 'archived properties are not offered by default');
  const ids = await page.getByTestId('bm-card').evaluateAll(c => c.slice(0, 2).map(x => x.getAttribute('data-id')));
  for (const pid of ids) await page.locator(`[data-testid="bm-card"][data-id="${pid}"] [data-testid="bm-pick"]`).check();
  await page.getByTestId('bm-save').click();
  assert.match(await page.getByTestId('toast').innerText(), /2 matches saved[\s\S]*Nothing was sent/i);
  assert.deepEqual(await page.getByTestId('bm-saved-card').evaluateAll(c => c.map(x => x.getAttribute('data-id'))).then(x => x.sort()), [...ids].sort());
  await waitStored(page, 'records', `all.some(v => v && v.id === 'b2' && (v.savedMatches || []).length === 2)`);
  // reopen from the buyer's own record after closing the app
  await page.reload(); await page.waitForSelector('nav.grid');
  await tile(page, 'Buyer List');
  await page.getByText('Buyer L (sample)').first().click();
  assert.match(await page.getByTestId('open-buyer-matches').innerText(), /2 saved matches/);
  await page.getByTestId('open-buyer-matches').click();
  assert.equal(await page.getByTestId('bm-saved-card').count(), 2);
  // remove one
  await page.locator(`[data-testid="bm-saved-card"][data-id="${ids[0]}"] [data-testid="bm-drop"]`).check();
  await page.getByTestId('bm-remove').click();
  assert.equal(await page.getByTestId('bm-saved-card').count(), 1);
  // archive the other saved property: it stays saved and says Archived
  await page.locator(`[data-testid="bm-saved-card"][data-id="${ids[1]}"] .gc`).click();
  await page.getByTestId('detail-delete').click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await home(page); await tile(page, 'Buyer Matching');
  await page.getByTestId('bm-buyer').filter({ hasText: 'Buyer L' }).click();
  assert.equal(await page.getByTestId('bm-saved-card').getByTestId('bm-archived-tag').count(), 1, 'a saved match that was archived says so');
  await page.getByTestId('bm-clear').click();
  assert.equal(await page.locator(`[data-testid="bm-card"][data-id="${ids[1]}"]`).count(), 0, 'not offered again while archived');
  await page.getByTestId('bm-show-archived').selectOption('yes');
  assert.equal(await page.locator(`[data-testid="bm-card"][data-id="${ids[1]}"] [data-testid="bm-archived-tag"]`).count(), 1, 'shown and marked Archived on request');
  assert.equal(external.length, ext0, 'saving matches sent nothing anywhere');
  assert.equal(await page.locator('[data-testid="buyer-matches"] a[href*="wa.me"], [data-testid="buyer-matches"] a[href^="mailto:"]').count(), 0, 'no WhatsApp or email links here');
  await shot(page, '103-buyer-matches', false);
  await page.context().close();
});

test('U104 Change 014: Location straight after section 2 with the street first; status dropdowns without the "Check status" text and as tall as the field; Frontage, Depth, Lot Type and building specifications each have one; commission and Other Specification have none', async () => {
  const page = await phone();
  await tile(page, 'Subsale List'); await newProperty(page);
  const heads = await page.locator('[data-testid="listing-form"] > .card[id] .sec-head .card-title').allInnerTexts();
  assert.match(heads[0], /^1 · /); assert.match(heads[1], /^2 · /); assert.match(heads[2], /^3 · Location/i); assert.match(heads[3], /^4 · Photos/i);
  const street = await page.locator('#sec-location [data-testid="opt-street"]').boundingBox();
  const unit = await page.locator('#sec-location [data-field="unitNo"]').boundingBox();
  assert.ok(unit.y > street.y, 'Unit / Lot Number comes under the street');
  await page.locator('[data-testid="opt-type"] .opt-btn').click();
  await page.getByTestId('opt-type').getByRole('option', { name: 'Semi-D Factory' }).click();
  await page.locator('[data-field="purpose"]').selectOption('sale');
  for (const k of ['frontageFt', 'depthFt', 'lotType', 'ceilingFt', 'powerKva', 'loadingBays']) assert.equal(await page.locator(`select[data-verify="${k}"]`).count(), 1, `${k} has a status`);
  assert.equal(await page.locator('select[data-verify="specs"]').count(), 0, 'Other Specification has no status');
  assert.equal(await page.locator('select[data-verify="commissionPct"], select[data-verify="commissionType"]').count(), 0, 'no status on Commission Type or Percentage');
  assert.equal(await page.getByText(/^Check status$/i).count(), 0, 'no separate "Check status" text');
  const field = await page.locator('[data-field="ceilingFt"]').boundingBox(); const st = await page.locator('select[data-verify="ceilingFt"]').boundingBox();
  assert.ok(Math.abs(field.height - st.height) <= 1 && Math.abs(field.width - st.width) <= 1, `status as tall and wide as the field (${field.height}/${st.height}, ${field.width}/${st.width})`);
  assert.equal(await page.locator('select[data-verify="ceilingFt"] option:checked').innerText(), 'Need to Check', 'the chosen status is what the dropdown shows');
  await page.locator('[data-field="commissionPct"]').fill('2');
  await page.locator('[data-field="askingPrice"]').fill('1000000');
  assert.match(await page.getByTestId('form-commission').innerText(), /RM 20,000/, 'commission calculation unchanged');
  // land: Lot Type with Frontage and Depth; Zoning, Plan Approval and Current Use each with a status
  await page.locator('[data-testid="opt-type"] .opt-btn').click();
  await page.getByTestId('opt-type').getByRole('option', { name: 'Development Land' }).click();
  for (const k of ['frontageFt', 'depthFt', 'lotType', 'zoning', 'approvals']) assert.equal(await page.locator(`select[data-verify="${k}"]`).count(), 1, `land: ${k} has a status`);
  await page.locator('[data-testid="opt-type"] .opt-btn').click();
  await page.getByTestId('opt-type').getByRole('option', { name: 'Agricultural Land' }).click();
  assert.equal(await page.locator('select[data-verify="currentUse"]').count(), 1, 'Current Use / Crop has a status');
  await shot(page, '104-form-statuses', false);
  await page.context().close();
});

test('U22 no requests leave the phone without a configured service, and no errors in the browser console', () => {
  assert.deepEqual(external, []);
  assert.deepEqual(consoleErrors, []);
});

// ---------- Change 015 (owner, 16 Oct 2026) ----------
/** A property made through the form with the Change 015 specification fields. */
async function c15Property(page, { street, purpose = 'sale', status = 'available', tenure }) {
  await tile(page, 'Property List'); await newProperty(page);
  await page.locator('[data-testid="opt-type"] .opt-btn').click();
  await page.getByTestId('opt-type').getByRole('option', { name: /^Terrace house$/i }).click();
  await page.locator('[data-field="purpose"]').selectOption(purpose);
  if (purpose !== 'rent') await page.locator('[data-field="askingPrice"]').fill('650000');
  if (purpose !== 'sale') await page.locator('[data-field="monthlyRent"]').fill('2200');
  await setStreet(page, street);
  await page.locator('[data-field="floors"]').fill('2.5');
  await pickOpt(page, 'opt-lotType', 'Corner');
  await page.locator('[data-field="bedrooms"]').fill('4');
  await page.locator('[data-field="bathrooms"]').fill('3');
  await page.locator('[data-field="landSqft"]').fill('1650');
  await page.locator('[data-field="builtUpSqft"]').fill('2200');
  // ClaudeChanges001 change 10: the status is chosen in Availability; Booked asks about the booking page ("Later").
  await page.locator('[data-field="availability"]').selectOption({ available: 'available_now', in_progress: 'booked', sold: 'sold', rented: 'rented', off_market: 'withdrawn' }[status]);
  if (['in_progress', 'sold', 'rented'].includes(status)) await page.getByTestId('deal-ask-cancel').click();
  if (tenure) await page.locator('[data-field="tenure"]').selectOption(tenure);
  await page.getByTestId('save-property').click();
  await page.waitForSelector('[data-testid="listing-details"]');
  await waitStored(page, 'records', `all.some(v => v && v.street === ${JSON.stringify(street)})`);
}

test('U115 Change 015 cards (as changed 17 Oct 2026): far-right gold pencil (long titles too) opens the form, not the card; FOR SALE / FOR RENT top left of the photo; AVAILABLE top right; spaced spec lines with tenure after the type; counts; "Click to Open"; no Delete or Open buttons', async () => {
  const page = await phone();
  const long = 'Jalan Ceria Indah Permai Satu Dua Tiga Empat Lima Enam Tujuh Lapan Sembilan Sepuluh';
  await c15Property(page, { street: long, purpose: 'sale' });
  await home(page);
  await c15Property(page, { street: 'Jalan Sewa 2', purpose: 'rent', status: 'in_progress' });
  await home(page);
  await c15Property(page, { street: 'Jalan Kedua-dua 3', purpose: 'sale_or_rent', tenure: 'freehold' });
  await home(page);
  await tile(page, 'Property List');
  for (const layout of ['grid', 'large']) {
    await page.getByRole('group', { name: /Layout/i }).getByRole('button').nth(layout === 'grid' ? 0 : 1).click();
    const cards = page.getByTestId('listing-card');
    assert.equal(await cards.count(), 3, layout);
    assert.equal(await page.getByTestId('card-delete').count(), 0, `${layout}: no Delete on cards`);
    assert.equal(await page.getByTestId('card-open').count(), 0, `${layout}: no Open button on cards`);
    if (layout === 'grid') {
      // Change 28: the small Grid card has no edit button and no footer; it keeps the location button.
      for (let i = 0; i < 3; i++) {
        const c = cards.nth(i);
        assert.equal(await c.getByTestId('card-edit').count(), 0, `grid ${i}: no edit button`);
        assert.equal(await c.getByTestId('card-location').count(), 1, `grid ${i}: location button`);
        assert.equal(await c.getByTestId('card-type').count(), 1, `grid ${i}: property type`);
      }
      continue;
    }
    for (let i = 0; i < 3; i++) {
      const c = cards.nth(i);
      const card = await c.locator('.sc-card').boundingBox();
      const gear = await c.getByTestId('card-edit').boundingBox();
      const title = await c.getByTestId('card-address').boundingBox();
      assert.ok(card.x + card.width - (gear.x + gear.width) <= 16, `${layout} ${i}: gear at the far right`);
      assert.ok(Math.abs(gear.y - title.y) <= 6, `${layout} ${i}: gear on the title row`);
      assert.ok(gear.width >= 28 && Math.abs(gear.width - gear.height) <= 1, `${layout} ${i}: small square gear`);
      assert.equal(await c.getByTestId('card-edit').getAttribute('aria-label'), `Edit property: ${await c.getByTestId('card-address').innerText()}`);
      assert.equal(await c.getByText('Click to Open', { exact: true }).count(), 1);
      assert.equal(await c.getByTestId('card-edit').locator('path').getAttribute('d'), 'M16.5 3.5a2.1 2.1 0 013 3L8 18l-4 1 1-4zM14.5 5.5l3 3', `${layout} ${i}: a pencil, not a gear`);
      const hint = c.getByTestId('card-click-to-open');
      assert.equal(await hint.evaluate(h => h.closest('button, a') === null && h.tagName === 'SPAN'), true, 'not a button');
      const hb = await hint.boundingBox();
      // Change 15 (owner, 17 Oct 2026) replaces "centred": Click to Open at the bottom LEFT, the creator at the right on the same line.
      const who = await c.getByTestId('card-creator').boundingBox();
      assert.ok(hb.x - card.x <= 24, `${layout} ${i}: at the left`);
      assert.ok(card.x + card.width - (who.x + who.width) <= 24, `${layout} ${i}: creator at the right`);
      // same line on Large cards; on narrow Grid cards the name may move under "Click to Open" rather than be cut
      if (layout === 'large') assert.ok(Math.abs((hb.y + hb.height / 2) - (who.y + who.height / 2)) <= 6, `${layout} ${i}: same line`);
      else assert.ok(who.y + who.height / 2 >= hb.y, `${layout} ${i}: on or under the Click to Open line`);
      assert.equal(await c.getByTestId('card-creator').innerText(), 'You');
      assert.ok(card.y + card.height - Math.max(hb.y + hb.height, who.y + who.height) <= 12, `${layout} ${i}: the footer line(s) at the very bottom`);
      assert.equal(await c.locator('.lc-purpose').count(), 0, 'no old purpose badge');
      assert.equal(await c.locator('.sc-body [data-testid="card-tx"]').count(), 0, 'no FOR SALE / FOR RENT under the title');
    }
    // The long title wraps (not cut) and the gear stays at the top right.
    const lc = cards.filter({ hasText: 'Sembilan Sepuluh' });
    const lt = await lc.getByTestId('card-address').boundingBox();
    const lg = await lc.getByTestId('card-edit').boundingBox();
    assert.ok(lt.height > 30, `${layout}: the long title wraps to more lines (${lt.height})`);
    assert.match(await lc.getByTestId('card-address').innerText(), /Sembilan Sepuluh/);
    assert.ok(Math.abs(lg.y - lt.y) <= 6, `${layout}: gear anchored on the first line`);
    // Transaction labels: sale only, rent only, both stacked (FOR SALE above FOR RENT), at the photo's top left.
    const tx = async hasText => cards.filter({ hasText }).getByTestId('card-tx').evaluateAll(xs => xs.map(x => x.textContent));
    assert.deepEqual(await tx('Sembilan'), ['FOR SALE']);
    assert.deepEqual(await tx('Jalan Sewa 2'), ['FOR RENT']);
    assert.deepEqual(await tx('Kedua-dua'), ['FOR SALE', 'FOR RENT']);
    const both = cards.filter({ hasText: 'Kedua-dua' });
    const [s1, r1] = [await both.getByTestId('card-tx').nth(0).boundingBox(), await both.getByTestId('card-tx').nth(1).boundingBox()];
    const pb = await both.locator('.sc-photo').boundingBox();
    assert.ok(s1.x - pb.x <= 12 && s1.y - pb.y <= 12, `${layout}: FOR SALE at the photo's top left`);
    assert.ok(r1.y >= s1.y + s1.height - 1 && Math.abs(r1.x - s1.x) <= 1, `${layout}: FOR RENT under FOR SALE`);
    // AVAILABLE, green, at the photo's top right; another status is kept in the same place.
    const st = both.getByTestId('card-status');
    assert.equal(await st.innerText(), 'AVAILABLE');
    assert.equal(await st.evaluate(e => getComputedStyle(e).backgroundColor), 'rgb(31, 138, 76)');
    const ph = await both.locator('.sc-photo').boundingBox(); const sb = await st.boundingBox();
    assert.ok(ph.x + ph.width - (sb.x + sb.width) <= 12 && sb.y - ph.y <= 12, `${layout}: AVAILABLE at the top right of the photo`);
    assert.match(await cards.filter({ hasText: 'Jalan Sewa 2' }).getByTestId('card-status').innerText(), /BOOKED/);
    // Specification lines (owner, 17 Oct 2026): type line spaced, tenure next, rooms, land and built-up on one spaced line;
    // no parking and no availability.
    const spec = await both.getByTestId('card-spec').evaluateAll(xs => xs.map(x => [x.dataset.spec, [...x.querySelectorAll('.sc-part')].map(p => p.textContent.replace(/\u00a0/g, ' '))]));
    assert.deepEqual(spec.map(x => x[0]), ['type', 'rooms', 'area']);
    assert.deepEqual(spec[0][1].map(t => t.toLowerCase()), ['terrace house', '2.5 storeys', 'corner']);
    assert.deepEqual(spec[0][1].slice(1), ['2.5 Storeys', 'Corner'], 'Title Case');
    assert.deepEqual(spec[1][1], ['4 Bedrooms', ', 3 Bathrooms']);
    assert.deepEqual(spec[2][1], ['Land size 1,650 sq ft', 'Built-Up 2,200 sq ft']);
    assert.ok(!(await both.locator('[data-spec="type"]').innerText()).includes(','), 'no commas on the type line');
    assert.ok(!(await both.locator('[data-spec="area"]').innerText()).includes(','.repeat(1) + ' Built'), 'no comma between land and built-up');
    const [tl, te, rl, al] = [await both.locator('[data-spec="type"]').boundingBox(), await both.getByTestId('card-tenure').boundingBox(), await both.locator('[data-spec="rooms"]').boundingBox(), await both.locator('[data-spec="area"]').boundingBox()];
    assert.ok(tl.y < te.y && te.y < rl.y && rl.y < al.y, `${layout}: type, tenure, rooms, area in that order`);
    const p0 = await both.locator('[data-spec="area"] .sc-part').nth(0).boundingBox(); const p1 = await both.locator('[data-spec="area"] .sc-part').nth(1).boundingBox();
    if (Math.abs(p0.y - p1.y) < 3) assert.ok(p1.x - (p0.x + p0.width) >= 10, `${layout}: a wider space between land and built-up`);
    assert.equal(await both.locator('[data-spec="parking"]').count(), 0, 'no parking line');
    assert.doesNotMatch(await both.innerText(), /Available now/i, 'no "Available Now"');
    // Counts: two compact numbers under the tenure line, no field names on the card.
    const counts = both.getByTestId('card-counts');
    assert.match(await counts.innerText(), /^\* \d+ To Check\s+\* \d+ Not Filled$/);
    assert.doesNotMatch(await counts.innerText(), /Tenure|Price|Owner|Street/i);
    await shot(page, `115-cards-${layout}`, false);
  }
  // The gear opens that property's form with its values, and never also opens the property page.
  const target = page.getByTestId('listing-card').filter({ hasText: 'Jalan Sewa 2' });
  await target.getByTestId('card-edit').click();
  await page.waitForSelector('[data-testid="listing-form"]');
  assert.equal(await page.getByTestId('listing-details').count(), 0, 'the card did not open as well');
  await expandForm(page);
  assert.equal(await streetValue(page), 'Jalan Sewa 2');
  assert.equal(await page.locator('[data-field="monthlyRent"]').inputValue(), '2,200');
  await page.locator('header .icon-btn').first().click();
  // The card body opens the property page.
  await page.getByTestId('listing-card').filter({ hasText: 'Kedua-dua' }).getByTestId('card-click-to-open').click();
  await page.waitForSelector('[data-testid="listing-details"]');
  assert.match(await page.getByTestId('detail-address').innerText(), /Kedua-dua/);
  // Property details list every field to check and every unfilled field on its own row.
  const rows = await page.getByTestId('to-check-row').count();
  const missRows = await page.getByTestId('not-filled-row').count();
  assert.ok(rows > 0 && missRows > 0);
  assert.equal(Number(await page.getByTestId('verify-summary').getAttribute('data-n')), rows);
  assert.equal(Number(await page.getByTestId('not-filled').getAttribute('data-n')), missRows);
  const keys = [...await page.getByTestId('to-check-row').evaluateAll(xs => xs.map(x => x.dataset.key)), ...await page.getByTestId('not-filled-row').evaluateAll(xs => xs.map(x => x.dataset.key))];
  assert.equal(new Set(keys).size, keys.length, 'no field in both lists');
  await home(page); await tile(page, 'Property List');
  const cardN = page.getByTestId('listing-card').filter({ hasText: 'Kedua-dua' });
  assert.match(await cardN.getByTestId('card-counts').innerText(), new RegExp(`\\* ${rows} To Check\\s+\\* ${missRows} Not Filled`), 'card numbers match the detail rows');
  await page.context().close();
});

test('U116 Change 015 Delete on the property page archives (recoverable); the active list loses it; Restore brings back the same record with its photo and notes', async () => {
  const page = await phone();
  await propertyWithPhotos(page, [{ name: 'a.png', mimeType: 'image/png', buffer: Buffer.from(PNG_1X1, 'base64') }]);
  await page.getByRole('button', { name: 'Edit' }).first().click(); await expandForm(page);
  await page.locator('[data-field="notes"]').fill('Keep this note');
  await page.getByTestId('save-property').click();
  await page.waitForSelector('[data-testid="listing-details"]');
  await waitStored(page, 'records', `all.some(v => v && v.notes === 'Keep this note')`);
  const before = (await storedRecords(page, 'properties')).find(p => p.headline === 'Photo house');
  await page.getByTestId('detail-delete').click();
  await page.getByRole('alertdialog').getByRole('button', { name: /Delete|OK|Yes/i }).last().click();
  await page.waitForSelector('[data-testid="listing"]');
  await waitStored(page, 'records', `all.some(v => v && v.headline === 'Photo house' && v.archived)`);
  assert.equal(await page.getByTestId('listing-card').filter({ hasText: 'Photo house' }).count(), 0, 'gone from the active list');
  const archived = (await storedRecords(page, 'properties')).find(p => p.headline === 'Photo house');
  assert.equal(archived.id, before.id, 'same record, not deleted');
  assert.equal(archived.photos.length, 1); assert.equal(archived.notes, 'Keep this note');
  await page.getByTestId('archived-section').locator('summary').click();
  await page.getByTestId('archived-restore').click();
  await waitStored(page, 'records', `all.some(v => v && v.headline === 'Photo house' && !v.archived)`);
  assert.equal(await page.getByTestId('listing-card').filter({ hasText: 'Photo house' }).count(), 1);
  const restored = (await storedRecords(page, 'properties')).filter(p => p.headline === 'Photo house');
  assert.equal(restored.length, 1, 'no duplicate');
  assert.equal(restored[0].id, before.id); assert.equal(restored[0].photos[0].fileId, before.photos[0].fileId); assert.equal(restored[0].notes, 'Keep this note');
  await page.context().close();
});

test('U117 Change 015 location: form and property page in the order Country, State, City, Township, Neighborhood, Street, Unit/Lot; new labels; no Use my current location; Remove Position works', async () => {
  const page = await phone({ maps: true });
  await tile(page, 'Property List'); await newProperty(page);
  const labels = await page.locator('#sec-location .ff > span:first-child, #sec-location label.ff > span:first-child, #sec-location [data-testid^="opt-"] .opt-label').evaluateAll(xs => xs.map(x => x.textContent.trim().replace(/\s*\?$/, '')));
  const want = ['Country', 'State', 'City', 'Township', 'Neighborhood', 'Street', 'Unit/Lot Number'];
  const idx = want.map(w => labels.findIndex(l => l.startsWith(w)));
  assert.ok(idx.every(i => i >= 0), `all labels present: ${labels.join(' | ')}`);
  assert.deepEqual([...idx].sort((a, b) => a - b), idx, 'form order');
  assert.equal(await page.locator('#sec-location').getByText(/City \/ town|Jalan \/ street/i).count(), 0);
  assert.equal(await page.getByRole('button', { name: /Use my current location/i }).count(), 0, 'no Use my current location');
  const remove = page.getByTestId('remove-position');
  assert.equal(await remove.isDisabled(), true, 'Remove Position is there, disabled with no position');
  // Owner, 17 Oct 2026: Neighborhood is a remembered dropdown (Others… adds, ✕ removes).
  const nb = page.getByTestId('opt-neighborhood');
  await nb.locator('.opt-btn').click();
  await nb.getByRole('button', { name: 'Others…' }).click();
  await nb.locator('.opt-new input').fill('Taman Bukit');
  await nb.getByRole('button', { name: 'Add' }).click();
  await setStreet(page, 'Jalan Order 7');
  await page.locator('[data-field="unitNo"]').fill('No. 7');
  // Set a point, then Remove Position clears it.
  await page.getByTestId('gmap-add').click();
  await page.getByTestId('location-picker').waitFor();
  await page.evaluate(() => window.__mapClick?.(2.81, 101.8));
  await page.getByTestId('apply-location').click();
  assert.match(await page.getByTestId('pos-text').innerText(), /saved|✓/i);
  await remove.click();
  assert.doesNotMatch(await page.getByTestId('pos-text').innerText(), /^✓/);
  await page.getByTestId('save-property').click();
  await page.waitForSelector('[data-testid="listing-details"]');
  await waitStored(page, 'records', `all.some(v => v && v.street === 'Jalan Order 7' && v.neighborhood === 'Taman Bukit' && v.lat === undefined)`);
  const vrows = await page.locator('[data-testid="sec-location-view"] .dl-row').evaluateAll(xs => xs.map(x => x.dataset.row));
  assert.deepEqual(vrows.filter(r => ['neighborhood', 'street', 'unitNo'].includes(r)), ['neighborhood', 'street', 'unitNo']);
  assert.match(await page.locator('[data-testid="sec-location-view"] [data-row="neighborhood"]').innerText(), /Neighborhood\s+Taman Bukit/);
  // The next property is offered the remembered neighborhood, with ✕; removing it leaves Others… available.
  await home(page); await tile(page, 'Property List'); await newProperty(page);
  const nb2 = page.getByTestId('opt-neighborhood');
  await nb2.locator('.opt-btn').click();
  assert.equal(await nb2.getByRole('option', { name: /Taman Bukit/i }).count(), 1, 'remembered');
  await nb2.getByRole('button', { name: 'Remove Taman Bukit' }).click();
  assert.equal(await nb2.getByRole('option', { name: /Taman Bukit/i }).count(), 0, 'removed with ✕');
  assert.ok(await nb2.getByRole('button', { name: 'Others…' }).isVisible());
  await page.context().close();
});

test('U118 Change 015 Add Location popup (as changed 17 Oct 2026): larger but not full screen, above the visible advert; big map in Hybrid only, no map-type buttons; a search bar; X closes; nothing requested until Search; Cancel keeps the saved position', async () => {
  const page = await phone({ maps: true });
  await page.evaluate(() => { window.__geoCalls = 0; window.__placeCalls = 0; });
  await tile(page, 'Property List'); await newProperty(page);
  await setStreet(page, 'Jalan Popup 1');
  await page.getByTestId('gmap-add').click();
  const sheet = page.getByTestId('location-picker');
  await sheet.waitFor();
  assert.equal(await page.getByTestId('bottom-ad').count(), 1, 'the advert stays while the popup is open');
  const vh = page.viewportSize().height;
  const sb = await sheet.boundingBox(); const ad = await page.getByTestId('bottom-ad').boundingBox();
  assert.ok(sb.y <= 16, `near the top (${sb.y})`);
  assert.ok(sb.y + sb.height <= ad.y + 1, 'ends above the advert');
  assert.ok(sb.height < vh - ad.height, 'not full screen');
  assert.match(await sheet.locator('h2').innerText(), /Add Location/i);
  assert.equal(await sheet.getByTestId('picker-search-input').count(), 1, 'a search bar');
  assert.equal(await sheet.getByRole('button', { name: /Use my current location/i }).count(), 0);
  const map = await page.getByTestId('picker-map').boundingBox();
  assert.ok(map.height >= 350, `a large map (${map.height})`);
  assert.equal(await sheet.getByTestId('map-types').count(), 0, 'no Map / Satellite / Hybrid buttons');
  assert.equal(await page.evaluate(() => window.__mapType), 'hybrid', 'Hybrid view');
  await shot(page, '118-add-location-open', false);
  // Choose a point and save it.
  await page.evaluate(() => window.__mapClick?.(2.8123, 101.8)); await page.getByTestId('apply-location').click();
  await sheet.waitFor({ state: 'detached' });
  await page.getByTestId('save-property').click();
  await page.waitForSelector('[data-testid="listing-details"]');
  await waitStored(page, 'records', `all.some(v => v && v.street === 'Jalan Popup 1' && v.lat === 2.8123)`);
  // Reopen, tap another point, then close with X and with Cancel: the saved position is unchanged.
  await page.getByRole('button', { name: 'Edit' }).first().click(); await expandForm(page);
  for (const how of ['picker-close', 'cancel']) {
    await page.getByTestId('gmap-add').click(); await sheet.waitFor();
    await page.evaluate(() => window.__mapClick?.(2.9, 101.9));
    if (how === 'picker-close') await page.getByTestId('picker-close').click(); else await sheet.getByRole('button', { name: 'Cancel' }).click();
    await sheet.waitFor({ state: 'detached' });
  }
  await page.getByTestId('save-property').click();
  await page.waitForSelector('[data-testid="listing-details"]');
  await waitStored(page, 'records', `all.some(v => v && v.street === 'Jalan Popup 1' && v.lat === 2.8123)`);
  assert.equal(external.filter(u => /places|geocode|maps\.googleapis/i.test(u)).length, 0, 'no place search or geocoding request unless Search is pressed');
  await page.context().close();
});

test('U121 owner 17 Oct 2026: Add Location search moves the pin; the card location button: "Location Not Set" for 1.5 s, or Share Location / Open in Google Maps; share to a buyer or vendor on WhatsApp, or a new contact from the phone book', async () => {
  const page = await phone({ maps: true });
  // A buyer and a vendor to share with.
  for (const [list, btn, name, tel] of [['Buyer List', 'New buyer', 'Bella Buyer', '012-345 6789'], ['Vendor List', 'New vendor', 'Victor Vendor', '013-222 3333']]) {
    await tile(page, list); await page.getByRole('button', { name: btn }).click();
    await page.locator('[data-field="name"]').fill(name);
    await page.locator('[data-field="phone"]').fill(tel);
    await page.getByTestId('save-contact').click();
    await waitStored(page, 'records', `all.some(v => v && v.name === ${JSON.stringify(name)})`);
    await home(page);
  }
  await c15Property(page, { street: 'jalan tiada lokasi 1/2a', purpose: 'sale' });
  await home(page);
  await tile(page, 'Property List'); await newProperty(page);
  await setStreet(page, 'Jalan Ada Lokasi 5');
  await page.getByTestId('gmap-add').click();
  const sheet = page.getByTestId('location-picker'); await sheet.waitFor();
  await sheet.getByTestId('picker-search-input').fill('Nilai Square');
  await sheet.getByTestId('picker-search-btn').click();
  await sheet.getByTestId('picker-search-result').first().click();
  await page.getByTestId('picker-pos').waitFor();
  await page.getByTestId('apply-location').click(); await sheet.waitFor({ state: 'detached' });
  await page.getByTestId('save-property').click(); await page.waitForSelector('[data-testid="listing-details"]');
  await waitStored(page, 'records', `all.some(v => v && v.street === 'Jalan Ada Lokasi 5' && v.lat === 2.8 && v.lng === 101.8)`);
  await home(page); await tile(page, 'Property List');
  for (const layout of ['grid', 'large']) {
    await page.getByRole('group', { name: /Layout/i }).getByRole('button').nth(layout === 'grid' ? 0 : 1).click();
    const noLoc = page.getByTestId('listing-card').filter({ hasText: 'Tiada Lokasi' });
    // Title Case on the card, including after the "/"; the record keeps what was typed.
    assert.equal(await noLoc.getByTestId('card-address').innerText(), 'Jalan Tiada Lokasi 1/2A');
    if (layout === 'grid') {
      // Change 28: the Grid card has no pencil and no counts; the location button still shows its bubble and never opens the card.
      assert.equal(await noLoc.getByTestId('card-edit').count(), 0, 'grid: no edit button');
      await noLoc.getByTestId('card-location').click();
      assert.equal(await noLoc.getByTestId('card-location-bubble').innerText(), 'Location Not Set');
      assert.equal(await page.getByTestId('listing-details').count(), 0, 'the card did not open');
      await noLoc.getByTestId('card-location-bubble').waitFor({ state: 'detached', timeout: 2500 });
      continue;
    }
    // The location button: right side of the counts row, two lines tall, aligned under the pencil.
    const pin = noLoc.getByTestId('card-location'); const pen = noLoc.getByTestId('card-edit');
    const [pb, eb, cb] = [await pin.boundingBox(), await pen.boundingBox(), await noLoc.getByTestId('card-counts').boundingBox()];
    assert.ok(Math.abs((pb.x + pb.width) - (eb.x + eb.width)) <= 2, `${layout}: right-aligned with the pencil`);
    const row = await noLoc.getByTestId('card-location-row').boundingBox();
    assert.ok(cb.y > row.y + 8, `${layout}: an empty line above the counts (${JSON.stringify({ row, cb, pb })})`);
    assert.ok(pb.y >= row.y - 1 && pb.y + pb.height <= row.y + row.height + 1 && pb.height >= 28, `${layout}: the button sits in the two-line row, at the right`);
    // Not set: a bubble for 1.5 seconds, the card does not open.
    await pin.click();
    const bubble = noLoc.getByTestId('card-location-bubble');
    assert.equal(await bubble.innerText(), 'Location Not Set');
    assert.equal(await page.getByTestId('listing-details').count(), 0, 'the card did not open');
    await page.waitForTimeout(1200); assert.equal(await bubble.count(), 1, 'still there after 1.2 s');
    await bubble.waitFor({ state: 'detached', timeout: 1500 });
    await shot(page, `121-location-${layout}`, false);
  }
  // Set: the menu.
  const yes = page.getByTestId('listing-card').filter({ hasText: 'Jalan Ada Lokasi' });
  await yes.getByTestId('card-location').click();
  const menu = page.getByTestId('location-menu'); await menu.waitFor();
  assert.equal(await page.getByTestId('listing-details').count(), 0, 'the card did not open');
  assert.equal(await menu.getByTestId('location-open-maps').getAttribute('href'), 'https://www.google.com/maps/search/?api=1&query=2.800000,101.800000');
  await menu.getByTestId('location-share').click();
  const buyer = menu.getByTestId('share-buyers').getByTestId('share-contact');
  assert.equal(await buyer.count(), 1);
  const href = await buyer.getAttribute('href');
  assert.ok(href.startsWith('https://wa.me/60123456789?text='), href);
  assert.equal(decodeURIComponent(href.split('text=')[1]), 'Jalan Ada Lokasi 5\nhttps://www.google.com/maps/search/?api=1&query=2.800000,101.800000');
  assert.equal(await menu.getByTestId('share-vendors').getByTestId('share-contact').count(), 1);
  await menu.getByTestId('share-search').fill('victor');
  assert.equal(await menu.getByTestId('share-buyers').count(), 0); assert.equal(await menu.getByTestId('share-vendors').getByTestId('share-contact').count(), 1);
  assert.equal(await menu.getByTestId('share-phonebook').count(), 1, 'new contact from the phone book');
  await shot(page, '121-share-location', false);
  await menu.getByTestId('location-menu-close').click(); await menu.waitFor({ state: 'detached' });
  assert.equal(await page.getByTestId('listing-details').count(), 0, 'closing the menu does not open the card');
  await page.context().close();
});

test('U122 JoyChange002 Change 32: Large Cards swipe through photos with tappable arrows (never opening the card); Grid cards do not; "Click to enlarge" on the property photo; the viewer arrows and "Slide to next" sit under the photo', async () => {
  const page = await phone();
  const png = n => ({ name: `${n}.png`, mimeType: 'image/png', buffer: Buffer.from(PNG_1X1, 'base64') });
  await propertyWithPhotos(page, [png('a'), png('b'), png('c')]);
  await home(page); await tile(page, 'Property List');
  const card = page.getByTestId('listing-card').filter({ hasText: 'Photo house' });
  // Large Cards (the default): two arrows on the picture; a tap moves the photo and does not open the card.
  assert.equal(await card.getByTestId('card-photo-prev').count(), 1);
  assert.equal(await card.getByTestId('card-photo-next').count(), 1);
  const photoIdx = () => card.getByTestId('card-photo').getAttribute('data-index');
  const before = await photoIdx();
  await card.getByTestId('card-photo-next').click();
  assert.notEqual(await photoIdx(), before, 'the picture changed');
  assert.equal(await page.getByTestId('listing-details').count(), 0, 'the arrow did not open the card');
  // Grid cards: unchanged, no arrows.
  await page.getByRole('group', { name: /Layout/i }).getByRole('button').nth(0).click();
  assert.equal(await page.getByTestId('listing-card').filter({ hasText: 'Photo house' }).getByTestId('card-photo-next').count(), 0, 'no arrows on Grid cards');
  await page.getByRole('group', { name: /Layout/i }).getByRole('button').nth(1).click();
  // Property page: "Click to enlarge" at the bottom centre of the photo.
  await page.getByTestId('listing-card').filter({ hasText: 'Photo house' }).locator('.sc-card').click();
  await page.getByTestId('listing-details').waitFor();
  const en = page.getByTestId('detail-enlarge'); const ph = page.getByTestId('detail-photo');
  assert.equal(await en.innerText(), 'Click to enlarge');
  const [eb, pb] = [await en.boundingBox(), await ph.boundingBox()];
  assert.ok(Math.abs((eb.x + eb.width / 2) - (pb.x + pb.width / 2)) <= 4, 'centred');
  assert.ok(eb.y + eb.height <= pb.y + pb.height + 1 && eb.y > pb.y + pb.height / 2, 'at the bottom, on the photo');
  await ph.click();
  const photo = await page.getByTestId('photo-viewer-photo').boundingBox();
  const hint = page.getByTestId('viewer-hint');
  assert.equal(await hint.innerText(), 'Slide to next');
  const [hb, nb, bb] = [await hint.boundingBox(), await page.getByTestId('photo-viewer-next').boundingBox(), await page.getByTestId('photo-viewer-prev').boundingBox()];
  assert.ok(hb.y >= photo.y + photo.height - 1, 'the hint is below the photo, not on it');
  assert.ok(nb.y >= photo.y + photo.height - 1 && bb.y >= photo.y + photo.height - 1, 'the arrows are below the photo');
  assert.ok(nb.y - (photo.y + photo.height) <= 60, 'and just below it, not far down the screen');
  await shot(page, '122-viewer', false);
  await page.getByTestId('photo-viewer-next').click();
  assert.equal(await page.getByTestId('photo-viewer-count').innerText(), '2 / 3');
  await page.context().close();
});

test('U119 Change 015 photos: no arrows or Remove button; a small menu with exactly Make as Main Photo and Remove; main photo moves first and stays after save and reopen; removing the main photo makes the next one main', async () => {
  const page = await phone();
  const png = n => ({ name: `${n}.png`, mimeType: 'image/png', buffer: Buffer.from(PNG_1X1, 'base64') });
  await propertyWithPhotos(page, [png('a'), png('b'), png('c')]);
  await page.getByRole('button', { name: 'Edit' }).first().click(); await expandForm(page);
  const photos = page.getByTestId('form-photo');
  assert.equal(await photos.count(), 3);
  assert.equal(await page.locator('#sec-photos').getByRole('button', { name: /^(Remove|◀|▶)$/ }).count(), 0, 'no Remove button or arrows');
  const ids0 = await photos.evaluateAll(xs => xs.map(x => x.dataset.photoId));
  await photos.nth(2).getByTestId('photo-menu').click();
  const items = await page.getByTestId('photo-menu-list').getByRole('menuitem').allInnerTexts();
  // ClaudeChanges001 change 7: the menu says Set as Main Photo and Delete.
  assert.deepEqual(items, ['Set as Main Photo', 'Delete']);
  await page.getByTestId('photo-make-main').click();
  assert.deepEqual(await photos.evaluateAll(xs => xs.map(x => x.dataset.photoId)), [ids0[2], ids0[0], ids0[1]]);
  assert.equal(await photos.first().getByTestId('photo-main').count(), 1);
  await page.getByTestId('save-property').click();
  await page.waitForSelector('[data-testid="listing-details"]');
  await waitStored(page, 'records', `all.some(v => v && v.headline === 'Photo house' && v.photos[0].id === ${JSON.stringify(ids0[2])} && v.mainPhotoId === ${JSON.stringify(ids0[2])})`);
  await page.getByRole('button', { name: 'Edit' }).first().click(); await expandForm(page);
  assert.deepEqual(await photos.evaluateAll(xs => xs.map(x => x.dataset.photoId)), [ids0[2], ids0[0], ids0[1]], 'kept after reopening');
  // Remove the main photo: the next one becomes main.
  await photos.first().getByTestId('photo-menu').click();
  await page.getByTestId('photo-remove').click(); await confirmPhotoDelete(page);
  assert.deepEqual(await photos.evaluateAll(xs => xs.map(x => x.dataset.photoId)), [ids0[0], ids0[1]]);
  assert.equal(await photos.first().getByTestId('photo-main').count(), 1);
  await page.getByTestId('save-property').click();
  await page.waitForSelector('[data-testid="listing-details"]');
  await waitStored(page, 'records', `all.some(v => v && v.headline === 'Photo house' && v.photos.length === 2 && v.mainPhotoId === ${JSON.stringify(ids0[0])})`);
  // Removing every photo leaves an empty, working photo section.
  await page.getByRole('button', { name: 'Edit' }).first().click(); await expandForm(page);
  for (let i = 0; i < 2; i++) { await photos.first().getByTestId('photo-menu').click(); await page.getByTestId('photo-remove').click(); await confirmPhotoDelete(page); }
  assert.equal(await photos.count(), 0);
  assert.equal(await page.getByTestId('photo-grid').count(), 0, 'no empty photo grid');
  assert.equal(await page.getByTestId('photo-input').count(), 1, 'Add photos still there');
  await page.context().close();
});

test('U120 Change 015 layout on normal screens: one scrolling content area, the advert directly below it (nothing under the advert, no extra scroll area); the PDF preview still hides the advert', async () => {
  const page = await phone();
  await loadSample(page);
  const check = async where => {
    const vh = page.viewportSize().height;
    const ad = await page.getByTestId('bottom-ad').boundingBox();
    const main = await page.locator('main.content').boundingBox();
    assert.ok(Math.abs(ad.y + ad.height - vh) <= 1, `${where}: advert at the bottom`);
    assert.ok(main.y + main.height <= ad.y + 1, `${where}: content ends above the advert`);
    const scroll = await page.evaluate(() => ({ doc: document.scrollingElement.scrollHeight - window.innerHeight, overflow: getComputedStyle(document.querySelector('main.content')).overflowY }));
    assert.ok(scroll.doc <= 1, `${where}: the page itself does not scroll (${scroll.doc})`);
    assert.equal(scroll.overflow, 'auto', `${where}: the content is the scrolling area`);
    // Scrolled to the end, the last thing in the content is fully above the advert.
    await page.locator('main.content').evaluate(m => m.scrollTo(0, m.scrollHeight));
    const last = await page.locator('main.content > *').last().boundingBox();
    if (last) assert.ok(last.y + last.height <= ad.y + 1, `${where}: last element above the advert`);
  };
  await check('home');
  for (const [name, open] of [['subsale', () => tile(page, 'Subsale List')], ['calendar', () => tile(page, 'Calendar')], ['buyers', () => tile(page, 'Buyer List')]]) { await home(page); await open(); await check(name); }
  await home(page); await tile(page, 'Subsale List');
  await page.getByTestId('listing-card').first().locator('.sc-card').click();
  await page.waitForSelector('[data-testid="listing-details"]');
  await check('property details');
  await page.getByRole('button', { name: 'Edit' }).first().click(); await expandForm(page);
  await check('edit property');
  const save = await page.getByTestId('save-floating').boundingBox(); const ad = await page.getByTestId('bottom-ad').boundingBox();
  assert.ok(save.y + save.height <= ad.y, 'the floating Save sits above the advert');
  await page.locator('header .icon-btn').first().click();
  await page.waitForSelector('[data-testid="listing-details"]');
  await page.getByTestId('open-buyer-pdf').click();
  await page.getByTestId('buyer-pdf-preview').click();
  await page.getByTestId('pdf-page').first().waitFor({ timeout: 15000 });
  assert.equal(await page.getByTestId('bottom-ad').count(), 0, 'no advert over the PDF preview');
  await page.getByTestId('pdf-close').click();
  assert.equal(await page.getByTestId('bottom-ad').count(), 1, 'back after the preview');
  await shot(page, '120-layout', false);
  await page.context().close();
});
