// File helpers that run on the device: fingerprint for duplicate checks.
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export type SourceKind = 'pdf' | 'docx' | 'image' | 'old-doc' | 'other';

export function kindOf(name: string, mime: string): SourceKind {
  const n = name.toLowerCase();
  if (mime === 'application/pdf' || n.endsWith('.pdf')) return 'pdf';
  if (n.endsWith('.docx')) return 'docx';
  if (n.endsWith('.doc')) return 'old-doc';
  if (mime.startsWith('image/') || /\.(jpe?g|png|webp|heic)$/.test(n)) return 'image';
  return 'other';
}
