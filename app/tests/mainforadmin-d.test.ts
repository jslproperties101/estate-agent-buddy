// MainForAdmin-D (Stage D): the phone's side of the pushed feed, invitation codes, force update and maintenance.
// A stand-in answers like the database functions; nothing here uses a real Supabase project.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryBackend } from '../src/data/backend';
import { Store } from '../src/data/store';
import {
  versionLess, updateVerdict, maintenanceActive, maintenanceText, safeUrl, unreadNews, openBanners, openPopups, myFeed,
  refreshFeed, markFeed, redeemCode, refreshPublicSettings, MAINTENANCE_TRUST_MS, type FeedItem, type PublicSettings,
} from '../src/feed/feed';
import { feedStrings } from '../src/feed/strings';

const cfg = { supabaseUrl: 'https://fd-test.supabase.co', supabaseAnonKey: 'anon' };

async function signedIn(user = 'u1') {
  const store = await Store.open(new MemoryBackend());
  store.setSingleton('settings', { supabaseUrl: cfg.supabaseUrl, supabaseAnonKey: cfg.supabaseAnonKey });
  store.setSingleton('meta', { syncSession: { accessToken: 'tok', refreshToken: 'r', expiresAt: Date.now() + 3600_000, email: `${user}@x.c`, userId: user } });
  return store;
}

/** A fake database: answers eab_my_feed / eab_feed_mark / eab_redeem_code / eab_public_settings and records calls. */
function fakeDb(items: FeedItem[], opts: { offline?: boolean; missing?: boolean; redeem?: unknown; settings?: unknown } = {}) {
  const calls: { fn: string; body: Record<string, unknown>; auth?: string | null }[] = [];
  const fetchFn = (async (url: string, init: RequestInit = {}) => {
    if (opts.offline) throw new TypeError('Failed to fetch');
    const fn = String(url).split('/rpc/')[1];
    const body = JSON.parse(String(init.body || '{}'));
    calls.push({ fn, body, auth: (init.headers as Record<string, string>)?.authorization ?? null });
    if (opts.missing) return new Response('{"code":"PGRST202","message":"Could not find the function"}', { status: 404 });
    if (fn === 'eab_my_feed') return Response.json(items);
    if (fn === 'eab_feed_mark') return Response.json(true);
    if (fn === 'eab_redeem_code') return Response.json(opts.redeem ?? { ok: true, added: 2, visible: 2 });
    if (fn === 'eab_public_settings') return Response.json(opts.settings ?? { min_version: '2.0.0', min_version_mode: 'soft' });
    return new Response('{}', { status: 500 });
  }) as typeof fetch;
  return { calls, fetchFn };
}

const news = (id: string, extra: Partial<FeedItem> = {}): FeedItem => ({ id, kind: 'news', title: `News ${id}`, ...extra });

test('D-1 versions: 2.10.0 is newer than 2.9.3; soft / hard / ok decided from the minimum version', () => {
  assert.equal(versionLess('2.9.3', '2.10.0'), true);
  assert.equal(versionLess('2.10.0', '2.9.3'), false);
  assert.equal(versionLess('2.2', '2.2.0'), false, 'missing parts count as 0');
  assert.equal(versionLess('2.2.0', '2.2.0'), false);
  const s = (mode: 'soft' | 'hard', min?: string): PublicSettings => ({ min_version: min, min_version_mode: mode, fetchedAt: Date.now() });
  assert.equal(updateVerdict(s('hard', '2.5.0'), '2.2.0'), 'hard');
  assert.equal(updateVerdict(s('soft', '2.5.0'), '2.2.0'), 'soft');
  assert.equal(updateVerdict(s('hard', '2.5.0'), '2.5.1'), 'ok');
  assert.equal(updateVerdict(s('hard'), '0.0.1'), 'ok', 'no minimum set');
  assert.equal(updateVerdict(undefined, '1.0.0'), 'ok', 'never heard from the company: the app works');
});

test('D-2 maintenance is trusted for 12 hours after it was last heard; the message falls back to English', () => {
  const now = 1_000_000_000_000;
  const s: PublicSettings = { maintenance_on: true, maintenance_message_en: 'Back soon', maintenance_message_zh: '维护中', fetchedAt: now };
  assert.equal(maintenanceActive(s, now + 60_000), true);
  assert.equal(maintenanceActive(s, now + MAINTENANCE_TRUST_MS + 1), false, 'a phone that missed "off" is not locked for good');
  assert.equal(maintenanceActive({ ...s, maintenance_on: false }, now), false);
  assert.equal(maintenanceText(s, 'zh'), '维护中');
  assert.equal(maintenanceText(s, 'bm'), 'Back soon');
});

test('D-3 only https links and pictures are used', () => {
  assert.equal(safeUrl('https://a.b/c.pdf'), 'https://a.b/c.pdf');
  for (const bad of ['http://a.b', 'javascript:alert(1)', 'data:image/png;base64,xx', '', null, undefined, 'https://a b']) assert.equal(safeUrl(bad as string), undefined, String(bad));
});

test('D-4 the feed is kept per account; unread news, open banners and pop-ups are counted from it', async () => {
  const store = await signedIn('u1');
  const items: FeedItem[] = [news('n1'), news('n2', { opened_at: '2026-10-21T00:00:00Z' }), news('n3'),
    { id: 'a1', kind: 'announcement', title: 'Banner', display: 'banner' }, { id: 'a2', kind: 'announcement', title: 'Pop', display: 'popup' },
    { id: 'a3', kind: 'announcement', title: 'Closed', display: 'banner', dismissed_at: '2026-10-21T00:00:00Z' },
    { id: 'p1', kind: 'project', title: 'Taman A', from_code: true }];
  const db = fakeDb(items);
  assert.equal(await refreshFeed(store, cfg, 'bm', db.fetchFn), true);
  assert.deepEqual(db.calls[0], { fn: 'eab_my_feed', body: { p_kind: null, p_lang: 'bm' }, auth: 'Bearer tok' });
  const mine = myFeed(store);
  assert.equal(unreadNews(mine), 2);
  assert.deepEqual(openBanners(mine).map(i => i.id), ['a1']);
  assert.deepEqual(openPopups(mine).map(i => i.id), ['a2']);
  // another account on this phone never sees it
  store.setSingleton('meta', { syncSession: { ...store.getState().meta.syncSession!, userId: 'u2' } });
  assert.deepEqual(myFeed(store), []);
});

test('D-5 opening a post lowers the badge at once and is sent; offline it waits and is sent at the next refresh', async () => {
  const store = await signedIn();
  const online = fakeDb([news('n1'), news('n2')]);
  await refreshFeed(store, cfg, 'en', online.fetchFn);
  const off = fakeDb([], { offline: true });
  await markFeed(store, cfg, 'n1', 'opened', off.fetchFn);
  assert.equal(unreadNews(myFeed(store)), 1, 'badge goes down even offline');
  assert.equal(store.getState().meta.feedMarks?.length, 1, 'kept to send later');
  await markFeed(store, cfg, 'n1', 'opened', off.fetchFn);
  assert.equal(store.getState().meta.feedMarks?.length, 1, 'opening again adds nothing');
  // back online: the database still says unread (it never heard) — the waiting mark is sent first and still shows
  const back = fakeDb([news('n1'), news('n2')]);
  await refreshFeed(store, cfg, 'en', back.fetchFn);
  assert.deepEqual(back.calls.map(c => c.fn), ['eab_feed_mark', 'eab_my_feed']);
  assert.deepEqual(back.calls[0].body, { p_item: 'n1', p_what: 'opened' });
  assert.equal(store.getState().meta.feedMarks?.length, 0);
});

test('D-6 a pop-up acknowledged and a banner closed stay so; an older database means an empty feed, not an error', async () => {
  const store = await signedIn();
  const db = fakeDb([{ id: 'a1', kind: 'announcement', title: 'B', display: 'banner' }, { id: 'a2', kind: 'announcement', title: 'P', display: 'popup' }]);
  await refreshFeed(store, cfg, 'en', db.fetchFn);
  await markFeed(store, cfg, 'a2', 'acknowledged', db.fetchFn);
  await markFeed(store, cfg, 'a1', 'dismissed', db.fetchFn);
  assert.deepEqual([openBanners(myFeed(store)).length, openPopups(myFeed(store)).length], [0, 0]);
  assert.deepEqual(db.calls.filter(c => c.fn === 'eab_feed_mark').map(c => c.body.p_what), ['acknowledged', 'dismissed']);
  const old = fakeDb([], { missing: true });
  assert.equal(await refreshFeed(store, cfg, 'en', old.fetchFn), false);
  assert.deepEqual(myFeed(store), []);
});

test('D-7 invitation codes: cleaned before sending; every answer has words in EN / BM / ZH', async () => {
  const store = await signedIn();
  const db = fakeDb([{ id: 'p1', kind: 'project', title: 'Taman A', from_code: true }]);
  const ok = await redeemCode(store, cfg, ' k7px-2mq9 rt ', 'en', db.fetchFn);
  assert.deepEqual(ok, { ok: true, added: 2, visible: 2 });
  assert.deepEqual(db.calls[0].body, { p_code: 'K7PX2MQ9RT' });
  assert.ok(db.calls.some(c => c.fn === 'eab_my_feed'), 'the feed is refreshed so the projects appear');
  assert.deepEqual(await redeemCode(store, cfg, 'ab', 'en', db.fetchFn), { ok: false, reason: 'empty' });
  for (const reason of ['not_found', 'expired', 'used_up', 'too_many']) {
    const r = await redeemCode(store, cfg, 'ABCDEFGH', 'en', fakeDb([], { redeem: { ok: false, reason } }).fetchFn);
    assert.deepEqual(r, { ok: false, reason });
  }
  assert.deepEqual(await redeemCode(store, cfg, 'ABCDEFGH', 'en', fakeDb([], { offline: true }).fetchFn), { ok: false, reason: 'offline' });
  assert.deepEqual(await redeemCode(store, cfg, 'ABCDEFGH', 'en', fakeDb([], { missing: true }).fetchFn), { ok: false, reason: 'unavailable' });
  for (const lang of ['en', 'bm', 'zh'] as const) {
    for (const k of ['not_found', 'expired', 'used_up', 'too_many', 'empty', 'offline', 'unavailable', 'other']) assert.ok(feedStrings[lang].codeErr[k], `${lang} ${k}`);
    assert.ok(feedStrings[lang].marketTitle && feedStrings[lang].noNews && feedStrings[lang].maintTitle && feedStrings[lang].updateHard);
  }
});

test('D-8 the company-wide switches are read with the public key only (works signed out) and kept', async () => {
  const store = await Store.open(new MemoryBackend());
  const db = fakeDb([], { settings: { min_version: '9.0.0', min_version_mode: 'hard', maintenance_on: false } });
  assert.equal(await refreshPublicSettings(store, cfg, db.fetchFn), true);
  assert.equal(db.calls[0].fn, 'eab_public_settings');
  assert.equal(db.calls[0].auth, null, 'no sign-in token is needed or sent');
  const s = store.getState().meta.publicSettings!;
  assert.equal(updateVerdict(s, '2.2.0'), 'hard');
  assert.ok(Date.now() - s.fetchedAt < 5000);
  assert.equal(await refreshPublicSettings(store, cfg, fakeDb([], { offline: true }).fetchFn), false);
  assert.equal(store.getState().meta.publicSettings?.min_version, '9.0.0', 'offline: the last answer is kept');
});
