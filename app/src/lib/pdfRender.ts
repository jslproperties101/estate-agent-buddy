// Browser side of the PDF maker: measures and draws the laid-out pages on a canvas and turns them into JPEG pictures
// for buildPdf(). Everything runs on the phone. See lib/pdf.ts for the layout and the file writer.
import { Doc, Font, JpegPage, Page, PAGE_H, PAGE_W, buildPdf, layoutDocument } from './pdf';
import { isNative, plugin, pluginMissing } from '../native/native';

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
    else if (it.k === 'text') {
      ctx.save();
      ctx.font = css(it.font); ctx.fillStyle = it.font.colour; ctx.textAlign = it.align ?? 'left';
      if (it.alpha !== undefined) ctx.globalAlpha = it.alpha;
      if (it.rotate) { ctx.translate(it.x, it.y); ctx.rotate((it.rotate * Math.PI) / 180); ctx.fillText(it.text, 0, 0); }
      else ctx.fillText(it.text, it.x, it.y);
      ctx.restore();
    }
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

/** Draws ready-laid-out pages into a PDF, one page at a time, reporting progress. Stops (throws 'cancelled') as soon as
 *  `cancelled()` says so, so a cancelled export never produces a file. */
export async function renderPagesToPdf(pages: Page[], title: string, opts: { onProgress?: (done: number, total: number) => void; cancelled?: () => boolean } = {}): Promise<Blob> {
  const srcs = [...new Set(pages.flatMap(p => p.items.filter(i => i.k === 'image').map(i => (i as { src: string }).src)))];
  const images = new Map<string, HTMLImageElement | undefined>();
  await Promise.all(srcs.map(async s => { images.set(s, await loadImage(s)); }));
  const jpegs: JpegPage[] = [];
  for (let i = 0; i < pages.length; i++) {
    if (opts.cancelled?.()) throw new Error('cancelled');
    const canvas = await drawPage(pages[i], images);
    const blob = await toJpeg(canvas);
    jpegs.push({ data: new Uint8Array(await blob.arrayBuffer()), w: canvas.width, h: canvas.height });
    opts.onProgress?.(i + 1, pages.length);
    await new Promise(r => setTimeout(r, 0));
  }
  if (opts.cancelled?.()) throw new Error('cancelled');
  return new Blob([buildPdf(jpegs, { title }) as BlobPart], { type: 'application/pdf' });
}

/** A file name that is safe on every system. */
export const pdfFileName = (base: string) => `${(base || 'document').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'document'}.pdf`;

export type ShareResult = 'shared' | 'downloaded' | 'cancelled' | 'failed' | 'unsupported' | 'needApk';

/** Where a saved file went (Android: Downloads, and the Gallery for pictures; older APKs: Documents; browser: the downloads).
 *  `open` (Android only) is the saved copy that the Open button hands to the phone. */
export interface SaveResult { ok: boolean; where?: string; reason?: 'failed' | 'needApk' | 'noFile'; open?: { uri: string; mime: string }; gallery?: boolean }

/** Folder inside the phone's public Documents folder that saved files go to in the Android app. */
export const SAVE_FOLDER = 'Estate Agent Buddy';

/** Base64 of a file, for the native file plugin (which takes text, not binary). */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => { const u = String(r.result ?? ''); res(u.slice(u.indexOf(',') + 1)); };
    r.onerror = () => rej(r.error ?? new Error('read failed'));
    r.readAsDataURL(blob);
  });
}

/* Change 013 (bug: Download PDF and Share PDF did nothing in the Android app). Inside the app's Android WebView a
 * "download" link and the browser share call do nothing, so the Android app uses its own file and share features:
 *  - Download: the file is written to Documents/Estate Agent Buddy on the phone (Capacitor Filesystem), where the
 *    Files app, WhatsApp and Gmail can find it;
 *  - Share: the file is written to the app's cache and handed to Android's own share sheet (Capacitor Share, which
 *    gives the receiving app read access through its FileProvider), so WhatsApp, Gmail and others can attach it.
 * In a browser the normal download and share are used, and a browser that cannot share files says so. */
type FsPlugin = {
  writeFile(o: { path: string; data: string; directory: string; recursive?: boolean }): Promise<{ uri: string }>;
};
/** JoyChange003 Change 77: the app's own file plugin (scripts/android-setup.mjs writes it into the APK). */
type EabFilesPlugin = {
  saveToPublic(o: { name: string; mime: string; data: string; image: boolean }): Promise<{ download: string; gallery?: string }>;
  open(o: { uri: string; mime: string }): Promise<void>;
};
const IMAGE = /^image\/(png|jpe?g|webp)$/;
/** The type of a file from its blob, else from its name. */
export function mimeOf(blob: Blob, fileName: string): string {
  if (blob.type) return blob.type;
  const ext = fileName.split('.').pop()?.toLowerCase();
  return ext === 'pdf' ? 'application/pdf' : ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp'
    : ext === 'csv' ? 'text/csv' : ext === 'json' ? 'application/json' : 'application/octet-stream';
}
/** Pictures also go to the Gallery; everything goes to Downloads. */
export const goesToGallery = (mime: string) => IMAGE.test(mime);
type SharePlugin = { share(o: { title?: string; dialogTitle?: string; files?: string[]; url?: string }): Promise<unknown>; canShare?: () => Promise<{ value: boolean }> };

/** Saves a finished file where the person can find it again. Never throws. */
export async function saveFile(blob: Blob | null | undefined, fileName: string): Promise<SaveResult> {
  if (!blob || !blob.size) return { ok: false, reason: 'noFile' };
  if (isNative()) {
    const mime = mimeOf(blob, fileName);
    // Change 77: Downloads (and the Gallery for pictures), where Android's own apps list them.
    const files = plugin<EabFilesPlugin>('EabFiles');
    if (files && !pluginMissing('EabFiles')) {
      try {
        const image = goesToGallery(mime);
        const r = await files.saveToPublic({ name: fileName, mime, data: await blobToBase64(blob), image });
        return { ok: true, where: `Download/${SAVE_FOLDER}`, gallery: image && !!r.gallery, open: { uri: r.gallery ?? r.download, mime } };
      } catch { /* an older Android without permission: fall back to Documents below */ }
    }
    const fs = plugin<FsPlugin>('Filesystem');
    if (!fs || pluginMissing('Filesystem')) return { ok: false, reason: 'needApk' };
    try {
      const path = `${SAVE_FOLDER}/${fileName}`;
      const w = await fs.writeFile({ path, data: await blobToBase64(blob), directory: 'DOCUMENTS', recursive: true });
      return { ok: true, where: `Documents/${path}`, open: files && !pluginMissing('EabFiles') && w?.uri ? { uri: w.uri, mime } : undefined };
    } catch { return { ok: false, reason: 'failed' }; }
  }
  return download(blob, fileName) ? { ok: true } : { ok: false, reason: 'failed' };
}

/** Change 77: hands a saved file to the app that shows it (Gallery, PDF viewer). False when the phone cannot. */
export async function openSaved(o: { uri: string; mime: string }): Promise<boolean> {
  const files = plugin<EabFilesPlugin>('EabFiles');
  if (!files || pluginMissing('EabFiles')) return false;
  try { await files.open(o); return true; } catch { return false; }
}

/** Opens the share sheet with the file attached (WhatsApp, Gmail…). In a browser that cannot share files the result is
 *  'unsupported' (the screen offers Download instead); nothing is downloaded behind the person's back. */
export async function shareFile(blob: Blob | null | undefined, fileName: string, title: string, mime = 'application/pdf'): Promise<ShareResult> {
  if (!blob || !blob.size) return 'failed';
  if (isNative()) {
    const fs = plugin<FsPlugin>('Filesystem');
    const sh = plugin<SharePlugin>('Share');
    if (!fs || !sh || pluginMissing('Filesystem') || pluginMissing('Share')) return 'needApk';
    try {
      const w = await fs.writeFile({ path: `share/${fileName}`, data: await blobToBase64(blob), directory: 'CACHE', recursive: true });
      await sh.share({ title, dialogTitle: title, files: [w.uri] });
      return 'shared';
    } catch (e) {
      const m = String((e as Error)?.message ?? e).toLowerCase();
      return m.includes('cancel') ? 'cancelled' : 'failed';
    }
  }
  try {
    const file = new File([blob], fileName, { type: mime });
    const nav = navigator as Navigator & { canShare?: (d: object) => boolean; share?: (d: object) => Promise<void> };
    if (!(nav.canShare?.({ files: [file] }) && nav.share)) return 'unsupported';
    try { await nav.share({ files: [file], title }); return 'shared'; }
    catch (e) { return (e as Error)?.name === 'AbortError' ? 'cancelled' : 'failed'; }
  } catch { return 'failed'; }
}

/** The older "share, else download" used by the backup and export screens: share when possible, otherwise save. */
export async function shareOrDownload(pdf: Blob, fileName: string, title: string, mime = 'application/pdf'): Promise<ShareResult> {
  const r = await shareFile(pdf, fileName, title, mime);
  if (r === 'shared' || r === 'cancelled' || r === 'needApk') return r;
  const saved = await saveFile(pdf, fileName);
  return saved.ok ? 'downloaded' : saved.reason === 'needApk' ? 'needApk' : 'failed';
}

/** Browser download through a temporary link. Inside the Android app use saveFile(). */
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
