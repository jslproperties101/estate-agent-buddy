// Local pipeline (Version 1I proposal): reads one source on the device and returns its text,
// with a sensitive-data check. No network, no AI.
import { docxText, DocxError } from './docx';
import { checkSensitive } from './sensitive';
import { Segment } from './rules';
import { kindOf, SourceKind, sha256Hex } from './files';
import { normaliseSpoken } from '../voice/spoken';
import { SCANNED_MIN_CHARS } from './pdf-core';

export type SourceStatus = 'read' | 'partly-scanned' | 'needs-ocr' | 'unsupported' | 'error';

export interface SourceInfo {
  id: string;
  name: string;
  kind: SourceKind;
  bytes: number;
  hash: string;
  status: SourceStatus;
  pages?: number;
  scannedPages?: number[];
  chars: number;
  sensitive: boolean;
  sensitiveReasons: string[];
  ms: number;
  stated?: boolean;
  compressedBytes?: number;
  previewUrl?: string;
}

export interface SourceResult {
  info: SourceInfo;
  segments: Segment[];
  blocked: Map<Segment, [number, number][]>;
}

export type PdfReader = (bytes: Uint8Array) => Promise<{ pages: string[] }>;

const now = () => (globalThis.performance ? performance.now() : Date.now());

export async function readSource(
  input: { id: string; name: string; mime: string; bytes: Uint8Array },
  pdf: PdfReader,
): Promise<SourceResult> {
  const t0 = now();
  const kind = kindOf(input.name, input.mime);
  const hash = await sha256Hex(input.bytes);
  const base: SourceInfo = { id: input.id, name: input.name, kind, bytes: input.bytes.length, hash, status: 'read', chars: 0, sensitive: false, sensitiveReasons: [], ms: 0 };
  const segments: Segment[] = [];
  try {
    if (kind === 'pdf') {
      const { pages } = await pdf(input.bytes);
      base.pages = pages.length;
      base.scannedPages = [];
      pages.forEach((text, i) => {
        if (text.replace(/\s/g, '').length < SCANNED_MIN_CHARS) base.scannedPages!.push(i + 1);
        else segments.push({ sourceId: input.id, sourceName: input.name, page: i + 1, text });
      });
      if (base.scannedPages.length === pages.length) base.status = 'needs-ocr';
      else if (base.scannedPages.length) base.status = 'partly-scanned';
    } else if (kind === 'docx') {
      const text = await docxText(input.bytes);
      segments.push({ sourceId: input.id, sourceName: input.name, page: null, text });
    } else if (kind === 'image') {
      base.status = 'needs-ocr';
    } else {
      base.status = 'unsupported';
    }
  } catch (e) {
    base.status = e instanceof DocxError && e.message === 'old-doc-format' ? 'unsupported' : 'error';
  }
  return finish(base, segments, t0);
}

/** A note the person typed or spoke: its values are STATED. Spoken numbers become digits first. */
export async function readNote(id: string, text: string, name = 'Your note'): Promise<SourceResult> {
  const t0 = now();
  const bytes = new TextEncoder().encode(text);
  const base: SourceInfo = { id, name, kind: 'other', bytes: bytes.length, hash: await sha256Hex(bytes), status: 'read', chars: 0, sensitive: false, sensitiveReasons: [], ms: 0, stated: true };
  return finish(base, [{ sourceId: id, sourceName: name, page: null, text: normaliseSpoken(text), stated: true }], t0);
}

function finish(info: SourceInfo, segments: Segment[], t0: number): SourceResult {
  const blocked = new Map<Segment, [number, number][]>();
  const reasons = new Set<string>();
  for (const s of segments) {
    const r = checkSensitive(s.text);
    blocked.set(s, r.ranges);
    r.reasons.forEach(x => reasons.add(x));
  }
  info.sensitive = reasons.size > 0;
  info.sensitiveReasons = [...reasons];
  info.chars = segments.reduce((n, s) => n + s.text.length, 0);
  info.ms = Math.round(now() - t0);
  return { info, segments, blocked };
}
