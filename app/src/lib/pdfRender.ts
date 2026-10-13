// Browser side of the PDF maker: measures and draws the laid-out pages on a canvas and turns them into JPEG pictures
// for buildPdf(). Everything runs on the phone. See lib/pdf.ts for the layout and the file writer.
import { Doc, Font, JpegPage, Page, PAGE_H, PAGE_W, buildPdf, layoutDocument } from './pdf';

const SCALE = 2; // 2 pixels per point: sharp on screen and in print, still a modest file size
const FAMILY = '"Noto Sans SC","PingFang SC","Microsoft YaHei",system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif';

type Ctx = CanvasRenderingContext2D;
const css = (f: Font) => `${f.bold ? '700 ' : '400 '}${f.size}px ${FAMILY}`;

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

/** Text width in points, measured with the same font the page is drawn with. */
export function canvasMeasure(): (text: string, font: Font) => number {
  const ctx = makeCanvas(8, 8).getContext('2d') as Ctx;
  return (text, font) => { ctx.font = css(font); return ctx.measureText(text).width; };
}

async function loadImage(src: string): Promise<HTMLImageElement | undefined> {
  return new Promise(res => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => res(undefined);
    img.src = src;
  });
}

/** Photos are drawn "cover"-fitted into their frame; a picture that cannot be loaded leaves a plain grey box (never an error). */
async function drawPage(page: Page, images: Map<string, HTMLImageElement | undefined>): Promise<HTMLCanvasElement> {
  const canvas = makeCanvas(PAGE_W * SCALE, PAGE_H * SCALE);
  const ctx = canvas.getContext('2d') as Ctx;
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, PAGE_W, PAGE_H);
  ctx.textBaseline = 'alphabetic';
  for (const it of page.items) {
    if (it.k === 'rect') { ctx.fillStyle = it.fill; ctx.fillRect(it.x, it.y, it.w, it.h); }
    else if (it.k === 'line') { ctx.strokeStyle = it.colour; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(it.x1, it.y1); ctx.lineTo(it.x2, it.y2); ctx.stroke(); }
    else if (it.k === 'text') { ctx.font = css(it.font); ctx.fillStyle = it.font.colour; ctx.textAlign = it.align === 'right' ? 'right' : 'left'; ctx.fillText(it.text, it.x, it.y); }
    else {
      const img = images.get(it.src);
      if (!img) { ctx.fillStyle = '#e8e4da'; ctx.fillRect(it.x, it.y, it.w, it.h); continue; }
      const r = Math.max(it.w / img.naturalWidth, it.h / img.naturalHeight);
      const sw = it.w / r, sh = it.h / r;
      ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, it.x, it.y, it.w, it.h);
    }
  }
  return canvas;
}

const toJpeg = (c: HTMLCanvasElement): Promise<Blob> => new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('Could not make the page picture'))), 'image/jpeg', 0.88));

export interface RenderedDoc {
  /** One picture per page, for the on-screen preview (object URLs; release with URL.revokeObjectURL). */
  previews: string[];
  /** The finished PDF. */
  pdf: Blob;
}

/** Lays out, draws and packs the document. Works on any phone browser / the Android app's WebView. */
export async function renderDocument(doc: Doc, title: string): Promise<RenderedDoc> {
  const pages = layoutDocument(doc, canvasMeasure());
  const srcs = [...new Set(pages.flatMap(p => p.items.filter(i => i.k === 'image').map(i => (i as { src: string }).src)))];
  const images = new Map<string, HTMLImageElement | undefined>();
  await Promise.all(srcs.map(async s => { images.set(s, await loadImage(s)); }));
  const jpegs: JpegPage[] = [];
  const previews: string[] = [];
  for (const p of pages) {
    const canvas = await drawPage(p, images);
    const blob = await toJpeg(canvas);
    jpegs.push({ data: new Uint8Array(await blob.arrayBuffer()), w: canvas.width, h: canvas.height });
    previews.push(URL.createObjectURL(blob));
  }
  const bytes = buildPdf(jpegs, { title });
  return { previews, pdf: new Blob([bytes as BlobPart], { type: 'application/pdf' }) };
}

/** A file name that is safe on every system. */
export const pdfFileName = (base: string) => `${(base || 'document').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'document'}.pdf`;

export type ShareResult = 'shared' | 'downloaded' | 'cancelled' | 'failed';
/** Hands the PDF to the phone's share sheet when the browser/WebView can share a file (WhatsApp, email, Drive…);
 *  otherwise saves it as a download. Neither path is proven inside the Android app (see docs/STAGE5.md). */
export async function shareOrDownload(pdf: Blob, fileName: string, title: string, mime = 'application/pdf'): Promise<ShareResult> {
  try {
    const file = new File([pdf], fileName, { type: mime });
    const nav = navigator as Navigator & { canShare?: (d: object) => boolean; share?: (d: object) => Promise<void> };
    if (nav.canShare?.({ files: [file] }) && nav.share) {
      try { await nav.share({ files: [file], title }); return 'shared'; }
      catch (e) { if ((e as Error)?.name === 'AbortError') return 'cancelled'; /* fall through to download */ }
    }
    return download(pdf, fileName) ? 'downloaded' : 'failed';
  } catch { return 'failed'; }
}

export function download(pdf: Blob, fileName: string): boolean {
  try {
    const url = URL.createObjectURL(pdf);
    const a = document.createElement('a');
    a.href = url; a.download = fileName; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    return true;
  } catch { return false; }
}
