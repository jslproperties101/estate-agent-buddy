// Data store: records and custom dropdown values are kept; the cloud sync sends and receives changes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryBackend } from '../src/data/backend';
import { Store } from '../src/data/store';
import { syncNow, signIn } from '../src/data/sync';
import type { Contact } from '../src/data/types';

const contact = (id: string, name: string): Contact => ({ id, created: 1, updated: 1, name, roles: ['buyer'] });

test('S1 records survive reopening the store (same backend)', async () => {
  const b = new MemoryBackend();
  const s = await Store.open(b);
  s.upsert('contacts', contact('c1', 'Ahmad'));
  s.setSingleton('settings', { lang: 'zh', layout: 'grid' });
  s.addOption('township', 'Taman Sri Pajam');
  s.addOption('township', 'taman sri pajam');
  await s.flush();
  const again = await Store.open(b);
  assert.equal(again.getState().contacts[0].name, 'Ahmad');
  assert.equal(again.getState().settings.lang, 'zh');
  assert.equal(again.getState().options.township.length, 1, 'the same value is not saved twice');
  again.removeOption('township', 'Taman Sri Pajam');
  again.remove('contacts', 'c1');
  await again.flush();
  const third = await Store.open(b);
  assert.equal(third.getState().contacts.length, 0);
  assert.equal(third.getState().options.township.length, 0);
  assert.deepEqual(third.getState().meta.tombstones, ['contacts:c1']);
});

test('S2 sync: sign in, push local changes, pull newer cloud records, apply deletions', async () => {
  const s = await Store.open(new MemoryBackend());
  const cfg = { supabaseUrl: 'https://x.supabase.co', supabaseAnonKey: 'anon' };
  const calls: { url: string; init: RequestInit }[] = [];
  const cloud = [
    { collection: 'contacts', id: 'c9', data: { ...contact('c9', 'From phone 2'), updated: 50 }, deleted: false, updated: 50 },
    { collection: 'contacts', id: 'gone', data: null, deleted: true, updated: 60 },
  ];
  const fetchFn = (async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    if (url.includes('/auth/v1/token')) return new Response(JSON.stringify({ access_token: 'tok', refresh_token: 'r', expires_in: 3600, user: { id: 'u1', email: 'a@b.c' } }), { status: 200 });
    if (init.method === 'POST') return new Response('', { status: 201 });
    return new Response(JSON.stringify(cloud), { status: 200 });
  }) as typeof fetch;
  s.upsert('contacts', contact('gone', 'Deleted elsewhere'), true);
  s.upsert('contacts', contact('c1', 'Made here'));
  const session = await signIn(cfg, 'a@b.c', 'pw', fetchFn);
  s.setSingleton('meta', { syncSession: session });
  const r = await syncNow(s, cfg, fetchFn);
  assert.deepEqual(r, { pushed: 1, pulled: 1, removed: 1 });
  const names = s.getState().contacts.map(c => c.name).sort();
  assert.deepEqual(names, ['From phone 2', 'Made here']);
  const push = calls.find(c => c.init.method === 'POST' && c.url.includes('/rest/v1/'))!;
  const body = JSON.parse(String(push.init.body));
  assert.equal(body[0].id, 'c1'); assert.equal(body[0].user_id, 'u1');
  assert.equal((push.init.headers as Record<string, string>).authorization, 'Bearer tok');
  assert.deepEqual(s.getState().meta.dirty, []);
  assert.ok(s.getState().meta.lastSync);
});
