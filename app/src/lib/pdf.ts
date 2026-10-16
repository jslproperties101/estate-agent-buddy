// A small, local PDF maker (no service, no cost, nothing leaves the phone).
//  1. A document is a list of blocks (title, headings, text, label/value rows, photos).
//  2. layoutDocument() places the blocks on A4 pages, wrapping text and starting a new page when one is full.
//     It takes a measuring function, so it also runs (and is tested) without a browser.
//  3. lib/pdfRender.ts draws each page on a canvas and returns a JPEG; buildPdf() puts those pictures into a valid PDF.
// Pages are pictures, so every language (including Chinese) and every photo prints exactly as previewed. The trade-off
// is that the text in the PDF cannot be selected or searched. Documented in docs/STAGE5.md.

export const PAGE_W = 595; // A4 in points
export const PAGE_H = 842;
export const MARGIN = 40;

export type Block =
  | { t: 'title'; text: string; sub?: string }
  | { t: 'heading'; text: string }
  | { t: 'text'; text: string; muted?: boolean; small?: boolean; bold?: boolean }
  /** Label on the left, value on the right. `tag` is a small mark after the value, e.g. "Not verified". */
  | { t: 'rows'; rows: { k: string; v: string; strong?: boolean; sub?: boolean; tag?: string; warn?: boolean }[] }
  /** Photos in a grid. `src` is anything the renderer can draw (an object URL); w and h are the picture's size. */
  | { t: 'photos'; items: { src: string; w: number; h: number; caption?: string }[]; cols?: 1 | 2 | 3 }
  | { t: 'rule' }
  | { t: 'space'; h: number };

export interface Font { size: number; bold?: boolean; colour: string }
export type Placed =
  | { k: 'text'; x: number; y: number; text: string; font: Font; align?: 'left' | 'right' | 'center'; /** degrees, around (x, y) */ rotate?: number; /** 0–1 */ alpha?: number }
  | { k: 'rect'; x: number; y: number; w: number; h: number; fill: string }
  | { k: 'line'; x1: number; y1: number; x2: number; y2: number; colour: string }
  | { k: 'image'; x: number; y: number; w: number; h: number; src: string };
export interface Page { items: Placed[] }
export interface Doc { blocks: Block[]; /** Small text at the foot of every page. */ footer?: string }

export type Measure = (text: string, font: Font) => number;

const INK = '#1d1b16', MUTED = '#6b655a', GOLD = '#8a6d1f', WARN = '#a5560c', RULE = '#d9d2c3', BAND = '#f4efe3';
const F = {
  title: { size: 20, bold: true, colour: INK } as Font,
  sub: { size: 11, colour: MUTED } as Font,
  heading: { size: 13, bold: true, colour: GOLD } as Font,
  body: { size: 10.5, colour: INK } as Font,
  small: { size: 9, colour: MUTED } as Font,
  row: { size: 10.5, colour: INK } as Font,
  rowStrong: { size: 10.5, bold: true, colour: INK } as Font,
  tag: { size: 8.5, bold: true, colour: WARN } as Font,
  footer: { size: 8, colour: MUTED } as Font,
};
const lineH = (f: Font) => Math.round(f.size * 1.35 * 10) / 10;

/** Breaks text into lines no wider than maxW. Words are kept whole; a single over-long word (or Chinese text,
 *  which has no spaces) is cut by characters. */
export function wrap(text: string, font: Font, maxW: number, measure: Measure): string[] {
  const out: string[] = [];
  for (const para of String(text ?? '').split(/\r?\n/)) {
    if (!para.trim()) { out.push(''); continue; }
    let line = '';
    const push = () => { if (line) out.push(line); line = ''; };
    const tokens = para.match(/[^\s　-鿿＀-￯]+\s*|\s+|[　-鿿＀-￯]/g) ?? [para];
    for (const tok of tokens) {
      if (measure(line + tok, font) <= maxW || !line.trim()) {
        if (measure(tok, font) > maxW && !line) {
          // one word wider than the line: cut it
          let part = '';
          for (const ch of tok) { if (measure(part + ch, font) > maxW && part) { out.push(part); part = ''; } part += ch; }
          line = part;
        } else line += tok;
      } else { push(); line = tok.replace(/^\s+/, ''); }
    }
    push();
  }
  return out.length ? out.map(l => l.replace(/\s+$/, '')) : [''];
}

/** Places the document on pages. Never throws on empty or very long content; a photo that does not fit the rest of
 *  a page moves to the next one. */
export function layoutDocument(doc: Doc, measure: Measure): Page[] {
  const pages: Page[] = [{ items: [] }];
  const innerW = PAGE_W - MARGIN * 2;
  const bottom = PAGE_H - MARGIN - 18; // room for the footer
  let y = MARGIN;
  const cur = () => pages[pages.length - 1];
  const newPage = () => { pages.push({ items: [] }); y = MARGIN; };
  const need = (h: number) => { if (y + h > bottom && y > MARGIN) newPage(); };

  for (const b of doc.blocks) {
    if (b.t === 'space') { y += b.h; continue; }
    if (b.t === 'rule') { need(8); cur().items.push({ k: 'line', x1: MARGIN, y1: y + 3, x2: PAGE_W - MARGIN, y2: y + 3, colour: RULE }); y += 8; continue; }
    if (b.t === 'title') {
      const lines = wrap(b.text || ' ', F.title, innerW, measure);
      need(lines.length * lineH(F.title) + 24);
      for (const l of lines) { cur().items.push({ k: 'text', x: MARGIN, y: y + F.title.size, text: l, font: F.title }); y += lineH(F.title); }
      if (b.sub) for (const l of wrap(b.sub, F.sub, innerW, measure)) { cur().items.push({ k: 'text', x: MARGIN, y: y + F.sub.size, text: l, font: F.sub }); y += lineH(F.sub); }
      y += 8; continue;
    }
    if (b.t === 'heading') {
      need(lineH(F.heading) + 30);
      y += 8;
      cur().items.push({ k: 'rect', x: MARGIN, y, w: innerW, h: lineH(F.heading) + 4, fill: BAND });
      cur().items.push({ k: 'text', x: MARGIN + 6, y: y + F.heading.size + 2, text: b.text, font: F.heading });
      y += lineH(F.heading) + 10; continue;
    }
    if (b.t === 'text') {
      const f: Font = b.small || b.muted ? { ...F.small, size: b.small ? 9 : 10, bold: b.bold } : { ...F.body, bold: b.bold };
      for (const l of wrap(b.text, f, innerW, measure)) { need(lineH(f)); cur().items.push({ k: 'text', x: MARGIN, y: y + f.size, text: l, font: f }); y += lineH(f); }
      y += 4; continue;
    }
    if (b.t === 'rows') {
      for (const r of b.rows) {
        const f = r.strong ? F.rowStrong : F.row;
        const indent = r.sub ? 14 : 0;
        const valW = Math.min(innerW * 0.45, Math.max(60, measure(r.v || '—', f) + 6));
        const tagW = r.tag ? measure(r.tag, F.tag) + 8 : 0;
        const keyW = innerW - valW - tagW - indent - 12;
        const kl = wrap(r.k, r.sub ? { ...f, colour: MUTED } : f, Math.max(60, keyW), measure);
        const vl = wrap(r.v || '—', f, valW + 2, measure);
        const n = Math.max(kl.length, vl.length);
        need(n * lineH(f) + 3);
        for (let i = 0; i < n; i++) {
          if (kl[i] !== undefined) cur().items.push({ k: 'text', x: MARGIN + indent, y: y + f.size + i * lineH(f), text: kl[i], font: r.sub ? { ...f, colour: MUTED, size: 9.5 } : f });
          if (vl[i] !== undefined) cur().items.push({ k: 'text', x: PAGE_W - MARGIN - tagW, y: y + f.size + i * lineH(f), text: vl[i], font: r.warn ? { ...f, colour: WARN } : f, align: 'right' });
          if (i === 0 && r.tag) cur().items.push({ k: 'text', x: PAGE_W - MARGIN, y: y + F.tag.size + 1, text: r.tag, font: F.tag, align: 'right' });
        }
        y += n * lineH(f);
        cur().items.push({ k: 'line', x1: MARGIN, y1: y + 1, x2: PAGE_W - MARGIN, y2: y + 1, colour: RULE });
        y += 3;
      }
      y += 4; continue;
    }
    if (b.t === 'photos') {
      const cols = b.cols ?? 2;
      const gap = 8;
      const cellW = (innerW - gap * (cols - 1)) / cols;
      for (let i = 0; i < b.items.length; i += cols) {
        const row = b.items.slice(i, i + cols);
        const hs = row.map(p => (p.w > 0 && p.h > 0 ? Math.min(cellW * (p.h / p.w), cellW * 1.1) : cellW * 0.75));
        const rowH = Math.max(...hs) + (row.some(p => p.caption) ? 14 : 0);
        need(rowH + gap);
        // Change 013: each photo sits in the middle of its own frame (the cell, as tall as the tallest photo of the row),
        // both across and down, at its own shape: never stretched, never wider than its cell, never pushed to the left.
        const imgRowH = Math.max(...hs);
        row.forEach((p, j) => {
          const h = hs[j];
          const w = p.w > 0 && p.h > 0 ? Math.min(cellW, h * (p.w / p.h)) : cellW;
          const cellX = MARGIN + j * (cellW + gap);
          const x = cellX + (cellW - w) / 2;
          const top = y + (imgRowH - h) / 2;
          cur().items.push({ k: 'image', x, y: top, w, h, src: p.src });
          if (p.caption) for (const l of wrap(p.caption, F.small, cellW, measure).slice(0, 1)) cur().items.push({ k: 'text', x: cellX + cellW / 2, y: y + imgRowH + 11, text: l, font: F.small, align: 'center' });
        });
        y += rowH + gap;
      }
      continue;
    }
  }
  if (doc.footer) {
    pages.forEach((p, i) => {
      p.items.push({ k: 'line', x1: MARGIN, y1: PAGE_H - MARGIN - 8, x2: PAGE_W - MARGIN, y2: PAGE_H - MARGIN - 8, colour: RULE });
      p.items.push({ k: 'text', x: MARGIN, y: PAGE_H - MARGIN + 4, text: doc.footer!, font: F.footer });
      p.items.push({ k: 'text', x: PAGE_W - MARGIN, y: PAGE_H - MARGIN + 4, text: `${i + 1} / ${pages.length}`, font: F.footer, align: 'right' });
    });
  }
  return pages;
}

// ---------- PDF file ----------
export interface JpegPage { data: Uint8Array; /** pixel size of the picture */ w: number; h: number }

const enc = new TextEncoder();
const cat = (parts: (Uint8Array | string)[]): Uint8Array => {
  const bs = parts.map(p => (typeof p === 'string' ? enc.encode(p) : p));
  const out = new Uint8Array(bs.reduce((n, b) => n + b.length, 0));
  let o = 0;
  for (const b of bs) { out.set(b, o); o += b.length; }
  return out;
};
const pdfDate = (d: Date) => `D:${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}${String(d.getUTCSeconds()).padStart(2, '0')}Z`;
const pdfText = (s: string) => `(${String(s).replace(/[^\x20-\x7e]/g, '?').replace(/([\\()])/g, '\\$1')})`;

/** A valid PDF 1.4 file with one A4 page per picture. */
export function buildPdf(pages: JpegPage[], info: { title?: string; now?: Date } = {}): Uint8Array {
  if (!pages.length) throw new Error('A PDF needs at least one page');
  const objs: (Uint8Array | string)[][] = []; // index i → object number i+1
  const add = (parts: (Uint8Array | string)[]) => { objs.push(parts); return objs.length; };
  const catalog = add(['<< /Type /Catalog /Pages 2 0 R >>']);
  void catalog;
  add(['']); // placeholder for Pages (object 2)
  const kids: number[] = [];
  pages.forEach((pg, i) => {
    const pageObj = objs.length + 1, contentObj = pageObj + 1, imgObj = pageObj + 2;
    kids.push(pageObj);
    add([`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /XObject << /Im${i} ${imgObj} 0 R >> >> /Contents ${contentObj} 0 R >>`]);
    const content = `q ${PAGE_W} 0 0 ${PAGE_H} 0 0 cm /Im${i} Do Q`;
    add([`<< /Length ${content.length} >>\nstream\n${content}\nendstream`]);
    add([`<< /Type /XObject /Subtype /Image /Width ${pg.w} /Height ${pg.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${pg.data.length} >>\nstream\n`, pg.data, '\nendstream']);
  });
  objs[1] = [`<< /Type /Pages /Count ${pages.length} /Kids [${kids.map(k => `${k} 0 R`).join(' ')}] >>`];
  const infoObj = add([`<< /Title ${pdfText(info.title ?? 'Document')} /Producer (Estate Agent Buddy) /CreationDate (${pdfDate(info.now ?? new Date())}) >>`]);

  const chunks: (Uint8Array | string)[] = ['%PDF-1.4\n%\xe2\xe3\xcf\xd3\n'];
  let pos = chunks.map(c => (typeof c === 'string' ? enc.encode(c).length : c.length)).reduce((a, b) => a + b, 0);
  const offsets: number[] = [];
  objs.forEach((parts, i) => {
    offsets.push(pos);
    const body = cat([`${i + 1} 0 obj\n`, ...parts, '\nendobj\n']);
    chunks.push(body); pos += body.length;
  });
  const xrefAt = pos;
  let xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) xref += `${String(o).padStart(10, '0')} 00000 n \n`;
  xref += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info ${infoObj} 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  chunks.push(xref);
  return cat(chunks);
}
