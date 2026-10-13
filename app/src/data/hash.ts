// Small helpers used by revisions, sync and file sync: a stable text form of a record, a quick fingerprint of it, and
// SHA-256 of file contents. The fingerprint (cyrb53) is only for noticing "did this change?" and for naming a write so
// a retry is recognised; it is not a security feature. SHA-256 (Web Crypto) identifies file contents.

/** JSON with object keys sorted and undefined dropped, so equal records always give equal text. */
export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(x => stableStringify(x === undefined ? null : x)).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).filter(k => o[k] !== undefined).sort().map(k => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(',')}}`;
}

/** 53-bit fingerprint of a string, as 14 hex digits. */
export function hash53(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

/** Fields that change on every save without being a real difference between two versions. */
export const VOLATILE_FIELDS = ['updated'];

/** Fingerprint of a record's content (ignores `updated`, which every save changes). */
export function recordHash(r: unknown): string {
  if (r && typeof r === 'object' && !Array.isArray(r)) {
    const copy: Record<string, unknown> = { ...(r as Record<string, unknown>) };
    for (const k of VOLATILE_FIELDS) delete copy[k];
    return hash53(stableStringify(copy));
  }
  return hash53(stableStringify(r));
}

export async function sha256Hex(data: Blob | ArrayBuffer): Promise<string> {
  const buf = data instanceof ArrayBuffer ? data : await data.arrayBuffer();
  const d = await globalThis.crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}
