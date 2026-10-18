// Change 23: faster repeat Drive backups. Fake Drive and in-memory phones; never the real Google Drive.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryBackend } from '../src/data/backend';
import { Store } from '../src/data/store';
import { runDriveBackup } from '../src/backup/drive';
import { DriveClient } from '../src/backup/driveApi';
import { drFolders, listPoints, loadRestorePoint, FULL_EVERY } from '../src/backup/restorePoints';
import { createFakeDrive } from './support/fakeDrive.mjs';

const T0 = Date.UTC(2026, 9, 15, 1, 42, 7);
async function phone(n = 6) {
  const s = await Store.open(new MemoryBackend());
  const ph: { id: string; fileId: string; name: string }[] = [];
  const ids: string[] = [];
  for (let i = 0; i < n; i++) { const f = await s.putFile(new Blob([`PHOTO-${i}-`.repeat(50)], { type: 'image/jpeg' })); ids.push(f); ph.push({ id: 'ph' + i, fileId: f, name: `p${i}.jpg` }); }
  s.upsert('properties', { id: 'p1', created: 10, updated: 10, ref: 'P1', country: 'Malaysia', state: 'NS', city: 'Nilai', township: 'KSM', unitNo: '1', street: 'J', ownerName: 'A', purpose: 'sale', type: 'Terrace', photos: ph, mainPhotoId: 'ph0', documents: [] } as never);
  s.setSingleton('meta', { drive: { token: 'TOK', expiresAt: T0 + 24 * 3600_000 * 30, connectedAt: T0 }, dirty: [], tombstones: [] });
  await s.flush();
  // count how many files are really read
  let reads = 0; const orig = s.getFile.bind(s);
  s.getFile = async (id: string) => { const b = await orig(id); if (!b) return b; return new Proxy(b, { get(t, k) { if (k === 'arrayBuffer') return () => { reads++; return t.arrayBuffer(); }; const v = (t as never)[k]; return typeof v === 'function' ? v.bind(t) : v; } }) as Blob; };
  return { s, ids, reads: () => reads, reset: () => { reads = 0; } };
}
const run = (s: Store, d: ReturnType<typeof createFakeDrive>, i: number) => runDriveBackup(s, d.fetchFn as never, T0 + i * 60_000, { force: true, tree: false });

test('F1 the first backup reads every file; the next ones read none and upload none', async () => {
  const p = await phone(); const d = createFakeDrive();
  const r1 = await run(p.s, d, 0);
  assert.ok(r1.ok); assert.equal(r1.point!.full, true); assert.equal(r1.point!.readFiles, 6); assert.equal(r1.point!.uploadedObjects, 6);
  p.reset(); d.calls.length = 0;
  const r2 = await run(p.s, d, 1);
  assert.ok(r2.ok); assert.equal(r2.point!.full, false);
  assert.equal(r2.point!.readFiles, 0, 'no photo read or checksummed again');
  assert.equal(r2.point!.uploadedObjects, 0);
  assert.equal(p.reads(), 0);
});

test('F2 a photo added later is the only one read and uploaded', async () => {
  const p = await phone(); const d = createFakeDrive();
  await run(p.s, d, 0);
  const f = await p.s.putFile(new Blob(['NEW-PHOTO'], { type: 'image/jpeg' }));
  const prop = p.s.getState().properties.find(x => x.id === 'p1') as never as { photos: unknown[] };
  p.s.upsert('properties', { ...prop, photos: [...prop.photos, { id: 'phN', fileId: f, name: 'new.jpg' }], updated: 11 } as never);
  await p.s.flush(); p.reset();
  const r = await run(p.s, d, 1);
  assert.equal(r.point!.readFiles, 1); assert.equal(r.point!.uploadedObjects, 1); assert.equal(p.reads(), 2, 'read once to checksum and once to upload');
});

test('F3 a photo removed from Drive (or the wrong size there) is uploaded again, never trusted', async () => {
  const p = await phone(); const d = createFakeDrive();
  await run(p.s, d, 0);
  const objs = d.paths().filter(x => x.includes('/Objects/')); assert.equal(objs.length, 6);
  const gone = d.fileAt(objs[0])!; gone.trashed = true;
  const cut = d.fileAt(objs[1])!; cut.data = cut.data.slice(0, 5); cut.version++;
  const r = await run(p.s, d, 1);
  assert.ok(r.ok); assert.equal(r.point!.uploadedObjects, 2);
  assert.equal(r.point!.readFiles, 0, 'checksums still trusted; only the two files are read to upload them');
  const f = await drFolders(new DriveClient(d.fetchFn as never, 'TOK'));
  const { complete } = await listPoints(new DriveClient(d.fetchFn as never, 'TOK'), f);
  const prev = await loadRestorePoint(new DriveClient(d.fetchFn as never, 'TOK'), f, complete[0]);
  assert.deepEqual('problem' in prev ? prev.problem : null, null, 'the newest restore point still checks out whole');
});

test('F4 a photo whose size changed on the phone is checksummed again', async () => {
  const p = await phone(); const d = createFakeDrive();
  await run(p.s, d, 0);
  await p.s.putFileAs(p.ids[0], new Blob(['A DIFFERENT, LONGER PHOTO BODY'], { type: 'image/jpeg' }), 'local');
  const r = await run(p.s, d, 1);
  assert.equal(r.point!.readFiles, 1); assert.equal(r.point!.uploadedObjects, 1);
});

test('F5 every 7th restore point is a full re-check that reads every file again', async () => {
  const p = await phone(3); const d = createFakeDrive();
  const fulls: boolean[] = [];
  for (let i = 0; i < FULL_EVERY + 2; i++) { const r = await run(p.s, d, i); fulls.push(r.point!.full); if (r.point!.full) assert.equal(r.point!.readFiles, 3); else assert.equal(r.point!.readFiles, 0); }
  assert.deepEqual(fulls, [true, false, false, false, false, false, false, true, false]);
});

test('F6 a full re-check catches a saved checksum that no longer matches the phone', async () => {
  const p = await phone(3); const d = createFakeDrive();
  await run(p.s, d, 0);
  // same size, different content: the saved checksum is now wrong, only the full re-check can notice
  await p.s.putFileAs(p.ids[0], new Blob(['X'.repeat(`PHOTO-0-`.repeat(50).length)], { type: 'image/jpeg' }), 'local');
  for (let i = 1; i < FULL_EVERY; i++) await run(p.s, d, i);
  const r = await run(p.s, d, FULL_EVERY);
  assert.equal(r.point!.full, true); assert.equal(r.point!.readFiles, 3); assert.equal(r.point!.uploadedObjects, 1, 'the changed photo is saved');
});
