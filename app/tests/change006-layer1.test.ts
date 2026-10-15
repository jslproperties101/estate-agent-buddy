// Change 006 Layer 1 (record history and recovery) together with Change 010's audit trail, on the integrated build.
// Two separate systems, deliberately not merged:
//   - record history (revisions, Recently deleted, cloud versions): what a record WAS, so a whole version can be restored;
//   - audit history (Change 010): WHO changed WHAT and WHEN, insert-only, exact before/after values.
// These tests prove saving stays local-first (a slow or failing audit upload never blocks or undoes a saved record),
// and that create / edit / archive / delete / restore / conflict / offline-then-reconnect keep both systems intact.
// Stand-in cloud (tests/support/fakeTeamCloud.ts); NOT a live Supabase project and NOT a phone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/data/store';
import { syncNow } from '../src/data/sync';
import type { Task } from '../src/data/types';
import type { Listing } from '../src/listing/model';
import { FakeTeamCloud, cfg, agentPhone } from './support/fakeTeamCloud';

const prop = (id: string, extra: Partial<Listing> = {}): Listing => ({ id, created: 1, updated: 1, photos: [], street: 'Jalan Mawar', askingPrice: 500000, ...extra } as unknown as Listing);
const task = (id: string, title: string): Task => ({ id, created: 1, updated: 1, title, priority: 'low', done: false, kind: 'task', reminders: [] } as Task);
const cloudRow = (cloud: FakeTeamCloud, ws: string, c: string, id: string) => cloud.rows.get(`${ws}|${c}|${id}`);

test('L1-1 offline: a save is stored on the phone at once, with its history and audit entry; reconnecting sends both', async () => {
  const cloud = new FakeTeamCloud();
  const a = await agentPhone(cloud, 'a@x.com', 'Agent A');
  cloud.online = false;
  a.store.upsert('properties', prop('p1'));
  a.store.upsert('properties', prop('p1', { askingPrice: 520000 }));
  await a.store.flush();
  await assert.rejects(syncNow(a.store, cfg, cloud.fetch));
  // the phone has it, even after the app is closed and opened again
  const reopened = await Store.open(a.backend);
  assert.equal(reopened.getState().properties[0].askingPrice, 520000);
  assert.equal((await reopened.revisions('properties:p1')).length, 1, 'the earlier version is in history');
  const audit = await reopened.auditEntries('properties:p1');
  assert.deepEqual(audit.map(e => e.action), ['edit', 'create']);
  assert.deepEqual(audit[0].changes, [{ field: 'askingPrice', before: 500000, after: 520000 }]);
  cloud.online = true;
  await syncNow(reopened, cfg, cloud.fetch);
  assert.equal((cloudRow(cloud, a.user.ws, 'properties', 'p1')!.data as Listing).askingPrice, 520000);
  assert.equal(cloud.audit.filter(e => e.record_id === 'p1').length, 2, 'both audit entries reached the cloud once');
  await syncNow(reopened, cfg, cloud.fetch);
  assert.equal(cloud.audit.filter(e => e.record_id === 'p1').length, 2, 'never twice');
});

test('L1-2 a failing audit upload never fails or undoes the record: the record syncs, the entry waits and goes later', async () => {
  const cloud = new FakeTeamCloud();
  const a = await agentPhone(cloud, 'a@x.com');
  let auditDown = true;
  const fetchFn = (async (url: string, init: RequestInit = {}) => {
    if (auditDown && url.includes('/rest/v1/eab_audit_events') && (init.method ?? 'GET') === 'POST') return new Response('{"message":"timeout"}', { status: 503 });
    return cloud.fetch(url, init);
  }) as typeof fetch;
  a.store.upsert('tasks', task('t1', 'Call owner'));
  await a.store.flush();
  const r = await syncNow(a.store, cfg, fetchFn);
  assert.ok(cloudRow(cloud, a.user.ws, 'tasks', 't1'), 'the record reached the cloud');
  assert.equal(r.auditSent ?? 0, 0);
  assert.deepEqual(a.store.getState().meta.dirty, [], 'the record is not left waiting because of its audit entry');
  assert.equal(Object.keys(a.store.getState().meta.recErrors ?? {}).length, 0);
  assert.equal((await a.store.auditOutbox()).length, 1, 'the entry waits on the phone');
  auditDown = false;
  await syncNow(a.store, cfg, fetchFn);
  assert.equal((await a.store.auditOutbox()).length, 0);
  assert.equal(cloud.audit.filter(e => e.record_id === 't1').length, 1);
});

test('L1-3 restoring a whole earlier version is an ordinary, audited edit; the audit trail and the history are only added to', async () => {
  const cloud = new FakeTeamCloud();
  const a = await agentPhone(cloud, 'a@x.com');
  a.store.upsert('properties', prop('p1'));
  a.store.upsert('properties', prop('p1', { askingPrice: 450000 }));
  await a.store.flush();
  const [older] = await a.store.revisions('properties:p1');
  assert.equal((older.data as Listing).askingPrice, 500000);
  assert.ok(await a.store.restoreRevision('properties', 'p1', older.at));
  await a.store.flush();
  assert.equal(a.store.getState().properties[0].askingPrice, 500000);
  const audit = await a.store.auditEntries('properties:p1');
  assert.equal(audit.length, 3, 'create, edit, and the restore');
  assert.deepEqual(audit[0].changes, [{ field: 'askingPrice', before: 450000, after: 500000 }]);
  assert.equal((await a.store.revisions('properties:p1')).length, 2, 'the version replaced by the restore is kept too');
  await syncNow(a.store, cfg, cloud.fetch);
  assert.equal((cloudRow(cloud, a.user.ws, 'properties', 'p1')!.data as Listing).askingPrice, 500000);
});

test('L1-4 archive and restore of a property, and delete and bring back of a task, keep history and audit', async () => {
  const cloud = new FakeTeamCloud();
  const a = await agentPhone(cloud, 'a@x.com');
  a.store.upsert('properties', prop('p1'));
  a.store.upsert('properties', { ...prop('p1'), archived: { at: 5, by: a.user.id } });
  a.store.upsert('properties', prop('p1'));
  a.store.upsert('tasks', task('t1', 'Viewing follow-up'));
  a.store.remove('tasks', 't1');
  await a.store.flush();
  assert.deepEqual((await a.store.auditEntries('properties:p1')).map(e => e.action), ['restore', 'archive', 'create']);
  const deleted = await a.store.recentlyDeleted();
  assert.deepEqual(deleted.map(d => d.key), ['tasks:t1']);
  a.store.upsert('tasks', deleted[0].data as unknown as Task, false, 'restore');
  await a.store.flush();
  assert.equal(a.store.getState().tasks.length, 1);
  assert.deepEqual((await a.store.auditEntries('tasks:t1')).map(e => e.action), ['restore', 'delete', 'create']);
  await syncNow(a.store, cfg, cloud.fetch);
  assert.equal(cloudRow(cloud, a.user.ws, 'tasks', 't1')!.deleted, false);
});

test('L1-5 the same field changed on two phones offline: both versions are kept and nothing is silently overwritten', async () => {
  const cloud = new FakeTeamCloud();
  const a = await agentPhone(cloud, 'a@x.com');
  const a2 = await agentPhone(cloud, 'a@x.com');
  a.store.upsert('properties', prop('p1'));
  await syncNow(a.store, cfg, cloud.fetch);
  await syncNow(a2.store, cfg, cloud.fetch);
  a.store.upsert('properties', { ...a.store.getState().properties[0], askingPrice: 510000 });
  a2.store.upsert('properties', { ...a2.store.getState().properties[0], askingPrice: 530000 });
  await syncNow(a.store, cfg, cloud.fetch);
  await syncNow(a2.store, cfg, cloud.fetch);
  const conflicts = a2.store.getState().meta.conflicts ?? [];
  assert.equal(conflicts.length, 1, 'the second phone is asked, not overwritten');
  assert.deepEqual(conflicts[0].fields?.map(f => [f.field, f.local, f.remote]), [['askingPrice', 530000, 510000]]);
  assert.equal((cloudRow(cloud, a.user.ws, 'properties', 'p1')!.data as Listing).askingPrice, 510000, 'the cloud keeps the first saved version until the person decides');
  assert.equal(a2.store.getState().properties[0].askingPrice, 530000, 'the phone keeps its own until then');
});
