// Phase 1 (13 Oct 2026): startup readiness, save/sync status, two-second success message, Inactive → Dropped report,
// the card title without "Unit", and the Easy Bug Report sender. The browser behaviour is in ui.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryBackend, Backend } from '../src/data/backend';
import { Store } from '../src/data/store';
import { syncNow } from '../src/data/sync';
import { saveStateOf, saveStateFromStore } from '../src/data/savestate';
import { beginStartup, startupLang, StartupPhase, SLOW_MS, SPLASH_MS, SPLASH_STEPS, splashStep } from '../src/startup/startup';
import { startupStrings } from '../src/startup/strings';
import { TOAST_OK_MS, TOAST_ERROR_MS } from '../src/ui/toast';
import { convertInactive, inactiveContacts, reviewContacts } from '../src/data/leadReview';
import { LEAD_STATUSES, LEAD_COLOURS, Contact } from '../src/data/types';
import { loadSampleInto } from '../src/data/sample';
import { title } from '../src/listing/model';
import { buildRow, cleanDescription, sendBugReport, MAX_DESCRIPTION, MAX_SHOT_BYTES } from '../src/bugreport/report';
import { bugStrings } from '../src/bugreport/strings';

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

// ---------- B. startup ----------
function run<T>(open: () => Promise<T>, slowMs: number) {
  const phases: StartupPhase[] = [];
  const cancel = beginStartup(open, p => phases.push(p), slowMs);
  return { phases, cancel };
}

test('P1 startup: when the storage is ready early the app is ready at once (no minimum wait, no slow notice)', async () => {
  const t0 = Date.now();
  const { phases } = run(async () => 'store', 5000);
  await wait(10);
  assert.deepEqual(phases, ['opening', 'ready']);
  assert.ok(Date.now() - t0 < 500, 'ready without any deliberate delay');
});

test('P2 startup: if opening takes longer than the limit the screen says so, then still becomes ready when it can', async () => {
  const { phases } = run(() => wait(80).then(() => 'store'), 20);
  await wait(30);
  assert.deepEqual(phases, ['opening', 'slow']);
  await wait(100);
  assert.deepEqual(phases, ['opening', 'slow', 'ready']);
});

test('P3 startup: an initialisation failure is reported as failed, not left loading', async () => {
  const { phases } = run(() => Promise.reject(new Error('storage refused')), 20);
  await wait(60);
  assert.deepEqual(phases, ['opening', 'failed'], 'failed, and no late "slow" after the failure');
});

test('P4 startup: storage that never answers still ends in a visible notice (never an indefinite silent splash)', async () => {
  const { phases, cancel } = run(() => new Promise<never>(() => {}), 20);
  await wait(60);
  assert.deepEqual(phases, ['opening', 'slow']);
  cancel();
});

test('P5 startup: a cancelled startup reports nothing more; the limit is about five seconds; the messages promise nothing untrue', async () => {
  const { phases, cancel } = run(() => wait(30).then(() => 'x'), 10);
  cancel();
  await wait(60);
  assert.deepEqual(phases, ['opening']);
  assert.equal(SLOW_MS, 5000);
  for (const l of ['en', 'bm', 'zh'] as const) {
    // JoyChange002 Change 42: the six visual `steps` are the owner's decorative lines; the three real messages still promise nothing untrue.
    const { opening, slow, failed, retry } = startupStrings[l];
    const all = [opening, slow, failed, retry].join(' ').toLowerCase();
    assert.ok(!/encrypt|secur|ai update|enkripsi|keselamatan|加密|安全/.test(all), `${l}: no claim about encryption, security or AI updates in the real messages`);
  }
  assert.equal(startupLang(['ms-MY']), 'bm');
  assert.equal(startupLang(['zh-Hans-MY']), 'zh');
  assert.equal(startupLang(['fr-FR']), 'en');
  assert.equal(startupLang(undefined), 'en');
});

// ---------- A. save and sync status ----------
test('P5b Change 42: the start-up screen lasts five seconds with six lines spread evenly, in every language', () => {
  assert.equal(SPLASH_MS, 5000);
  assert.equal(SPLASH_STEPS, 6);
  assert.deepEqual([0, 800, 833, 1700, 2500, 3300, 4166, 4999, 9000].map(splashStep), [0, 0, 0, 2, 3, 3, 4, 5, 5]);
  assert.equal(splashStep(-5), 0);
  for (const l of ['en', 'bm', 'zh'] as const) {
    assert.equal(startupStrings[l].steps.length, 6, `${l}: six lines`);
    assert.ok(startupStrings[l].steps.every(x => x.trim().length > 0));
  }
  assert.deepEqual(startupStrings.en.steps, ['Initializing app', 'Analyzing', 'Checking encrypted data checksum', 'Checksum verified', 'Security checks', 'Security check pass']);
});

test('P6 success messages stay two seconds; errors stay longer', () => {
  assert.equal(TOAST_OK_MS, 2000);
  assert.ok(TOAST_ERROR_MS > TOAST_OK_MS);
});

class FailingBackend extends MemoryBackend {
  failing = false;
  async put(k: string, v: unknown) { if (this.failing) throw new Error('disk full'); return super.put(k, v); }
}
const contact = (id: string, name: string): Contact => ({ id, created: 1, updated: 1, name, roles: ['buyer'] });

test('P7 a failed write on the phone is detected (so no success message), and clears after a good write', async () => {
  const b = new FailingBackend();
  const s = await Store.open(b);
  let reported = 0;
  s.onWriteError = () => { reported++; };
  s.upsert('contacts', contact('c1', 'Ahmad'));
  await s.flush();
  assert.equal(s.writeErrors, 0); assert.equal(s.writeFailed, false);
  b.failing = true;
  const before = s.writeErrors;
  s.upsert('contacts', contact('c2', 'Siti'));
  await s.flush();
  assert.ok(s.writeErrors > before, 'the failure was counted, which is what stops the success message');
  assert.equal(s.writeFailed, true);
  assert.ok(reported >= 1, 'the failure message callback ran');
  assert.equal(saveStateFromStore(s), 'failed-phone');
  b.failing = false;
  s.upsert('contacts', contact('c3', 'Lim'));
  await s.flush();
  assert.equal(s.writeFailed, false);
  assert.equal(saveStateFromStore(s), 'phone');
});

test('P8 save states: Saved on this phone, Syncing, Synced and failed are never mixed up', () => {
  const base = { writeFailed: false, syncing: false, signedIn: false, waiting: 0 };
  assert.equal(saveStateOf(base), 'phone');
  assert.equal(saveStateOf({ ...base, signedIn: true, waiting: 2, lastSync: 1 }), 'phone', 'changes waiting: not Synced');
  assert.equal(saveStateOf({ ...base, signedIn: true, lastSync: 1 }), 'synced');
  assert.equal(saveStateOf({ ...base, signedIn: true }), 'phone', 'never synced yet: not Synced');
  assert.equal(saveStateOf({ ...base, signedIn: true, syncing: true, lastSync: 1 }), 'syncing');
  assert.equal(saveStateOf({ ...base, signedIn: true, lastSync: 1, syncError: 'network' }), 'failed-sync');
  assert.equal(saveStateOf({ ...base, writeFailed: true, syncing: true, signedIn: true, lastSync: 1 }), 'failed-phone', 'a phone failure outranks everything');
  assert.equal(saveStateOf({ ...base, syncError: 'network' }), 'phone', 'signed out: a stale sync error is not shown');
});

test('P9 the store reports "syncing" only while a sync runs, and a failed sync does not look like success', async () => {
  const s = await Store.open(new MemoryBackend());
  const session = { accessToken: 't', refreshToken: 'r', expiresAt: Date.now() + 3600_000, email: 'a@x.c', userId: 'u1', workspaceId: 'w1', role: 'owner' as const };
  s.setSingleton('meta', { syncSession: session });
  let during: boolean | undefined;
  const failingFetch = (async () => { during = s.syncing; throw new TypeError('offline'); }) as unknown as typeof fetch;
  await assert.rejects(() => syncNow(s, { supabaseUrl: 'https://x.test', supabaseAnonKey: 'k' }, failingFetch));
  assert.equal(during, true, 'syncing while the request was running');
  assert.equal(s.syncing, false, 'and not afterwards');
  assert.equal(s.getState().meta.lastSync, undefined, 'a failed sync records no last-sync time');
  assert.notEqual(saveStateFromStore(s), 'synced');
});

// ---------- D. buyer statuses ----------
test('P10 buyer statuses: Cold blue, Warm yellow, Hot red, Dropped gray, Booked / Bought green; no Inactive', () => {
  assert.deepEqual(LEAD_STATUSES, ['cold', 'warm', 'hot', 'dropped', 'booked']);
  assert.deepEqual(LEAD_COLOURS, { cold: '#3B82F6', warm: '#EAB308', hot: '#EF4444', dropped: '#9CA3AF', booked: '#22C55E' });
  assert.ok(!(LEAD_STATUSES as string[]).includes('inactive'));
});

test('P11 new sample data has no Inactive buyer', async () => {
  const s = await Store.open(new MemoryBackend());
  loadSampleInto(s);
  assert.equal(inactiveContacts(s.getState().contacts).length, 0);
  assert.ok(s.getState().contacts.some(c => c.leadStatus === 'booked'), 'the sample shows the new status');
});

test('P12 old Inactive buyers become Dropped with a reviewable report, the original is kept, nothing else changes', async () => {
  const b = new MemoryBackend();
  const s = await Store.open(b);
  const old = { ...contact('c1', 'Old Inactive'), leadStatus: 'inactive' as never, phone: '012', notes: 'keep me', roles: ['buyer' as const] };
  s.upsert('contacts', old);
  s.upsert('contacts', { ...contact('c2', 'Hot one'), leadStatus: 'hot' });
  s.upsert('contacts', { ...contact('v1', 'Vendor'), roles: ['vendor'], vendorStatus: 'listed' });
  assert.equal(convertInactive(s, 5), 1);
  const c1 = s.getState().contacts.find(c => c.id === 'c1')!;
  assert.equal(c1.leadStatus, 'dropped');
  assert.equal(c1.previousLeadStatus, 'inactive', 'recoverable: the original value is kept');
  assert.equal(c1.phone, '012'); assert.equal(c1.notes, 'keep me'); assert.equal(c1.name, 'Old Inactive');
  assert.equal(s.getState().contacts.find(c => c.id === 'c2')!.leadStatus, 'hot');
  assert.equal(s.getState().contacts.find(c => c.id === 'v1')!.vendorStatus, 'listed', 'vendor statuses are separate');
  const rep = s.getState().meta.leadReview!;
  assert.deepEqual(rep, { at: 5, ids: ['c1'], reviewed: false });
  assert.deepEqual(reviewContacts(s.getState().contacts, rep.ids).map(c => c.name), ['Old Inactive']);
  assert.equal(convertInactive(s, 6), 0, 'running it again changes nothing');
  assert.ok(s.getState().meta.dirty.includes('contacts:c1'), 'the change will sync like any other edit');
  await s.flush();
  const again = await Store.open(b);
  assert.equal(again.getState().meta.leadReview!.ids[0], 'c1', 'the report survives closing the app');
});

// ---------- E. property cards ----------
test('P13 property card titles no longer start with the word "Unit"; the stored unit number is untouched', () => {
  const l = { id: 'p', created: 0, updated: 0, photos: [], unitNo: '7', lotNo: '2/14', street: 'Jalan A', township: 'Nilai' };
  assert.equal(title(l as never), '7, Lot 2/14, Jalan A, Nilai', 'Change 009: an older separate lot number shows with the unit');
  assert.equal(l.unitNo, '7');
  assert.equal(title({ ...l, unitNo: undefined } as never), 'Lot 2/14, Jalan A, Nilai');
  assert.ok(!title({ ...l, unitNo: 'B-12-3' } as never).startsWith('Unit'));
});

// ---------- G. Easy Bug Report ----------
const cfg = { supabaseUrl: 'https://x.test', supabaseAnonKey: 'anon-key' };
const session = { accessToken: 'TOKEN-123', refreshToken: 'REFRESH-456', expiresAt: Date.now() + 3600_000, email: 'me@x.c', userId: 'u-1' };
const input = { description: '  The calendar did not open.  ', screen: 'settings', language: 'en', appVersion: '2.1.0', platform: 'android' };
type Call = { url: string; init: RequestInit };
const recorder = (status = 201) => { const calls: Call[] = []; const f = (async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response('', { status }); }) as unknown as typeof fetch; return { calls, f }; };

test('P14 bug report: nothing is sent when it is not set up, not signed in, or empty (and it says why)', async () => {
  const r = recorder();
  assert.deepEqual(await sendBugReport(input, { supabaseUrl: '', supabaseAnonKey: '' }, session, r.f), { ok: false, reason: 'notConfigured' });
  assert.deepEqual(await sendBugReport(input, cfg, undefined, r.f), { ok: false, reason: 'notSignedIn' });
  assert.deepEqual(await sendBugReport({ ...input, description: '   ' }, cfg, session, r.f), { ok: false, reason: 'empty' });
  assert.deepEqual(await sendBugReport({ ...input, screenshot: new Blob([new Uint8Array(MAX_SHOT_BYTES + 1)]) }, cfg, session, r.f), { ok: false, reason: 'tooBig' });
  assert.equal(r.calls.length, 0, 'no request left the phone');
});

test('P15 bug report: success only after the service accepted it; the row has no secrets or records', async () => {
  const r = recorder(201);
  const res = await sendBugReport(input, cfg, session, r.f);
  assert.deepEqual(res, { ok: true });
  assert.equal(r.calls.length, 1);
  assert.equal(r.calls[0].url, 'https://x.test/rest/v1/eab_bug_reports');
  const row = JSON.parse(String(r.calls[0].init.body));
  assert.deepEqual(Object.keys(row).sort(), ['app_version', 'description', 'id', 'language', 'platform', 'screen', 'screenshot_path']);
  assert.equal(row.description, 'The calendar did not open.');
  assert.equal(row.screenshot_path, null);
  const text = JSON.stringify(row);
  assert.ok(!/TOKEN-123|REFRESH-456|anon-key|me@x\.c/.test(text), 'no token, key or e-mail in the report');
});

test('P16 bug report: a screenshot goes to the private bucket under the person’s own folder, then the row points to it', async () => {
  const r = recorder(200);
  const res = await sendBugReport({ ...input, screenshot: new Blob(['jpg'], { type: 'image/jpeg' }) }, cfg, session, r.f);
  assert.deepEqual(res, { ok: true });
  assert.equal(r.calls.length, 2);
  assert.match(r.calls[0].url, /^https:\/\/x\.test\/storage\/v1\/object\/bug-reports\/u-1\/[0-9a-f-]{36}\.jpg$/);
  const row = JSON.parse(String(r.calls[1].init.body));
  assert.equal(r.calls[0].url.endsWith(row.screenshot_path), true);
  assert.match(row.screenshot_path, /^u-1\//);
});

test('P17 bug report: failures are reported as failures, never as success', async () => {
  assert.deepEqual(await sendBugReport(input, cfg, session, (async () => { throw new TypeError('offline'); }) as unknown as typeof fetch), { ok: false, reason: 'network' });
  assert.deepEqual(await sendBugReport(input, cfg, session, recorder(403).f), { ok: false, reason: 'rejected' });
  assert.deepEqual(await sendBugReport(input, cfg, session, recorder(404).f), { ok: false, reason: 'server' });
  assert.deepEqual(await sendBugReport(input, cfg, session, recorder(500).f), { ok: false, reason: 'server' });
  // the screenshot upload failing stops the report: no row is added that points at a missing screenshot
  const calls: string[] = [];
  const f = (async (url: string) => { calls.push(url); return new Response('', { status: url.includes('/storage/') ? 500 : 201 }); }) as unknown as typeof fetch;
  assert.deepEqual(await sendBugReport({ ...input, screenshot: new Blob(['x'], { type: 'image/jpeg' }) }, cfg, session, f), { ok: false, reason: 'server' });
  assert.equal(calls.length, 1);
});

test('P18 bug report: the description is limited, and the wording is the approved wording in all three languages', () => {
  assert.equal(cleanDescription('x'.repeat(5000)).length, MAX_DESCRIPTION);
  assert.equal(buildRow(input, 'id1', null).description, 'The calendar did not open.');
  const en = bugStrings.en;
  assert.equal(en.intro, 'Found a problem? No worries — it’s as easy as 1-2-3.');
  assert.deepEqual(en.steps, ['Screenshot.', 'Brief description.', 'Send.']);
  assert.equal(en.outro, 'We’ll look into it and improve your experience.');
  for (const l of ['bm', 'zh'] as const) {
    assert.equal(Object.keys(bugStrings[l]).sort().join(), Object.keys(en).sort().join(), `${l} has every key`);
    assert.equal(Object.keys(bugStrings[l].fail).sort().join(), Object.keys(en.fail).sort().join(), `${l} has every failure message`);
    assert.notEqual(bugStrings[l].intro, en.intro);
  }
});
