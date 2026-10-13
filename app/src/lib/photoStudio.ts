// Browser side of the Photo Studio: loads a picture, applies the edit (turn, straighten, crop, enhance, hand-drawn masks)
// on a canvas and gives back a JPEG. Nothing is uploaded. Saving as JPEG from a canvas also drops the camera's hidden
// data (such as GPS position) from the saved copy; the original file is untouched.
import { Enhance, Mask, NO_ENHANCE, Rect, applyMasks, clampRect, enhance, fitSize, isEnhanced, straightenFit } from './photoOps';

export interface PhotoEdit {
  /** Quarter turns clockwise. */
  turns: 0 | 1 | 2 | 3;
  /** Degrees, -10 … 10: levels a sloping horizon or wall. */
  straighten: number;
  crop?: Rect;
  enhance: Enhance;
  masks: Mask[];
}
export const NO_EDIT: PhotoEdit = { turns: 0, straighten: 0, enhance: NO_ENHANCE, masks: [] };
export const hasGeometry = (e: PhotoEdit) => e.turns !== 0 || e.straighten !== 0 || !!e.crop;
export const hasEnhance = (e: PhotoEdit) => isEnhanced(e.enhance) || hasGeometry(e);
export const hasChange = (e: PhotoEdit) => hasEnhance(e) || e.masks.length > 0;

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('Could not open the picture')); im.src = src; });
}
const canvas = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };

/** Turn, straighten and crop (no colour work, no masks). */
export function renderGeometry(img: HTMLImageElement, e: PhotoEdit, maxSide: number): HTMLCanvasElement {
  const sw = img.naturalWidth, sh = img.naturalHeight;
  const small = fitSize(sw, sh, maxSide);
  const swap = e.turns % 2 === 1;
  const c1 = canvas(swap ? small.h : small.w, swap ? small.w : small.h);
  const x1 = c1.getContext('2d') as CanvasRenderingContext2D;
  x1.translate(c1.width / 2, c1.height / 2);
  x1.rotate((e.turns * Math.PI) / 2);
  x1.drawImage(img, -small.w / 2, -small.h / 2, small.w, small.h);
  let cur = c1;
  if (e.straighten) {
    const fit = straightenFit(cur.width, cur.height, e.straighten);
    const c2 = canvas(fit.w, fit.h);
    const x2 = c2.getContext('2d') as CanvasRenderingContext2D;
    x2.translate(c2.width / 2, c2.height / 2);
    x2.rotate((e.straighten * Math.PI) / 180);
    x2.drawImage(cur, -cur.width / 2, -cur.height / 2);
    cur = c2;
  }
  if (e.crop) {
    const r = clampRect(e.crop);
    const c3 = canvas(r.w * cur.width, r.h * cur.height);
    (c3.getContext('2d') as CanvasRenderingContext2D).drawImage(cur, r.x * cur.width, r.y * cur.height, r.w * cur.width, r.h * cur.height, 0, 0, c3.width, c3.height);
    cur = c3;
  }
  return cur;
}

/** The finished picture: geometry, then enhancement, then masks (masks last, so nothing changes the covered pixels afterwards). */
export function renderEdit(img: HTMLImageElement, e: PhotoEdit, maxSide: number, withMasks = true): HTMLCanvasElement {
  const c = renderGeometry(img, e, maxSide);
  const ctx = c.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
  let px = ctx.getImageData(0, 0, c.width, c.height);
  if (isEnhanced(e.enhance)) px = new ImageData(enhance(px, e.enhance).data as Uint8ClampedArray<ArrayBuffer>, c.width, c.height);
  if (withMasks && e.masks.length) px = new ImageData(applyMasks(px, e.masks).data as Uint8ClampedArray<ArrayBuffer>, c.width, c.height);
  ctx.putImageData(px, 0, 0);
  return c;
}

export const toJpeg = (c: HTMLCanvasElement, quality = 0.88): Promise<Blob> =>
  new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('Could not save the picture'))), 'image/jpeg', quality));
