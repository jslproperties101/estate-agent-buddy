// MainForAdmin-C (Stage C logging): what the phone now notes. Codes only, never words, names or places.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryBackend } from '../src/data/backend';
import { Store } from '../src/data/store';
import { usage, UsageLogger, asUsagePlatform } from '../src/usage/logger';
import { FakeCloud, phone } from './support/fakeCloud';
import type { Contact } from '../src/data/types';

const DB_CODE = /^[a-z0-9][a-z0-9_.:-]{0,59}$/;

async function signedIn() {
  const a = await phone(new FakeCloud(), 'c@x.c');
  usage.attach(a.store, { appVersion: '1', platform: 'android' }); usage.clear();
  return a;
}

test('C1 command, marketing, language and push events are queued with their own kinds and safe codes', async () => {
  await signedIn();
  usage.command('command.assistant', true); usage.command('command.listing', false);
  usage.marketing('poster.created', true); usage.marketing('poster.shared', false);
  usage.language('ms'); usage.push('push.received'); usage.push('push.opened');
  const e = usage.pending();
  assert.deepEqual(e.map(x => x.kind), ['command', 'command', 'marketing', 'marketing', 'language', 'push', 'push']);
  assert.deepEqual(e.map(x => x.ok), [true, false, true, false, undefined, undefined, undefined]);
  for (const x of e) assert.match(x.name, DB_CODE);
  usage.clear();
});

test('C2 the language is noted once per language, and again after it changes; nothing without a sign-in', async () => {
  await signedIn();
  usage.language('en'); usage.language('en'); usage.language('zh'); usage.language('zh'); usage.language('en');
  assert.deepEqual(usage.pending().map(x => x.name), ['lang.en', 'lang.zh', 'lang.en']);
  usage.clear();
  const lone = new UsageLogger(); lone.attach(await Store.open(new MemoryBackend()), { appVersion: '1', platform: 'web' });
  lone.language('en');
  assert.equal(lone.pending().length, 0, 'nobody signed in: nothing recorded');
  assert.equal(lone.track({ kind: 'language', name: 'lang.en' }), false);
});

test('C3 only slow screens (800 ms or more) are noted, with the screen and the time', async () => {
  await signedIn();
  usage.slowScreen('home', 300); usage.slowScreen('listing-form', 799);
  assert.equal(usage.pending().length, 0);
  usage.slowScreen('listing-form', 1234.6); usage.slowScreen('home', 999_999);
  const e = usage.pending();
  assert.equal(e.length, 1);
  assert.deepEqual([e[0].kind, e[0].name, e[0].screen, e[0].value], ['metric', 'screen.slow_ms', 'listing-form', 1235]);
  usage.clear();
});

test('C4 edits and deletes by the person are noted by collection; sample data, sync changes and a broken listener are not a problem', async () => {
  const { store } = await signedIn();
  const seen: string[] = [];
  store.onCreate = c => seen.push(`create:${c}`); store.onEdit = c => seen.push(`edit:${c}`); store.onDelete = c => seen.push(`delete:${c}`);
  const c: Contact = { id: 'c1', created: 1, updated: 1, name: 'Ahmad', roles: ['buyer'] };
  store.upsert('contacts', c);
  store.upsert('contacts', { ...c, name: 'Ahmad B' });
  store.upsert('contacts', { ...c, id: 'cs', sample: true });
  store.upsert('contacts', { ...c, id: 'cs', sample: true, name: 'again' });
  store.applyRemote('contacts', 'c3', { id: 'c3', created: 1, updated: 1, name: 'From cloud', roles: ['buyer'] });
  store.remove('contacts', 'c1');
  store.remove('contacts', 'c3', true);
  assert.deepEqual(seen, ['create:contacts', 'edit:contacts', 'delete:contacts']);
  store.onEdit = () => { throw new Error('broken'); }; store.onDelete = () => { throw new Error('broken'); };
  store.upsert('contacts', { ...c, id: 'c9' });
  assert.doesNotThrow(() => store.upsert('contacts', { ...c, id: 'c9', name: 'x' }));
  assert.doesNotThrow(() => store.remove('contacts', 'c9'));
});

test('C5 the platform words match the database (android, ios, web, tablet, desktop); anything else is web', () => {
  for (const p of ['android', 'ios', 'web', 'tablet', 'desktop']) assert.equal(asUsagePlatform(p), p);
  assert.equal(asUsagePlatform('toaster'), 'web');
  assert.equal(asUsagePlatform(''), 'web');
});

test('C6 a lost sync is noted with its reason code (never the message)', async () => {
  const { runSync } = await import('../src/data/syncRunner');
  const { cfg } = await import('./support/fakeCloud');
  const cloud = new FakeCloud();
  const a = await phone(cloud, 'cs@x.c');
  usage.attach(a.store, { appVersion: '1', platform: 'android' }); usage.clear();
  a.store.upsert('contacts', { id: 'c1', created: 1, updated: 1, name: 'Ahmad', roles: ['buyer'] });
  cloud.failNext('/rest/v1/', 1);
  const r = await runSync(a.store, cfg, cloud.fetch);
  assert.equal(r.ok, false);
  const names = usage.pending().filter(e => e.kind === 'sync').map(e => e.name);
  assert.ok(names.includes('sync.run') && names.some(n => /^sync\.fail\.[a-z-]+$/.test(n)), names.join(','));
  usage.clear();
});
