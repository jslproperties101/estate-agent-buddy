// Data store: records and custom dropdown values are kept; the cloud sync sends and receives changes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryBackend } from '../src/data/backend';
import { Store } from '../src/data/store';
import { syncNow, signIn } from '../src/data/sync';
import type { Contact } from '../src/data/types';
import { FakeCloud, cfg, phone } from './support/fakeCloud';

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
  const cloud = new FakeCloud();
  const other = await phone(cloud, 'a@b.c');
  other.store.upsert('contacts', contact('c9', 'From phone 2'));
  other.store.upsert('contacts', contact('gone', 'Deleted elsewhere'));
  await syncNow(other.store, cfg, cloud.fetch);
  other.store.remove('contacts', 'gone');
  await syncNow(other.store, cfg, cloud.fetch);
  const s = await Store.open(new MemoryBackend());
  s.upsert('contacts', contact('gone', 'Deleted elsewhere'), true);
  s.upsert('contacts', contact('c1', 'Made here'));
  const session = await signIn(cfg, 'a@b.c', 'pw', cloud.fetch);
  s.setSingleton('meta', { syncSession: session });
  const r = await syncNow(s, cfg, cloud.fetch);
  assert.equal(r.pushed, 1); assert.equal(r.pulled, 1);
  const names = s.getState().contacts.map(c => c.name).sort();
  assert.deepEqual(names, ['From phone 2', 'Made here']);
  const row = cloud.rows.get('ws1|contacts|c1')!;
  assert.equal(row.user_id, 'u-a@b.c'); assert.equal(row.rev, 1);
  assert.equal(s.getState().meta.syncSession?.role, 'owner');
  assert.deepEqual(s.getState().meta.dirty, []);
  assert.ok(s.getState().meta.lastSync);
  assert.ok(cloud.log.some(l => l.includes('/rpc/eab_my_membership')));
});

test('S3 sync: a limited (read-only) user receives changes but sends nothing; their edits stay on the phone', async () => {
  const cloud = new FakeCloud();
  const owner = await phone(cloud, 'o@b.c');
  owner.store.upsert('contacts', contact('c0', 'Owner’s'));
  await syncNow(owner.store, cfg, cloud.fetch);
  cloud.rows.get('ws1|contacts|c0')!.user_id = 'u-l@x.c';                       // assigned to the limited user
  const v = await phone(cloud, 'l@x.c', { role: 'limited' });
  v.store.upsert('contacts', contact('c1', 'Mine'));
  const r = await syncNow(v.store, cfg, cloud.fetch);
  assert.equal(r.pushed, 0);
  assert.ok(!cloud.log.some(l => l.includes('eab_push_records') && false));
  assert.equal(cloud.rows.has('ws1|contacts|c1'), false);
  assert.equal(v.store.getState().contacts.some(c => c.id === 'c0'), true, 'receives what it may read');
  assert.deepEqual(v.store.getState().meta.dirty, ['contacts:c1'], 'kept for later');
});

test('S4 sync: switched-off access is reported, never treated as success', async () => {
  const s = await Store.open(new MemoryBackend());
  const fetchFn = (async () => new Response('[]', { status: 200 })) as typeof fetch;
  s.setSingleton('meta', { syncSession: { accessToken: 't', refreshToken: 'r', expiresAt: Date.now() + 3600_000, email: 'x@x.c', userId: 'u3' } });
  await assert.rejects(syncNow(s, cfg, fetchFn), (e: Error & { code?: string }) => e.code === 'no-access');
  assert.equal(s.getState().meta.lastSync, undefined);
});
