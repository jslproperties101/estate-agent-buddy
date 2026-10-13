// A minimal ZIP writer/reader (stored, no compression) so a backup is an ordinary .zip the owner can open on a computer,
// with no extra library. Every entry carries a CRC-32 that is checked when the file is read back. Photos and PDFs are
// already compressed, and the records are small, so storing them as they are costs little.
const TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(data: Uint8Array): number { let c = 0xffffffff; for (let i = 0; i < data.length; i++) c = TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

export interface ZipEntry { name: string; data: Uint8Array }
const enc = new TextEncoder();
const dec = new TextDecoder();

export function makeZip(entries: ZipEntry[], when = new Date()): Uint8Array {
  const dosTime = ((when.getHours() << 11) | (when.getMinutes() << 5) | (when.getSeconds() >> 1)) & 0xffff;
  const dosDate = (((Math.max(1980, when.getFullYear()) - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate()) & 0xffff;
  const parts: Uint8Array[] = []; const central: Uint8Array[] = []; let offset = 0;
  for (const e of entries) {
    const name = enc.encode(e.name); const crc = crc32(e.data);
    const local = new Uint8Array(30 + name.length); const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true); lv.setUint16(8, 0, true);
    lv.setUint16(10, dosTime, true); lv.setUint16(12, dosDate, true); lv.setUint32(14, crc, true);
    lv.setUint32(18, e.data.length, true); lv.setUint32(22, e.data.length, true); lv.setUint16(26, name.length, true); lv.setUint16(28, 0, true);
    local.set(name, 30);
    const c = new Uint8Array(46 + name.length); const cv = new DataView(c.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true); cv.setUint16(10, 0, true);
    cv.setUint16(12, dosTime, true); cv.setUint16(14, dosDate, true); cv.setUint32(16, crc, true);
    cv.setUint32(20, e.data.length, true); cv.setUint32(24, e.data.length, true); cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true); c.set(name, 46);
    parts.push(local, e.data); central.push(c); offset += local.length + e.data.length;
  }
  const cdSize = central.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22); const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, entries.length, true); ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdSize, true); ev.setUint32(16, offset, true);
  const all = [...parts, ...central, end]; const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let o = 0; for (const p of all) { out.set(p, o); o += p.length; }
  return out;
}

/** Reads a ZIP made by makeZip (stored entries). Throws a plain Error('not-a-backup' | 'damaged' | 'unsupported') otherwise. */
export function readZip(bytes: Uint8Array): ZipEntry[] {
  if (bytes.length < 22) throw new Error('not-a-backup');
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) if (v.getUint32(i, true) === 0x06054b50) { end = i; break; }
  if (end < 0) throw new Error('not-a-backup');
  const count = v.getUint16(end + 10, true); let p = v.getUint32(end + 16, true);
  const out: ZipEntry[] = [];
  for (let n = 0; n < count; n++) {
    if (p + 46 > bytes.length || v.getUint32(p, true) !== 0x02014b50) throw new Error('damaged');
    const method = v.getUint16(p + 10, true); const crc = v.getUint32(p + 16, true); const size = v.getUint32(p + 24, true);
    const nameLen = v.getUint16(p + 28, true); const extraLen = v.getUint16(p + 30, true); const cmtLen = v.getUint16(p + 32, true); const off = v.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    if (method !== 0) throw new Error('unsupported');
    if (off + 30 > bytes.length || v.getUint32(off, true) !== 0x04034b50) throw new Error('damaged');
    const start = off + 30 + v.getUint16(off + 26, true) + v.getUint16(off + 28, true);
    if (start + size > bytes.length) throw new Error('damaged');
    const data = bytes.slice(start, start + size);
    if (crc32(data) !== crc) throw new Error('damaged');
    out.push({ name, data });
    p += 46 + nameLen + extraLen + cmtLen;
  }
  return out;
}
