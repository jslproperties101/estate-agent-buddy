// Changes 19 and 20: the usage log (what the phone notes and sends) and the Developer Dashboard's calls and helpers.
// A stand-in for the cloud records what the phone sends; nothing here uses a real Supabase project or Google.
// The database side (who may read what, limits, retention) is tested on PostgreSQL by supabase/tests/change019-test.sh.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryBackend } from '../src/data/backend';
import { Store } from '../src/data/store';
import { UsageLogger, usage, codeOf, deviceText, detectDevice, BATCH, MAX_QUEUE } from '../src/usage/logger';
import { DevApi, rangeOf, bytesText, minutesText, devErrorText, myDate, recordsText } from '../src/usage/api';
import { csvOf } from '../src/usage/DevDashboard';
import { reverseGeocode, geocodeAddress, searchPlaces, routePreview } from '../src/maps/google';
import { runSync } from '../src/data/syncRunner';
import { rpc, TeamError } from '../src/team/api';
import { FakeCloud, cfg, phone } from './support/fakeCloud';
import type { Contact } from '../src/data/types';

const DB_CODE = /^[a-z0-9][a-z0-9_.:-]{0,59}$/;
const ALLOWED_KEYS = new Set(['kind', 'name', 'screen', 'ok', 'n', 'value', 'at', 'app_version', 'platform', 'device']);

/** A signed-in phone whose settings point at a fake project, and a fake `eab_log_usage` that records what it receives. */
async function setup(email = 'a@x.c') {
  const store = await Store.open(new MemoryBackend());
  store.setSingleton('settings', { supabaseUrl: cfg.supabaseUrl, supabaseAnonKey: cfg.supabaseAnonKey });
  store.setSingleton('meta', { syncSession: { accessToken: 'tok', refreshToken: 'r', expiresAt: Date.now() + 3600_000, email, userId: `u-${email}` } });
  const sent: Record<string, unknown>[][] = [];
  const mode = { fail: 0, status: 200 };
  const fetchFn = (async (url: string, init: RequestInit = {}) => {
    if (String(url).endsWith('/rest/v1/rpc/eab_log_usage')) {
      if (mode.fail > 0) { mode.fail--; return new Response('{"message":"boom"}', { status: 500 }); }
      if (mode.status !== 200) return new Response('{"code":"PGRST202","message":"Could not find the function"}', { status: mode.status });
      const events = (JSON.parse(String(init.body)) as { p_events: Record<string, unknown>[] }).p_events;
      sent.push(events);
      return new Response(String(events.length), { status: 200 });
    }
    return new Response('null', { status: 200 });
  }) as typeof fetch;
  const log = new UsageLogger();
  log.attach(store, { appVersion: '2.2.0-qa', platform: 'android', device: 'SM-S918B', fetchFn });
  return { store, log, sent, mode, fetchFn };
}

test('U1 codes are always safe for the database: lower-case, short, no spaces or symbols', () => {
  assert.equal(codeOf('listingForm'), 'listing-form');
  assert.equal(codeOf('geocoding.reverse'), 'geocoding.reverse');
  for (const hostile of ['Jalan Ampang 12, 50450 Kuala Lumpur', 'Encik Ali 012-3456789', '../../etc/passwd', '😀😀', '', '   ', '-x', 'A'.repeat(300), 'a@b.com', "x'; drop table eab_records;--"]) {
    const c = codeOf(hostile);
    assert.ok(c === '' || DB_CODE.test(c), `${JSON.stringify(hostile)} → ${JSON.stringify(c)}`);
  }
  assert.equal(codeOf(42), '');
  assert.equal(codeOf(undefined), '');
  assert.ok(codeOf('x'.repeat(300)).length <= 60);
  assert.equal(deviceText('SM-S918B'), 'SM-S918B');
  assert.equal(deviceText('K'), '', 'the hidden-model placeholder is not worth sending');
  assert.equal(deviceText('Pixel 8 <script>'), 'Pixel 8 script');
});

test('U2 nothing is recorded while nobody is signed in', async () => {
  const { store, log } = await setup();
  store.setSingleton('meta', { syncSession: undefined });
  assert.equal(log.track({ kind: 'screen', name: 'home' }), false);
  assert.equal(log.pending().length, 0);
});

test('U3 events are sent as plain short codes only, with no user id, and removed from the queue once stored', async () => {
  const { log, sent } = await setup();
  log.screen('listingForm');
  log.google('geocoding.reverse', true);
  log.ai('expert.ask', false);
  log.feature('properties.create');
  log.sync('sync.run', true, 3);
  log.metric('storage.local_bytes', 5_242_880);
  assert.equal(await log.flush(true), 6);
  assert.equal(log.pending().length, 0);
  assert.equal(sent.length, 1);
  for (const e of sent[0]) {
    assert.deepEqual(Object.keys(e).filter(k => !ALLOWED_KEYS.has(k)), [], 'only the allowed fields leave the phone');
    assert.ok(DB_CODE.test(String(e.name)), String(e.name));
    assert.equal(e.app_version, '2.2.0-qa'); assert.equal(e.platform, 'android'); assert.equal(e.device, 'SM-S918B');
    assert.ok(!('user_id' in e) && !('u' in e) && !('email' in e));
    assert.ok(!Number.isNaN(Date.parse(String(e.at))));
  }
  const g = sent[0].find(e => e.kind === 'google')!;
  assert.deepEqual([g.name, g.ok, g.screen], ['geocoding.reverse', true, 'listing-form'], 'a Google call carries the screen it came from');
  assert.equal(sent[0].find(e => e.name === 'storage.local_bytes')!.value, 5_242_880);
});

test('U4 a bad value or hostile text never becomes part of an event', async () => {
  const { log } = await setup();
  log.track({ kind: 'google', name: 'Jalan Ampang 12, Kuala Lumpur', value: Number.NaN, n: 99999 });
  log.track({ kind: 'screen', name: 'home', screen: 'Encik Ali 0123456789', value: Infinity, n: -3 });
  log.track({ kind: 'nonsense' as never, name: 'x' });
  log.track({ kind: 'error', name: '', ok: false });
  const [a, b] = log.pending();
  assert.equal(log.pending().length, 2, 'an unknown kind and an empty name are refused');
  for (const e of [a, b]) { assert.ok(DB_CODE.test(e.name)); assert.ok(!('value' in e)); assert.ok(!('n' in e), 'a count outside 1..1000 is dropped'); if (e.screen) assert.ok(DB_CODE.test(e.screen)); }
});

test('U5 a failed send keeps the events and retries; a missing database function waits 30 minutes', async () => {
  const { log, sent, mode } = await setup();
  log.screen('home'); log.screen('todo');
  mode.fail = 1;
  assert.equal(await log.flush(true), 0);
  assert.equal(log.pending().length, 2, 'kept');
  assert.equal(log.stats.failedSends, 1);
  assert.equal(await log.flush(false), 0, 'backs off instead of retrying at once');
  assert.equal(await log.flush(true), 2);
  assert.equal(sent.length, 1);

  const b = await setup('b@x.c');
  b.log.screen('home');
  b.mode.status = 404;                                  // the proposal is not applied to this project yet
  assert.equal(await b.log.flush(true), 0);
  assert.equal(b.log.pending().length, 1, 'kept until the database part is installed');
  assert.equal(await b.log.flush(false), 0, 'and not retried every minute');
  b.mode.status = 200;
  assert.equal(await b.log.flush(true), 1);
});

test('U6 more than 200 waiting events go in batches of at most 200, oldest first', async () => {
  const { log, sent } = await setup();
  for (let i = 0; i < 450; i++) log.track({ kind: 'feature', name: `f${i}`, at: 1_700_000_000_000 + i });
  assert.equal(await log.flush(true), 450);
  assert.deepEqual(sent.map(b => b.length), [BATCH, BATCH, 50]);
  assert.equal(sent[0][0].name, 'f0'); assert.equal(sent[2][49].name, 'f449');
});

test('U7 the waiting queue is capped, so an offline phone never fills its storage', async () => {
  const { log } = await setup();
  for (let i = 0; i < MAX_QUEUE + 50; i++) log.track({ kind: 'feature', name: `f${i}` });
  assert.equal(log.pending().length, MAX_QUEUE);
  assert.equal(log.pending()[0].name, 'f50', 'the oldest are dropped first');
  assert.equal(log.stats.dropped, 50);
});

test("U8 events are only ever sent as the person who was signed in when they happened", async () => {
  const { store, log, sent } = await setup('a@x.c');
  log.screen('home');
  store.setSingleton('meta', { syncSession: { accessToken: 'tok2', refreshToken: 'r', expiresAt: Date.now() + 3600_000, email: 'b@x.c', userId: 'u-b@x.c' } });
  log.track({ kind: 'screen', name: 'todo' });
  assert.equal(await log.flush(true), 1);
  assert.deepEqual(sent[0].map(e => e.name), ['todo'], "A's waiting event is dropped, never sent under B");
  assert.ok(log.stats.dropped >= 1);
});

test('U9 time in the app counts only while the app is in front AND the person touched it in the last minute', async () => {
  const { log } = await setup();
  const t0 = 1_700_000_000_000;
  log.tick(t0, true); log.touched(t0);
  log.tick(t0 + 15_000, true); log.tick(t0 + 30_000, true);          // 30 s of use
  assert.equal(log.pendingActiveMs(), 30_000);
  log.tick(t0 + 45_000, false);                                      // app in the background: not counted
  log.tick(t0 + 60_000, true);                                       // 15 s since the last tick, but the person has been idle 60 s
  assert.equal(log.pendingActiveMs(), 30_000, 'idle time is not counted');
  log.touched(t0 + 61_000); log.tick(t0 + 70_000, true);
  assert.equal(log.pendingActiveMs(), 40_000);
  await log.flush(true);
  const q = log.pending();
  assert.equal(q.length, 0);
  log.tick(t0 + 4 * 3600_000, true);                                 // a phone asleep for hours adds at most two ticks, not hours
  log.touched(t0 + 4 * 3600_000); log.tick(t0 + 4 * 3600_000 + 15_000, true);
  assert.ok(log.pendingActiveMs() <= 45_000);
});

test('U10 time in the app is sent as one session.active event in milliseconds', async () => {
  const { log, sent } = await setup();
  const t0 = Date.now();
  log.tick(t0, true); log.touched(t0 + 1); log.tick(t0 + 15_000, true); log.tick(t0 + 30_000, true);
  await log.flush(true);
  const e = sent[0].find(x => x.name === 'session.active')!;
  assert.equal(e.kind, 'session'); assert.equal(e.value, 30_000);
});

test('U11 screens: a pop-up counts as its own screen; the same screen twice is noted once', async () => {
  const { log } = await setup();
  log.screen('listingForm'); log.screen('listingForm');
  assert.equal(log.pending().filter(e => e.kind === 'screen').length, 1);
  log.setOverlay('location-picker'); log.google('geocoding.reverse', true);
  log.setOverlay(''); log.google('geocoding.reverse', true);
  const g = log.pending().filter(e => e.kind === 'google');
  assert.deepEqual(g.map(e => e.screen), ['location-picker', 'listing-form']);
});

test('U12 successful syncs that changed nothing are noted at most every 30 minutes; failures always; errors at most 10 an hour', async () => {
  const { log } = await setup();
  for (let i = 0; i < 5; i++) log.sync('sync.run', true, 0);
  assert.equal(log.pending().filter(e => e.name === 'sync.run').length, 1);
  log.sync('sync.run', true, 4); log.sync('sync.run', false);
  assert.equal(log.pending().filter(e => e.name === 'sync.run').length, 3, 'a sync that moved records, and a failure, are always noted');
  for (let i = 0; i < 25; i++) log.error('js.error');
  assert.equal(log.pending().filter(e => e.kind === 'error').length, 10);
  assert.ok(log.pending().filter(e => e.kind === 'error').every(e => e.ok === false));
});

test('U13 waiting events survive closing the app', async () => {
  const backend = new MemoryBackend();
  const store = await Store.open(backend);
  store.setSingleton('meta', { syncSession: { accessToken: 't', refreshToken: 'r', expiresAt: Date.now() + 3600_000, email: 'a@x.c', userId: 'u-a' } });
  const one = new UsageLogger(); one.attach(store, { appVersion: '1', platform: 'android' });
  one.screen('home'); one.google('places.autocomplete', true);
  await one.persistNow();
  const store2 = await Store.open(backend);
  const two = new UsageLogger(); two.attach(store2, { appVersion: '1', platform: 'android' });
  await two.restore();
  assert.deepEqual(two.pending().map(e => e.name), ['home', 'places.autocomplete']);
});

test('U14 Google calls are noted by API name and success, and nothing about the request or the answer', async () => {
  const { store, log } = await setup('g@x.c');
  usage.attach(store, { appVersion: '1', platform: 'android' });
  usage.clear();
  let calls = 0;
  const maps = {
    Geocoder: class { async geocode(req: { location?: unknown; address?: string }) { calls++; if (req.address === 'nowhere') throw Object.assign(new Error('x'), { code: 'ZERO_RESULTS' }); if (req.address === 'down') throw new Error('network'); return { results: [{ address_components: [], formatted_address: 'Jalan Secret 1', place_id: 'p', geometry: { location: { lat: () => 3.1, lng: () => 101.6 } } }] }; } },
    importLibrary: async (name: string) => name === 'places'
      ? { AutocompleteSuggestion: { fetchAutocompleteSuggestions: async () => ({ suggestions: [{ placePrediction: { mainText: { text: 'Mid Valley' }, text: { text: 'Mid Valley City' }, toPlace: () => ({ fetchFields: async () => undefined, addressComponents: [], location: { lat: () => 3.1, lng: () => 101.7 }, formattedAddress: 'Mid Valley', id: 'pid' }) } }] }) } }
      : { Route: { computeRoutes: async () => { throw new Error('Routes API not enabled'); } } },
    DirectionsService: class { async route() { return { routes: [{ overview_path: [{ lat: () => 1, lng: () => 2 }], legs: [{ distance: { value: 1000 }, duration: { value: 120 } }] }] }; } },
    TravelMode: { DRIVING: 'DRIVING' },
  };
  await reverseGeocode(maps, 3.1234, 101.5678);
  await geocodeAddress(maps, 'Jalan Ampang 12, Kuala Lumpur');
  await geocodeAddress(maps, 'nowhere').catch(() => null);
  await geocodeAddress(maps, 'down').catch(() => null);
  const found = await searchPlaces(maps, 'mid valley');
  await found[0].select();
  const r = await routePreview(maps, { lat: 3.1, lng: 101.6 }, { lat: 3.2, lng: 101.7 });
  assert.equal(r?.distanceM, 1000);
  const ev = usage.pending();
  assert.deepEqual(ev.map(e => `${e.name}:${e.ok}`), [
    'geocoding.reverse:true', 'geocoding.forward:true', 'geocoding.forward:true' /* zero results is still a billed, answered call */, 'geocoding.forward:false',
    'places.autocomplete:true', 'places.details:true', 'routes.compute:false', 'directions.route:true',
  ]);
  assert.equal(calls, 4);
  const text = JSON.stringify(ev).toLowerCase();
  for (const secret of ['ampang', 'secret', 'mid valley', '3.1234', '101.5678', 'kuala lumpur', 'nowhere']) assert.ok(!text.includes(secret), `"${secret}" must not appear in the log`);
  usage.clear();
});

test('U15 the store tells the log about a NEW record the person made, not edits, sample data or records that arrive from the cloud', async () => {
  const cloud = new FakeCloud();
  const a = await phone(cloud, 'p@x.c');
  const seen: string[] = []; let files = 0;
  a.store.onCreate = c => seen.push(c); a.store.onFileAdded = () => files++;
  const contact: Contact = { id: 'c1', created: 1, updated: 1, name: 'Ahmad', roles: ['buyer'] };
  a.store.upsert('contacts', contact);
  a.store.upsert('contacts', { ...contact, name: 'Ahmad B' });                 // an edit
  a.store.upsert('contacts', { ...contact, id: 'c2', sample: true });          // sample data
  a.store.applyRemote('contacts', 'c3', { id: 'c3', created: 1, updated: 1, name: 'From cloud', roles: ['buyer'] });
  assert.deepEqual(seen, ['contacts']);
  await a.store.putFile(new Blob(['x']));
  assert.equal(files, 1);
  a.store.onCreate = () => { throw new Error('a broken listener'); };
  assert.doesNotThrow(() => a.store.upsert('contacts', { ...contact, id: 'c4' }), 'a broken usage listener never breaks a save');
});

test('U16 team and sharing actions are noted by name; the usage send itself is not (no loop)', async () => {
  const { store, log, fetchFn } = await setup('t@x.c');
  usage.attach(store, { appVersion: '1', platform: 'android', fetchFn }); usage.clear();
  await rpc(store, cfg, 'eab_share_set', { p_ws: 'w', p_items: [] }, fetchFn);
  await rpc(store, cfg, 'eab_team_invite', { p_email: 'someone@x.c' }, fetchFn);
  await rpc(store, cfg, 'eab_log_usage', { p_events: [] }, fetchFn);
  await rpc(store, cfg, 'eab_team_status', {}, fetchFn);
  assert.deepEqual(usage.pending().map(e => e.name), ['share.set', 'team.invite']);
  assert.ok(!JSON.stringify(usage.pending()).includes('someone'), 'no e-mail in the log');
  usage.clear(); void log;
});

test('U17 a sync run is noted (count moved, or failure) without disturbing the sync result', async () => {
  const cloud = new FakeCloud();
  const a = await phone(cloud, 'sy@x.c');
  usage.attach(a.store, { appVersion: '1', platform: 'android' }); usage.clear();
  a.store.upsert('contacts', { id: 'c1', created: 1, updated: 1, name: 'Ahmad', roles: ['buyer'] });
  const ok = await runSync(a.store, cfg, cloud.fetch);
  assert.equal(ok.ok, true);
  cloud.failNext('/rest/v1/', 1);
  a.store.upsert('contacts', { id: 'c2', created: 1, updated: 1, name: 'Bee', roles: ['buyer'] });
  const bad = await runSync(a.store, cfg, cloud.fetch);
  assert.equal(bad.ok, false);
  const s = usage.pending().filter(e => e.kind === 'sync');
  assert.equal(s.length, 2);
  assert.deepEqual([s[0].ok, s[0].value && s[0].value > 0], [true, true]);
  assert.equal(s[1].ok, false);
  usage.clear();
});

test('U18 the dashboard asks the database functions by name with empty filters left out; a non-developer or missing function is a plain message', async () => {
  const { store } = await setup('d@x.c');
  const calls: { fn: string; body: Record<string, unknown> }[] = [];
  let answer: Response = new Response('[]', { status: 200 });
  const fetchFn = (async (url: string, init: RequestInit = {}) => { calls.push({ fn: String(url).split('/rpc/')[1], body: JSON.parse(String(init.body)) }); return answer.clone(); }) as typeof fetch;
  const api = new DevApi(store, fetchFn);
  const r = rangeOf('24h', { from: '2026-10-01', to: '2026-10-02' }, Date.parse('2026-10-18T00:00:00Z'));
  await api.users(r.range, { search: '', appVersion: undefined });
  await api.breakdown(r.range, { user: 'u1', kind: 'google', screen: '' });
  await api.events(r.range, { name: 'geocoding.reverse' }, 50);
  await api.daily(r.days, {});
  await api.history(r.days, { kind: 'google' });
  await api.overview(r.range);
  assert.deepEqual(calls.map(c => c.fn), ['eab_dev_users', 'eab_dev_breakdown', 'eab_dev_events', 'eab_dev_daily', 'eab_dev_history', 'eab_dev_overview']);
  assert.deepEqual(calls[0].body, { p_from: r.range.from, p_to: r.range.to, p_search: null, p_app_version: null });
  assert.deepEqual(calls[1].body, { p_from: r.range.from, p_to: r.range.to, p_user: 'u1', p_kind: 'google', p_screen: null, p_app_version: null });
  assert.equal(calls[2].body.p_limit, 50); assert.equal(calls[2].body.p_name, 'geocoding.reverse');
  assert.deepEqual(calls[3].body, { p_from: r.days.from, p_to: r.days.to, p_user: null });
  answer = new Response('true', { status: 200 });
  assert.equal(await api.isDeveloper(), true);
  answer = new Response('false', { status: 200 });
  assert.equal(await api.isDeveloper(), false);
  answer = new Response('{"message":"not allowed"}', { status: 403 });
  await assert.rejects(() => api.overview(r.range), (e: unknown) => e instanceof TeamError && e.code === 'not-allowed' && /developer list/.test(devErrorText(e)));
  assert.equal(await api.isDeveloper(), false, 'refused means "not a developer", never an error on the Settings screen');
  answer = new Response('{"code":"PGRST202","message":"Could not find the function"}', { status: 404 });
  await assert.rejects(() => api.overview(r.range), (e: unknown) => /not been applied/.test(devErrorText(e)));
  assert.equal(await api.isDeveloper(), false);
});

test('U19 periods are worked out in Malaysian time; whole days for the totals', () => {
  const now = Date.parse('2026-10-17T20:30:00Z');                        // 18 Oct 04:30 in Malaysia
  assert.equal(myDate(now), '2026-10-18');
  const h = rangeOf('1h', { from: '', to: '' }, now);
  assert.equal(h.range.from, '2026-10-17T19:30:00.000Z'); assert.equal(h.days.to, '2026-10-18');
  const w = rangeOf('7d', { from: '', to: '' }, now);
  assert.deepEqual(w.days, { from: '2026-10-11', to: '2026-10-18' });
  const c = rangeOf('custom', { from: '2026-10-05', to: '2026-10-03' }, now);   // typed the wrong way round
  assert.deepEqual(c.days, { from: '2026-10-03', to: '2026-10-05' });
  assert.equal(c.range.from, '2026-10-02T16:00:00.000Z'); assert.equal(c.range.to, '2026-10-05T16:00:00.000Z', 'the whole of 5 Oct Malaysian time is included');
});

test('U20 plain-text helpers', () => {
  assert.equal(bytesText(0), '0 B'); assert.equal(bytesText(1536), '1.50 KB'); assert.equal(bytesText(150_000), '146 KB'); assert.equal(bytesText(13_100_000), '12.5 MB'); assert.equal(bytesText(null), '–');
  assert.equal(minutesText(3), '3 min'); assert.equal(minutesText(125), '2 h 5 min'); assert.equal(minutesText(undefined), '–');
  assert.equal(recordsText({ properties: 2, contacts: 1 }), 'contacts 1, properties 2'); assert.equal(recordsText({}), '–');
  assert.equal(csvOf(['A', 'B'], [['x,y', 'say "hi"'], [1, 'ok']]), 'A,B\n"x,y","say ""hi"""\n1,ok');
});

test('U21 phone model: the browser-reported model first, then the user-agent text; unknown gives nothing', async () => {
  const nav = (o: unknown) => o as Navigator;
  assert.equal(await detectDevice(nav({ userAgentData: { getHighEntropyValues: async () => ({ model: 'Pixel 8' }) }, userAgent: '' })), 'Pixel 8');
  assert.equal(await detectDevice(nav({ userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S918B Build/UP1A) AppleWebKit' })), 'SM-S918B');
  assert.equal(await detectDevice(nav({ userAgent: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit' })), '');
  assert.equal(await detectDevice(nav({ userAgentData: { getHighEntropyValues: async () => { throw new Error('blocked'); } }, userAgent: '' })), '');
});
