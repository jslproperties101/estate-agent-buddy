// Change 010, Phase 1: the access policy every screen, search, export and bulk action uses (src/team/access.ts).
// Pure rules on synthetic records; the cloud's own enforcement is tested in supabase/tests/change010-test.sh.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyState } from '../src/data/store';
import type { AppState, TeamState } from '../src/data/types';
import { can, levelOf, scopesOf, inView, visible, myShareOf, creatorOf, personLabel, labelForUser, isTeamOwner, currentView, SHAREABLE } from '../src/team/access';

const ME = 'u-me', HER = 'u-her';
const team = (patch: Partial<TeamState> = {}): TeamState => ({
  id: 't1', createdBy: ME, members: [{ userId: ME, email: 'me@x.com', name: 'Mei' }, { userId: HER, email: 'her@x.com' }],
  invitesSent: [], invitesForMe: [], sharesGiven: [], shareAllGiven: [], shareAllReceived: [], deleteRequests: [], at: 1, ...patch,
});
function state(patch: (s: AppState) => void = () => {}): AppState {
  const s = emptyState();
  s.meta.syncSession = { accessToken: 'x', refreshToken: 'y', expiresAt: 9e15, email: 'me@x.com', userId: ME, name: 'Mei', workspaceId: 'wsMe' };
  s.properties = [
    { id: 'mine', created: 1, updated: 1, photos: [] } as never,
    { id: 'theirsView', created: 1, updated: 1, photos: [] } as never,
    { id: 'theirsEdit', created: 1, updated: 1, photos: [] } as never,
  ];
  s.contacts = [{ id: 'buyer1', created: 1, updated: 1, name: 'B', roles: ['buyer'] }, { id: 'vendor1', created: 1, updated: 1, name: 'V', roles: ['vendor', 'buyer'] }];
  s.tasks = [{ id: 'herTask', created: 1, updated: 1, title: 'T', priority: 'low', done: false, kind: 'task', reminders: [] }];
  s.calculations = [{ id: 'calc1', created: 1, updated: 1 } as never];
  s.meta.team = team();
  s.meta.shared = {
    'properties:theirsView': { workspaceId: 'wsHer', ownerId: HER, ownerEmail: 'her@x.com', ownerName: 'Hana', level: 'view' },
    'properties:theirsEdit': { workspaceId: 'wsHer', ownerId: HER, ownerEmail: 'her@x.com', ownerName: null, level: 'edit' },
    'tasks:herTask': { workspaceId: 'wsHer', ownerId: HER, ownerEmail: 'her@x.com', level: 'edit' },
  };
  patch(s);
  return s;
}

test('A1 levels: my record = owner, shared-in records = their level, unknown = none', () => {
  const s = state();
  assert.equal(levelOf(s, 'properties', 'mine'), 'owner');
  assert.equal(levelOf(s, 'properties', 'theirsView'), 'view');
  assert.equal(levelOf(s, 'properties', 'theirsEdit'), 'edit');
  assert.equal(levelOf(s, 'properties', 'nope'), null);
});

test('A2 View Only: read, see and export history; nothing else', () => {
  const s = state();
  for (const a of ['view', 'viewAudit', 'exportAudit'] as const) assert.equal(can(s, a, 'properties', 'theirsView'), true, a);
  for (const a of ['edit', 'archive', 'restore', 'deletePermanent', 'requestDelete', 'delete', 'share', 'deleteAudit'] as const) assert.equal(can(s, a, 'properties', 'theirsView'), false, a);
});

test('A3 View and Edit on a property: edit, restore, request deletion; never archive, delete permanently, share onward or delete audit', () => {
  const s = state();
  for (const a of ['view', 'edit', 'restore', 'requestDelete', 'viewAudit', 'exportAudit'] as const) assert.equal(can(s, a, 'properties', 'theirsEdit'), true, a);
  for (const a of ['archive', 'deletePermanent', 'delete', 'share', 'deleteAudit'] as const) assert.equal(can(s, a, 'properties', 'theirsEdit'), false, a);
});

test('A4 a shared To-Do with View and Edit may be deleted by the recipient (but never permanently)', () => {
  const s = state();
  assert.equal(can(s, 'delete', 'tasks', 'herTask'), true);
  assert.equal(can(s, 'deletePermanent', 'tasks', 'herTask'), false);
  assert.equal(can(s, 'requestDelete', 'tasks', 'herTask'), false);
});

test('A5 owner may do everything with own records, and share them only while a partner is in the Team Workspace', () => {
  const s = state();
  for (const a of ['view', 'edit', 'archive', 'restore', 'deletePermanent', 'delete', 'share', 'viewAudit', 'exportAudit', 'deleteAudit'] as const) assert.equal(can(s, a, 'properties', 'mine'), true, a);
  assert.equal(can(s, 'requestDelete', 'properties', 'mine'), false);
  const alone = state(x => { x.meta.team = team({ members: [{ userId: ME, email: 'me@x.com' }] }); });
  assert.equal(can(alone, 'share', 'properties', 'mine'), false);
  const none = state(x => { x.meta.team = undefined; });
  assert.equal(can(none, 'share', 'properties', 'mine'), false);
});

test('A6 the calculator and other kinds are never shareable; sample records are never shared', () => {
  const s = state(x => { (x.properties[0] as { sample?: boolean }).sample = true; });
  assert.equal(can(s, 'share', 'calculations', 'calc1'), false);
  assert.equal(can(s, 'share', 'properties', 'mine'), false);
  assert.deepEqual(SHAREABLE, ['properties', 'contacts', 'tasks', 'appointments']);
});

test('A7 Share All categories: buyers vs vendors by role, a contact can be both', () => {
  assert.deepEqual(scopesOf('contacts', { roles: ['buyer'] }), ['buyers']);
  assert.deepEqual(scopesOf('contacts', { roles: ['landlord', 'tenant'] }), ['buyers', 'vendors']);
  assert.deepEqual(scopesOf('contacts', { roles: ['professional'] }), []);
  assert.deepEqual(scopesOf('calculations', {}), []);
  assert.deepEqual(scopesOf('properties', {}), ['properties']);
});

test('A8 how I share my record: selected and/or Share All, highest level wins', () => {
  const s = state(x => { x.meta.team = team({ sharesGiven: [{ workspaceId: 'wsMe', collection: 'properties', recordId: 'mine', level: 'view' }], shareAllGiven: [{ scope: 'buyers', level: 'edit' }] }); });
  assert.deepEqual(myShareOf(s, 'properties', { id: 'mine' }), { level: 'view', via: ['selected'] });
  assert.deepEqual(myShareOf(s, 'contacts', s.contacts[0]), { level: 'edit', via: ['all'] });
  assert.equal(myShareOf(s, 'properties', { id: 'theirsView' }), null, 'never "my share" of someone else\'s record');
  const s2 = state(x => { x.meta.team = team({ sharesGiven: [{ workspaceId: 'wsMe', collection: 'properties', recordId: 'mine', level: 'view' }], shareAllGiven: [{ scope: 'properties', level: 'edit' }] }); });
  assert.deepEqual(myShareOf(s2, 'properties', { id: 'mine' }), { level: 'edit', via: ['selected', 'all'] });
});

test('A9 Personal Workspace shows only my records; Team Workspace shows what is shared both ways', () => {
  const s = state(x => { x.meta.team = team({ sharesGiven: [{ workspaceId: 'wsMe', collection: 'properties', recordId: 'mine', level: 'view' }] }); });
  assert.deepEqual(s.properties.filter(p => inView(s, 'personal', 'properties', p)).map(p => p.id), ['mine']);
  assert.deepEqual(s.properties.filter(p => inView(s, 'team', 'properties', p)).map(p => p.id), ['mine', 'theirsView', 'theirsEdit']);
  s.settings.workspaceView = 'team';
  assert.equal(currentView(s), 'team');
  assert.deepEqual(visible(s, 'contacts', s.contacts), [], 'contacts not shared yet');
  assert.deepEqual(visible(s, 'calculations', s.calculations), [], 'the calculator is never in the Team Workspace');
  // Leaving the team: the view falls back to Personal by itself.
  s.meta.team = undefined;
  assert.equal(currentView(s), 'personal');
});

test('A10 names fall back to email; creator of a shared record is its owner', () => {
  const s = state();
  assert.equal(personLabel('  ', 'a@b.c'), 'a@b.c');
  assert.equal(personLabel(undefined, undefined), '—');
  assert.deepEqual(creatorOf(s, 'properties', 'theirsEdit'), { name: null, email: 'her@x.com', mine: false });
  assert.equal(creatorOf(s, 'properties', 'mine').mine, true);
  assert.equal(labelForUser(s, HER), 'her@x.com');
  assert.equal(labelForUser(s, ME), 'Mei');
  assert.equal(labelForUser(s, 'u-unknown'), '—');
});

test('A11 the team owner is whoever created the Team Workspace', () => {
  assert.equal(isTeamOwner(state()), true);
  assert.equal(isTeamOwner(state(x => { x.meta.team = team({ createdBy: HER }); })), false);
});

test('A12 access ends the moment the share list drops a record (no stale access)', () => {
  const s = state();
  delete s.meta.shared!['properties:theirsEdit'];
  s.properties = s.properties.filter(p => p.id !== 'theirsEdit');
  assert.equal(levelOf(s, 'properties', 'theirsEdit'), null);
  assert.equal(can(s, 'view', 'properties', 'theirsEdit'), false);
  assert.equal(can(s, 'exportAudit', 'properties', 'theirsEdit'), false);
});
