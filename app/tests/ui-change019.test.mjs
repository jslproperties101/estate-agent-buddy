// Changes 19 and 20 screen tests in a real Chromium browser at phone width (384 x 824): the Developer Dashboard entry in
// Settings (shown only to a developer account), the dashboard's sections and filters, and the usage events the phone sends.
// The database is a stand-in: a canned answer per eab_dev_* function (the real functions are tested on PostgreSQL by
// supabase/tests/change019-test.sh). Not a live Supabase project and not a real Android phone. Run after `npm run build`.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { chromium } from 'playwright';
import { build } from 'esbuild';

const DIST = new URL('../dist/', import.meta.url).pathname;
const SHOTS = new URL('./screens/', import.meta.url).pathname;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.map': 'application/json' };
const SB = 'https://usage-test.supabase.co';
let server, browser, base, FakeTeamCloud;

before(async () => {
  await mkdir(SHOTS, { recursive: true });
  await build({ entryPoints: ['tests/support/fakeTeamCloud.ts'], bundle: true, platform: 'node', format: 'esm', outfile: '.test-out/ui019-fakeTeamCloud.mjs', logLevel: 'warning', define: { __EAB_CONFIG__: 'undefined', __EAB_BUILD__: 'undefined' } });
  ({ FakeTeamCloud } = await import(new URL('../.test-out/ui019-fakeTeamCloud.mjs', import.meta.url).href));
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

const OVERVIEW = {
  users_total: 3, users_new: 1, active_users: 2, returning_users: 1, active_1d: 2, active_7d: 3, active_30d: 3, sessions: 7, active_minutes: 95.5,
  google_calls: 45, google_failures: 2, ai_calls: 4, errors: 1, sync_failures: 1, records_total: 12, records_by_kind: { contacts: 4, properties: 8 },
  files_count: 5, files_bytes: 13_100_000, database_bytes: 48_000_000, usage_log_bytes: 90_000, teams_active: 1, invites: { accepted: 1, pending: 1 }, bug_reports: 2,
  activation: { with_listing: 2, with_photo: 1, with_share: 1 },
};
const USERS = [
  { user_id: 'u1', email: 'joe@x.com', signed_up: '2026-10-01T02:00:00Z', last_active: '2026-10-17T21:00:00Z', app_version: '2.2.0-qa', platform: 'android', device: 'SM-S918B', sessions: 5, active_minutes: 80, google_calls: 40, google_failures: 1, ai_calls: 3, errors: 1, sync_failures: 0, last_sync: '2026-10-17T20:55:00Z', last_drive_backup: null, local_bytes: 5_242_880, records: { properties: 6, contacts: 3 }, records_total: 9, files_count: 4, files_bytes: 10_000_000, in_team: true, bug_reports: 1 },
  { user_id: 'u2', email: 'aina@x.com', signed_up: '2026-10-10T02:00:00Z', last_active: '2026-10-16T02:00:00Z', app_version: '2.1.0', platform: 'android', device: null, sessions: 2, active_minutes: 15.5, google_calls: 5, google_failures: 1, ai_calls: 1, errors: 0, sync_failures: 1, last_sync: null, last_drive_backup: null, local_bytes: null, records: { properties: 2, contacts: 1 }, records_total: 3, files_count: 1, files_bytes: 3_100_000, in_team: true, bug_reports: 1 },
];
const CALLS = [
  { user_id: 'u1', email: 'joe@x.com', kind: 'google', name: 'geocoding.reverse', screen: 'location-picker', calls: 20, failures: 0, total_value: null, last_at: '2026-10-17T21:00:00Z' },
  { user_id: 'u1', email: 'joe@x.com', kind: 'google', name: 'routes.compute', screen: 'property-map', calls: 8, failures: 1, total_value: null, last_at: '2026-10-17T20:00:00Z' },
  { user_id: 'u2', email: 'aina@x.com', kind: 'google', name: 'geocoding.reverse', screen: 'location-picker', calls: 5, failures: 1, total_value: null, last_at: '2026-10-16T02:00:00Z' },
];
const DAILY = [
  { day: '2026-10-16', active_users: 1, sessions: 2, active_minutes: 15.5, google_calls: 5, ai_calls: 1, errors: 0 },
  { day: '2026-10-17', active_users: 2, sessions: 5, active_minutes: 80, google_calls: 40, ai_calls: 3, errors: 1 },
];

/** A phone signed in as `email`. `dev`: 'yes' | 'no' | 'missing' (database part not installed). Records what the phone sends and asks. */
async function agent(email, dev) {
  const cloud = new FakeTeamCloud();
  const user = cloud.addUser(email, 'Joe');
  const seen = { fns: [], bodies: {}, logged: [] };
  const ctx = await browser.newContext({ viewport: { width: 384, height: 824 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route(`${SB}/**`, async route => {
    const req = route.request();
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const json = (status, body) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const fn = new URL(req.url()).pathname.split('/rest/v1/rpc/')[1];
    if (fn && /^eab_(dev_|is_developer|log_usage)/.test(fn)) {
      const body = JSON.parse(req.postData() || '{}');
      seen.fns.push(fn); seen.bodies[fn] = body;
      if (fn === 'eab_log_usage') { if (dev === 'missing') return json(404, { code: 'PGRST202', message: 'Could not find the function' }); seen.logged.push(...body.p_events); return json(200, body.p_events.length); }
      if (dev === 'missing') return json(404, { code: 'PGRST202', message: 'Could not find the function' });
      if (fn === 'eab_is_developer') return json(200, dev === 'yes' || dev === 'revoked');
      if (dev !== 'yes') return json(403, { message: 'not allowed' });
      if (fn === 'eab_dev_overview') return json(200, OVERVIEW);
      if (fn === 'eab_dev_users') return json(200, body.p_search ? USERS.filter(u => u.email.includes(body.p_search)) : USERS);
      if (fn === 'eab_dev_breakdown') return json(200, body.p_user ? CALLS.filter(c => c.user_id === body.p_user) : CALLS);
      if (fn === 'eab_dev_events') return json(200, [{ id: 1, at: '2026-10-17T21:00:00Z', user_id: 'u1', email: 'joe@x.com', kind: 'google', name: 'geocoding.reverse', screen: 'location-picker', ok: false, n: 1, value: null, app_version: '2.2.0-qa', platform: 'android', device: 'SM-S918B' }]);
      if (fn === 'eab_dev_daily') return json(200, DAILY);
      if (fn === 'eab_dev_history') return json(200, [{ user_id: 'u1', email: 'joe@x.com', kind: 'google', name: 'geocoding.reverse', screen: 'location-picker', calls: 120, failures: 3, total_value: null, first_day: '2026-09-02', last_day: '2026-10-17', days_used: 14 }]);
    }
    const res = await cloud.fetch(req.url(), { method: req.method(), headers: req.headers(), body: req.postData() ?? undefined });
    return route.fulfill({ status: res.status, headers: { ...cors, 'content-type': 'application/json' }, body: await res.text() });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(base);
  await page.waitForSelector('nav.grid');
  await page.getByTestId('start-empty').click();
  await page.evaluate(async ({ SB, user, email }) => {
    const db = await new Promise(res => { const r = indexedDB.open('estate-agent-buddy'); r.onsuccess = () => res(r.result); });
    const put = (store, key, val) => new Promise((res, rej) => { const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).put(val, key); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    await put('records', 's:meta', { fired: [], dirty: [], tombstones: [], ownerChecked: true, syncWorkspaceId: user.ws,
      syncSession: { accessToken: `tok-${user.id}`, refreshToken: 'r', expiresAt: Date.now() + 3_600_000, email, userId: user.id, name: 'Joe', workspaceId: user.ws, workspaceName: 'Mine', role: 'owner' } });
    await put('records', 's:settings', { lang: 'en', layout: 'grid', supabaseUrl: SB, supabaseAnonKey: 'anon', startChoice: 'empty' });
    db.close();
  }, { SB, user, email });
  await page.reload(); await page.waitForSelector('nav.grid');
  return { page, ctx, seen, errors };
}
async function openSettings(page) {
  await page.getByTestId('top-profile').click();
  await page.getByRole('button', { name: /Settings/i }).click();
  await page.getByTestId('settings').waitFor();
}
const shot = (page, name) => page.screenshot({ path: `${SHOTS}${name}.png`, fullPage: true });

test('D1 Settings offers the dashboard only to a developer account; a normal account and a project without the database part see nothing', async () => {
  for (const dev of ['no', 'missing']) {
    const a = await agent('agent@x.com', dev);
    await openSettings(a.page);
    await a.page.waitForTimeout(600);
    assert.equal(await a.page.getByTestId('dev-entry').count(), 0, `dev=${dev}: no dashboard card`);
    assert.ok(a.seen.fns.includes('eab_is_developer'));
    assert.deepEqual(a.errors, []);
    await a.ctx.close();
  }
  const d = await agent('joe@x.com', 'yes');
  await openSettings(d.page);
  await d.page.getByTestId('dev-entry').waitFor();
  await shot(d.page, 'd1-settings-developer');
  await d.ctx.close();
});

test('D2 the dashboard shows the overview, users, calls, events and history from the database answers, with filters', async () => {
  const d = await agent('joe@x.com', 'yes');
  await openSettings(d.page);
  await d.page.getByTestId('open-dev-dashboard').click();
  await d.page.getByTestId('dev-dashboard').waitFor();
  assert.match(await d.page.getByTestId('dev-note').innerText(), /never collected/);
  // Overview
  await d.page.getByTestId('dev-overview').locator('.dev-grid').waitFor();
  assert.match(await d.page.getByTestId('dev-google-calls').innerText(), /45\s+2 failed/);
  assert.match(await d.page.getByTestId('dev-users-total').innerText(), /3\s+1 new/);
  assert.equal(await d.page.getByTestId('dev-bars').count(), 4, 'four daily charts');
  assert.deepEqual(Object.keys(d.seen.bodies.eab_dev_daily).sort(), ['p_from', 'p_to', 'p_user']);
  await shot(d.page, 'd2-overview');
  // Users
  await d.page.getByRole('tab', { name: 'Users' }).click();
  await d.page.getByTestId('dev-user').first().waitFor();
  assert.equal(await d.page.getByTestId('dev-user').count(), 2);
  await d.page.getByTestId('dev-user').first().getByRole('button').first().click();
  const detail = await d.page.getByTestId('dev-user-detail').innerText();
  assert.match(detail, /SM-S918B/); assert.match(detail, /contacts 3, properties 6/); assert.match(detail, /5\.00 MB/);
  await shot(d.page, 'd2-users');
  // filter by e-mail
  await d.page.locator('details summary').click();
  await d.page.getByTestId('dev-search').fill('aina');
  await d.page.getByTestId('dev-apply').click();
  await d.page.waitForFunction(() => document.querySelectorAll('[data-testid="dev-user"]').length === 1);
  assert.equal(d.seen.bodies.eab_dev_users.p_search, 'aina');
  await d.page.getByTestId('dev-clear').click();
  await d.page.waitForFunction(() => document.querySelectorAll('[data-testid="dev-user"]').length === 2);
  // one user's calls (their card is still open from above)
  if (!(await d.page.getByTestId('dev-show-user').count())) await d.page.getByTestId('dev-user').first().getByRole('button').first().click();
  await d.page.getByTestId('dev-show-user').click();
  await d.page.getByTestId('dev-by-name').waitFor();
  assert.equal(d.seen.bodies.eab_dev_breakdown.p_user, 'u1');
  assert.match(await d.page.getByTestId('dev-by-name').innerText(), /google · geocoding\.reverse\s+20/);
  assert.match(await d.page.getByTestId('dev-calls-table').innerText(), /joe@x\.com\s+google\s+routes\.compute\s+property-map\s+8\s+1/);
  await shot(d.page, 'd2-calls');
  // period
  await d.page.getByTestId('dev-period-7d').click();
  await d.page.waitForFunction(() => document.querySelector('[data-testid="dev-period-7d"]').getAttribute('aria-pressed') === 'true');
  const span = Date.parse(d.seen.bodies.eab_dev_breakdown.p_to) - Date.parse(d.seen.bodies.eab_dev_breakdown.p_from);
  assert.ok(Math.abs(span - (7 * 86_400_000 + 60_000)) < 5000, '7 days asked for');
  // Events and History
  await d.page.getByRole('tab', { name: 'Events' }).click();
  await d.page.getByTestId('dev-events-table').waitFor();
  assert.match(await d.page.getByTestId('dev-events-table').innerText(), /google\s+geocoding\.reverse\s+location-picker\s+NO/);
  await d.page.getByRole('tab', { name: 'History' }).click();
  await d.page.getByTestId('dev-history-table').waitFor();
  assert.match(await d.page.getByTestId('dev-history-table').innerText(), /120\s+3\s+02 Sept 2026|120\s+3\s+02 Sep 2026/);
  await shot(d.page, 'd2-history');
  // no sideways page scroll on a phone
  assert.ok(await d.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'the page itself does not scroll sideways');
  assert.deepEqual(d.errors, []);
  await d.ctx.close();
});

test('D3 an account the database refuses (for example removed from the developer list) sees the refusal in plain words and no data', async () => {
  const a = await agent('joe@x.com', 'revoked');
  await openSettings(a.page);
  await a.page.getByTestId('open-dev-dashboard').click();
  await a.page.getByTestId('dev-error').waitFor();
  assert.match(await a.page.getByTestId('dev-error').innerText(), /not on the developer list/);
  assert.equal(await a.page.locator('.dev-grid').count(), 0, 'no numbers shown');
  await shot(a.page, 'd3-refused');
  assert.deepEqual(a.errors, []);
  await a.ctx.close();
});

test('D4 the phone sends usage events as plain codes when the app goes to the background, and never the e-mail or user id', async () => {
  const d = await agent('joe@x.com', 'yes');
  await openSettings(d.page);
  await d.page.waitForTimeout(300);
  await d.page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  const start = Date.now();
  while (!d.seen.logged.some(e => e.name === 'settings') && Date.now() - start < 8000) await d.page.waitForTimeout(100);
  const names = d.seen.logged.map(e => e.name);
  assert.ok(names.includes('session.start'), names.join(','));
  assert.ok(names.includes('settings'), 'the Settings screen was noted: ' + names.join(','));
  for (const e of d.seen.logged) {
    assert.match(e.name, /^[a-z0-9][a-z0-9_.:-]{0,59}$/);
    assert.ok(!('u' in e) && !('user_id' in e) && !('email' in e), 'no user fields');
  }
  const text = JSON.stringify(d.seen.logged);
  assert.ok(!text.includes('joe@x.com') && !text.includes('tok-'), 'no e-mail or token in any event');
  assert.deepEqual(d.errors, []);
  await d.ctx.close();
});

test('D5 a project without the usage database part: the app keeps working, shows no developer card and does not flood the database with retries', async () => {
  const a = await agent('agent@x.com', 'missing');
  await openSettings(a.page);
  await a.page.waitForTimeout(500);
  await a.page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await a.page.waitForTimeout(1500);
  assert.ok(a.seen.fns.filter(f => f === 'eab_log_usage').length <= 2, 'few log attempts: ' + a.seen.fns.join(','));
  assert.equal(await a.page.getByTestId('dev-entry').count(), 0);
  assert.equal(await a.page.getByTestId('settings').count(), 1, 'Settings still works');
  assert.deepEqual(a.errors, []);
  await a.ctx.close();
});
