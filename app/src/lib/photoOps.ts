// Photo Studio pixel work. Everything runs on the phone (no upload, no AI service). The functions work on plain RGBA pixel
// arrays, so they are tested in Node; lib/photoStudio.ts feeds them with real pictures from a canvas.
//
// What this does and does NOT do:
//  - Enhance: auto brightness (levels), brightness, contrast, colour and clarity (sharpen). Straighten, rotate, crop.
//  - Privacy masks are drawn by the agent by hand. NOTHING is detected automatically, so the agent must look over the
//    whole photo (house numbers, car plates, faces, papers, signs) before sharing.
//  - A mask replaces the pixels (solid colour or coarse blocks) in the saved picture: it cannot be undone from that file.
//    The original photo is kept unless the agent chooses to replace it.
export interface Pixels { data: Uint8ClampedArray; width: number; height: number }
/** A rectangle in 0..1 of the picture's width and height. */
export interface Rect { x: number; y: number; w: number; h: number }
export type MaskMode = 'solid' | 'pixelate';
export interface Mask extends Rect { mode: MaskMode }
export interface Enhance {
  /** Stretch the brightness range so the darkest and brightest parts use the full range. */
  auto: boolean;
  /** -100 … 100 for each. */
  brightness: number; contrast: number; colour: number;
  /** 0 … 100: how much to sharpen. */
  clarity: number;
}
export const NO_ENHANCE: Enhance = { auto: false, brightness: 0, contrast: 0, colour: 0, clarity: 0 };
export const isEnhanced = (e: Enhance) => e.auto || e.brightness !== 0 || e.contrast !== 0 || e.colour !== 0 || e.clarity !== 0;

export const clampRect = (r: Rect): Rect => {
  const x = Math.min(1, Math.max(0, r.x)), y = Math.min(1, Math.max(0, r.y));
  return { x, y, w: Math.min(1 - x, Math.max(0, r.w)), h: Math.min(1 - y, Math.max(0, r.h)) };
};
/** A rectangle from two corners given in any order. */
export const rectFrom = (ax: number, ay: number, bx: number, by: number): Rect => clampRect({ x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), h: Math.abs(by - ay) });
/** Too small to be a deliberate mask / crop (a stray tap). */
export const isTiny = (r: Rect, min = 0.02) => r.w < min || r.h < min;

const lum = (d: Uint8ClampedArray, i: number) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

/** Auto levels: finds the darkest and brightest 0.5% of the picture and stretches between them. A flat or already full-range picture is left alone. */
export function autoLevels(p: Pixels, clip = 0.005): Pixels {
  const hist = new Array<number>(256).fill(0);
  const n = p.width * p.height;
  for (let i = 0; i < p.data.length; i += 4) hist[Math.round(lum(p.data, i))]++;
  let lo = 0, hi = 255, acc = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc > n * clip) { lo = v; break; } }
  acc = 0;
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc > n * clip) { hi = v; break; } }
  if (hi - lo < 16 || (lo <= 2 && hi >= 253)) return p;
  const scale = 255 / (hi - lo);
  const out = new Uint8ClampedArray(p.data);
  for (let i = 0; i < out.length; i += 4) for (let c = 0; c < 3; c++) out[i + c] = (out[i + c] - lo) * scale;
  return { data: out, width: p.width, height: p.height };
}

/** Brightness, contrast and colour (saturation), each -100 … 100. 0 changes nothing. */
export function adjust(p: Pixels, o: Pick<Enhance, 'brightness' | 'contrast' | 'colour'>): Pixels {
  if (!o.brightness && !o.contrast && !o.colour) return p;
  const out = new Uint8ClampedArray(p.data);
  const add = (o.brightness / 100) * 80;
  const k = 1 + o.contrast / 100;
  const sat = 1 + o.colour / 100;
  for (let i = 0; i < out.length; i += 4) {
    const l = lum(out, i);
    for (let c = 0; c < 3; c++) {
      let v = l + (out[i + c] - l) * sat;       // colour
      v = (v - 128) * k + 128 + add;            // contrast then brightness
      out[i + c] = v;
    }
  }
  return { data: out, width: p.width, height: p.height };
}

/** Clarity: unsharp mask with a 3×3 average. amount 0 … 100. */
export function sharpen(p: Pixels, amount: number): Pixels {
  if (amount <= 0) return p;
  const { width: w, height: h } = p;
  const out = new Uint8ClampedArray(p.data);
  const a = (amount / 100) * 1.2;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = (y * w + x) * 4;
    for (let c = 0; c < 3; c++) {
      let sum = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) sum += p.data[((y + dy) * w + (x + dx)) * 4 + c];
      const blur = sum / 9;
      out[i + c] = p.data[i + c] + (p.data[i + c] - blur) * a;
    }
  }
  return { data: out, width: w, height: h };
}

export function enhance(p: Pixels, e: Enhance): Pixels {
  let r = p;
  if (e.auto) r = autoLevels(r);
  r = adjust(r, e);
  r = sharpen(r, e.clarity);
  return r;
}

/** Covers a rectangle for good: a solid dark block, or coarse blocks of the average colour (readable text becomes impossible at this block size). */
export function applyMask(p: Pixels, m: Mask, colour: [number, number, number] = [20, 20, 20]): Pixels {
  const r = clampRect(m);
  const x0 = Math.floor(r.x * p.width), y0 = Math.floor(r.y * p.height);
  const x1 = Math.min(p.width, Math.ceil((r.x + r.w) * p.width)), y1 = Math.min(p.height, Math.ceil((r.y + r.h) * p.height));
  if (x1 <= x0 || y1 <= y0) return p;
  const out = new Uint8ClampedArray(p.data);
  if (m.mode === 'solid') {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * p.width + x) * 4; out[i] = colour[0]; out[i + 1] = colour[1]; out[i + 2] = colour[2]; out[i + 3] = 255; }
  } else {
    // At most 6 blocks across the shorter side of the area: far too coarse to read characters or recognise a face.
    const block = Math.max(2, Math.ceil(Math.min(x1 - x0, y1 - y0) / 6));
    for (let by = y0; by < y1; by += block) for (let bx = x0; bx < x1; bx += block) {
      const ex = Math.min(x1, bx + block), ey = Math.min(y1, by + block);
      let rr = 0, gg = 0, bb = 0, n = 0;
      for (let y = by; y < ey; y++) for (let x = bx; x < ex; x++) { const i = (y * p.width + x) * 4; rr += p.data[i]; gg += p.data[i + 1]; bb += p.data[i + 2]; n++; }
      for (let y = by; y < ey; y++) for (let x = bx; x < ex; x++) { const i = (y * p.width + x) * 4; out[i] = rr / n; out[i + 1] = gg / n; out[i + 2] = bb / n; out[i + 3] = 255; }
    }
  }
  return { data: out, width: p.width, height: p.height };
}
export const applyMasks = (p: Pixels, masks: Mask[]): Pixels => masks.reduce((acc, m) => applyMask(acc, m), p);

// ---------- geometry ----------
/** Largest axis-aligned rectangle (same shape as the picture) that fits inside the picture after it is turned by `deg`:
 *  cropping to it removes the empty corners a straighten would leave. Returns the size as a fraction of the original. */
export function straightenFit(w: number, h: number, deg: number): { w: number; h: number } {
  const a = Math.abs((deg * Math.PI) / 180);
  if (a < 1e-6) return { w, h };
  const sin = Math.sin(a), cos = Math.cos(a);
  const longSide = Math.max(w, h), shortSide = Math.min(w, h);
  let rw: number, rh: number;
  if (shortSide <= 2 * sin * cos * longSide || Math.abs(sin - cos) < 1e-10) {
    const half = 0.5 * shortSide;
    if (w >= h) { rw = half / sin; rh = half / cos; } else { rw = half / cos; rh = half / sin; }
  } else {
    const c2 = cos * cos - sin * sin;
    rw = (w * cos - h * sin) / c2; rh = (h * cos - w * sin) / c2;
  }
  return { w: Math.min(w, Math.max(1, rw)), h: Math.min(h, Math.max(1, rh)) };
}

/** Output size for a longest-side limit (never enlarges). */
export function fitSize(w: number, h: number, maxSide: number): { w: number; h: number } {
  const s = Math.min(1, maxSide / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}

/** How the saved copy is labelled. */
export type EditKind = 'enhanced' | 'masked' | 'both';
export const editKind = (enhanced: boolean, masked: boolean): EditKind | undefined => (enhanced && masked ? 'both' : masked ? 'masked' : enhanced ? 'enhanced' : undefined);
