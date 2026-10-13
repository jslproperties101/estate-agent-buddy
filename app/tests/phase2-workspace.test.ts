// Switching accounts on one phone must never mix two teams' records. Two stand-in clouds = two team workspaces.
// Nothing here touches a live Supabase project.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/data/store';
import { syncNow, SyncError, holdsOtherWorkspaceData, ownerUnknownWithData, confirmOwner } from '../src/data/sync';
import { MemoryBackend } from '../src/data/backend';
import type { Contact } from '../src/data/types';
import { FakeCloud, cfg, phone } from './support/fakeCloud';

const contact = (id: string, name: string): Contact => ({ id, created: 1, updated: 1, name, roles: ['buyer'] });
const get = (s: Store, id: string) => s.getState().contacts.find(c => c.id === id);

/** Team A's phone, with a second team B ready; the phone signs out of A (as the Sign out button does) and into B. */
async function twoTeams() {
  const cloudA = new FakeCloud(); cloudA.ws = 'wsA';
  const cloudB = new FakeCloud(); cloudB.ws = 'wsB';
  const a = await phone(cloudA, 'a@x.c');
  const b = await phone(cloudB, 'b@x.c');
  await syncNow(a.store, cfg, cloudA.fetch);                 // phone belongs to team A now
  assert.equal(a.store.getState().meta.syncWorkspaceId, 'wsA');
  const signOut = () => { const m = a.store.getState().meta; a.store.setSingleton('meta', { syncSession: undefined, syncError: undefined, syncWorkspaceId: m.syncWorkspaceId ?? m.syncSession?.workspaceId }); };
  const signInB = () => a.store.setSingleton('meta', { syncSession: { ...b.store.getState().meta.syncSession!, workspaceId: 'wsB', workspaceName: 'B', role: 'owner' } });
  return { cloudA, cloudB, a, b, signOut, signInB };
}
const blocked = async (t: Store, cloud: FakeCloud) => {
  const before = cloud.log.length;
  await assert.rejects(() => syncNow(t, cfg, cloud.fetch), (e: unknown) => e instanceof SyncError && e.code === 'other-workspace');
  return cloud.log.slice(before);
};

test('W1 clean records of team A: account B is blocked, sees none of them (gate), and nothing is sent or loaded', async () => {
  const { cloudA, cloudB, a, signOut, signInB } = await twoTeams();
  a.store.upsert('contacts', contact('c1', 'Team A buyer'));
  await syncNow(a.store, cfg, cloudA.fetch);
  assert.deepEqual(a.store.getState().meta.dirty, []);
  signOut(); signInB();
  assert.equal(holdsOtherWorkspaceData(a.store.getState(), 'wsB'), true, 'the gate hides the app');
  const calls = await blocked(a.store, cloudB);
  assert.ok(!calls.some(l => /eab_records|eab_push_records|eab_files|storage/.test(l)), `only the membership check may be asked: ${calls}`);
  assert.equal(cloudB.rows.size, 0, 'nothing reached team B');
  assert.equal(get(a.store, 'c1')?.name, 'Team A buyer', 'team A records are untouched on the phone');
});

test('W2 pending EDIT of team A is never uploaded to team B, and still goes to team A when A signs back in', async () => {
  const { cloudA, cloudB, a, signOut, signInB } = await twoTeams();
  a.store.upsert('contacts', contact('c1', 'Before')); await syncNow(a.store, cfg, cloudA.fetch);
  a.store.upsert('contacts', { ...get(a.store, 'c1')!, name: 'Pending edit' });
  assert.deepEqual(a.store.getState().meta.dirty, ['contacts:c1']);
  signOut(); signInB();
  await blocked(a.store, cloudB);
  assert.equal(cloudB.rows.size, 0);
  assert.deepEqual(a.store.getState().meta.dirty, ['contacts:c1'], 'still waiting');
  // back to team A
  a.store.setSingleton('meta', { syncSession: { ...(await phone(cloudA, 'a@x.c')).store.getState().meta.syncSession!, workspaceId: 'wsA', workspaceName: 'A', role: 'owner' } });
  assert.equal(holdsOtherWorkspaceData(a.store.getState(), 'wsA'), false);
  await syncNow(a.store, cfg, cloudA.fetch);
  assert.equal((cloudA.rows.get(`${cloudA.ws}|contacts|c1`)?.data as Contact | null)?.name, 'Pending edit');
});

test('W3 pending DELETION of team A is never sent to team B (and cannot delete B\'s record with the same id)', async () => {
  const { cloudA, cloudB, a, b, signOut, signInB } = await twoTeams();
  b.store.upsert('contacts', contact('c1', 'Team B own record'));        // team B really has a record with this id
  await syncNow(b.store, cfg, cloudB.fetch);
  a.store.upsert('contacts', contact('c1', 'Team A buyer')); await syncNow(a.store, cfg, cloudA.fetch);
  a.store.remove('contacts', 'c1');
  assert.deepEqual(a.store.getState().meta.tombstones, ['contacts:c1']);
  signOut(); signInB();
  const calls = await blocked(a.store, cloudB);
  assert.ok(!calls.some(l => /eab_push_records|eab_files|storage/.test(l)), `nothing sent to team B: ${calls}`);
  const bRow = cloudB.rows.get('wsB|contacts|c1');
  assert.equal(bRow?.deleted, false, 'team B\'s record was not deleted');
  assert.equal((bRow?.data as Contact).name, 'Team B own record');
  assert.deepEqual(a.store.getState().meta.tombstones, ['contacts:c1'], 'the deletion still waits for team A');
});

test('W4 overlapping record ids: team B\'s record never replaces or merges into team A\'s record on the phone', async () => {
  const { cloudA, cloudB, a, b, signOut, signInB } = await twoTeams();
  b.store.upsert('contacts', contact('same', 'B version')); await syncNow(b.store, cfg, cloudB.fetch);
  a.store.upsert('contacts', contact('same', 'A version')); await syncNow(a.store, cfg, cloudA.fetch);
  a.store.upsert('contacts', { ...get(a.store, 'same')!, name: 'A edited' });
  signOut(); signInB();
  await blocked(a.store, cloudB);
  assert.equal(get(a.store, 'same')?.name, 'A edited');
  assert.equal((cloudB.rows.get('wsB|contacts|same')?.data as Contact).name, 'B version', 'B untouched');
  assert.equal(a.store.getState().meta.syncWorkspaceId, 'wsA', 'the phone still knows whose data this is');
  assert.ok(a.store.getBase('contacts:same'), 'team A\'s cloud versions are not thrown away');
});

test('W5 a phone with only sample data, or one that never synced, signs in to any team as before', async () => {
  const cloudB = new FakeCloud(); cloudB.ws = 'wsB';
  const fresh = await phone(cloudB, 'b@x.c');
  fresh.store.upsert('contacts', contact('mine', 'Entered before first sign-in'));   // never synced: belongs to whoever signs in first
  await syncNow(fresh.store, cfg, cloudB.fetch);
  assert.equal(cloudB.rows.get('wsB|contacts|mine')?.rev, 1);
  const cloudA = new FakeCloud(); cloudA.ws = 'wsA';
  const sampleOnly = await phone(cloudA, 'a@x.c');
  sampleOnly.store.setSingleton('meta', { syncWorkspaceId: 'wsOLD' });
  assert.equal(holdsOtherWorkspaceData(sampleOnly.store.getState(), 'wsA'), false, 'no records at all: nothing to protect');
  await syncNow(sampleOnly.store, cfg, cloudA.fetch);
  assert.equal(sampleOnly.store.getState().meta.syncWorkspaceId, 'wsA');
});

test('W6 same team, different person: allowed (one workspace)', async () => {
  const { cloudA, a } = await twoTeams();
  a.store.upsert('contacts', contact('c1', 'Shared')); await syncNow(a.store, cfg, cloudA.fetch);
  assert.equal(holdsOtherWorkspaceData(a.store.getState(), 'wsA'), false);
});

// ---- Phone last used by Phase 1: no remembered owner (Phase 1 never wrote one down) ----
const seed = (b: MemoryBackend, c: Contact) => b.put(`c:contacts:${c.id}`, c);
/** What a Phase 1 phone looks like on disk: records, an unsent edit, an unsent deletion, lastSync, and no owner. */
async function legacyPhone(opts: { signedInAs?: { workspaceId: string; workspaceName: string }; lastSync?: number | undefined } = {}) {
  const b = new MemoryBackend();
  await seed(b, contact('c1', 'Team A clean')); await seed(b, contact('c2', 'Team A edited, not sent'));
  const session = opts.signedInAs ? { accessToken: 't', refreshToken: 'r', expiresAt: Date.now() + 3_600_000, email: 'a@x.c', userId: 'uA', role: 'owner' as const, ...opts.signedInAs } : undefined;
  await b.put('s:meta', { fired: [], dirty: ['contacts:c2'], tombstones: ['contacts:gone'], lastSync: 'lastSync' in opts ? opts.lastSync : Date.now() - 86_400_000, syncSession: session });
  return Store.open(b);
}
async function joinTeamB() {
  const cloudB = new FakeCloud(); cloudB.ws = 'wsB';
  const tB = await phone(cloudB, 'b@x.c');
  // team B already has a record with the same id as the phone's, and one the phone's tombstone points at
  tB.store.upsert('contacts', contact('c1', 'Team B own')); tB.store.upsert('contacts', contact('gone', 'Team B own, other id use'));
  await syncNow(tB.store, cfg, cloudB.fetch);
  const sessionB = { ...tB.store.getState().meta.syncSession!, workspaceId: 'wsB', workspaceName: 'Team B', role: 'owner' as const };
  return { cloudB, sessionB, rowsBefore: JSON.stringify([...cloudB.rows.entries()]) };
}

test('W7 Phase 1 phone with real records, no remembered owner, a different team signs in: nothing is uploaded or loaded until the owner is confirmed', async () => {
  const store = await legacyPhone();                               // signed out, last synced by Phase 1
  assert.equal(store.getState().meta.syncWorkspaceId, undefined);
  const { cloudB, sessionB, rowsBefore } = await joinTeamB();
  store.setSingleton('meta', { syncSession: sessionB });
  assert.equal(ownerUnknownWithData(store.getState(), 'wsB'), true, 'the gate asks first');
  assert.equal(holdsOtherWorkspaceData(store.getState(), 'wsB'), false);
  const before = cloudB.log.length;
  await assert.rejects(() => syncNow(store, cfg, cloudB.fetch), (e: unknown) => e instanceof SyncError && e.code === 'owner-unknown');
  const calls = cloudB.log.slice(before);
  assert.ok(!calls.some(l => /eab_records|eab_push_records|eab_files|storage/.test(l)), `only the membership check: ${calls}`);
  assert.equal(JSON.stringify([...cloudB.rows.entries()]), rowsBefore, 'team B\'s data is unchanged');
  // everything is still on the phone, nothing cleared
  const m = store.getState().meta;
  assert.deepEqual(m.dirty, ['contacts:c2']); assert.deepEqual(m.tombstones, ['contacts:gone']);
  assert.deepEqual(store.getState().contacts.map(c => c.id).sort(), ['c1', 'c2']);
  assert.equal(m.syncWorkspaceId, undefined, 'ownership is still unknown, not guessed');
  // a second attempt (the one-minute timer) changes nothing either
  await assert.rejects(() => syncNow(store, cfg, cloudB.fetch), /owner-unknown/);
  assert.equal(JSON.stringify([...cloudB.rows.entries()]), rowsBefore);
});

test('W7b after the person confirms, the records belong to that team and sync normally; a third team is then blocked', async () => {
  const store = await legacyPhone();
  const { cloudB, sessionB } = await joinTeamB();
  store.setSingleton('meta', { syncSession: sessionB });
  confirmOwner(store);
  assert.equal(store.getState().meta.syncWorkspaceId, 'wsB');
  assert.equal(ownerUnknownWithData(store.getState(), 'wsB'), false);
  await syncNow(store, cfg, cloudB.fetch);                         // the person said these are team B's
  assert.equal(store.getState().contacts.some(c => c.id === 'c2'), true, 'nothing was dropped');
  assert.equal(holdsOtherWorkspaceData(store.getState(), 'wsC'), true, 'now a third team is blocked');
});

test('W7c "not this team": signing out keeps every record, edit and deletion for the right team', async () => {
  const store = await legacyPhone();
  const { sessionB } = await joinTeamB();
  store.setSingleton('meta', { syncSession: sessionB });
  store.setSingleton('meta', { syncSession: undefined, syncError: undefined });          // what the Sign out button does here
  assert.deepEqual(store.getState().contacts.map(c => c.id).sort(), ['c1', 'c2']);
  assert.deepEqual(store.getState().meta.dirty, ['contacts:c2']); assert.deepEqual(store.getState().meta.tombstones, ['contacts:gone']);
  assert.equal(store.getState().meta.syncWorkspaceId, undefined);
});

test('W8 Phase 1 phone that is STILL signed in when upgraded learns its owner at the first start, so a later switch is blocked', async () => {
  const store = await legacyPhone({ signedInAs: { workspaceId: 'wsA', workspaceName: 'Team A' } });
  assert.equal(store.getState().meta.syncWorkspaceId, 'wsA');
  assert.equal(store.getState().meta.ownerChecked, true);
  const { cloudB, sessionB } = await joinTeamB();
  store.setSingleton('meta', { syncSession: sessionB });                                  // sign-out then sign-in as team B
  assert.equal(holdsOtherWorkspaceData(store.getState(), 'wsB'), true);
  await assert.rejects(() => syncNow(store, cfg, cloudB.fetch), /other-workspace/);
});

test('W8b the one-time step never adopts a team that signed in later: restarting on the question screen does not answer it', async () => {
  const b = new MemoryBackend();
  await seed(b, contact('c1', 'Team A clean'));
  await b.put('s:meta', { fired: [], dirty: [], tombstones: [], lastSync: 1, ownerChecked: true, syncSession: { accessToken: 't', refreshToken: 'r', expiresAt: Date.now() + 3_600_000, email: 'b@x.c', userId: 'uB', workspaceId: 'wsB', workspaceName: 'Team B', role: 'owner' } });
  const store = await Store.open(b);                                                       // restart while team B is signed in
  assert.equal(store.getState().meta.syncWorkspaceId, undefined);
  assert.equal(ownerUnknownWithData(store.getState(), 'wsB'), true);
});

test('W9 genuinely new phones are unchanged: never synced (no lastSync), or only sample data, signs in to the first team without a question', async () => {
  const neverSynced = await legacyPhone({ lastSync: undefined });
  assert.equal(ownerUnknownWithData(neverSynced.getState(), 'wsB'), false);
  const sampleOnly = await phone(new FakeCloud(), 'x@x.c');
  sampleOnly.store.setSingleton('meta', { lastSync: 5 });
  assert.equal(ownerUnknownWithData(sampleOnly.store.getState(), 'wsB'), false, 'no real records: nothing to protect');
});
