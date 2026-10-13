// Whole-app backup and protected restore (src/backup). Runs against in-memory phones; nothing here touches a real
// Google Drive or Supabase. A restore on a real phone is NOT verified by these tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryBackend } from '../src/data/backend';
import { Store } from '../src/data/store';
import { createBackup, inspectBackup, planRestore, restoreBackup } from '../src/backup/backup';
import { makeZip, readZip, crc32 } from '../src/backup/zip';
import type { Contact } from '../src/data/types';
import type { Listing } from '../src/listing/model';

const bytesOf = (s: string) => new TextEncoder().encode(s);
const contact = (id: string, name: string, extra: Partial<Contact> = {}): Contact => ({ id, created: 1, updated: 1, name, roles: ['buyer'], leadStatus: 'warm', ...extra } as Contact);

async function phoneWithData() {
  const s = await Store.open(new MemoryBackend());
  const fid = await s.putFile(new Blob([bytesOf('PHOTO-BYTES-1')], { type: 'image/jpeg' }));
  const did = await s.putFile(new Blob([bytesOf('%PDF-fake')], { type: 'application/pdf' }));
  s.upsert('properties', { id: 'p1', created: 1, updated: 1, street: 'Jalan A', photos: [{ id: 'ph1', fileId: fid, name: 'front.jpg' }], documents: [{ id: 'd1', category: 'title', name: 'title.pdf', fileId: did, added: 1 }] } as unknown as Listing);
  s.upsert('contacts', contact('c1', 'Ahmad'));
  s.upsert('contacts', contact('c2', 'Lim', { roles: ['vendor'] }));
  s.setSingleton('profile', { fullName: 'Agent One', phone: '012' });
  s.setSingleton('settings', { lang: 'bm', mapsApiKey: 'SECRET-MAPS-KEY', supabaseAnonKey: 'SECRET-ANON' });
  s.setSingleton('meta', { syncSession: { accessToken: 'TOKEN-SECRET', refreshToken: 'REFRESH-SECRET', expiresAt: 1, email: 'a@x.com', userId: 'u1', workspaceId: 'ws1' } });
  await s.flush();
  return { s, fid, did };
}

test('B1 the zip writer and reader round-trip, and a single changed byte is caught', () => {
  const z = makeZip([{ name: 'a.txt', data: bytesOf('hello') }, { name: 'files/x', data: new Uint8Array([1, 2, 3, 250]) }]);
  const back = readZip(z);
  assert.deepEqual(back.map(e => e.name), ['a.txt', 'files/x']);
  assert.deepEqual([...back[1].data], [1, 2, 3, 250]);
  assert.equal(crc32(bytesOf('123456789')), 0xcbf43926, 'standard CRC-32 check value');
  const bad = new Uint8Array(z); bad[40] ^= 0xff;
  assert.throws(() => readZip(bad), /damaged/);
  assert.throws(() => readZip(bytesOf('this is not a zip file at all, just text')), /not-a-backup/);
});

test('B2 a backup holds real records, files and the profile, and no secrets or sample data', async () => {
  const { s } = await phoneWithData();
  s.upsert('properties', { id: 'sample1', created: 1, updated: 1, sample: true, street: 'Sample St', photos: [] } as unknown as Listing);
  const b = await createBackup(s, Date.UTC(2026, 9, 14, 8, 30));
  assert.match(b.fileName, /^EstateAgentBuddy-backup-2026-10-14-\d{4}\.zip$/);
  assert.equal(b.files, 2); assert.equal(b.missingFiles.length, 0);
  const text = new TextDecoder().decode(b.bytes);
  for (const secret of ['SECRET-MAPS-KEY', 'SECRET-ANON', 'TOKEN-SECRET', 'REFRESH-SECRET']) assert.ok(!text.includes(secret), `no ${secret}`);
  assert.ok(!text.includes('Sample St'), 'no sample data');
  const insp = await inspectBackup(b.bytes);
  assert.equal(insp.ok, true, insp.problems.join());
  assert.equal(insp.counts.properties, 1); assert.equal(insp.counts.contacts, 2);
  assert.equal(insp.manifest!.singletons.profile.fullName, 'Agent One');
  assert.equal(insp.manifest!.workspaceId, 'ws1');
});

test('B3 restoring onto an empty phone brings back every record and file exactly', async () => {
  const { s, fid, did } = await phoneWithData();
  const b = await createBackup(s);
  const fresh = await Store.open(new MemoryBackend());
  const insp = await inspectBackup(b.bytes);
  const plan = await planRestore(fresh, insp, 'missing');
  assert.equal(plan.refusal, undefined);
  assert.equal(plan.add.length, 3); assert.equal(plan.files, 2);
  const r = await restoreBackup(fresh, insp, 'missing');
  assert.deepEqual([r.added, r.replaced, r.filesRestored], [3, 0, 2]);
  const st = fresh.getState();
  assert.deepEqual(st.contacts.map(c => c.name).sort(), ['Ahmad', 'Lim']);
  const p = st.properties[0] as unknown as Listing;
  assert.equal(p.street, 'Jalan A'); assert.equal(p.photos[0].fileId, fid);
  assert.equal(new TextDecoder().decode(await (await fresh.getFile(fid))!.arrayBuffer()), 'PHOTO-BYTES-1');
  assert.equal(new TextDecoder().decode(await (await fresh.getFile(did))!.arrayBuffer()), '%PDF-fake');
  assert.equal(st.profile.fullName, 'Agent One', 'profile comes back on a phone that has none');
  assert.ok(st.meta.dirty.includes('contacts:c1'), 'restored records will sync like any other edit');
  assert.ok(st.meta.lastRestoreAt);
});

test('B4 a damaged, foreign or newer backup is refused and nothing on the phone changes', async () => {
  const { s } = await phoneWithData();
  const b = await createBackup(s);
  const target = await Store.open(new MemoryBackend());
  target.upsert('contacts', contact('keep', 'Keep Me'));
  const before = JSON.stringify(target.getState().contacts);
  // one flipped byte
  const dam = new Uint8Array(b.bytes); dam[Math.floor(dam.length / 2)] ^= 0x55;
  const i1 = await inspectBackup(dam);
  assert.equal(i1.ok, false); assert.ok(i1.problems.length);
  await assert.rejects(() => restoreBackup(target, i1, 'all'), /bad-backup/);
  // text pretending to be a backup
  assert.equal((await inspectBackup(bytesOf('{"records":{}}'))).ok, false);
  // a zip that is not ours
  assert.deepEqual((await inspectBackup(makeZip([{ name: 'x.txt', data: bytesOf('x') }]))).problems, ['not-a-backup']);
  // made by a newer version of the app
  const e = readZip(b.bytes); const m = JSON.parse(new TextDecoder().decode(e[0].data)); m.version = 99;
  e[0] = { name: 'manifest.json', data: bytesOf(JSON.stringify(m)) };
  assert.deepEqual((await inspectBackup(makeZip(e))).problems, ['newer-version']);
  // a picture whose content does not match its recorded checksum
  const e2 = readZip(b.bytes); const k = e2.findIndex(x => x.name.startsWith('files/')); e2[k] = { name: e2[k].name, data: bytesOf('SWAPPED') };
  assert.deepEqual((await inspectBackup(makeZip(e2))).problems, ['file-mismatch']);
  assert.equal(JSON.stringify(target.getState().contacts), before, 'the phone is untouched');
  assert.equal((await target.safetyCopies()).length, 0, 'no safety copy for a refused restore');
});

test('B5 workspace guard: another team\'s backup is refused; so is a named workspace on a phone of unknown ownership', async () => {
  const { s } = await phoneWithData();          // workspace ws1
  const insp = await inspectBackup((await createBackup(s)).bytes);
  const other = await Store.open(new MemoryBackend());
  other.setSingleton('meta', { syncWorkspaceId: 'ws2' });
  other.upsert('contacts', contact('x', 'Other team'));
  assert.equal((await planRestore(other, insp, 'all')).refusal, 'other-workspace');
  await assert.rejects(() => restoreBackup(other, insp, 'all'), /refused:other-workspace/);
  assert.equal(other.getState().contacts.length, 1);
  const unknown = await Store.open(new MemoryBackend());
  unknown.upsert('contacts', contact('y', 'Real record, owner unknown'));
  assert.equal((await planRestore(unknown, insp, 'missing')).refusal, 'unknown-owner');
  const same = await Store.open(new MemoryBackend());
  same.setSingleton('meta', { syncWorkspaceId: 'ws1' });
  assert.equal((await planRestore(same, insp, 'all')).refusal, undefined);
});

test('B6 "missing" keeps the phone\'s newer edits; "all" replaces but keeps the replaced version in history; nothing is deleted; a safety copy is taken', async () => {
  const { s } = await phoneWithData();
  const insp = await inspectBackup((await createBackup(s)).bytes);
  const t = await Store.open(new MemoryBackend());
  t.setSingleton('meta', { syncWorkspaceId: 'ws1' });
  await restoreBackup(t, insp, 'missing', 100);
  t.upsert('contacts', { ...t.getState().contacts.find(c => c.id === 'c1')!, name: 'Ahmad (edited later)' });
  t.upsert('contacts', contact('only-here', 'Only on this phone'));
  const r1 = await restoreBackup(t, insp, 'missing', 200);
  assert.deepEqual([r1.added, r1.replaced], [0, 0]);
  assert.equal(t.getState().contacts.find(c => c.id === 'c1')!.name, 'Ahmad (edited later)', 'a newer edit is not overwritten');
  const plan = await planRestore(t, insp, 'all');
  assert.deepEqual(plan.replace.map(x => x.id), ['c1']);
  const r2 = await restoreBackup(t, insp, 'all', 300);
  assert.equal(r2.replaced, 1);
  assert.equal(t.getState().contacts.find(c => c.id === 'c1')!.name, 'Ahmad');
  assert.ok(t.getState().contacts.some(c => c.id === 'only-here'), 'nothing is deleted by a restore');
  const hist = await t.revisions('contacts:c1');
  assert.ok(hist.some(h => (h.data as { name: string }).name === 'Ahmad (edited later)' && h.source === 'restore'), 'the replaced version is recoverable from history');
  const safety = await t.safetyCopies();
  assert.equal(safety.length, 3, 'a safety copy before each applied restore');
  const snap = safety[0].data as { records: { contacts: { name: string }[] } };
  assert.ok(snap.records.contacts.some(c => c.name === 'Ahmad (edited later)'), 'the safety copy holds the phone as it was');
});

test('B7 an accidentally deleted record comes back, and only the latest three safety copies are kept', async () => {
  const { s } = await phoneWithData();
  const insp = await inspectBackup((await createBackup(s)).bytes);
  s.remove('contacts', 'c2');
  assert.equal(s.getState().contacts.some(c => c.id === 'c2'), false);
  for (let i = 1; i <= 5; i++) await restoreBackup(s, insp, 'missing', 1000 + i);
  assert.equal(s.getState().contacts.some(c => c.id === 'c2'), true, 'brought back');
  assert.ok(!s.getState().meta.tombstones.includes('contacts:c2'), 'no longer waiting to be deleted in the cloud');
  assert.deepEqual((await s.safetyCopies()).map(x => x.at), [1005, 1004, 1003]);
});
