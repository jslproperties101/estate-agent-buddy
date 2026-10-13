// Phase 2: the data a later backup will carry (shape only; there is no restore in this phase).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { syncNow } from '../src/data/sync';
import { buildBackupManifest, checkManifest, MANIFEST_VERSION } from '../src/data/manifest';
import { loadSampleInto } from '../src/data/sample';
import type { Contact } from '../src/data/types';
import type { Listing } from '../src/listing/model';
import { FakeCloud, cfg, phone } from './support/fakeCloud';

test('M1 the manifest lists records, history, deleted records, cloud versions, pending state, conflicts and file links — and no secrets or sample data', async () => {
  const cloud = new FakeCloud();
  const a = await phone(cloud, 'o@x.c'); const b = await phone(cloud, 'o@x.c');
  loadSampleInto(a.store);
  const fid = await a.store.putFile(new Blob(['pic'], { type: 'image/jpeg' }));
  a.store.upsert('properties', { id: 'p1', created: 1, updated: 1, headline: 'H', ref: 'P1', refPrefix: 'P', refNo: 1, photos: [{ id: 'x', fileId: fid, name: 'x.jpg' }], documents: [] } as unknown as Listing);
  a.store.upsert('contacts', { id: 'c1', created: 1, updated: 1, name: 'A', roles: ['buyer'] } as Contact);
  a.store.upsert('contacts', { id: 'c2', created: 1, updated: 1, name: 'Gone', roles: ['buyer'] } as Contact);
  await syncNow(a.store, cfg, cloud.fetch); await syncNow(b.store, cfg, cloud.fetch);
  a.store.upsert('contacts', { ...a.store.getState().contacts.find(c => c.id === 'c1')!, phone: '1' }, false, 'merge');
  b.store.upsert('contacts', { ...b.store.getState().contacts.find(c => c.id === 'c1')!, phone: '2' });
  await syncNow(a.store, cfg, cloud.fetch); await syncNow(b.store, cfg, cloud.fetch);
  a.store.remove('contacts', 'c2');

  const m = await buildBackupManifest(b.store);
  assert.equal(m.version, MANIFEST_VERSION);
  assert.deepEqual(checkManifest(JSON.parse(JSON.stringify(m))), []);
  assert.equal(m.pending.conflicts.length, 1, 'open conflicts are carried');
  assert.ok(m.pending.dirty.includes('contacts:c1'));
  assert.ok(m.cloudVersions['contacts:c1'].rev >= 1);
  assert.ok((m.revisions['contacts:c1'] ?? []).length >= 1, 'history is carried');
  assert.equal(m.files.length, 1);
  assert.equal(m.files[0].recordId, 'p1');

  const am = await buildBackupManifest(a.store);
  assert.ok(am.deleted.some(d => d.key === 'contacts:c2'), 'deleted records needed for reconciliation are carried');
  assert.equal(am.files[0].cloudPath, `ws1/${am.files[0].sha256}`);
  assert.ok(Object.values(am.records).flat().every(r => !(r as { sample?: boolean }).sample), 'no sample data');
  const text = JSON.stringify(am) + JSON.stringify(m);
  assert.ok(!/accessToken|refreshToken|tok-u-|anon|service_role|apikey/i.test(text), 'no tokens or keys');
  assert.ok(checkManifest({ format: 'eab-backup-manifest', version: 99, records: {}, deleted: [], files: [], pending: { dirty: [] } }).some(p => p.includes('newer')));
});
