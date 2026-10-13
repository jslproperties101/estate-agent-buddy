// Phase 2: recoverable history, recently deleted, and the safe undo of the Phase 1 Inactive → Dropped conversion.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryBackend } from '../src/data/backend';
import { MAX_REVISIONS, Store } from '../src/data/store';
import { convertInactive, inactiveContacts, undoInactiveConversion } from '../src/data/leadReview';
import { syncNow } from '../src/data/sync';
import type { Contact, Task } from '../src/data/types';
import { FakeCloud, cfg, phone } from './support/fakeCloud';

const contact = (id: string, name: string, extra: Partial<Contact> = {}): Contact => ({ id, created: 1, updated: 1, name, roles: ['buyer'], ...extra });
const get = (s: Store, id: string) => s.getState().contacts.find(c => c.id === id);

test('H1 the version being replaced is kept first, with a time and a source; quick edits count as one step', async () => {
  const s = await Store.open(new MemoryBackend());
  s.upsert('contacts', contact('c1', 'Ahmad'));
  await s.flush();
  assert.deepEqual(await s.revisions('contacts:c1'), [], 'a new record has nothing earlier');
  s.upsert('contacts', { ...get(s, 'c1')!, name: 'Ahmad 2' });
  s.upsert('contacts', { ...get(s, 'c1')!, name: 'Ahmad 3' });    // same editing burst
  const h = await s.revisions('contacts:c1');
  assert.equal(h.length, 1, 'one step for the burst');
  assert.equal((h[0].data as Contact).name, 'Ahmad');
  assert.equal(h[0].source, 'edit');
  assert.ok(Math.abs(h[0].at - Date.now()) < 5000);
  // a change of a different kind is always its own step
  s.upsert('contacts', { ...get(s, 'c1')!, name: 'Ahmad 4' }, false, 'merge');
  assert.equal((await s.revisions('contacts:c1')).length, 2);
});

test('H2 history stays small: at most 25 earlier versions per record', async () => {
  const s = await Store.open(new MemoryBackend());
  s.upsert('contacts', contact('c1', 'v0'));
  for (let i = 1; i <= 80; i++) s.upsert('contacts', { ...get(s, 'c1')!, name: `v${i}` }, false, 'merge');
  const h = await s.revisions('contacts:c1');
  assert.equal(h.length, MAX_REVISIONS);
  assert.equal((h[0].data as Contact).name, 'v79', 'newest first');
});

test('H3 restoring an earlier version is itself undoable and touches nothing else', async () => {
  const s = await Store.open(new MemoryBackend());
  s.upsert('contacts', contact('c1', 'Original', { phone: '1' }));
  s.upsert('contacts', contact('c2', 'Other'));
  s.upsert('contacts', { ...get(s, 'c1')!, name: 'Edited', phone: '2' }, false, 'merge');
  s.upsert('contacts', { ...get(s, 'c2')!, notes: 'unrelated change made later' });
  const at = (await s.revisions('contacts:c1')).find(r => (r.data as Contact).name === 'Original')!.at;
  assert.equal(await s.restoreRevision('contacts', 'c1', at), true);
  assert.equal(get(s, 'c1')?.name, 'Original');
  assert.equal(get(s, 'c2')?.notes, 'unrelated change made later', 'other records are not rolled back');
  assert.ok((await s.revisions('contacts:c1')).some(r => (r.data as Contact).name === 'Edited' && r.source === 'restore'), 'the version it replaced is kept');
  assert.equal(await s.restoreRevision('contacts', 'c1', 123), false, 'an unknown version restores nothing');
});

test('H4 a deleted record can be brought back from Recently deleted, including after the deletion reached the cloud', async () => {
  const cloud = new FakeCloud();
  const a = await phone(cloud, 'o@x.c'); const b = await phone(cloud, 'o@x.c');
  a.store.upsert('contacts', contact('c1', 'Ahmad', { phone: '012' }));
  await syncNow(a.store, cfg, cloud.fetch); await syncNow(b.store, cfg, cloud.fetch);
  a.store.remove('contacts', 'c1');
  await syncNow(a.store, cfg, cloud.fetch); await syncNow(b.store, cfg, cloud.fetch);
  assert.equal(get(b.store, 'c1'), undefined);
  const gone = await a.store.recentlyDeleted();
  assert.equal(gone.length, 1);
  assert.equal((gone[0].data as Contact).phone, '012');
  const rev = (await a.store.revisions('contacts:c1'))[0];
  assert.equal(rev.source, 'delete');
  assert.equal(await a.store.restoreRevision('contacts', 'c1', rev.at), true);
  assert.equal((await a.store.recentlyDeleted()).length, 0, 'no longer listed once restored');
  await syncNow(a.store, cfg, cloud.fetch); await syncNow(b.store, cfg, cloud.fetch);
  assert.equal(get(b.store, 'c1')?.phone, '012', 'the other phone gets it back');
  assert.equal(cloud.rows.get('ws1|contacts|c1')!.deleted, false);
});

test('H5 deleted records are forgotten after 30 days, not before', async () => {
  const s = await Store.open(new MemoryBackend());
  s.upsert('contacts', contact('c1', 'Ahmad'));
  s.remove('contacts', 'c1');
  await s.flush();
  s.setSingleton('meta', { tombstones: [], dirty: [] });
  const day = 24 * 3600_000;
  await s.purgeOld(Date.now() + 29 * day);
  assert.equal((await s.recentlyDeleted(Date.now() + 29 * day)).length, 1);
  await s.purgeOld(Date.now() + 31 * day);
  assert.equal((await s.recentlyDeleted(Date.now() + 31 * day)).length, 0);
  assert.deepEqual(await s.revisions('contacts:c1'), []);
});

test('H6 history never contains sign-in details or anything but the record’s own fields', async () => {
  const cloud = new FakeCloud();
  const a = await phone(cloud, 'o@x.c');
  a.store.upsert('contacts', contact('c1', 'Ahmad'));
  await syncNow(a.store, cfg, cloud.fetch);
  a.store.upsert('contacts', { ...get(a.store, 'c1')!, notes: 'x' }, false, 'merge');
  await a.store.flush();
  const all = JSON.stringify(await a.backend.listLocal('rev:')) + JSON.stringify(await a.backend.listLocal('base:')) + JSON.stringify(await a.backend.listLocal('draft:'));
  assert.ok(!/accessToken|refreshToken|tok-u-|password/i.test(all));
});

// ---------- undo of the Phase 1 status conversion ----------
test('U1 Phase 1 conversion check: every Inactive buyer becomes Dropped, the original value stays on the record, nothing else changes', async () => {
  const s = await Store.open(new MemoryBackend());
  s.upsert('contacts', contact('c1', 'A', { leadStatus: 'inactive' as never, phone: '1', notes: 'keep me' }), true);
  s.upsert('contacts', contact('c2', 'B', { leadStatus: 'hot' }), true);
  assert.equal(convertInactive(s), 1);
  const c1 = get(s, 'c1')!;
  assert.equal(c1.leadStatus, 'dropped'); assert.equal(c1.previousLeadStatus, 'inactive');
  assert.equal(c1.phone, '1'); assert.equal(c1.notes, 'keep me');
  assert.equal(get(s, 'c2')?.leadStatus, 'hot');
  assert.deepEqual(s.getState().meta.leadReview?.ids, ['c1']);
  assert.equal(convertInactive(s), 0, 'nothing more to convert');
});

test('U2 undo puts back only the converted buyers, keeps every later edit, and skips buyers whose status was changed on purpose', async () => {
  const s = await Store.open(new MemoryBackend());
  for (const id of ['c1', 'c2', 'c3']) s.upsert('contacts', contact(id, id.toUpperCase(), { leadStatus: 'inactive' as never }), true);
  s.upsert('contacts', contact('c4', 'Never inactive', { leadStatus: 'warm' }), true);
  s.upsert('tasks', { id: 't1', created: 1, updated: 1, title: 'Call' } as Task, true);
  convertInactive(s);
  // later, unrelated work
  s.upsert('contacts', { ...get(s, 'c1')!, phone: '012-NEW' });                       // edit to a converted buyer
  s.upsert('contacts', { ...get(s, 'c2')!, leadStatus: 'hot' });                      // chosen on purpose
  s.upsert('contacts', { ...get(s, 'c4')!, notes: 'edited after' });
  s.upsert('tasks', { ...s.getState().tasks[0], title: 'Call back' });
  const r = undoInactiveConversion(s);
  assert.deepEqual(r.restored.sort(), ['c1', 'c3']);
  assert.deepEqual(r.skipped, [{ id: 'c2', reason: 'changed' }]);
  assert.equal((get(s, 'c1')!.leadStatus as string), 'inactive');
  assert.equal(get(s, 'c1')!.phone, '012-NEW', 'the later edit is not rolled back');
  assert.equal(get(s, 'c1')!.previousLeadStatus, undefined);
  assert.equal(get(s, 'c2')!.leadStatus, 'hot', 'a status chosen on purpose is left alone');
  assert.equal(get(s, 'c4')!.notes, 'edited after');
  assert.equal(s.getState().tasks[0].title, 'Call back');
  assert.deepEqual(s.getState().meta.leadReview?.undone?.sort(), ['c1', 'c3']);
  assert.equal(inactiveContacts(s.getState().contacts).length, 0, 'they are not converted again');
  assert.equal(convertInactive(s), 0);
});

test('U3 an undone buyer is not converted again by another phone, and the undo itself is recoverable from history', async () => {
  const cloud = new FakeCloud();
  const a = await phone(cloud, 'o@x.c'); const b = await phone(cloud, 'o@x.c');
  a.store.upsert('contacts', contact('c1', 'A', { leadStatus: 'inactive' as never }), true);
  a.store.upsert('contacts', { ...get(a.store, 'c1')! });          // make it a pending change so it syncs
  convertInactive(a.store);
  await syncNow(a.store, cfg, cloud.fetch); await syncNow(b.store, cfg, cloud.fetch);
  assert.equal(get(b.store, 'c1')?.leadStatus, 'dropped');
  undoInactiveConversion(a.store);
  await syncNow(a.store, cfg, cloud.fetch); await syncNow(b.store, cfg, cloud.fetch);
  assert.equal((get(b.store, 'c1')!.leadStatus as string), 'inactive');
  assert.equal(convertInactive(b.store), 0, 'the undo is respected on the other phone');
  const h = await a.store.revisions('contacts:c1');
  assert.ok(h.some(x => x.source === 'undo' || (x.data as Contact).leadStatus === 'dropped'), 'the Dropped version is still in the history');
});
