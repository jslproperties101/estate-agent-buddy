// Owner decision of 16 Oct 2026: confidential documents ARE in the owner's own backups (backup file, Google Drive folders,
// restore points), but team sharing must never hand them to another agent. The boundary: confidential documents never
// go to the shared Supabase file bucket, where a file is readable by anyone who may read its record
// (supabase/tests/file-access-test.sh proves that rule, and that revoking or leaving ends access to the files that ARE
// in the bucket). Stand-in clouds only; not a live Supabase project, not a phone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { syncNow } from '../src/data/sync';
import { recordFileSummary } from '../src/data/filesync';
import { sha256Hex } from '../src/data/hash';
import { sendInvite, acceptInvite, refreshTeam, setShares, leaveTeam, setConfidential } from '../src/team/api';
import type { Listing } from '../src/listing/model';
import { FakeCloud, cfg as cfg2, phone } from './support/fakeCloud';
import { FakeTeamCloud, cfg, agentPhone } from './support/fakeTeamCloud';

const blob = (s: string, type = 'image/jpeg') => new Blob([s], { type });

test('TB1 JoyChange010-05: confidential documents are uploaded like every other file (the database decides who may read them); the phone keeps its copy', async () => {
  const cloud = new FakeCloud();
  const a = await phone(cloud, 'o@x.c');
  const photo = await a.store.putFile(blob('PHOTO-1'));
  const deed = await a.store.putFile(blob('%PDF-title-deed', 'application/pdf'));
  const ic = await a.store.putFile(blob('IC-SCAN-OWNER'));
  a.store.upsert('properties', { id: 'p1', created: 1, updated: 1, ref: 'P1001', refPrefix: 'P', refNo: 1001, photos: [{ id: 'ph', fileId: photo, name: 'front.jpg' }],
    documents: [{ id: 'd1', category: 'title', name: 'Geran.pdf', fileId: deed, added: 1 }, { id: 'd2', category: 'correspondence', name: 'Owner IC.jpg', fileId: ic, added: 2 }] } as unknown as Listing);
  for (let i = 0; i < 3; i++) await syncNow(a.store, cfg2, cloud.fetch);
  const photoSha = await sha256Hex(blob('PHOTO-1'));
  assert.ok([...cloud.objects.keys()].some(k => k.endsWith(photoSha)), 'the ordinary photo is in the cloud');
  for (const [id, text] of [[deed, '%PDF-title-deed'], [ic, 'IC-SCAN-OWNER']]) {
    const sha = await sha256Hex(blob(text));
    assert.ok([...cloud.objects.keys()].some(k => k.endsWith(sha)), 'the confidential document is in the cloud');
    assert.ok([...cloud.files.keys()].some(k => k.includes(id)), 'with its file row');
    assert.equal(await (await a.store.getFile(id))!.text(), text, 'the phone keeps its copy');
  }
  const sum = recordFileSummary(a.store, 'properties', 'p1');
  assert.equal(sum.ownerOnly, 0); assert.equal(sum.uploaded, 3); assert.equal(sum.waiting, 0);
});

test('TB2 sharing a property without "Include confidential documents" never gives the other agent its title deed (padlock, not an error); the switch is the owner\'s; revoking and leaving remove the shared record', async () => {
  const cloud = new FakeTeamCloud();
  const a = await agentPhone(cloud, 'aina@x.com', 'Aina');
  const b = await agentPhone(cloud, 'badrul@x.com', 'Badrul');
  const seen: string[] = [];
  const bFetch = (async (url: string, init?: RequestInit) => { seen.push(url); return cloud.fetch(url, init); }) as typeof fetch;
  const deed = await a.store.putFile(blob('%PDF-title-deed', 'application/pdf'));
  a.store.upsert('properties', { id: 'p1', created: 1, updated: 1, headline: 'Shop lot', photos: [], documents: [{ id: 'd1', category: 'title', name: 'Geran.pdf', fileId: deed, added: 1 }] } as unknown as Listing);
  await syncNow(a.store, cfg, cloud.fetch); await syncNow(b.store, cfg, bFetch);
  const inv = await sendInvite(a.store, cfg, 'badrul@x.com', cloud.fetch);
  await acceptInvite(b.store, cfg, { token: inv.token }, bFetch);
  await refreshTeam(a.store, cfg, cloud.fetch);
  await setShares(a.store, cfg, [{ collection: 'properties', id: 'p1', level: 'edit' }], cloud.fetch);
  await syncNow(b.store, cfg, bFetch); await syncNow(b.store, cfg, bFetch);
  assert.ok(b.store.getState().properties.some(p => p.id === 'p1'), 'B has the shared record');
  assert.equal(await b.store.hasFile(deed), false, 'but not its title deed');
  // the database does not list the file for B (JoyChange010-05): a padlock, never a "missing" problem
  assert.deepEqual({ s: b.store.fileEntry(deed)?.status, why: b.store.fileEntry(deed)?.lastError }, { s: 'denied', why: 'confidential' });
  // the switch: only the owner turns it on, it is listed for the share screen, and it is in the history
  await assert.rejects(setConfidential(b.store, cfg, 'p1', true, bFetch));
  assert.equal(await setConfidential(a.store, cfg, 'p1', true, cloud.fetch), true);
  assert.deepEqual(a.store.getState().meta.team?.confidential, { all: false, records: [`${a.store.getState().meta.syncSession!.workspaceId}:p1`] });
  assert.ok(cloud.audit.some(e => (e.detail as { event?: string })?.event === 'confidential_on'));
  await setConfidential(a.store, cfg, null, true, cloud.fetch);
  assert.equal(a.store.getState().meta.team?.confidential?.all, true);
  await setConfidential(a.store, cfg, 'p1', false, cloud.fetch); await setConfidential(a.store, cfg, null, false, cloud.fetch);
  assert.deepEqual(a.store.getState().meta.team?.confidential, { all: false, records: [] });
  // revoked
  await setShares(a.store, cfg, [{ collection: 'properties', id: 'p1', level: null }], cloud.fetch);
  await syncNow(b.store, cfg, bFetch);
  assert.ok(!b.store.getState().properties.some(p => p.id === 'p1'), 'revoking removes the record from B');
  // shared again, then B leaves the Team Workspace
  await setShares(a.store, cfg, [{ collection: 'properties', id: 'p1', level: 'view' }], cloud.fetch);
  await syncNow(b.store, cfg, bFetch);
  assert.ok(b.store.getState().properties.some(p => p.id === 'p1'));
  await leaveTeam(b.store, cfg, bFetch);
  await syncNow(b.store, cfg, bFetch);
  assert.ok(!b.store.getState().properties.some(p => p.id === 'p1'), 'leaving removes it too');
  assert.equal(await (await a.store.getFile(deed))!.text(), '%PDF-title-deed', 'the owner keeps everything');
});
