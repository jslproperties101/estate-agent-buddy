// v1buddychange014: Buddy Walk's 3D view, drawn by hand into a small pixel buffer (no 3D library). One ray per screen
// column finds the wall (engine.castRay); floor and ceiling are filled row by row. The buffer is tiny (200 x 125) and
// the browser enlarges it with crisp pixels, which gives the 8-bit look and keeps the work per frame very small.
// Pure code on typed arrays: no browser parts, so it can be checked in unit tests.
import { castRay, END, PANEL0, type Player, type World } from './engine';

export const VIEW_W = 200, VIEW_H = 125;
/** Field of view: the camera plane's half-width (0.66 is about 66 degrees). */
const PLANE = 0.66;
/** How far (cells) the gallery fades into the dark. */
const FOG = 9;

export interface Texture { w: number; h: number; data: Uint32Array }

/** Packs a colour for a little-endian RGBA pixel buffer (every phone and computer we target). */
export const rgb = (r: number, g: number, b: number) => ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
const R = (c: number) => c & 255, G = (c: number) => (c >>> 8) & 255, B = (c: number) => (c >>> 16) & 255;

export const PALETTE = {
  bg: rgb(0x0E, 0x0E, 0x10), gold: rgb(0xD8, 0xB9, 0x5C), pale: rgb(0xF6, 0xE3, 0xA1),
  tileA: rgb(0x26, 0x22, 0x1A), tileB: rgb(0x16, 0x15, 0x14), grout: rgb(0x5A, 0x4A, 0x26),
  ceil: rgb(0x14, 0x13, 0x16), lamp: rgb(0xF6, 0xE3, 0xA1),
};
const FOG_R = 0x0E, FOG_G = 0x0E, FOG_B = 0x10;

/** Mixes a colour towards the dark background: k = 1 keeps it, 0 is all background. */
function shade(c: number, k: number): number {
  const r = FOG_R + (R(c) - FOG_R) * k, g = FOG_G + (G(c) - FOG_G) * k, b = FOG_B + (B(c) - FOG_B) * k;
  return rgb(r | 0, g | 0, b | 0);
}
const fogAt = (d: number) => Math.max(0, Math.min(1, 1 - d / FOG));

export interface FrameOpts {
  /** The listing in front of the agent: its frame is drawn a little brighter. */
  highlight?: number;
}

/**
 * Draws one frame into `buf` (VIEW_W x VIEW_H pixels). `tex(cell)` gives the texture for a wall cell
 * (plain wall, end wall, or a listing's frame). Returns the distance to the wall straight ahead.
 */
export function renderFrame(buf: Uint32Array, w: number, h: number, p: Player, world: World, tex: (cell: number) => Texture, opts: FrameOpts = {}): number {
  const dx = Math.cos(p.a), dy = Math.sin(p.a);
  const px = dy * PLANE, py = -dx * PLANE;
  const half = h / 2;
  // Height in pixels of a wall one cell away, so walls keep their true shape whatever the picture's width and height.
  const proj = w / (2 * PLANE);

  // Floor and ceiling, one row at a time (the floor row and its mirror on the ceiling share the same distance).
  const r0x = dx - px, r0y = dy - py, r1x = dx + px, r1y = dy + py;
  for (let y = Math.ceil(half); y < h; y++) {
    const rowDist = (0.5 * proj) / (y - half + 0.5);
    const stepX = (rowDist * (r1x - r0x)) / w, stepY = (rowDist * (r1y - r0y)) / w;
    let fx = p.x + rowDist * r0x, fy = p.y + rowDist * r0y;
    const k = fogAt(rowDist);
    const tA = shade(PALETTE.tileA, k), tB = shade(PALETTE.tileB, k), gr = shade(PALETTE.grout, k);
    const cl = shade(PALETTE.ceil, k), lp = shade(PALETTE.lamp, k);
    const floorRow = y * w, ceilRow = (h - 1 - y) * w;
    for (let x = 0; x < w; x++) {
      const cx = Math.floor(fx), cy = Math.floor(fy);
      const ux = fx - cx, uy = fy - cy;
      // Floor: chequered tiles with thin gold grout.
      buf[floorRow + x] = ux < 0.05 || uy < 0.05 ? gr : ((cx + cy) & 1) ? tA : tB;
      // Ceiling: dark, with a warm lamp over the middle of every second row.
      buf[ceilRow + x] = (cy & 1) && ux > 0.3 && ux < 0.7 && uy > 0.35 && uy < 0.65 ? lp : cl;
      fx += stepX; fy += stepY;
    }
  }

  // Walls, one column at a time.
  let ahead = 0;
  for (let x = 0; x < w; x++) {
    const camX = (2 * x) / w - 1;
    const rdx = dx + px * camX, rdy = dy + py * camX;
    const hit = castRay(world, p.x, p.y, rdx, rdy);
    if (x === w >> 1) ahead = hit.dist;
    const t = tex(hit.cell);
    const lineH = proj / hit.dist;
    const top = half - lineH / 2;
    const y0 = Math.max(0, Math.ceil(top)), y1 = Math.min(h, Math.ceil(top + lineH));
    const texX = Math.min(t.w - 1, Math.max(0, Math.floor(hit.wallX * t.w)));
    let k = fogAt(hit.dist) * (hit.side === 1 ? 0.78 : 1);
    if (opts.highlight !== undefined && hit.cell === PANEL0 + opts.highlight) k = Math.min(1, k * 1.18 + 0.08);
    if (hit.cell === END) k *= 0.95;
    const step = t.h / lineH;
    let ty = (y0 - top) * step;
    for (let y = y0; y < y1; y++) {
      const c = t.data[Math.min(t.h - 1, ty | 0) * t.w + texX];
      buf[y * w + x] = k >= 0.999 ? c : shade(c, k);
      ty += step;
    }
  }
  return ahead;
}
