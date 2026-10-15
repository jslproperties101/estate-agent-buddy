// Change 010 screen tests in a real Chromium browser at phone width (384 x 824). Two phones (browser contexts) share ONE
// stand-in cloud that follows the Change 010 proposal's rules (tests/support/fakeTeamCloud.ts, bundled here). Not a live
// Supabase project and not a real Android phone. Run after `npm run build`.
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
  await build({ entryPoints: ['tests/support/fakeTeamCloud.ts'], bundle: true, platform: 'node', format: 'esm', outfile: '.test-out/ui-fakeTeamCloud.mjs', logLevel: 'warning', define: { __EAB_CONFIG__: 'undefined', __EAB_BUILD__: 'undefined' } });
  ({ FakeTeamCloud } = await import(new URL('../.test-out/ui-fakeTeamCloud.mjs', import.meta.url).href));
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

const shot = (page, name, fullPage = false) => page.screenshot({ path: `${SHOTS}${name}.png`, fullPage });
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
const prop = (id, street, extra = {}) => [`c:properties:${id}`, { id, created: 1, updated: 1, street, township: 'Nilai Impian', city: 'Nilai', type: 'Terrace house', photos: [], ...extra }];
async function openSettings(page) {
  await page.locator('nav.grid > button', { hasText: 'Agent Profile' }).click();
  await page.getByRole('button', { name: /Settings/i }).click();
}
async function home(page) { while (await page.locator('header .icon-btn').first().getAttribute('aria-label') === 'Back') { await page.locator('header .icon-btn').first().click(); await page.waitForTimeout(50); if (await page.locator('nav.grid').count()) break; } }
async function syncNow(page) {
  await openSettings(page);
  await page.getByTestId('sync-now').click();
  await page.getByTestId('account-msg').waitFor();
  await home(page);
}
async function team(cloud) {
  const a = await agent(cloud, 'aina@x.com', 'Aina', Object.fromEntries([prop('pa1', 'Jalan Aina 1'), prop('pa2', 'Jalan Aina 2')]));
  const b = await agent(cloud, 'badrul@x.com', 'Badrul', Object.fromEntries([prop('pb1', 'Jalan Badrul 9')]));
  await waitFor(() => cloud.rows.has('ws-aina@x.com|properties|pa1') && cloud.rows.has('ws-badrul@x.com|properties|pb1'));
  return { a, b };
}

test('C1 invite by email: waiting invitation with its expiry, cancel; the other agent accepts; two members, Team owner shown', async () => {
  const cloud = new FakeTeamCloud();
  const { a, b } = await team(cloud);
  await openSettings(a.page);
  await a.page.getByTestId('open-team').click();
  await a.page.getByTestId('team-screen').waitFor();
  await a.page.getByTestId('no-team').waitFor();
  await a.page.locator('[data-field="teamInviteEmail"]').fill('badrul@x.com');
  await a.page.getByTestId('send-invite').click();
  await a.page.getByTestId('invite-waiting').waitFor();
  assert.match(await a.page.getByTestId('invite-waiting').innerText(), /badrul@x.com[\s\S]*Expires/i);
  await shot(a.page, 'c010-01-invite-waiting', true);
  await a.page.getByTestId('cancel-invite').click();
  await a.page.getByTestId('send-invite').waitFor();
  assert.equal(cloud.invites[0].status, 'cancelled');
  await a.page.locator('[data-field="teamInviteEmail"]').fill('badrul@x.com');
  await a.page.getByTestId('send-invite').click();
  await a.page.getByTestId('invite-waiting').waitFor();

  await openSettings(b.page);
  await b.page.getByTestId('open-team').click();
  await b.page.getByTestId('invites-for-me').waitFor();
  assert.match(await b.page.getByTestId('invites-for-me').innerText(), /From Aina/i);
  await shot(b.page, 'c010-02-invite-for-me', true);
  await b.page.getByTestId('accept-invite').click();
  await b.page.getByTestId('team-members').waitFor();
  await waitFor(async () => (await b.page.getByTestId('team-member').count()) === 2);
  assert.match(await b.page.getByTestId('team-members').innerText(), /Aina[\s\S]*Team owner/i);
  await a.page.getByRole('button', { name: 'Refresh' }).click();
  await waitFor(async () => (await a.page.getByTestId('team-member').count()) === 2);
  assert.equal(await a.page.getByTestId('invite-card').count(), 0, 'a full Team Workspace offers no more invitations');
  await shot(a.page, 'c010-03-team-members', true);
  assert.deepEqual([...a.errors, ...b.errors], []);
  await a.ctx.close(); await b.ctx.close();
});

test('C2 invitation link: shown once, the other agent pastes it and joins', async () => {
  const cloud = new FakeTeamCloud();
  const { a, b } = await team(cloud);
  await openSettings(a.page); await a.page.getByTestId('open-team').click();
  await a.page.getByTestId('make-link').click();
  await a.page.getByTestId('invite-link').waitFor();
  const link = (await a.page.locator('[data-testid="invite-link"] code').innerText()).trim();
  assert.match(link, /\?team-invite=[0-9a-f]{16,}/);
  await openSettings(b.page); await b.page.getByTestId('open-team').click();
  await b.page.locator('[data-field="inviteLink"]').fill(`Join me: ${link}`);
  await b.page.getByTestId('accept-link').click();
  await waitFor(async () => (await b.page.getByTestId('team-member').count()) === 2);
  await a.ctx.close(); await b.ctx.close();
});

async function joined(cloud) {
  const x = await team(cloud);
  // Join through the cloud directly (C1/C2 test the screens for this).
  const inviteRes = await cloud.fetch(`${SB}/rest/v1/rpc/eab_team_invite`, { method: 'POST', headers: { authorization: `Bearer tok-${x.a.user.id}` }, body: JSON.stringify({ p_email: 'badrul@x.com' }) });
  const { token } = await inviteRes.json();
  await cloud.fetch(`${SB}/rest/v1/rpc/eab_team_accept`, { method: 'POST', headers: { authorization: `Bearer tok-${x.b.user.id}` }, body: JSON.stringify({ p_token: token }) });
  await syncNow(x.a.page); await syncNow(x.b.page);
  return x;
}

test('C3 Manage Sharing (gear): search, View Only for one listing, Share All with confirmation; takes effect at once', async () => {
  const cloud = new FakeTeamCloud();
  const { a, b } = await joined(cloud);
  await openSettings(a.page); await a.page.getByTestId('open-team').click();
  await a.page.getByTestId('team-members').getByTestId('open-manage-sharing').click();
  await a.page.getByTestId('manage-sharing').waitFor();
  assert.ok(await a.page.locator('[data-testid="manage-sharing"] svg').count() >= 1, 'gear icon shown');
  await a.page.locator('[data-field="findRecipient"]').fill('badrul');
  await a.page.getByTestId('recipient').waitFor();
  await a.page.locator('[data-field="findRecord"]').fill('Aina 1');
  assert.equal(await a.page.getByTestId('share-row').count(), 1);
  await a.page.getByTestId('share-row').locator('select').selectOption('view');
  await a.page.getByTestId('save-sharing').click();
  await a.page.getByTestId('sharing-msg').waitFor();
  assert.match(await a.page.getByTestId('sharing-msg').innerText(), /1 change saved/i);
  assert.equal(cloud.shares.get(`team-1|ws-aina@x.com|properties|pa1`), 'view');
  await shot(a.page, 'c010-04-manage-sharing', true);
  // Share All asks first.
  await a.page.getByTestId('share-all-tasks').selectOption('view');
  await a.page.getByRole('alertdialog').waitFor();
  assert.match(await a.page.getByRole('alertdialog').innerText(), /Share all your to-do with Badrul/i);
  await a.page.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click();
  assert.equal(cloud.shareAll.size, 0, 'cancelled: nothing shared');
  await a.ctx.close(); await b.ctx.close();
});

test('C4 the recipient: shared card shows the creator, Team/Personal switch, View Only has no Edit or Delete', async () => {
  const cloud = new FakeTeamCloud();
  const { a, b } = await joined(cloud);
  await cloud.fetch(`${SB}/rest/v1/rpc/eab_share_set`, { method: 'POST', headers: { authorization: `Bearer tok-${a.user.id}` }, body: JSON.stringify({ p_ws: a.user.ws, p_items: [{ collection: 'properties', id: 'pa1', level: 'view' }] }) });
  await syncNow(b.page);
  await b.page.getByTestId('workspace-switch').waitFor();
  await b.page.getByTestId('workspace-switch').getByRole('button', { name: 'Team Workspace' }).click();
  await b.page.locator('nav.grid > button', { hasText: 'Property List' }).click();
  await b.page.getByTestId('listing').waitFor();
  const card = b.page.getByTestId('listing-card').filter({ hasText: 'Jalan Aina 1' });
  await card.waitFor();
  assert.equal(await card.getByTestId('creator-tag').innerText(), 'Aina');
  assert.equal(await b.page.getByTestId('listing-card').filter({ hasText: 'Jalan Aina 2' }).count(), 0, 'not shared');
  await shot(b.page, 'c010-05-team-view-card');
  await b.page.getByTestId('workspace-switch').getByRole('button', { name: 'Personal Workspace' }).click();
  assert.equal(await b.page.getByTestId('listing-card').filter({ hasText: 'Jalan Aina 1' }).count(), 0, 'Personal Workspace: only my own');
  await b.page.getByTestId('workspace-switch').getByRole('button', { name: 'Team Workspace' }).click();
  await card.locator('.gc').click();
  await b.page.getByTestId('listing-details').waitFor();
  assert.match(await b.page.getByTestId('sharing-line').innerText(), /Created by Aina[\s\S]*Shared by Aina · Your access: View Only/i);
  assert.equal(await b.page.locator('.rec-actions').getByRole('button', { name: 'Edit' }).count(), 0);
  assert.equal(await b.page.getByTestId('detail-delete').count(), 0);
  assert.equal(await b.page.getByTestId('request-delete').count(), 0, 'View Only cannot even request deletion');
  // No Edit on any section of the property itself (the agent's OWN inquiries/viewings about it stay theirs to add).
  assert.equal(await b.page.locator('.sec-card:not([data-testid="inquiry-history"]):not([data-testid="viewing-history"]) .edit-mini').count(), 0, 'no section Edit buttons');
  await shot(b.page, 'c010-06-view-only-detail', true);
  await a.ctx.close(); await b.ctx.close();
});

test('C5 View and Edit: editor requests deletion, owner approves; the property goes to Archived (not deleted)', async () => {
  const cloud = new FakeTeamCloud();
  const { a, b } = await joined(cloud);
  await cloud.fetch(`${SB}/rest/v1/rpc/eab_share_set`, { method: 'POST', headers: { authorization: `Bearer tok-${a.user.id}` }, body: JSON.stringify({ p_ws: a.user.ws, p_items: [{ collection: 'properties', id: 'pa1', level: 'edit' }] }) });
  await syncNow(b.page);
  await b.page.getByTestId('workspace-switch').getByRole('button', { name: 'Team Workspace' }).click();
  await b.page.locator('nav.grid > button', { hasText: 'Property List' }).click();
  await b.page.getByTestId('listing-card').filter({ hasText: 'Jalan Aina 1' }).locator('.gc').click();
  await b.page.getByTestId('listing-details').waitFor();
  assert.equal(await b.page.getByTestId('detail-delete').count(), 0, 'an editor cannot delete it');
  await b.page.getByTestId('request-delete').click();
  await b.page.getByRole('alertdialog').getByRole('button', { name: 'Request Deletion' }).click();
  await waitFor(() => cloud.deleteRequests.length === 1);
  await openSettings(a.page); await a.page.getByTestId('open-team').click();
  await a.page.getByTestId('delete-request').waitFor();
  assert.match(await a.page.getByTestId('delete-request').innerText(), /Jalan Aina 1[\s\S]*Requested by Badrul/i);
  await a.page.getByTestId('approve-delete').click();
  await a.page.getByTestId('team-msg').waitFor();
  assert.equal(cloud.deleteRequests[0].status, 'approved');
  await home(a.page);
  await a.page.locator('nav.grid > button', { hasText: 'Property List' }).click();
  await a.page.getByTestId('archived-section').waitFor();
  assert.equal(await a.page.getByTestId('listing-card').filter({ hasText: 'Jalan Aina 1' }).count(), 0, 'not among active listings');
  await a.page.getByTestId('archived-section').locator('summary').click();
  assert.match(await a.page.getByTestId('archived-card').innerText(), /Jalan Aina 1/);
  await shot(a.page, 'c010-07-archived', true);
  await a.ctx.close(); await b.ctx.close();
});

test('C6 owner: Delete archives with confirmation; Restore; Delete permanently only from the archive', async () => {
  const cloud = new FakeTeamCloud();
  const a = await agent(cloud, 'aina@x.com', 'Aina', Object.fromEntries([prop('pa1', 'Jalan Aina 1')]));
  await a.page.locator('nav.grid > button', { hasText: 'Property List' }).click();
  await a.page.getByTestId('listing-card').first().locator('.gc').click();
  await a.page.getByTestId('detail-delete').click();
  assert.match(await a.page.getByRole('alertdialog').innerText(), /Archived section/i);
  await a.page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await a.page.getByTestId('archived-section').waitFor();
  assert.equal(await a.page.getByTestId('listing-card').count(), 0);
  await a.page.getByTestId('archived-section').locator('summary').click();
  await a.page.getByTestId('archived-card').locator('button').click();
  await a.page.getByTestId('archived-banner').waitFor();
  assert.equal(await a.page.locator('.rec-actions').getByRole('button', { name: 'Edit' }).count(), 0, 'archived: restore first');
  await a.page.getByTestId('restore-archived').click();
  await a.page.getByTestId('archived-banner').waitFor({ state: 'detached' });
  await a.page.getByTestId('detail-delete').click();
  await a.page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await a.page.getByTestId('archived-section').locator('summary').click();
  await a.page.getByTestId('archived-card').locator('button').click();
  await a.page.getByTestId('delete-permanent').click();
  assert.match(await a.page.getByRole('alertdialog').innerText(), /permanently/i);
  await a.page.getByRole('alertdialog').getByRole('button', { name: 'Delete Permanently' }).click();
  await a.page.getByTestId('listing').waitFor();
  assert.equal(await a.page.getByTestId('archived-section').count(), 0);
  await a.ctx.close();
});

test('C7 ending the Team Workspace: the exact warning; shared records disappear from the other phone', async () => {
  const cloud = new FakeTeamCloud();
  const { a, b } = await joined(cloud);
  await cloud.fetch(`${SB}/rest/v1/rpc/eab_share_set`, { method: 'POST', headers: { authorization: `Bearer tok-${a.user.id}` }, body: JSON.stringify({ p_ws: a.user.ws, p_items: [{ collection: 'properties', id: 'pa1', level: 'edit' }] }) });
  await syncNow(b.page);
  await openSettings(b.page); await b.page.getByTestId('open-team').click();
  await b.page.getByTestId('end-team').click();
  const dlg = b.page.getByRole('alertdialog');
  assert.equal((await dlg.locator('h2').innerText()).trim(), 'End this Team Workspace? Shared access will be revoked immediately. Your personal listings will remain in your Personal Workspace.');
  await shot(b.page, 'c010-08-end-team');
  await dlg.getByRole('button', { name: 'End Team Workspace' }).click();
  await b.page.getByTestId('team-msg').waitFor();
  await home(b.page);
  assert.equal(await b.page.getByTestId('workspace-switch').count(), 0, 'no Team Workspace any more');
  await b.page.locator('nav.grid > button', { hasText: 'Property List' }).click();
  assert.equal(await b.page.getByTestId('listing-card').filter({ hasText: 'Jalan Aina 1' }).count(), 0);
  assert.equal(await b.page.getByTestId('listing-card').filter({ hasText: 'Jalan Badrul 9' }).count(), 1, 'own listings stay');
  await a.ctx.close(); await b.ctx.close();
});

test('C8 a cloud without the Change 010 update: the Team Workspace screen says so plainly', async () => {
  const cloud = new FakeTeamCloud(); cloud.available = false;
  const a = await agent(cloud, 'aina@x.com', 'Aina');
  await openSettings(a.page); await a.page.getByTestId('open-team').click();
  await a.page.getByTestId('team-unavailable').waitFor();
  assert.match(await a.page.getByTestId('team-unavailable').innerText(), /not switched on in the cloud yet/i);
  await a.ctx.close();
});
