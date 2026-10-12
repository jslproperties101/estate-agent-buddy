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

async function phone({ maps = false, geo } = {}) {
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
  return page;
}
const shot = (page, name, fullPage = true) => page.screenshot({ path: `${SHOTS}${name}.png`, fullPage });
const tile = (page, name) => page.locator('nav.grid > button', { hasText: name }).first().click();
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

test('U1 dashboard: Estate Agent Buddy, 15 cards in 3 × 5 first, no Explorer Progress, no GPS Map tile, Agent Profile', async () => {
  const page = await phone();
  assert.equal(await page.locator('h1').getAttribute('aria-label'), 'Estate Agent Buddy');
  const names = await page.locator('nav.grid > button').evaluateAll(bs => bs.map(b => b.getAttribute('aria-label')));
  assert.deepEqual(names, ['To-Do', 'Calendar', 'Opportunities', 'Property List', 'Vendor List', 'Buyer List', 'GPS Assistance',
    'Agent Financial', 'Property Calculator', 'Agent Profile', 'Ask Expert', 'Voice Command',
    'Subsale (Coming Soon)', 'Project (Coming Soon)', 'Co-broke']);
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
  await page.getByRole('button', { name: 'Add New Property' }).first().click();
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
  await page.getByRole('button', { name: 'Add New Property' }).first().click();
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
  await page.getByRole('button', { name: 'Add New Property' }).first().click();
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
  assert.ok(top >= 0 && top < 200, `the form opened at Tenure & Title (top ${top})`);
  const order = await page.locator('[data-testid="listing-form"] > .card[id]').evaluateAll(cs => cs.map(c => c.id));
  assert.deepEqual(order.slice(0, 4), ['sec-basics', 'sec-tenure', 'sec-photos', 'sec-location']);
  assert.equal(order[order.length - 1], 'sec-docs', 'Documents at the end');
  await shot(page, '04b-form-at-tenure', false);
  await page.context().close();
});

test('U7 dropdowns with Others: remembered for every property, removable with X, built-ins kept', async () => {
  const page = await phone();
  await tile(page, 'Property List');
  await page.getByRole('button', { name: 'Add New Property' }).first().click();
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
  await page.getByRole('button', { name: 'Add New Property' }).first().click();
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
  await page.getByRole('button', { name: 'Add New Property' }).first().click();
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

test('U10 lead colours: Blue Cold, Yellow Warm, Red Hot, Green Dropped, Gray Inactive', async () => {
  const page = await phone();
  await loadSample(page);
  await tile(page, 'Buyer List');
  const colours = await page.locator('[role="radiogroup"] .lead-dot').evaluateAll(d => d.map(x => getComputedStyle(x).backgroundColor));
  assert.deepEqual(colours, ['rgb(59, 130, 246)', 'rgb(234, 179, 8)', 'rgb(239, 68, 68)', 'rgb(34, 197, 94)', 'rgb(156, 163, 175)']);
  const hot = page.locator('[data-testid="contact-row"][data-lead="hot"]');
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
  await page.waitForSelector('[data-testid="listing-form"]');
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
    ['form', async () => { await page.locator('nav.grid > button').nth(3).click(); await page.locator('.add-property').click(); }],
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
    ['property form', async () => { await tile(page, 'Property List'); await page.locator('.add-property').click(); }, '[data-field="street"]'],
    ['property form dropdown', async () => { await tile(page, 'Property List'); await page.locator('.add-property').click(); }, '[data-field="purpose"]'],
    ['property form custom dropdown', async () => { await tile(page, 'Property List'); await page.locator('.add-property').click(); }, '.opt-btn'],
    ['property form money', async () => { await tile(page, 'Property List'); await page.locator('.add-property').click(); }, '[data-field="askingPrice"]'],
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
  await home(page); await tile(page, 'Property List'); await page.locator('.add-property').click();
  await page.getByTestId('opt-type').locator('.opt-btn').click();
  await page.mouse.move(0, 0); await page.waitForTimeout(250);
  assert.equal(await page.getByTestId('opt-type').locator('.opt-btn').evaluate(el => getComputedStyle(el).borderTopColor), 'rgb(212, 175, 55)');
  await shot(page, '23-form-fields', false);
  await page.context().close();
});

test('U24 RM money boxes: separators while typing, plain number saved, paste understood, same everywhere', async () => {
  const page = await phone();
  await tile(page, 'Property List');
  await page.locator('.add-property').click();
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

test('U25 new cards: Subsale and Project say Coming Soon; Co-broke lists real co-broke properties only', async () => {
  const page = await phone();
  await tile(page, 'Subsale');
  assert.ok(await page.getByTestId('soon-subsale').isVisible());
  assert.match(await page.getByTestId('soon-subsale').innerText(), /Coming Soon/);
  await home(page); await tile(page, 'Project');
  assert.match(await page.getByTestId('soon-project').innerText(), /Coming Soon/);
  await home(page); await tile(page, 'Co-broke');
  assert.match(await page.getByTestId('cobroke-count').innerText(), /^0 co-broke/);
  await home(page); await loadSample(page);
  await tile(page, 'Co-broke');
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
  await page.locator('.add-property').click();
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
  await page.locator('#sec-banner [data-field="bannerStatus"]').selectOption('not_yet');
  // give the property a map position so it shows on My Property Map
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
    if (u.pathname === '/auth/v1/logout') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' }, body: '' });
    return route.fulfill({ status: 404, body: '' });
  });
  const page = await ctx.newPage();
  await page.goto(base); await page.waitForSelector('nav.grid');
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
  await tile(page, 'Property List'); await page.locator('.add-property').click();
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
    body: JSON.stringify({ sha: published, version: '2.0.0', nativeVersion: 2, bundle: 'https://updates.test/b.zip', apk: 'https://updates.test/a.apk', builtAt: '2026-10-12' }) }));
  const page = await ctx.newPage();
  await page.goto(base); await page.waitForSelector('nav.grid');
  await page.getByTestId('update-bar').waitFor({ timeout: 10000 });
  assert.equal(await page.getByTestId('update-bar').getAttribute('data-kind'), 'web-reload');
  assert.match(await page.getByTestId('update-bar').innerText(), /new version/i);
  await tile(page, 'Agent Profile'); await page.getByRole('button', { name: /Settings/ }).click();
  const v = await page.getByTestId('about-version').innerText();
  assert.match(v, /Version 2\.0\.0 · build \w+ · native 2/);
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

test('U22 no requests leave the phone without a configured service, and no errors in the browser console', () => {
  assert.deepEqual(external, []);
  assert.deepEqual(consoleErrors, []);
});
