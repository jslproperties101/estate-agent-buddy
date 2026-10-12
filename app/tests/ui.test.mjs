// Screen tests in a real Chromium browser at Samsung S23 Ultra phone width (384 x 824 CSS pixels).
// Run after `npm run build`. Screenshots go to tests/screens/.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { chromium } from 'playwright';

const DIST = new URL('../dist/', import.meta.url).pathname;
const SHOTS = new URL('./screens/', import.meta.url).pathname;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.map': 'application/json' };
let server, browser, base;
const external = [];
const consoleErrors = [];

before(async () => {
  await mkdir(SHOTS, { recursive: true });
  server = createServer(async (req, res) => {
    const path = join(DIST, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
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
  page.on('request', r => { if (!r.url().startsWith(base) && !r.url().startsWith('blob:') && !r.url().startsWith('data:')) external.push(r.url()); });
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => consoleErrors.push(String(e)));
  await page.goto(base);
  return page;
}
const shot = (page, name, fullPage = true) => page.screenshot({ path: `${SHOTS}${name}.png`, fullPage });
/** Smart Capture is reached from the Property List (Version 1L removed its card from the dashboard). */
async function goCapture(page) {
  if (await page.locator('.lc-tools .capture-link').count() === 0) await page.getByRole('button', { name: 'Property List' }).first().click();
  await page.locator('.lc-tools .capture-link').click();
}

test('U1 dashboard: Estate Agent Buddy, starts with the 12-tile grid, Voice Command at 12, removed cards gone, no sideways scroll', async () => {
  const page = await phone();
  assert.equal(await page.locator('h1').getAttribute('aria-label'), 'Estate Agent Buddy');
  const tiles = page.locator('nav.grid > button');
  assert.equal(await tiles.count(), 12);
  const names = await tiles.evaluateAll(bs => bs.map(b => b.getAttribute('aria-label') || b.textContent.trim()));
  assert.deepEqual(names.slice(0, 8).map(n => n.replace(/Deferred$/, '')), ['To-Do', 'Calendar', 'Opportunities', 'Property List', 'Vendor List', 'Buyer List', 'GPS Assistance', 'Ask Expert']);
  for (const n of [9, 10, 11]) assert.equal(await page.getByRole('button', { name: `Button ${n}: Coming soon` }).isDisabled(), true);
  assert.equal(names[11], 'Voice Command');
  const y = await Promise.all([0, 1, 2, 3].map(i => tiles.nth(i).boundingBox().then(b => Math.round(b.y))));
  assert.equal(y[0], y[1]); assert.equal(y[1], y[2]); assert.ok(y[3] > y[0]);
  const firstInMain = await page.evaluate(() => document.querySelector('main.content > section > *')?.tagName);
  assert.equal(firstInMain, 'NAV', 'the page starts with the 12 tiles');
  for (const gone of ['.progress-card', '.map-card', '.capture-cta']) assert.equal(await page.locator(gone).count(), 0, gone);
  assert.equal(await page.getByText('Road scout').count(), 0);
  assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(8, 8, 10)', 'black background');
  const news = await page.getByRole('button', { name: 'News & Big News' }).boundingBox();
  assert.ok(news && news.x + news.width <= 384, 'news button visible on phone');
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(sideways <= 0, `page scrolls sideways by ${sideways}px`);
  await shot(page, '01-home-phone');
  await shot(page, '01b-home-phone-first-screen', false);
  await page.context().close();
});

test('U2 News & Big News opens from the header and is marked sample', async () => {
  const page = await phone();
  await page.getByRole('button', { name: 'News & Big News' }).click();
  assert.equal(await page.locator('h1').textContent(), 'News & Big News');
  assert.ok(await page.getByText('sample content only').first().isVisible());
  await shot(page, '07-news-phone');
  await page.context().close();
});

test('U3 a real photo gets blank fields, no DETECTED label, Save locked', async () => {
  const page = await phone();
  await goCapture(page);
  await page.getByTestId('file-input').setInputFiles({ name: 'signboard.png', mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64') });
  await page.locator('h1', { hasText: 'Review capture' }).waitFor();
  assert.equal(await page.locator('article.field').count(), 7);
  assert.equal(await page.locator('.chip.none').count(), 7);
  assert.equal(await page.locator('.chip.detected').count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Save reviewed values' }).isDisabled(), true);
  await shot(page, '03-review-real-photo');
  await page.context().close();
});

test('U4 practice capture: each value reviewed; inferred needs a second step; Save unlocks only at the end', async () => {
  const page = await phone();
  await goCapture(page);
  await page.getByRole('button', { name: /practice capture/ }).click();
  const save = page.getByRole('button', { name: 'Save reviewed values' });
  assert.equal(await page.locator('.chip.detected').count(), 0, 'sample data must not be DETECTED');
  assert.equal(await save.isDisabled(), true);
  await shot(page, '04a-review-practice-start');

  const loc = page.getByTestId('field-location');
  await loc.getByRole('button', { name: 'Confirm' }).click();
  assert.ok(await loc.getByText('Confirm it anyway?').isVisible(), 'inferred asks again');
  await shot(page, '04b-inferred-question', false);
  await loc.getByRole('button', { name: 'Cancel' }).click();
  assert.ok(await loc.getByRole('button', { name: 'Confirm' }).isVisible(), 'still pending after Cancel');
  await loc.getByRole('button', { name: 'Confirm' }).click();
  await loc.getByRole('button', { name: 'Yes, confirm' }).click();
  assert.ok(await loc.getByText('Confirmed').isVisible());

  await page.getByTestId('field-unit').getByRole('button', { name: 'Confirm' }).click();
  await page.getByTestId('field-type').getByRole('button', { name: 'Reject' }).click();
  await page.getByTestId('field-availability').getByRole('button', { name: 'Confirm' }).click();
  const price = page.getByTestId('field-price');
  await price.getByRole('button', { name: 'Edit' }).click();
  await price.getByRole('textbox').fill('');
  await price.getByRole('button', { name: 'Use this value' }).click();
  assert.ok(await price.getByRole('alert').isVisible(), 'empty edit refused');
  await price.getByRole('textbox').fill('RM 3,100,000');
  await price.getByRole('button', { name: 'Use this value' }).click();
  await page.getByTestId('field-lot').getByRole('button', { name: 'Leave blank' }).click();
  assert.equal(await save.isDisabled(), true, 'one value (owner phone) still pending');
  await page.getByTestId('field-ownerPhone').getByRole('button', { name: 'Leave blank' }).click();
  assert.equal(await save.isDisabled(), false);
  await shot(page, '04c-review-all-decided');

  await save.click();
  const saved = page.locator('.saved');
  assert.equal(await saved.count(), 1);
  const text = await saved.textContent();
  assert.ok(text.includes('RM 3,100,000') && text.includes('Available') && text.includes('Nilai'));
  assert.ok(!text.includes('Semi-D factory'), 'rejected value not saved');
  await shot(page, '04d-saved');
  await page.context().close();
});

test('U5 delete asks first, can be undone, and permanent delete needs the word typed', async () => {
  const page = await phone();
  await goCapture(page);
  await page.getByRole('button', { name: /practice capture/ }).click();
  await page.getByRole('button', { name: 'Delete capture' }).click();
  assert.ok(await page.getByRole('alertdialog').isVisible());
  await shot(page, '05a-delete-question', false);
  await page.getByRole('button', { name: 'Cancel' }).click();
  assert.equal(await page.getByRole('alertdialog').count(), 0);
  await page.getByRole('button', { name: 'Delete capture' }).click();
  await page.getByRole('button', { name: 'Move to Recently deleted' }).click();
  await page.getByRole('button', { name: 'Undo' }).click();
  assert.equal(await page.locator('li.row').count(), 1, 'undo restored it');

  await page.getByRole('button', { name: /Delete capture: / }).click();
  await page.getByRole('button', { name: 'Move to Recently deleted' }).click();
  assert.equal(await page.locator('li.row').count(), 0);
  await page.getByRole('button', { name: /Recently deleted/ }).click();
  assert.ok(await page.getByText('30 days left').isVisible());
  await page.getByRole('button', { name: 'Delete permanently' }).click();
  const perm = page.locator('button.btn.danger', { hasText: 'Delete permanently' });
  assert.equal(await perm.isDisabled(), true);
  await page.getByRole('textbox').fill('DELET');
  assert.equal(await perm.isDisabled(), true);
  await page.getByRole('textbox').fill('DELETE');
  await shot(page, '05b-permanent-delete', false);
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'Restore' }).click();
  assert.ok(await page.getByText('Nothing here.').isVisible());
  await page.context().close();
});

test('U6 Bahasa Malaysia switch changes the screens', async () => {
  const page = await phone();
  await page.getByRole('button', { name: 'BM' }).click();
  assert.ok(await page.getByRole('button', { name: /Hartanah/ }).first().isVisible());
  assert.ok(await page.getByRole('button', { name: 'Butang 9: Akan datang' }).isVisible());
  await shot(page, '06-home-bm', false);
  await page.context().close();
});

test('U7 readability: no visible text under 14px; buttons at least 44px tall', async () => {
  const page = await phone();
  for (const go of [null, 'capture', 'practice']) {
    if (go === 'capture') await goCapture(page);
    if (go === 'practice') await page.getByRole('button', { name: /practice capture/ }).click();
    const r = await page.evaluate(() => {
      const small = [], short = [];
      for (const el of document.querySelectorAll('body *')) {
        const cs = getComputedStyle(el); const box = el.getBoundingClientRect();
        if (!box.width || cs.visibility === 'hidden') continue;
        const ownText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
        if (ownText && parseFloat(cs.fontSize) < 14) small.push(el.tagName + ':' + el.textContent.trim().slice(0, 20) + ':' + cs.fontSize);
        if (el.tagName === 'BUTTON' && box.height < 44) short.push(el.textContent.trim().slice(0, 20) + ':' + box.height);
      }
      return { small, short };
    });
    assert.deepEqual(r.small, [], 'text under 14px');
    assert.deepEqual(r.short, [], 'buttons under 44px');
  }
  await page.context().close();
});

test('U8 desktop browser width shows the same app', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(base);
  assert.equal(await page.locator('nav.grid > button').count(), 12);
  await page.screenshot({ path: `${SHOTS}08-home-desktop.png`, fullPage: true });
  await ctx.close();
});

const FIX = new URL('./fixtures/', import.meta.url).pathname;
async function toCapture(page) { await goCapture(page); }
async function upload(page, file, input = 'file-input') {
  await page.getByTestId(input).setInputFiles(FIX + file);
}

test('U10 English PDF read on the phone: values with page and exact words; no AI needed', async () => {
  const page = await phone();
  await toCapture(page);
  await upload(page, 'brochure_en.pdf');
  await page.getByTestId('summary').waitFor();
  const src = await page.getByTestId('sources').textContent();
  assert.ok(src.includes('Text read') && src.includes('2 pages'), src);
  const price = page.getByTestId('field-price');
  assert.ok((await price.textContent()).includes('RM 3,400,000'));
  assert.ok((await price.textContent()).includes('brochure_en.pdf p.1'));
  assert.equal(await price.locator('.chip.detected').count(), 1);
  const sum = await page.getByTestId('summary').textContent();
  assert.ok(sum.includes('0 conflicts') && sum.includes('0 missing') && sum.includes('No AI needed'), sum);
  await shot(page, '10-local-pdf-read');
  await page.context().close();
});

test('U11 second file: price conflict shown, Save locked until chosen; duplicate file refused', async () => {
  const page = await phone();
  await toCapture(page);
  await upload(page, 'brochure_en.pdf');
  await page.getByTestId('summary').waitFor();
  await upload(page, 'brochure_bm.docx', 'more-file-input');
  await page.waitForFunction(() => document.querySelectorAll('[data-testid=source-row]').length === 2);
  const sum = await page.getByTestId('summary').textContent();
  assert.ok(sum.includes('1 conflict'), sum);
  const price = page.getByTestId('field-price');
  assert.equal(await price.locator('.chip.conflict').count(), 1);
  assert.equal(await price.locator('.cand').count(), 2);
  await shot(page, '11a-conflict');
  // decide everything except the price: Save must stay locked
  for (const f of await page.locator('article.field').all()) {
    if ((await f.getAttribute('data-testid')) === 'field-price') continue;
    const c = f.getByRole('button', { name: 'Confirm' });
    if (await c.count()) { await c.click(); const yes = f.getByRole('button', { name: 'Yes, confirm' }); if (await yes.count()) await yes.click(); }
    else await f.getByRole('button', { name: 'Leave blank' }).click();
  }
  const save = page.getByRole('button', { name: 'Save reviewed values' });
  assert.equal(await save.isDisabled(), true);
  await price.locator('.cand').nth(1).click();
  assert.equal(await save.isDisabled(), false);
  // the same PDF again, from the capture screen: refused as a duplicate
  await page.getByRole('button', { name: 'Back' }).click();
  await upload(page, 'brochure_en.pdf');
  await page.getByText('Already added').waitFor();
  await shot(page, '11b-duplicate', false);
  await page.context().close();
});

test('U12 SPA sample: marked sensitive, IC and account numbers never shown or used', async () => {
  const page = await phone();
  await toCapture(page);
  await upload(page, 'spa_sample.pdf');
  await page.getByTestId('sensitive-note').waitFor();
  const body = await page.locator('body').textContent();
  assert.ok(!body.includes('680101') && !body.includes('1234 5678 9012'));
  assert.ok((await page.getByTestId('summary').textContent()).includes('never be sent to cloud AI'));
  await shot(page, '12-sensitive');
  await page.context().close();
});

test('U13 scanned PDF and photo: reported as needing OCR on Android; photo made smaller; nothing guessed', async () => {
  const page = await phone();
  await toCapture(page);
  await upload(page, 'scanned.pdf');
  await page.getByTestId('sources').waitFor();
  assert.ok((await page.getByTestId('sources').textContent()).includes('needs the Android app'));
  assert.equal(await page.locator('.chip.detected').count(), 0);
  await page.getByRole('button', { name: 'Back' }).click();
  await upload(page, 'photo_large.png');
  await page.getByText('Photo made smaller to keep').waitFor({ timeout: 30000 });
  const txt = await page.getByTestId('sources').textContent();
  const m = txt.match(/([\d.]+) MB → ([\d.]+) (KB|MB)/);
  assert.ok(m, txt);
  assert.equal(await page.locator('.chip.detected').count(), 0);
  await shot(page, '13-photo-compressed', false);
  await page.context().close();
});

test('U14 typed note: values are STATED; Chinese and Tamil Word files read (draft rules)', async () => {
  const page = await phone();
  await toCapture(page);
  await page.locator('#note').fill('Owner says asking RM 3.1 mil, freehold');
  await page.getByRole('button', { name: 'Add note as a capture' }).click();
  const price = page.getByTestId('field-price');
  await price.waitFor();
  assert.ok((await price.textContent()).includes('RM 3,100,000'));
  assert.equal(await price.locator('.chip.stated').count(), 1);
  await page.getByRole('button', { name: 'Back' }).click();
  await upload(page, 'brochure_zh.docx');
  await page.getByTestId('summary').waitFor();
  assert.ok((await page.getByTestId('field-price').textContent()).includes('RM 3,200,000'));
  assert.ok((await page.getByTestId('field-land').textContent()).includes('8,000 sq ft'));
  await page.getByRole('button', { name: 'Back' }).click();
  await upload(page, 'brochure_ta.docx');
  await page.waitForFunction(() => document.querySelectorAll('[data-testid=source-row]').length === 1 && document.body.textContent.includes('brochure_ta.docx'));
  assert.ok((await page.getByTestId('field-price').textContent()).includes('RM 3,200,000'));
  await page.context().close();
});

test('U15 tapping "Add a photo or document" opens the file picker; PDF still read when background workers are blocked', async () => {
  const ctx = await browser.newContext({ viewport: { width: 384, height: 824 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  // Simulate a strict app or page that does not allow background workers or blob URLs.
  await ctx.addInitScript(() => { window.Worker = undefined; URL.createObjectURL = () => { throw new Error('blocked'); }; });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.goto(base);
  await goCapture(page);
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 5000 }),
    page.locator('label.big-action').tap(),
  ]);
  await chooser.setFiles(FIX + 'brochure_en.pdf');
  await page.getByTestId('summary').waitFor({ timeout: 20000 });
  assert.ok((await page.getByTestId('field-price').textContent()).includes('RM 3,400,000'));
  assert.deepEqual(errs, []);
  await ctx.close();
});

test('U16 built-in sample files work without the file picker: read, add second sample, conflict shown', async () => {
  const page = await phone();
  await goCapture(page);
  await page.getByTestId('sample-files').getByRole('button', { name: 'brochure_en.pdf' }).click();
  await page.getByTestId('summary').waitFor();
  assert.ok((await page.getByTestId('field-price').textContent()).includes('RM 3,400,000'));
  await page.getByTestId('add-sample').getByRole('button', { name: '+ brochure_bm.docx' }).click();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid=source-row]').length === 2);
  assert.ok((await page.getByTestId('summary').textContent()).includes('1 conflict'));
  await shot(page, '16-built-in-samples', false);
  await page.context().close();
});

// A stand-in for the phone's speech service, so the screens can be tested without a microphone.
// Real recognition quality on the S23 Ultra is tested by the owner (phone tests V-P1 to V-P10).
function fakeSpeech(ctxOrPage, script) {
  return ctxOrPage.addInitScript(cfg => {
    class FakeRec {
      constructor() { this.lang = 'en-US'; }
      start() {
        window.__lastLang = this.lang;
        const c = (window.__speechScript ?? cfg);
        setTimeout(() => {
          if (c.error) { this.onerror?.({ error: c.error }); this.onend?.(); return; }
          const text = c[this.lang] ?? c.text;
          this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: text.slice(0, 10) }], { isFinal: false })] });
          this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: text }], { isFinal: true })] });
          this.onend?.();
        }, 50);
      }
      stop() { this.onend?.(); }
      abort() { this.onend?.(); }
    }
    if (cfg.unsupported) { delete window.SpeechRecognition; delete window.webkitSpeechRecognition; }
    else { window.SpeechRecognition = FakeRec; window.webkitSpeechRecognition = FakeRec; }
  }, script);
}
async function voicePage(script, ctxOpts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 384, height: 824 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, ...ctxOpts });
  await fakeSpeech(ctx, script);
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.goto(base);
  await goCapture(page);
  return { ctx, page, errs };
}

test('U17 speech becomes editable text; a misheard word is corrected before review; values are STATED', async () => {
  const { ctx, page, errs } = await voicePage({ 'en-MY': 'Two-storey terrace in Nilai, asking five hundred and eighty thousand ringgit, for bedrooms, owner wants to sell urgently' });
  const panel = page.getByTestId('voice-panel');
  await panel.getByRole('button', { name: 'Start speaking' }).click();
  await panel.getByText('How speech becomes text').waitFor();
  await shot(page, '17a-voice-notice', false);
  await panel.getByRole('button', { name: 'Use the speech service' }).click();
  const box = page.locator('#voice-text');
  await page.waitForFunction(() => document.querySelector('#voice-text').value.includes('urgently'));
  assert.equal(await page.evaluate(() => window.__lastLang), 'en-MY');
  // the recogniser heard "for bedrooms": the person corrects it
  await box.fill((await box.inputValue()).replace('for bedrooms', 'four bedrooms'));
  await shot(page, '17b-voice-text', false);
  await panel.getByRole('button', { name: 'Review property details' }).click();
  const price = page.getByTestId('field-price');
  await price.waitFor();
  assert.ok((await price.textContent()).includes('RM 580,000'));
  assert.equal(await price.locator('.chip.stated').count(), 1);
  assert.ok((await page.getByTestId('field-bedrooms').textContent()).includes('4'));
  assert.ok((await page.getByTestId('field-type').textContent()).includes('Terrace house'));
  assert.ok((await page.getByTestId('field-floors').textContent()).includes('2'));
  assert.ok((await page.getByTestId('field-remarks').textContent()).includes('Owner wants to sell urgently'));
  assert.equal(await page.getByRole('button', { name: 'Save reviewed values' }).isDisabled(), true, 'nothing saved before review');
  await shot(page, '17c-voice-review');
  assert.deepEqual(errs, []);
  await ctx.close();
});

test('U18 Bahasa Malaysia speech', async () => {
  const { ctx, page } = await voicePage({ 'ms-MY': 'Rumah teres dua tingkat di Nilai, harga lima ratus lapan puluh ribu ringgit, empat bilik tidur, pegangan bebas' });
  const panel = page.getByTestId('voice-panel');
  await panel.getByRole('button', { name: 'Bahasa Malaysia' }).click();
  await panel.getByRole('button', { name: 'Start speaking' }).click();
  await panel.getByRole('button', { name: 'Use the speech service' }).click();
  await page.waitForFunction(() => document.querySelector('#voice-text').value.includes('pegangan'));
  assert.equal(await page.evaluate(() => window.__lastLang), 'ms-MY');
  await panel.getByRole('button', { name: 'Review property details' }).click();
  await page.getByTestId('field-price').waitFor();
  assert.ok((await page.getByTestId('field-price').textContent()).includes('RM 580,000'));
  assert.ok((await page.getByTestId('field-tenure').textContent()).includes('Freehold'));
  await ctx.close();
});

test('U19 microphone refused, no network, not supported, offline: clear messages; typing still works', async () => {
  for (const [script, expect] of [[{ error: 'not-allowed' }, 'Microphone permission was refused'], [{ error: 'network' }, 'could not be reached']]) {
    const { ctx, page } = await voicePage(script);
    const panel = page.getByTestId('voice-panel');
    await panel.getByRole('button', { name: 'Start speaking' }).click();
    await panel.getByRole('button', { name: 'Use the speech service' }).click();
    await page.getByTestId('voice-error').waitFor();
    assert.ok((await page.getByTestId('voice-error').textContent()).includes(expect));
    assert.equal(await page.locator('#voice-text').inputValue(), '', 'nothing invented');
    await ctx.close();
  }
  const { ctx, page } = await voicePage({ unsupported: true });
  const panel = page.getByTestId('voice-panel');
  await panel.getByRole('button', { name: 'Start speaking' }).click();
  assert.ok((await page.getByTestId('voice-error').textContent()).includes('not available'));
  await page.locator('#voice-text').fill('Semi-D factory in Sepang, asking RM 3.2 mil');
  await panel.getByRole('button', { name: 'Review property details' }).click();
  await page.getByTestId('field-price').waitFor();
  assert.ok((await page.getByTestId('field-price').textContent()).includes('RM 3,200,000'));
  await page.getByRole('button', { name: 'Back' }).click();
  await ctx.setOffline(true);
  await page.getByRole('button', { name: 'Back' }).click();
  await goCapture(page);
  await page.getByText('No internet: the speech service usually needs internet').waitFor();
  await ctx.close();
});

test('U20 voice note: attached automatically only when reliable; otherwise the person chooses; location refused handled', async () => {
  // Near Lot 21 (sample), good accuracy: suggested automatically, still needs Save
  let { ctx, page } = await voicePage({ text: 'Three factory units side by side, corner unit available, access road is wide enough for lorries' },
    { geolocation: { latitude: 2.82512, longitude: 101.81022, accuracy: 8 }, permissions: ['geolocation'] });
  let panel = page.getByTestId('voice-panel');
  await panel.getByRole('button', { name: 'Start speaking' }).click();
  await panel.getByRole('button', { name: 'Use the speech service' }).click();
  await page.waitForFunction(() => document.querySelector('#voice-text').value.includes('lorries'));
  await panel.getByRole('button', { name: 'Save as a voice note' }).click();
  await page.getByRole('button', { name: 'Use my location' }).click();
  await page.getByTestId('auto-attach').waitFor();
  assert.ok((await page.getByTestId('auto-attach').textContent()).includes('Lot 21'));
  await shot(page, '20a-voice-note-auto', false);
  await page.getByRole('button', { name: 'Save note' }).click();
  await page.getByTestId('voice-notes').waitFor();
  assert.ok((await page.getByTestId('voice-notes').textContent()).includes('Attached to: Lot 21'));
  await ctx.close();

  // Between Units 6 and 7: two within 50 m, so the person must choose
  ({ ctx, page } = await voicePage({ text: 'corner unit available' }, { geolocation: { latitude: 2.8205, longitude: 101.8034, accuracy: 8 }, permissions: ['geolocation'] }));
  await page.locator('#voice-text').fill('corner unit available');
  await page.getByTestId('voice-panel').getByRole('button', { name: 'Save as a voice note' }).click();
  await page.getByRole('button', { name: 'Use my location' }).click();
  await page.getByTestId('attach-reason').waitFor();
  assert.ok((await page.getByTestId('attach-reason').textContent()).includes('More than one property'));
  assert.equal(await page.getByRole('button', { name: 'Save note' }).isDisabled(), true);
  await page.getByRole('radio', { name: /Unit 7/ }).click();
  await page.getByRole('button', { name: 'Save note' }).click();
  assert.ok((await page.getByTestId('voice-notes').textContent()).includes('Unit 7'));
  await ctx.close();

  // Location permission refused
  ({ ctx, page } = await voicePage({ text: 'x' }));
  await page.locator('#voice-text').fill('wide access road');
  await page.getByTestId('voice-panel').getByRole('button', { name: 'Save as a voice note' }).click();
  await page.getByRole('button', { name: 'Use my location' }).click();
  await page.getByText(/Location permission was refused|not available|took too long/).waitFor();
  await ctx.close();
});

const PNG1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
async function smallSizesOk(page) {
  return page.evaluate(() => {
    const small = [], short = [];
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el); const box = el.getBoundingClientRect();
      if (!box.width || cs.visibility === 'hidden' || cs.opacity === '0') continue;
      const ownText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
      if (ownText && parseFloat(cs.fontSize) < 14) small.push(el.tagName + ':' + el.textContent.trim().slice(0, 20));
      if ((el.tagName === 'BUTTON' || el.tagName === 'SELECT') && box.height < 44) short.push(el.textContent.trim().slice(0, 20) + ':' + box.height);
    }
    return { small, short };
  });
}

test('U21 Property List: large cards with the agreed fields, grid of three columns, layout remembered, readable sizes', async () => {
  const page = await phone();
  await page.getByRole('button', { name: 'Property List' }).first().click();
  assert.equal(await page.locator('h1').textContent(), 'Property List');
  const cards = page.getByTestId('listing-card');
  assert.equal(await cards.count(), 10);
  const t = await cards.first().textContent();
  for (const x of ['P-1001', 'Corner semi-D factory, Nilai Industrial Park', 'Semi-D factory · Nilai', 'RM 3,200,000', '8,000 sq ft land', '6,500 sq ft built-up', '4 parking', 'Available', 'For sale', 'Available now', 'Freehold', 'Owner: Owner A (sample)', 'Open record', 'Sample picture']) assert.ok(t.includes(x), x + ' in ' + t);
  const terrace = await cards.nth(3).textContent();
  for (const x of ['4 beds', '3 baths', '2 parking']) assert.ok(terrace.includes(x), x);
  assert.ok((await cards.nth(7).textContent()).includes('RM 1,800 / month'), 'rental shows monthly rent');
  assert.ok((await cards.nth(5).textContent()).includes('Tenanted until Jun 2027'));
  assert.ok((await cards.nth(2).textContent()).includes('years remaining'));
  assert.equal(await cards.first().locator('img').count(), 1, 'every card has a picture');
  assert.deepEqual(await smallSizesOk(page), { small: [], short: [] });
  await shot(page, '21a-list-large', false);
  await shot(page, '21a-list-large-full');
  await page.getByRole('button', { name: 'Grid' }).click();
  assert.equal(await page.getByRole('button', { name: 'Grid' }).getAttribute('aria-pressed'), 'true');
  const ys = await Promise.all([0, 1, 2, 3].map(i => cards.nth(i).boundingBox().then(b => Math.round(b.y))));
  assert.equal(ys[0], ys[1]); assert.equal(ys[1], ys[2]); assert.ok(ys[3] > ys[0], 'three columns');
  assert.ok((await cards.first().textContent()).includes('RM 3.2m'));
  assert.deepEqual(await smallSizesOk(page), { small: [], short: [] });
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(sideways <= 0, `grid scrolls sideways by ${sideways}px`);
  await shot(page, '21b-list-grid', false);
  // the chosen layout is remembered on this phone
  await page.reload();
  await page.getByRole('button', { name: 'Property List' }).first().click();
  assert.equal(await page.getByRole('button', { name: 'Grid' }).getAttribute('aria-pressed'), 'true');
  await page.getByRole('button', { name: 'Open record: 5 acres oil palm land, Labu' }).click();
  await page.getByTestId('listing-details').waitFor();
  await page.context().close();
});

test('U22 filters: location, sale or rent, category, type, price, beds, baths, tenure, lot type, status', async () => {
  const page = await phone();
  await page.getByRole('button', { name: 'Property List' }).first().click();
  const count = async () => page.getByTestId('listing-card').count();
  await page.getByRole('textbox', { name: 'Location' }).fill('Sepang');
  assert.equal(await count(), 1);
  await page.getByRole('textbox', { name: 'Location' }).fill('');
  await page.getByRole('button', { name: /^Filters/ }).click();
  const panel = page.getByTestId('filter-panel');
  const pick = (name, v) => panel.getByRole('combobox', { name, exact: true }).selectOption(v);
  await pick('Type', 'Semi-D factory');
  assert.equal(await count(), 2);
  await pick('Status', 'available');
  assert.equal(await count(), 1);
  await panel.getByRole('button', { name: 'Clear all' }).click();
  assert.equal(await count(), 10);
  await pick('Sale or rent', 'rent');
  assert.equal(await count(), 3);
  await pick('Category', 'industrial');
  assert.equal(await count(), 1);
  await shot(page, '22-filters', false);
  await panel.getByRole('button', { name: 'Clear all' }).click();
  await panel.getByRole('textbox', { name: 'Price (RM) Max' }).fill('1,000,000');
  assert.equal(await count(), 2);
  await pick('Bedrooms (at least)', '4');
  await pick('Bathrooms (at least)', '4');
  assert.equal(await count(), 1);
  await panel.getByRole('button', { name: 'Clear all' }).click();
  await pick('Tenure', 'leasehold');
  assert.equal(await count(), 5);
  await pick('Lot type', 'corner');
  assert.equal(await count(), 1);
  assert.equal(await page.getByRole('button', { name: /^Filters · 2/ }).count(), 1);
  await page.context().close();
});

test('U23 full property record: key facts, type-specific sections, marketing, documents, viewings, still-missing list', async () => {
  const page = await phone();
  await page.getByRole('button', { name: 'Property List' }).first().click();
  await page.getByRole('button', { name: 'Open record: Corner semi-D factory, Nilai Industrial Park' }).click();
  const det = page.getByTestId('listing-details');
  const text = await det.textContent();
  for (const x of ['P-1001', 'Building specifications', '28 ft', '150 kVA', 'PropertyGuru', 'Live', 'Facebook Marketplace', 'Needs update', 'Unit 7 brochure (sample).pdf', 'Buyer K (sample)', 'Attended', 'Linked to the shared vendor record.', 'Commission about RM 64,000', 'All the main details are filled in.']) assert.ok(text.includes(x), x);
  assert.equal(await det.getByRole('link', { name: 'Call' }).getAttribute('href'), 'tel:+60123456789');
  assert.deepEqual(await smallSizesOk(page), { small: [], short: [] });
  await shot(page, '23a-record');
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Open record: Detached factory on 1 acre, Nilai' }).click();
  assert.ok((await page.getByTestId('years-left').textContent()).includes(`${2077 - new Date().getFullYear()} years remaining`));
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Open record: 5 acres oil palm land, Labu' }).click();
  const land = await page.getByTestId('listing-details').textContent();
  assert.ok(land.includes('5.00 acres (217,800 sq ft)') && land.includes('Oil palm (mature)'));
  assert.ok(!land.includes('Bedrooms'), 'no house fields on land');
  await page.context().close();
});

test('U24 Add Property: fields follow the type; photos, leasehold, sale and rent, tenancy, vendor, co-broke, advert, documents, viewing; saved and listed', async () => {
  const page = await phone();
  await page.getByRole('button', { name: 'Property List' }).first().click();
  await page.getByRole('button', { name: 'Add Property' }).click();
  await page.getByTestId('listing-form').waitFor();
  const field = k => page.locator(`[data-field="${k}"]`);
  const has = async k => (await field(k).count()) > 0;
  // conditional fields
  await field('type').selectOption('Agricultural land');
  assert.equal(await has('bedrooms'), false); assert.equal(await has('builtUpSqft'), false); assert.equal(await has('currentUse'), true);
  await field('type').selectOption('Semi-D factory');
  assert.equal(await has('ceilingFt'), true); assert.equal(await has('bedrooms'), false); assert.equal(await has('loadingBays'), true);
  await field('type').selectOption('Condo / apartment');
  assert.equal(await has('landSqft'), false); assert.equal(await has('bedrooms'), true); assert.equal(await has('maintenanceFee'), true);
  await field('type').selectOption('Terrace house');
  assert.equal(await has('landSqft'), true); assert.equal(await has('ceilingFt'), false);
  // photos with main photo
  await page.getByTestId('photo-input').setInputFiles([{ name: 'front.png', mimeType: 'image/png', buffer: PNG1 }, { name: 'side.png', mimeType: 'image/png', buffer: PNG1 }]);
  await page.waitForFunction(() => document.querySelectorAll('[data-testid=form-photo]').length === 2);
  await page.getByRole('button', { name: 'Make main' }).click();
  assert.equal(await page.locator('.pg-item').nth(1).getAttribute('class'), 'pg-item main');
  await field('purpose').selectOption('sale_or_rent');
  await field('headline').fill('End-lot terrace near Nilai 3');
  await field('address').fill('Jalan Mawar 5, Taman Mawar');
  await field('area').fill('Nilai');
  await field('landSqft').fill('1,400'); await field('builtUpSqft').fill('1650');
  await field('bedrooms').fill('3'); await field('bathrooms').fill('2'); await field('parking').fill('2');
  await field('lotType').selectOption('end');
  await field('tenure').selectOption('leasehold');
  await field('leaseExpiryYear').fill('2090');
  assert.ok((await page.getByTestId('form-years-left').textContent()).includes(`${2090 - new Date().getFullYear()} years remaining`));
  await field('askingPrice').fill('650000');
  await field('commissionPct').fill('2.5');
  assert.ok((await page.getByTestId('form-commission').textContent()).includes('RM 16,250'));
  await field('monthlyRent').fill('2300');
  await field('securityDepositMonths').fill('2'); await field('utilityDepositMonths').fill('0.5');
  assert.ok((await page.getByTestId('form-deposit').textContent()).includes('RM 5,750'));
  assert.equal(await page.getByTestId('sec-tenancy').count(), 1, 'tenancy shown for rentals');
  await field('tenancy.tenant').fill('Tenant Z (sample)');
  await field('tenancy.end').fill('2027-03');
  await field('availability').selectOption('tenanted');
  await field('ownerName').fill('Encik Rahman (sample)');
  await field('ownerPhone').fill('0123456789');
  await field('arrangement').selectOption('cobroke');
  await field('arrangementNote').fill('Agency Q (sample)');
  await field('status').selectOption('in_progress');
  await field('handledBy').fill('Me (sample)');
  assert.equal(await field('ownerPhone').inputValue(), '+60 12-345 6789', 'phone tidied when leaving the box');
  // marketing: one advert and one extra field
  await page.getByRole('button', { name: '+ Add advert' }).click();
  await page.getByRole('combobox', { name: 'Platform 1' }).selectOption('iProperty');
  await page.getByRole('textbox', { name: 'Listing reference 1' }).fill('IP-TEST-1');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no sideways scroll with date boxes');
  await page.getByRole('button', { name: '+ Add field' }).click();
  await page.getByRole('textbox', { name: 'Name of the new field' }).fill('Signboard put up');
  await page.getByRole('button', { name: 'Create field' }).click();
  await page.getByRole('textbox', { name: 'Signboard put up' }).fill('Yes, 10 Oct');
  // documents: a title document is marked confidential
  assert.ok((await page.getByTestId('doc-title').textContent()).includes('Confidential'));
  await page.getByTestId('doc-input-title').setInputFiles({ name: 'title-copy.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 sample') });
  assert.ok((await page.getByTestId('doc-title').textContent()).includes('title-copy.pdf'));
  // a viewing
  await page.getByRole('button', { name: '+ Add viewing' }).click();
  await page.getByRole('textbox', { name: 'Viewer 1' }).fill('Buyer W (sample)');
  await field('notes').fill('Owner prefers weekday viewings.');
  assert.deepEqual(await smallSizesOk(page), { small: [], short: [] });
  await shot(page, '24a-form');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByTestId('listing-details').waitFor();
  const det = await page.getByTestId('listing-details').textContent();
  for (const x of ['P-1011', 'End-lot terrace near Nilai 3', 'RM 650,000', 'RM 2,300 / month', 'Sale in progress', 'Me (sample)', 'Encik Rahman (sample)', '+60 12-345 6789',
    'Linked to the shared vendor record.', 'Co-broke', 'Agency Q (sample)', 'iProperty', 'IP-TEST-1', 'Signboard put up', 'Yes, 10 Oct', 'title-copy.pdf', 'Buyer W (sample)', 'Tenant Z (sample)', 'Mar 2027', 'Owner prefers weekday viewings.']) assert.ok(det.includes(x), x);
  await shot(page, '24b-saved-record');
  await page.getByRole('button', { name: 'Back' }).click();
  assert.equal(await page.getByTestId('listing-card').count(), 11);
  const first = page.getByTestId('listing-card').first();
  assert.ok((await first.textContent()).includes('End-lot terrace near Nilai 3'));
  assert.ok(!(await first.textContent()).includes('Sample picture'), 'the real main photo is used');
  await page.context().close();
});

test('U25 everything optional; at most 10 extra marketing fields; fill from words never overwrites; edit persists', async () => {
  const page = await phone();
  await page.getByRole('button', { name: 'Property List' }).first().click();
  await page.getByRole('button', { name: 'Add Property' }).click();
  for (let i = 1; i <= 10; i++) {
    await page.getByRole('button', { name: '+ Add field' }).click();
    await page.getByRole('textbox', { name: 'Name of the new field' }).fill(`Field ${i}`);
    await page.getByRole('button', { name: 'Create field' }).click();
  }
  assert.equal(await page.getByRole('button', { name: '+ Add field' }).count(), 0, 'no Add field button after 10');
  assert.equal(await page.getByTestId('custom-full').count(), 1);
  await page.locator('[data-field=type]').selectOption('Bungalow');
  await page.getByTestId('words').locator('summary').click();
  await page.getByRole('textbox', { name: 'Fill from what you say or type' }).fill('Two-storey terrace in Nilai, asking five hundred and eighty thousand ringgit, four bedrooms, freehold');
  await page.getByRole('button', { name: 'Fill empty fields' }).click();
  await page.getByText(/fields? filled from your words/).waitFor();
  assert.equal(await page.locator('[data-field=type]').inputValue(), 'Bungalow', 'not overwritten');
  assert.equal(await page.locator('[data-field=askingPrice]').inputValue(), '580000');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'Add Property' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByTestId('listing-details').waitFor();
  const empty = await page.getByTestId('listing-details').textContent();
  assert.ok(empty.includes('Untitled property') && empty.includes('Price not set'));
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Open record: Renovated 2-storey terrace, Taman Desa Nilai' }).click();
  await page.getByRole('button', { name: 'Edit' }).click();
  assert.equal(await page.locator('[data-field=bedrooms]').inputValue(), '4');
  await page.locator('[data-field=askingPrice]').fill('560000');
  await page.getByRole('button', { name: 'Save' }).click();
  const after = await page.getByTestId('listing-details').textContent();
  assert.ok(after.includes('RM 560,000') && after.includes('Edited in the form'));
  await page.context().close();
});

test('U26 voice command creates a proposed property: reviewed, unticked values left out, then checked in the form before saving', async () => {
  const page = await phone();
  await page.getByRole('button', { name: 'Property List' }).first().click();
  await page.getByRole('button', { name: 'Voice' }).click();
  assert.ok((await page.getByTestId('voice-cmd').textContent()).includes('Gemini is not connected'));
  await page.getByRole('textbox', { name: 'Command (you can edit it)' }).fill('Create a new semi-detached factory in Salak Tinggi, land area 20,000 square feet, built-up 12,000 square feet, asking price RM3.2 million, leasehold.');
  await page.getByRole('button', { name: 'Show proposed changes' }).click();
  const prop = page.getByTestId('proposal');
  const pt = await prop.textContent();
  for (const x of ['Semi-D factory', 'Salak Tinggi', '20,000 sq ft', '12,000 sq ft', 'RM 3,200,000', 'Leasehold']) assert.ok(pt.includes(x), x);
  assert.equal(await prop.locator('li').count(), 6, 'only what was said');
  await shot(page, '26a-voice-proposal', false);
  await prop.getByRole('checkbox', { name: 'Use: Tenure' }).uncheck();
  await prop.getByRole('button', { name: 'Open in the form to review' }).click();
  await page.getByTestId('listing-form').waitFor();
  assert.equal(await page.locator('[data-field=type]').inputValue(), 'Semi-D factory');
  assert.equal(await page.locator('[data-field=askingPrice]').inputValue(), '3200000');
  assert.equal(await page.locator('[data-field=tenure]').inputValue(), '', 'unticked value not used');
  assert.ok((await page.locator('.small-chip').count()) >= 5, 'marked "from your words" for checking');
  await shot(page, '26b-voice-to-form', false);
  await page.getByRole('button', { name: 'Save' }).click();
  const det = await page.getByTestId('listing-details').textContent();
  assert.ok(det.includes('Salak Tinggi') && det.includes('Changed by voice or text command'));
  await page.context().close();
});

test('U27 voice changes inside a property record: before and after shown; asks when details are missing; nothing saved without review', async () => {
  const page = await phone();
  await page.getByRole('button', { name: 'Property List' }).first().click();
  await page.getByRole('button', { name: 'Open record: Corner semi-D factory, Nilai Industrial Park' }).click();
  await page.getByRole('button', { name: 'Voice' }).click();
  const cmd = page.getByRole('textbox', { name: 'Command (you can edit it)' });
  await cmd.fill('Change the asking price to RM3 million');
  await page.getByRole('button', { name: 'Show proposed changes' }).click();
  const pt = await page.getByTestId('proposal').textContent();
  assert.ok(pt.includes('Now: RM 3,200,000') && pt.includes('New: RM 3,000,000'), pt);
  assert.ok((await page.getByTestId('listing-details').locator('.lc-price').first().textContent()).includes('3,200,000'), 'not saved yet');
  await shot(page, '27a-voice-change', false);
  await page.getByRole('button', { name: 'Save selected changes' }).click();
  assert.ok((await page.getByTestId('listing-details').locator('.lc-price').first().textContent()).includes('3,000,000'));
  await cmd.fill('Add three parking bays');
  await page.getByRole('button', { name: 'Show proposed changes' }).click();
  assert.ok((await page.getByTestId('proposal').textContent()).includes('Now: 4New: 7'));
  await page.getByRole('button', { name: 'Save selected changes' }).click();
  await cmd.fill('Update the tenancy information');
  await page.getByRole('button', { name: 'Show proposed changes' }).click();
  assert.ok((await page.getByTestId('voice-msg').textContent()).includes('Which tenancy details?'));
  await cmd.fill("Add a note about the owner's instructions");
  await page.getByRole('button', { name: 'Show proposed changes' }).click();
  const note = page.getByRole('textbox', { name: 'Note' });
  assert.equal(await note.inputValue(), "Owner's instructions: ");
  await note.fill("Owner's instructions: viewings on weekdays only");
  await page.getByRole('button', { name: 'Show proposed note' }).click();
  await page.getByRole('button', { name: 'Save selected changes' }).click();
  const det = await page.getByTestId('listing-details').textContent();
  assert.ok(det.includes("Owner open to offers. Keys with guard house.") && det.includes("Owner's instructions: viewings on weekdays only"), 'earlier notes kept');
  assert.ok(det.includes('Changed by voice or text command (askingPrice)'));
  assert.ok((await page.getByTestId('listing-details').locator('.kf').filter({ hasText: 'Parking' }).textContent()).includes('7'));
  await page.context().close();
});

test('U28 Voice Command button (12): finds properties from sample data; later-stage commands say so and change nothing', async () => {
  const page = await phone();
  await page.getByRole('button', { name: 'Voice Command' }).click();
  assert.equal(await page.locator('h1').textContent(), 'Voice Command');
  const cmd = page.getByRole('textbox', { name: 'Command (you can edit it)' });
  await cmd.fill('Add a new buyer');
  await page.getByRole('button', { name: 'Show proposed changes' }).click();
  assert.ok((await page.getByTestId('voice-msg').textContent()).includes('Buyer List is built in a later stage'));
  await cmd.fill('Show my appointments tomorrow');
  await page.getByRole('button', { name: 'Show proposed changes' }).click();
  assert.ok((await page.getByTestId('voice-msg').textContent()).includes('Calendar is built in a later stage'));
  await shot(page, '28-voice-command', false);
  await cmd.fill('Find the factory in Salak Tinggi');
  await page.getByRole('button', { name: 'Show proposed changes' }).click();
  assert.equal(await page.locator('h1').textContent(), 'Property List');
  assert.equal(await page.getByTestId('listing-card').count(), 1);
  assert.ok((await page.getByTestId('listing-card').textContent()).includes('Detached factory for rent, Salak Tinggi'));
  await page.context().close();
});

test('U9 no outside network requests (works offline) and no script errors', async () => {
  assert.deepEqual(external, []);
  assert.deepEqual(consoleErrors, []);
  await writeFile(`${SHOTS}README.txt`, 'Screenshots from the automated screen tests (Chromium, 384 x 824 phone size, and 1280 desktop).\n');
});
