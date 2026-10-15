// Change 010: the "Audit History Report" PDF layout. Runs without a browser (it takes a measuring function), so the
// page rules are tested in Node:
//  - every page: full header (logo, Estate Agent AI Buddy, report title, export date) and footer (page number, record
//    ID, unique export reference), and a subtle CONFIDENTIAL watermark that does not hide the content
//  - no agency name, no table of contents, no signature or approval section
//  - the audit table's column headings appear once, where the table starts, not on later pages
import type { Font, Page, Placed } from '../lib/pdf';
import { PAGE_W, PAGE_H, wrap } from '../lib/pdf';
import type { Lang } from '../i18n';
import type { Report } from './report';
import { recLine } from './report';
import { exportStrings, EXACT_EXPORT } from './strings';
import { fmtMyt } from '../audit/model';
import { auditStrings } from '../audit/strings';

type Measure = (text: string, font: Font) => number;
const M = 36;                         // side margin
const HEAD_H = 58;                    // header band
const FOOT_H = 34;
const TOP = M + HEAD_H;
const BOTTOM = PAGE_H - M - FOOT_H;
const W = PAGE_W - 2 * M;
const INK = '#1d1b16', MUTED = '#5f594d', GOLD = '#8a6d1f', RULE = '#d9d2c3', BAND = '#f4efe3', RED = '#a3261b';
const f = (size: number, colour = INK, bold = false): Font => ({ size, colour, bold });
const F = { brand: f(12, INK, true), title: f(10.5, GOLD, true), small: f(8.5, MUTED), h1: f(16, INK, true), h2: f(12, GOLD, true), body: f(9.5), bold: f(9.5, INK, true), cell: f(8), cellB: f(8, INK, true), warn: f(9.5, RED, true), mark: f(64, '#b0a68f', true) };
const lh = (x: Font) => Math.round(x.size * 1.35 * 10) / 10;

export interface ReportPagesInput { report: Report; lang: Lang; logo?: { src: string } }

export function layoutReport(inp: ReportPagesInput, measure: Measure): Page[] {
  const { report: r, lang } = inp;
  const s = exportStrings[lang];
  const X = EXACT_EXPORT[lang];
  const pages: Page[] = [];
  let y = TOP;
  const cur = () => pages[pages.length - 1];
  const newPage = () => { pages.push({ items: [] }); y = TOP + 8; };
  newPage();
  const need = (h: number) => { if (y + h > BOTTOM) newPage(); };
  const text = (t: string, font: Font, x = M, maxW = W) => {
    for (const line of wrap(t, font, maxW, measure)) { need(lh(font)); cur().items.push({ k: 'text', x, y: y + font.size, text: line, font }); y += lh(font); }
  };
  const heading = (t: string) => {
    need(lh(F.h2) + 24); y += 8;
    cur().items.push({ k: 'rect', x: M, y, w: W, h: lh(F.h2) + 4, fill: BAND });
    cur().items.push({ k: 'text', x: M + 6, y: y + F.h2.size + 2, text: t, font: F.h2 });
    y += lh(F.h2) + 10;
  };
  const kv = (k: string, v: string) => {
    const kw = W * 0.38;
    const kl = wrap(k, F.bold, kw - 6, measure), vl = wrap(v || s.none, F.body, W - kw, measure);
    const n = Math.max(kl.length, vl.length);
    need(n * lh(F.body) + 3);
    for (let i = 0; i < n; i++) {
      if (kl[i]) cur().items.push({ k: 'text', x: M, y: y + F.body.size + i * lh(F.body), text: kl[i], font: F.bold });
      if (vl[i]) cur().items.push({ k: 'text', x: M + kw, y: y + F.body.size + i * lh(F.body), text: vl[i], font: F.body });
    }
    y += n * lh(F.body);
    cur().items.push({ k: 'line', x1: M, y1: y + 1, x2: M + W, y2: y + 1, colour: RULE });
    y += 3;
  };
  const accessText = (a: string) => (a === 'owner' ? s.ownerLevel : a === 'edit' ? s.edit : s.view);
  const ids = r.records.map(x => x.recordId);

  // ---- report body ----
  text(X.reportTitle, F.h1);
  y += 4;
  kv(ids.length > 1 ? s.recordIds : s.recordId, ids.join(', '));
  kv(s.exportDate, fmtMyt(r.at));
  kv(s.exportedBy, r.exporter.label);
  kv(s.reference, r.ref);
  text(s.refNote, F.small);
  y += 6;
  need(lh(F.warn) * 3 + 10);
  const warnLines = wrap(X.warning, F.warn, W - 16, measure);
  cur().items.push({ k: 'rect', x: M, y, w: W, h: warnLines.length * lh(F.warn) + 10, fill: '#fbeceb' });
  y += 5;
  for (const l of warnLines) { cur().items.push({ k: 'text', x: M + 8, y: y + F.warn.size, text: l, font: F.warn }); y += lh(F.warn); }
  y += 8;
  kv(s.filters, s.scopeLine(r.mode === 'snapshot' ? s.withSnapshot : s.historyOnly, r.personLabel ?? s.everyone, r.actions.length === 6 ? s.allActions : r.actions.join(', ')));

  heading(s.permissionSummary);
  for (const rec of r.records) {
    kv(s.record, recLine(rec));
    kv(s.owner, rec.ownerLabel);
    kv(s.accessLevel, accessText(rec.access));
  }
  heading(s.permissionHistory);
  const perm = r.records.flatMap(rec => rec.permissions.map(e => ({ rec, e })));
  if (!perm.length) text(s.noPermissionHistory, F.body);
  for (const { rec, e } of perm) kv(`${fmtMyt(e.at)}${r.records.length > 1 ? ` · ${rec.recordId}` : ''}`, `${permLine(e.detail, lang)} · ${e.actorName || e.actorEmail || ''}`.replace(/ · $/, ''));

  heading(s.auditSummary);
  for (const [k, n] of Object.entries(r.totals)) kv(actionLabel(k, lang), String(n));
  kv(s.entryCount, String(r.count));
  kv(s.earliest, r.earliest !== undefined ? fmtMyt(r.earliest) : s.none);
  kv(s.latest, r.latest !== undefined ? fmtMyt(r.latest) : s.none);

  if (r.mode === 'snapshot') for (const rec of r.records) {
    heading(`${s.snapshot}: ${rec.recordId}`);
    for (const [k, v] of rec.snapshot ?? []) kv(k, v);
  }

  // ---- the table: headings once ----
  heading(s.history);
  const cols = [
    { key: 'at' as const, label: s.col.time, w: 0.17 }, { key: 'recordId' as const, label: s.col.record, w: 0.11 }, { key: 'action' as const, label: s.col.action, w: 0.17 },
    { key: 'by' as const, label: s.col.by, w: 0.14 }, { key: 'field' as const, label: s.col.field, w: 0.13 }, { key: 'before' as const, label: s.col.before, w: 0.14 }, { key: 'after' as const, label: s.col.after, w: 0.14 },
  ];
  const cx = (i: number) => M + cols.slice(0, i).reduce((n, c) => n + c.w * W, 0);
  const row = (cells: string[], font: Font, fill?: string) => {
    const lines = cells.map((c, i) => wrap(c || '', font, cols[i].w * W - 6, measure));
    const n = Math.max(1, ...lines.map(l => l.length));
    for (let start = 0; start < n;) {
      const room = Math.max(1, Math.floor((BOTTOM - y - 4) / lh(font)));
      if (room < 2 && start === 0 && n > 1) { newPage(); continue; }
      const take = Math.min(room, n - start);
      if (fill) cur().items.push({ k: 'rect', x: M, y, w: W, h: take * lh(font) + 4, fill });
      lines.forEach((ls, i) => ls.slice(start, start + take).forEach((l, j) => cur().items.push({ k: 'text', x: cx(i) + 3, y: y + 2 + font.size + j * lh(font), text: l, font })));
      y += take * lh(font) + 4;
      cur().items.push({ k: 'line', x1: M, y1: y, x2: M + W, y2: y, colour: RULE });
      start += take;
      if (start < n) newPage();
    }
  };
  need(lh(F.cellB) * 2 + lh(F.cell) * 2 + 10);              // headings never sit alone at the foot of a page
  row(cols.map(c => c.label), F.cellB, BAND);
  if (!r.rows.length) text(s.none, F.body);
  for (const x of r.rows) { need(lh(F.cell) + 4); row([fmtMyt(x.at), x.recordId, x.action, x.by, x.field, x.before, x.after], F.cell); }

  // ---- header, footer and watermark on every page ----
  const total = pages.length;
  pages.forEach((p, i) => {
    const deco: Placed[] = [];
    deco.push({ k: 'text', x: PAGE_W / 2, y: PAGE_H / 2 + 20, text: X.confidential, font: F.mark, align: 'center', rotate: -35, alpha: 0.09 });
    if (inp.logo) deco.push({ k: 'image', x: M, y: M - 6, w: 34, h: 34, src: inp.logo.src });
    const tx = inp.logo ? M + 42 : M;
    deco.push({ k: 'text', x: tx, y: M + 8, text: s.brand, font: F.brand });
    deco.push({ k: 'text', x: tx, y: M + 22, text: X.reportTitle, font: F.title });
    deco.push({ k: 'text', x: PAGE_W - M, y: M + 8, text: s.exportDate, font: F.small, align: 'right' });
    deco.push({ k: 'text', x: PAGE_W - M, y: M + 21, text: fmtMyt(r.at), font: F.small, align: 'right' });
    deco.push({ k: 'line', x1: M, y1: M + HEAD_H - 24, x2: PAGE_W - M, y2: M + HEAD_H - 24, colour: GOLD });
    const fy = PAGE_H - M - 6;
    deco.push({ k: 'line', x1: M, y1: fy - 14, x2: PAGE_W - M, y2: fy - 14, colour: RULE });
    deco.push({ k: 'text', x: M, y: fy, text: s.page(i + 1, total), font: F.small });
    const idText = ids.length > 3 ? `${ids.slice(0, 3).join(', ')} +${ids.length - 3}` : ids.join(', ');
    deco.push({ k: 'text', x: PAGE_W / 2, y: fy, text: `${ids.length > 1 ? s.recordIds : s.recordId}: ${idText}`, font: F.small, align: 'center' });
    deco.push({ k: 'text', x: PAGE_W - M, y: fy, text: `${s.reference}: ${r.ref}`, font: F.small, align: 'right' });
    // Watermark first (underneath), then the page, then header/footer.
    p.items = [deco[0], ...p.items, ...deco.slice(1)];
  });
  return pages;
}

function actionLabel(k: string, lang: Lang): string {
  const m: Record<Lang, Record<string, string>> = {
    en: { edit: 'Edits', delete: 'Deletions', restore: 'Restorations', permission: 'Permission changes', membership: 'Membership changes', export: 'Exports' },
    bm: { edit: 'Suntingan', delete: 'Pemadaman', restore: 'Pemulihan', permission: 'Perubahan kebenaran', membership: 'Perubahan keahlian', export: 'Eksport' },
    zh: { edit: '编辑', delete: '删除', restore: '恢复', permission: '权限更改', membership: '成员变更', export: '导出' },
  };
  return m[lang][k] ?? k;
}
export { actionLabel, permLine };

function permLine(d: Record<string, unknown> | undefined, lang: Lang): string {
  const s = exportStrings[lang];
  const lv = (x: unknown) => (x === 'edit' ? s.edit : x === 'view' ? s.view : '—');
  const via = d?.via === 'share_all' ? ` · ${auditStrings[lang].viaAll(String(d.scope))}` : '';
  return `${auditStrings[lang].perm(String(d?.event ?? 'changed'), lv(d?.from), lv(d?.to))}${via}`;
}
