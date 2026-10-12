// Reads the text of a Word (.docx) file on the device, with no library and no network.
// A .docx file is a ZIP archive; the text is in word/document.xml.
// Old .doc files (Word 97–2003) are not supported.

export class DocxError extends Error {}

function u16(b: Uint8Array, o: number) { return b[o] | (b[o + 1] << 8); }
function u32(b: Uint8Array, o: number) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([new Uint8Array(data)]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Returns the bytes of one file inside a ZIP archive, or null if it is not there. */
export async function readZipEntry(zip: Uint8Array, name: string): Promise<Uint8Array | null> {
  // End of central directory record: search backwards for its signature.
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65557); i--) {
    if (u32(zip, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new DocxError('not-zip');
  const count = u16(zip, eocd + 10);
  let p = u32(zip, eocd + 16);
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (u32(zip, p) !== 0x02014b50) throw new DocxError('bad-zip');
    const method = u16(zip, p + 10);
    const csize = u32(zip, p + 20);
    const nameLen = u16(zip, p + 28), extraLen = u16(zip, p + 30), commentLen = u16(zip, p + 32);
    const local = u32(zip, p + 42);
    const fname = dec.decode(zip.subarray(p + 46, p + 46 + nameLen));
    if (fname === name) {
      const lNameLen = u16(zip, local + 26), lExtraLen = u16(zip, local + 28);
      const start = local + 30 + lNameLen + lExtraLen;
      const raw = zip.subarray(start, start + csize);
      if (method === 0) return raw;
      if (method === 8) return inflateRaw(raw);
      throw new DocxError('unsupported-compression');
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decodeXml = (s: string) => s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => {
  if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
  return ENT[e] ?? m;
});

/** Plain text of a .docx file: one line per paragraph; table cells separated by tabs. */
export async function docxText(bytes: Uint8Array): Promise<string> {
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf) throw new DocxError('old-doc-format');
  const xmlBytes = await readZipEntry(bytes, 'word/document.xml');
  if (!xmlBytes) throw new DocxError('no-document-xml');
  const xml = new TextDecoder().decode(xmlBytes);
  let out = '';
  const re = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br[^>]*\/>|<\/w:tc>|<\/w:p>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    if (m[1] !== undefined) out += decodeXml(m[1]);
    else if (m[0] === '</w:p>' || m[0].startsWith('<w:br')) out += '\n';
    else out += '\t';
  }
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
