// Change 006 Layer 4: the business's own encrypted backup, independent of Google Drive and of Supabase.
// Node.js only, no packages (node:crypto, node:fs). Provider-neutral: a backup is one encrypted file plus a small
// public manifest, written to a BackupTarget (a local or mounted folder today; an object store with write-once lock
// once the owner chooses a provider — see docs/CHANGE_006_LAYER4.md).
//
// Encrypted file format "eab-platform-backup" v1:
//   line 1   JSON header (UTF-8), ending with "\n". Not secret. It names the format, the cipher, the chunk size, a random
//            nonce prefix and, for EACH key holder, their key id, a fresh ephemeral public key and the wrapped file key.
//   then     the body: the plaintext bundle cut into 64 KiB chunks, each sealed with AES-256-GCM under one random file
//            key. Nonce = 7-byte random prefix + 4-byte chunk counter + 1 byte (1 on the last chunk, else 0), so chunks
//            cannot be reordered, dropped or cut off without detection. The header is the additional data of every
//            chunk, so it cannot be swapped either.
//   key wrap X25519 (ephemeral × key holder) → HKDF-SHA256 → AES-256-GCM over the file key. Any ONE key holder's
//            private key opens the backup (two holders = no single point of loss).
// Plaintext bundle: a simple container of named entries ("manifest.json", "database.sql", "objects/<sha256>", …), each
// entry's SHA-256 recorded in the bundle's own manifest.json, which is checked on restore.
//
// Never written anywhere by this code: private keys, passwords, database URLs or any other secret. Private keys are
// read only from a file path given at restore time.
import { createHash, createCipheriv, createDecipheriv, randomBytes, generateKeyPairSync, createPrivateKey, createPublicKey, diffieHellman, hkdfSync } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, openSync, readSync, closeSync, chmodSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';

export const FORMAT = 'eab-platform-backup';
export const VERSION = 1;
export const ALG = 'X25519-HKDF-SHA256+AES-256-GCM-STREAM';
export const CHUNK = 64 * 1024;
const WRAP_INFO = Buffer.from('eab-platform-backup v1 key wrap');

const b64u = b => Buffer.from(b).toString('base64url');
const unb64u = s => Buffer.from(s, 'base64url');
export const sha256 = data => createHash('sha256').update(data).digest('hex');

// ---------------------------------------------------------------- keys
/** A new X25519 key pair for one key holder. The private key is returned once and must be kept offline by that person. */
export function generateKeyPair() {
  const { publicKey, privateKey } = generateKeyPairSync('x25519');
  const pub = publicKey.export({ format: 'jwk' });
  const priv = privateKey.export({ format: 'jwk' });
  const raw = unb64u(pub.x);
  return { publicKey: { kty: 'OKP', crv: 'X25519', x: pub.x, kid: keyId(raw) }, privateKey: { kty: 'OKP', crv: 'X25519', x: pub.x, d: priv.d, kid: keyId(raw) } };
}
export const keyId = rawPub => sha256(rawPub).slice(0, 16);
const pubObj = jwk => createPublicKey({ key: { kty: 'OKP', crv: 'X25519', x: jwk.x }, format: 'jwk' });
const privObj = jwk => createPrivateKey({ key: { kty: 'OKP', crv: 'X25519', x: jwk.x, d: jwk.d }, format: 'jwk' });

function kek(shared, epkRaw, rpkRaw) { return Buffer.from(hkdfSync('sha256', shared, Buffer.concat([epkRaw, rpkRaw]), WRAP_INFO, 32)); }

function wrapFor(recipient, fileKey) {
  const eph = generateKeyPairSync('x25519');
  const epk = unb64u(eph.publicKey.export({ format: 'jwk' }).x);
  const rpk = unb64u(recipient.x);
  const shared = diffieHellman({ privateKey: eph.privateKey, publicKey: pubObj(recipient) });
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', kek(shared, epk, rpk), iv);
  const ct = Buffer.concat([c.update(fileKey), c.final()]);
  return { kid: keyId(rpk), epk: b64u(epk), iv: b64u(iv), key: b64u(ct), tag: b64u(c.getAuthTag()) };
}
function unwrapWith(identity, rec) {
  const shared = diffieHellman({ privateKey: privObj(identity), publicKey: pubObj({ x: rec.epk }) });
  const d = createDecipheriv('aes-256-gcm', kek(shared, unb64u(rec.epk), unb64u(identity.x)), unb64u(rec.iv));
  d.setAuthTag(unb64u(rec.tag));
  return Buffer.concat([d.update(unb64u(rec.key)), d.final()]);
}

// ---------------------------------------------------------------- bundle (plaintext container)
// entry = [u16 name length][name UTF-8][u64 size][bytes]
export function* bundleEntries(entries) {
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8');
    if (name.length > 65535) throw new Error('entry name too long');
    const head = Buffer.alloc(2 + name.length + 8);
    head.writeUInt16BE(name.length, 0); name.copy(head, 2); head.writeBigUInt64BE(BigInt(e.size), 2 + name.length);
    yield head;
    yield* e.chunks();
  }
}
/** Entries from files on disk, read in chunks (a database dump can be large). */
export function fileEntry(name, path) {
  const size = statSync(path).size;
  return { name, size, path, *chunks() { const fd = openSync(path, 'r'); try { const buf = Buffer.alloc(CHUNK); let pos = 0; while (pos < size) { const n = readSync(fd, buf, 0, Math.min(CHUNK, size - pos), pos); if (!n) throw new Error(`short read ${path}`); pos += n; yield Buffer.from(buf.subarray(0, n)); } } finally { closeSync(fd); } } };
}
export function bufferEntry(name, data) { const b = Buffer.from(data); return { name, size: b.length, *chunks() { yield b; } }; }
export function fileSha(path) { const h = createHash('sha256'); for (const c of fileEntry('x', path).chunks()) h.update(c); return h.digest('hex'); }

// ---------------------------------------------------------------- encrypt / decrypt (streaming by chunk)
function nonce(prefix, counter, last) { const n = Buffer.alloc(12); prefix.copy(n, 0); n.writeUInt32BE(counter, 7); n[11] = last ? 1 : 0; return n; }

/** Encrypts the bundle of `entries` for every recipient public key; writes `outPath` (the .eab file). Returns its
 *  SHA-256 and size. Plaintext never touches the disk. */
export function encryptToFile(entries, recipients, outPath, meta = {}) {
  if (!recipients?.length) throw new Error('at least one key holder public key is needed');
  const fileKey = randomBytes(32);
  const prefix = randomBytes(7);
  const header = { format: FORMAT, version: VERSION, alg: ALG, chunk: CHUNK, noncePrefix: b64u(prefix), createdAt: meta.createdAt ?? new Date().toISOString(), recipients: recipients.map(r => wrapFor(r, fileKey)) };
  const headLine = Buffer.from(JSON.stringify(header) + '\n', 'utf8');
  const parts = [headLine];
  let pending = Buffer.alloc(0); let counter = 0;
  const seal = (chunk, last) => {
    const c = createCipheriv('aes-256-gcm', fileKey, nonce(prefix, counter++, last));
    c.setAAD(headLine);
    parts.push(Buffer.concat([c.update(chunk), c.final(), c.getAuthTag()]));
  };
  for (const piece of bundleEntries(entries)) {
    pending = Buffer.concat([pending, piece]);
    while (pending.length > CHUNK) { seal(pending.subarray(0, CHUNK), false); pending = pending.subarray(CHUNK); }
  }
  seal(pending, true);                                   // always one final chunk (may be empty)
  fileKey.fill(0);
  const out = Buffer.concat(parts);
  mkdirSync(dirname(outPath), { recursive: true });
  const tmp = `${outPath}.partial`;
  writeFileSync(tmp, out, { mode: 0o600 });
  renameSync(tmp, outPath);
  return { sha256: sha256(out), bytes: out.length, header };
}

export class BackupError extends Error { constructor(code, message) { super(message ?? code); this.code = code; } }

/** Decrypts with one key holder's private key (JWK) and returns the bundle's entries. Any change to the file, a missing
 *  or extra chunk, or a wrong key fails with BackupError: nothing partial is returned. */
export function decryptFile(path, identity) {
  const all = readFileSync(path);
  const nl = all.indexOf(0x0a);
  if (nl < 0) throw new BackupError('not-a-backup');
  const headLine = all.subarray(0, nl + 1);
  let header;
  try { header = JSON.parse(headLine.toString('utf8')); } catch { throw new BackupError('not-a-backup'); }
  if (header.format !== FORMAT) throw new BackupError('not-a-backup');
  if (header.version > VERSION) throw new BackupError('newer-version');
  const kid = keyId(unb64u(identity.x));
  const rec = header.recipients.find(r => r.kid === kid);
  if (!rec) throw new BackupError('wrong-key', 'this key is not one of the key holders of this backup');
  let fileKey;
  try { fileKey = unwrapWith(identity, rec); } catch { throw new BackupError('wrong-key'); }
  const prefix = unb64u(header.noncePrefix);
  const body = all.subarray(nl + 1);
  const sealed = header.chunk + 16;
  const plain = []; let counter = 0; let off = 0; let sawLast = false;
  while (off < body.length) {
    const piece = body.subarray(off, Math.min(off + sealed, body.length));
    off += piece.length;
    const last = off >= body.length;
    if (piece.length < 16) throw new BackupError('damaged');
    const d = createDecipheriv('aes-256-gcm', fileKey, nonce(prefix, counter++, last));
    d.setAAD(headLine); d.setAuthTag(piece.subarray(piece.length - 16));
    try { plain.push(Buffer.concat([d.update(piece.subarray(0, piece.length - 16)), d.final()])); } catch { throw new BackupError('damaged'); }
    if (last) sawLast = true;
  }
  if (!sawLast) throw new BackupError('damaged');
  fileKey.fill(0);
  return parseBundle(Buffer.concat(plain));
}

export function parseBundle(buf) {
  const out = []; let p = 0;
  while (p < buf.length) {
    if (p + 2 > buf.length) throw new BackupError('damaged');
    const n = buf.readUInt16BE(p); p += 2;
    const name = buf.subarray(p, p + n).toString('utf8'); p += n;
    if (p + 8 > buf.length) throw new BackupError('damaged');
    const size = Number(buf.readBigUInt64BE(p)); p += 8;
    if (p + size > buf.length) throw new BackupError('damaged');
    out.push({ name, data: buf.subarray(p, p + size) }); p += size;
  }
  return out;
}

// ---------------------------------------------------------------- backups as a whole
/**
 * Makes one platform backup.
 *   dump: path of a database dump (pg_dump --format=plain), objectsDir: folder of storage objects (file name = SHA-256,
 *   as the eab-files bucket stores them; sub-folders such as <workspace>/ are kept), counts: row counts per table taken at
 *   dump time (checked again after a restore). Returns { name, file, manifest }.
 */
export function makeBackup({ dump, objectsDir, counts = {}, recipients, target, now = new Date(), source = '' }) {
  const entries = [];
  const listed = [];
  if (dump) { entries.push(fileEntry('database.sql', dump)); listed.push({ name: 'database.sql', sha256: fileSha(dump), bytes: statSync(dump).size }); }
  if (objectsDir && existsSync(objectsDir)) {
    const walk = (dir, rel = '') => { for (const f of readdirSync(dir).sort()) { const p = join(dir, f); const r = rel ? `${rel}/${f}` : f; if (statSync(p).isDirectory()) walk(p, r); else { entries.push(fileEntry(`objects/${r}`, p)); listed.push({ name: `objects/${r}`, sha256: fileSha(p), bytes: statSync(p).size }); } } };
    walk(objectsDir);
  }
  const inner = { format: `${FORMAT}-bundle`, version: VERSION, createdAt: now.toISOString(), source, counts, entries: listed };
  entries.unshift(bufferEntry('manifest.json', JSON.stringify(inner, null, 1)));
  const name = `eab-platform-${now.toISOString().slice(0, 19).replace(/:/g, '-')}Z`;
  const tmpFile = join(target.workDir, `${name}.eab`);
  const enc = encryptToFile(entries, recipients, tmpFile, { createdAt: now.toISOString() });
  // the public manifest: enough to check the stored file without any key; names no table, file or person
  const pub = { format: `${FORMAT}-index`, version: VERSION, name, createdAt: now.toISOString(), file: `${name}.eab`, sha256: enc.sha256, bytes: enc.bytes, keyHolders: enc.header.recipients.map(r => r.kid), entries: listed.length };
  target.put(`${name}.eab`, tmpFile);
  target.putText(`${name}.json`, JSON.stringify(pub, null, 1));
  return { name, file: `${name}.eab`, manifest: pub };
}

/** Checks a stored backup WITHOUT a key: present, right size, right SHA-256. */
export function verifyStored(target, name) {
  const pub = JSON.parse(target.getText(`${name}.json`));
  const path = target.pathOf(pub.file);
  if (!existsSync(path)) return { ok: false, problem: 'missing' };
  if (statSync(path).size !== pub.bytes) return { ok: false, problem: 'size' };
  if (fileSha(path) !== pub.sha256) return { ok: false, problem: 'checksum' };
  return { ok: true, manifest: pub };
}

/** Opens a backup with one key holder's key, checks every entry against the bundle's manifest, and writes the
 *  entries into `outDir` (database.sql, objects/…). Throws BackupError on any mismatch; outDir must be new and empty. */
export function restoreBackup(path, identity, outDir) {
  if (existsSync(outDir) && readdirSync(outDir).length) throw new BackupError('not-empty', `${outDir} is not empty`);
  const entries = decryptFile(path, identity);
  const mf = entries.find(e => e.name === 'manifest.json');
  if (!mf) throw new BackupError('damaged', 'no manifest');
  const m = JSON.parse(mf.data.toString('utf8'));
  const byName = new Map(entries.map(e => [e.name, e]));
  for (const l of m.entries) {
    const e = byName.get(l.name);
    if (!e) throw new BackupError('damaged', `missing ${l.name}`);
    if (sha256(e.data) !== l.sha256 || e.data.length !== l.bytes) throw new BackupError('damaged', `checksum ${l.name}`);
    if (l.name.startsWith('objects/') && !/(^|\/)[0-9a-f]{64}$/.test(l.name)) continue;
    if (l.name.startsWith('objects/') && sha256(e.data) !== l.name.slice(l.name.lastIndexOf('/') + 1)) throw new BackupError('damaged', `object name ${l.name}`);
  }
  if (entries.length !== m.entries.length + 1) throw new BackupError('damaged', 'unexpected entries');
  mkdirSync(outDir, { recursive: true });
  for (const l of m.entries) {
    if (l.name.includes('..') || l.name.startsWith('/')) throw new BackupError('damaged', `bad name ${l.name}`);
    const p = join(outDir, l.name);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, byName.get(l.name).data, { mode: 0o600 });
  }
  writeFileSync(join(outDir, 'manifest.json'), mf.data, { mode: 0o600 });
  return m;
}

// ---------------------------------------------------------------- targets
/**
 * A folder target (local disk, a mounted network drive, or an external disk). Write-once: an existing backup is never
 * overwritten and the stored files are made read-only. Deleting old backups is NOT a function of this code: retention
 * belongs to the storage (object lock / lifecycle rules) so that stolen job credentials cannot remove backups.
 */
export class FolderTarget {
  constructor(dir) { this.dir = dir; this.workDir = join(dir, '.work'); mkdirSync(this.workDir, { recursive: true, mode: 0o700 }); }
  pathOf(name) { return join(this.dir, name); }
  put(name, fromPath) {
    const to = this.pathOf(name);
    if (existsSync(to)) throw new BackupError('exists', `${name} already exists (write-once)`);
    renameSync(fromPath, to); chmodSync(to, 0o444);
  }
  putText(name, text) {
    const to = this.pathOf(name);
    if (existsSync(to)) throw new BackupError('exists', `${name} already exists (write-once)`);
    writeFileSync(to, text, { mode: 0o444 });
  }
  getText(name) { return readFileSync(this.pathOf(name), 'utf8'); }
  list() { return readdirSync(this.dir).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)).sort(); }
}

/** A key file: JSON. Public files are safe to share; private files must never be committed, logged or emailed. */
export const readKey = path => JSON.parse(readFileSync(path, 'utf8'));
