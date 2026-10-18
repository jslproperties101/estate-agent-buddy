// Change 13 (invitation alerts) screen tests in a real Chromium browser at phone width (384 x 824). Two phones share ONE
// stand-in cloud (tests/support/fakeTeamCloud.ts). Not a live Supabase project and not a real Android phone. Run after `npm run build`.
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
const SB = 'https://team-test.supabase.co';
let server, browser, base, FakeTeamCloud;

before(async () => {
  await mkdir(SHOTS, { recursive: true });
  await build({ entryPoints: ['tests/support/fakeTeamCloud.ts'], bundle: true, platform: 'node', format: 'esm', outfile: '.test-out/ui013-fakeTeamCloud.mjs', logLevel: 'warning', define: { __EAB_CONFIG__: 'undefined', __EAB_BUILD__: 'undefined' } });
  ({ FakeTeamCloud } = await import(new URL('../.test-out/ui013-fakeTeamCloud.mjs', import.meta.url).href));
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

async function waitFor(f, timeout = 10000) { const end = Date.now() + timeout; while (!(await f())) { if (Date.now() > end) throw new Error('timed out'); await new Promise(r => setTimeout(r, 50)); } }

/** A phone signed in as `email` against `cloud`, holding `records` (key → value) of its own. */
async function agent(cloud, email, name, records = {}, opts = {}) {
  const user = cloud.users.get(email) ?? cloud.addUser(email, name);
  const ctx = await browser.newContext({ viewport: { width: 384, height: 824 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route(`${SB}/**`, async route => {
    const req = route.request();
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const res = await cloud.fetch(req.url(), { method: req.method(), headers: req.headers(), body: req.postData() ?? undefined });
    return route.fulfill({ status: res.status, headers: { ...cors, 'content-type': 'application/json' }, body: await res.text() });
  });
  if (opts.ws) await ctx.routeWebSocket(/\/realtime\/v1\/websocket/, opts.ws);   // Change 24: a stand-in for Supabase Realtime
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(base + (opts.query ?? ''));
  await page.waitForSelector('nav.grid');
  await page.getByTestId('start-empty').click();
  await page.evaluate(async ({ SB, user, email, name, records }) => {
    const db = await new Promise(res => { const r = indexedDB.open('estate-agent-buddy'); r.onsuccess = () => res(r.result); });
    const put = (store, key, val) => new Promise((res, rej) => { const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).put(val, key); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    for (const [k, v] of Object.entries(records)) await put('records', k, v);
    await put('records', 's:meta', { fired: [], dirty: Object.keys(records).map(k => k.slice(2)), tombstones: [], ownerChecked: true, syncWorkspaceId: user.ws,
      syncSession: { accessToken: `tok-${user.id}`, refreshToken: 'r', expiresAt: Date.now() + 3_600_000, email, userId: user.id, name, workspaceId: user.ws, workspaceName: 'Mine', role: 'owner' } });
    await put('records', 's:settings', { lang: 'en', layout: 'grid', supabaseUrl: SB, supabaseAnonKey: 'anon', startChoice: 'empty' });
    db.close();
  }, { SB, user, email, name, records });
  await page.reload(); await page.waitForSelector('nav.grid');
  return { page, ctx, user, errors };
}
const shot = (page, name) => page.screenshot({ path: `${SHOTS}${name}.png`, fullPage: true });
async function inviteVia(cloud, from, toEmail) {
  const r = await cloud.fetch(`${SB}/rest/v1/rpc/eab_team_invite`, { method: 'POST', headers: { authorization: `Bearer tok-${from.id}`, 'content-type': 'application/json' }, body: JSON.stringify({ p_email: toEmail }) });
  assert.equal(r.status, 200);
}
async function openNotifications(page) { await page.getByTestId('top-notifications').click(); await page.getByTestId('notifications').waitFor(); }

test('P1 an invitation shows a pop-up with Accept / Decline / Later; Later hides it until the app is opened again; the bell and Notifications list it; Accept joins', async () => {
  const cloud = new FakeTeamCloud();
  const a = await agent(cloud, 'aina@x.com', 'Aina');
  await inviteVia(cloud, a.user, 'badrul@x.com');
  const b = await agent(cloud, 'badrul@x.com', 'Badrul');
  await b.page.getByTestId('invite-popup').waitFor();
  assert.match(await b.page.getByTestId('invite-popup').innerText(), /Aina[\s\S]*Nothing is shared just by joining/);
  assert.match(await b.page.getByTestId('invite-popup').innerText(), /Later/);
  await shot(b.page, 'c013-01-popup');
  // Later: hidden, and not shown again just by coming back to the app
  await b.page.getByTestId('invite-popup-cancel').click();
  assert.equal(await b.page.getByTestId('invite-popup').count(), 0);
  await b.page.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); });
  await b.page.waitForTimeout(400);
  assert.equal(await b.page.getByTestId('invite-popup').count(), 0, 'still hidden in this opening of the app');
  // the bell counts it and Notifications lists it
  assert.equal((await b.page.locator('.notif-btn .top-badge').innerText()).trim(), '1');
  await openNotifications(b.page);
  assert.match(await b.page.getByTestId('notif-invite').innerText(), /Invitation from Aina/);
  await shot(b.page, 'c013-02-notifications');
  // Change 14: the Opportunities card and its Team Sharing card carry the number too
  await b.page.locator('header .icon-btn').first().click();
  assert.equal((await b.page.getByTestId('opportunities-badge').innerText()).trim(), '1');
  await b.page.locator('nav.grid > button', { hasText: 'Opportunities' }).click();
  assert.equal((await b.page.getByTestId('team-sharing-badge').innerText()).trim(), '1');
  await shot(b.page, 'c014-01-team-sharing-badge');
  // opening the app again brings the pop-up back
  await b.page.reload(); await b.page.waitForSelector('nav.grid');
  await b.page.getByTestId('invite-popup').waitFor();
  await b.page.getByTestId('invite-popup-accept').click();
  await waitFor(() => cloud.invites[0].status === 'accepted');
  await b.page.getByTestId('invite-popup').waitFor({ state: 'detached' });
  assert.equal(await b.page.locator('.notif-btn .top-badge').count(), 0, 'nothing waits on the bell any more');
  assert.equal(await b.page.getByTestId('opportunities-badge').count(), 0, 'nor on Opportunities');
  assert.deepEqual([...a.errors, ...b.errors], []);
  await a.ctx.close(); await b.ctx.close();
});

test('P2 declined from the pop-up: the pop-up never returns, and the sender is told in Notifications and can mark it read', async () => {
  const cloud = new FakeTeamCloud();
  const a = await agent(cloud, 'aina@x.com', 'Aina');
  await inviteVia(cloud, a.user, 'badrul@x.com');
  const b = await agent(cloud, 'badrul@x.com', 'Badrul');
  await b.page.getByTestId('invite-popup').waitFor();
  await b.page.getByTestId('invite-popup-decline').click();
  await waitFor(() => cloud.invites[0].status === 'declined');
  await b.page.reload(); await b.page.waitForSelector('nav.grid');
  await b.page.waitForTimeout(600);
  assert.equal(await b.page.getByTestId('invite-popup').count(), 0, 'answered: no more pop-up');
  // the sender opens the app: told
  await a.page.reload(); await a.page.waitForSelector('nav.grid');
  await waitFor(async () => (await a.page.locator('.notif-btn .top-badge').count()) === 1);
  await openNotifications(a.page);
  assert.match(await a.page.getByTestId('notif-invite-answer').innerText(), /declined your invitation/);
  await shot(a.page, 'c013-03-answer');
  await a.page.getByTestId('notif-invite-answer-ok').click();
  assert.equal(await a.page.getByTestId('notif-invite-answer').count(), 0);
  // wait until the phone has really written it (a real person takes longer than a test to close the app)
  await waitFor(() => a.page.evaluate(async () => {
    const db = await new Promise(res => { const r = indexedDB.open('estate-agent-buddy'); r.onsuccess = () => res(r.result); });
    const v = await new Promise(res => { const q = db.transaction('records').objectStore('records').get('s:meta'); q.onsuccess = () => res(q.result); });
    return (v?.inviteAlerts?.seenAnswers ?? []).length > 0;
  }));
  await a.page.reload(); await a.page.waitForSelector('nav.grid');
  await a.page.waitForTimeout(600);
  assert.equal(await a.page.locator('.notif-btn .top-badge').count(), 0, 'a note that was read does not come back');
  assert.deepEqual([...a.errors, ...b.errors], []);
  await a.ctx.close(); await b.ctx.close();
});

test('P3 nobody is invited: no pop-up, no badge, and the Notifications screen stays calm', async () => {
  const cloud = new FakeTeamCloud();
  const c = await agent(cloud, 'chong@x.com', 'Chong');
  await c.page.waitForTimeout(700);
  assert.equal(await c.page.getByTestId('invite-popup').count(), 0);
  assert.equal(await c.page.locator('.notif-btn .top-badge').count(), 0);
  assert.deepEqual(c.errors, []);
  await c.ctx.close();
});

test('P4 on the Team Workspace screen itself the pop-up stays away (the invitation is already there with its own buttons)', async () => {
  const cloud = new FakeTeamCloud();
  const a = await agent(cloud, 'aina@x.com', 'Aina');
  const b = await agent(cloud, 'badrul@x.com', 'Badrul');
  await b.page.locator('nav.grid > button', { hasText: 'Opportunities' }).click();
  await b.page.getByTestId('team-sharing').waitFor();
  await b.page.getByTestId('open-team').click();
  await b.page.getByTestId('no-team').waitFor();
  await inviteVia(cloud, a.user, 'badrul@x.com');
  await b.page.getByRole('button', { name: 'Refresh' }).click();
  await b.page.getByTestId('invites-for-me').waitFor();
  await b.page.waitForTimeout(400);
  assert.equal(await b.page.getByTestId('invite-popup').count(), 0, 'no pop-up on top of the Team Workspace screen');
  await b.page.getByTestId('accept-invite').click();
  await waitFor(() => cloud.invites[0].status === 'accepted');
  assert.deepEqual([...a.errors, ...b.errors], []);
  await a.ctx.close(); await b.ctx.close();
});

test('P5 Change 24: with the live connection, a new invitation pops up within seconds, without reopening anything; the connection closes in the background', async () => {
  const cloud = new FakeTeamCloud();
  const a = await agent(cloud, 'aina@x.com', 'Aina');
  const live = { sockets: [], joins: [], closed: 0 };
  const b = await agent(cloud, 'badrul@x.com', 'Badrul', {}, { ws: ws => {
    live.sockets.push(ws);
    ws.onMessage(raw => {
      const m = JSON.parse(String(raw));
      if (m.event === 'phx_join') { live.joins.push(m); ws.send(JSON.stringify({ topic: m.topic, event: 'phx_reply', ref: m.ref, join_ref: m.join_ref, payload: { status: 'ok', response: { postgres_changes: [{ id: 7, event: '*', schema: 'public', table: 'eab_team_invites' }] } } })); }
    });
    ws.onClose(() => { live.closed++; });
  } });
  await waitFor(() => live.joins.length > 0);
  const j = live.joins[live.joins.length - 1];
  assert.equal(j.topic, 'realtime:eab-team-invites');
  assert.equal(j.payload.access_token, `tok-${b.user.id}`, 'joined as the signed-in person (the database decides what they hear)');
  assert.deepEqual(j.payload.config.postgres_changes, [{ event: '*', schema: 'public', table: 'eab_team_invites' }]);
  await b.page.waitForTimeout(700);
  assert.equal(await b.page.getByTestId('invite-popup').count(), 0, 'nothing yet');
  // Aina sends the invitation; Supabase tells Badrul's open app that something changed
  await inviteVia(cloud, a.user, 'badrul@x.com');
  const t0 = Date.now();
  live.sockets[live.sockets.length - 1].send(JSON.stringify({ topic: 'realtime:eab-team-invites', event: 'postgres_changes', ref: null, payload: { ids: [7], data: { type: 'INSERT', table: 'eab_team_invites', schema: 'public' } } }));
  await b.page.getByTestId('invite-popup').waitFor({ timeout: 5000 });
  assert.ok(Date.now() - t0 < 5000, 'within seconds (before, up to 15 minutes)');
  assert.match(await b.page.getByTestId('invite-popup').innerText(), /Aina/);
  await shot(b.page, 'c024-01-live-popup');
  // the app goes to the background: the live connection is closed (battery); back on screen: it connects again
  const before = live.sockets.length;
  await b.page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await waitFor(() => live.closed >= 1);
  await b.page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await waitFor(() => live.sockets.length > before);
  assert.deepEqual([...a.errors, ...b.errors], []);
  await a.ctx.close(); await b.ctx.close();
});
