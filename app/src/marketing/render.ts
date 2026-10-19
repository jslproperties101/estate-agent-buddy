// Marketing Studio drawing: paints ONE chosen format (A4 flyer, square post or portrait post) on a canvas from the
// content decided in marketing/content.ts, then writes it as PDF, PNG, JPG or WebP. Runs on the phone; nothing is uploaded.
// Brand: black, gold and white (the same palette as the app). No artwork is invented: a design without a photo is a plain
// gold-on-black (or gold-on-white) panel.
import { buildPdf } from '../lib/pdf';
import { FORMATS, FormatId, MIME, OutputId, PosterContent, PosterFact } from './content';

/** JoyChange003 Change 81: poster styles. "dark" (Black and Gold) and "light" (White and Gold) are the two older ones. */
export type Theme = 'dark' | 'light' | 'navy' | 'burgundy' | 'charcoal' | 'cream' | 'mono' | 'sky';
export const THEMES: Theme[] = ['dark', 'light', 'navy', 'burgundy', 'charcoal', 'cream', 'mono', 'sky'];
const FAMILY = '"Noto Sans SC","PingFang SC","Microsoft YaHei",system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif';
/** `gold` is the style's accent (silver, black or sky blue in the styles that have no gold); `rgb` is the background for the fade over the photo. */
export const PALETTE: Record<Theme, Pal> = {
  dark: { bg: '#08080A', panel: '#131316', ink: '#F7F4EC', muted: '#BEB7A6', gold: '#D4AF37', onGold: '#111111', line: '#4A4231', warn: '#F0B429', rgb: '8,8,10' },
  light: { bg: '#FFFFFF', panel: '#F6F1E3', ink: '#111111', muted: '#5B5546', gold: '#A87F1B', onGold: '#FFFFFF', line: '#D9CFB4', warn: '#8A5A00', rgb: '255,255,255' },
  navy: { bg: '#0B1A33', panel: '#13284A', ink: '#F7F4EC', muted: '#B9C2D3', gold: '#D4AF37', onGold: '#0B1A33', line: '#3A4A66', warn: '#F0B429', rgb: '11,26,51' },
  burgundy: { bg: '#3B0A14', panel: '#561424', ink: '#F9F1EC', muted: '#D9B9BE', gold: '#D4AF37', onGold: '#3B0A14', line: '#7A3442', warn: '#F0B429', rgb: '59,10,20' },
  charcoal: { bg: '#26282B', panel: '#33363A', ink: '#F2F2F2', muted: '#B5B8BC', gold: '#C9CCD1', onGold: '#1C1D1F', line: '#55595E', warn: '#F0B429', rgb: '38,40,43' },
  cream: { bg: '#F7F0E1', panel: '#EFE4CC', ink: '#2A2418', muted: '#6B5E44', gold: '#A87F1B', onGold: '#FFFFFF', line: '#D9C9A3', warn: '#8A5A00', rgb: '247,240,225' },
  mono: { bg: '#FFFFFF', panel: '#F2F2F2', ink: '#000000', muted: '#555555', gold: '#000000', onGold: '#FFFFFF', line: '#CCCCCC', warn: '#8A5A00', rgb: '255,255,255' },
  sky: { bg: '#EAF5FD', panel: '#FFFFFF', ink: '#0F2A44', muted: '#4E6A85', gold: '#2F8FD8', onGold: '#FFFFFF', line: '#BFDDF3', warn: '#8A5A00', rgb: '234,245,253' },
};
type Ctx = CanvasRenderingContext2D;

const font = (px: number, bold = false) => `${bold ? '700 ' : '400 '}${px}px ${FAMILY}`;
function lines(ctx: Ctx, text: string, maxW: number, maxLines: number): string[] {
  const out: string[] = [];
  let cur = '';
  // Break on spaces; a long unbroken run (Chinese text) breaks by character.
  const tokens = text.split(/(\s+)/).flatMap(t => (ctx.measureText(t).width > maxW ? [...t] : [t]));
  for (const t of tokens) {
    const test = cur + t;
    if (ctx.measureText(test.trimEnd()).width <= maxW || !cur) cur = test;
    else { out.push(cur.trimEnd()); cur = t.trimStart(); }
  }
  if (cur.trim()) out.push(cur.trimEnd());
  if (out.length > maxLines) {
    const kept = out.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (last.length > 1 && ctx.measureText(last + '…').width > maxW) last = last.slice(0, -1);
    kept[maxLines - 1] = last.trimEnd() + '…';
    return kept;
  }
  return out;
}
function cover(ctx: Ctx, img: HTMLImageElement | undefined, x: number, y: number, w: number, h: number, fallback: string) {
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  if (!img) { ctx.fillStyle = fallback; ctx.fillRect(x, y, w, h); }
  else {
    const r = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    const sw = w / r, sh = h / r;
    ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
  }
  ctx.restore();
}
function round(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
const factText = (f: PosterFact) => `${f.value}${f.unverified ? ' *' : ''}`;
/** For the one-line chips of the post designs: the label without its bracketed unit, then the value ("Bedrooms 4", "Built-up 1,800 sq ft"). */
const chipText = (f: PosterFact) => `${f.label.replace(/\s*[(（].*?[)）]/g, '').trim()} ${factText(f)}`;

export interface Pal { bg: string; panel: string; ink: string; muted: string; gold: string; onGold: string; line: string; warn: string; rgb: string }

function ribbon(ctx: Ctx, c: PosterContent, p: Pal, x: number, y: number, size: number) {
  if (!c.ribbon) return 0;
  ctx.font = font(size, true);
  const w = ctx.measureText(c.ribbon.toUpperCase()).width + size * 1.4, h = size * 1.9;
  ctx.fillStyle = p.gold; round(ctx, x, y, w, h, h / 2); ctx.fill();
  ctx.fillStyle = p.onGold; ctx.textBaseline = 'middle'; ctx.fillText(c.ribbon.toUpperCase(), x + size * 0.7, y + h / 2 + 1); ctx.textBaseline = 'alphabetic';
  return w;
}
function sampleBand(ctx: Ctx, c: PosterContent, W: number, size: number) {
  if (!c.sample) return;
  ctx.fillStyle = '#B3261E'; ctx.fillRect(0, 0, W, size * 1.9);
  ctx.fillStyle = '#fff'; ctx.font = font(size, true); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(c.sampleLabel, W / 2, size * 0.95 + 1); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
}
function priceBlock(ctx: Ctx, c: PosterContent, p: Pal, x: number, y: number, maxW: number, size: number, colour = p.gold): number {
  ctx.fillStyle = colour; ctx.font = font(size, true);
  c.prices.forEach((pr, i) => { ctx.fillText(factText(pr), x, y + i * size * 1.2, maxW); });
  return y + c.prices.length * size * 1.2;
}
function agentBlock(ctx: Ctx, c: PosterContent, p: Pal, x: number, y: number, maxW: number, size: number, align: CanvasTextAlign = 'left'): number {
  ctx.textAlign = align;
  c.agent.forEach((t, i) => { ctx.fillStyle = i === 0 ? p.ink : p.muted; ctx.font = font(size, i === 0); ctx.fillText(lines(ctx, t, maxW, 1)[0] ?? '', align === 'right' ? x + maxW : x, y + i * size * 1.35); });
  ctx.textAlign = 'left';
  return y + c.agent.length * size * 1.35;
}
function factsGrid(ctx: Ctx, c: PosterContent, p: Pal, x: number, y: number, w: number, cols: number, label: number, value: number): number {
  const cw = w / cols, rowH = (label + value) * 1.45;
  c.facts.forEach((f, i) => {
    const cx = x + (i % cols) * cw, cy = y + Math.floor(i / cols) * rowH;
    ctx.fillStyle = p.muted; ctx.font = font(label); ctx.fillText(lines(ctx, f.label, cw - 16, 1)[0] ?? '', cx, cy);
    ctx.fillStyle = p.ink; ctx.font = font(value, true); ctx.fillText(lines(ctx, factText(f), cw - 16, 1)[0] ?? '', cx, cy + value * 1.25);
  });
  return y + Math.ceil(c.facts.length / cols) * rowH;
}
function foot(ctx: Ctx, c: PosterContent, p: Pal, x: number, yBottom: number, w: number, size: number) {
  ctx.fillStyle = p.muted; ctx.font = font(size);
  const out: string[] = [];
  if (c.footnote) out.push(c.footnote);
  out.push(c.disclaimer);
  const ls = out.flatMap(t => lines(ctx, t, w, 2));
  ls.forEach((t, i) => ctx.fillText(t, x, yBottom - (ls.length - 1 - i) * size * 1.35));
}

/** A stacked section of a design: how tall it is and how to paint it at a given top. */
interface Section { h: number; paint: (y: number) => void }
const sum = (xs: Section[]) => xs.reduce((n, x) => n + x.h, 0);

/** Change 75: photos after the main one on the A4 flyer: at most this many, this many to a row. */
export const STRIP_MAX = 8, STRIP_ROW = 4;
/** Space between the last section of the A4 flyer and the gold line above its bottom bar. */
export const FOOT_GAP = 36;
/** Layout of the A4 photo strip for n photos across width w. */
export function stripGrid(n: number, w: number) {
  const cols = Math.min(STRIP_ROW, Math.max(1, n <= 4 ? n : Math.ceil(n / Math.ceil(n / STRIP_ROW)))), gap = 16;
  const tw = (w - gap * (cols - 1)) / cols;
  const th = Math.round(Math.min(190, tw * 0.75));
  return { cols, rows: Math.ceil(n / cols), tw, th, gap };
}

function drawA4(ctx: Ctx, c: PosterContent, p: Pal, imgs: (HTMLImageElement | undefined)[], W: number, H: number) {
  ctx.fillStyle = p.bg; ctx.fillRect(0, 0, W, H);
  const m = 70, cw = W - m * 2;
  // JoyChange003 Change 75: the strip under the text takes every chosen photo after the main one (up to 8), 4 to a row.
  const strip = imgs.slice(1, 1 + STRIP_MAX);
  // Bottom bar: contact lines, reference and the notes. Its height follows what is in it.
  ctx.font = font(20);
  const notes = [...(c.footnote ? [c.footnote] : []), c.disclaimer].flatMap(t => lines(ctx, t, cw, 2));
  const agentH = c.agent.length * 32 * 1.35;
  const barH = 40 + Math.max(agentH, c.ref ? 50 : 0) + 26 + notes.length * 27 + 10;
  const bottom = H - barH;
  // Sections from the top of the text area, chosen so the picture keeps at least a good part of the page.
  const build = (o: { thumbs: number; hl: number; facts: number }): Section[] => {
    const out: Section[] = [];
    ctx.font = font(66, true);
    const hl = lines(ctx, c.headline, cw, 2);
    out.push({ h: hl.length * 78 + 24, paint: y => { ctx.fillStyle = p.ink; ctx.font = font(66, true); hl.forEach((t, i) => ctx.fillText(t, m, y + 62 + i * 78)); } });
    if (c.place) out.push({ h: 62, paint: y => { ctx.fillStyle = p.muted; ctx.font = font(36); ctx.fillText(lines(ctx, c.place!, cw, 1)[0], m, y + 36); } });
    if (c.prices.length) out.push({ h: c.prices.length * 96 + 30, paint: y => { ctx.fillStyle = p.gold; ctx.fillRect(m, y, 8, c.prices.length * 96); priceBlock(ctx, c, p, m + 30, y + 74, cw - 30, 80); } });
    const facts = c.facts.slice(0, o.facts);
    if (facts.length) {
      const rows = Math.ceil(facts.length / 3), rowH = 78;
      out.push({ h: 34 + rows * rowH + 10, paint: y => { ctx.fillStyle = p.line; ctx.fillRect(m, y, cw, 2); factsGrid(ctx, { ...c, facts }, p, m, y + 52, cw, 3, 24, 32); } });
    }
    if (o.hl && c.highlights) { ctx.font = font(30); const ls = lines(ctx, c.highlights, cw, o.hl); out.push({ h: ls.length * 42 + 24, paint: y => { ctx.fillStyle = p.ink; ctx.font = font(30); ls.forEach((t, i) => ctx.fillText(t, m, y + 34 + i * 42)); } }); }
    const shown = strip.slice(0, o.thumbs * STRIP_ROW);
    if (shown.length) {
      const g = stripGrid(shown.length, cw);
      out.push({ h: 12 + g.rows * (g.th + g.gap), paint: y => { shown.forEach((im, i) => cover(ctx, im, m + (i % g.cols) * (g.tw + g.gap), y + 12 + Math.floor(i / g.cols) * (g.th + g.gap), g.tw, g.th, p.panel)); } });
    }
    return out;
  };
  const options = [{ thumbs: 2, hl: 3, facts: 9 }, { thumbs: 1, hl: 3, facts: 9 }, { thumbs: 2, hl: 2, facts: 6 }, { thumbs: 1, hl: 2, facts: 6 }, { thumbs: 1, hl: 0, facts: 6 }, { thumbs: 0, hl: 2, facts: 6 }, { thumbs: 0, hl: 0, facts: 6 }, { thumbs: 0, hl: 0, facts: 3 }];
  const minHero = imgs[0] ? 420 : 300;
  let secs = build(options[0]);
  // Change 75: a clear gap between the last section and the gold line of the bottom bar.
  for (const o of options) { secs = build(o); if (bottom - sum(secs) - 40 - FOOT_GAP >= minHero) break; }
  const heroH = Math.max(160, bottom - sum(secs) - 40 - FOOT_GAP);
  cover(ctx, imgs[0], 0, 0, W, heroH, p.panel);
  if (!imgs[0]) { ctx.fillStyle = p.gold; ctx.fillRect(0, heroH - 10, W, 10); }
  sampleBand(ctx, c, W, 34);
  ribbon(ctx, c, p, 60, c.sample ? 100 : 56, 40);
  let y = heroH + 40;
  for (const sec of secs) { sec.paint(y); y += sec.h; }
  ctx.fillStyle = p.panel; ctx.fillRect(0, bottom, W, barH);
  ctx.fillStyle = p.gold; ctx.fillRect(0, bottom, W, 6);
  agentBlock(ctx, c, p, m, bottom + 70, cw * 0.62, 32);
  if (c.ref) { ctx.fillStyle = p.gold; ctx.font = font(36, true); ctx.textAlign = 'right'; ctx.fillText(c.ref, W - m, bottom + 74); ctx.textAlign = 'left'; }
  ctx.fillStyle = p.muted; ctx.font = font(20);
  notes.forEach((t, i) => ctx.fillText(t, m, H - 20 - (notes.length - 1 - i) * 27));
}

function overlayBottom(ctx: Ctx, W: number, top: number, bottom: number, p: Pal, strength = 0.92) {
  const g = ctx.createLinearGradient(0, top, 0, bottom);
  const base = p.rgb;
  g.addColorStop(0, `rgba(${base},0)`); g.addColorStop(0.35, `rgba(${base},${strength * 0.7})`); g.addColorStop(1, `rgba(${base},${strength})`);
  ctx.fillStyle = g; ctx.fillRect(0, top, W, bottom - top);
}

function drawSquare(ctx: Ctx, c: PosterContent, p: Pal, imgs: (HTMLImageElement | undefined)[], W: number, H: number) {
  ctx.fillStyle = p.bg; ctx.fillRect(0, 0, W, H);
  cover(ctx, imgs[0], 0, 0, W, H, p.panel);
  if (!imgs[0]) { ctx.fillStyle = p.gold; ctx.fillRect(0, 0, W, 10); ctx.fillRect(0, H - 10, W, 10); }
  overlayBottom(ctx, W, H * 0.34, H, p, imgs[0] ? 0.94 : 0.0);
  sampleBand(ctx, c, W, 28);
  ribbon(ctx, c, p, 44, c.sample ? 84 : 44, 34);
  const m = 56, cw = W - m * 2;
  // bottom-up layout so the text never leaves the picture
  let y = H - 40;
  foot(ctx, c, p, m, y, cw, 17); y -= (c.footnote ? 2 : 1) * 24 + 36;
  if (c.agent.length) { const h = c.agent.length * 28 * 1.35; agentBlock(ctx, c, p, m, y - h + 28, cw, 28); if (c.ref) { ctx.fillStyle = p.gold; ctx.font = font(30, true); ctx.textAlign = 'right'; ctx.fillText(c.ref, W - m, y - h + 28); ctx.textAlign = 'left'; } y -= h + 26; }
  const chips = c.facts.slice(0, 5).map(chipText).join('  ·  ');
  if (chips) { ctx.fillStyle = p.ink; ctx.font = font(32, true); const ls = lines(ctx, chips, cw, 2); y -= ls.length * 42; ls.forEach((t, i) => ctx.fillText(t, m, y + 32 + i * 42)); y -= 20; }
  if (c.prices.length) { y -= c.prices.length * 84; priceBlock(ctx, c, p, m, y + 70, cw, 70); y -= 14; }
  if (c.place) { ctx.fillStyle = p.muted; ctx.font = font(32); y -= 44; ctx.fillText(lines(ctx, c.place, cw, 1)[0], m, y + 32); y -= 6; }
  ctx.fillStyle = p.ink; ctx.font = font(54, true);
  const hl = lines(ctx, c.headline, cw, 2); y -= hl.length * 62; hl.forEach((t, i) => ctx.fillText(t, m, y + 50 + i * 62));
}

function drawPortrait(ctx: Ctx, c: PosterContent, p: Pal, imgs: (HTMLImageElement | undefined)[], W: number, H: number) {
  ctx.fillStyle = p.bg; ctx.fillRect(0, 0, W, H);
  const m = 56, cw = W - m * 2;
  ctx.font = font(17);
  const notes = [...(c.footnote ? [c.footnote] : []), c.disclaimer].flatMap(t => lines(ctx, t, cw, 2));
  // Text is stacked upward from the bottom edge; the photos take the room that is left above it.
  let y = H - 30 - notes.length * 24;
  const noteTop = y;
  ctx.fillStyle = p.muted; ctx.font = font(17);
  notes.forEach((t, i) => ctx.fillText(t, m, noteTop + 18 + i * 24));
  if (c.agent.length) {
    const h = c.agent.length * 28 * 1.35;
    y -= h + 18;
    agentBlock(ctx, c, p, m, y + 24, cw * 0.7, 28);
    if (c.ref) { ctx.fillStyle = p.gold; ctx.font = font(30, true); ctx.textAlign = 'right'; ctx.fillText(c.ref, W - m, y + 24); ctx.textAlign = 'left'; }
    y -= 12;
  }
  ctx.font = font(30, true);
  const chips = lines(ctx, c.facts.slice(0, 6).map(chipText).join('  ·  '), cw, 2).filter(Boolean);
  if (chips.length) { y -= chips.length * 40 + 16; ctx.fillStyle = p.ink; ctx.font = font(30, true); chips.forEach((t, i) => ctx.fillText(t, m, y + 32 + i * 40)); }
  if (c.prices.length) { y -= c.prices.length * 77 + 14; priceBlock(ctx, c, p, m, y + 62, cw, 64); }
  if (c.place) { y -= 48; ctx.fillStyle = p.muted; ctx.font = font(30); ctx.fillText(lines(ctx, c.place, cw, 1)[0], m, y + 32); }
  ctx.font = font(52, true);
  const hl = lines(ctx, c.headline, cw, 2);
  y -= hl.length * 60 + 14; ctx.fillStyle = p.ink; ctx.font = font(52, true); hl.forEach((t, i) => ctx.fillText(t, m, y + 50 + i * 60));
  // Pictures above the text: the main one, and (Change 75) up to four small ones in a row when there is room.
  const room = y - 20;
  const small = imgs.slice(1, 5);
  const th = small.length && room >= 560 ? 180 : 0;
  const hero = Math.max(120, room - th);
  cover(ctx, imgs[0], 0, 0, W, hero, p.panel);
  if (!imgs[0]) { ctx.fillStyle = p.gold; ctx.fillRect(0, hero - 10, W, 10); }
  if (th) small.forEach((im, i) => cover(ctx, im, (W / small.length) * i + (i ? 3 : 0), hero + 6, W / small.length - (i ? 3 : 0) - (i < small.length - 1 ? 3 : 0), th - 6, p.panel));
  sampleBand(ctx, c, W, 28);
  ribbon(ctx, c, p, 44, c.sample ? 84 : 44, 34);
}

export function drawPoster(canvas: HTMLCanvasElement, c: PosterContent, format: FormatId, imgs: (HTMLImageElement | undefined)[], theme: Theme) {
  const f = FORMATS[format];
  canvas.width = f.w; canvas.height = f.h;
  const ctx = canvas.getContext('2d') as Ctx;
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  const p = PALETTE[theme];
  (format === 'a4' ? drawA4 : format === 'square' ? drawSquare : drawPortrait)(ctx, c, p, imgs, f.w, f.h);
}

const blobOf = (canvas: HTMLCanvasElement, type: string, q?: number): Promise<Blob> => new Promise((res, rej) => canvas.toBlob(b => (b ? res(b) : rej(new Error('Could not make the file'))), type, q));
/** Whether this browser can write WebP (some older phones cannot). */
export function canWebp(): boolean { try { return document.createElement('canvas').toDataURL('image/webp').startsWith('data:image/webp'); } catch { return false; } }

/** Writes ONLY the chosen file type from the drawn design. */
export async function exportPoster(canvas: HTMLCanvasElement, output: OutputId, title: string): Promise<Blob> {
  if (output === 'png') return blobOf(canvas, MIME.png);
  if (output === 'jpg') return blobOf(canvas, MIME.jpg, 0.92);
  if (output === 'webp') { const b = await blobOf(canvas, MIME.webp, 0.9); if (b.type !== MIME.webp) throw new Error('WebP is not supported on this phone'); return b; }
  const jpeg = await blobOf(canvas, MIME.jpg, 0.9);
  const bytes = buildPdf([{ data: new Uint8Array(await jpeg.arrayBuffer()), w: canvas.width, h: canvas.height }], { title });
  return new Blob([bytes as BlobPart], { type: MIME.pdf });
}
