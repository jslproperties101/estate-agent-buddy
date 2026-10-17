// Change 13: invitation alerts. Stand-in cloud (tests/support/fakeTeamCloud.ts); NOT a live Supabase project, NOT a phone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acceptInvite, declineInvite, sendInvite, cancelInvite } from '../src/team/api';
import { checkInvitations, inviteAlertCount, markAnswersSeen, openInvites, unseenAnswers, PhoneText } from '../src/team/invitations';
import { FakeTeamCloud, cfg, agentPhone } from './support/fakeTeamCloud';

const text: PhoneText = { inviteTitle: 'Team invitation', inviteBody: w => `${w} invited you`, acceptedTitle: 'Accepted', declinedTitle: 'Declined', answerBody: w => `${w} answered` };
const phoneLog = () => { const log: { id: number; title: string; body: string }[] = []; return { log, notify: async (id: number, title: string, body: string) => { log.push({ id, title, body }); return true; } }; };

async function pair() {
  const cloud = new FakeTeamCloud();
  const a = await agentPhone(cloud, 'a@x.com', 'Aina');
  const b = await agentPhone(cloud, 'b@x.com', 'Badrul');
  return { cloud, a, b };
}

test('I1 an invitation found in the cloud is announced on the phone once, counts on the bell, and is listed for the pop-up', async () => {
  const { cloud, a, b } = await pair();
  await sendInvite(a.store, cfg, 'b@x.com', cloud.fetch);
  const p = phoneLog();
  assert.equal(inviteAlertCount(b.store.getState()), 0, 'nothing known before the app looks');
  assert.equal(await checkInvitations(b.store, cfg, text, cloud.fetch, Date.now(), p.notify), true);
  assert.equal(openInvites(b.store.getState()).length, 1);
  assert.equal(inviteAlertCount(b.store.getState()), 1);
  assert.deepEqual(p.log.map(x => [x.title, x.body]), [['Team invitation', 'Aina invited you']]);
  // looking again (next app open, or resume) must not announce it a second time, but it is still there for the pop-up
  await checkInvitations(b.store, cfg, text, cloud.fetch, Date.now(), p.notify);
  assert.equal(p.log.length, 1, 'announced once');
  assert.equal(openInvites(b.store.getState()).length, 1, 'still open: the pop-up returns on every app open');
  // survives closing and reopening the app (the memory of what was announced is stored on the phone)
  const reopened = await (await import('../src/data/store')).Store.open(b.backend);
  await checkInvitations(reopened, cfg, text, cloud.fetch, Date.now(), p.notify);
  assert.equal(p.log.length, 1, 'still once after a restart');
  assert.equal(openInvites(reopened.getState()).length, 1);
});

test('I2 accepted: the invitation leaves the list, the sender is told "accepted" once, and can mark it read', async () => {
  const { cloud, a, b } = await pair();
  await sendInvite(a.store, cfg, 'b@x.com', cloud.fetch);
  await checkInvitations(b.store, cfg, text, cloud.fetch);
  const id = openInvites(b.store.getState())[0].id;
  await acceptInvite(b.store, cfg, { inviteId: id }, cloud.fetch);
  assert.equal(openInvites(b.store.getState()).length, 0, 'answered: no more pop-up');
  const pa = phoneLog();
  await checkInvitations(a.store, cfg, text, cloud.fetch, Date.now(), pa.notify);
  const ans = unseenAnswers(a.store.getState());
  assert.equal(ans.length, 1); assert.equal(ans[0].status, 'accepted'); assert.equal(ans[0].name, 'Badrul');
  assert.equal(inviteAlertCount(a.store.getState()), 1);
  assert.deepEqual(pa.log.map(x => [x.title, x.body]), [['Accepted', 'Badrul answered']]);
  await checkInvitations(a.store, cfg, text, cloud.fetch, Date.now(), pa.notify);
  assert.equal(pa.log.length, 1, 'told once');
  markAnswersSeen(a.store, [ans[0].id]);
  assert.equal(unseenAnswers(a.store.getState()).length, 0);
  assert.equal(inviteAlertCount(a.store.getState()), 0);
  await checkInvitations(a.store, cfg, text, cloud.fetch, Date.now(), pa.notify);
  assert.equal(unseenAnswers(a.store.getState()).length, 0, 'a note that was read does not come back');
  assert.equal(pa.log.length, 1);
});

test('I3 declined: the sender is told "declined"', async () => {
  const { cloud, a, b } = await pair();
  await sendInvite(a.store, cfg, 'b@x.com', cloud.fetch);
  await checkInvitations(b.store, cfg, text, cloud.fetch);
  await declineInvite(b.store, cfg, { inviteId: openInvites(b.store.getState())[0].id }, cloud.fetch);
  const pa = phoneLog();
  await checkInvitations(a.store, cfg, text, cloud.fetch, Date.now(), pa.notify);
  const ans = unseenAnswers(a.store.getState());
  assert.equal(ans.length, 1); assert.equal(ans[0].status, 'declined');
  assert.deepEqual(pa.log.map(x => x[ 'title' as 'title']), ['Declined']);
});

test('I4 cancelled by the sender: the invitation disappears from the other phone at the next look (no pop-up for it)', async () => {
  const { cloud, a, b } = await pair();
  const inv = await sendInvite(a.store, cfg, 'b@x.com', cloud.fetch);
  await checkInvitations(b.store, cfg, text, cloud.fetch);
  assert.equal(openInvites(b.store.getState()).length, 1);
  await cancelInvite(a.store, cfg, inv.invite_id, cloud.fetch);
  await checkInvitations(b.store, cfg, text, cloud.fetch);
  assert.equal(openInvites(b.store.getState()).length, 0);
  assert.equal(inviteAlertCount(b.store.getState()), 0);
});

test('I5 expiry: an invitation past its 7 days is not offered, even before the next look at the cloud', async () => {
  const { cloud, a, b } = await pair();
  await sendInvite(a.store, cfg, 'b@x.com', cloud.fetch);
  await checkInvitations(b.store, cfg, text, cloud.fetch);
  const i = openInvites(b.store.getState())[0];
  assert.equal(openInvites(b.store.getState(), Date.parse(i.expiresAt) + 1000).length, 0);
  assert.equal(inviteAlertCount(b.store.getState(), Date.parse(i.expiresAt) + 1000), 0);
});

test('I6 cloud unavailable or offline: nothing breaks, nothing is announced, what was known stays', async () => {
  const { cloud, a, b } = await pair();
  await sendInvite(a.store, cfg, 'b@x.com', cloud.fetch);
  await checkInvitations(b.store, cfg, text, cloud.fetch);
  const p = phoneLog();
  cloud.online = false;
  assert.equal(await checkInvitations(b.store, cfg, text, cloud.fetch, Date.now(), p.notify), false);
  assert.equal(openInvites(b.store.getState()).length, 1, 'the last known invitation stays');
  cloud.online = true; cloud.available = false;
  assert.equal(await checkInvitations(b.store, cfg, text, cloud.fetch, Date.now(), p.notify), false, 'Change 010 database part not applied: quietly nothing');
  assert.equal(p.log.length, 0);
  // signed out: nothing is looked up
  const out = await agentPhone(cloud, 'c@x.com');
  out.store.setSingleton('meta', { syncSession: undefined });
  cloud.available = true;
  assert.equal(await checkInvitations(out.store, cfg, text, cloud.fetch), false);
});

test('I7 a project without the Change 13 database update (no invites_answered) still works: invitations for me are found', async () => {
  const { cloud, a, b } = await pair();
  await sendInvite(a.store, cfg, 'b@x.com', cloud.fetch);
  const real = cloud.fetch.bind(cloud);
  const oldDb = async (url: string, init?: RequestInit) => {
    const r = await real(url, init);
    if (!url.endsWith('eab_team_status')) return r;
    const j = await r.json() as Record<string, unknown>; delete j.invites_answered;
    return new Response(JSON.stringify(j), { status: 200 });
  };
  assert.equal(await checkInvitations(b.store, cfg, text, oldDb as typeof fetch), true);
  assert.equal(openInvites(b.store.getState()).length, 1);
  assert.deepEqual(unseenAnswers(b.store.getState()), []);
});
