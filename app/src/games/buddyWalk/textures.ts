// v1buddychange014: Buddy Walk's wall pictures (64 x 64 pixels each): the plain gallery wall, the end walls, and one
// gold frame per listing holding its main photo, or a small pixel house when there is no photo or it cannot be read.
import type { Texture } from './render';

export const TEX = 64;
const BG = '#0E0E10', GOLD = '#D8B95C', PALE = '#F6E3A1', DEEP = '#6E5A26';
/** Where the photo sits inside a frame. */
const PHOTO = { x: 9, y: 9, w: 46, h: 34 };

function canvas(): { c: HTMLCanvasElement; g: CanvasRenderingContext2D } | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = TEX; c.height = TEX;
  const g = c.getContext('2d');
  return g ? { c, g } : null;
}
function read(g: CanvasRenderingContext2D): Texture {
  const d = g.getImageData(0, 0, TEX, TEX);
  return { w: TEX, h: TEX, data: new Uint32Array(d.data.buffer.slice(0)) };
}
/** A flat texture, used when the browser cannot draw (it never happens in the app, but tests and old phones stay safe). */
export function solidTexture(r: number, g: number, b: number): Texture {
  const data = new Uint32Array(TEX * TEX).fill(((255 << 24) | (b << 16) | (g << 8) | r) >>> 0);
  return { w: TEX, h: TEX, data };
}

function wallBase(g: CanvasRenderingContext2D) {
  g.fillStyle = '#1A1916'; g.fillRect(0, 0, TEX, TEX);
  // Dark panelling with a gold skirting and a thin picture rail.
  g.fillStyle = '#211F1B';
  for (let y = 0; y < TEX; y += 8) for (let x = (y / 8) % 2 ? 0 : 8; x < TEX; x += 16) g.fillRect(x, y, 15, 7);
  g.fillStyle = DEEP; g.fillRect(0, 56, TEX, 2); g.fillRect(0, 4, TEX, 1);
  g.fillStyle = GOLD; g.fillRect(0, 58, TEX, 6);
  g.fillStyle = '#3A3020'; g.fillRect(0, 63, TEX, 1);
}

export function wallTexture(): Texture {
  const k = canvas(); if (!k) return solidTexture(0x1A, 0x19, 0x16);
  wallBase(k.g);
  // A small gold wall lamp in the middle.
  k.g.fillStyle = DEEP; k.g.fillRect(30, 18, 4, 10);
  k.g.fillStyle = PALE; k.g.fillRect(28, 14, 8, 5);
  return read(k.g);
}

export function endTexture(): Texture {
  const k = canvas(); if (!k) return solidTexture(0x22, 0x1E, 0x14);
  wallBase(k.g);
  const g = k.g;
  // A tall gold double door at the end of the gallery.
  g.fillStyle = GOLD; g.fillRect(14, 10, 36, 48);
  g.fillStyle = '#2A2418'; g.fillRect(17, 13, 14, 45); g.fillRect(33, 13, 14, 45);
  g.fillStyle = PALE; g.fillRect(28, 34, 2, 4); g.fillRect(34, 34, 2, 4);
  g.fillStyle = DEEP; g.fillRect(14, 8, 36, 2);
  return read(g);
}

export type HouseKind = 'house' | 'tower' | 'factory' | 'land';
export function houseKind(type?: string): HouseKind {
  if (!type) return 'house';
  if (/condo|apartment|office/i.test(type)) return 'tower';
  if (/factory|warehouse|shoplot/i.test(type)) return 'factory';
  if (/land/i.test(type)) return 'land';
  return 'house';
}

/** The pixel picture used when a listing has no photo (or its photo cannot be read). */
function drawPlaceholder(g: CanvasRenderingContext2D, kind: HouseKind) {
  const { x, y, w, h } = PHOTO;
  g.fillStyle = '#1C2230'; g.fillRect(x, y, w, h);          // night sky
  g.fillStyle = '#2B3346'; g.fillRect(x, y + 14, w, 8);
  g.fillStyle = PALE; g.fillRect(x + 38, y + 4, 3, 3);      // moon
  g.fillStyle = '#2E3B22'; g.fillRect(x, y + h - 6, w, 6);  // grass
  const base = y + h - 6;
  if (kind === 'tower') {
    g.fillStyle = GOLD; g.fillRect(x + 14, y + 6, 16, base - y - 6);
    g.fillStyle = BG; for (let r = y + 9; r < base - 3; r += 5) for (let c = x + 16; c < x + 28; c += 5) g.fillRect(c, r, 3, 2);
  } else if (kind === 'factory') {
    g.fillStyle = GOLD; g.fillRect(x + 6, base - 14, 34, 14);
    g.fillRect(x + 6, base - 18, 8, 4); g.fillRect(x + 18, base - 18, 8, 4); g.fillRect(x + 30, base - 18, 8, 4);
    g.fillStyle = DEEP; g.fillRect(x + 34, base - 26, 4, 12);
    g.fillStyle = BG; g.fillRect(x + 18, base - 9, 10, 9);
  } else if (kind === 'land') {
    g.fillStyle = '#4C6630'; g.fillRect(x, base - 3, w, 3);
    g.fillStyle = GOLD; g.fillRect(x + 30, base - 14, 2, 14); g.fillRect(x + 32, base - 14, 8, 5); // a For Sale sign
    g.fillStyle = '#3F5A2A'; g.fillRect(x + 8, base - 16, 10, 10);
    g.fillStyle = DEEP; g.fillRect(x + 12, base - 6, 2, 6);
  } else {
    g.fillStyle = GOLD; g.fillRect(x + 12, base - 14, 22, 14);
    g.fillStyle = PALE;
    for (let i = 0; i < 9; i++) g.fillRect(x + 23 - i - 2, base - 15 - i, (i + 2) * 2 + 1, 1); // roof
    g.fillStyle = BG; g.fillRect(x + 20, base - 8, 6, 8);
    g.fillStyle = '#F6E3A1'; g.fillRect(x + 14, base - 11, 4, 4); g.fillRect(x + 28, base - 11, 4, 4);
  }
}

/** Draws the photo cut to fill the frame (like a cover photo), without smoothing so it stays pixel-sharp. */
function drawPhoto(g: CanvasRenderingContext2D, img: CanvasImageSource & { width: number; height: number }) {
  const { x, y, w, h } = PHOTO;
  const iw = img.width || 1, ih = img.height || 1;
  const s = Math.max(w / iw, h / ih);
  const sw = w / s, sh = h / s;
  g.imageSmoothingEnabled = true;
  g.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h);
}

/** A digit-only label in a 3 x 5 pixel font, so it reads the same in every language and needs no font. */
const DIGITS = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001', '111100111001111', '111100111101111', '111001001001001', '111101111101111', '111101111001111'];
function drawNumber(g: CanvasRenderingContext2D, n: number, cx: number, y: number) {
  const s = String(n);
  const width = s.length * 4 - 1;
  let x = Math.round(cx - width / 2);
  for (const ch of s) {
    const bits = DIGITS[Number(ch)] ?? DIGITS[0];
    for (let i = 0; i < 15; i++) if (bits[i] === '1') g.fillRect(x + (i % 3), y + Math.floor(i / 3), 1, 1);
    x += 4;
  }
}

export interface PanelLook { number: number; kind: HouseKind; visited: boolean }
/**
 * One listing's frame. With a photo the picture is drawn into the frame; if the browser will not let the picture be read
 * back (a photo from another site without permission), the pixel house is used instead, so the walk never breaks.
 */
export function panelTexture(look: PanelLook, img?: (CanvasImageSource & { width: number; height: number }) | null): Texture {
  const k = canvas(); if (!k) return solidTexture(0xD8, 0xB9, 0x5C);
  const g = k.g;
  const paint = (withPhoto: boolean) => {
    wallBase(g);
    g.fillStyle = DEEP; g.fillRect(5, 5, 54, 42);
    g.fillStyle = GOLD; g.fillRect(6, 6, 52, 40);
    g.fillStyle = PALE; g.fillRect(6, 6, 52, 1); g.fillRect(6, 6, 1, 40);
    g.fillStyle = BG; g.fillRect(8, 8, 48, 36);
    if (withPhoto && img) drawPhoto(g, img); else drawPlaceholder(g, look.kind);
    // The brass number plate under the frame.
    g.fillStyle = GOLD; g.fillRect(24, 48, 16, 8);
    g.fillStyle = BG; drawNumber(g, look.number, 32, 49);
    if (look.visited) {
      // A gold tick in the frame's corner once the listing has been visited.
      g.fillStyle = BG; g.fillRect(44, 9, 11, 9);
      g.fillStyle = PALE;
      g.fillRect(46, 13, 2, 2); g.fillRect(47, 14, 2, 2); g.fillRect(48, 15, 2, 2);
      g.fillRect(50, 13, 2, 2); g.fillRect(51, 12, 2, 2); g.fillRect(52, 11, 2, 2);
    }
  };
  paint(Boolean(img));
  try { return read(g); } catch { paint(false); }
  try { return read(g); } catch { return solidTexture(0xD8, 0xB9, 0x5C); }
}

/** A small copy of a photo (twice the frame's size), so the full-size picture does not stay in the phone's memory. */
export function thumbnail(img: HTMLImageElement): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = PHOTO.w * 2; c.height = PHOTO.h * 2;
  const g = c.getContext('2d');
  if (!g) return null;
  const iw = img.naturalWidth || img.width || 1, ih = img.naturalHeight || img.height || 1;
  const s = Math.max(c.width / iw, c.height / ih);
  const sw = c.width / s, sh = c.height / s;
  g.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, 0, 0, c.width, c.height);
  return c;
}

/** Loads a picture for the canvas. Pictures from the internet ask for permission to be read (crossOrigin), so a
 *  cloud photo can be drawn; one that refuses simply shows the pixel house. Resolves null on any failure. */
export function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise(res => {
    if (typeof Image === 'undefined') { res(null); return; }
    const img = new Image();
    if (/^https?:/i.test(url)) img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = url;
  });
}
