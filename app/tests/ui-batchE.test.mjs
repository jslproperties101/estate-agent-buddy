// Screen tests for JoyChange003 Batch E: the AI Assisted Command screen (Changes 55-65). Chromium at Samsung S23 Ultra width
// (384 x 824). The phone's own speech engine (Change 55) is checked with unit tests and on the phone.
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


const FAKE_SPEECH = words => `(() => {
  class R { start() { setTimeout(() => this.onaudiostart?.(), 30); setTimeout(() => { if (${JSON.stringify(words)}) this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: ${JSON.stringify(words)} }], { isFinal: false })] }); }, 300); }
    stop() { setTimeout(() => this.onend?.(), 300); } abort() { this.onend?.(); } }
  window.SpeechRecognition = R;
})();`;

async function phone({ sample = false, speech } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 384, height: 824 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  if (speech !== undefined) await ctx.addInitScript(FAKE_SPEECH(speech));
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(base);
  await page.waitForSelector('nav.grid');
  await page.getByTestId('start-choice').waitFor({ timeout: 5000 });
  await page.getByTestId(sample ? 'start-sample' : 'start-empty').click();
  await page.getByTestId('start-choice').waitFor({ state: 'detached' });
  await page.locator('nav.grid > button[data-key="voice"]').click();
  await page.getByTestId('voice-command').waitFor();
  return page;
}
const box = page => page.getByTestId('voice-cmd').locator('textarea');
async function say(page, text) { await box(page).fill(text); await page.getByTestId('cmd-process').click(); }
const storedRecords = (page, collection) => page.evaluate(c => new Promise(res => {
  const r = indexedDB.open('estate-agent-buddy');
  r.onsuccess = () => {
    const db = r.result;
    const q = db.transaction('records').objectStore('records').openCursor();
    const out = [];
    q.onsuccess = () => { const cur = q.result; if (cur) { if (String(cur.key).startsWith(`c:${c}:`)) out.push(cur.value); cur.continue(); } else { db.close(); res(out); } };
  };
}), collection);
const waitFor = async (fn, ms = 5000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return; await new Promise(r => setTimeout(r, 100)); } assert.fail('timed out'); };

test('BE1 Changes 65 / 56 / 59: logo strip under the title bar, full-width box, then mic - Clear - AI Process centred in one row', async () => {
  const page = await phone();
  const g = await page.evaluate(() => {
    const r = s => document.querySelector(s).getBoundingClientRect();
    const bar = r('header.topbar'), brand = r('[data-testid="cmd-brand"]'), ta = r('[data-testid="voice-cmd"] textarea'), content = r('main.content');
    const mic = r('[data-testid="voice-start"]'), clear = r('[data-testid="cmd-clear"]'), ai = r('[data-testid="cmd-process"]');
    return { bar, brand, ta, content, mic, clear, ai, vh: innerHeight, vw: innerWidth, inContent: !!document.querySelector('[data-testid="cmd-brand"]').closest('main.content'),
      aiBg: getComputedStyle(document.querySelector('[data-testid="cmd-process"]')).backgroundImage };
  });
  assert.ok(g.inContent && g.brand.top >= g.bar.bottom - 1 && g.brand.bottom <= g.ta.top + 1, 'logo strip below the title bar, above the box, scrolls with the page');
  assert.ok(g.brand.height >= g.vh * 0.08 && g.brand.height <= g.vh * 0.16, `about 10% of the screen (${g.brand.height})`);
  assert.ok(g.ta.width >= g.content.width - 48, `the box is full width (${g.ta.width} of ${g.content.width})`);
  assert.ok(g.mic.top >= g.ta.bottom - 1, 'the buttons are below the box');
  assert.ok(g.mic.right <= g.clear.left + 1 && g.clear.right <= g.ai.left + 1, 'mic, then Clear, then AI Process');
  const mid = (g.mic.left + g.ai.right) / 2;
  assert.ok(Math.abs(mid - g.vw / 2) < 24, `the row is centred (${mid} vs ${g.vw / 2})`);
  assert.match(g.aiBg, /gradient/, 'AI Process is gold');
  assert.equal(await page.getByTestId('cmd-process').isDisabled(), true, 'nothing to process yet');
  assert.match(await page.getByTestId('cmd-process').innerText(), /AI Process/i);
  await page.context().close();
});

test('BE2 Change 59: Clear empties the box and the results, and forgets the selection, with no question', async () => {
  const page = await phone({ sample: true });
  await say(page, 'Open buyer list');
  await page.getByTestId('cmd-list-row').first().click();
  await say(page, 'Remind me to send the brochure today');
  await page.getByTestId('step-task').waitFor();
  assert.equal(await page.getByTestId('cmd-selected').count(), 1);
  await page.getByTestId('cmd-clear').click();
  assert.equal(await box(page).inputValue(), '');
  assert.equal(await page.getByTestId('step-task').count(), 0, 'results gone');
  assert.equal(await page.getByTestId('cmd-selected').count(), 0, 'selection gone');
  assert.equal(await page.getByRole('alertdialog').count(), 0, 'no "Are you sure?"');
  await page.context().close();
});

test('BE3 Changes 60 / 61: two commands in one sentence, a card for each; Confirm saves, Undo takes it back; "him" is the buyer just added', async () => {
  const page = await phone();
  await say(page, 'Add a new buyer Lim 012 888 7777 and remind me to call him tomorrow at 3pm');
  await page.getByTestId('step-contact').waitFor();
  assert.deepEqual((await page.getByTestId('step-part').allInnerTexts()).map(x => x.trim()), ['Command 1 of 2', 'Command 2 of 2']);
  assert.match(await page.getByTestId('step-contact').innerText(), /Buyer[\s\S]*Lim[\s\S]*\+60 12-888 7777/);
  assert.match(await page.getByTestId('step-task').innerText(), /Call Lim/);
  await page.getByTestId('step-contact').getByTestId('step-confirm').click();
  assert.match(await page.getByTestId('voice-done').innerText(), /New contact saved/i);
  await page.getByTestId('cmd-undo').waitFor();
  await page.getByTestId('step-task').getByTestId('step-confirm').click();
  assert.match(await page.getByTestId('voice-done').innerText(), /New to-do saved/i);
  // the to-do is linked to the buyer just saved
  await waitFor(async () => (await storedRecords(page, 'tasks')).some(x => x.title === 'Call Lim'));
  const lim = (await storedRecords(page, 'contacts')).find(x => x.name === 'Lim');
  const task = (await storedRecords(page, 'tasks')).find(x => x.title === 'Call Lim');
  assert.ok(lim && task.contactId === lim.id, 'linked to the new Lim');
  assert.equal(lim.phone, '+60 12-888 7777'); assert.deepEqual(lim.roles, ['buyer']);
  await page.getByTestId('cmd-selected').waitFor();
  assert.match(await page.getByTestId('cmd-selected').innerText(), /Lim/);
  // Undo removes the to-do again
  await page.getByTestId('cmd-undo').click();
  assert.match(await page.getByTestId('voice-done').innerText(), /Undone/i);
  await waitFor(async () => !(await storedRecords(page, 'tasks')).some(x => x.title === 'Call Lim'));
  assert.ok((await storedRecords(page, 'contacts')).some(x => x.name === 'Lim'), 'only the last change is undone');
  await page.context().close();
});

test('BE4 Change 64: "open buyer list" shows the list right under the buttons; then "WhatsApp this buyer and remind our appointment" offers filled-in texts; own texts with + Add New, pencil and X', async () => {
  const page = await phone({ sample: true });
  await say(page, 'Open buyer list');
  const list = page.getByTestId('cmd-list');
  await list.waitFor();
  const [row, top] = [await page.getByTestId('cmd-row').boundingBox(), await list.boundingBox()];
  assert.ok(top.y >= row.y + row.height - 1 && top.y - (row.y + row.height) < 80, 'straight below the three buttons');
  await page.getByTestId('cmd-list-search').fill('Buyer K');
  await page.getByTestId('cmd-list-row').first().click();
  assert.match(await page.getByTestId('cmd-selected').innerText(), /Buyer K/);
  await say(page, 'WhatsApp this buyer and remind our appointment');
  const wa = page.getByTestId('wa-picker');
  await wa.waitFor();
  const first = await page.getByTestId('wa-option').first().innerText();
  assert.match(first, /^Hi Buyer K, just a reminder of our appointment/, first);
  // own text
  await page.getByTestId('wa-add').click();
  await page.getByTestId('wa-own-text').fill('Hello {name}, see you soon');
  await page.getByTestId('wa-own-save').click();
  assert.match(await page.getByTestId('wa-own').innerText(), /Hello Buyer K, see you soon/);
  await page.getByTestId('wa-own-edit').click();
  await page.getByTestId('wa-own-text').fill('Hello {name}, see you tomorrow');
  await page.getByTestId('wa-own-save').click();
  assert.match(await page.getByTestId('wa-own').innerText(), /see you tomorrow/);
  await page.getByTestId('wa-own-remove').click();
  assert.equal(await page.getByTestId('wa-own').count(), 0);
  // choose a text: WhatsApp opens to that buyer with it typed in (the app never sends)
  await page.getByTestId('wa-option').first().click();
  const href = await page.getByTestId('wa-open').getAttribute('href');
  assert.match(href, /^https:\/\/wa\.me\/60121112222\?text=Hi%20Buyer%20K/);
  await page.context().close();
});

test('BE5 Changes 61 / 64: pick a property from the list, then "Now change the price of this to RM1.2 million"; Apply saves, Undo restores', async () => {
  const page = await phone({ sample: true });
  await say(page, 'Open property list');
  await page.getByTestId('cmd-list-search').fill('P1004');
  await page.getByTestId('cmd-list-row').first().click();
  await say(page, 'Now change the price of this to RM1.2 million');
  const panel = page.getByTestId('target-panel');
  await panel.waitFor();
  assert.match(await panel.innerText(), /P1004/);
  assert.match(await panel.innerText(), /New: RM 1,200,000/);
  await page.getByTestId('target-apply').click();
  assert.match(await page.getByTestId('voice-done').innerText(), /Property updated/i);
  await page.getByTestId('cmd-undo').click();
  assert.match(await page.getByTestId('voice-done').innerText(), /Undone/i);
  // the property is back to its old price
  await say(page, 'Now change the price of this to RM1.2 million');
  assert.match(await page.getByTestId('target-panel').innerText(), /Now: RM 580,000/);
  await page.context().close();
});

test('BE6 Change 57: How to use: 8 sections (with Search and find), 8 or more examples each, gold boxes and clear gaps; a tap fills the box', async () => {
  const page = await phone();
  await page.getByTestId('cmd-howto').click();
  const groups = page.getByTestId('cmd-howto-group');
  assert.equal(await groups.count(), 8);
  const titles = await groups.locator('.howto-title').allInnerTexts();
  assert.ok(titles.some(x => /search and find/i.test(x)), titles.join(', '));
  for (let i = 0; i < 8; i++) assert.ok(await groups.nth(i).getByTestId('cmd-example').count() >= 8, titles[i]);
  const g = await page.evaluate(() => {
    const gs = [...document.querySelectorAll('[data-testid="cmd-howto-group"]')];
    const ex = gs[0].querySelectorAll('[data-testid="cmd-example"]');
    return { between: gs[1].getBoundingClientRect().top - gs[0].getBoundingClientRect().bottom, inside: ex[1].getBoundingClientRect().top - ex[0].getBoundingClientRect().bottom,
      bg: getComputedStyle(ex[0]).backgroundImage, border: getComputedStyle(ex[0]).borderTopColor };
  });
  assert.ok(g.between >= 20, `gap between sections ${g.between}`);
  assert.ok(g.inside >= 8, `gap between examples ${g.inside}`);
  assert.match(g.bg, /gradient/, 'shiny gold');
  await page.getByTestId('cmd-example').nth(1).click();
  assert.equal(await box(page).inputValue(), 'Add new listing in Sungai Besi');
  await page.context().close();
});

test('BE7 Changes 58 / 62: "Add new listing in Sungai Besi" opens the form with the place filled in; the command is kept in Recent commands', async () => {
  const page = await phone();
  await say(page, 'Add new listing in Sungai Besi, asking price RM500,000');
  await page.getByTestId('proposal').waitFor();
  assert.match(await page.getByTestId('proposal').innerText(), /Sungai Besi[\s\S]*Kuala Lumpur/);
  await page.getByTestId('cmd-clear').click();
  await page.getByTestId('cmd-recent').locator('summary').click();
  assert.match(await page.getByTestId('cmd-recent-row').first().innerText(), /Add new listing in Sungai Besi/);
  await page.getByTestId('cmd-recent-run').first().click();
  await page.getByTestId('step-create-open').click();
  await page.getByTestId('listing-form').waitFor();
  await page.context().close();
});

test('BE8 Change 55: after tapping the mic it says "Getting ready" until the phone listens, then "Listening"; the words wait in the box', async () => {
  const page = await phone({ speech: 'remind me to call lim tomorrow' });
  await page.getByTestId('voice-start').click();
  await page.getByRole('button', { name: 'Use the speech service' }).click();
  const st = page.getByTestId('voice-status');
  await st.waitFor();
  await page.waitForFunction(() => document.querySelector('[data-testid="voice-status"]')?.getAttribute('data-state') === 'listening');
  assert.match(await st.innerText(), /Listening/i);
  await page.getByTestId('voice-stop').click();
  await page.getByTestId('voice-start').waitFor();
  assert.equal(await box(page).inputValue(), 'remind me to call lim tomorrow');
  assert.equal(await page.getByTestId('step-task').count(), 0, 'nothing happens until AI Process');
  // Clear while listening stops it
  await page.getByTestId('voice-start').click();
  await page.getByTestId('voice-stop').waitFor();
  await page.getByTestId('cmd-clear').click();
  await page.getByTestId('voice-start').waitFor();
  assert.equal(await box(page).inputValue(), '');
  await page.context().close();
});
