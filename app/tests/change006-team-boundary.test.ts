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
import { sendInvite, acceptInvite, refreshTeam, setShares, leaveTeam } from '../src/team/api';
import type { Listing } from '../src/listing/model';
import { FakeCloud, cfg as cfg2, phone } from './support/fakeCloud';
import { FakeTeamCloud, cfg, agentPhone } from './support/fakeTeamCloud';

const blob = (s: string, type = 'image/jpeg') => new Blob([s], { type });

test('TB1 a confidential document is never uploaded to the shared bucket, however often the owner syncs; the phone keeps it; ordinary files still go', async () => {
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
    assert.ok(![...cloud.objects.keys()].some(k => k.endsWith(sha)), 'no confidential object in the bucket');
    assert.ok(!cloud.files.has(id), 'no file row anyone could follow');
    assert.equal(await (await a.store.getFile(id))!.text(), text, 'the phone keeps its copy');
  }
  const sum = recordFileSummary(a.store, 'properties', 'p1');
  assert.equal(sum.ownerOnly, 2); assert.equal(sum.uploaded, 1); assert.equal(sum.waiting, 0, 'never shown as waiting to upload');
});

test('TB2 sharing a property (View and Edit) never gives the other agent its confidential documents; revoking and leaving remove the shared record', async () => {
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
  assert.ok(!seen.some(u => u.includes(deed)), 'B\'s phone never even asks for it');
  assert.equal(recordFileSummary(b.store, 'properties', 'p1').ownerOnly, 1, 'B sees it is the owner\'s confidential document');
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
