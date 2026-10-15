// Change 010, Phase 3: audit history — field-level entries, grouping, actor, Malaysian time, ordering, cloud sync,
// access for former members, owner-only deletion with a hidden backup. Stand-in cloud; not a live project or phone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/data/store';
import { MemoryBackend } from '../src/data/backend';
import { syncNow } from '../src/data/sync';
import { diffFields, fmtMyt, ymdMyt, newestFirst, actionFor, type AuditEntry } from '../src/audit/model';
import { auditVisible, deleteAudit, applyAuditFilters } from '../src/audit/AuditUI';
import { sendInvite, acceptInvite, setShares, leaveTeam, refreshTeam } from '../src/team/api';
import type { Listing } from '../src/listing/model';
import { FakeTeamCloud, cfg, agentPhone } from './support/fakeTeamCloud';

const prop = (id: string, extra: Partial<Listing> = {}): Listing => ({ id, created: 1, updated: 1, photos: [], ...extra } as unknown as Listing);

test('AU1 field changes are exact; nested fields become paths; lists stay whole; bookkeeping ignored', () => {
  const before = { id: 'p', updated: 1, askingPrice: 500000, street: 'Jalan A', tenancy: { rent: 1200, tenantName: 'Ali' }, photos: [{ id: 'f1' }], history: [1] };
  const after = { id: 'p', updated: 2, askingPrice: 520000, street: 'Jalan A', tenancy: { rent: 1300, tenantName: 'Ali' }, photos: [{ id: 'f1' }, { id: 'f2' }], history: [1, 2], notes: 'new' };
  assert.deepEqual(diffFields(before, after), [
    { field: 'askingPrice', before: 500000, after: 520000 },
    { field: 'notes', before: null, after: 'new' },
    { field: 'photos', before: [{ id: 'f1' }], after: [{ id: 'f1' }, { id: 'f2' }] },
    { field: 'tenancy.rent', before: 1200, after: 1300 },
  ]);
  assert.equal(actionFor(undefined, { a: 1 }, 'edit'), 'create');
  assert.equal(actionFor({ a: 1 }, { a: 1, archived: { at: 1 } }, 'edit'), 'archive');
  assert.equal(actionFor({ archived: { at: 1 } }, {}, 'edit'), 'restore');
  assert.equal(actionFor({ a: 1 }, null, 'delete'), 'delete');
});

test('AU2 one entry per save, grouping every field changed in it; no entry when nothing changed', async () => {
  const s = await Store.open(new MemoryBackend());
  s.upsert('properties', prop('p1', { street: 'Jalan Satu' }));
  s.upsert('properties', prop('p1', { street: 'Jalan Dua', askingPrice: 400000, bedrooms: 3 }));
  s.upsert('properties', prop('p1', { street: 'Jalan Dua', askingPrice: 400000, bedrooms: 3 }));   // same content
  const list = await s.auditEntries('properties:p1');
  assert.equal(list.length, 2);
  assert.equal(list[0].action, 'edit');
  assert.deepEqual(list[0].changes!.map(c => [c.field, c.before, c.after]), [['askingPrice', null, 400000], ['bedrooms', null, 3], ['street', 'Jalan Satu', 'Jalan Dua']]);
  assert.equal(list[1].action, 'create');
});

test('AU3 archive, restore and delete are recorded; changes from the cloud and sample records are not', async () => {
  const s = await Store.open(new MemoryBackend());
  s.upsert('properties', prop('p1'));
  s.upsert('properties', prop('p1', { archived: { at: 5 } }));
  s.upsert('properties', prop('p1'));
  s.remove('properties', 'p1');
  assert.deepEqual((await s.auditEntries('properties:p1')).map(e => e.action), ['delete', 'restore', 'archive', 'create']);
  s.applyRemote('properties', 'p2', prop('p2', { street: 'from cloud' }) as never);
  assert.deepEqual(await s.auditEntries('properties:p2'), [], 'arrives with the cloud\'s own entries instead');
  s.upsert('properties', prop('p3', { sample: true }));
  assert.deepEqual(await s.auditEntries('properties:p3'), []);
});

test('AU4 the actor is the signed-in person (name, else email); signed out, the Agent Profile', async () => {
  const s = await Store.open(new MemoryBackend());
  s.setSingleton('profile', { fullName: 'Mei Ling' });
  s.upsert('tasks', { id: 'task-x', created: 1, updated: 1, title: 'x', priority: 'low', done: false, kind: 'task', reminders: [] });
  let e = (await s.auditEntries('tasks:task-x'))[0];
  assert.equal(e.actorId, 'local'); assert.equal(e.actorName, 'Mei Ling');
  s.setSingleton('profile', { fullName: undefined });
  s.setSingleton('meta', { syncSession: { accessToken: 'a', refreshToken: 'r', expiresAt: 9e15, email: 'mei@x.com', userId: 'u1' } });
  s.upsert('tasks', { id: 'task-x', created: 1, updated: 2, title: 'y', priority: 'low', done: false, kind: 'task', reminders: [] });
  e = (await s.auditEntries('tasks:task-x'))[0];
  assert.equal(e.actorId, 'u1'); assert.equal(e.actorName, undefined); assert.equal(e.actorEmail, 'mei@x.com');
});

test('AU5 Malaysian-readable time whatever the device clock zone; newest first', () => {
  assert.equal(fmtMyt(Date.UTC(2026, 9, 15, 8, 30)), '15 Oct 2026, 4:30 PM (MYT, UTC+8)');
  assert.equal(fmtMyt(Date.UTC(2026, 9, 14, 16, 5)), '15 Oct 2026, 12:05 AM (MYT, UTC+8)');
  assert.equal(fmtMyt(Date.UTC(2026, 9, 15, 4, 0)), '15 Oct 2026, 12:00 PM (MYT, UTC+8)');
  assert.equal(ymdMyt(Date.UTC(2026, 9, 14, 16, 5)), '20261015');
  const xs = [{ id: 'a', at: 1 }, { id: 'b', at: 3 }, { id: 'c', at: 2 }] as AuditEntry[];
  assert.deepEqual(xs.sort(newestFirst).map(x => x.id), ['b', 'c', 'a']);
});

test('AU6 person and action filters; all actions selected by default keeps everything', () => {
  const xs = [{ id: '1', at: 1, actorId: 'u1', action: 'edit' }, { id: '2', at: 2, actorId: 'u2', action: 'permission' }, { id: '3', at: 3, actorId: 'u1', action: 'export' }] as AuditEntry[];
  assert.equal(applyAuditFilters(xs, '', ['edit', 'delete', 'restore', 'permission', 'membership', 'export']).length, 3);
  assert.deepEqual(applyAuditFilters(xs, 'u1', ['edit', 'export']).map(x => x.id), ['1', '3']);
  assert.deepEqual(applyAuditFilters(xs, '', ['permission']).map(x => x.id), ['2']);
});

async function team() {
  const cloud = new FakeTeamCloud();
  const a = await agentPhone(cloud, 'aina@x.com', 'Aina');
  const b = await agentPhone(cloud, 'badrul@x.com', 'Badrul');
  a.store.upsert('properties', prop('p1', { street: 'Jalan Aina' }));
  await syncNow(a.store, cfg, cloud.fetch); await syncNow(b.store, cfg, cloud.fetch);
  const inv = await sendInvite(a.store, cfg, 'badrul@x.com', cloud.fetch);
  await acceptInvite(b.store, cfg, { token: inv.token }, cloud.fetch);
  await refreshTeam(a.store, cfg, cloud.fetch);
  await setShares(a.store, cfg, [{ collection: 'properties', id: 'p1', level: 'edit' }], cloud.fetch);
  await syncNow(b.store, cfg, cloud.fetch);
  return { cloud, a: a.store, b: b.store };
}

test('AU7 both agents see one history of a shared record, each change named by who made it, permission changes included', async () => {
  const { cloud, a, b } = await team();
  const p = b.getState().properties.find(x => x.id === 'p1')!;
  b.upsert('properties', { ...p, askingPrice: 777000 });
  await syncNow(b, cfg, cloud.fetch); await syncNow(a, cfg, cloud.fetch); await syncNow(b, cfg, cloud.fetch);
  const seenByA = await a.auditEntries('properties:p1');
  const seenByB = await b.auditEntries('properties:p1');
  const bEdit = seenByA.find(e => e.action === 'edit' && e.changes?.some(c => c.field === 'askingPrice'));
  assert.ok(bEdit, 'A sees B\'s edit');
  assert.equal(bEdit!.actorName, 'Badrul');
  assert.deepEqual(bEdit!.changes!.find(c => c.field === 'askingPrice'), { field: 'askingPrice', before: null, after: 777000 });
  assert.ok(seenByB.some(e => e.action === 'create' && e.actorName === 'Aina'), 'B sees A\'s creation');
  assert.ok(seenByA.some(e => e.action === 'permission'), 'the grant is in the record\'s history');
  assert.equal(new Set(seenByA.map(e => e.id)).size, seenByA.length, 'never duplicated');
});

test('AU8 a former member loses the record\'s history with the record; the owner keeps the former member\'s actions', async () => {
  const { cloud, a, b } = await team();
  const p = b.getState().properties.find(x => x.id === 'p1')!;
  b.upsert('properties', { ...p, notes: 'B was here' });
  await syncNow(b, cfg, cloud.fetch);
  await leaveTeam(b, cfg, cloud.fetch);
  assert.deepEqual(await b.auditEntries('properties:p1'), []);
  assert.equal(auditVisible(b.getState(), 'properties:p1', []), false);
  await syncNow(a, cfg, cloud.fetch);
  assert.ok((await a.auditEntries('properties:p1')).some(e => e.actorName === 'Badrul' && e.changes?.some(c => c.field === 'notes')));
});

test('AU9 deleting old entries: owner only, kept in a hidden backup, the deletion itself recorded', async () => {
  const { cloud, a, b } = await team();
  void cloud;
  const entries = await a.auditEntries('properties:p1');
  const pick = entries.find(e => e.action === 'create')!;
  await assert.rejects(() => deleteAudit(b, 'properties:p1', [pick.id]), /not allowed/);
  const n = await a.deleteAuditEntries('properties:p1', [pick.id]);
  assert.equal(n, 1);
  const after = await a.auditEntries('properties:p1');
  assert.equal(after.some(e => e.id === pick.id), false);
  assert.equal(after[0].action, 'audit_delete');
  const bak = await a.getLocal(`auditbak:${pick.id}`) as { entry: AuditEntry };
  assert.equal(bak.entry.id, pick.id);
});
