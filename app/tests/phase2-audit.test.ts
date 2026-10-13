// Phase 2 verification audit: a phone that was last synced by Phase 1 (records, maybe waiting edits, NO stored cloud
// version) meets the Phase 2 sync. Stand-in cloud only; nothing here touches a live Supabase project.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/data/store';
import { syncNow } from '../src/data/sync';
import type { Contact } from '../src/data/types';
import { FakeCloud, cfg, phone } from './support/fakeCloud';

const contact = (id: string, name: string, extra: Partial<Contact> = {}): Contact => ({ id, created: 1, updated: 1, name, roles: ['buyer'], ...extra });
const get = (s: Store, id: string) => s.getState().contacts.find(c => c.id === id);
const sync = (s: Store, c: FakeCloud) => syncNow(s, cfg, c.fetch);

/** A Phase 1 phone = records on the phone, nothing remembered about cloud versions. */
async function phase1Phone(cloud: FakeCloud, email: string) {
  const p = await phone(cloud, email);
  return p;
}

test('A1 Phase 1 phone with records already in the cloud and nothing waiting: nothing changes, no conflict, no loss', async () => {
  const cloud = new FakeCloud();
  const other = await phone(cloud, 'o@x.c');
  other.store.upsert('contacts', contact('c1', 'Ahmad', { phone: '1' }));
  await sync(other.store, cloud);
  const p1 = await phase1Phone(cloud, 'o@x.c');
  p1.store.applyRemote('contacts', 'c1', { ...contact('c1', 'Ahmad', { phone: '1' }) });   // as Phase 1 left it: present, clean, no base
  p1.store.setSingleton('meta', { dirty: [] });
  assert.equal(p1.store.getBase('contacts:c1'), undefined);
  await sync(p1.store, cloud);
  assert.equal(get(p1.store, 'c1')?.phone, '1');
  assert.deepEqual(p1.store.getState().meta.conflicts ?? [], []);
  assert.ok(p1.store.getBase('contacts:c1'), 'it now remembers the cloud version');
});

test('A2 Phase 1 phone with a waiting edit to a record that ALSO changed in the cloud: no silent loss, nothing sent, both recoverable', async () => {
  const cloud = new FakeCloud();
  const other = await phone(cloud, 'o@x.c');
  other.store.upsert('contacts', contact('c1', 'Ahmad', { phone: '1' }));
  await sync(other.store, cloud);
  other.store.upsert('contacts', { ...get(other.store, 'c1')!, phone: 'CLOUD' });
  await sync(other.store, cloud);
  const p1 = await phase1Phone(cloud, 'o@x.c');
  p1.store.applyRemote('contacts', 'c1', contact('c1', 'Ahmad', { phone: '1' }));
  p1.store.upsert('contacts', { ...get(p1.store, 'c1')!, phone: 'PHONE' });                 // waiting edit, no base
  const r = await sync(p1.store, cloud);
  assert.equal(get(p1.store, 'c1')?.phone, 'PHONE', 'the phone keeps its own value');
  assert.equal(cloud.rows.get('ws1|contacts|c1')!.data!.phone, 'CLOUD', 'the cloud was not overwritten');
  assert.ok((p1.store.getState().meta.conflicts ?? []).length >= 1 || r.conflicts >= 1);
  const revs = await p1.store.revisions('contacts:c1');
  assert.ok(revs.some(v => (v.data as Contact).phone === 'CLOUD'), 'cloud version is in History');
});

test('A3 Phase 1 "false clean" edit (changed here, never sent, not marked waiting): replaced by the cloud copy but kept in History', async () => {
  const cloud = new FakeCloud();
  const other = await phone(cloud, 'o@x.c');
  other.store.upsert('contacts', contact('c1', 'Ahmad', { phone: '1' }));
  await sync(other.store, cloud);
  const p1 = await phase1Phone(cloud, 'o@x.c');
  p1.store.applyRemote('contacts', 'c1', contact('c1', 'Ahmad', { phone: 'LOST-IN-PHASE-1' }));   // differs, but not dirty
  p1.store.setSingleton('meta', { dirty: [] });
  await sync(p1.store, cloud);
  assert.equal(get(p1.store, 'c1')?.phone, '1');
  const revs = await p1.store.revisions('contacts:c1');
  assert.ok(revs.some(v => (v.data as Contact).phone === 'LOST-IN-PHASE-1'), 'the unsent version is recoverable');
});

test('A4 Phase 1 phone with a waiting NEW record and a waiting delete: both are sent exactly once', async () => {
  const cloud = new FakeCloud();
  const other = await phone(cloud, 'o@x.c');
  other.store.upsert('contacts', contact('gone', 'Delete me'));
  await sync(other.store, cloud);
  const p1 = await phase1Phone(cloud, 'o@x.c');
  await sync(p1.store, cloud);                          // learns "gone"
  p1.store.upsert('contacts', contact('fresh', 'New'));
  p1.store.remove('contacts', 'gone');
  await sync(p1.store, cloud); await sync(p1.store, cloud);
  assert.equal(cloud.rows.get('ws1|contacts|fresh')!.rev, 1);
  assert.equal(cloud.rows.get('ws1|contacts|gone')!.deleted, true);
});

