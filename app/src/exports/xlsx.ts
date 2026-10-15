// Change 010: the XLSX version of the Audit History Report, written with the app's own ZIP writer (no library, nothing
// downloaded). Worksheets: Summary, Current Record Snapshot (only with a snapshot) and Detailed Audit History. Every
// worksheet carries a visible CONFIDENTIAL label and the standard confidentiality warning. On the detailed sheet the
// filters are on, its header row is frozen, and each action type has a subtle colour while keeping its text label.
import { makeZip } from '../backup/zip';
import type { Lang } from '../i18n';
import type { Report } from './report';
import { recLine } from './report';
import { exportStrings, EXACT_EXPORT } from './strings';
import { fmtMyt, ACTION_FILTERS } from '../audit/model';
import { actionLabel, permLine } from './pdfReport';

export const SHEETS = { summary: 'Summary', snapshot: 'Current Record Snapshot', history: 'Detailed Audit History' } as const;
/** Row (1-based) of the detailed sheet's column headings: rows 1–2 hold the CONFIDENTIAL label and the warning. */
export const HISTORY_HEADER_ROW = 4;

const esc = (s: string) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const colName = (i: number) => { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
// Style ids (see styles.xml below): 0 normal, 1 heading, 2 CONFIDENTIAL, 3 wrapped text, 4.. action colours.
const ACTION_STYLE: Record<string, number> = { edit: 4, delete: 5, restore: 6, permission: 7, membership: 8, export: 9 };
type Cell = string | { v: string; s: number };
function sheet(rows: Cell[][], opts: { widths: number[]; freezeRow?: number; filter?: { row: number; cols: number; last: number } }): string {
  const xmlRows = rows.map((r, i) => `<row r="${i + 1}">${r.map((c, j) => {
    const v = typeof c === 'string' ? c : c.v; const st = typeof c === 'string' ? 3 : c.s;
    return v === '' ? '' : `<c r="${colName(j)}${i + 1}" t="inlineStr" s="${st}"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
  }).join('')}</row>`).join('');
  const pane = opts.freezeRow ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${opts.freezeRow}" topLeftCell="A${opts.freezeRow + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${opts.freezeRow + 1}" sqref="A${opts.freezeRow + 1}"/></sheetView></sheetViews>` : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
  const cols = `<cols>${opts.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`;
  const filter = opts.filter ? `<autoFilter ref="A${opts.filter.row}:${colName(opts.filter.cols - 1)}${Math.max(opts.filter.row, opts.filter.last)}"/>` : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${pane}${cols}<sheetData>${xmlRows}</sheetData>${filter}</worksheet>`;
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="12"/><color rgb="FFA3261B"/><name val="Calibri"/></font></fonts>
<fills count="9"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF4EFE3"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFEAF2FD"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFDECEA"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFEAF7EF"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFFF6E0"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF1EDFC"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFE6F6F4"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="10"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment wrapText="1" vertical="top"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
<xf numFmtId="0" fontId="0" fillId="3" borderId="0" xfId="0" applyFill="1"><alignment wrapText="1" vertical="top"/></xf>
<xf numFmtId="0" fontId="0" fillId="4" borderId="0" xfId="0" applyFill="1"><alignment wrapText="1" vertical="top"/></xf>
<xf numFmtId="0" fontId="0" fillId="5" borderId="0" xfId="0" applyFill="1"><alignment wrapText="1" vertical="top"/></xf>
<xf numFmtId="0" fontId="0" fillId="6" borderId="0" xfId="0" applyFill="1"><alignment wrapText="1" vertical="top"/></xf>
<xf numFmtId="0" fontId="0" fillId="7" borderId="0" xfId="0" applyFill="1"><alignment wrapText="1" vertical="top"/></xf>
<xf numFmtId="0" fontId="0" fillId="8" borderId="0" xfId="0" applyFill="1"><alignment wrapText="1" vertical="top"/></xf></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

export function buildXlsx(r: Report, lang: Lang): Uint8Array {
  const s = exportStrings[lang];
  const X = EXACT_EXPORT[lang];
  const label: Cell[] = [{ v: X.confidential, s: 2 }];
  const warning: Cell[] = [{ v: X.warning, s: 2 }];
  const H = (v: string): Cell => ({ v, s: 1 });
  const ids = r.records.map(x => x.recordId);
  const access = (a: string) => (a === 'owner' ? s.ownerLevel : a === 'edit' ? s.edit : s.view);

  // Summary
  const sum: Cell[][] = [label, warning, [],
    [H(X.reportTitle)], [s.brand],
    [H(ids.length > 1 ? s.recordIds : s.recordId), ids.join(', ')],
    [H(s.exportDate), fmtMyt(r.at)], [H(s.exportedBy), r.exporter.label], [H(s.reference), r.ref], [s.refNote],
    [H(s.filters), s.scopeLine(r.mode === 'snapshot' ? s.withSnapshot : s.historyOnly, r.personLabel ?? s.everyone, r.actions.length === ACTION_FILTERS.length ? s.allActions : r.actions.join(', '))],
    [], [H(s.permissionSummary)], [H(s.record), H(s.owner), H(s.accessLevel)],
    ...r.records.map(x => [recLine(x), x.ownerLabel, access(x.access)] as Cell[]),
    [], [H(s.permissionHistory)], [H(s.col.time), H(s.col.record), H(s.col.details), H(s.col.by)],
    ...r.records.flatMap(x => x.permissions.map(e => [fmtMyt(e.at), x.recordId, permLine(e.detail, lang), e.actorName || e.actorEmail || ''] as Cell[])),
    [], [H(s.auditSummary)], [H(s.totals), H('')],
    ...Object.entries(r.totals).map(([k, n]) => [{ v: actionLabel(k, lang), s: ACTION_STYLE[k] ?? 3 }, String(n)] as Cell[]),
    [H(s.entryCount), String(r.count)],
    [H(s.earliest), r.earliest !== undefined ? fmtMyt(r.earliest) : s.none], [H(s.latest), r.latest !== undefined ? fmtMyt(r.latest) : s.none],
  ];
  const sheets: { name: string; xml: string }[] = [{ name: SHEETS.summary, xml: sheet(sum, { widths: [34, 46, 30, 26] }) }];
  if (r.mode === 'snapshot') {
    const snap: Cell[][] = [label, warning, [], [H(s.col.record), H(s.field), H(s.value)],
      ...r.records.flatMap(x => (x.snapshot ?? []).map(([k, v]) => [x.recordId, k, v] as Cell[]))];
    sheets.push({ name: SHEETS.snapshot, xml: sheet(snap, { widths: [16, 40, 60] }) });
  }
  const head = [s.col.time, s.col.record, s.col.action, s.col.by, s.col.field, s.col.before, s.col.after, s.col.details].map(H);
  const hist: Cell[][] = [label, warning, [], head,
    ...r.rows.map(x => [fmtMyt(x.at), x.recordId, { v: x.action, s: ACTION_STYLE[x.filter] ?? 3 }, x.by, x.field, x.before, x.after, x.details] as Cell[])];
  sheets.push({ name: SHEETS.history, xml: sheet(hist, { widths: [30, 14, 26, 22, 22, 32, 32, 18], freezeRow: HISTORY_HEADER_ROW, filter: { row: HISTORY_HEADER_ROW, cols: 8, last: HISTORY_HEADER_ROW + r.rows.length } }) });

  const enc = new TextEncoder();
  const ct = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const wb = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((sh, i) => `<sheet name="${esc(sh.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>${sheets.some(sh => sh.name === SHEETS.history) ? `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="${sheets.findIndex(sh => sh.name === SHEETS.history)}" hidden="1">'${SHEETS.history}'!$A$${HISTORY_HEADER_ROW}:$H$${HISTORY_HEADER_ROW + r.rows.length}</definedName></definedNames>` : ''}</workbook>`;
  const wbRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  return makeZip([
    { name: '[Content_Types].xml', data: enc.encode(ct) },
    { name: '_rels/.rels', data: enc.encode(rels) },
    { name: 'xl/workbook.xml', data: enc.encode(wb) },
    { name: 'xl/_rels/workbook.xml.rels', data: enc.encode(wbRels) },
    { name: 'xl/styles.xml', data: enc.encode(STYLES) },
    ...sheets.map((sh, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: enc.encode(sh.xml) })),
  ], new Date(r.at));
}
export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
