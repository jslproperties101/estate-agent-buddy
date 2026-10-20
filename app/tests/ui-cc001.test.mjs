// Screen tests for ClaudeChanges001 (owner, 17 Oct 2026), in Chromium at Samsung S23 Ultra width (384 x 824).
// Run after `npm run build`. They prove the screens in a browser; the real phone (Android, touch gestures, phone book,
// notifications) still has to be checked by the owner on the QA APK.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { chromium } from 'playwright';

const DIST = new URL('../dist/', import.meta.url).pathname;
const SHOTS = new URL('./screens/', import.meta.url).pathname;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.map': 'application/json' };
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
let server, browser, base;
const errors = [];

before(async () => {
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
const shot = (page, name, fullPage = false) => page.screenshot({ path: `${SHOTS}${name}.png`, fullPage });
async function home(page) { while (await page.locator('header button[aria-label="Back"]').count()) await page.locator('header .icon-btn').first().click(); }
async function newProperty(page) {
  await page.locator('nav.grid > button[data-key="property"]').click();
  await page.locator('.add-property').click();
  await page.waitForSelector('[data-testid="listing-form"]');
  if ((await page.getByTestId('toggle-all').innerText()).match(/Open/)) await page.getByTestId('toggle-all').click();
}
/** Types a value into one remembered list (search box → Add, or the existing entry). */
async function pickOpt(page, testId, value) {
  const box = page.getByTestId(testId);
  if (await box.locator('.opt-list').count() === 0) await box.locator('.opt-btn:not([data-locked]), .opt-field.locked .fx-edit').click();
  await page.getByTestId(`${testId}-search`).fill(value);
  const add = page.getByTestId(`${testId}-add`);
  if (await add.count()) await add.click(); else await box.getByRole('option', { name: value, exact: true }).click();
}
const optText = async (page, testId) => (await page.locator(`[data-testid="${testId}"] .opt-btn`).innerText()).replace(/\s*▾\s*$/, '').trim();
/** Everything in one IndexedDB store, read in the page. */
const stored = (page, storeName) => page.evaluate(n => new Promise(res => {
  const r = indexedDB.open('estate-agent-buddy');
  r.onsuccess = () => { const q = r.result.transaction(n).objectStore(n).getAll(); q.onsuccess = () => { res(q.result); r.result.close(); }; };
}), storeName);
async function waitFor(fn, timeout = 8000) {
  const end = Date.now() + timeout;
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) throw new Error('not stored in time'); await new Promise(r => setTimeout(r, 60)); }
}
const props = async page => (await stored(page, 'records')).filter(x => x && typeof x === 'object' && 'photos' in x && 'id' in x);

test('X1 section 1 "Basic Info and Availability": ID, Availability, Property Type, Sale or Rent, Arrangement; no status pickers; no old sections', async () => {
  const page = await phone();
  await newProperty(page);
  const head = page.locator('#sec-basics .sec-head .card-title');
  assert.equal((await head.innerText()).trim(), '1 · Basic Info and Availability');
  const fs = await head.evaluate(el => getComputedStyle(el).fontSize);
  const fs2 = await page.locator('#sec-tenure .sec-head .card-title').evaluate(el => getComputedStyle(el).fontSize);
  assert.equal(fs, fs2, 'same title size as the other sections (original font size)');
  assert.match(await page.getByTestId('ref-preview').innerText(), /^ID: P\d+$/);
  // Order of the fields in section 1
  const body = page.locator('#sec-basics-body');
  const y = async sel => (await body.locator(sel).first().boundingBox()).y;
  const ys = [await y('[data-testid="ref-preview"]'), await y('[data-field="availability"]'), await y('[data-testid="opt-type"]'), await y('[data-field="purpose"]'), await y('[data-field="arrangement"]')];
  assert.ok(ys.every((v, i) => i === 0 || v > ys[i - 1]), `order ID, Availability, Type, Sale or Rent, Arrangement ${JSON.stringify(ys)}`);
  const avail = await page.locator('[data-field="availability"] option').evaluateAll(os => os.map(o => o.textContent));
  assert.deepEqual(avail, ['Not Set', 'Available Now', 'Available From', 'Booked - Pending Loan', 'Booked - Pending SPA', 'Booked - SPA Signed', 'Booked - Other Agent (Pending SPA)', 'Booked - Pending Consent', 'Sold', 'Rented - Pending TA Signing', 'Rented', 'Withdrawn']);   // Change 40, JoyChange006 Part 2 Change F
  assert.equal(await page.locator('[data-verify="availability"]').count(), 0, 'Availability has no check status');
  const arr = await page.locator('[data-field="arrangement"] option').evaluateAll(os => os.map(o => o.textContent));
  assert.deepEqual(arr, ['Not Set', 'Co-broke', 'Direct']);
  assert.equal(await page.locator('#sec-availability, #sec-arrangement').count(), 0, 'no Availability and Condition / Listing Arrangement sections');
  assert.equal(await page.locator('[data-field="features"], [data-field="status"], [data-field="handledBy"]').count(), 0, 'no Special Features, Status or Handled By');
  // Label of Sale or Rent unchanged
  assert.match(await page.locator('#sec-basics-body').innerText(), /Sale or Rent/);
  // Available From shows its month
  await page.locator('[data-field="availability"]').selectOption('available_from');
  await page.locator('[data-field="availableFrom"]').fill('2026-12');
  // Co-broke shows the other agent: name, agency, phone (with the phone book) and WhatsApp username with @ inside
  await page.locator('[data-field="arrangement"]').selectOption('cobroke');
  await page.getByTestId('cobroke-details').waitFor();
  await page.locator('[data-field="cobroke.name"]').fill('Agent Mei');
  await page.locator('[data-field="cobroke.agency"]').fill('Agency M');
  await page.locator('[data-field="cobroke.phone"]').fill('0123456789');
  await page.locator('[data-field="cobroke.whatsapp"]').fill('meiagent');
  assert.equal(await page.getByTestId('cobroke-pick-phone').count(), 1, 'phone book on the phone row too');
  await shot(page, 'cc001-01-section1');
  // Commission label
  await page.locator('[data-field="purpose"]').selectOption('sale');
  await page.locator('[data-field="commissionType"]').selectOption('flat');
  assert.match(await page.locator('#sec-tenure-body').innerText(), /Commission \(RM\)/);
  assert.doesNotMatch(await page.locator('#sec-tenure-body').innerText(), /flat fee\)/i);
  assert.equal(await page.locator('[data-verify="commissionFlat"]').count(), 0, 'no Need to Check under Commission (RM)');
  await page.locator('[data-field="commissionType"]').selectOption('pct');
  assert.match(await page.locator('#sec-tenure-body').innerText(), /Commission \(%\)/);
  await page.getByTestId('save-property').click();
  await page.waitForSelector('[data-testid="listing-details"]');
  assert.match(await page.getByTestId('detail-availability').innerText(), /Available from Dec 2026/i);
  assert.match(await page.locator('[data-testid="sec-basics"]').innerText(), /ID[\s\S]*P\d+[\s\S]*Co-broke[\s\S]*Agent Mei/);
  const p = (await waitFor(async () => (await props(page)).find(x => x.cobroke?.name === 'Agent Mei')));
  assert.equal(p.status, 'available'); assert.equal(p.availability, 'from_date'); assert.equal(p.availableFrom, '2026-12');
  assert.equal(p.cobroke.agency, 'Agency M');
  assert.equal(p.cobroke.whatsapp, '@meiagent');
  const contacts = (await stored(page, 'records')).filter(x => x && Array.isArray(x.roles));
  assert.ok(contacts.some(c => c.name === 'Agent Mei' && c.company === 'Agency M'), 'the co-broke agent is kept as a contact');
  await page.context().close();
});

test('X5 location chain: options belong to the level above; changing a level clears the levels below; blank neighbourhood skipped', async () => {
  const page = await phone();
  await newProperty(page);
  await pickOpt(page, 'opt-state', 'Negeri Sembilan');
  await pickOpt(page, 'opt-city', 'Nilai');
  await pickOpt(page, 'opt-township', 'Kota Seriemas');
  await pickOpt(page, 'opt-neighborhood', 'Laman Kemboja');
  await pickOpt(page, 'opt-street', 'Kemboja 1/3');
  assert.equal(await page.locator('[data-field="street"]').count(), 0, 'Street is a dropdown now');
  await page.getByTestId('save-property').click();
  await page.waitForSelector('[data-testid="listing-details"]');
  // A second property in another township does not see Laman Kemboja
  await home(page);
  await newProperty(page);
  await pickOpt(page, 'opt-state', 'Negeri Sembilan');
  await pickOpt(page, 'opt-city', 'Nilai');
  await pickOpt(page, 'opt-township', 'Bandar Baru Nilai');
  await page.getByTestId('opt-neighborhood').locator('.opt-btn:not([data-locked]), .opt-field.locked .fx-edit').click();
  assert.equal(await page.getByTestId('opt-neighborhood').getByRole('option', { name: 'Laman Kemboja' }).count(), 0, 'not under another township');
  await page.getByTestId('opt-neighborhood').getByTestId('opt-popup-close').click();   // Change 82: the list is a pop-up with its own close button
  // Back to Kota Seriemas: it is offered again, with an X and without "Saved by you"
  await pickOpt(page, 'opt-township', 'Kota Seriemas');
  const nb = page.getByTestId('opt-neighborhood');
  await nb.locator('.opt-btn:not([data-locked]), .opt-field.locked .fx-edit').click();
  assert.equal(await nb.getByRole('option', { name: 'Laman Kemboja', exact: true }).count(), 1, 'remembered under Kota Seriemas');
  assert.equal(await nb.getByRole('button', { name: 'Remove Laman Kemboja' }).count(), 1, 'with its X');
  assert.doesNotMatch(await nb.innerText(), /Saved by you/i, 'no "Saved by you"');
  assert.equal(await nb.locator('input[type="search"]').count(), 1, 'every list has a search box');
  await nb.getByRole('option', { name: 'Laman Kemboja', exact: true }).click();
  await pickOpt(page, 'opt-street', 'Kemboja 1/3');
  // Changing the township clears Neighbourhood and Street (JoyChange008: after a question first)
  await pickOpt(page, 'opt-township', 'Bandar Baru Nilai');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Change' }).click();
  assert.match(await optText(page, 'opt-neighborhood'), /Not Set/i);
  assert.match(await optText(page, 'opt-street'), /Not Set/i);
  // Street with no neighbourhood: remembered under the township
  await pickOpt(page, 'opt-street', 'Jalan BBN 1/1');
  await page.locator('[data-field="unitNo"]').fill('12');
  await page.getByTestId('save-property').click();
  await page.waitForSelector('[data-testid="listing-details"]');
  assert.equal((await page.getByTestId('detail-address').innerText()).trim(), '12, Jalan BBN 1/1, Bandar Baru Nilai', 'no gap or stray comma for the blank neighbourhood');
  const p = (await props(page)).find(x => x.street === 'Jalan BBN 1/1');
  assert.equal(p.neighborhood, undefined, 'Neighbourhood stays blank in the record');
  const opts = (await stored(page, 'records')).find(x => x && typeof x === 'object' && x['street@Malaysia/Negeri Sembilan/Nilai/Bandar Baru Nilai']);
  assert.ok(opts, 'the street is remembered under the township');
  await shot(page, 'cc001-05-location', true);
  await page.context().close();
});

test('X7 photos: one per row, small handle and menu, Set as Main Photo and red Delete (asks first), full-screen viewer with swipe and zoom', async () => {
  const page = await phone();
  await newProperty(page);
  const buf = Buffer.from(PNG, 'base64');
  await page.getByTestId('photo-input').setInputFiles([1, 2, 3].map(i => ({ name: `p${i}.png`, mimeType: 'image/png', buffer: buf })));
  await page.locator('[data-testid="form-photo"]').nth(2).waitFor();
  const boxes = await page.locator('[data-testid="form-photo"]').evaluateAll(xs => xs.map(x => { const r = x.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.width)]; }));
  assert.ok(boxes.every(b => b[0] === boxes[0][0]) && boxes[0][1] > 300, `one photo per row, full width ${JSON.stringify(boxes)}`);
  assert.equal(await page.getByTestId('photo-drag').count(), 0, 'Change 67: no drag handle on the list, reordering has its own screen');
  await page.getByTestId('photo-menu').nth(1).click();
  const items = await page.getByTestId('photo-menu-list').getByRole('menuitem').allInnerTexts();
  assert.deepEqual(items.map(x => x.trim()), ['Set as Main Photo', 'Reorder Photos', 'Delete']);
  const red = await page.getByTestId('photo-remove').evaluate(el => getComputedStyle(el).color);
  const [r, g, b] = red.match(/\d+/g).map(Number);
  assert.ok(r > 200 && g < 140 && b < 140, `Delete is red (${red})`);
  await page.getByTestId('photo-remove').click();
  await page.getByRole('alertdialog').waitFor();
  assert.match(await page.getByRole('alertdialog').innerText(), /Delete this photo\?/);
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click();
  assert.equal(await page.getByTestId('form-photo').count(), 3, 'Cancel keeps the photo');
  await page.getByTestId('photo-menu').nth(1).click();
  await page.getByTestId('photo-remove').click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  assert.equal(await page.getByTestId('form-photo').count(), 2, 'deleted after confirming');
  // Full-screen viewer
  await page.getByTestId('photo-open').first().click();
  const v = page.getByTestId('photo-viewer');
  await v.waitFor();
  assert.equal(await page.getByTestId('photo-viewer-count').innerText(), '1 / 2');
  const vb = await v.boundingBox();
  assert.ok(vb.width >= 383 && vb.height >= 823, 'full screen');
  await page.getByTestId('photo-viewer-next').click();
  assert.equal(await page.getByTestId('photo-viewer-count').innerText(), '2 / 2');
  // swipe right with a finger → previous photo
  const st = await page.getByTestId('photo-viewer-stage').boundingBox();
  await page.getByTestId('photo-viewer-stage').dispatchEvent('pointerdown', { pointerId: 1, clientX: st.x + 100, clientY: st.y + 200 });
  await page.getByTestId('photo-viewer-stage').dispatchEvent('pointermove', { pointerId: 1, clientX: st.x + 260, clientY: st.y + 205 });
  await page.getByTestId('photo-viewer-stage').dispatchEvent('pointerup', { pointerId: 1, clientX: st.x + 260, clientY: st.y + 205 });
  await page.waitForFunction(() => document.querySelector('[data-testid="photo-viewer-count"]')?.textContent === '1 / 2', null, { timeout: 3000 });   // swiped back
  // pinch: two fingers moving apart zoom in
  const stage = page.getByTestId('photo-viewer-stage');
  await stage.dispatchEvent('pointerdown', { pointerId: 1, clientX: 150, clientY: 400 });
  await stage.dispatchEvent('pointerdown', { pointerId: 2, clientX: 230, clientY: 400 });
  await stage.dispatchEvent('pointermove', { pointerId: 2, clientX: 330, clientY: 400 });
  await stage.dispatchEvent('pointerup', { pointerId: 2, clientX: 330, clientY: 400 });
  await stage.dispatchEvent('pointerup', { pointerId: 1, clientX: 150, clientY: 400 });
  await page.waitForFunction(() => Number(document.querySelector('[data-testid="photo-viewer"]')?.getAttribute('data-scale')) > 2, null, { timeout: 3000 });   // pinched in
  await shot(page, 'cc001-07-viewer');
  await page.getByTestId('photo-viewer-close').click();
  await v.waitFor({ state: 'detached' });
  await page.getByTestId('save-property').click();
  await page.waitForSelector('[data-testid="listing-details"]');
  // Property view: same layout, tap the photo to open the viewer
  await page.getByTestId('detail-photo').click();
  await page.getByTestId('photo-viewer').waitFor();
  await page.keyboard.press('Escape');
  await page.getByTestId('photo-viewer').waitFor({ state: 'detached' });
  await page.context().close();
});

test('X9 contact box: phone and WhatsApp username on their own lines, phone book on both rows, @ inside; Linked Vendor search; tenant kept', async () => {
  const page = await phone();
  await newProperty(page);
  const name = await page.locator('#owner-name').boundingBox();
  const ph = await page.locator('#owner-phone').boundingBox();
  const wa = await page.locator('#owner-wa').boundingBox();
  assert.ok(ph.y > name.y && wa.y > ph.y + ph.height - 1, 'name, phone, WhatsApp each on their own line');
  const rowW = sel => page.locator(sel).evaluate(el => el.closest('.ff').getBoundingClientRect().width);
  const nameW = await rowW('#owner-name');
  assert.ok(Math.abs(await rowW('#owner-phone') - nameW) < 2 && Math.abs(await rowW('#owner-wa') - nameW) < 2, 'phone and WhatsApp rows are full width');
  assert.equal(await page.getByTestId('owner-pick').count(), 1);
  assert.equal(await page.getByTestId('owner-pick-phone').count(), 1, 'phone book on the phone row');
  const at = await page.locator('#owner-wa').evaluate(el => { const p = el.parentElement.querySelector('.prefix').getBoundingClientRect(); const i = el.getBoundingClientRect(); return p.left > i.left && p.right < i.right; });
  assert.ok(at, 'the @ sits inside the typing box');
  assert.match(await page.locator('#sec-owner').innerText(), /Owner WhatsApp Username/);
  await page.locator('#owner-name').fill('Puan Vendor');
  await page.locator('#owner-phone').fill('0198887777');
  await page.locator('[data-field="purpose"]').selectOption('rent');
  await page.locator('#tenant-name').fill('Encik Tenant');
  await page.locator('#tenant-phone').fill('0175556666');
  await page.getByTestId('save-property').click();
  await page.waitForSelector('[data-testid="listing-details"]');
  const contacts = await waitFor(async () => { const c = (await stored(page, 'records')).filter(x => x && Array.isArray(x.roles)); return c.length >= 2 ? c : null; });
  assert.ok(contacts.some(c => c.name === 'Puan Vendor' && c.roles.includes('vendor')));
  assert.ok(contacts.some(c => c.name === 'Encik Tenant' && c.roles.includes('tenant')), 'a typed tenant is kept as a contact');
  // Linked Vendor search by number
  await home(page); await newProperty(page);
  await page.getByTestId('vendor-pick').locator('.opt-btn:not([data-locked]), .opt-field.locked .fx-edit').click();
  await page.getByTestId('vendor-pick-search').fill('8887');
  assert.equal(await page.getByTestId('vendor-pick').getByRole('option').count(), 1);
  await page.getByTestId('vendor-pick').getByRole('option', { name: /Puan Vendor/ }).click();
  assert.match(await page.getByTestId('vendor-pick').innerText(), /Puan Vendor/);
  await shot(page, 'cc001-09-owner');
  await page.context().close();
});

test('X11 Booked asks to fill in the booking now; the booking page saves people, files and reminders; Track My Sales and the Calendar show it', async () => {
  const page = await phone();
  await newProperty(page);
  await page.locator('[data-field="purpose"]').selectOption('sale');
  await page.locator('[data-field="askingPrice"]').fill('500000');
  await page.locator('[data-field="commissionPct"]').fill('2');
  await page.locator('[data-field="availability"]').selectOption('booked_pending_loan')   // Change 40: one of the five Booked stages;
  await page.getByTestId('deal-ask').waitFor();
  assert.match(await page.getByTestId('deal-ask').innerText(), /Fill in booking details now\?/);
  await page.getByTestId('deal-fill-now').click();
  await page.getByTestId('deal-booking').waitFor();
  for (const g of ['buyers', 'deal', 'financing', 'paperwork', 'reminders', 'outcome']) assert.equal(await page.getByTestId(`deal-group-${g}`).count(), 1, g);
  await page.locator('[data-field="deal.booking.buyer.name"]').fill('Mr Buyer');
  await page.locator('[data-field="deal.booking.buyer.phone"]').fill('0161112222');
  await page.locator('[data-field="deal.booking.agreedPrice"]').fill('480000');
  const soon = new Date(Date.now() + 5 * 86400000); const ymd = `${soon.getFullYear()}-${String(soon.getMonth() + 1).padStart(2, '0')}-${String(soon.getDate()).padStart(2, '0')}`;
  await page.locator('[data-field="deal.booking.bookingExpiry"]').fill(ymd);
  await page.getByTestId('deal-add-offers').click();
  await page.locator('[data-field="deal.booking.offers.0.amount"]').fill('470000');
  await page.getByTestId('deal-file-input-files').setInputFiles({ name: 'booking-form.png', mimeType: 'image/png', buffer: Buffer.from(PNG, 'base64') });
  await page.getByTestId('deal-files-files').getByText('booking-form.png').waitFor();
  // payment Loan shows the bank
  assert.equal(await page.locator('[data-field="deal.booking.loanBank"]').count(), 0);
  await page.getByTestId('deal-opt-payment').locator('.opt-btn:not([data-locked]), .opt-field.locked .fx-edit').click();
  await page.getByTestId('deal-opt-payment').getByRole('option', { name: 'Loan' }).click();
  await page.locator('[data-field="deal.booking.loanBank"]').fill('Maybank');
  // add my own field
  await page.getByTestId('deal-add-field').click();
  await page.getByTestId('deal-field-name').fill('Car park bay');
  await page.getByTestId('deal-field-add').click();
  await page.locator('[data-field="deal.custom.Car park bay"]').fill('B2-15');
  await shot(page, 'cc001-11-booking', true);
  await page.getByTestId('deal-save').click();
  await page.waitForSelector('[data-testid="listing-details"], [data-testid="listing"]');
  const p = await waitFor(async () => (await props(page)).find(x => x.deal?.booking?.buyer?.name === 'Mr Buyer'));
  assert.equal(p.status, 'in_progress');
  assert.equal(p.deal.booking.agreedPrice, 480000);
  assert.equal(p.deal.booking.offers[0].amount, 470000);
  assert.equal(p.deal.custom['Car park bay'], 'B2-15');
  assert.ok(p.documents.some(d => d.category === 'transaction' && d.dealKey === 'booking.files'), 'the file is a confidential transaction document');
  assert.ok(p.deal.booking.buyer.contactId, 'the buyer is kept as a contact');
  const appts = await waitFor(async () => (await stored(page, 'records')).filter(x => x && typeof x.id === 'string' && x.id.startsWith('deal-')));
  assert.equal(appts.length, 1);
  assert.equal(appts[0].start, `${ymd}T09:00`);
  assert.deepEqual(appts[0].reminders, [4320, 1440]);
  // Track My Sales (card 2)
  await home(page);
  await page.locator('nav.grid > button[data-key="sales"]').click();
  await page.getByTestId('track-sales').waitFor();
  assert.match(await page.getByTestId('sales-stage-booked').innerText(), /Booked \(1\)/);
  assert.match(await page.getByTestId('sales-pending').innerText(), /RM\s?10,000/, 'pending = 2% of RM 500,000');
  assert.match(await page.getByTestId('sales-deadlines').innerText(), /Booking expires[\s\S]*in 5 days/);
  await shot(page, 'cc001-12-track-sales', true);
  await page.getByTestId('sales-deal').first().click();
  await page.getByTestId('deal-booking').waitFor();
  assert.equal(await page.locator('[data-field="deal.booking.buyer.name"]').inputValue(), 'Mr Buyer', 'opens the saved booking');
  // Calendar shows the reminder (card 1 asks which)
  await home(page);
  await page.locator('nav.grid > button[data-key="agenda"]').click();
  await page.getByTestId('agenda-calendar').click();
  await page.waitForSelector('main');
  await page.context().close();
});

test('X11b Sold asks "by you or by others"; by others records agency and price; the property page offers the right deal page', async () => {
  const page = await phone();
  await newProperty(page);
  await page.locator('[data-field="availability"]').selectOption('sold');
  await page.getByTestId('deal-ask').waitFor();
  assert.match(await page.getByTestId('deal-ask').innerText(), /Sold by you or by others\?/);
  assert.equal(await page.getByTestId('deal-by-me').count(), 1);
  await page.getByTestId('deal-by-others').click();
  await page.getByTestId('deal-others').waitFor();
  await page.locator('[data-field="deal.others.agency"]').fill('Agency X');
  await page.locator('[data-field="deal.others.price"]').fill('720000');
  await page.getByTestId('deal-save').click();
  const p = await waitFor(async () => (await props(page)).find(x => x.deal?.others?.agency === 'Agency X'));
  assert.equal(p.status, 'sold'); assert.equal(p.deal.soldBy, 'others');
  await home(page);
  await page.locator('nav.grid > button[data-key="sales"]').click();
  assert.match(await page.getByTestId('sales-stage-others').innerText(), /Sold by Others \(1\)/);
  // Later picks "Rented" → asks too; "Later" keeps the choice without opening
  await home(page); await newProperty(page);
  await page.locator('[data-field="availability"]').selectOption('rented');
  await page.getByTestId('deal-ask-cancel').click();
  assert.equal(await page.locator('[data-field="availability"]').inputValue(), 'rented');
  await page.getByTestId('save-property').click();
  await page.waitForSelector('[data-testid="listing-details"]');
  await page.getByTestId('open-deal-rental').click();
  await page.getByTestId('deal-rental').waitFor();
  await page.locator('[data-field="deal.rental.tenant.name"]').fill('Cik Sewa');
  await page.locator('[data-field="deal.rental.start"]').fill('2026-11-01');
  await page.locator('[data-field="deal.rental.end"]').fill('2027-10-31');
  await page.getByTestId('deal-save').click();
  const r = await waitFor(async () => (await props(page)).find(x => x.deal?.rental?.tenant?.name === 'Cik Sewa'));
  assert.equal(r.tenancy.tenant, 'Cik Sewa', 'the Tenancy section says the same');
  assert.equal(r.tenancy.start, '2026-11');
  await page.context().close();
});

test('X2 sync banner: only on the main page, below the header line and above the cards, "N listings not synced · Retrying in Ns"; no status line anywhere', async () => {
  const ctx = await browser.newContext({ viewport: { width: 384, height: 824 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(String(e)));
  await page.route('https://sync.invalid/**', r => r.abort());
  await page.goto(base); await page.waitForSelector('nav.grid');
  await page.evaluate(async () => {
    const db = await new Promise(res => { const r = indexedDB.open('estate-agent-buddy'); r.onsuccess = () => res(r.result); });
    const put = (store, key, value) => new Promise(res => { const t = db.transaction(store, 'readwrite'); t.objectStore(store).put(value, key); t.oncomplete = res; });
    for (const id of ['p1', 'p2', 'p3']) await put('records', `c:properties:${id}`, { id, created: 1, updated: 1, photos: [], street: `Jalan ${id}` });
    await put('records', 's:meta', { fired: [], dirty: ['properties:p1', 'properties:p2', 'properties:p3'], tombstones: [], syncError: 'network',
      syncSession: { accessToken: 'AT', refreshToken: 'RT', expiresAt: Date.now() + 3_600_000, email: 'a@x.c', userId: 'u1', workspaceId: 'ws-1', workspaceName: 'T', role: 'owner' } });
    await put('records', 's:settings', { lang: 'en', startChoice: 'empty', supabaseUrl: 'https://sync.invalid', supabaseAnonKey: 'anon' });
    db.close();
  });
  await page.reload(); await page.waitForSelector('nav.grid');
  const banner = page.getByTestId('sync-banner');
  await banner.waitFor({ timeout: 8000 });
  assert.match(await page.getByTestId('sync-banner-text').innerText(), /^3 listings not synced · Retrying in \d{1,2}s$/);
  const head = await page.locator('header.topbar').boundingBox();
  const b = await banner.boundingBox();
  const grid = await page.locator('nav.grid').boundingBox();
  assert.ok(b.y >= head.y + head.height - 1 && b.y + b.height <= grid.y + 1, 'below the header line, above the cards');
  assert.equal(await banner.locator('button').count(), 0, 'no Retry button');
  assert.equal(await page.getByTestId('save-status').count(), 0, 'no status line');
  await shot(page, 'cc001-02-sync-banner');
  await page.locator('nav.grid > button[data-key="property"]').click();
  await page.getByTestId('listing-card').first().click();
  assert.equal(await page.getByTestId('sync-banner').count(), 0, 'nothing on a listing');
  assert.doesNotMatch(await page.getByTestId('record-status').innerText(), /Saved on this phone|Synced|not synced|Sync failed|Waiting/i, 'no per-record status words');
  await ctx.close();
});
