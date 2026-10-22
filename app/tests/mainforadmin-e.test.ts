// MainForAdmin-E: the phone's side of Admin EAB feature flags (eab_my_flags) and tapped push alerts that open the post.
// A stand-in answers like the database; nothing here uses a real Supabase project or a real phone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryBackend } from '../src/data/backend';
import { Store } from '../src/data/store';
import { cleanFlags, myFlags, tileHidden, betaOn, refreshFlags, FLAG_KEY } from '../src/feed/flags';
import { feedTapTarget } from '../src/feed/tap';
import { onFeedTap, feedTapped } from '../src/native/push';
import { feedStrings } from '../src/feed/strings';
import type { FeedItem } from '../src/feed/feed';

const cfg = { supabaseUrl: 'https://fe-test.supabase.co', supabaseAnonKey: 'anon' };
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function signedIn(user = 'u1') {
  const store = await Store.open(new MemoryBackend());
  store.setSingleton('settings', { supabaseUrl: cfg.supabaseUrl, supabaseAnonKey: cfg.supabaseAnonKey });
  store.setSingleton('meta', { syncSession: { accessToken: 'tok', refreshToken: 'r', expiresAt: Date.now() + 3600_000, email: `${user}@x.c`, userId: user } });
  return store;
}

function fakeDb(answer: unknown, opts: { offline?: boolean; missing?: boolean } = {}) {
  const calls: string[] = [];
  const fetchFn = (async (url: string) => {
    if (opts.offline) throw new TypeError('Failed to fetch');
    const fn = String(url).split('/rpc/')[1];
    calls.push(fn);
    if (opts.missing) return new Response('{"code":"PGRST202","message":"Could not find the function public.eab_my_flags"}', { status: 404 });
    if (fn === 'eab_my_flags') return Response.json(answer);
    return new Response('{}', { status: 500 });
  }) as typeof fetch;
  return { calls, fetchFn };
}

test('E-1 only well-formed keys with true / false answers are kept', () => {
  assert.deepEqual(cleanFlags({ 'tile.gps': false, 'beta.voice2': true, 'Bad Key': true, 'tile.x': 'yes', a: true }), { 'tile.gps': false, 'beta.voice2': true });
  assert.deepEqual(cleanFlags(null), {});
  assert.deepEqual(cleanFlags([true]), {});
  assert.deepEqual(cleanFlags('x'), {});
  assert.ok(FLAG_KEY.test('tile.market') && !FLAG_KEY.test('Tile.Market') && !FLAG_KEY.test('x'));
});

test('E-2 a tile is hidden only when its tile.<key> switch exists and is OFF; a test feature shows only when ON', () => {
  const f = { 'tile.gps': false, 'tile.finance': true, 'beta.pilot': true, 'beta.off': false };
  assert.equal(tileHidden(f, 'gps'), true);
  assert.equal(tileHidden(f, 'finance'), false, 'switched on: shown');
  assert.equal(tileHidden(f, 'market'), false, 'no flag: shown as before');
  assert.equal(tileHidden({}, 'gps'), false, 'never heard from the company: nothing hidden');
  assert.equal(betaOn(f, 'pilot'), true);
  assert.equal(betaOn(f, 'off'), false);
  assert.equal(betaOn(f, 'other'), false, 'no flag: test feature hidden');
  assert.equal(betaOn({ 'tile.pilot': true }, 'pilot'), false, 'a tile key never unlocks a test feature');
});

test('E-3 refreshFlags keeps the answer for the signed-in agent; another account never uses it', async () => {
  const store = await signedIn('u1');
  const db = fakeDb({ 'tile.gps': false, 'beta.pilot': true, junk: 7 });
  assert.equal(await refreshFlags(store, cfg, db.fetchFn), true);
  assert.deepEqual(db.calls, ['eab_my_flags']);
  assert.deepEqual(myFlags(store), { 'tile.gps': false, 'beta.pilot': true });
  store.setSingleton('meta', { syncSession: { ...store.getState().meta.syncSession!, userId: 'u2' } });
  assert.deepEqual(myFlags(store), {}, "u2 does not get u1's switches");
});

test('E-4 offline keeps the last answer; a database without eab_my_flags means no switches (the app as before)', async () => {
  const store = await signedIn('u1');
  await refreshFlags(store, cfg, fakeDb({ 'tile.gps': false }).fetchFn);
  assert.equal(await refreshFlags(store, cfg, fakeDb(null, { offline: true }).fetchFn), false);
  assert.deepEqual(myFlags(store), { 'tile.gps': false }, 'offline: last answer kept');
  assert.equal(await refreshFlags(store, cfg, fakeDb(null, { missing: true }).fetchFn), false);
  assert.deepEqual(myFlags(store), {}, 'function not on this database: nothing hidden');
});

test('E-5 not signed in: nothing is asked and nothing hidden', async () => {
  const store = await Store.open(new MemoryBackend());
  store.setSingleton('settings', { supabaseUrl: cfg.supabaseUrl, supabaseAnonKey: cfg.supabaseAnonKey });
  const db = fakeDb({ 'tile.gps': false });
  assert.equal(await refreshFlags(store, cfg, db.fetchFn), false);
  assert.deepEqual(db.calls, []);
  assert.deepEqual(myFlags(store), {});
});

const item = (id: string, kind: FeedItem['kind'], extra: Partial<FeedItem> = {}): FeedItem => ({ id, kind, title: `T ${id}`, ...extra });

test('E-6 a tapped alert opens the exact post: news, project, announcement', () => {
  const items = [item(ID(1), 'news'), item(ID(2), 'project'), item(ID(3), 'announcement', { display: 'banner' })];
  assert.deepEqual(feedTapTarget(items, ID(1), true), { screen: { name: 'marketNews', openId: ID(1) } });
  assert.deepEqual(feedTapTarget(items, ID(2), true), { screen: { name: 'projects', openId: ID(2) } });
  assert.deepEqual(feedTapTarget(items, ID(3), true), { screen: { name: 'home' }, announcementId: ID(3) });
});

test('E-7 a post that is not on the phone: "no longer available" only when the feed was just read, otherwise "connect"', () => {
  assert.deepEqual(feedTapTarget([], ID(9), true), { screen: { name: 'marketNews' }, message: 'gone' });
  assert.deepEqual(feedTapTarget([], ID(9), false), { screen: { name: 'marketNews' }, message: 'offline' });
  for (const l of ['en', 'bm', 'zh'] as const) assert.ok(feedStrings[l].tapGone && feedStrings[l].tapOffline, `words in ${l}`);
});

test('E-8 a tap before the app listens waits; later taps go straight to the listener; other notifications open nothing', () => {
  const seen: string[] = [];
  feedTapped({ notification: { data: { kind: 'feed', item_id: ID(4) } } });   // the app was closed: nobody listens yet
  const stop = onFeedTap(id => seen.push(id));
  assert.deepEqual(seen, [ID(4)], 'the waiting tap is handed over');
  feedTapped({ notification: { data: { kind: 'feed', item_id: ID(5) } } });
  feedTapped({ notification: { data: { kind: 'invite', invite_id: 'x' } } });
  feedTapped({ notification: { data: { kind: 'feed', item_id: 'not-a-uuid' } } });
  assert.deepEqual(seen, [ID(4), ID(5)]);
  stop();
  feedTapped({ notification: { data: { kind: 'feed', item_id: ID(6) } } });
  assert.deepEqual(seen, [ID(4), ID(5)], 'after stop, the tap waits for the next listener');
  const later: string[] = [];
  const stop2 = onFeedTap(id => later.push(id));
  assert.deepEqual(later, [ID(6)]);
  stop2();
});
