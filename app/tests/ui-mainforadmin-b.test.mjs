// MainForAdmin-B screen tests (accounts and security) in a real Chromium browser at phone width. The company's database
// is a stand-in that answers like the real functions (eab_my_account, eab_accept_terms, eab_log_login, eab_set_my_licence).
// Not a live Supabase project and not a phone.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { chromium } from 'playwright';

const DIST = new URL('../dist/', import.meta.url).pathname;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.map': 'application/json' };
const SB = 'https://mfab-test.supabase.co';
let server, browser, base;

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
after(async () => { await browser?.close(); server?.close(); });

/** A phone signed in as one account. `account(body)` answers eab_my_account; every rpc call is recorded. */
async function phone({ account, signedInAt, settings = {}, profile, local = {} } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 384, height: 824 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const calls = [];
  const user = { id: 'u-mb', email: 'mb@x.com', metadata: { full_name: 'Test', country: 'Malaysia' } };
  await ctx.route(`${SB}/**`, async route => {
    const req = route.request(); const url = new URL(req.url());
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'content-type': 'application/json' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (url.pathname === '/auth/v1/user') return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ id: user.id, email: user.email, user_metadata: user.metadata }) });
    const m = /\/rest\/v1\/rpc\/(\w+)$/.exec(url.pathname);
    if (m) {
      const body = JSON.parse(req.postData() || '{}');
      calls.push({ fn: m[1], body });
      if (m[1] === 'eab_my_account' && account) return route.fulfill({ status: 200, headers: cors, body: JSON.stringify(account()) });
      if (m[1] === 'eab_accept_terms') return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ ...account(), terms: { version: body.p_version, at: new Date().toISOString() } }) });
      if (['eab_log_login', 'eab_set_my_licence', 'eab_set_marketing'].includes(m[1])) return route.fulfill({ status: 200, headers: cors, body: '1' });
    }
    return route.fulfill({ status: 500, headers: cors, body: '{"message":"not part of this test"}' });
  });
  for (const [k, v] of Object.entries(local)) await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), [k, v]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(base); await page.waitForSelector('nav.grid');
  await page.getByTestId('start-empty').click();
  await page.evaluate(async ({ SB, user, settings, profile, signedInAt }) => {
    const db = await new Promise(res => { const r = indexedDB.open('estate-agent-buddy'); r.onsuccess = () => res(r.result); });
    const put = (store, key, val) => new Promise((res, rej) => { const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).put(val, key); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    await put('records', 's:meta', { fired: [], dirty: [], tombstones: [], ownerChecked: true, syncWorkspaceId: 'ws1',
      syncSession: { accessToken: 'tok', refreshToken: 'r', expiresAt: Date.now() + 3_600_000, email: user.email, userId: user.id, name: 'Test', workspaceId: 'ws1', workspaceName: 'Mine', role: 'owner', country: 'Malaysia', signedInAt } });
    await put('records', 's:settings', { lang: 'en', layout: 'grid', supabaseUrl: SB, supabaseAnonKey: 'anon', startChoice: 'empty', country: 'Malaysia', countryUser: user.id, ...settings });
    if (profile) await put('records', 's:profile', profile);
    db.close();
  }, { SB, user, settings, profile, signedInAt: signedInAt ?? Date.now() - 3_600_000 });
  await page.reload(); await page.waitForSelector('nav.grid, [data-testid="login"]');
  return { page, ctx, calls, errors };
}
async function waitFor(f, timeout = 10000) { const end = Date.now() + timeout; while (!(await f())) { if (Date.now() > end) throw new Error('timed out'); await new Promise(r => setTimeout(r, 50)); } }
const active = (extra = {}) => () => ({ status: 'active', terms: { version: '1.1-draft', at: '2026-10-21T00:00:00Z' }, marketing: false, licence: null, company_name: 'JSL Global Trading', support_email: null, business_address: null, ...extra });

test('MB1 a suspended account is signed out at the next sync; the sign-in screen gives the reason and the support contact', async () => {
  const { page, calls, ctx, errors } = await phone({ account: active({ status: 'suspended', reason: 'Under review', support_email: 'help@jsl.example' }) });
  await page.getByTestId('login-blocked').waitFor({ timeout: 15000 });
  assert.equal(await page.getByTestId('login-blocked').getAttribute('data-status'), 'suspended');
  assert.match(await page.getByTestId('login-blocked').innerText(), /suspended[\s\S]*has not been deleted[\s\S]*help@jsl\.example/i);
  await waitFor(() => calls.some(c => c.fn === 'eab_log_login' && c.body.p_events.some(e => e.event === 'blocked')));
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('MB2 a forced sign-out applies to a sign-in made before it, not after it', async () => {
  const at = new Date(Date.now() - 10 * 60_000).toISOString();
  const before = await phone({ account: active({ force_logout_after: at }), signedInAt: Date.now() - 60 * 60_000 });
  await before.page.getByTestId('login-blocked').waitFor({ timeout: 15000 });
  assert.equal(await before.page.getByTestId('login-blocked').getAttribute('data-status'), 'forced');
  assert.doesNotMatch(await before.page.getByTestId('login-blocked').innerText(), /contact support/i, 'no support line for a plain sign-out');
  await before.ctx.close();
  const afterIt = await phone({ account: active({ force_logout_after: at }), signedInAt: Date.now() - 60_000 });
  await waitFor(() => afterIt.calls.some(c => c.fn === 'eab_my_account'));
  await afterIt.page.waitForTimeout(500);
  assert.equal(await afterIt.page.getByTestId('login-blocked').count(), 0, 'signed in after the forced time: stays in');
  assert.equal(await afterIt.page.locator('nav.grid').count(), 1);
  await afterIt.ctx.close();
});

test('MB3 Terms not accepted yet: the tickboxes; Continue explains without the tick; the Terms open with the company name; the answer is saved', async () => {
  const { page, calls, ctx } = await phone({ account: active({ terms: null, marketing: null }) });
  await page.getByTestId('country-choice').waitFor({ timeout: 15000 });
  assert.equal(await page.getByTestId('country-select').count(), 0, 'the country was chosen before: only the Terms are asked');
  assert.equal(await page.getByTestId('terms-agree').isChecked(), false, 'both boxes start unticked');
  assert.equal(await page.getByTestId('marketing-agree').isChecked(), false);
  assert.match(await page.getByTestId('country-choice').innerText(), /special offers from JSL Global Trading/);
  const look = await page.getByTestId('country-continue').evaluate(b => getComputedStyle(b).backgroundImage + getComputedStyle(b).opacity);
  await page.getByTestId('country-continue').click();
  assert.match(await page.getByTestId('terms-error').innerText(), /You need to accept the Terms and Conditions to continue/);
  assert.equal(await page.getByTestId('country-continue').evaluate(b => getComputedStyle(b).backgroundImage + getComputedStyle(b).opacity), look, 'Continue never changes its look');
  await page.getByTestId('terms-link').click();
  assert.match(await page.getByTestId('terms-sheet').innerText(), /operated by JSL Global Trading[\s\S]*6\. Location[\s\S]*17\. Contact/);
  await page.getByTestId('terms-close').click();
  await page.getByTestId('terms-agree').check();
  await page.getByTestId('marketing-agree').check();
  await page.getByTestId('country-continue').click();
  await page.getByTestId('country-choice').waitFor({ state: 'detached' });
  await waitFor(() => calls.some(c => c.fn === 'eab_accept_terms'));
  const c = calls.find(x => x.fn === 'eab_accept_terms');
  assert.equal(c.body.p_version, '1.1-draft'); assert.equal(c.body.p_marketing, true);
  await ctx.close();
});

test('MB4 the licence in the profile is sent once; EA and firm licence are offered', async () => {
  const { page, calls, ctx } = await phone({ account: active(), profile: { fullName: 'Test', regType: 'REN', regNo: 'REN 01234' } });
  await waitFor(() => calls.some(c => c.fn === 'eab_set_my_licence'));
  assert.deepEqual(calls.find(c => c.fn === 'eab_set_my_licence').body, { p_type: 'REN', p_number: 'REN 01234' });
  await page.getByTestId('top-profile').click();
  await page.getByRole('button', { name: /Edit/i }).first().click().catch(() => undefined);
  const reg = page.getByTestId('opt-regType');
  await reg.waitFor();
  await reg.locator('.opt-btn').click();
  const items = await reg.locator('.opt-item').allInnerTexts();
  assert.ok(items.includes('EA') && items.includes('Firm licence'), items.join(','));
  await ctx.close();
});

test('MB5 too many failed sign-ins on this phone: the button waits, with the minutes left', async () => {
  const ctx = await browser.newContext({ viewport: { width: 384, height: 824 } });
  await ctx.addInitScript(() => localStorage.setItem('eab-signin-fails', JSON.stringify({ fails: 30, lockedUntil: Date.now() + 42 * 60_000 })));
  const page = await ctx.newPage();
  await page.goto(base); await page.waitForSelector('nav.grid');
  await page.getByTestId('start-empty').click();
  await page.evaluate(async SB => {
    const db = await new Promise(res => { const r = indexedDB.open('estate-agent-buddy'); r.onsuccess = () => res(r.result); });
    await new Promise(res => { const tx = db.transaction('records', 'readwrite'); tx.objectStore('records').put({ lang: 'en', layout: 'grid', supabaseUrl: SB, supabaseAnonKey: 'anon', startChoice: 'empty' }, 's:settings'); tx.oncomplete = res; });
    db.close();
  }, SB);
  await page.reload(); await page.getByTestId('login').waitFor();
  assert.match(await page.getByTestId('login-locked').innerText(), /Too many failed sign-in attempts on this phone\. Please wait 42 minutes/);
  assert.equal(await page.getByTestId('google-sign-in').isDisabled(), true);
  await ctx.close();
});

test('MB6 sign-in events waiting on the phone are sent with the signed-in account; marketing can be switched off in Settings', async () => {
  const queued = JSON.stringify([{ event: 'sign_in_failed', at: new Date().toISOString(), device_id: 'd-test', device: 'Android 14; X', platform: 'android', app_version: '2.2.0', detail: 'access_denied' }]);
  const { page, calls, ctx } = await phone({ account: active({ marketing: true }), local: { 'eab-login-queue': queued } });
  await waitFor(() => calls.some(c => c.fn === 'eab_log_login'));
  const sent = calls.filter(c => c.fn === 'eab_log_login').flatMap(c => c.body.p_events);
  assert.ok(sent.some(e => e.event === 'sign_in_failed' && e.detail === 'access_denied'), 'the queued failure went with the account');
  assert.ok(sent.every(e => e.lat === undefined), 'no position without location permission');
  await page.getByTestId('top-profile').click();
  await page.getByRole('button', { name: /Settings/i }).click();
  const t = page.getByTestId('marketing-toggle');
  assert.equal(await t.isChecked(), true);
  await t.uncheck();
  await waitFor(() => calls.some(c => c.fn === 'eab_set_marketing'));
  assert.equal(calls.find(c => c.fn === 'eab_set_marketing').body.p_on, false);
  await ctx.close();
});
