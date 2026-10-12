// Reads the text layer of each PDF page with Mozilla pdf.js (free, runs on the device).
// Pages with almost no text are probably scanned images and need OCR.
/* eslint-disable @typescript-eslint/no-explicit-any */
export interface PdfPages { pages: string[] }

// Text extraction does not need the standard font files, so none are downloaded (works offline).
class NoFontData { async fetch() { return new Uint8Array(0); } }

export async function pdfPagesWith(pdfjs: any, bytes: Uint8Array): Promise<PdfPages> {
  const task = pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false, StandardFontDataFactory: NoFontData, useWorkerFetch: false, verbosity: 0 });
  const doc = await task.promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    pages.push(tc.items.map((it: any) => (it.str ?? '') + (it.hasEOL ? '\n' : ' ')).join('').replace(/[ \t]+/g, ' ').trim());
  }
  await task.destroy();
  return { pages };
}

export const SCANNED_MIN_CHARS = 20;
