// Changes 14, 15 and 16 (owner, 17 Oct 2026): one combined workspace, "Created by" names and filter, and the Team
// Sharing badge. Pure rules on synthetic phones; the cloud's own permission checks are in supabase/tests/change010-test.sh.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyState } from '../src/data/store';
import type { AppState } from '../src/data/types';
import { visible, byCreator, creatorKeyOf, creatorLabel, creatorNames, firstNameOf, otherCreators, can } from '../src/team/access';
import { teamBadgeCount } from '../src/team/TeamEntry';

const ME = 'u-me';
function phone(shared: Record<string, { ownerId: string; ownerName?: string | null; ownerEmail: string; level: 'view' | 'edit' }>, partner?: { userId: string; name?: string; email: string }): AppState {
  const s = emptyState();
  s.meta.syncSession = { accessToken: 'x', refreshToken: 'y', expiresAt: 9e15, email: 'me@x.com', userId: ME, name: 'Mei Ling', workspaceId: 'wsMe' };
  s.properties = [{ id: 'mine', created: 1, updated: 1, photos: [] } as never, ...Object.keys(shared).filter(k => k.startsWith('properties:')).map(k => ({ id: k.split(':')[1], created: 1, updated: 1, photos: [] } as never))];
  s.tasks = Object.keys(shared).filter(k => k.startsWith('tasks:')).map(k => ({ id: k.split(':')[1], created: 1, updated: 1, title: 't', priority: 'low', done: false, kind: 'task', reminders: [] } as never));
  s.meta.shared = Object.fromEntries(Object.entries(shared).map(([k, v]) => [k, { workspaceId: `ws-${v.ownerId}`, ...v }]));
  if (partner) s.meta.team = { id: 't1', createdBy: ME, members: [{ userId: ME, email: 'me@x.com', name: 'Mei Ling' }, partner], invitesSent: [], invitesForMe: [], sharesGiven: [], shareAllGiven: [], shareAllReceived: [], deleteRequests: [], at: 1 };
  return s;
}

test('C16-1 one list: own and shared together, nothing extra visible, access unchanged', () => {
  const s = phone({ 'properties:pa': { ownerId: 'u-aina', ownerName: 'Aina Binti Ali', ownerEmail: 'aina@x.com', level: 'view' } }, { userId: 'u-aina', name: 'Aina Binti Ali', email: 'aina@x.com' });
  assert.deepEqual(visible(s, 'properties', s.properties).map(p => p.id), ['mine', 'pa']);
  assert.equal(can(s, 'edit', 'properties', 'pa'), false, 'View Only stays read-only');
  assert.equal(can(s, 'archive', 'properties', 'pa'), false);
  assert.equal(can(s, 'edit', 'properties', 'mine'), true);
});

test('C15-1 creator names: "You" for mine, first name for others, last-name initial when two first names clash', () => {
  const s = phone({
    'properties:p1': { ownerId: 'u-a1', ownerName: 'Aina Binti Ali', ownerEmail: 'aina@x.com', level: 'view' },
    'properties:p2': { ownerId: 'u-a2', ownerName: 'Aina Rahman', ownerEmail: 'aina.r@x.com', level: 'edit' },
    'properties:p3': { ownerId: 'u-b', ownerName: 'Badrul Hisham', ownerEmail: 'badrul@x.com', level: 'view' },
    'tasks:t1': { ownerId: 'u-c', ownerName: null, ownerEmail: 'chong.wei@x.com', level: 'edit' },
  });
  const names = creatorNames(s);
  assert.equal(names.get('u-a1'), 'Aina A.');
  assert.equal(names.get('u-a2'), 'Aina R.');
  assert.equal(names.get('u-b'), 'Badrul');
  assert.equal(names.get('u-c'), 'chong.wei', 'no name: the part of the e-mail before @');
  assert.equal(creatorLabel(s, 'properties', 'mine', 'You'), 'You');
  assert.equal(creatorLabel(s, 'properties', 'p3', 'You'), 'Badrul');
  assert.equal(creatorLabel(s, 'tasks', 't1', 'Anda'), 'chong.wei');
  assert.equal(firstNameOf('  Siti  Nur ', 'x@y'), 'Siti');
  // the same first name as MINE is not a clash: I am always "You"
  const s2 = phone({ 'properties:p9': { ownerId: 'u-mei', ownerName: 'Mei Tan', ownerEmail: 'mei@x.com', level: 'view' } });
  assert.equal(creatorNames(s2).get('u-mei'), 'Mei');
});

test('C15-2 the "Created by" filter: All, You, or one person; it never shows records that are not on the phone', () => {
  const s = phone({
    'properties:pa': { ownerId: 'u-aina', ownerName: 'Aina', ownerEmail: 'aina@x.com', level: 'view' },
    'properties:pb': { ownerId: 'u-b', ownerName: 'Badrul', ownerEmail: 'b@x.com', level: 'edit' },
  });
  const list = visible(s, 'properties', s.properties);
  assert.deepEqual(byCreator(s, 'properties', list, 'all').map(p => p.id), ['mine', 'pa', 'pb']);
  assert.deepEqual(byCreator(s, 'properties', list, 'me').map(p => p.id), ['mine']);
  assert.deepEqual(byCreator(s, 'properties', list, 'u-aina').map(p => p.id), ['pa']);
  assert.deepEqual(byCreator(s, 'properties', list, 'u-gone').map(p => p.id), []);
  assert.equal(creatorKeyOf(s, 'properties', 'pb'), 'u-b');
  assert.deepEqual(otherCreators(s).map(o => o.id).sort(), ['u-aina', 'u-b']);
});

test('C15-3 alone (no team, nothing shared): nobody else to filter by; my records are labelled "You"', () => {
  const s = phone({});
  assert.deepEqual(otherCreators(s), []);
  assert.equal(creatorLabel(s, 'properties', 'mine', 'You'), 'You');
  // in a Team Workspace with nothing shared yet, the partner is already offered in the filter
  const t = phone({}, { userId: 'u-aina', name: 'Aina', email: 'aina@x.com' });
  assert.deepEqual(otherCreators(t).map(o => o.id), ['u-aina']);
});

test('C14-1 the Team Sharing badge counts invitations for me that can still be answered', () => {
  const s = phone({});
  assert.equal(teamBadgeCount(s), 0);
  s.meta.team = { members: [], invitesSent: [], sharesGiven: [], shareAllGiven: [], shareAllReceived: [], deleteRequests: [], at: 1,
    invitesForMe: [{ id: 'i1', fromEmail: 'a@x.com', createdAt: '', expiresAt: new Date(Date.now() + 86_400_000).toISOString() },
      { id: 'i2', fromEmail: 'b@x.com', createdAt: '', expiresAt: new Date(Date.now() - 1000).toISOString() }] };
  assert.equal(teamBadgeCount(s), 1, 'an expired one is not counted');
});
