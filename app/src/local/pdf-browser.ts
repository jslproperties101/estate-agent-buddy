// Browser build: pdf.js runs on the page itself (no separate worker file or blob URL),
// so it also works inside apps and pages that block background workers. Works offline.
import * as pdfjs from 'pdfjs-dist';
import * as pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs';
import { pdfPagesWith } from './pdf-core';

(globalThis as unknown as { pdfjsWorker: unknown }).pdfjsWorker = pdfWorker;

export async function pdfPages(bytes: Uint8Array) {
  return pdfPagesWith(pdfjs, bytes);
}
