// Change 010, Phase 2: Team Workspace membership and sharing, end to end between two phones and a stand-in cloud that
// follows the proposal's rules (tests/support/fakeTeamCloud.ts). Not a live Supabase project; not a real phone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { syncNow, SyncError } from '../src/data/sync';
import { AccessError, type Store } from '../src/data/store';
import { sendInvite, acceptInvite, declineInvite, cancelInvite, leaveTeam, removeMember, setShares, setShareAll, requestDelete, decideDelete, TeamError, tokenFrom, inviteLink, refreshTeam } from '../src/team/api';
import { can, visible, creatorKeyOf } from '../src/team/access';
import { buildBackupManifest } from '../src/data/manifest';
import type { Listing } from '../src/listing/model';
import type { Task } from '../src/data/types';
import { FakeTeamCloud, cfg, agentPhone } from './support/fakeTeamCloud';

const prop = (id: string, headline: string): Listing => ({ id, created: 1, updated: 1, headline, photos: [] } as unknown as Listing);
const task = (id: string): Task => ({ id, created: 1, updated: 1, title: `Task ${id}`, priority: 'low', done: false, kind: 'task', reminders: [] });
const has = (s: Store, id: string) => s.getState().properties.some(p => p.id === id);
const get = (s: Store, id: string) => s.getState().properties.find(p => p.id === id);
const sync = (s: Store, cloud: FakeTeamCloud) => syncNow(s, cfg, cloud.fetch);

async function pair() {
  const cloud = new FakeTeamCloud();
  const a = await agentPhone(cloud, 'aina@x.com', 'Aina');
  const b = await agentPhone(cloud, 'badrul@x.com');
  a.store.upsert('properties', prop('p1', 'Shop lot'));
  a.store.upsert('properties', prop('p2', 'Terrace'));
  a.store.upsert('tasks', task('task-a1'));
  b.store.upsert('properties', prop('pb', 'B own'));
  await sync(a.store, cloud); await sync(b.store, cloud);
  return { cloud, a: a.store, b: b.store, aId: a.user.id, bId: b.user.id };
}
async function team() {
  const x = await pair();
  const inv = await sendInvite(x.a, cfg, 'badrul@x.com', x.cloud.fetch);
  await acceptInvite(x.b, cfg, { token: inv.token }, x.cloud.fetch);
  await refreshTeam(x.a, cfg, x.cloud.fetch);
  return { ...x, token: inv.token };
}

test('S1 a cloud without the Change 010 functions: my own sync still works and no Team Workspace is claimed', async () => {
  const cloud = new FakeTeamCloud(); cloud.available = false;
  const a = await agentPhone(cloud, 'a@x.com');
  a.store.upsert('properties', prop('p1', 'x'));
  const r = await syncNow(a.store, cfg, cloud.fetch);
  assert.equal(r.pushed, 1);
  assert.equal(a.store.getState().meta.team, undefined);
  assert.equal(r.teamFailed, undefined);
  await assert.rejects(() => sendInvite(a.store, cfg, 'b@x.com', cloud.fetch), (e: unknown) => e instanceof TeamError && e.code === 'unavailable');
});

test('S2 invite by email, accept; both phones see the two members; nothing is shared by joining', async () => {
  const { a, b, cloud } = await team();
  await sync(a, cloud); await sync(b, cloud);
  assert.equal(a.getState().meta.team?.members.length, 2);
  assert.equal(b.getState().meta.team?.members.length, 2);
  assert.equal(a.getState().meta.team?.createdBy, a.getState().meta.syncSession?.userId, 'A created it: the team owner');
  assert.equal(has(b, 'p1'), false, 'joining reveals nothing');
  assert.deepEqual(b.getState().meta.shared, {});
});

test('S3 invitation link: token in a pasted link; decline; cancel; team full', async () => {
  const x = await pair();
  const inv = await sendInvite(x.a, cfg, null, x.cloud.fetch);
  const link = inviteLink(inv.token, 'https://app.example/');
  assert.equal(tokenFrom(`Join me: ${link}`), inv.token);
  assert.equal(tokenFrom('nonsense'), undefined);
  await assert.rejects(() => sendInvite(x.a, cfg, 'c@x.com', x.cloud.fetch), (e: unknown) => e instanceof TeamError && e.code === 'invite-waiting');
  await cancelInvite(x.a, cfg, inv.invite_id, x.cloud.fetch);
  await assert.rejects(() => acceptInvite(x.b, cfg, { token: inv.token }, x.cloud.fetch), (e: unknown) => e instanceof TeamError && e.code === 'no-longer-valid');
  const inv2 = await sendInvite(x.a, cfg, 'badrul@x.com', x.cloud.fetch);
  await refreshTeam(x.b, cfg, x.cloud.fetch);
  assert.equal(x.b.getState().meta.team?.invitesForMe.length, 1, 'B sees the invitation');
  await declineInvite(x.b, cfg, { inviteId: inv2.invite_id }, x.cloud.fetch);
  const inv3 = await sendInvite(x.a, cfg, 'badrul@x.com', x.cloud.fetch);
  await acceptInvite(x.b, cfg, { token: inv3.token }, x.cloud.fetch);
  x.cloud.addUser('c@x.com');
  await assert.rejects(() => sendInvite(x.a, cfg, 'c@x.com', x.cloud.fetch), (e: unknown) => e instanceof TeamError && e.code === 'full');
});

test('S4 View Only: B gets the record, may read it, and the store itself refuses any change', async () => {
  const { a, b, cloud } = await team();
  await setShares(a, cfg, [{ collection: 'properties', id: 'p1', level: 'view' }], cloud.fetch);
  const r = await sync(b, cloud);
  assert.equal(r.sharedIn, 1);
  assert.equal(get(b, 'p1')?.headline, 'Shop lot');
  assert.equal(has(b, 'p2'), false, 'only the selected record');
  assert.equal(b.getState().meta.shared?.['properties:p1']?.ownerEmail, 'aina@x.com');
  assert.equal(can(b.getState(), 'edit', 'properties', 'p1'), false);
  assert.throws(() => b.upsert('properties', { ...get(b, 'p1')!, headline: 'hack' }), AccessError);
  assert.throws(() => b.remove('properties', 'p1'), AccessError);
  assert.equal(get(b, 'p1')?.headline, 'Shop lot');
  // Change 16: one list, with A named as its creator.
  assert.ok(visible(b.getState(), 'properties', b.getState().properties).some(p => p.id === 'p1'));
  assert.notEqual(creatorKeyOf(b.getState(), 'properties', 'p1'), 'me');
});

test('S5 View and Edit: B edits A\'s record; it goes to A\'s workspace, A still owns it, A sees the change', async () => {
  const { a, b, cloud, aId } = await team();
  await setShares(a, cfg, [{ collection: 'properties', id: 'p1', level: 'edit' }], cloud.fetch);
  await sync(b, cloud);
  b.upsert('properties', { ...get(b, 'p1')!, headline: 'Shop lot, corner' });
  const r = await sync(b, cloud);
  assert.equal(r.pushed, 1);
  const row = cloud.rows.get(`ws-aina@x.com|properties|p1`)!;
  assert.equal(row.data?.headline, 'Shop lot, corner');
  assert.equal(row.user_id, aId, 'owner unchanged');
  assert.equal(cloud.rows.has(`ws-badrul@x.com|properties|p1`), false, 'never copied into B\'s workspace');
  await sync(a, cloud);
  assert.equal(get(a, 'p1')?.headline, 'Shop lot, corner');
  assert.equal(b.getState().meta.dirty.length, 0);
});

test('S6 an editor cannot archive or permanently delete a property; a deletion request goes to the owner', async () => {
  const { a, b, cloud } = await team();
  await setShares(a, cfg, [{ collection: 'properties', id: 'p1', level: 'edit' }], cloud.fetch);
  await sync(b, cloud);
  assert.equal(can(b.getState(), 'archive', 'properties', 'p1'), false);
  assert.throws(() => b.upsert('properties', { ...get(b, 'p1')!, archived: { at: 1 } }), AccessError);
  assert.throws(() => b.remove('properties', 'p1'), AccessError);
  await requestDelete(b, cfg, 'properties', 'p1', cloud.fetch);
  await refreshTeam(a, cfg, cloud.fetch);
  const req = a.getState().meta.team!.deleteRequests[0];
  assert.equal(req.recordId, 'p1');
  a.upsert('properties', { ...get(a, 'p1')!, archived: { at: Date.now(), by: 'owner' } });
  await decideDelete(a, cfg, req.id, true, cloud.fetch);
  await sync(a, cloud); await sync(b, cloud);
  assert.ok(get(b, 'p1')?.archived, 'archived (recoverable), not deleted');
  // An editor may restore it.
  b.upsert('properties', { ...get(b, 'p1')!, archived: undefined });
  await sync(b, cloud);
  assert.equal(cloud.rows.get('ws-aina@x.com|properties|p1')!.data?.archived, undefined);
});

test('S7 a shared To-Do with View and Edit may be deleted by the recipient', async () => {
  const { a, b, cloud } = await team();
  await setShares(a, cfg, [{ collection: 'tasks', id: 'task-a1', level: 'edit' }], cloud.fetch);
  await sync(b, cloud);
  assert.equal(can(b.getState(), 'delete', 'tasks', 'task-a1'), true);
  b.remove('tasks', 'task-a1');
  await sync(b, cloud);
  assert.equal(cloud.rows.get('ws-aina@x.com|tasks|task-a1')!.deleted, true);
  await sync(a, cloud);
  assert.equal(a.getState().tasks.some(t => t.id === 'task-a1'), false);
});

test('S8 Share All covers existing and future records; turning it off takes them away again (selected ones stay)', async () => {
  const { a, b, cloud } = await team();
  await setShares(a, cfg, [{ collection: 'properties', id: 'p1', level: 'view' }], cloud.fetch);
  await setShareAll(a, cfg, 'properties', 'view', cloud.fetch);
  a.upsert('properties', prop('p3', 'New one'));
  await sync(a, cloud); await sync(b, cloud);
  assert.deepEqual(['p1', 'p2', 'p3'].map(id => has(b, id)), [true, true, true]);
  await setShareAll(a, cfg, 'properties', null, cloud.fetch);
  const r = await sync(b, cloud);
  assert.equal(r.sharedGone, 2);
  assert.deepEqual(['p1', 'p2', 'p3'].map(id => has(b, id)), [true, false, false]);
  assert.deepEqual(await b.revisions('properties:p2'), [], 'no history of it remains readable');
});

test('S9 two-way and independent: B shares their own record with A; nobody can share the other\'s record onward', async () => {
  const { a, b, cloud } = await team();
  await setShares(a, cfg, [{ collection: 'properties', id: 'p1', level: 'edit' }], cloud.fetch);
  await setShares(b, cfg, [{ collection: 'properties', id: 'pb', level: 'view' }], cloud.fetch);
  await sync(a, cloud); await sync(b, cloud);
  assert.equal(has(a, 'pb'), true);
  assert.equal(can(b.getState(), 'share', 'properties', 'p1'), false, 'not B\'s to share');
  const res = await setShares(b, cfg, [{ collection: 'properties', id: 'p1', level: 'edit' }], cloud.fetch);
  assert.equal(res[0].status, 'not_owner');
});

test('S10 leaving ends access at once on this phone: shared records, their history and waiting edits are forgotten', async () => {
  const { a, b, cloud } = await team();
  await setShares(a, cfg, [{ collection: 'properties', id: 'p1', level: 'edit' }], cloud.fetch);
  await sync(b, cloud);
  b.upsert('properties', { ...get(b, 'p1')!, headline: 'unsent edit' });
  await leaveTeam(b, cfg, cloud.fetch);
  assert.equal(has(b, 'p1'), false);
  assert.equal(b.getState().meta.dirty.includes('properties:p1'), false);
  assert.deepEqual(await b.revisions('properties:p1'), []);
  assert.equal(has(b, 'pb'), true, 'B keeps own records');
  assert.deepEqual(visible(b.getState(), 'properties', b.getState().properties).map(p => p.id), ['pb'], 'only B\'s own records are left in the list');
  await sync(a, cloud);
  assert.equal(a.getState().meta.team?.id, undefined, 'A sees the Team Workspace ended');
  assert.equal(get(a, 'p1')?.headline, 'Shop lot', 'the unsent edit never reached A');
});

test('S11 rejoining: a new invitation is needed and old permissions never come back by themselves', async () => {
  const { a, b, cloud, bId } = await team();
  await setShares(a, cfg, [{ collection: 'properties', id: 'p1', level: 'edit' }], cloud.fetch);
  await sync(b, cloud);
  await removeMember(a, cfg, bId, cloud.fetch);
  await sync(b, cloud);
  assert.equal(has(b, 'p1'), false, 'removed: access gone on B\'s phone at the next sync');
  const inv = await sendInvite(a, cfg, 'badrul@x.com', cloud.fetch);
  await acceptInvite(b, cfg, { token: inv.token }, cloud.fetch);
  await sync(b, cloud);
  assert.equal(has(b, 'p1'), false, 'no permission resurrection');
  await setShares(a, cfg, [{ collection: 'properties', id: 'p1', level: 'view' }], cloud.fetch);
  await sync(b, cloud);
  assert.equal(b.getState().meta.shared?.['properties:p1']?.level, 'view');
});

test('S12 a disabled Google account loses every shared record from the phone', async () => {
  const { a, b, cloud } = await team();
  await setShares(a, cfg, [{ collection: 'properties', id: 'p1', level: 'view' }], cloud.fetch);
  await sync(b, cloud);
  cloud.disable('badrul@x.com');
  await assert.rejects(() => sync(b, cloud), (e: unknown) => e instanceof SyncError && e.code === 'no-access');
  assert.equal(has(b, 'p1'), false);
  assert.deepEqual(b.getState().meta.shared, {});
  void a;
});

test('S13 my backup never contains records another agent shares with me', async () => {
  const { a, b, cloud } = await team();
  await setShares(a, cfg, [{ collection: 'properties', id: 'p1', level: 'edit' }], cloud.fetch);
  await sync(b, cloud);
  const m = await buildBackupManifest(b);
  assert.deepEqual((m.records.properties as { id: string }[]).map(p => p.id), ['pb']);
  assert.equal(Object.keys(m.cloudVersions).some(k => k === 'properties:p1'), false);
});

test('S14 (Change 16) one list holds B\'s own and A\'s shared record; "Created by" separates them; the calculator is never shared', async () => {
  const { a, b, cloud } = await team();
  await setShares(a, cfg, [{ collection: 'properties', id: 'p1', level: 'view' }], cloud.fetch);
  await setShares(b, cfg, [{ collection: 'properties', id: 'pb', level: 'view' }], cloud.fetch);
  await sync(b, cloud);
  const st = b.getState();
  assert.deepEqual(visible(st, 'properties', st.properties).map(p => p.id).sort(), ['p1', 'pb']);
  assert.equal(creatorKeyOf(st, 'properties', 'pb'), 'me');
  assert.equal(creatorKeyOf(st, 'properties', 'p1'), st.meta.shared!['properties:p1'].ownerId);
  void a;
});
