// Google Drive backup against a stand-in Drive (in memory). It proves the app's own logic: the folder, the verified
// upload, keeping 30, binning (not deleting) older copies, never touching other files, honest failures, and that a
// backup taken from Drive restores. It does NOT prove anything about the real Google Drive.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryBackend } from '../src/data/backend';
import { Store } from '../src/data/store';
import { backupToDrive, backupDue, driveUsable, listBackups, ensureFolder, downloadBackup, runDriveBackup, KEEP_COPIES, FOLDER_NAME, DriveError } from '../src/backup/drive';
import { createBackup, inspectBackup, restoreBackup } from '../src/backup/backup';
import type { Contact } from '../src/data/types';

interface F { id: string; name: string; parents: string[]; mime: string; createdTime: string; trashed: boolean; data: Uint8Array }
function fakeDrive(opts: { failUploadSize?: boolean; status?: number; body?: string; throwNet?: boolean } = {}) {
  const files = new Map<string, F>(); let n = 0; let clock = Date.UTC(2026, 0, 1);
  const calls: string[] = [];
  const add = (name: string, parents: string[], mime: string, data = new Uint8Array()) => { const id = `f${++n}`; files.set(id, { id, name, parents, mime, createdTime: new Date(clock += 60_000).toISOString(), trashed: false, data }); return id; };
  const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
  const fetchFn = (async (url: string, init: RequestInit = {}) => {
    if (opts.throwNet) throw new TypeError('offline');
    if (opts.status) return new Response(opts.body ?? '', { status: opts.status });
    const u = new URL(url); const method = init.method ?? 'GET'; const auth = (init.headers as Record<string, string>)?.authorization;
    calls.push(`${method} ${u.pathname}`);
    if (auth !== 'Bearer TOK') return new Response('no', { status: 401 });
    if (u.pathname === '/upload/drive/v3/files' && method === 'POST') {
      const body = init.body as Uint8Array; const text = new TextDecoder('latin1').decode(body);
      const meta = JSON.parse(/\r\n\r\n(\{.*?\})\r\n--/s.exec(text)![1]);
      const head = text.indexOf('content-type: application/zip\r\n\r\n') + 'content-type: application/zip\r\n\r\n'.length;
      const tailAt = text.lastIndexOf('\r\n--eab');
      const id = add(meta.name, meta.parents, meta.mimeType, body.slice(head, tailAt));
      if (opts.failUploadSize) files.get(id)!.data = new Uint8Array(3);
      return json({ id });
    }
    if (u.pathname === '/drive/v3/files' && method === 'POST') { const b = JSON.parse(init.body as string); return json({ id: add(b.name, [], b.mimeType) }); }
    if (u.pathname === '/drive/v3/files' && method === 'GET') {
      const qs = u.searchParams.get('q')!; let list = [...files.values()].filter(f => !f.trashed);
      const folder = /mimeType='application\/vnd.google-apps.folder' and name='([^']+)'/.exec(qs);
      if (folder) list = list.filter(f => f.mime === 'application/vnd.google-apps.folder' && f.name === folder[1]);
      const par = /'([^']+)' in parents/.exec(qs); if (par) list = list.filter(f => f.parents.includes(par[1]));
      list.sort((a, b) => (a.createdTime < b.createdTime ? 1 : -1));
      return json({ files: list.map(f => ({ id: f.id, name: f.name, createdTime: f.createdTime, size: String(f.data.length) })) });
    }
    const m = /^\/drive\/v3\/files\/(.+)$/.exec(u.pathname);
    if (m) {
      const f = files.get(m[1]); if (!f) return new Response('nf', { status: 404 });
      if (method === 'PATCH') { Object.assign(f, JSON.parse(init.body as string)); return json({ id: f.id }); }
      if (u.searchParams.get('alt') === 'media') return new Response(f.data as BlobPart);
      return json({ id: f.id, size: String(f.data.length), trashed: f.trashed });
    }
    return new Response('?', { status: 400 });
  }) as unknown as typeof fetch;
  return { files, fetchFn, calls, add };
}
const nameOf = (i: number) => `EstateAgentBuddy-backup-2026-10-${String(1 + Math.floor(i / 24)).padStart(2, '0')}-${String(i % 24).padStart(2, '0')}00.zip`;
const bytes = (s: string) => new TextEncoder().encode(s);

test('D1 the first backup creates the app folder, uploads, and checks the size', async () => {
  const d = fakeDrive();
  const run = await backupToDrive(d.fetchFn, 'TOK', nameOf(0), bytes('ZIPDATA'));
  assert.equal(run.copies, 1); assert.equal(run.binned, 0);
  const folders = [...d.files.values()].filter(f => f.mime.includes('folder'));
  assert.deepEqual(folders.map(f => f.name), [FOLDER_NAME]);
  assert.equal(await ensureFolder(d.fetchFn, 'TOK'), folders[0].id, 'the folder is reused, not duplicated');
  const list = await listBackups(d.fetchFn, 'TOK', folders[0].id);
  assert.equal(list.length, 1);
  assert.equal(new TextDecoder().decode(await downloadBackup(d.fetchFn, 'TOK', list[0].id)), 'ZIPDATA');
});

test('D2 only the newest 30 are kept; older ones go to the bin, and other files are never touched', async () => {
  const d = fakeDrive();
  const folder = await ensureFolder(d.fetchFn, 'TOK');
  const stranger = d.add('holiday-photos.zip', [folder], 'application/zip', bytes('keep'));
  const note = d.add('EstateAgentBuddy-backup-notes.txt', [folder], 'text/plain', bytes('keep'));
  for (let i = 0; i < 33; i++) await backupToDrive(d.fetchFn, 'TOK', nameOf(i), bytes(`B${i}`));
  const live = (await listBackups(d.fetchFn, 'TOK', folder));
  assert.equal(live.length, KEEP_COPIES);
  assert.equal(live[0].name, nameOf(32), 'newest first');
  assert.equal(live[29].name, nameOf(3), 'copies 0, 1 and 2 are the ones binned');
  const binned = [...d.files.values()].filter(f => f.trashed).map(f => f.name).sort();
  assert.deepEqual(binned, [nameOf(0), nameOf(1), nameOf(2)]);
  assert.equal(d.files.get(stranger)!.trashed, false); assert.equal(d.files.get(note)!.trashed, false);
  assert.ok(![...d.files.values()].some(f => f.mime === 'application/zip' && f.data.length === 0), 'nothing was permanently removed');
  assert.ok(!d.calls.some(c => c.startsWith('DELETE')), 'no permanent delete call is ever made');
});

test('D3 an upload whose size does not match is removed and reported as not verified, and nothing is pruned', async () => {
  const d = fakeDrive();
  const folder = await ensureFolder(d.fetchFn, 'TOK');
  for (let i = 0; i < 30; i++) await backupToDrive(d.fetchFn, 'TOK', nameOf(i), bytes('good'));
  const bad = fakeDrive({ failUploadSize: true });
  for (const [id, f] of d.files) bad.files.set(id, f);
  await assert.rejects(() => backupToDrive(bad.fetchFn, 'TOK', nameOf(40), bytes('longer-than-three')), (e: unknown) => e instanceof DriveError && e.code === 'notVerified');
  assert.equal((await listBackups(bad.fetchFn, 'TOK', folder)).length, 30, 'the 30 good copies are all still there');
});

test('D4 failures are named honestly: not signed in to Google, offline, storage full, server error', async () => {
  const code = async (o: Parameters<typeof fakeDrive>[0], tok = 'TOK') => { try { await backupToDrive(fakeDrive(o).fetchFn, tok, nameOf(0), bytes('x')); return 'ok'; } catch (e) { return (e as DriveError).code; } };
  assert.equal(await code({}, 'WRONG'), 'auth');
  assert.equal(await code({ throwNet: true }), 'network');
  assert.equal(await code({ status: 403, body: '{"error":{"errors":[{"reason":"storageQuotaExceeded"}]}}' }), 'quota');
  assert.equal(await code({ status: 500 }), 'server');
  assert.equal(await code({ status: 403, body: 'accessNotConfigured' }), 'auth');
});

test('D5 runDriveBackup records the outcome on the phone; a refused token disconnects Drive; success is never recorded for a failure', async () => {
  const s = await Store.open(new MemoryBackend());
  s.upsert('contacts', { id: 'c1', created: 1, updated: 1, name: 'Ahmad', roles: ['buyer'] } as Contact);
  const now = Date.now();
  assert.deepEqual(await runDriveBackup(s, fakeDrive().fetchFn, now), { ok: false, error: 'notConnected' });
  s.setSingleton('meta', { drive: { token: 'WRONG', expiresAt: now + 3600_000, connectedAt: now } });
  const r1 = await runDriveBackup(s, fakeDrive().fetchFn, now);
  assert.deepEqual(r1, { ok: false, error: 'auth' });
  assert.equal(s.getState().meta.drive, undefined, 'the refused token is forgotten');
  assert.equal(s.getState().meta.driveLastOkAt, undefined);
  assert.equal(s.getState().meta.driveLast?.ok, false);
  s.setSingleton('meta', { drive: { token: 'TOK', expiresAt: now + 3600_000, connectedAt: now } });
  const d = fakeDrive();
  const r2 = await runDriveBackup(s, d.fetchFn, now + 5);
  assert.equal(r2.ok, true);
  assert.equal(s.getState().meta.driveLastOkAt, now + 5);
  assert.equal(s.getState().meta.lastBackupAt, now + 5);
  const text = [...d.files.values()].filter(f => f.name.endsWith('.zip')).map(f => new TextDecoder().decode(f.data)).join('');
  assert.ok(!text.includes('"token":"TOK"') && !text.includes('driveLast'), 'the Drive token is never inside a backup file');
});

test('D6 a backup downloaded from Drive restores onto a new phone', async () => {
  const s = await Store.open(new MemoryBackend());
  s.upsert('contacts', { id: 'c1', created: 1, updated: 1, name: 'Ahmad', roles: ['buyer'] } as Contact);
  const d = fakeDrive(); const b = await createBackup(s);
  await backupToDrive(d.fetchFn, 'TOK', b.fileName, b.bytes);
  const folder = await ensureFolder(d.fetchFn, 'TOK');
  const [latest] = await listBackups(d.fetchFn, 'TOK', folder);
  const insp = await inspectBackup(await downloadBackup(d.fetchFn, 'TOK', latest.id));
  assert.equal(insp.ok, true);
  const fresh = await Store.open(new MemoryBackend());
  assert.equal((await restoreBackup(fresh, insp, 'missing')).added, 1);
  assert.equal(fresh.getState().contacts[0].name, 'Ahmad');
});

test('D7 daily rule: due when none yet or 20 hours old; Drive is usable only while Google\'s token lasts', () => {
  const t = Date.UTC(2026, 9, 14, 8);
  assert.equal(backupDue(undefined, t), true);
  assert.equal(backupDue(t - 19 * 3600_000, t), false);
  assert.equal(backupDue(t - 20 * 3600_000, t), true);
  assert.equal(driveUsable(undefined, t), false);
  assert.equal(driveUsable({ token: 'x', expiresAt: t + 30_000 }, t), false);
  assert.equal(driveUsable({ token: 'x', expiresAt: t + 600_000 }, t), true);
});
