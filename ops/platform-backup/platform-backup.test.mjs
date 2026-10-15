// Change 006 Layer 4: the encrypted platform backup format and its restore path (P4-1 … P4-10).
// Runs with Node's built-in test runner, no packages, no network, temporary folders only. Real key holders, a real
// independent storage provider and the production database are NOT involved: see docs/CHANGE_006_LAYER4.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync, existsSync, statSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { generateKeyPair, makeBackup, restoreBackup, decryptFile, verifyStored, FolderTarget, BackupError, sha256, CHUNK, encryptToFile, bufferEntry } from './lib.mjs';

const tmp = () => mkdtempSync(join(tmpdir(), 'eab-l4-'));
function sample() {
  const dir = tmp();
  const dump = join(dir, 'db.sql');
  writeFileSync(dump, `-- synthetic dump\nCREATE TABLE t(x int);\n${'INSERT INTO t VALUES (1);\n'.repeat(9000)}`);   // > 3 chunks
  const objects = join(dir, 'objects', 'ws1'); mkdirSync(objects, { recursive: true });
  const photo = Buffer.from('PHOTO-BYTES-'.repeat(500));
  writeFileSync(join(objects, sha256(photo)), photo);
  return { dir, dump, objectsDir: join(dir, 'objects'), photo };
}
const holders = () => [generateKeyPair(), generateKeyPair()];

test('P4-1 a backup made for two key holders opens with EITHER private key and restores byte for byte', () => {
  const s = sample(); const [h1, h2] = holders();
  const target = new FolderTarget(join(s.dir, 'target'));
  const r = makeBackup({ dump: s.dump, objectsDir: s.objectsDir, counts: { eab_records: 3 }, recipients: [h1.publicKey, h2.publicKey], target, now: new Date('2026-10-15T18:00:00Z') });
  assert.equal(r.name, 'eab-platform-2026-10-15T18-00-00Z');
  assert.deepEqual(r.manifest.keyHolders, [h1.publicKey.kid, h2.publicKey.kid]);
  for (const h of [h1, h2]) {
    const out = join(s.dir, `out-${h.publicKey.kid}`);
    const m = restoreBackup(target.pathOf(r.file), h.privateKey, out);
    assert.deepEqual(m.counts, { eab_records: 3 });
    assert.equal(readFileSync(join(out, 'database.sql'), 'utf8'), readFileSync(s.dump, 'utf8'));
    assert.deepEqual(readFileSync(join(out, 'objects', 'ws1', sha256(s.photo))), s.photo);
  }
});

test('P4-2 nothing readable is stored: no plaintext from the dump or the photo, and no private key, in the target', () => {
  const s = sample(); const [h1, h2] = holders();
  const target = new FolderTarget(join(s.dir, 'target'));
  const r = makeBackup({ dump: s.dump, objectsDir: s.objectsDir, recipients: [h1.publicKey, h2.publicKey], target });
  const stored = readFileSync(target.pathOf(r.file));
  assert.equal(stored.indexOf(Buffer.from('INSERT INTO')), -1);
  assert.equal(stored.indexOf(Buffer.from('PHOTO-BYTES')), -1);
  const pub = readFileSync(target.pathOf(`${r.name}.json`), 'utf8');
  for (const t of [stored.toString('latin1'), pub]) { assert.ok(!t.includes(h1.privateKey.d) && !t.includes(h2.privateKey.d), 'no private key'); assert.ok(!/ws1|db\.sql|database\.sql|eab_records/.test(pub), 'the public index names nothing inside'); }
});

test('P4-3 a key that is not a key holder cannot open it; a wrong key is reported as such', () => {
  const s = sample(); const [h1] = holders(); const stranger = generateKeyPair();
  const target = new FolderTarget(join(s.dir, 'target'));
  const r = makeBackup({ dump: s.dump, recipients: [h1.publicKey], target });
  assert.throws(() => decryptFile(target.pathOf(r.file), stranger.privateKey), e => e instanceof BackupError && e.code === 'wrong-key');
  // a stranger who copies a key holder's public id into their key still cannot unwrap
  assert.throws(() => decryptFile(target.pathOf(r.file), { ...stranger.privateKey, x: h1.publicKey.x }), e => e instanceof BackupError && e.code === 'wrong-key');
});

test('P4-4 any change is caught: one flipped byte, a truncated file, a dropped or swapped chunk, an edited header', () => {
  const s = sample(); const [h1] = holders();
  const target = new FolderTarget(join(s.dir, 'target'));
  const r = makeBackup({ dump: s.dump, recipients: [h1.publicKey], target });
  const good = readFileSync(target.pathOf(r.file));
  const nl = good.indexOf(0x0a);
  const sealed = CHUNK + 16;
  const variants = {
    flipped: (() => { const b = Buffer.from(good); b[nl + 100] ^= 1; return b; })(),
    truncated: good.subarray(0, good.length - 10),
    lastChunkDropped: good.subarray(0, nl + 1 + sealed * 2),
    swapped: Buffer.concat([good.subarray(0, nl + 1), good.subarray(nl + 1 + sealed, nl + 1 + 2 * sealed), good.subarray(nl + 1, nl + 1 + sealed), good.subarray(nl + 1 + 2 * sealed)]),
    header: Buffer.concat([Buffer.from(good.subarray(0, nl).toString().replace('"chunk":65536', '"chunk":65536 ')), good.subarray(nl)]),
  };
  for (const [k, bytes] of Object.entries(variants)) {
    const p = join(s.dir, `${k}.eab`); writeFileSync(p, bytes);
    assert.throws(() => decryptFile(p, h1.privateKey), e => e instanceof BackupError && e.code === 'damaged', k);
    const out = join(s.dir, `out-${k}`);
    assert.throws(() => restoreBackup(p, h1.privateKey, out));
    assert.ok(!existsSync(out), `${k}: nothing written`);
  }
});

test('P4-5 the stored copy is checked without any key; a damaged stored copy is named', () => {
  const s = sample(); const [h1] = holders();
  const target = new FolderTarget(join(s.dir, 'target'));
  const r = makeBackup({ dump: s.dump, recipients: [h1.publicKey], target });
  assert.equal(verifyStored(target, r.name).ok, true);
  const p = target.pathOf(r.file); chmodSync(p, 0o644);
  const b = readFileSync(p); b[b.length - 1] ^= 0xff; writeFileSync(p, b);
  assert.deepEqual(verifyStored(target, r.name), { ok: false, problem: 'checksum' });
});

test('P4-6 the folder target is write-once: a backup is never overwritten and is stored read-only', () => {
  const s = sample(); const [h1] = holders();
  const target = new FolderTarget(join(s.dir, 'target'));
  const now = new Date('2026-10-15T18:00:00Z');
  const r = makeBackup({ dump: s.dump, recipients: [h1.publicKey], target, now });
  assert.equal(statSync(target.pathOf(r.file)).mode & 0o222, 0, 'read-only');
  assert.throws(() => makeBackup({ dump: s.dump, recipients: [h1.publicKey], target, now }), e => e.code === 'exists');
});

test('P4-7 restoring into a folder that is not empty is refused (never on top of something)', () => {
  const s = sample(); const [h1] = holders();
  const target = new FolderTarget(join(s.dir, 'target'));
  const r = makeBackup({ dump: s.dump, recipients: [h1.publicKey], target });
  const out = join(s.dir, 'busy'); mkdirSync(out); writeFileSync(join(out, 'x'), 'x');
  assert.throws(() => restoreBackup(target.pathOf(r.file), h1.privateKey, out), e => e.code === 'not-empty');
});

test('P4-8 the job refuses private keys and the key tool refuses to write a private key inside the repository', () => {
  const s = sample(); const [h1] = holders();
  const priv = join(s.dir, 'p.json'); writeFileSync(priv, JSON.stringify(h1.privateKey));
  const r = spawnSync(process.execPath, [new URL('./make-backup.mjs', import.meta.url).pathname, '--dump', s.dump, '--key', priv, '--target', join(s.dir, 't')], { encoding: 'utf8' });
  assert.equal(r.status, 2); assert.match(r.stderr, /PRIVATE key/);
  const k = spawnSync(process.execPath, [new URL('./keygen.mjs', import.meta.url).pathname, 'holder1', new URL('./', import.meta.url).pathname], { encoding: 'utf8' });
  assert.equal(k.status, 2); assert.match(k.stderr, /outside the repository/);
  const ok = spawnSync(process.execPath, [new URL('./keygen.mjs', import.meta.url).pathname, 'holder1', join(s.dir, 'keys')], { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(statSync(join(s.dir, 'keys', 'holder1.private.json')).mode & 0o077, 0, 'private key readable by its owner only');
  assert.ok(!ok.stdout.includes(JSON.parse(readFileSync(join(s.dir, 'keys', 'holder1.private.json'), 'utf8')).d), 'the private key is never printed');
});

test('P4-9 an empty bundle and an exact multiple of the chunk size still round-trip (edge sizes)', () => {
  const dir = tmp(); const [h1] = holders();
  for (const size of [0, CHUNK - 12 - 'x'.length, CHUNK * 2]) {
    const p = join(dir, `e${size}.eab`);
    encryptToFile([bufferEntry('x', Buffer.alloc(Math.max(0, size), 7))], [h1.publicKey], p);
    const [e] = decryptFile(p, h1.privateKey);
    assert.equal(e.data.length, Math.max(0, size));
  }
  rmSync(dir, { recursive: true, force: true });
});

test('P4-10 the CLI round trip: make, verify without a key, restore with a key holder file', () => {
  const s = sample();
  const keys = join(s.dir, 'keys');
  for (const h of ['holder1', 'holder2']) assert.equal(spawnSync(process.execPath, [new URL('./keygen.mjs', import.meta.url).pathname, h, keys]).status, 0);
  const target = join(s.dir, 'target');
  const mk = spawnSync(process.execPath, [new URL('./make-backup.mjs', import.meta.url).pathname, '--dump', s.dump, '--objects', s.objectsDir, '--key', join(keys, 'holder1.public.json'), '--key', join(keys, 'holder2.public.json'), '--target', target], { encoding: 'utf8' });
  assert.equal(mk.status, 0, mk.stderr);
  const m = JSON.parse(mk.stdout);
  assert.equal(spawnSync(process.execPath, [new URL('./verify.mjs', import.meta.url).pathname, target]).status, 0);
  const out = join(s.dir, 'restored');
  const rs = spawnSync(process.execPath, [new URL('./restore-backup.mjs', import.meta.url).pathname, '--file', join(target, m.file), '--identity', join(keys, 'holder2.private.json'), '--out', out], { encoding: 'utf8' });
  assert.equal(rs.status, 0, rs.stderr);
  assert.equal(readFileSync(join(out, 'database.sql'), 'utf8'), readFileSync(s.dump, 'utf8'));
});
