// Phase 2: photo / document sync against the stand-in cloud (same rules as the SQL + private bucket policies).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/data/store';
import { syncNow } from '../src/data/sync';
import { recordFileSummary, retryFile } from '../src/data/filesync';
import { fileRefs } from '../src/data/fileRefs';
import { saveStateFromStore, pendingFileCount } from '../src/data/savestate';
import { sha256Hex } from '../src/data/hash';
import type { Listing } from '../src/listing/model';
import { FakeCloud, cfg, phone } from './support/fakeCloud';

const blobOf = (text: string, type = 'image/jpeg') => new Blob([text], { type });
const prop = (id: string, ref: string, fileIds: string[] = [], headline = 'House'): Listing => ({
  id, created: 1, updated: 1, headline, ref, refPrefix: ref.replace(/\d+/g, ''), refNo: Number(ref.replace(/\D/g, '')),
  photos: fileIds.map((f, i) => ({ id: `ph${i}-${f}`, fileId: f, name: `${f}.jpg` })), documents: [],
} as unknown as Listing);
const withPhoto = async (s: Store, id: string, ref: string, text: string) => {
  const fid = await s.putFile(blobOf(text));
  s.upsert('properties', prop(id, ref, [fid]));
  return fid;
};
const later = (ms: number) => ({ now: () => Date.now() + ms });
const text = async (s: Store, id: string) => (await s.getFile(id))?.text();

test('F1 a photo is uploaded after its record, into the private path <workspace>/<sha256>, and stays on the phone', async () => {
  const cloud = new FakeCloud();
  const a = await phone(cloud, 'o@x.c');
  const fid = await withPhoto(a.store, 'p1', 'P1001', 'photo-bytes-1');
  const r = await syncNow(a.store, cfg, cloud.fetch);
  assert.equal(r.filesUp, 1);
  const sha = await sha256Hex(blobOf('photo-bytes-1'));
  assert.ok(cloud.objects.has(`ws1/${sha}`));
  const row = cloud.files.get(fid)!;
  assert.equal(row.status, 'uploaded'); assert.equal(row.collection, 'properties'); assert.equal(row.record_id, 'p1'); assert.equal(row.sha256, sha);
  assert.equal(a.store.fileEntry(fid)?.status, 'uploaded');
  assert.equal(await text(a.store, fid), 'photo-bytes-1', 'the phone keeps its copy');
  assert.equal(recordFileSummary(a.store, 'properties', 'p1').uploaded, 1);
  assert.equal(saveStateFromStore(a.store), 'synced');
});

test('F2 a failed upload keeps the phone copy, is not called synced, and a later retry succeeds without a second upload', async () => {
  const cloud = new FakeCloud();
  const a = await phone(cloud, 'o@x.c');
  const fid = await withPhoto(a.store, 'p1', 'P1001', 'bytes-2');
  cloud.failNext('/storage/v1/object', 1, 'before');
  const r1 = await syncNow(a.store, cfg, cloud.fetch);
  assert.equal(r1.filesUp, 0); assert.equal(r1.filesFailed, 1);
  assert.equal(a.store.fileEntry(fid)?.status, 'pending');
  assert.equal(a.store.fileEntry(fid)?.tries, 1);
  assert.equal(await text(a.store, fid), 'bytes-2', 'never deleted after a failed upload');
  assert.equal(pendingFileCount(a.store), 1);
  assert.notEqual(saveStateFromStore(a.store), 'synced', 'a pending upload is not "Synced"');
  await syncNow(a.store, cfg, cloud.fetch);                                   // too soon: waits
  assert.equal(cloud.uploads, 0);
  const r2 = await syncNow(a.store, cfg, cloud.fetch, later(120_000));
  assert.equal(r2.filesUp, 1);
  assert.equal(cloud.uploads, 1);
  assert.equal(saveStateFromStore(a.store), 'synced');
});

test('F3 an interrupted upload (content arrived, answer lost) is finished by the retry with no duplicate object', async () => {
  const cloud = new FakeCloud();
  const a = await phone(cloud, 'o@x.c');
  const fid = await withPhoto(a.store, 'p1', 'P1001', 'bytes-3');
  cloud.failNext('/storage/v1/object', 1, 'after');
  await syncNow(a.store, cfg, cloud.fetch);
  assert.equal(cloud.objects.size, 1, 'the cloud already has it');
  assert.notEqual(a.store.fileEntry(fid)?.status, 'uploaded', 'but the phone was not told, so it does not claim it');
  await syncNow(a.store, cfg, cloud.fetch, later(120_000));
  assert.equal(a.store.fileEntry(fid)?.status, 'uploaded');
  assert.equal(cloud.objects.size, 1); assert.equal(cloud.uploads, 1);
  assert.equal(cloud.files.get(fid)!.status, 'uploaded');
});

test('F4 the same picture added twice is stored once (checksum)', async () => {
  const cloud = new FakeCloud();
  const a = await phone(cloud, 'o@x.c');
  await withPhoto(a.store, 'p1', 'P1001', 'same-bytes');
  await withPhoto(a.store, 'p2', 'P1002', 'same-bytes');
  await syncNow(a.store, cfg, cloud.fetch);
  assert.equal(cloud.files.size, 2);
  assert.equal(cloud.objects.size, 1); assert.equal(cloud.uploads, 1);
  assert.ok([...cloud.files.values()].every(f => f.status === 'uploaded'));
});

test('F5 another phone downloads the file under the same id, attached to the right property, checked against its checksum', async () => {
  const cloud = new FakeCloud();
  const a = await phone(cloud, 'o@x.c'); const b = await phone(cloud, 'o@x.c');
  const fid = await withPhoto(a.store, 'p1', 'P1001', 'bytes-5');
  const f2 = await a.store.putFile(blobOf('doc-bytes', 'application/pdf'));
  a.store.upsert('properties', { ...a.store.getState().properties[0], documents: [{ id: 'd1', category: 'other', name: 'tenancy.pdf', fileId: f2, added: 1 }] } as Listing);
  await syncNow(a.store, cfg, cloud.fetch);
  const r = await syncNow(b.store, cfg, cloud.fetch);
  assert.equal(r.filesDown, 2);
  assert.equal(await text(b.store, fid), 'bytes-5');
  assert.equal(await text(b.store, f2), 'doc-bytes');
  const refs = fileRefs(b.store.getState());
  assert.deepEqual(refs.map(x => [x.fileId, x.recordId]).sort(), [[fid, 'p1'], [f2, 'p1']].sort());
  assert.equal(b.store.fileEntry(fid)?.status, 'uploaded');
  assert.equal(recordFileSummary(b.store, 'properties', 'p1').uploaded, 2);
  const url = await b.store.fileUrl(fid);
  assert.ok(url?.startsWith('blob:'));
});

test('F6 a file that is not in the cloud yet shows as waiting, not as an error, and arrives later', async () => {
  const cloud = new FakeCloud();
  const a = await phone(cloud, 'o@x.c'); const b = await phone(cloud, 'o@x.c');
  const fid = await withPhoto(a.store, 'p1', 'P1001', 'bytes-6');
  cloud.failNext('/storage/v1/object', 1, 'before');
  await syncNow(a.store, cfg, cloud.fetch);                        // record is up, file is not
  await syncNow(b.store, cfg, cloud.fetch);
  assert.equal(b.store.getState().properties.length, 1);
  assert.equal(await b.store.getFile(fid), undefined);
  assert.ok(['pending', 'missing'].includes(b.store.fileEntry(fid)!.status));
  await syncNow(a.store, cfg, cloud.fetch, later(120_000));
  await syncNow(b.store, cfg, cloud.fetch);
  assert.equal(await text(b.store, fid), 'bytes-6');
});

test('F7 a missing object or a deleted file never crashes: the picture shows as missing and the record stays usable', async () => {
  const cloud = new FakeCloud();
  const a = await phone(cloud, 'o@x.c'); const b = await phone(cloud, 'o@x.c');
  const fid = await withPhoto(a.store, 'p1', 'P1001', 'bytes-7');
  await syncNow(a.store, cfg, cloud.fetch);
  cloud.objects.clear();                                            // the stored content is gone
  await syncNow(b.store, cfg, cloud.fetch);
  assert.equal(b.store.fileEntry(fid)?.status, 'missing');
  assert.equal(b.store.getState().properties[0].headline, 'House');
  assert.equal(await b.store.fileUrl(fid), undefined);
  cloud.files.get(fid)!.deleted = true;
  await syncNow(b.store, cfg, cloud.fetch);
  assert.equal(b.store.fileEntry(fid)?.status, 'missing');
  assert.equal(saveStateFromStore(b.store) === 'synced', true, '"missing" cannot be fixed by waiting, and does not hold Synced back forever');
});

test('F8 removing a photo keeps the phone copy for 30 days; the cloud row is switched off; deleting then restoring the property brings it back', async () => {
  const cloud = new FakeCloud();
  const a = await phone(cloud, 'o@x.c');
  const fid = await withPhoto(a.store, 'p1', 'P1001', 'bytes-8');
  await syncNow(a.store, cfg, cloud.fetch);
  // the photo is removed from the property
  a.store.upsert('properties', { ...a.store.getState().properties[0], photos: [] });
  a.store.removeFile(fid);
  await syncNow(a.store, cfg, cloud.fetch);
  assert.equal(cloud.files.get(fid)!.deleted, true);
  assert.equal(await text(a.store, fid), 'bytes-8', 'still on the phone');
  await a.store.purgeOld(Date.now() + 10 * 24 * 3600_000);
  assert.equal(await text(a.store, fid), 'bytes-8', 'kept for 30 days');
  await a.store.purgeOld(Date.now() + 31 * 24 * 3600_000);
  assert.equal(await a.store.getFile(fid), undefined, 'and cleared after 30 days');

  // deleting a whole property and restoring it
  const f2 = await withPhoto(a.store, 'p2', 'P1002', 'bytes-8b');
  await syncNow(a.store, cfg, cloud.fetch);
  const p2 = a.store.getState().properties.find(p => p.id === 'p2')!;
  for (const ph of p2.photos) if (ph.fileId) a.store.removeFile(ph.fileId);
  a.store.remove('properties', 'p2');
  await syncNow(a.store, cfg, cloud.fetch);
  assert.equal(cloud.files.get(f2)!.deleted, true);
  const rev = (await a.store.revisions('properties:p2'))[0];
  await a.store.restoreRevision('properties', 'p2', rev.at);
  assert.equal(await text(a.store, f2), 'bytes-8b');
  assert.equal(a.store.fileEntry(f2)?.removedAt, undefined);
  await syncNow(a.store, cfg, cloud.fetch);
  await syncNow(a.store, cfg, cloud.fetch);
  assert.equal(cloud.files.get(f2)!.deleted, false, 'switched back on');
});

test('F9 who may see a file is decided by the database: a person who cannot read the property gets nothing, anywhere', async () => {
  const cloud = new FakeCloud();
  const owner = await phone(cloud, 'o@x.c');
  const agent = await phone(cloud, 'g@x.c', { role: 'agent' });
  const viewer = await phone(cloud, 'v@x.c', { role: 'limited' });
  const fid = await withPhoto(owner.store, 'p1', 'P1001', 'secret-bytes');
  await syncNow(owner.store, cfg, cloud.fetch);
  const sha = await sha256Hex(blobOf('secret-bytes'));
  for (const who of [agent, viewer]) {
    await syncNow(who.store, cfg, cloud.fetch);
    assert.equal(who.store.getState().properties.length, 0);
    assert.equal(await who.store.getFile(fid), undefined);
    const token = who.store.getState().meta.syncSession!.accessToken;
    const direct = await cloud.fetch(`${cfg.supabaseUrl}/storage/v1/object/authenticated/eab-files/ws1/${sha}`, { headers: { authorization: `Bearer ${token}` } });
    assert.ok(direct.status === 404 || direct.status === 403, 'asking for the file directly is refused too');
    const meta = await cloud.fetch(`${cfg.supabaseUrl}/rest/v1/eab_files?select=*`, { headers: { authorization: `Bearer ${token}` } });
    assert.deepEqual(await meta.json(), [], 'and its details are not listed');
  }
  // nobody can add an object without a metadata row they own
  const token = agent.store.getState().meta.syncSession!.accessToken;
  const sneaky = await cloud.fetch(`${cfg.supabaseUrl}/storage/v1/object/eab-files/ws1/${'0'.repeat(64)}`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: blobOf('x') });
  assert.equal(sneaky.status, 403);
});

test('F10 a read-only person cannot upload', async () => {
  const cloud = new FakeCloud();
  const owner = await phone(cloud, 'o@x.c');
  const viewer = await phone(cloud, 'v@x.c', { role: 'limited' });
  await withPhoto(owner.store, 'p1', 'P1001', 'o-bytes');
  await syncNow(owner.store, cfg, cloud.fetch);
  cloud.rows.get('ws1|properties|p1')!.user_id = viewer.store.getState().meta.syncSession!.userId;   // visible to the viewer (assigned)
  const fid = await viewer.store.putFile(blobOf('v-bytes'));
  viewer.store.upsert('properties', prop('pv', 'V1', [fid]));
  const r = await syncNow(viewer.store, cfg, cloud.fetch);
  assert.equal(r.filesUp ?? 0, 0);
  assert.equal(cloud.files.has(fid), false);
  assert.equal(await text(viewer.store, fid), 'v-bytes', 'kept on the phone');
});

test('F11 the file waits until its record is in the cloud and not in conflict', async () => {
  const cloud = new FakeCloud();
  const a = await phone(cloud, 'o@x.c'); const b = await phone(cloud, 'o@x.c');
  a.store.upsert('properties', prop('pa', 'P5001', [], 'Taken first'));
  await syncNow(a.store, cfg, cloud.fetch);
  const fid = await withPhoto(b.store, 'pb', 'A5001', 'bytes-11');          // same number → refused
  await syncNow(b.store, cfg, cloud.fetch);
  assert.equal(b.store.getState().meta.conflicts?.[0]?.kind, 'reference');
  assert.equal(cloud.files.size, 0, 'no file is uploaded for a record the cloud does not have');
  assert.equal(await text(b.store, fid), 'bytes-11');
});

test('F12 a download that does not match its checksum is not kept', async () => {
  const cloud = new FakeCloud();
  const a = await phone(cloud, 'o@x.c'); const b = await phone(cloud, 'o@x.c');
  const fid = await withPhoto(a.store, 'p1', 'P1001', 'good-bytes');
  await syncNow(a.store, cfg, cloud.fetch);
  const key = [...cloud.objects.keys()][0];
  cloud.objects.set(key, blobOf('tampered'));
  await syncNow(b.store, cfg, cloud.fetch);
  assert.equal(await b.store.getFile(fid), undefined);
  assert.equal(b.store.fileEntry(fid)?.status, 'failed');
  assert.equal(b.store.fileEntry(fid)?.lastError, 'checksum');
});

test('F13 large pictures are shrunk for the upload only; the phone keeps the original; "try now" clears a failed state', async () => {
  const cloud = new FakeCloud();
  const a = await phone(cloud, 'o@x.c');
  const fid = await withPhoto(a.store, 'p1', 'P1001', 'X'.repeat(5000));
  const small = blobOf('small-version');
  await syncNow(a.store, cfg, cloud.fetch, { prepare: async () => small });
  assert.equal(cloud.files.get(fid)!.sha256, await sha256Hex(small));
  assert.equal((await text(a.store, fid))!.length, 5000, 'original untouched');

  const b = await phone(cloud, 'p@x.c');
  const f2 = await withPhoto(b.store, 'p2', 'P1002', 'bytes-13');
  for (let i = 0; i < 3; i++) { cloud.failNext('/storage/v1/object', 1, 'before'); await syncNow(b.store, cfg, cloud.fetch, later(i * 3600_000 * 2 + 1)); }
  assert.equal(b.store.fileEntry(f2)?.status, 'failed');
  assert.equal(await text(b.store, f2), 'bytes-13', 'still there after repeated failures');
  retryFile(b.store, f2);
  assert.equal(b.store.fileEntry(f2)?.status, 'pending');
  await syncNow(b.store, cfg, cloud.fetch);
  assert.equal(b.store.fileEntry(f2)?.status, 'uploaded');
});
