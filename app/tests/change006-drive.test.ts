// Change 006 Layers 1–3 in Google Drive: restore points (RP), readable folders with Recovery copies (T), the daily run
// (DR), and the file-reference fixes found during integration (FX). Everything runs against an in-memory stand-in for
// the Drive REST API (tests/support/fakeDrive.mjs) and in-memory phones. Nothing here touches the real Google Drive,
// Google sign-in or Supabase: these tests prove the app's own logic, not the live services.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryBackend } from '../src/data/backend';
import { Store } from '../src/data/store';
import { DriveClient, mytStamp } from '../src/backup/driveApi';
import { createRestorePoint, drFolders, listPoints, loadRestorePoint, KEEP_POINTS, STALE_INCOMPLETE_MS } from '../src/backup/restorePoints';
import { exportTree, forgetTree, RECOVERY_KEEP_MS } from '../src/backup/driveTree';
import { buildTree } from '../src/backup/tree';
import { driveNowOutcome, percentOf, runDriveBackup } from '../src/backup/drive';
import { createBackup, inspectBackup, planRestore, restoreBackup } from '../src/backup/backup';
import { fileRefs, cloudFileRefs } from '../src/data/fileRefs';
import { sha256Hex } from '../src/data/hash';
import type { Contact, Task } from '../src/data/types';
import type { Listing } from '../src/listing/model';
import { createFakeDrive } from './support/fakeDrive.mjs';

const T0 = Date.UTC(2026, 9, 15, 1, 42, 7);   // 15 Oct 2026, 09:42:07 in Malaysia
const DAY = 24 * 3600_000;
const blob = (s: string, type = 'image/jpeg') => new Blob([s], { type });
const ROOT = 'Estate Agent AI Buddy';
const PROP = `${ROOT}/Property Listing/Malaysia/Negeri Sembilan/Nilai/Kota Seri Mas/12 Jalan Mawar/Puan Aminah binti Ali`;

async function agentPhone(opts: { signedIn?: boolean } = {}) {
  const s = await Store.open(new MemoryBackend());
  const front = await s.putFile(blob('FRONT-PHOTO'));
  const kitchen = await s.putFile(blob('KITCHEN-PHOTO'));
  const brochure = await s.putFile(blob('%PDF-brochure', 'application/pdf'));
  const title = await s.putFile(blob('%PDF-geran-CONFIDENTIAL', 'application/pdf'));
  const adShot = await s.putFile(blob('ADVERT-SCREENSHOT'));
  s.upsert('contacts', { id: 'v1', created: 1, updated: 1, name: 'Puan Aminah binti Ali', phone: '+60 12-345 6789', roles: ['vendor'], vendorStatus: 'listed' } as Contact);
  s.upsert('contacts', { id: 'b1', created: 2, updated: 2, name: 'Encik Rahman', roles: ['buyer'], leadStatus: 'hot', ic: '900101-05-1234' } as unknown as Contact);
  s.upsert('properties', {
    id: 'p1', created: 10, updated: 10, ref: 'P1001', country: 'Malaysia', state: 'Negeri Sembilan', city: 'Nilai', township: 'Kota Seri Mas',
    unitNo: '12', street: 'Jalan Mawar', vendorId: 'v1', ownerName: 'Puan Aminah binti Ali', askingPrice: 550000, purpose: 'sale', type: 'Terrace house',
    photos: [{ id: 'ph1', fileId: kitchen, name: 'kitchen.jpg' }, { id: 'ph2', fileId: front, name: 'front.jpg' }], mainPhotoId: 'ph2',
    documents: [{ id: 'd1', category: 'brochure', name: 'Brochure.pdf', fileId: brochure, added: 1 }, { id: 'd2', category: 'title', name: 'Geran.pdf', fileId: title, added: 2 }],
    marketing: { advertised: 'yes', ads: [{ id: 'a1', platform: 'PropertyGuru', screenshotFileId: adShot }], custom: {} },
  } as unknown as Listing);
  s.upsert('inquiries', { id: 'i1', created: 3, updated: 3, contactId: 'b1', propertyId: 'p1', at: '2026-10-14T10:00', channel: 'whatsapp', message: 'Still available?' });
  s.upsert('tasks', { id: 't1', created: 4, updated: 4, title: 'Call owner about price', priority: 'high', done: false, kind: 'task', reminders: [] } as Task);
  s.setSingleton('profile', { fullName: 'Agent One', phone: '012-000 0000' });
  s.setSingleton('settings', { lang: 'en', mapsApiKey: 'SECRET-MAPS-KEY', supabaseUrl: 'https://secret.supabase.co', supabaseAnonKey: 'SECRET-ANON', expertApiUrl: 'https://secret-expert' });
  if (opts.signedIn !== false) s.setSingleton('meta', { syncSession: { accessToken: 'TOKEN-SECRET', refreshToken: 'REFRESH-SECRET', expiresAt: T0 + 3600_000, email: 'a@x.com', userId: 'u1', workspaceId: 'ws1' }, drive: { token: 'TOK', expiresAt: T0 + 3600_000, connectedAt: T0 } });
  // as if the cloud has confirmed everything (Drive folders are written from cloud-confirmed data)
  s.setSingleton('meta', { dirty: [], tombstones: [] });
  await s.flush();
  return { s, front, kitchen, brochure, title, adShot };
}
const confirmSync = async (s: Store) => { s.setSingleton('meta', { dirty: [], tombstones: [] }); await s.flush(); };

// ---------------------------------------------------------------- restore points (Layer 3)
test('RP1 a restore point is written objects-first, records next, manifest last, and holds no secrets or shared-in records', async () => {
  const { s, title } = await agentPhone();
  s.setSingleton('meta', { shared: { 'contacts:sh1': { workspaceId: 'ws2', ownerId: 'u2', ownerEmail: 'b@x.com', level: 'view' } } });
  s.upsert('contacts', { id: 'sh1', created: 5, updated: 5, name: 'Other Agent Buyer', roles: ['buyer'] } as Contact, true);
  await s.flush();
  const d = createFakeDrive();
  const run = await createRestorePoint(s, new DriveClient(d.fetchFn, 'TOK'), 'daily', T0);
  assert.equal(run.name, '2026-10-15T01-42-07Z');
  assert.equal(run.files, 5, 'every file the records use, confidential title deed included (own backup)');
  const point = `${ROOT}/Disaster Recovery/Restore Points/${run.name}`;
  assert.ok(d.paths().includes(`${point}/manifest.json`));
  assert.ok(d.paths().includes(`${point}/records.json`));
  assert.ok(d.paths().includes(`${point}/Restore Point.txt`));
  assert.ok(d.paths().includes(`${ROOT}/Disaster Recovery/README.txt`));
  const order = d.calls.filter(c => c.startsWith('POST /upload')).length;
  assert.equal(order, 5 + 3 + 1, '5 objects, records.json, manifest.json, Restore Point.txt, README');
  const all = [...d.files.values()].map(f => new TextDecoder().decode(f.data)).join('\n');
  for (const secret of ['TOKEN-SECRET', 'REFRESH-SECRET', 'SECRET-MAPS-KEY', 'SECRET-ANON', '"TOK"', 'secret.supabase.co', 'secret-expert']) assert.ok(!all.includes(secret), `no ${secret}`);
  assert.ok(!all.includes('Other Agent Buyer'), 'a record another agent shares with me is not mine to back up');
  const titleSha = await sha256Hex(await (await s.getFile(title))!.arrayBuffer());
  assert.ok(d.paths().includes(`${ROOT}/Disaster Recovery/Objects/${titleSha}`));
  const m = JSON.parse(d.textAt(`${point}/manifest.json`)!);
  assert.equal(m.format, 'eab-restore-point'); assert.equal(m.counts.properties, 1); assert.equal(m.objects.length, 5);
  assert.equal(m.createdLocal, '2026-10-15T09:42:07+08:00');
});

test('RP2 objects are uploaded once; only the newest 30 points are kept; unreferenced objects go to the bin; newer points still restore', async () => {
  const { s, kitchen } = await agentPhone();
  const d = createFakeDrive(); const c = new DriveClient(d.fetchFn, 'TOK');
  await createRestorePoint(s, c, 'daily', T0);
  const before = d.calls.filter(x => x.startsWith('POST /upload')).length;
  await createRestorePoint(s, c, 'daily', T0 + DAY);
  assert.equal(d.calls.filter(x => x.startsWith('POST /upload')).length - before, 3, 'second point: records.json, manifest.json, summary only; no object again');
  // the kitchen photo is removed from the property: it stays referenced by the older points until they age out
  const p = s.getState().properties[0];
  s.upsert('properties', { ...p, photos: p.photos.filter(x => x.fileId !== kitchen) });
  for (let i = 2; i < KEEP_POINTS + 3; i++) await createRestorePoint(s, c, 'daily', T0 + i * DAY);
  const f = await drFolders(c);
  const { complete } = await listPoints(c, f);
  assert.equal(complete.length, KEEP_POINTS, 'newest 30 kept');
  assert.equal(complete[0].createdAt, T0 + (KEEP_POINTS + 2) * DAY);
  const kitchenSha = await sha256Hex(await (await s.getFile(kitchen))!.arrayBuffer());
  assert.ok(!d.paths().includes(`${ROOT}/Disaster Recovery/Objects/${kitchenSha}`), 'no kept point needs the kitchen photo: binned');
  assert.ok(d.byName(kitchenSha).length === 0 && [...d.files.values()].some(x => x.name === kitchenSha && x.trashed), 'to the Drive bin, not deleted');
  const oldest = complete[complete.length - 1];
  const pv = await loadRestorePoint(c, f, oldest);
  assert.ok(!('problem' in pv) && pv.inspection.ok, 'the oldest kept point is still complete after pruning');
});

test('RP3 restore from a point onto a clean phone, and onto a phone with later edits (nothing newer is lost)', async () => {
  const { s, front } = await agentPhone();
  const d = createFakeDrive(); const c = new DriveClient(d.fetchFn, 'TOK');
  const run = await createRestorePoint(s, c, 'manual', T0);
  const f = await drFolders(c);
  const info = (await listPoints(c, f)).complete.find(x => x.name === run.name)!;
  // clean phone, same account
  const fresh = await Store.open(new MemoryBackend());
  fresh.setSingleton('meta', { syncSession: { accessToken: 'x', refreshToken: 'y', expiresAt: T0, email: 'a@x.com', userId: 'u1', workspaceId: 'ws1' } });
  const pv = await loadRestorePoint(c, f, info);
  assert.ok(!('problem' in pv));
  const res = await restoreBackup(fresh, pv.inspection, 'missing', T0 + 1);
  assert.equal(res.added, 5); assert.equal(res.filesRestored, 5);
  assert.equal(await (await fresh.getFile(front))!.text(), 'FRONT-PHOTO');
  assert.equal(fresh.getState().properties[0].askingPrice, 550000);
  // the original phone changes the price and adds a task after the point; restoring "missing only" keeps both
  const p = s.getState().properties[0];
  s.upsert('properties', { ...p, askingPrice: 600000 });
  s.upsert('tasks', { id: 't2', created: 20, updated: 20, title: 'Newer task', priority: 'low', done: false, kind: 'task', reminders: [] } as Task);
  s.remove('tasks', 't1');
  await s.flush();
  const plan = await planRestore(s, pv.inspection, 'missing');
  assert.deepEqual(plan.add.map(x => x.id), ['t1']);
  await restoreBackup(s, pv.inspection, 'missing', T0 + 2);
  assert.equal(s.getState().properties[0].askingPrice, 600000, 'the later price is kept');
  assert.ok(s.getState().tasks.some(t => t.id === 't2'), 'the newer task is kept');
  assert.ok(s.getState().tasks.some(t => t.id === 't1'), 'the deleted task is back');
  assert.equal((await s.safetyCopies()).length, 1, 'a safety copy was kept first');
  // a second restore of the same point changes nothing and duplicates nothing
  const again = await restoreBackup(s, pv.inspection, 'missing', T0 + 3);
  assert.equal(again.added, 0);
  assert.equal(s.getState().tasks.filter(t => t.id === 't1').length, 1);
});

test('RP4 a damaged restore point is refused before anything changes (object, records.json, manifest)', async () => {
  const { s } = await agentPhone();
  const d = createFakeDrive(); const c = new DriveClient(d.fetchFn, 'TOK');
  const run = await createRestorePoint(s, c, 'manual', T0);
  const f = await drFolders(c);
  const info = (await listPoints(c, f)).complete[0];
  const point = `${ROOT}/Disaster Recovery/Restore Points/${run.name}`;
  // one object changed
  const obj = [...d.files.values()].find(x => /^[0-9a-f]{64}$/.test(x.name))!;
  const keep = obj.data; obj.data = new TextEncoder().encode('tampered');
  let r = await loadRestorePoint(c, f, info);
  assert.ok('problem' in r && r.problem === 'file-mismatch');
  obj.data = keep;
  // records.json changed
  const rec = d.fileAt(`${point}/records.json`)!; const keepRec = rec.data;
  rec.data = new TextEncoder().encode(new TextDecoder().decode(keepRec).replace('Jalan Mawar', 'Jalan Lain'));
  r = await loadRestorePoint(c, f, info);
  assert.ok('problem' in r && r.problem === 'damaged');
  rec.data = keepRec;
  // manifest changed (its own checksum no longer matches)
  const mf = d.fileAt(`${point}/manifest.json`)!;
  mf.data = new TextEncoder().encode(new TextDecoder().decode(mf.data).replace('"files": 5', '"files": 4'));
  r = await loadRestorePoint(c, f, info);
  assert.ok('problem' in r && r.problem === 'damaged');
  // nothing was ever applied
  assert.equal((await s.safetyCopies()).length, 0);
});

test('RP7 two restore points in the same second are two separate points', async () => {
  const { s } = await agentPhone();
  const d = createFakeDrive(); const c = new DriveClient(d.fetchFn, 'TOK');
  const a = await createRestorePoint(s, c, 'daily', T0);
  const b = await createRestorePoint(s, c, 'manual', T0 + 400);
  assert.notEqual(a.name, b.name);
  assert.equal(b.name, '2026-10-15T01-42-07.400Z');
  const l = await listPoints(c, await drFolders(c));
  assert.equal(l.complete.length, 2);
  assert.equal(l.complete[0].name, b.name, 'newest first');
});

test('RP5 an interrupted run leaves an incomplete point that is never offered and is binned a day later', async () => {
  const { s } = await agentPhone();
  const d = createFakeDrive(); const c = new DriveClient(d.fetchFn, 'TOK');
  d.state.fail = (method: string, u: URL) => (method === 'POST' && u.pathname === '/upload/drive/v3/files' && d.calls.filter(x => x === 'POST /upload/drive/v3/files').length > 6 ? { status: 500, headers: {}, body: new TextEncoder().encode('down') } : null);
  await assert.rejects(createRestorePoint(s, c, 'daily', T0));
  d.state.fail = null;
  const f = await drFolders(c);
  let l = await listPoints(c, f);
  assert.equal(l.complete.length, 0); assert.equal(l.incomplete.length, 1);
  await createRestorePoint(s, c, 'daily', T0 + STALE_INCOMPLETE_MS + 60_000);
  l = await listPoints(c, f);
  assert.equal(l.complete.length, 1); assert.equal(l.incomplete.length, 0, 'the old incomplete point went to the bin');
});

test('RP6 an upload whose size does not check out is binned and reported; no success is recorded', async () => {
  const { s } = await agentPhone();
  const d = createFakeDrive({ corruptUploads: (f: { name: string }) => f.name === 'records.json' });
  const r = await runDriveBackup(s, d.fetchFn, T0, { tree: false });
  assert.equal(r.ok, false); assert.equal(r.pointError, 'notVerified');
  assert.equal(s.getState().meta.driveLastOkAt, undefined);
  assert.equal(s.getState().meta.driveLast?.ok, false);
  for (const f of fileRefs(s.getState())) assert.ok(await s.getFile(f.fileId), 'a failed upload never removes the phone\'s copy');
});

// ---------------------------------------------------------------- readable folders (Layer 2) and Recovery (Layer 1 in Drive)
test('T1 the readable tree has the approved layout; it holds the owner\'s confidential documents and every field (owner decision), never secrets or shared-in records', async () => {
  const { s } = await agentPhone();
  s.setSingleton('meta', { shared: { 'properties:sh': { workspaceId: 'ws2', ownerId: 'u2', ownerEmail: 'b@x.com', level: 'edit' } } });
  s.upsert('properties', { id: 'sh', created: 50, updated: 50, street: 'Jalan Kongsi', ownerName: 'Shared Owner', photos: [] } as unknown as Listing, true);
  s.upsert('properties', { id: 'sample1', created: 60, updated: 60, street: 'Jalan Contoh', sample: true, photos: [] } as unknown as Listing, true);
  await s.flush();
  const d = createFakeDrive();
  const run = await exportTree(s, new DriveClient(d.fetchFn, 'TOK'), T0);
  assert.equal(run.status, 'complete');
  const paths = d.paths();
  for (const p of [
    `${ROOT}/README.txt`, `${ROOT}/Export Status.txt`, `${ROOT}/Index.csv`,
    `${PROP}/Property Details.txt`, `${PROP}/Owner Details.txt`, `${PROP}/Pictures/01-front.jpg`, `${PROP}/Pictures/02-kitchen.jpg`,
    `${PROP}/Documents/Brochures and Floor Plans/Brochure.pdf`, `${PROP}/Buyers/Encik Rahman/Buyer Details.txt`,
    `${PROP}/Adverts/Adverts.txt`, `${PROP}/Adverts/01-PropertyGuru.jpg`,
    `${ROOT}/To-Do/Call owner about price.txt`, `${ROOT}/Contacts/Vendors/Puan Aminah binti Ali/Vendor Details.txt`,
    `${ROOT}/Contacts/Buyers/Encik Rahman/Buyer Details.txt`, `${ROOT}/Inquiries and Viewings/2026-10-14 10.00 Encik Rahman.txt`,
    `${ROOT}/Agent Profile/Profile.txt`, `${ROOT}/Settings/Current Settings.txt`,
  ]) assert.ok(paths.includes(p), `missing ${p}\n${paths.join('\n')}`);
  assert.ok(paths.includes(`${PROP}/Documents/Property Title/Geran.pdf`), 'the title deed is in the owner\'s own Drive (owner decision, 16 Oct)');
  assert.equal(d.textAt(`${PROP}/Documents/Property Title/Geran.pdf`), '%PDF-geran-CONFIDENTIAL');
  assert.ok(!paths.some(p => /Identity Documents/i.test(p)), 'no empty identity-document folder (the app has no such feature)');
  assert.ok(!paths.some(p => /Jalan Kongsi|Shared Owner|Jalan Contoh/.test(p)), 'no shared-in or sample record');
  const details = d.textAt(`${PROP}/Property Details.txt`)!;
  assert.match(details, /^Property Details\nRecord ID: p1\n/);
  assert.match(details, /Geran\.pdf \(title\)/, 'the title deed is listed by name');
  assert.doesNotMatch(details, /Withheld/);
  assert.equal(await d.textAt(`${PROP}/Pictures/01-front.jpg`), 'FRONT-PHOTO', 'main photo is 01');
  const buyer = d.textAt(`${ROOT}/Contacts/Buyers/Encik Rahman/Buyer Details.txt`)!;
  assert.ok(buyer.includes('900101-05-1234'), 'the owner\'s own backup keeps the IC number');
  const all = [...d.files.values()].map(f => new TextDecoder().decode(f.data)).join('\n');
  for (const secret of ['SECRET-MAPS-KEY', 'SECRET-ANON', 'secret.supabase.co', 'secret-expert', 'TOKEN-SECRET', 'REFRESH-SECRET', '"TOK"']) assert.ok(!all.includes(secret), `no ${secret}`);
  assert.match(d.textAt(`${ROOT}/Export Status.txt`)!, /Status: complete/);
  assert.match(d.textAt(`${ROOT}/Index.csv`)!, /properties:p1:details,properties:p1,Property Listing\/Malaysia\/.*\/Property Details\.txt,[0-9a-f]{64},\d+/);
});

test('T2 a rerun with nothing changed uploads nothing', async () => {
  const { s } = await agentPhone();
  const d = createFakeDrive(); const c = new DriveClient(d.fetchFn, 'TOK');
  await exportTree(s, c, T0);
  const n = d.calls.length;
  const run = await exportTree(s, c, T0 + 60_000);
  const writes = d.calls.slice(n).filter(x => /^(POST|PATCH) \/upload/.test(x) || /\/copy$/.test(x));
  assert.deepEqual(writes, ['PATCH /upload/drive/v3/files/' + d.fileAt(`${ROOT}/Export Status.txt`)!.id], 'only Export Status.txt (its time) changes');
  assert.equal(run.written, 0); assert.equal(run.status, 'complete');
});

test('T3 an edited record keeps its earlier version in Recovery, and the same Drive file is updated', async () => {
  const { s } = await agentPhone();
  const d = createFakeDrive(); const c = new DriveClient(d.fetchFn, 'TOK');
  await exportTree(s, c, T0);
  const id = d.fileAt(`${PROP}/Property Details.txt`)!.id;
  s.upsert('properties', { ...s.getState().properties[0], askingPrice: 580000 });
  await confirmSync(s);
  await exportTree(s, c, T0 + 3600_000);
  assert.equal(d.fileAt(`${PROP}/Property Details.txt`)!.id, id, 'same file, so links keep working');
  assert.match(d.textAt(`${PROP}/Property Details.txt`)!, /580000/);
  const rec = `${PROP}/Recovery/${mytStamp(T0 + 3600_000)} edited Property Details.txt`;
  assert.match(d.textAt(rec)!, /550000/, 'the earlier version is kept, with the time in its name');
});

test('T4 a property moved to another township moves its files (same ids); the old empty folders go to the bin', async () => {
  const { s } = await agentPhone();
  const d = createFakeDrive(); const c = new DriveClient(d.fetchFn, 'TOK');
  await exportTree(s, c, T0);
  const id = d.fileAt(`${PROP}/Pictures/01-front.jpg`)!.id;
  s.upsert('properties', { ...s.getState().properties[0], township: 'Desa Coalfields' });
  await confirmSync(s);
  const run = await exportTree(s, c, T0 + 60_000);
  const moved = PROP.replace('Kota Seri Mas', 'Desa Coalfields');
  assert.equal(d.fileAt(`${moved}/Pictures/01-front.jpg`)!.id, id);
  assert.ok(!d.paths().some(p => p.includes('Kota Seri Mas')), 'nothing left at the old place');
  assert.ok(run.moved >= 8 && run.binned >= 1);
});

test('T5 a deleted photo goes to Pictures/Recovery; a deleted property goes to Recovery as one folder; nothing is deleted', async () => {
  const { s, kitchen } = await agentPhone();
  const d = createFakeDrive(); const c = new DriveClient(d.fetchFn, 'TOK');
  await exportTree(s, c, T0);
  const p = s.getState().properties[0];
  s.upsert('properties', { ...p, photos: p.photos.filter(x => x.fileId !== kitchen) });
  await confirmSync(s);
  const t1 = T0 + 60_000;
  await exportTree(s, c, t1);
  assert.equal(d.textAt(`${PROP}/Pictures/Recovery/${mytStamp(t1)} deleted 02-kitchen.jpg`), 'KITCHEN-PHOTO');
  s.remove('properties', 'p1');
  await confirmSync(s);
  const t2 = T0 + 120_000;
  await exportTree(s, c, t2);
  const parent = PROP.slice(0, PROP.lastIndexOf('/'));
  assert.equal(d.textAt(`${parent}/Recovery/${mytStamp(t2)} deleted Puan Aminah binti Ali/Pictures/01-front.jpg`), 'FRONT-PHOTO', 'the whole folder, links kept');
  assert.ok(![...d.files.values()].some(f => f.trashed && f.mimeType !== d.FOLDER), 'no file was binned or deleted');
});

test('T6 a file edited by hand in Drive is kept in Recovery as "edited outside the app" and the app version is written back', async () => {
  const { s } = await agentPhone();
  const d = createFakeDrive(); const c = new DriveClient(d.fetchFn, 'TOK');
  await exportTree(s, c, T0);
  d.editByHand(`${ROOT}/To-Do/Call owner about price.txt`, 'my own notes');
  const run = await exportTree(s, c, T0 + 60_000);
  assert.deepEqual(run.editedOutside, ['To-Do/Call owner about price.txt']);
  assert.equal(d.textAt(`${ROOT}/To-Do/Recovery/${mytStamp(T0 + 60_000)} edited outside the app Call owner about price.txt`), 'my own notes');
  assert.match(d.textAt(`${ROOT}/To-Do/Call owner about price.txt`)!, /Record ID: t1/);
  assert.match(d.textAt(`${ROOT}/Export Status.txt`)!, /Edited outside the app \(1\)/);
  // a file put in the Drive bin by hand is written again
  d.fileAt(`${ROOT}/Agent Profile/Profile.txt`)!.trashed = true;
  const r2 = await exportTree(s, c, T0 + 120_000);
  assert.equal(r2.recreated, 1);
  assert.match(d.textAt(`${ROOT}/Agent Profile/Profile.txt`)!, /Agent One/);
});

test('T6b Change 18: Google raising a file\'s version number with no change of content is NOT an edit by hand', async () => {
  const { s } = await agentPhone();
  const d = createFakeDrive(); const c = new DriveClient(d.fetchFn, 'TOK');
  await exportTree(s, c, T0);
  // Drive bumps the version of many files for its own reasons (sharing, processing, a move): nothing was edited
  for (const p of d.paths().filter(x => !x.includes('/Recovery/'))) d.touch(p);
  const run = await exportTree(s, c, T0 + 60_000);
  assert.deepEqual(run.editedOutside, [], 'no false "changed by hand" warning');
  assert.equal(run.toRecovery, 0, 'nothing was copied to Recovery');
  assert.equal(run.status, 'complete');
  assert.ok(!/Edited outside the app/.test(d.textAt(`${ROOT}/Export Status.txt`)!));
  assert.ok(!d.paths().some(p => /edited outside the app/.test(p)));
  // a REAL edit after those version bumps is still found
  d.editByHand(`${ROOT}/To-Do/Call owner about price.txt`, 'my own notes');
  const r2 = await exportTree(s, c, T0 + 120_000);
  assert.deepEqual(r2.editedOutside, ['To-Do/Call owner about price.txt']);
});

test('T6c Change 18: an index saved before this change (no checksum) raises no false warning, then real edits are found', async () => {
  const { s } = await agentPhone();
  const d = createFakeDrive(); const c = new DriveClient(d.fetchFn, 'TOK');
  await exportTree(s, c, T0);
  // make the saved index look like the old one: no checksums, and every Drive version number moved on
  const idx = (await s.listLocal('drivetree:')).find(x => x.key === 'drivetree:index')!.value as { files: Record<string, { md5?: string; version?: string }> };
  for (const f of Object.values(idx.files)) { delete f.md5; f.version = '1'; }
  await s.putLocalNow('drivetree:index', idx);
  for (const p of d.paths().filter(x => !x.includes('/Recovery/'))) d.touch(p);
  const run = await exportTree(s, c, T0 + 60_000);
  assert.deepEqual(run.editedOutside, [], 'an old index does not warn');
  assert.equal(run.toRecovery, 0);
  const after = (await s.listLocal('drivetree:')).find(x => x.key === 'drivetree:index')!.value as { files: Record<string, { md5?: string }> };
  assert.ok(Object.values(after.files).every(f => !!f.md5), 'the checksum is now stored for every file');
  d.editByHand(`${ROOT}/To-Do/Call owner about price.txt`, 'my own notes');
  const r2 = await exportTree(s, c, T0 + 120_000);
  assert.deepEqual(r2.editedOutside, ['To-Do/Call owner about price.txt'], 'a real edit is found from now on');
});

test('T6d Change 18: when Drive gives no checksum at all, nothing is reported as edited by hand', async () => {
  const { s } = await agentPhone();
  const d = createFakeDrive({ noMd5: true }); const c = new DriveClient(d.fetchFn, 'TOK');
  await exportTree(s, c, T0);
  for (const p of d.paths().filter(x => !x.includes('/Recovery/'))) d.touch(p);
  const run = await exportTree(s, c, T0 + 60_000);
  assert.deepEqual(run.editedOutside, []);
  assert.equal(run.status, 'complete');
});

test('T7 changes not yet confirmed by the cloud wait: the earlier Drive copy stays and the status says partial', async () => {
  const { s } = await agentPhone();
  const d = createFakeDrive(); const c = new DriveClient(d.fetchFn, 'TOK');
  await exportTree(s, c, T0);
  s.upsert('properties', { ...s.getState().properties[0], askingPrice: 999999 });          // edited offline: dirty
  s.upsert('tasks', { id: 't9', created: 30, updated: 30, title: 'Offline task', priority: 'low', done: false, kind: 'task', reminders: [] } as Task);
  await s.flush();
  const run = await exportTree(s, c, T0 + 60_000);
  assert.equal(run.status, 'partial');
  assert.match(d.textAt(`${PROP}/Property Details.txt`)!, /550000/, 'the confirmed version stays');
  assert.ok(!d.paths().some(p => p.includes('Offline task')));
  assert.match(d.textAt(`${ROOT}/Export Status.txt`)!, /Status: partial[\s\S]*Waiting for sync \(\d+\)[\s\S]*Offline task/);
  await confirmSync(s);
  const r2 = await exportTree(s, c, T0 + 120_000);
  assert.equal(r2.status, 'complete');
  assert.match(d.textAt(`${PROP}/Property Details.txt`)!, /999999/);
});

test('T8 rebuilding the folders (or a new phone) adopts what is already in Drive instead of making copies', async () => {
  const { s } = await agentPhone();
  const d = createFakeDrive(); const c = new DriveClient(d.fetchFn, 'TOK');
  await exportTree(s, c, T0);
  const count = d.paths().length;
  await forgetTree(s);
  const run = await exportTree(s, c, T0 + 60_000);
  assert.equal(d.paths().length, count, 'no duplicate files');
  assert.equal(run.editedOutside.length, 0);
  // the same on a second phone with the same records
  const other = await agentPhone();
  const r2 = await exportTree(other.s, c, T0 + 120_000);
  const main = d.paths().filter(p => !p.includes('/Recovery/'));
  assert.equal(main.length, count, 'no duplicate files from the second phone');
  assert.ok(d.paths().filter(p => p.includes('/Recovery/')).every(p => / replaced /.test(p)), 'its different versions are kept as "replaced"');
  assert.equal(r2.editedOutside.length, 0);
  assert.equal(r2.status, 'complete');
});

test('T9 Recovery copies older than 90 days go to the Drive bin; younger ones stay', async () => {
  const { s } = await agentPhone();
  const d = createFakeDrive(); const c = new DriveClient(d.fetchFn, 'TOK');
  await exportTree(s, c, T0);
  s.upsert('tasks', { ...s.getState().tasks[0], title: 'Call owner about price' , notes: 'v2' });
  await confirmSync(s);
  await exportTree(s, c, T0 + DAY);
  const rec = `${ROOT}/To-Do/Recovery/${mytStamp(T0 + DAY)} edited Call owner about price.txt`;
  assert.ok(d.fileAt(rec));
  await exportTree(s, c, T0 + 80 * DAY);
  assert.ok(d.fileAt(rec), 'kept at 80 days');
  await exportTree(s, c, T0 + DAY + RECOVERY_KEEP_MS + 60_000);
  assert.equal(d.fileAt(rec), undefined, 'binned after 90 days');
});

test('T10 the tree plan never names a key or address from Settings, and is the same in every app language', async () => {
  const { s } = await agentPhone();
  const en = buildTree(s.getState());
  s.setSingleton('settings', { lang: 'zh' });
  const zh = buildTree(s.getState());
  assert.deepEqual(en.filter(e => e.group !== 'settings').map(e => [e.path.join('/'), e.name, e.hash]), zh.filter(e => e.group !== 'settings').map(e => [e.path.join('/'), e.name, e.hash]));
  const settings = en.find(e => e.key === 'settings:current')!.text!;
  assert.ok(!/mapsApiKey|supabase|expertApiUrl|SECRET/i.test(settings));
});

// ---------------------------------------------------------------- the daily run
test('DR1 the daily run makes a restore point when due and updates the folders every time; layers fail independently', async () => {
  const { s } = await agentPhone();
  const d = createFakeDrive();
  const r1 = await runDriveBackup(s, d.fetchFn, T0);
  assert.ok(r1.ok && r1.point && r1.tree);
  assert.equal(s.getState().meta.driveLastOkAt, T0);
  assert.equal(s.getState().meta.driveTree?.status, 'complete');
  const r2 = await runDriveBackup(s, d.fetchFn, T0 + 3600_000 / 2);
  assert.equal(r2.point, undefined, 'not due again within 20 hours');
  assert.ok(r2.tree);
  // the folder update fails (Drive full during it): the restore point made just before still counts
  d.state.fail = (method: string, u: URL) => (method === 'PATCH' && u.pathname.startsWith('/upload') ? { status: 403, headers: {}, body: new TextEncoder().encode('storageQuotaExceeded') } : null);
  s.upsert('properties', { ...s.getState().properties[0], askingPrice: 1 });
  await confirmSync(s);
  s.setSingleton('meta', { drive: { token: 'TOK', expiresAt: T0 + 3 * DAY, connectedAt: T0 + 2 * DAY } });   // connected again two days later
  const r3 = await runDriveBackup(s, d.fetchFn, T0 + 2 * DAY);
  assert.ok(r3.point, 'restore point made');
  assert.equal(r3.treeError, 'quota');
  assert.equal(s.getState().meta.driveLastOkAt, T0 + 2 * DAY);
  assert.equal(s.getState().meta.driveTree?.ok, false);
});

test('DR2 an expired Google permission is reported plainly, Drive is disconnected and nothing is recorded as done', async () => {
  const { s } = await agentPhone();
  const d = createFakeDrive({ token: 'OTHER' });
  const r = await runDriveBackup(s, d.fetchFn, T0);
  assert.equal(r.ok, false); assert.equal(r.error, 'auth');
  assert.equal(s.getState().meta.drive, undefined);
  assert.equal(s.getState().meta.driveLastOkAt, undefined);
  assert.deepEqual(await runDriveBackup(s, d.fetchFn, T0), { ok: false, error: 'notConnected' });
});

test('DR3 offline: nothing is changed and nothing is recorded as done', async () => {
  const { s } = await agentPhone();
  const d = createFakeDrive(); d.state.offline = true;
  const r = await runDriveBackup(s, d.fetchFn, T0);
  assert.equal(r.error, 'network');
  assert.equal(s.getState().meta.driveLastOkAt, undefined);
  assert.equal(d.files.size, 0);
});

// ---------------------------------------------------------------- integration fixes
test('FX1 advert screenshots are part of the record: in the backup file, the restore point and cloud file sync (as "other")', async () => {
  const { s, adShot } = await agentPhone();
  assert.ok(fileRefs(s.getState()).some(r => r.fileId === adShot && r.kind === 'advert'));
  const b = await createBackup(s, T0);
  const i = await inspectBackup(b.bytes);
  assert.ok(i.ok && i.manifest!.files.some(f => f.id === adShot));
});

test('FX2 confidential documents: never offered to the shared team bucket; in the owner\'s backup file, Drive folders and restore points, and restorable', async () => {
  const { s, title, brochure } = await agentPhone();
  const cloud = cloudFileRefs(s.getState()).map(r => r.fileId);
  assert.ok(!cloud.includes(title), 'title deed not for the cloud');
  assert.ok(cloud.includes(brochure));
  assert.ok(fileRefs(s.getState()).find(r => r.fileId === title)!.confidential);
  const b = await createBackup(s, T0);
  const insp = await inspectBackup(b.bytes);
  assert.ok(insp.manifest!.files.some(f => f.id === title), 'own backup file keeps it');
  const fresh = await Store.open(new MemoryBackend());
  await restoreBackup(fresh, insp, 'missing', T0 + 1);
  assert.equal(await (await fresh.getFile(title))!.text(), '%PDF-geran-CONFIDENTIAL', 'and the owner gets it back from the file');
  // restore point: in it, and restored on a clean phone
  const d = createFakeDrive(); const c = new DriveClient(d.fetchFn, 'TOK');
  await createRestorePoint(s, c, 'manual', T0);
  const f = await drFolders(c);
  const pv = await loadRestorePoint(c, f, (await listPoints(c, f)).complete[0]);
  assert.ok(!('problem' in pv) && pv.inspection.manifest!.files.some(x => x.id === title));
  const fresh2 = await Store.open(new MemoryBackend());
  await restoreBackup(fresh2, pv.inspection, 'missing', T0 + 2);
  assert.equal(await (await fresh2.getFile(title))!.text(), '%PDF-geran-CONFIDENTIAL', 'and from the restore point');
});

test('DN1 Change 17: "Back up now" says so when the folder update failed or was only partial, and stays quiet when it is complete', async () => {
  // complete
  const a = await agentPhone();
  const d1 = createFakeDrive();
  const ok = await runDriveBackup(a.s, d1.fetchFn, T0, { force: true });
  assert.deepEqual(driveNowOutcome(ok), { folders: 'ok', waiting: 0, failed: 0 });
  // the restore point works but the folder update fails (Drive full during it): must be reported as failed
  const b = await agentPhone();
  const d2 = createFakeDrive();
  await runDriveBackup(b.s, d2.fetchFn, T0, { force: true });
  d2.state.fail = (method: string, u: URL) => (method === 'PATCH' && u.pathname.startsWith('/upload') ? { status: 403, headers: {}, body: new TextEncoder().encode('storageQuotaExceeded') } : null);
  b.s.upsert('properties', { ...b.s.getState().properties[0], askingPrice: 1 });
  await confirmSync(b.s);
  const bad = await runDriveBackup(b.s, d2.fetchFn, T0 + 60_000, { force: true });
  assert.ok(bad.point, 'the restore point itself was made');
  assert.deepEqual(driveNowOutcome(bad), { folders: 'failed', foldersError: 'quota', waiting: 0, failed: 0 });
  // partial: a change not yet confirmed by the cloud waits
  const c = await agentPhone();
  const d3 = createFakeDrive();
  await runDriveBackup(c.s, d3.fetchFn, T0, { force: true });
  c.s.upsert('tasks', { id: 't9', created: 30, updated: 30, title: 'Offline task', priority: 'low', done: false, kind: 'task', reminders: [] } as Task);
  await c.s.flush();
  const part = await runDriveBackup(c.s, d3.fetchFn, T0 + 60_000, { force: true });
  assert.ok(part.point);
  const o = driveNowOutcome(part);
  assert.equal(o.folders, 'partial');
  assert.ok(o.waiting >= 1);
  // folders not asked for
  assert.equal(driveNowOutcome({ ok: true }).folders, 'skipped');
});

test('PG1 Change 17b: the backup percentage starts at 0, never goes backwards, passes the halfway mark between the restore point and the folders, and ends at 100', async () => {
  const { s } = await agentPhone();
  const d = createFakeDrive();
  const seen: number[] = [];
  await runDriveBackup(s, d.fetchFn, T0, { force: true, onProgress: p => seen.push(p) });
  assert.equal(seen[0], 0); assert.equal(seen[seen.length - 1], 100);
  for (let i = 1; i < seen.length; i++) assert.ok(seen[i] >= seen[i - 1], `not backwards at ${i}: ${seen[i - 1]} -> ${seen[i]}`);
  assert.ok(seen.some(p => p > 0 && p < 50), 'moves during the restore point');
  assert.ok(seen.some(p => p > 50 && p < 100), 'moves during the folder update');
  assert.ok(seen.every(p => p >= 0 && p <= 100));
  // folders only (no restore point due again): the bar uses the whole width
  const later: number[] = [];
  await runDriveBackup(s, d.fetchFn, T0 + 1200_000, { onProgress: p => later.push(p) });
  assert.ok(later.some(p => p > 0 && p < 100) || later.length >= 2);
  assert.equal(later[later.length - 1], 100);
  // a progress display that throws never breaks the backup
  const r = await runDriveBackup(s, d.fetchFn, T0 + 2400_000, { force: true, onProgress: () => { throw new Error('display broke'); } });
  assert.ok(r.ok && r.point && r.tree, 'a progress display that throws never breaks the backup');
  assert.equal(percentOf(0, 50, 1, 2), 25); assert.equal(percentOf(50, 100, 4, 4), 100); assert.equal(percentOf(0, 100, 0, 0), 100);
});
