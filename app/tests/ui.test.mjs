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
  if (name === 'Buyer List' || name === 'Vendor List') {
    await page.locator('nav.grid > button', { hasText: 'Contacts' }).first().click();
    await page.getByTestId(name === 'Buyer List' ? 'hub-buyers' : 'hub-vendors').click();
    return;
  }
  await page.locator('nav.grid > button', { hasText: name }).first().click();
}
/** Opens every section of the property form (they start closed). */
async function expandForm(page) {
  await page.waitForSelector('[data-testid="listing-form"]');
  if ((await page.getByTestId('toggle-all').innerText()).match(/Open|Buka|展开/)) await page.getByTestId('toggle-all').click();
}
async function newProperty(page) { await page.locator('.add-property').click(); await expandForm(page); }
async function home(page) { while (await page.locator('header button[aria-label="Back"], header button[aria-label="Kembali"], header button[aria-label="返回"]').count()) await page.locator('header .icon-btn').first().click(); }
async function loadSample(page) {
  await tile(page, 'Agent Profile');
  await page.getByRole('button', { name: /Settings/ }).click();
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

test('U1 dashboard: Estate Agent AI Buddy, the approved 15 cards in 3 × 5 (Subsale, Project, Market Intelligence Coming Soon; Voice Command = 15), Notifications and Co-broke (Coming Soon) at the top', async () => {
  const page = await phone();
  assert.equal(await page.locator('h1').getAttribute('aria-label'), 'Estate Agent AI Buddy');
  assert.equal(await page.title(), 'Estate Agent AI Buddy');
  const names = await page.locator('nav.grid > button').evaluateAll(bs => bs.map(b => b.getAttribute('aria-label')));
  // Owner, 13 Oct 2026 (approved arrangement): Settings lives inside Agent Profile, News inside Notifications.
  assert.deepEqual(names, ['To-Do', 'Calendar', 'Opportunities', 'Property List', 'Contacts', 'Inquiries & Viewings', 'GPS Assistance',
    'Agent Financial', 'Property Calculator', 'Agent Profile', 'Ask Expert', 'Subsale (Coming Soon)',
    'Project (Coming Soon)', 'Market Intelligence (Coming Soon)', 'Voice Command']);
  assert.equal(names.indexOf('Voice Command') + 1, 15, 'Voice Command is card 15');
  for (const gone of ['Buyer List', 'Vendor List', 'News', 'Settings', 'Co-broke']) assert.ok(!names.includes(gone), `no ${gone} card`);
  assert.equal(await page.locator('nav.grid > button.voice-tile').getAttribute('data-tile'), '15', 'the bright-gold Voice Command card is number 15');
  // Top bar: Co-broke Opportunities (Coming Soon) and Notifications (the old Big News button).
  assert.equal(await page.getByTestId('top-cobroke').getAttribute('aria-label'), 'Co-broke Opportunities (Coming Soon)');
  assert.equal(await page.getByTestId('top-notifications').getAttribute('aria-label'), 'Notifications');
  assert.equal(await page.getByText('BIG NEWS').count(), 0);
  await page.getByTestId('top-notifications').click();
  await page.getByTestId('notifications').waitFor();
  await home(page);
  await page.getByTestId('top-cobroke').click();
  assert.match(await page.getByTestId('cobroke-soon').innerText(), /Coming Soon/);
  await home(page);
  await tile(page, 'Market Intelligence');
  assert.match(await page.getByTestId('soon-market').innerText(), /Coming Soon[\s\S]*lawful and reliable source[\s\S]*Nothing here is live/, 'Market Intelligence is honest: no feed is pretended');
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
  assert.equal(await page.getByTestId('voice-fill').count(), 1, 'the form is filled by voice instead');
  const js = await (await fetch(`${base}main.js`)).text();
  assert.ok(!/pdfjs|GlobalWorkerOptions|word\/document\.xml/.test(js), 'no PDF or Word reading code in the app');
  await page.context().close();
});

test('U3 Property List: Grid first and default, Large cards second, references hidden on cards, choice remembered', async () => {
  const page = await phone();
  await tile(page, 'Property List');
  assert.ok(await page.getByTestId('listing-empty').isVisible(), 'starts empty: no invented records');
  await home(page);
  await loadSample(page);
  await tile(page, 'Property List');
  const seg = page.locator('.lc-tools .seg button');
  assert.deepEqual(await seg.evaluateAll(b => b.map(x => x.getAttribute('aria-label'))), ['Grid', 'Large cards']);
  assert.equal(await seg.first().getAttribute('aria-pressed'), 'true', 'Grid is the default');
  assert.equal(await page.locator('ul[data-layout="grid"] > li').count(), 10);
  const cardsText = await page.locator('ul[data-layout="grid"]').innerText();
  assert.ok(!/P10\d\d/.test(cardsText), 'no reference numbers on grid cards');
  const cols = await page.locator('ul[data-layout="grid"] > li').evaluateAll(li => new Set(li.slice(0, 3).map(x => Math.round(x.getBoundingClientRect().top))).size);
  assert.equal(cols, 1, 'three cards per row');
  assert.ok(await page.getByRole('button', { name: 'Add New Property' }).first().isVisible());
  await shot(page, '02a-list-grid');
  await seg.nth(1).click();
  assert.equal(await page.locator('ul[data-layout="large"] > li').count(), 10);
  assert.ok(!/P10\d\d/.test(await page.locator('ul[data-layout="large"]').innerText()), 'no reference numbers on large cards');
  await shot(page, '02b-list-large');
  await page.reload(); await page.waitForSelector('nav.grid');
  await tile(page, 'Property List');
  assert.equal(await page.locator('ul[data-layout="large"]').count(), 1, 'layout choice kept after reopening');
  await page.getByTestId('listing-card').first().getByRole('button', { name: /Open/ }).click();
  assert.match(await page.getByTestId('ref-row').innerText(), /P10\d\d/, 'the detail page shows the reference');
  await page.context().close();
});

test('U4 saved data is permanent: a new property is still there after closing and reopening', async () => {
  const page = await phone();
  await tile(page, 'Property List');
  await page.getByRole('button', { name: 'Add New Property' }).first().click(); await expandForm(page);
  await page.locator('[data-field="headline"]').fill('Persistence test house');
  await page.locator('[data-field="askingPrice"]').fill('450000');
  await page.getByTestId('save-property').click();
  await page.waitForSelector('[data-testid="listing-details"]');
  await page.reload(); await page.waitForSelector('nav.grid');
  await tile(page, 'Property List');
  assert.equal(await page.getByTestId('listing-card').count(), 1);
  assert.ok(await page.getByText('Persistence test house').first().isVisible());
  await page.context().close();
});

test('U5 references: prefix + unique number, Others remembered and deletable, built-ins fixed, duplicates refused', async () => {
  const page = await phone();
  await loadSample(page);
  await tile(page, 'Property List');
  await page.getByRole('button', { name: 'Add New Property' }).first().click(); await expandForm(page);
  assert.equal(await page.getByTestId('ref-preview').innerText(), 'Reference: P1011', 'P1010 exists → P1011');
  // a number already used by another property, whatever the prefix
  await page.locator('[data-field="refNo"]').fill('1004');
  assert.match(await page.getByTestId('ref-error').innerText(), /already.*1011/);
  await page.getByRole('button', { name: 'Use 1011' }).click();
  // custom prefix through Others
  await page.getByTestId('ref-prefix').locator('.opt-btn').click();
  const list = page.getByTestId('ref-prefix').locator('.opt-list');
  assert.equal(await list.locator('.opt-x').count(), 0, 'built-in prefixes cannot be deleted');
  await list.getByRole('button', { name: 'Others…' }).click();
  await list.locator('input').fill('kl');
  await list.getByRole('button', { name: 'Add' }).click();
  assert.equal(await page.getByTestId('ref-preview').innerText(), 'Reference: KL1011');
  await page.locator('[data-field="headline"]').fill('KL test');
  await page.getByTestId('save-property').click();
  await page.waitForSelector('[data-testid="listing-details"]');
  assert.match(await page.getByTestId('ref-row').innerText(), /KL1011/);
  // next new property: KL is the default and on top of the list
  await home(page); await tile(page, 'Property List');
  await page.getByRole('button', { name: 'Add New Property' }).first().click(); await expandForm(page);
  assert.equal(await page.getByTestId('ref-preview').innerText(), 'Reference: KL1012');
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
  assert.ok(n >= 14, `${n} section cards`);
  for (let i = 0; i < n; i++) assert.equal(await sections.nth(i).locator('.sec-foot .edit-mini').count(), 1, `section ${i} has an Edit button`);
  const pos = await page.locator('.sec-card .edit-mini').first().evaluate(b => { const r = b.getBoundingClientRect(), c = b.closest('.sec-card').getBoundingClientRect(); return { right: c.right - r.right, bottom: c.bottom - r.bottom }; });
  assert.ok(pos.right < 20 && pos.bottom < 20, 'Edit sits at the bottom right of its card');
  await shot(page, '04a-detail');
  await page.getByRole('button', { name: 'Edit: Tenure & Title' }).click();
  await page.waitForSelector('#sec-tenure');
  const top = await page.locator('#sec-tenure').evaluate(el => el.getBoundingClientRect().top);
  assert.ok(top >= -2 && top < 200, `the form opened at Tenure & Title (top ${top})`);
  const order = await page.locator('[data-testid="listing-form"] > .card[id]').evaluateAll(cs => cs.map(c => c.id));
  assert.deepEqual(order.slice(0, 4), ['sec-basics', 'sec-tenure', 'sec-photos', 'sec-location']);
  assert.equal(order[order.length - 1], 'sec-docs', 'Documents at the end');
  await shot(page, '04b-form-at-tenure', false);
  await page.context().close();
});

test('U7 dropdowns with Others: remembered for every property, removable with X, built-ins kept', async () => {
  const page = await phone();
  await tile(page, 'Property List');
  await page.getByRole('button', { name: 'Add New Property' }).first().click(); await expandForm(page);
  assert.match(await page.getByTestId('opt-country').innerText(), /Malaysia/, 'Malaysia is the default country');
  const labels = await page.locator('#sec-location .ff > span:first-child, #sec-location label.ff').evaluateAll(xs => xs.map(x => x.textContent.trim()));
  const want = ['Country', 'State', 'City / town', 'Township', 'Lot number', 'Jalan / street (number or name)'];
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
  assert.equal(await t2.getByRole('option', { name: /Taman Sri Pajam/ }).count(), 1, 'remembered');
  assert.equal(await t2.getByRole('button', { name: 'Remove Taman Sri Pajam' }).count(), 1, 'custom value has X');
  assert.equal(await t2.getByRole('button', { name: /^Remove Putra Nilai/ }).count(), 0, 'built-in values have no X');
  await t2.getByRole('button', { name: 'Remove Taman Sri Pajam' }).click();
  assert.equal(await t2.getByRole('option', { name: /Taman Sri Pajam/ }).count(), 0);
  assert.ok(await t2.getByRole('button', { name: 'Others…' }).isVisible(), 'Others stays available');
  await page.context().close();
});

test('U8 Add from Google Map: minor differences use saved values; real differences ask; new values saved only after confirming', async () => {
  const page = await phone({ maps: true });
  await tile(page, 'Property List');
  await page.getByRole('button', { name: 'Add New Property' }).first().click(); await expandForm(page);
  // the property already has a township typed by the agent
  const town = page.getByTestId('opt-township');
  await town.locator('.opt-btn').click();
  await town.getByRole('button', { name: 'Others…' }).click();
  await town.locator('.opt-new input').fill('Taman Desa Nilai');
  await town.getByRole('button', { name: 'Add' }).click();
  await page.getByTestId('gmap-add').click();
  await page.waitForSelector('[data-testid="picker-map"]');
  await page.evaluate(() => { window.__geocode = { street: 'Jln BBN 3/1', township: 'Tmn. Desa Nilai', city: 'NILAI', state: 'N. Sembilan' }; window.__mapClick(2.8123, 101.7956); });
  await page.waitForSelector('[data-testid="geo-result"]');
  assert.match(await page.getByTestId('ok-township').innerText(), /Taman Desa Nilai/, '"Tmn. Desa Nilai" is the saved "Taman Desa Nilai"');
  assert.match(await page.getByTestId('ok-city').innerText(), /Nilai/);
  assert.match(await page.getByTestId('ok-state').innerText(), /Negeri Sembilan/);
  assert.equal(await page.getByTestId('discrepancies').count(), 0);
  await page.getByTestId('apply-location').click();
  assert.match(await page.getByTestId('pos-text').innerText(), /2\.81230, 101\.79560 \(from Google Maps\)/);
  // a real difference: the agent chooses
  await page.getByTestId('gmap-add').click();
  await page.evaluate(() => { window.__geocode = { street: 'Jalan Seriemas 2', township: 'Kota Seriemas Utama', city: 'Nilai', state: 'Negeri Sembilan' }; window.__mapClick(2.80, 101.79); });
  await page.waitForSelector('[data-testid="diff-township"]');
  const diff = page.getByTestId('diff-township');
  for (const b of ['Use existing', 'Add new', 'Enter another']) assert.ok(await diff.getByRole('button', { name: b }).isVisible(), b);
  assert.equal(await page.getByTestId('apply-location').isDisabled(), true, 'cannot apply until the difference is decided');
  await shot(page, '05-google-discrepancy');
  // cancelling saves nothing
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await page.getByTestId('opt-township').locator('.opt-btn').click();
  assert.equal(await page.getByTestId('opt-township').getByRole('option', { name: /Kota Seriemas Utama/ }).count(), 0, 'nothing saved without confirmation');
  await page.getByTestId('opt-township').locator('.opt-btn').click();
  // add new after confirming
  await page.getByTestId('gmap-add').click();
  await page.evaluate(() => window.__mapClick(2.80, 101.79));
  await page.waitForSelector('[data-testid="diff-township"]');
  await page.getByTestId('diff-township').getByRole('button', { name: 'Add new' }).click();
  if (await page.getByTestId('diff-street').count()) await page.getByTestId('diff-street').getByRole('button', { name: 'Add new' }).click();
  await page.getByTestId('apply-location').click();
  assert.match(await page.getByTestId('opt-township').innerText(), /Kota Seriemas Utama/);
  await page.getByTestId('opt-township').locator('.opt-btn').click();
  assert.equal(await page.getByTestId('opt-township').getByRole('option', { name: /Kota Seriemas Utama/ }).count(), 1, 'saved after the agent chose Add new');
  await page.context().close();
});

test('U9 inquiries and viewings are separate; Convert to Viewing moves it as Pending Viewing, then Viewed', async () => {
  const page = await phone();
  await loadSample(page);
  await tile(page, 'Property List');
  await page.getByText('Renovated 2-storey terrace, Bandar Baru Nilai').first().click();
  const inq = page.getByTestId('inquiry-history');
  const view = page.getByTestId('viewing-history');
  assert.equal(await inq.getByTestId('inquiry-item').count(), 1);
  assert.equal(await view.getByTestId('viewing-item').count(), 0);
  await inq.getByRole('button', { name: 'Convert to Viewing' }).click();
  assert.equal(await inq.getByTestId('inquiry-item').count(), 0, 'removed from Inquiry History');
  assert.equal(await view.getByTestId('viewing-item').count(), 1);
  assert.equal(await view.getByTestId('viewing-status').innerText(), 'Pending Viewing');
  assert.match(await view.innerText(), /From inquiry on/);
  await view.getByRole('button', { name: 'Mark as viewed' }).click();
  assert.equal(await view.getByTestId('viewing-status').innerText(), 'Viewed');
  // a direct viewing without an inquiry
  await view.getByRole('button', { name: '+ Viewing' }).click();
  await page.locator('[data-field="date"]').fill('2026-12-01');
  await page.locator('[data-field="time"]').fill('10:30');
  await page.locator('[data-field="status"]').selectOption('scheduled');
  await page.getByTestId('save-appt').click();
  await page.waitForSelector('[data-testid="viewing-history"]');
  assert.equal(await page.getByTestId('viewing-history').getByTestId('viewing-item').count(), 2);
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
  await page.getByRole('radio', { name: /Warm/ }).click();
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
  await page.getByRole('tab', { name: /Upcoming/ }).click();
  const t = page.getByTestId('task').filter({ hasText: 'Prepare offer letter' });
  assert.match(await t.innerText(), /Urgent/);
  await t.getByRole('checkbox').click();
  await page.getByRole('tab', { name: /Completed/ }).click();
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
  await page.getByRole('tab', { name: /Upcoming/ }).click();
  assert.equal(await page.getByTestId('task').filter({ hasText: 'Follow up Buyer L' }).count(), 1);
  assert.match(await page.getByTestId('task').filter({ hasText: 'Follow up Buyer L' }).innerText(), /Follow-up/);
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
  await page.locator('[data-field="propertyId"]').selectOption({ index: 1 });
  await page.getByTestId('reminders').getByRole('button', { name: '15 min before' }).click();
  await page.getByTestId('save-appt').click();
  // the reminder check runs on opening the app
  await page.reload(); await page.waitForSelector('nav.grid');
  await page.waitForSelector('[data-testid="reminder-alerts"]');
  assert.match(await page.getByTestId('reminder-alerts').innerText(), /Meet owner at site/);
  await shot(page, '09a-reminder', false);
  await page.locator('.alert', { hasText: 'Meet owner at site' }).getByRole('button', { name: 'Dismiss' }).click();
  await page.reload(); await page.waitForSelector('nav.grid');
  await page.waitForTimeout(300);
  assert.equal(await page.locator('.alert', { hasText: 'Meet owner at site' }).count(), 0, 'a reminder is shown once');
  await tile(page, 'Calendar');
  if (ymd(soon) !== ymd(now)) await page.locator(`.cal-day[data-date="${ymd(soon)}"]`).click();
  const item = page.getByTestId('appt-item').filter({ hasText: 'Meet owner at site' });
  await item.getByRole('button', { name: 'Mark completed' }).click();
  assert.match(await item.innerText(), /Completed/);
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
  assert.match(dist, /^\d+ m$/);
  assert.ok(parseInt(dist) > 100, `travelled ${dist}`);
  await page.getByTestId('mark-here').click();
  await page.getByTestId('mark-sheet').locator('input').first().fill('For sale sign, corner lot');
  await page.getByTestId('save-found').click();
  assert.match(await page.getByTestId('journey-marks').innerText(), /For sale sign, corner lot/);
  assert.match(await page.getByTestId('journey-places').innerText(), /Tmn Desa Nilai|Nilai/, 'places passed through, from Google');
  await shot(page, '10b-house-shopping');
  await page.getByTestId('trk-stop').click();
  await page.waitForSelector('[data-testid="journey-detail"]');
  assert.match(await page.getByTestId('jd-distance').innerText(), /\d+ m/);
  // the saved journey and the found property are kept
  await page.reload(); await page.waitForSelector('nav.grid');
  await tile(page, 'GPS Assistance');
  await page.getByTestId('card-house-shopping').click();
  assert.equal(await page.getByTestId('journey-row').count(), 1, 'previous journeys can be reviewed');
  await home(page);
  await tile(page, 'GPS Assistance');
  await page.getByTestId('card-map').click();
  assert.match(await page.getByTestId('map-title').innerText(), /For sale sign, corner lot/);
  assert.match(await page.getByTestId('navigate').getAttribute('href'), /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=2\.82/);
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
  assert.match(await page.locator('main').innerText(), /No property has a saved map position yet/, 'sample properties have no invented positions');
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
  assert.match(await page.locator('main').innerText(), /42% of target/);
  await shot(page, '11-finance');
  await page.context().close();
});

test('U16 Property Calculator: pre-filled from the property, full breakdown, editable rates', async () => {
  const page = await phone();
  await loadSample(page);
  await tile(page, 'Property List');
  await page.getByText('Renovated 2-storey terrace, Bandar Baru Nilai').first().click();
  await page.getByRole('button', { name: 'Calculate' }).click();
  assert.match(await page.getByTestId('calc-from').innerText(), /P1004/);
  assert.equal(await page.locator('[data-field="price"]').inputValue(), '580,000');
  for (const id of ['out-down', 'out-loan', 'out-monthly', 'out-interest', 'out-repay', 'out-mot', 'out-loanstamp', 'out-spa-legal', 'out-loan-legal', 'out-cash'])
    assert.match(await page.getByTestId(id).innerText(), /^RM [\d,]+\.\d\d$/, id);
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
  assert.match(await page.getByRole('link', { name: 'WhatsApp' }).getAttribute('href'), /^https:\/\/wa\.me\/60322221111\?text=/);
  await page.getByRole('button', { name: 'Record the answer received' }).click();
  await page.locator('textarea').last().fill('Only with state consent; check the title restriction.');
  await page.getByTestId('save-answer').click();
  assert.match(await page.getByTestId('disclaimer').innerText(), /General guidance from Lawyer\. Not professional advice/);
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
  assert.match(await page.getByTestId('proposal').innerText(), /Encik Ahmad/);
  await page.getByRole('button', { name: 'Open in the form to review' }).click();
  await expandForm(page);
  assert.equal(await page.locator('[data-field="askingPrice"]').inputValue(), '580,000', 'RM shown with thousands separators');
  assert.match(await page.getByTestId('opt-township').innerText(), /Putra Nilai/);
  assert.equal(await page.locator('[data-field="ownerName"]').inputValue(), 'Encik Ahmad');
  assert.ok(await page.locator('.small-chip', { hasText: 'from your words' }).first().isVisible());
  await page.context().close();
});

test('U20 three languages: every main screen fits — no clipped, overlapping or sideways text', async () => {
  const page = await phone({ maps: true });
  await loadSample(page);
  const screens = [
    ['home', async () => {}],
    ['list', async () => { await page.locator('nav.grid > button').nth(3).click(); }],
    ['detail', async () => { await page.locator('nav.grid > button').nth(3).click(); await page.getByTestId('listing-card').first().click(); }],
    ['form', async () => { await page.locator('nav.grid > button').nth(3).click(); await newProperty(page); }],
    ['todo', async () => { await page.locator('nav.grid > button').nth(0).click(); }],
    ['calendar', async () => { await page.locator('nav.grid > button').nth(1).click(); }],
    ['buyers', async () => { await page.locator('nav.grid > button').nth(5).click(); }],
    ['gps', async () => { await page.locator('nav.grid > button').nth(6).click(); }],
    ['finance', async () => { await page.locator('nav.grid > button').nth(7).click(); }],
    ['calculator', async () => { await page.locator('nav.grid > button').nth(8).click(); }],
    ['profile', async () => { await page.locator('nav.grid > button').nth(9).click(); }],
    ['expert', async () => { await page.locator('nav.grid > button').nth(10).click(); }],
    ['voice', async () => { await page.locator('nav.grid > button').nth(11).click(); }],
    ['subsale', async () => { await page.locator('nav.grid > button').nth(12).click(); }],
    ['project', async () => { await page.locator('nav.grid > button').nth(13).click(); }],
    ['cobroke', async () => { await page.locator('nav.grid > button').nth(14).click(); }],
    ['banners', async () => { await page.locator('nav.grid > button').nth(6).click(); await page.getByTestId('card-banners').click(); }],
  ];
  const report = [];
  for (const lang of ['EN', 'BM', '中文']) {
    await page.locator('.lang button', { hasText: lang }).click();
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
  await page.locator('.lang button', { hasText: 'BM' }).click();
  assert.match(await page.locator('nav.grid').innerText(), /Kewangan Ejen[\s\S]*Kalkulator Hartanah[\s\S]*Arahan Suara/);
  await page.locator('.lang button', { hasText: '中文' }).click();
  assert.match(await page.locator('nav.grid').innerText(), /代理财务[\s\S]*房产计算器[\s\S]*语音指令/);
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
  for (const i of [-1, 0, 3, 5, 8]) {
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
    ['property form', async () => { await tile(page, 'Property List'); await newProperty(page); }, '[data-field="street"]'],
    ['property form dropdown', async () => { await tile(page, 'Property List'); await newProperty(page); }, '[data-field="purpose"]'],
    ['property form custom dropdown', async () => { await tile(page, 'Property List'); await newProperty(page); }, '.opt-btn'],
    ['property form money', async () => { await tile(page, 'Property List'); await newProperty(page); }, '[data-field="askingPrice"]'],
    ['contact form', async () => { await tile(page, 'Buyer List'); await page.getByRole('button', { name: 'New buyer' }).click(); }, '[data-field="name"]'],
    ['calculator', async () => { await tile(page, 'Property Calculator'); }, '[data-field="price"]'],
    ['to-do form', async () => { await tile(page, 'To-Do'); await page.getByRole('button', { name: /New to-do|Add/ }).first().click(); }, '[data-field="title"]'],
    ['agent profile', async () => { await tile(page, 'Agent Profile'); await page.getByRole('button', { name: /Edit/ }).first().click(); }, '[data-field="fullName"]'],
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
  await page.locator('[data-field="street"]').fill('Jalan Wang 1');
  await page.getByTestId('save-property').click();
  await page.waitForSelector('[data-testid="listing-details"]');
  const saved = await page.evaluate(() => new Promise(res => {
    const r = indexedDB.open('estate-agent-buddy'); r.onsuccess = () => { const q = r.result.transaction('records').objectStore('records').getAll(); q.onsuccess = () => res(q.result.filter(x => x && x.street === 'Jalan Wang 1').map(x => x.askingPrice)); };
  }));
  assert.deepEqual(saved, [588000], 'stored as a plain number');
  assert.match(await page.locator('main').innerText(), /RM 588,000/);
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

test('U25 Coming Soon: Subsale, Project and Co-broke (top bar) say so; Co-broke lists real co-broke properties only', async () => {
  const page = await phone();
  await tile(page, 'Subsale');
  assert.match(await page.getByTestId('soon-subsale').innerText(), /Coming Soon/);
  await home(page);
  await tile(page, 'Project');
  assert.match(await page.getByTestId('soon-project').innerText(), /Coming Soon/);
  await home(page); await page.getByTestId('top-cobroke').click();
  assert.match(await page.getByTestId('cobroke-soon').innerText(), /Coming Soon/, 'not pretending to be finished');
  assert.match(await page.getByTestId('cobroke-count').innerText(), /^0 co-broke/);
  await home(page); await loadSample(page);
  await page.getByTestId('top-cobroke').click();
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
  assert.match(await used.first().innerText(), /Used by P\d+/);
  assert.equal(await used.first().evaluate(el => getComputedStyle(el).color), 'rgb(255, 138, 122)', 'used numbers are red');
  assert.ok(await used.first().isDisabled(), 'used numbers cannot be chosen');
  // A used number cannot be picked even by a forced tap.
  await used.first().click({ force: true });
  assert.equal(await page.locator('[data-field="refNo"]').inputValue(), suggested);
  // Pick a free number further down.
  const free = list.locator('.ref-opt.free').nth(3);
  const no = await free.getAttribute('data-no');
  assert.match(await free.innerText(), /Available/);
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
  assert.deepEqual(await page.locator('.gps-home .big-card strong').allInnerTexts(), ['House Shopping', 'My Banner Location', 'My Property Map', 'Co-broke Opportunity Map']);
  assert.match(await page.getByTestId('card-cobroke-map').innerText(), /Coming Soon/);
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
  assert.match(await page.getByTestId('banner-pos-set').innerText(), /2\.82100, 101\.80400 · GPS ±7 m/);
  await page.locator('[data-field="bannerNote"]').fill('Gate, facing main road');
  await page.getByTestId('banner-save').click();
  const card = page.locator('[data-testid="banner-card"]', { hasText: title });
  assert.match(await card.locator('.banner-chip').innerText(), /Yes, placed/);
  assert.equal(await card.getByTestId('banner-up').count(), 1);
  assert.match(await card.getByTestId('banner-up').innerText(), /Gate, facing main road/);
  assert.match(await card.getByTestId('banner-navigate').getAttribute('href'), /2\.821/);
  // 2) A second banner placed by tapping the map.
  await card.getByTestId('banner-add').click();
  await page.evaluate(() => window.__mapClick(2.8301, 101.8102));
  assert.match(await page.getByTestId('banner-pos-set').innerText(), /2\.83010, 101\.81020 · map/);
  await page.getByTestId('banner-save').click();
  assert.equal(await card.getByTestId('banner-up').count(), 2);
  assert.match(await page.getByTestId('banner-map-count').innerText(), /2 banners on the map/);
  await shot(page, '27b-banner-location', false);
  // 3) Take both down: still Yes after the first, Removed after the last; both kept as history.
  await card.getByTestId('banner-takedown').first().click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Mark taken down' }).click();
  assert.match(await card.locator('.banner-chip').innerText(), /Yes, placed/);
  await card.getByTestId('banner-takedown').first().click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Mark taken down' }).click();
  assert.match(await card.locator('.banner-chip').innerText(), /Removed/);
  assert.equal(await card.getByTestId('banner-up').count(), 0);
  assert.equal(await card.getByTestId('banner-old').count(), 2, 'taken-down banners stay in the history');
  // 4) Status chosen by hand, and the filter.
  await card.locator('[data-field="bannerStatus"]').selectOption('not_allowed');
  await page.locator('[data-filter="not_allowed"]').click();
  assert.ok(await page.locator('[data-testid="banner-card"]', { hasText: title }).isVisible());
  assert.ok((await page.getByTestId('banner-card').allInnerTexts()).every(t => /Owner doesn’t allow/.test(t)));

  // Detail page shows the banner section; its Edit opens the form at Banner.
  await page.locator('[data-testid="banner-card"]', { hasText: title }).getByRole('button', { name: 'Open property' }).click();
  const sec = page.getByTestId('sec-banner-view');
  assert.match(await sec.innerText(), /Banner placed\?[\s\S]*Owner doesn’t allow/);
  await sec.getByRole('button', { name: /Edit/ }).click();
  assert.equal(await page.locator('#sec-banner').getAttribute('data-open'), 'yes', 'Edit opens the Banner section');
  assert.equal(await page.locator('#sec-location').getAttribute('data-open'), 'no', 'other sections start closed');
  await page.locator('#sec-banner [data-field="bannerStatus"]').selectOption('not_yet');
  // give the property a map position so it shows on My Property Map (open the closed Location section first)
  await page.locator('[data-sec="location"]').click();
  await page.locator('[data-field="lat"]').fill('2.82');
  await page.locator('[data-field="lng"]').fill('101.80');
  await page.getByTestId('save-property').click();
  assert.match(await page.getByTestId('sec-banner-view').innerText(), /Not yet/);
  await page.getByRole('button', { name: 'Show on map' }).click();
  assert.match(await page.getByTestId('map-banner').innerText(), /Banner placed\?[\s\S]*Not yet/);
  await page.getByTestId('map-banner').getByRole('button', { name: /Banner locations/ }).click();
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
      assert.match(body.code_verifier, /^[A-Za-z0-9_-]{43,}$/);
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
  await tile(page, 'Agent Profile'); await page.getByRole('button', { name: /Settings/ }).click();
  assert.ok(await page.getByTestId('account-not-set-up').isVisible());
  await page.getByLabel('Supabase project URL').fill(SB);
  await page.getByLabel('Supabase anon (public) key').fill('anon-public-key');
  await page.getByTestId('save-settings').click();
  // Set up and nobody signed in: the sign-in screen comes first.
  await page.getByTestId('login').waitFor();
  await shot(page, '28a-login', false);
  assert.match(await page.getByTestId('google-sign-in').innerText(), /Continue with Google/);
  // Cancelled at Google: nothing changes, clear message.
  mode = 'cancel';
  await page.getByTestId('google-sign-in').click();
  await page.getByTestId('login-error').waitFor();
  assert.match(await page.getByTestId('login-error').innerText(), /cancelled or not allowed/);
  assert.equal(new URL(page.url()).search, '', 'the address is cleaned');
  // Signed in at Google: back in the app, with the team role from the database.
  mode = 'ok';
  await page.getByTestId('google-sign-in').click();
  await page.waitForSelector('nav.grid');
  assert.equal(new URL(page.url()).search, '', 'the code is not left in the address');
  await tile(page, 'Agent Profile'); await page.getByRole('button', { name: /Settings/ }).click();
  assert.match(await page.getByTestId('signed-in-as').innerText(), /Agent J \(agent\.j@gmail\.com\)/);
  assert.match(await page.getByTestId('workspace-role').innerText(), /Agent J team · Owner/);
  await page.getByTestId('team').getByTestId('member').nth(1).waitFor();
  assert.equal(await page.getByTestId('member').count(), 2);
  await page.locator('[data-field="inviteEmail"]').fill('new.agent@gmail.com');
  await page.locator('[data-field="inviteRole"]').selectOption('team_leader');
  await page.getByRole('button', { name: 'Add invitation' }).click();
  await page.getByText('Saved.').first().waitFor();
  assert.ok(seen.includes('POST /rest/v1/rpc/eab_invite'));
  assert.ok(seen.some(x => x === 'GET /rest/v1/eab_records'), 'synced after sign-in');
  await shot(page, '28b-account-team', false);
  // Save status: signed in, nothing waiting, and the (stand-in) cloud answered the sync: "Synced", not just "Saved".
  await page.locator('[data-testid="save-status"][data-state="synced"]').waitFor({ timeout: 5000 });
  assert.equal((await page.getByTestId('save-status').innerText()).trim(), 'Synced');
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
  assert.match(await page.getByTestId('bug-sent').innerText(), /Your report was sent/);
  assert.ok(seen.some(x => /^POST \/storage\/v1\/object\/bug-reports\/u-owner\/[0-9a-f-]{36}\.jpg$/.test(x)), 'screenshot went to the private bucket under the person’s own folder');
  assert.ok(seen.includes('POST /rest/v1/eab_bug_reports'));
  await page.locator('header .icon-btn').first().click();   // back to Settings
  await page.getByTestId('settings').waitFor();
  // Still signed in after closing and reopening.
  await page.reload(); await page.waitForSelector('nav.grid');
  // Sign out: back to the sign-in screen; records stay on the phone.
  await tile(page, 'Agent Profile'); await page.getByRole('button', { name: /Settings/ }).click();
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
  await page.locator('[data-field="street"]').fill('Jalan Peta 1');
  await page.locator('[data-field="lat"]').fill('2.8300'); await page.locator('[data-field="lng"]').fill('101.8100');
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
  await p2.getByTestId('map-status').filter({ hasText: /permission was refused/ }).waitFor();
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
  await tile(page, 'Agent Profile'); await page.getByRole('button', { name: /Settings/ }).click();
  const v = await page.getByTestId('about-version').innerText();
  assert.match(v, /Version 2\.1\.0 · build \w+ · native 3/);
  published = v.match(/build (\w+)/)[1];
  await page.getByTestId('check-update').click();
  assert.match(await page.getByTestId('update-msg').innerText(), /latest version/);
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
  assert.match(await page.getByTestId('contact-detail').innerText(), /search this alias in WhatsApp/);
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
    assert.match(await page.locator('nav.grid > button.voice-tile').evaluate(b => getComputedStyle(b).backgroundImage), /gradient/, 'gold Voice Command card');
    await tile(page, 'Voice Command');
    await page.getByTestId('voice-start').first().click();
    await page.getByRole('button', { name: 'Use the speech service' }).click();
    await page.getByTestId('voice-stop').first().click();
    await page.getByTestId('voice-processing').first().waitFor(); // "Recognising your words…" while the service finishes
    await page.getByTestId('voice-start').first().waitFor();
    const box = page.getByTestId('voice-command').locator('textarea').first();
    if (expectText) assert.equal(await box.inputValue(), 'Test 1 2 3');
    else { assert.equal(await box.inputValue(), ''); assert.match(await page.getByTestId('voice-error').first().innerText(), /No words were recognised/); }
    await ctx.close();
  }
});

test('U33 phone book: Send Name Card picker fills editable name and number; refusals and missing support are explained, never silent', async () => {
  const page = await phone();
  // Complete the required profile so the name card is active.
  await tile(page, 'Agent Profile'); await page.getByRole('button', { name: /Edit/ }).first().click();
  await page.locator('[data-field="fullName"]').fill('Agent J'); await page.locator('[data-field="regNo"]').fill('12345');
  await page.getByTestId('opt-regType').locator('.opt-btn').click(); await page.getByRole('option', { name: 'REN' }).click();
  await page.locator('[data-field="agency"]').fill('JSL Properties'); await page.locator('[data-field="phone"]').fill('0123456789');
  await page.getByTestId('save-profile').click();
  await page.getByTestId('send-namecard').click();
  // Browser without a contact picker: the button works and says why it cannot open.
  await page.getByRole('button', { name: 'Phone book' }).click();
  await page.getByTestId('namecard-pick').click();
  assert.match(await page.getByTestId('namecard-pick-msg').innerText(), /not available in this browser/);
  // With the phone's contact picker: name and number filled, and still editable.
  await page.evaluate(() => {
    window.ContactsManager = function () {};
    Object.defineProperty(navigator, 'contacts', { configurable: true, value: { select: async () => [{ name: ['Buyer Z'], tel: ['013-222 3333'], email: [] }] } });
  });
  await page.getByTestId('namecard-pick').click();
  assert.equal(await page.locator('[data-field="toName"]').inputValue(), 'Buyer Z');
  assert.equal(await page.locator('[data-field="toTel"]').inputValue(), '+60 13-222 3333');
  await page.locator('[data-field="toName"]').fill('Encik Z');
  assert.match(await page.getByTestId('recipient').innerText(), /Encik Z · \+60 13-222 3333/);
  assert.match(await page.getByTestId('open-whatsapp').getAttribute('href'), /^https:\/\/wa\.me\/60132223333\?text=.*Agent%20J/);
  // Picker closed without choosing: says so.
  await page.evaluate(() => Object.defineProperty(navigator, 'contacts', { configurable: true, value: { select: async () => [] } }));
  await page.getByTestId('namecard-pick').click();
  assert.match(await page.getByTestId('namecard-pick-msg').innerText(), /No contact was chosen/);
  await shot(page, '33-namecard-phonebook', false);
  await page.context().close();
});

test('U34 new user: Populate with Sample Data (recommended) or Start Without; sample clearly marked; clean workspace stays empty', async () => {
  const empty = await phone({ start: null });
  assert.match(await empty.getByTestId('start-choice').innerText(), /Populate with Sample Data[\s\S]*Recommended[\s\S]*Start Without Sample Data/);
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
  assert.match(await page.locator('main').innerText(), /\(sample\)/);
  await home(page); await tile(page, 'Calendar');
  await home(page); await tile(page, 'Inquiries & Viewings');
  assert.match(await page.locator('main').innerText(), /Buyer L \(sample\)|Tenant R \(sample\)/);
  await page.context().close();
});

test('U35 vendors have their own status (Pending Property Info, Pending Follow-up…); buyers use Cold/Warm/Hot/Dropped/Booked / Bought', async () => {
  const page = await phone({ start: 'sample' });
  await tile(page, 'Vendor List');
  const vs = await page.getByTestId('status-filter').locator('[data-status]').evaluateAll(b => b.map(x => x.textContent.replace(/\d+$/, '').trim()));
  assert.deepEqual(vs, ['Pending Property Info', 'Pending Follow-up', 'Listed', 'Negotiating', 'On Hold', 'Closed (Sold / Rented)', 'Withdrawn']);
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
  assert.match(await page.getByTestId('namecard-hint').innerText(), /Please complete the required information in Edit Profile to activate your Name Card\.[\s\S]*Full name, Registration type, Registration \/ agent number, Agency \/ company, Contact number/);
  await page.getByRole('button', { name: /Edit/ }).first().click();
  assert.equal(await page.locator('[data-testid="profile-edit"] .req').count() >= 5, true, 'required fields are marked');
  await page.locator('[data-field="fullName"]').fill('Agent J'); await page.locator('[data-field="agency"]').fill('JSL Properties');
  await page.locator('[data-field="phone"]').fill('0123456789');
  await page.getByTestId('save-profile').click();
  assert.equal(await page.getByTestId('send-namecard').isDisabled(), true, 'still missing the registration');
  assert.match(await page.getByTestId('namecard-hint').innerText(), /Registration type, Registration \/ agent number$/);
  await page.getByRole('button', { name: /Edit/ }).first().click();
  await page.getByTestId('opt-regType').locator('.opt-btn').click(); await page.getByRole('option', { name: 'REN' }).click();
  await page.locator('[data-field="regNo"]').fill('12345');
  await page.getByTestId('save-profile').click();
  assert.equal(await page.getByTestId('send-namecard').isDisabled(), false, 'switched on automatically');
  assert.equal(await page.getByTestId('namecard-hint').count(), 0);
  await page.getByTestId('send-namecard').click();
  assert.match(await page.getByTestId('share-preview').innerText(), /\*Agent J\*[\s\S]*REN No\.: 12345[\s\S]*JSL Properties[\s\S]*\+60 12-345 6789/);
  await page.context().close();
});

test('U37 property form: sections start closed, open and close, Save floats on screen, everything entered is saved; ? explains fields', async () => {
  const page = await phone();
  await tile(page, 'Property List'); await page.locator('.add-property').click();
  const secs = page.locator('[data-testid="listing-form"] .form-sec');
  assert.ok(await secs.count() >= 12);
  assert.deepEqual([...new Set(await secs.evaluateAll(x => x.map(e => e.dataset.open)))], ['no'], 'all closed at first');
  await page.locator('[data-sec="marketing"]').click();
  await page.locator('[data-field="headline"]').fill('Collapsible test');
  await page.locator('[data-sec="marketing"]').click(); // close it again
  assert.equal(await page.locator('[data-field="headline"]').count(), 0);
  assert.match(await page.locator('[data-sec="marketing"]').innerText(), /1 filled/);
  await page.locator('[data-sec="money"]').click();
  await page.locator('[data-field="askingPrice"]').fill('480000');
  await page.locator('[data-sec="notes"]').click();
  // Field help
  await page.locator('[data-sec="tenure"]').click();
  await page.locator('[data-help="tenure"]').click();
  assert.match(await page.getByTestId('help-tenure').innerText(), /freehold[\s\S]*Enter:[\s\S]*Example:[\s\S]*Why it matters:/);
  // Save floats: visible at the bottom of the screen while the middle of the form is shown.
  await page.locator('#sec-notes').scrollIntoViewIfNeeded();
  const box = await page.getByTestId('save-floating').boundingBox();
  assert.ok(box && box.y + box.height <= 824 && box.y > 600, `save bar on screen (${box?.y})`);
  await page.getByTestId('save-property').click();
  await page.getByTestId('listing-details').waitFor();
  assert.match(await page.locator('main').innerText(), /Collapsible test[\s\S]*RM 480,000/);
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
  assert.match(await page.getByTestId('banner-card').first().getByTestId('banner-pos').innerText(), /2\.81220, 101\.81220/);
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
  assert.match(await page.getByTestId('journey-marks').innerText(), /2\.81440, 101\.81440/);
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
  assert.match(await page.getByTestId('startup-msg').innerText(), /Opening your data on this phone/);
  assert.equal(await page.getByTestId('startup-logo').getAttribute('data-phase'), 'opening');
  await page.locator('[data-testid="startup-logo"][data-phase="slow"]').waitFor({ timeout: 8000 });
  const took = Date.now() - t0;
  assert.ok(took >= 4500 && took < 7500, `the notice comes at about five seconds (${took} ms)`);
  assert.match(await page.getByTestId('startup-msg').innerText(), /taking longer than usual\. Your saved data has not been changed/);
  assert.ok(!/encrypt|secur|AI update/i.test(await page.getByTestId('startup-logo').innerText()), 'no untrue claims');
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
  assert.match(await page.getByTestId('startup-msg').innerText(), /could not be opened\. Nothing was changed or deleted/);
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
  assert.match(await page.getByTestId('startup-msg').innerText(), /Membuka data anda dalam telefon ini/);
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
  assert.equal(await page.getByTestId('save-status').getAttribute('data-state'), 'phone');
  assert.match(await page.getByTestId('save-status').innerText(), /Saved on this phone/);
  // Good save: the message shows, then goes in about two seconds.
  await tile(page, 'Buyer List'); await page.getByRole('button', { name: 'New buyer' }).click();
  await page.locator('[data-field="name"]').fill('Timing Buyer');
  await page.getByTestId('save-contact').click();
  const toast = page.getByTestId('toast');
  await toast.waitFor();
  const t0 = Date.now();
  assert.equal(await toast.getAttribute('data-kind'), 'ok');
  assert.match(await toast.innerText(), /Saved on this phone\./);
  await toast.waitFor({ state: 'detached', timeout: 4000 });
  const shown = Date.now() - t0;
  assert.ok(shown >= 1500 && shown <= 2800, `the success message stays about two seconds (${shown} ms), not four`);
  // Failed save: the phone's storage refuses the write.
  await page.evaluate(() => { window.__failWrites = true; });
  await home(page); await tile(page, 'Buyer List'); await page.getByRole('button', { name: 'New buyer' }).click();
  await page.locator('[data-field="name"]').fill('Not Saved Buyer');
  await page.getByTestId('save-contact').click();
  await page.locator('[data-testid="toast"][data-kind="error"]').waitFor();
  assert.match(await page.getByTestId('toast').innerText(), /Could not save to the phone’s storage/);
  await page.waitForTimeout(400);
  assert.equal(await page.getByText('Saved on this phone.', { exact: true }).count(), 0, 'no success message after a failed write');
  assert.equal(await page.getByTestId('save-status').getAttribute('data-state'), 'failed-phone');
  assert.equal(await page.getByTestId('save-status').getAttribute('role'), 'alert');
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
  assert.equal(await page.getByTestId('save-status').getAttribute('data-state'), 'phone');
  await ctx.close();
});

test('U44 Notifications: System Notifications and News / Announcements sections, the exact empty wording, sample News kept and marked, no push claim', async () => {
  const page = await phone();
  await page.getByTestId('top-notifications').click();
  await page.getByTestId('notifications').waitFor();
  assert.deepEqual(await page.locator('[data-testid="notifications"] .card-title').allInnerTexts(), ['System Notifications', 'News / Announcements', 'Push messages', 'Notification settings']);
  const empty = 'You\'re all caught up — we\'ll let you know when there\'s something important.';
  assert.equal(await page.getByTestId('notif-empty-system').innerText(), empty);
  assert.equal(await page.getByTestId('notif-empty-news').innerText(), empty);
  // The earlier News content is kept, under a clear "sample, not live" heading, inside Notifications.
  await page.getByTestId('notif-news').locator('summary').click();
  assert.match(await page.getByTestId('notif-news').innerText(), /not live[\s\S]*Property market/i);
  // Push messages are not claimed to work.
  assert.match(await page.locator('.coming-soon').innerText(), /Coming Soon[\s\S]*not set up yet/);
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
  assert.match(await page.getByTestId('notif-system').innerText(), /Call the lawyer/);
  assert.equal(await page.getByTestId('notif-empty-system').count(), 0, 'not empty any more');
  await page.context().close();
});

test('U45 Settings sits inside Agent Profile and starts with the Easy Bug Report; the wording is approved; screenshot preview and removal; failure keeps the report', async () => {
  const page = await phone();
  assert.equal(await page.locator('nav.grid > button', { hasText: /^Settings/ }).count(), 0, 'no Settings card on the dashboard');
  await tile(page, 'Agent Profile');
  await page.getByRole('button', { name: /Settings/ }).click();
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
  assert.match(await page.getByTestId('bug-fail').innerText(), /write a short description/);
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
  assert.match(await page.getByTestId('bug-fail').innerText(), /was not sent[\s\S]*still here/);
  assert.equal(await page.getByTestId('bug-sent').count(), 0);
  assert.equal(await page.getByTestId('bug-desc').inputValue(), 'Voice button does nothing.');
  assert.equal(await page.getByTestId('bug-preview').count(), 1);
  await page.context().close();
});

test('U46 Easy Bug Report in Bahasa Malaysia and Chinese: every new label is translated', async () => {
  const page = await phone();
  await tile(page, 'Agent Profile'); await page.getByRole('button', { name: /Settings/ }).click();
  await page.locator('.lang button[aria-label="Bahasa Malaysia"]').click();
  assert.equal(await page.getByTestId('bug-entry').locator('.card-title').innerText(), 'Lapor Pepijat Mudah');
  await page.getByTestId('open-bug-report').click();
  assert.match(await page.getByTestId('bug-intro').innerText(), /Jumpa masalah\? Jangan risau — semudah 1-2-3\./);
  await page.getByTestId('bug-send').click();
  assert.match(await page.getByTestId('bug-fail').innerText(), /Sila tulis penerangan ringkas/);
  await page.locator('.lang button[aria-label="中文"]').click();
  assert.match(await page.getByTestId('bug-intro').innerText(), /发现问题了/);
  await home(page);
  await page.getByTestId('top-notifications').click();
  assert.match(await page.getByTestId('notif-empty-news').innerText(), /您已查看全部/);
  await page.locator('.lang button[aria-label="Bahasa Malaysia"]').click();
  assert.match(await page.getByTestId('notif-empty-news').innerText(), /Anda sudah mengikuti semuanya/);
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
  assert.match(await page.getByTestId('lead-review').innerText(), /Inactive is no longer used as a buyer status\. 1 buyer was marked Inactive, so it was moved to Dropped/);
  assert.deepEqual(await page.getByTestId('lead-review-item').allInnerTexts(), ['Old Inactive Buyer']);
  await shot(page, '47a-lead-review', false);
  // It is also listed under System Notifications.
  await home(page); await page.getByTestId('top-notifications').click();
  assert.match(await page.getByTestId('notif-lead-review').innerText(), /1 buyer moved from Inactive to Dropped/);
  await home(page); await tile(page, 'Buyer List');
  const row = page.locator('[data-testid="contact-row"][data-lead="dropped"]');
  assert.equal(await row.count(), 1);
  assert.equal(await row.locator('.lead-dot').first().evaluate(e => getComputedStyle(e).backgroundColor), 'rgb(156, 163, 175)', 'Dropped is gray');
  assert.equal(await page.getByTestId('status-filter').locator('[data-status="inactive"]').count(), 0);
  await row.locator('.row-main').click();
  assert.match(await page.locator('main').innerText(), /Keep these notes/);
  assert.match(await page.locator('main').innerText(), /\+60 12-000 1111/);
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
  await page.locator('[data-field="street"]').fill('Jalan Prefix Test');
  await page.getByTestId('save-property').click();
  await page.waitForSelector('[data-testid="listing-details"]');
  assert.doesNotMatch(await page.locator('main').innerText(), /\bUnit 12A\b/, 'detail page');
  assert.match(await page.locator('header h1').innerText(), /^12A, Jalan Prefix Test$/);
  await home(page); await tile(page, 'Property List');
  assert.equal(await page.getByTestId('listing-card').count(), 1);
  assert.match(await page.getByTestId('listing-card').first().innerText(), /12A, Jalan Prefix Test/);
  assert.doesNotMatch(await page.getByTestId('listing-card').first().innerText(), /\bUnit\b/, 'list card');
  await home(page);
  assert.doesNotMatch(await page.locator('.photo-cards').innerText().catch(() => ''), /\bUnit\b/, 'dashboard recent card');
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
  assert.match(await page.getByTestId('draft-saved').innerText(), /Draft saved on this phone/);
  // "Closing the app": the page is reloaded. Nothing was saved with the Save button, so no record exists.
  await page.reload(); await page.waitForSelector('nav.grid');
  await tile(page, 'Buyer List');
  assert.equal(await page.getByTestId('contact-row').count(), 0, 'a draft is not a record');
  await page.getByRole('button', { name: 'New buyer' }).click();
  await page.getByTestId('draft-banner').waitFor();
  assert.match(await page.getByTestId('draft-banner').innerText(), /Draft from .* restored\. It is not saved yet/);
  assert.equal(await page.locator('[data-field="name"]').inputValue(), 'Half Typed Buyer');
  assert.equal(await page.locator('[data-field="whatsapp"]').inputValue(), '@half');
  // Edit the restored draft; close again; the edit is what comes back.
  await page.locator('[data-field="name"]').fill('Half Typed Buyer Two');
  await waitStored(page, 'local', "all.some(v => JSON.stringify(v).includes('Half Typed Buyer Two'))");
  await page.reload(); await page.waitForSelector('nav.grid');
  await tile(page, 'Buyer List'); await page.getByRole('button', { name: 'New buyer' }).click();
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
  await page.locator('[data-field="street"]').fill('Jalan Draft Test');
  await page.locator('[data-field="unitNo"]').fill('9B');
  await page.getByTestId('draft-saved').waitFor();
  await page.reload(); await page.waitForSelector('nav.grid');
  await tile(page, 'Property List');
  assert.equal(await page.getByTestId('listing-card').count(), 0, 'no property was created by typing');
  await page.getByRole('button', { name: 'Add New Property' }).first().click(); await expandForm(page);
  await page.getByTestId('draft-banner').waitFor();
  assert.equal(await page.locator('[data-field="street"]').inputValue(), 'Jalan Draft Test');
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
  assert.match(await page.getByTestId('contact-row').first().innerText(), /From Phase One/);
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
  assert.equal(await page.getByTestId('record-status').getAttribute('data-state'), 'phone');
  assert.match(await page.getByTestId('record-status').innerText(), /Saved on this phone/);
  await shot(page, '50-record-status', false);
  // Edit: the earlier version goes to History.
  await page.getByRole('button', { name: 'Edit' }).first().click();
  await page.locator('[data-field="name"]').fill('Ahmad Renamed');
  await page.getByTestId('save-contact').click();
  await page.getByTestId('contact-detail').waitFor();
  assert.match(await page.locator('.contact-name').innerText(), /Ahmad Renamed/);
  await page.getByTestId('rec-history').click();
  await page.getByTestId('revision-list').waitFor();
  assert.equal(await page.getByTestId('revision').count(), 1);
  assert.match(await page.getByTestId('revision').first().innerText(), /Edited on this phone/);
  await shot(page, '51-history', false);
  await page.getByTestId('restore-revision').first().click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Restore this version' }).click();
  await page.getByTestId('history-msg').waitFor();
  await page.locator('header .icon-btn').first().click();
  assert.match(await page.locator('.contact-name').innerText(), /Ahmad History/, 'the earlier name is back');
  // Delete, then bring it back from Recently deleted.
  await page.getByRole('button', { name: 'Edit' }).first().click();
  await page.getByRole('button', { name: 'Delete' }).first().click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await page.waitForSelector('nav.grid');
  await tile(page, 'Agent Profile'); await page.getByRole('button', { name: /Settings/ }).click();
  await page.getByTestId('open-recently-deleted').click();
  await page.getByTestId('deleted-item').waitFor();
  assert.match(await page.getByTestId('deleted-item').first().innerText(), /Ahmad History/);
  await shot(page, '52-recently-deleted', false);
  await page.getByTestId('restore-deleted').first().click();
  await page.getByTestId('contact-detail').waitFor();
  assert.match(await page.locator('.contact-name').innerText(), /Ahmad History/);
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
  await page.locator('[data-testid="save-status"][data-state="conflict"]').waitFor({ timeout: 8000 });
  assert.match(await page.getByTestId('save-status').innerText(), /3 need review/, 'the status line does not say Synced');
  await tile(page, 'Agent Profile'); await page.getByRole('button', { name: /Settings/ }).click();
  await page.getByTestId('open-sync-review').click();
  await page.getByTestId('sync-review').waitFor();
  assert.equal(await page.getByTestId('conflict-card').count(), 3);
  await shot(page, '53-sync-review', true);

  // The property number: explained, the other property named, nothing renamed.
  const ref = page.locator('[data-testid="conflict-card"][data-kind="reference"]');
  assert.match(await ref.innerText(), /A1001 could not be sent/);
  assert.match(await ref.innerText(), /Used by P1001 · Terrace in Puchong/);
  assert.match(await ref.innerText(), /not renamed/);
  await ref.getByTestId('open-other').waitFor();

  // Same field: this phone's value stays until a choice is made; choosing "theirs" sends it.
  const fields = page.locator('[data-testid="conflict-card"][data-kind="fields"]');
  assert.match(await fields.innerText(), /LOCAL-PHONE/); assert.match(await fields.innerText(), /REMOTE-PHONE/);
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
  assert.match(await del.innerText(), /Deleted elsewhere, edited here/);
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
  assert.match(await page.getByTestId('owner-unknown').innerText(), /cannot tell which team/);
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
  await p2.waitForTimeout(1000);
  assert.ok(seen2.some(r => /eab_push_records/.test(r)), 'the offline records go to the first team');
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
  assert.match(await page.locator('#sec-basics .card-title').innerText(), /Type & Purpose/);
  await page.locator('#sec-marketing [data-field="headline"]').fill('Corner shop, Nilai');
  await page.locator('[data-sec="marketing"]').click();
  assert.match(await page.locator('[data-sec="marketing"]').innerText(), /1 filled/);
  await page.getByTestId('save-property').click(); await page.waitForSelector('[data-testid="listing-details"]');
  assert.match(await page.getByTestId('marketing').innerText(), /Corner shop, Nilai/, 'shown with Marketing on the detail page');
  assert.doesNotMatch(await page.getByTestId('sec-basics').innerText(), /Corner shop/);
  await page.getByTestId('marketing').getByRole('button', { name: /Edit/ }).click();
  await page.waitForSelector('#sec-marketing [data-field="headline"]');
  assert.equal(await page.locator('#sec-marketing [data-field="headline"]').inputValue(), 'Corner shop, Nilai');
  await page.context().close();
});

test('U61 Fill by Voice: a big centred button; filled fields must be reviewed before saving; typing or "I have checked them" clears the review', async () => {
  const page = await phone();
  await tile(page, 'Property List'); await page.locator('.add-property').click();
  const btn = page.getByTestId('voice-fill-btn');
  const box = await btn.boundingBox();
  assert.ok(box.height >= 56 && box.width >= 240, `prominent (${box.width}x${box.height})`);
  assert.ok(Math.abs(box.x + box.width / 2 - 192) < 6, 'centred on the 384px screen');
  assert.equal(await page.getByTestId('voice-panel').count(), 0, 'the panel opens on tap');
  assert.equal(await page.locator('details[data-testid="voice-fill"]').count(), 0, 'no longer a small collapsed row');
  await shot(page, '60-fill-by-voice', false);
  await btn.click();
  await page.getByTestId('voice-panel').locator('textarea').first().fill('terrace house in Nilai 4 bedrooms 3 bathrooms asking price 580000 freehold');
  await page.getByTestId('voice-fill-apply').click();
  const banner = page.getByTestId('review-banner');
  await banner.waitFor();
  assert.match(await banner.innerText(), /filled from your words/);
  // Save asks first; "Cancel" returns to the form with nothing saved.
  await page.getByTestId('save-property').click();
  await page.getByRole('alertdialog').waitFor();
  assert.match(await page.getByRole('alertdialog').innerText(), /Save without checking/);
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click();
  assert.equal(await page.getByTestId('listing-form').count(), 1);
  assert.equal(await page.evaluate(() => document.querySelectorAll('[data-testid="listing-details"]').length), 0);
  // Confirming the review removes the question.
  await page.getByTestId('review-done').click();
  assert.equal(await banner.getAttribute('data-checked'), 'yes');
  await page.getByTestId('save-property').click();
  await page.waitForSelector('[data-testid="listing-details"]');
  assert.equal(await page.getByRole('alertdialog').count(), 0);
  assert.equal(await page.locator('[data-row="bedrooms"] dd').innerText(), '4', 'the reviewed voice details were saved');
  // "Save anyway" also works, and a saved voice field is no longer waiting for review when the property is edited later.
  await page.getByRole('button', { name: 'Edit', exact: true }).first().click(); await expandForm(page);
  assert.equal(await page.getByTestId('review-banner').count(), 0, 'already saved after review: no repeated warning');
  await page.context().close();
});

test('U62 voice command prefill (from the Property List) opens the form for review: fields marked "from your words", Save asks first', async () => {
  const page = await phone();
  await tile(page, 'Property List');
  await page.locator('.lc-tools .voice-btn').click();
  await page.getByTestId('voice-cmd').locator('textarea').first().fill('Create a new terrace house in Putra Nilai for rent, rental RM1,800 per month, three bedrooms, two bathrooms.');
  await page.getByRole('button', { name: 'Show proposed details' }).click();
  await page.getByRole('button', { name: 'Open in the form to review' }).click();
  await expandForm(page);
  assert.ok(await page.getByTestId('review-banner').count() === 1, 'the review notice is shown');
  assert.ok(await page.locator('#sec-money .chip.stated, #sec-details .chip.stated').count() >= 1, 'fields carry the "from your words" mark');
  await page.getByTestId('save-property').click();
  assert.match(await page.getByRole('alertdialog').innerText(), /Save without checking/);
  await page.getByRole('alertdialog').getByRole('button', { name: 'Save anyway' }).click();
  await page.waitForSelector('[data-testid="listing-details"]');
  assert.match(await page.getByTestId('listing-details').innerText(), /1,800/);
  await page.context().close();
});

test('U63 verification: four states, stored with the record, shown the same way everywhere, kept after restart, clearable', async () => {
  const page = await phone();
  await tile(page, 'Property List'); await page.locator('.add-property').click(); await expandForm(page);
  assert.equal(await page.locator('[data-verify="askingPrice"] option').count(), 5, 'not marked + the four states');
  assert.deepEqual(await page.locator('[data-verify="askingPrice"] option').allInnerTexts(), ['Not marked', 'Confirmed', 'Owner stated', 'Need to check', 'Unknown']);
  assert.equal(await page.locator('[data-verify="headline"]').count(), 0, 'only facts that need checking carry a state');
  await page.locator('[data-field="askingPrice"]').fill('450000');
  await page.locator('[data-verify="askingPrice"]').selectOption('owner');
  await page.locator('[data-verify="tenure"]').selectOption('check');
  await page.locator('[data-verify="titleType"]').selectOption('unknown');     // an empty field can be "Unknown"
  await page.locator('[data-verify="landSqft"]').selectOption('confirmed');
  await page.locator('[data-field="landSqft"]').fill('1500');
  assert.equal(await page.locator('[data-verify="askingPrice"]').getAttribute('aria-label'), 'Check status: Asking price (RM)');
  await page.getByTestId('save-property').click(); await page.waitForSelector('[data-testid="listing-details"]');
  const row = k => page.locator(`[data-row="${k}"] [data-verify-state]`);
  assert.equal(await row('askingPrice').getAttribute('data-verify-state'), 'owner');
  assert.match(await row('askingPrice').innerText(), /Owner stated/, 'a word as well as a colour');
  assert.match(await row('landSqft').innerText(), /Confirmed/);
  assert.match(await page.getByTestId('verify-summary').innerText(), /2 to check/);
  assert.match(await page.getByTestId('verify-summary').innerText(), /Tenure.*Title/s);
  await shot(page, '61-verification', true);
  // Still there after closing the app.
  await page.reload(); await page.waitForSelector('nav.grid');
  await tile(page, 'Property List'); await page.getByTestId('listing-card').first().click();
  assert.equal(await row('askingPrice').getAttribute('data-verify-state'), 'owner');
  // Edit: values shown, change one, clear one.
  await page.getByRole('button', { name: 'Edit', exact: true }).first().click(); await expandForm(page);
  assert.equal(await page.locator('[data-verify="askingPrice"]').inputValue(), 'owner');
  assert.equal(await page.locator('[data-verify="titleType"]').inputValue(), 'unknown');
  await page.locator('[data-verify="askingPrice"]').selectOption('confirmed');
  await page.locator('[data-verify="tenure"]').selectOption('');
  await page.getByTestId('save-property').click(); await page.waitForSelector('[data-testid="listing-details"]');
  assert.equal(await row('askingPrice').getAttribute('data-verify-state'), 'confirmed');
  assert.match(await page.getByTestId('verify-summary').innerText(), /1 to check/);
  // Changing the value itself does not touch the mark.
  await page.getByRole('button', { name: 'Edit', exact: true }).first().click(); await expandForm(page);
  await page.locator('[data-field="askingPrice"]').fill('460000'); await page.getByTestId('save-property').click();
  await page.waitForSelector('[data-testid="listing-details"]');
  assert.equal(await row('askingPrice').getAttribute('data-verify-state'), 'confirmed');
  await page.context().close();
});

test('U64 verification marks of a field that no longer applies go with it (sale → rent only drops the sale price mark)', async () => {
  const page = await phone();
  await tile(page, 'Property List'); await page.locator('.add-property').click(); await expandForm(page);
  await page.locator('[data-field="purpose"]').selectOption('sale');
  await page.locator('[data-field="askingPrice"]').fill('300000'); await page.locator('[data-verify="askingPrice"]').selectOption('owner');
  await page.getByTestId('save-property').click(); await page.waitForSelector('[data-testid="listing-details"]');
  await page.getByRole('button', { name: 'Edit', exact: true }).first().click(); await expandForm(page);
  await page.locator('[data-field="purpose"]').selectOption('rent');
  await page.locator('[data-field="monthlyRent"]').fill('1800'); await page.locator('[data-verify="monthlyRent"]').selectOption('confirmed');
  await page.getByTestId('save-property').click(); await page.waitForSelector('[data-testid="listing-details"]');
  assert.equal(await page.locator('[data-row="askingPrice"]').count(), 0);
  assert.equal(await page.locator('[data-row="monthlyRent"] [data-verify-state]').getAttribute('data-verify-state'), 'confirmed');
  const rec = await page.evaluate(() => new Promise(res => { const r = indexedDB.open('estate-agent-buddy'); r.onsuccess = () => { const q = r.result.transaction('records').objectStore('records').getAll(); q.onsuccess = () => { res(q.result.find(x => x && x.verification)); r.result.close(); }; }; }));
  assert.deepEqual(rec.verification, { monthlyRent: 'confirmed' });
  await page.context().close();
});

test('U65 property cards: long-press opens a preview, tapping still opens the details, the Preview button is the alternative; delete asks first', async () => {
  const page = await phone();
  await loadSample(page);
  await tile(page, 'Property List');
  const first = page.getByTestId('listing-card').first();
  const count0 = await page.getByTestId('listing-card').count();
  // normal tap → details
  await first.locator('.gc').click();
  await page.waitForSelector('[data-testid="listing-details"]');
  await home(page); await tile(page, 'Property List');
  // long press (mouse down, hold, release) → preview, and releasing does not open the details
  const b = await first.locator('.gc').boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down(); await page.waitForTimeout(700); await page.mouse.up();
  await page.getByTestId('preview-sheet').waitFor();
  assert.equal(await page.getByTestId('listing-details').count(), 0, 'long press does not also open the details');
  assert.match(await page.getByTestId('preview-sheet').innerText(), /RM/);
  await shot(page, '62-preview', false);
  await page.getByTestId('preview-close').click();
  assert.equal(await page.getByTestId('preview-sheet').count(), 0);
  // a short press is just a tap
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await page.waitForTimeout(80); await page.mouse.up();
  await page.waitForSelector('[data-testid="listing-details"]');
  await home(page); await tile(page, 'Property List');
  // the visible button (for people who cannot press and hold), keyboard Escape, then Open details
  await page.getByTestId('preview-btn').first().click();
  await page.getByTestId('preview-sheet').waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await page.getByTestId('preview-sheet').count(), 0, 'Escape closes');
  await page.getByTestId('preview-btn').first().click();
  await page.getByTestId('preview-open').click();
  await page.waitForSelector('[data-testid="listing-details"]');
  await home(page); await tile(page, 'Property List');
  // delete from the preview: Cancel keeps it, OK removes the property
  await page.getByTestId('preview-btn').first().click();
  await page.getByTestId('preview-delete').click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click();
  assert.equal(await page.getByTestId('listing-card').count(), count0);
  await page.getByTestId('preview-sheet').waitFor();                  // Cancel returns to the preview
  await page.getByTestId('preview-delete').click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  assert.equal(await page.getByTestId('listing-card').count(), count0 - 1);
  // large cards have the same two ways in
  await page.getByRole('button', { name: 'Large cards' }).click();
  await page.getByTestId('preview-btn').first().click();
  await page.getByTestId('preview-sheet').waitFor();
  await page.getByTestId('preview-close').click();
  const lb = await page.getByTestId('listing-card').first().locator('.lc-photo').boundingBox();
  await page.mouse.move(lb.x + 20, lb.y + 20); await page.mouse.down(); await page.waitForTimeout(700); await page.mouse.up();
  await page.getByTestId('preview-sheet').waitFor();
  await page.context().close();
});

test('U66 phone book on the contact form and the property owner: icon beside the number; refused, cancelled and unsupported are each explained', async () => {
  const page = await phone();
  await tile(page, 'Buyer List'); await page.getByRole('button', { name: 'New buyer' }).click();
  const icon = page.getByTestId('pick-contact');
  assert.equal(await icon.getAttribute('aria-label'), 'Choose from phone book');
  const [ib, fb] = await Promise.all([icon.boundingBox(), page.locator('[data-field="phone"]').boundingBox()]);
  assert.ok(ib.x >= fb.x + fb.width - 2 && Math.abs((ib.y + ib.height / 2) - (fb.y + fb.height / 2)) < 8 && ib.width >= 44 && ib.height >= 44, 'a 44px icon right beside the phone box');
  await icon.click();                                                   // no contact picker in this browser
  assert.match(await page.getByTestId('pick-contact-msg').innerText(), /not available in this browser/);
  await page.evaluate(() => { window.ContactsManager = function () {}; Object.defineProperty(navigator, 'contacts', { configurable: true, value: { select: async () => [] } }); });
  await icon.click();                                                   // picker closed with nothing chosen
  assert.match(await page.getByTestId('pick-contact-msg').innerText(), /No contact was chosen/);
  await page.evaluate(() => Object.defineProperty(navigator, 'contacts', { configurable: true, value: { select: async () => [{ name: ['No Number'], tel: [], email: [] }] } }));
  await icon.click();                                                   // a contact without a number
  assert.match(await page.getByTestId('pick-contact-msg').innerText(), /no phone number/);
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
  const own = page.getByTestId('pick-owner');
  assert.equal(await own.getAttribute('aria-label'), 'Choose owner from phone book');
  await page.evaluate(() => Object.defineProperty(navigator, 'contacts', { configurable: true, value: { select: async () => { throw Object.assign(new Error('denied'), { name: 'NotAllowedError' }); } } }));
  await own.click();
  assert.match(await page.getByTestId('pick-owner-msg').innerText(), /No contact was chosen|permission/i, 'a refusal is never silent');
  await page.evaluate(() => Object.defineProperty(navigator, 'contacts', { configurable: true, value: { select: async () => [{ name: ['Encik Owner'], tel: ['012-999 8888'], email: [] }] } }));
  await own.click();
  assert.equal(await page.locator('[data-field="ownerName"]').inputValue(), 'Encik Owner');
  assert.equal(await page.locator('[data-field="ownerPhone"]').inputValue(), '+60 12-999 8888');
  await page.locator('[data-field="ownerPhone"]').fill('013-111 2222');           // still editable
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
  assert.match(await page.getByTestId('phone-invalid').innerText(), /looks incomplete/);
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
  await tile(page, 'Property List'); await page.getByTestId('listing-card').filter({ hasText: 'Corner semi-D factory' }).first().locator('.gc').click();
  assert.ok(await page.locator('[data-verify-state]').count() >= 2, 'sample property shows example verification marks');
  await home(page);
  await tile(page, 'To-Do'); assert.ok(await page.getByTestId('task').locator('[data-testid="sample-tag"]').count() >= 1, 'to-do rows tagged');
  await home(page);
  await tile(page, 'Vendor List');
  assert.match(await page.locator('.contact-list').innerText(), /Sample|Contoh/);
  await page.locator('.contact-row', { hasText: 'Owner F' }).locator('.row-main').click();
  assert.match(await page.getByTestId('contact-whatsapp').innerText(), /@ownerF_sample/, 'an alias-only sample contact');
  assert.equal(await page.locator('a[href*="wa.me"]').count(), 0);
  await home(page);
  await tile(page, 'Agent Profile'); await page.getByRole('button', { name: /Settings/ }).click();
  await page.getByTestId('remove-sample').click();
  await home(page); await tile(page, 'Property List');
  assert.equal(await page.getByTestId('listing-card').count(), 0, 'everything that was sample is gone');
  await page.context().close();
});

test('U69 Bahasa Malaysia and Chinese: the new Stage 3 screens are translated', async () => {
  const page = await phone();
  await loadSample(page);
  await tile(page, 'Agent Profile'); await page.getByRole('button', { name: /Settings/ }).click();
  for (const [aria, voice, verifyOwner, preview, openLabel] of [
    ['Bahasa Malaysia', 'Isi dengan Suara', 'Dinyatakan pemilik', 'Pratonton', 'Buka butiran'],
    ['中文', '语音填写', '屋主所述', '预览', '打开详情'],
  ]) {
    await page.locator(`.lang button[aria-label="${aria}"]`).click();
    await home(page);
    await page.locator('nav.grid > button').nth(0).waitFor();
    // list → preview
    await page.locator('nav.grid > button', { hasText: aria === 'Bahasa Malaysia' ? 'Senarai Hartanah' : '房产列表' }).first().click();
    assert.match(await page.getByTestId('preview-btn').first().getAttribute('aria-label'), new RegExp(preview));
    await page.getByTestId('preview-btn').first().click();
    assert.match(await page.getByTestId('preview-open').innerText(), new RegExp(openLabel));
    await page.getByTestId('preview-close').click();
    // form → voice button, verification choices
    await page.locator('.add-property').click(); await expandForm(page);
    assert.match(await page.getByTestId('voice-fill-btn').innerText(), new RegExp(voice));
    assert.ok((await page.locator('[data-verify="askingPrice"] option').allInnerTexts()).includes(verifyOwner));
    await shot(page, `64-stage3-${aria === '中文' ? 'zh' : 'bm'}`, false);
    await home(page);
    await tile(page, aria === 'Bahasa Malaysia' ? 'Profil Ejen' : '经纪人资料');
    await page.getByRole('button', { name: /Settings|Tetapan|设置/ }).click();
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
  assert.match(await page.getByTestId('banner-pos-set').innerText(), /2\.83010, 101\.81020 · map/);
  await page.getByTestId('banner-photo-remove').click();               // and take the photo off the saved banner
  await page.getByTestId('banner-save').click();
  assert.match(await row().getByTestId('banner-pos').innerText(), /2\.83010, 101\.81020/);
  assert.equal(await row().locator('.banner-photo').count(), 0, 'the photo is gone from the saved banner');
  assert.match(await row().getByTestId('banner-moves').innerText(), /Position changed 1 time/);
  await row().getByTestId('banner-moves').locator('summary').click();
  assert.match(await row().getByTestId('banner-move').innerText(), /Was at 2\.82100, 101\.80400 until/);
  assert.match(await row().getByTestId('banner-navigate').getAttribute('href'), /destination=2\.8301%2C101\.8102/, 'Navigate uses the new saved position');
  // Editing only the note adds no move.
  await row().getByTestId('banner-edit').click();
  await page.locator('[data-field="bannerNote"]').fill('Repainted');
  await page.getByTestId('banner-save').click();
  assert.match(await row().getByTestId('banner-moves').innerText(), /Position changed 1 time/);
  // The moves stay in the history after taking it down, and the record is flagged sample (so it never syncs).
  await row().getByTestId('banner-takedown').click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Mark taken down' }).click();
  const old = page.locator('[data-testid="banner-card"]', { hasText: title }).getByTestId('banner-old');
  await page.locator('[data-testid="banner-card"]', { hasText: title }).locator('.banner-history > summary').click();
  assert.match(await old.innerText(), /Position changed 1 time/);
  const rec = await page.evaluate(() => new Promise(res => { const r = indexedDB.open('estate-agent-buddy'); r.onsuccess = () => { const q = r.result.transaction('records').objectStore('records').getAll(); q.onsuccess = () => { res(q.result.filter(x => x && x.placedOn)); r.result.close(); }; }; }));
  assert.equal(rec.length, 1);
  assert.equal(rec[0].sample, true, 'a banner on a sample property is a sample');
  assert.equal(rec[0].moves.length, 1);
  assert.ok(!rec[0].photoFileId);
  await page.context().close();
});

test('U22 no requests leave the phone without a configured service, and no errors in the browser console', () => {
  assert.deepEqual(external, []);
  assert.deepEqual(consoleErrors, []);
});
