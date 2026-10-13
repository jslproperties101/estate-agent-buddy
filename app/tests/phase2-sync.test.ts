// Phase 2: safe synchronisation. Two (or more) phones and a stand-in cloud that follows the same rules as the SQL
// migration. Nothing here uses a real Supabase project.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/data/store';
import { syncNow, resolveConflict } from '../src/data/sync';
import { recordStateOf } from '../src/data/recordstate';
import { saveStateFromStore } from '../src/data/savestate';
import { loadSampleInto } from '../src/data/sample';
import type { Contact } from '../src/data/types';
import type { Listing } from '../src/listing/model';
import { FakeCloud, cfg, phone } from './support/fakeCloud';

const contact = (id: string, name: string, extra: Partial<Contact> = {}): Contact => ({ id, created: 1, updated: 1, name, roles: ['buyer'], ...extra });
const sync = (s: Store, c: FakeCloud) => syncNow(s, cfg, c.fetch);
const prop = (id: string, ref: string, headline = 'House'): Listing => ({ id, created: 1, updated: 1, headline, ref, refPrefix: ref.replace(/\d+/g, ''), refNo: Number(ref.replace(/\D/g, '')), photos: [], documents: [] } as unknown as Listing);
const get = (s: Store, id: string) => s.getState().contacts.find(c => c.id === id);

test('P2-1 a new record goes up once, the phone remembers the cloud version, and a second phone receives it', async () => {
  const cloud = new FakeCloud();
  const a = await phone(cloud, 'a@x.c'); const b = await phone(cloud, 'a@x.c');
  a.store.upsert('contacts', contact('c1', 'Ahmad'));
  assert.equal(recordStateOf(a.store, 'contacts', 'c1'), 'waiting');
  const r = await sync(a.store, cloud);
  assert.equal(r.pushed, 1);
  assert.equal(recordStateOf(a.store, 'contacts', 'c1'), 'synced');
  assert.equal(a.store.getBase('contacts:c1')?.rev, 1);
  await sync(b.store, cloud);
  assert.equal(get(b.store, 'c1')?.name, 'Ahmad');
  assert.equal(recordStateOf(b.store, 'contacts', 'c1'), 'synced');
  const again = await sync(a.store, cloud);                 // nothing to do, nothing re-sent
  assert.equal(again.pushed, 0);
  assert.equal(cloud.rows.get('ws1|contacts|c1')!.rev, 1);
});

test('P2-2 two phones edit DIFFERENT fields of one record offline: both changes survive, in either sync order', async () => {
  for (const order of [['a', 'b'], ['b', 'a']] as const) {
    const cloud = new FakeCloud();
    const a = await phone(cloud, 'o@x.c'); const b = await phone(cloud, 'o@x.c');
    a.store.upsert('contacts', contact('c1', 'Ahmad'));
    await sync(a.store, cloud); await sync(b.store, cloud);
    // both go offline and edit
    a.store.upsert('contacts', { ...get(a.store, 'c1')!, phone: '012-111' });
    b.store.upsert('contacts', { ...get(b.store, 'c1')!, email: 'ahmad@x.c' });
    for (const who of order) await sync(who === 'a' ? a.store : b.store, cloud);
    await sync(a.store, cloud); await sync(b.store, cloud);   // second round so both see the joined record
    for (const p of [a, b]) {
      assert.equal(get(p.store, 'c1')?.phone, '012-111', `order ${order}`);
      assert.equal(get(p.store, 'c1')?.email, 'ahmad@x.c', `order ${order}`);
      assert.deepEqual(p.store.getState().meta.conflicts ?? [], []);
      assert.equal(recordStateOf(p.store, 'contacts', 'c1'), 'synced');
    }
  }
});

test('P2-3 two phones change the SAME field: a reviewable conflict, nothing is lost, both versions stay recoverable', async () => {
  for (const order of [['a', 'b'], ['b', 'a']] as const) {
    const cloud = new FakeCloud();
    const a = await phone(cloud, 'o@x.c'); const b = await phone(cloud, 'o@x.c');
    a.store.upsert('contacts', contact('c1', 'Ahmad', { phone: '000' }));
    await sync(a.store, cloud); await sync(b.store, cloud);
    a.store.upsert('contacts', { ...get(a.store, 'c1')!, phone: '012-AAA', notes: 'from A' });
    b.store.upsert('contacts', { ...get(b.store, 'c1')!, phone: '013-BBB' });
    const [first, second] = order.map(w => (w === 'a' ? a : b));
    await sync(first.store, cloud);
    await sync(second.store, cloud);
    const loser = second;
    const cf = loser.store.getState().meta.conflicts ?? [];
    assert.equal(cf.length, 1, `order ${order}: the second phone has a conflict`);
    assert.equal(cf[0].kind, 'fields');
    assert.deepEqual(cf[0].fields!.map(f => f.field), ['phone']);
    assert.equal(recordStateOf(loser.store, 'contacts', 'c1'), 'conflict');
    assert.equal(saveStateFromStore(loser.store), 'conflict', 'the overall line does not say Synced');
    // the phone still shows ITS OWN value; the cloud's value is in the history
    assert.equal(get(loser.store, 'c1')?.phone, loser === a ? '012-AAA' : '013-BBB');
    const hist = await loser.store.revisions('contacts:c1');
    const cloudPhone = (first === a ? '012-AAA' : '013-BBB');
    assert.ok(hist.some(h => (h.data as Contact).phone === cloudPhone), 'the other phone’s version is recoverable');
    // the conflicting record is NOT sent while it waits for a decision
    const revBefore = cloud.rows.get('ws1|contacts|c1')!.rev;
    await sync(loser.store, cloud);
    assert.equal(cloud.rows.get('ws1|contacts|c1')!.rev, revBefore);
    // choose the other phone's value for the phone field; the non-conflicting notes edit is kept
    resolveConflict(loser.store, 'contacts:c1', { fields: { phone: 'remote' } });
    await sync(loser.store, cloud); await sync(first.store, cloud);
    for (const p of [a, b]) {
      assert.equal(get(p.store, 'c1')?.phone, cloudPhone);
      assert.equal(get(p.store, 'c1')?.notes, 'from A');
      assert.equal(recordStateOf(p.store, 'contacts', 'c1'), 'synced');
    }
    assert.deepEqual(loser.store.getState().meta.conflicts ?? [], []);
  }
});

test('P2-4 choosing "mine" for a conflict sends this phone’s value, and the other value is still in the history', async () => {
  const cloud = new FakeCloud();
  const a = await phone(cloud, 'o@x.c'); const b = await phone(cloud, 'o@x.c');
  a.store.upsert('contacts', contact('c1', 'Ahmad'));
  await sync(a.store, cloud); await sync(b.store, cloud);
  a.store.upsert('contacts', { ...get(a.store, 'c1')!, name: 'Ahmad Bin A' });
  b.store.upsert('contacts', { ...get(b.store, 'c1')!, name: 'Ahmad Bin B' });
  await sync(a.store, cloud); await sync(b.store, cloud);
  resolveConflict(b.store, 'contacts:c1', { fields: { name: 'local' } });
  await sync(b.store, cloud); await sync(a.store, cloud);
  assert.equal(get(a.store, 'c1')?.name, 'Ahmad Bin B');
  assert.ok((await a.store.revisions('contacts:c1')).some(h => (h.data as Contact).name === 'Ahmad Bin A'), 'A’s earlier version is still recoverable on A');
  const serverHist = cloud.history.get('ws1|contacts|c1')!;
  assert.ok(serverHist.some(h => (h.data as Contact).name === 'Ahmad Bin A'), 'and in the cloud’s history');
});

test('P2-5 deleted on one phone, edited on the other: a conflict, never a silent delete or a resurrection', async () => {
  const cloud = new FakeCloud();
  const a = await phone(cloud, 'o@x.c'); const b = await phone(cloud, 'o@x.c');
  a.store.upsert('contacts', contact('c1', 'Ahmad'));
  await sync(a.store, cloud); await sync(b.store, cloud);
  a.store.remove('contacts', 'c1');
  b.store.upsert('contacts', { ...get(b.store, 'c1')!, notes: 'new info' });
  await sync(a.store, cloud);                                   // the delete reaches the cloud first
  await sync(b.store, cloud);
  assert.equal(b.store.getState().meta.conflicts?.[0]?.kind, 'deleted-remote');
  assert.equal(get(b.store, 'c1')?.notes, 'new info', 'B still has its edit');
  assert.equal(cloud.rows.get('ws1|contacts|c1')!.deleted, true, 'the cloud copy stays deleted until B decides');
  // B decides to keep it
  resolveConflict(b.store, 'contacts:c1', { whole: 'local' });
  await sync(b.store, cloud); await sync(a.store, cloud);
  assert.equal(get(a.store, 'c1')?.notes, 'new info');
  assert.equal(cloud.rows.get('ws1|contacts|c1')!.deleted, false);
});

test('P2-6 the other way round: edited on one phone, deleted on the other', async () => {
  const cloud = new FakeCloud();
  const a = await phone(cloud, 'o@x.c'); const b = await phone(cloud, 'o@x.c');
  a.store.upsert('contacts', contact('c1', 'Ahmad'));
  await sync(a.store, cloud); await sync(b.store, cloud);
  a.store.upsert('contacts', { ...get(a.store, 'c1')!, notes: 'edit' });
  b.store.remove('contacts', 'c1');
  await sync(a.store, cloud); await sync(b.store, cloud);
  assert.equal(b.store.getState().meta.conflicts?.[0]?.kind, 'deleted-local');
  assert.equal(get(b.store, 'c1'), undefined, 'not silently brought back');
  assert.equal(cloud.rows.get('ws1|contacts|c1')!.deleted, false, 'and A’s edit is not silently deleted');
  resolveConflict(b.store, 'contacts:c1', { whole: 'remote' });          // B decides to bring it back
  assert.equal(get(b.store, 'c1')?.notes, 'edit');
  await sync(b.store, cloud);
  assert.deepEqual(b.store.getState().meta.dirty, []);
});

test('P2-7 a deletion is not undone by a phone that still has an old copy', async () => {
  const cloud = new FakeCloud();
  const a = await phone(cloud, 'o@x.c'); const b = await phone(cloud, 'o@x.c');
  a.store.upsert('contacts', contact('c1', 'Ahmad'));
  await sync(a.store, cloud); await sync(b.store, cloud);
  a.store.remove('contacts', 'c1');
  await sync(a.store, cloud);
  await sync(b.store, cloud);                                              // B has not touched it: it is removed
  assert.equal(get(b.store, 'c1'), undefined);
  await sync(b.store, cloud); await sync(a.store, cloud);
  assert.equal(get(a.store, 'c1'), undefined);
  assert.equal(cloud.rows.get('ws1|contacts|c1')!.deleted, true);
  // and it is in Recently deleted on A, recoverable
  assert.equal((await a.store.recentlyDeleted()).length, 1);
});

test('P2-8 a lost answer: the retry is recognised, no duplicate write, the record stays safe in the meantime', async () => {
  const cloud = new FakeCloud();
  const a = await phone(cloud, 'o@x.c');
  a.store.upsert('contacts', contact('c1', 'Ahmad'));
  cloud.failNext('rpc/eab_push_records', 1, 'after');       // the cloud writes, the phone never hears back
  await assert.rejects(sync(a.store, cloud));
  assert.equal(cloud.rows.get('ws1|contacts|c1')!.rev, 1);
  assert.deepEqual(a.store.getState().meta.dirty, ['contacts:c1'], 'not marked as sent');
  assert.notEqual(recordStateOf(a.store, 'contacts', 'c1'), 'synced');
  await sync(a.store, cloud);                                // retry
  assert.equal(cloud.rows.get('ws1|contacts|c1')!.rev, 1, 'written once, not twice');
  assert.equal(cloud.rows.size, 1);
  assert.equal(recordStateOf(a.store, 'contacts', 'c1'), 'synced');
  assert.equal(a.store.getBase('contacts:c1')?.rev, 1);
});

test('P2-9 no false "Synced": a change made while the upload runs stays waiting and is sent next', async () => {
  const cloud = new FakeCloud();
  const a = await phone(cloud, 'o@x.c');
  a.store.upsert('contacts', contact('c1', 'Ahmad'));
  cloud.duringPush = () => { cloud.duringPush = undefined; a.store.upsert('contacts', { ...get(a.store, 'c1')!, notes: 'typed during upload' }); };
  await sync(a.store, cloud);
  assert.equal(get(a.store, 'c1')?.notes, 'typed during upload');
  assert.equal(cloud.rows.get('ws1|contacts|c1')!.rev >= 1, true);
  // the follow-up round in the same sync (or the next one) sends it; at no point was the newer text reported as synced
  const r1 = cloud.rows.get('ws1|contacts|c1')!;
  assert.equal((r1.data as Contact).notes, 'typed during upload', 'the follow-up round sent the newer text');
  assert.equal(recordStateOf(a.store, 'contacts', 'c1'), 'synced');
});

test('P2-9c if the follow-up send cannot happen, the newer text is still waiting and the record never shows Synced', async () => {
  const cloud = new FakeCloud();
  const a = await phone(cloud, 'o@x.c');
  a.store.upsert('contacts', contact('c1', 'Ahmad'));
  cloud.duringPush = () => { cloud.duringPush = undefined; a.store.upsert('contacts', { ...get(a.store, 'c1')!, notes: 'typed during upload' }); cloud.online = false; };
  await assert.rejects(sync(a.store, cloud));
  assert.ok(a.store.getState().meta.dirty.includes('contacts:c1'), 'the later edit is still waiting');
  assert.notEqual(recordStateOf(a.store, 'contacts', 'c1'), 'synced');
  assert.notEqual(saveStateFromStore(a.store), 'synced');
  assert.equal((cloud.rows.get('ws1|contacts|c1')!.data as Contact).notes, undefined, 'the cloud has the older text');
  assert.equal(a.store.getBase('contacts:c1')?.rev, 1, 'what the cloud accepted is remembered exactly');
  cloud.online = true;
  await sync(a.store, cloud);
  assert.equal((cloud.rows.get('ws1|contacts|c1')!.data as Contact).notes, 'typed during upload');
  assert.equal(recordStateOf(a.store, 'contacts', 'c1'), 'synced');
});

test('P2-9b while the answer has not come back the record is "syncing", then "waiting" if the upload fails', async () => {
  const cloud = new FakeCloud();
  const a = await phone(cloud, 'o@x.c');
  a.store.upsert('contacts', contact('c1', 'Ahmad'));
  const seen: string[] = [];
  const orig = cloud.fetch;
  cloud.fetch = (async (url: string, init?: RequestInit) => { if (String(url).includes('eab_push_records')) seen.push(recordStateOf(a.store, 'contacts', 'c1')); return orig(url, init); }) as typeof fetch;
  await syncNow(a.store, cfg, cloud.fetch);
  assert.deepEqual(seen, ['syncing']);
  assert.equal(recordStateOf(a.store, 'contacts', 'c1'), 'synced');
  a.store.upsert('contacts', { ...get(a.store, 'c1')!, notes: 'x' });
  cloud.online = false;
  await assert.rejects(syncNow(a.store, cfg, cloud.fetch));
  a.store.setSingleton('meta', { syncError: 'network' });
  assert.equal(recordStateOf(a.store, 'contacts', 'c1'), 'failed');
  assert.deepEqual(a.store.getState().meta.dirty, ['contacts:c1'], 'the change is kept');
  cloud.online = true;
  await syncNow(a.store, cfg, cloud.fetch);
  assert.equal(recordStateOf(a.store, 'contacts', 'c1'), 'synced');
});

test('P2-10 offline for a while, other phone edits meanwhile, then back online: joined without loss', async () => {
  const cloud = new FakeCloud();
  const a = await phone(cloud, 'o@x.c'); const b = await phone(cloud, 'o@x.c');
  a.store.upsert('contacts', contact('c1', 'Ahmad'));
  await sync(a.store, cloud); await sync(b.store, cloud);
  cloud.online = false;
  a.store.upsert('contacts', { ...get(a.store, 'c1')!, company: 'ACME' });
  a.store.upsert('contacts', contact('c2', 'New offline contact'));
  await assert.rejects(sync(a.store, cloud));
  cloud.online = true;
  b.store.upsert('contacts', { ...get(b.store, 'c1')!, email: 'b@x.c' });
  await sync(b.store, cloud);
  await sync(a.store, cloud); await sync(b.store, cloud);
  for (const p of [a, b]) {
    assert.equal(get(p.store, 'c1')?.company, 'ACME'); assert.equal(get(p.store, 'c1')?.email, 'b@x.c'); assert.equal(get(p.store, 'c2')?.name, 'New offline contact');
  }
});

test('P2-11 sample data never goes up and cloud rows marked sample never come down', async () => {
  const cloud = new FakeCloud();
  const a = await phone(cloud, 'o@x.c');
  loadSampleInto(a.store);
  a.store.upsert('contacts', contact('real', 'Real person'));
  cloud.rows.set('ws1|contacts|bogus', { data: { ...contact('bogus', 'Sample from elsewhere'), sample: true }, deleted: false, rev: 1, seq: 999, user_id: 'x', updated: 1 });
  await sync(a.store, cloud);
  const ids = [...cloud.rows.keys()].map(k => k.split('|')[2]);
  assert.deepEqual(ids.filter(i => i !== 'bogus'), ['real']);
  assert.equal(get(a.store, 'bogus'), undefined);
  assert.deepEqual(a.store.getState().meta.dirty, []);
});

test('P2-12 a deactivated account is reported, nothing is marked synced, and the changes are kept', async () => {
  const cloud = new FakeCloud();
  const a = await phone(cloud, 'o@x.c');
  a.store.upsert('contacts', contact('c1', 'Ahmad'));
  await sync(a.store, cloud);
  a.store.upsert('contacts', { ...get(a.store, 'c1')!, notes: 'later' });
  const before = a.store.getState().meta.lastSync;
  cloud.setRole('o@x.c', null);
  await assert.rejects(sync(a.store, cloud), (e: Error & { code?: string }) => e.code === 'no-access');
  assert.equal(a.store.getState().meta.lastSync, before);
  assert.deepEqual(a.store.getState().meta.dirty, ['contacts:c1']);
  assert.equal(get(a.store, 'c1')?.notes, 'later');
  assert.equal(cloud.rows.get('ws1|contacts|c1')!.rev, 1);
});

test('P2-13 a read-only person receives changes and sends nothing; their own edit stays in the history', async () => {
  const cloud = new FakeCloud();
  const owner = await phone(cloud, 'o@x.c');
  const viewer = await phone(cloud, 'v@x.c', { role: 'limited' });
  owner.store.upsert('contacts', contact('c1', 'Ahmad'));
  await sync(owner.store, cloud);
  viewer.store.upsert('contacts', contact('mine', 'Viewer note'));
  const r = await sync(viewer.store, cloud);
  assert.equal(r.pushed, 0);
  assert.equal(get(viewer.store, 'c1'), undefined, 'a limited user only sees own/assigned records (database decides)');
  assert.deepEqual(viewer.store.getState().meta.dirty, ['contacts:mine'], 'kept for later');
});

test('P2-14 an agent without write permission on a record: the refusal is shown on that record, nothing is lost', async () => {
  const cloud = new FakeCloud();
  const owner = await phone(cloud, 'o@x.c');
  const agent = await phone(cloud, 'g@x.c', { role: 'agent' });
  owner.store.upsert('contacts', contact('c1', 'Owner contact'));
  await sync(owner.store, cloud);
  // pretend the cloud lets the agent read it (e.g. assigned) but not write: make the agent the reader via rows
  cloud.rows.get('ws1|contacts|c1')!.user_id = agent.store.getState().meta.syncSession!.userId;
  await sync(agent.store, cloud);
  assert.equal(get(agent.store, 'c1')?.name, 'Owner contact');
  cloud.setRole('g@x.c', 'limited');
  cloud.users.get('g@x.c')!.role = 'agent';
  cloud.rows.get('ws1|contacts|c1')!.user_id = 'someone-else';
  agent.store.upsert('contacts', { ...get(agent.store, 'c1')!, notes: 'agent edit' });
  await sync(agent.store, cloud);
  assert.equal(agent.store.getState().meta.recErrors?.['contacts:c1'], 'denied');
  assert.equal(recordStateOf(agent.store, 'contacts', 'c1'), 'failed');
  assert.equal(get(agent.store, 'c1')?.notes, 'agent edit', 'the edit is still on the phone');
  assert.ok(agent.store.getState().meta.dirty.includes('contacts:c1'));
});

test('P2-15 more than one page of changes is pulled', async () => {
  const cloud = new FakeCloud();
  const a = await phone(cloud, 'o@x.c'); const b = await phone(cloud, 'o@x.c');
  for (let i = 0; i < 620; i++) a.store.upsert('contacts', contact(`c${i}`, `N${i}`));
  await sync(a.store, cloud);
  await sync(b.store, cloud);
  assert.equal(b.store.getState().contacts.length, 620);
  assert.equal(b.store.getState().meta.lastSeq, 620);
});

// ---------- property numbers ----------
test('P2-16 two phones create the same property number offline (different prefixes): the second sync is refused, the local record is kept and not renamed', async () => {
  const cloud = new FakeCloud();
  const a = await phone(cloud, 'o@x.c'); const b = await phone(cloud, 'o@x.c');
  a.store.upsert('properties', prop('pa', 'P1001', 'Terrace in Puchong'));
  b.store.upsert('properties', prop('pb', 'A1001', 'Condo in Cheras'));
  await sync(a.store, cloud);
  await sync(b.store, cloud);
  const cf = b.store.getState().meta.conflicts ?? [];
  assert.equal(cf.length, 1);
  assert.equal(cf[0].kind, 'reference');
  assert.equal(cf[0].ref?.refNo, 1001);
  assert.equal(cf[0].ref?.otherRef, 'P1001');
  assert.equal(cf[0].ref?.otherTitle, 'Terrace in Puchong', 'shows the property already using the number');
  assert.equal(cf[0].ref?.otherVisible, true);
  const mine = b.store.getState().properties.find(p => p.id === 'pb')!;
  assert.equal(mine.ref, 'A1001', 'not silently renamed');
  assert.ok(b.store.getState().meta.dirty.includes('properties:pb'), 'kept, waiting');
  assert.equal(recordStateOf(b.store, 'properties', 'pb'), 'conflict');
  assert.equal(cloud.rows.has('ws1|properties|pb'), false);
  // the person picks another number themselves; the next sync lifts the conflict and sends it
  b.store.upsert('properties', { ...mine, ref: 'A1002', refNo: 1002 } as Listing);
  await sync(b.store, cloud);
  assert.deepEqual(b.store.getState().meta.conflicts ?? [], []);
  assert.equal(cloud.rows.get('ws1|properties|pb')!.rev, 1);
  assert.equal(recordStateOf(b.store, 'properties', 'pb'), 'synced');
});

test('P2-17 the property already using the number is not revealed to someone who may not see it', async () => {
  const cloud = new FakeCloud();
  const owner = await phone(cloud, 'o@x.c');
  const agent = await phone(cloud, 'g@x.c', { role: 'agent' });
  owner.store.upsert('properties', prop('pa', 'P2001', 'Secret owner listing'));
  await sync(owner.store, cloud);
  agent.store.upsert('properties', prop('pg', 'G2001', 'Agent listing'));
  await sync(agent.store, cloud);
  const cf = agent.store.getState().meta.conflicts?.[0];
  assert.equal(cf?.kind, 'reference');
  assert.equal(cf?.ref?.otherVisible, false);
  assert.equal(cf?.ref?.otherId, undefined);
  assert.equal(cf?.ref?.otherTitle, undefined);
  assert.equal(get(agent.store as never, 'x'), undefined);
});

test('P2-18 concurrent syncs of the same number: exactly one wins', async () => {
  const cloud = new FakeCloud();
  const a = await phone(cloud, 'o@x.c'); const b = await phone(cloud, 'o@x.c'); const c = await phone(cloud, 'o@x.c');
  a.store.upsert('properties', prop('p1', 'P3001')); b.store.upsert('properties', prop('p2', 'A3001')); c.store.upsert('properties', prop('p3', 'X3001'));
  await Promise.all([sync(a.store, cloud), sync(b.store, cloud), sync(c.store, cloud)]);
  const winners = [...cloud.rows.keys()].filter(k => k.includes('|properties|'));
  assert.equal(winners.length, 1);
  const losers = [a, b, c].filter(p => (p.store.getState().meta.conflicts ?? []).length === 1);
  assert.equal(losers.length, 2);
  for (const p of losers) assert.equal(p.store.getState().properties.length, 1, 'their local record is kept');
});

test('P2-19 editing a property without touching its number still syncs; moving to a free number frees the old one', async () => {
  const cloud = new FakeCloud();
  const a = await phone(cloud, 'o@x.c');
  a.store.upsert('properties', prop('p1', 'P4001'));
  await sync(a.store, cloud);
  a.store.upsert('properties', { ...a.store.getState().properties[0], headline: 'Renamed house' });
  await sync(a.store, cloud);
  assert.equal(cloud.rows.get('ws1|properties|p1')!.rev, 2);
  a.store.upsert('properties', { ...a.store.getState().properties[0], ref: 'P4002', refNo: 4002 } as Listing);
  a.store.upsert('properties', prop('p2', 'A4001'));            // the old number is free for another property
  await sync(a.store, cloud);
  assert.equal(cloud.rows.has('ws1|properties|p2'), true);
});

// ---------- history on the phone while syncing ----------
test('P2-20 a cloud change that replaces an unchanged local copy keeps the replaced version in the history', async () => {
  const cloud = new FakeCloud();
  const a = await phone(cloud, 'o@x.c'); const b = await phone(cloud, 'o@x.c');
  a.store.upsert('contacts', contact('c1', 'Ahmad'));
  await sync(a.store, cloud); await sync(b.store, cloud);
  a.store.upsert('contacts', { ...get(a.store, 'c1')!, name: 'Ahmad Zain' });
  await sync(a.store, cloud); await sync(b.store, cloud);
  assert.equal(get(b.store, 'c1')?.name, 'Ahmad Zain');
  const hist = await b.store.revisions('contacts:c1');
  assert.ok(hist.some(h => (h.data as Contact).name === 'Ahmad' && h.source === 'cloud'), 'the version replaced by the cloud is recoverable');
});

test('P2-21 a different team workspace is refused while this phone still holds the old team\'s records (nothing is sent)', async () => {
  const cloud = new FakeCloud();
  const a = await phone(cloud, 'o@x.c');
  a.store.upsert('contacts', contact('c1', 'Ahmad'));
  await sync(a.store, cloud);
  assert.equal(a.store.getState().meta.syncWorkspaceId, 'ws1');
  cloud.ws = 'ws2';
  a.store.upsert('contacts', { ...get(a.store, 'c1')!, notes: 'x' });
  await assert.rejects(() => sync(a.store, cloud), /other-workspace/);
  assert.equal(a.store.getState().meta.syncWorkspaceId, 'ws1', 'the phone still knows whose records these are');
  assert.equal(cloud.rows.has('ws2|contacts|c1'), false, 'nothing was written to the other team');
  assert.deepEqual(a.store.getState().meta.dirty, ['contacts:c1'], 'the edit is still waiting');
});
