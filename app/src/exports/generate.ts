// Change 010: making an audit-history export, from the confirmed preview to the finished file. Access is checked again
// at the start; the file is made page by page so it can be cancelled; a cancelled or failed export produces no file and
// is never recorded or reported as successful. A finished export is recorded in the audit trail of EVERY record in it
// (exporter, time, record ID, export reference), so multi-record exports need no separate ownership rule.
import type { Store } from '../data/store';
import type { Lang } from '../i18n';
import type { ActionFilter, AuditEntry } from '../audit/model';
import { allVisibleAudit } from '../audit/AuditUI';
import { buildReport, exportFileName, newExportRef, Report, ExportFormat, ExportMode } from './report';
import { layoutReport } from './pdfReport';
import { buildXlsx, XLSX_MIME } from './xlsx';
import { renderPagesToPdf, canvasMeasure } from '../lib/pdfRender';
import { listExports } from './saved';
import { exportStrings } from './strings';
import logo from '../brand/logo-256.webp';

export interface ExportRequest { keys: string[]; format: ExportFormat; mode: ExportMode; person?: string; actions?: ActionFilter[] }
export interface ExportResult { blob: Blob; fileName: string; report: Report; mime: string }

/** Everything the report needs that is visible to the person right now. */
export async function gather(store: Store): Promise<{ audit: Map<string, AuditEntry[]>; team: AuditEntry[] }> {
  const audit = await allVisibleAudit(store);
  return { audit, team: audit.get('team') ?? [] };
}

/** Builds the report model (used for the preview too). Throws Error('not-allowed') if access was lost. */
export async function prepare(store: Store, lang: Lang, req: ExportRequest, at = Date.now()): Promise<Report> {
  const { audit, team } = await gather(store);
  const taken = new Set((await listExports(store)).map(e => e.ref));
  const s = exportStrings[lang];
  return buildReport(store.getState(), { lang, keys: req.keys, audit, team, format: req.format, mode: req.mode, person: req.person, actions: req.actions, at, ref: newExportRef(taken), withheld: s.withheld, photosN: s.photosN });
}

export async function generate(store: Store, lang: Lang, req: ExportRequest, opts: { onProgress?: (d: number, t: number) => void; cancelled?: () => boolean } = {}): Promise<ExportResult> {
  const report = await prepare(store, lang, req);     // access checked again, here and now
  if (!report.records.length) throw new Error('nothing');
  const fileName = exportFileName(report.records.map(r => r.recordId), report.at, report.ref, req.format);
  let blob: Blob;
  if (req.format === 'pdf') {
    const pages = layoutReport({ report, lang, logo: { src: logo } }, canvasMeasure());
    blob = await renderPagesToPdf(pages, `${exportStrings[lang].brand} - Audit History Report ${report.ref}`, opts);
  } else {
    if (opts.cancelled?.()) throw new Error('cancelled');
    const bytes = buildXlsx(report, lang);
    opts.onProgress?.(1, 1);
    if (opts.cancelled?.()) throw new Error('cancelled');
    blob = new Blob([bytes as BlobPart], { type: XLSX_MIME });
  }
  recordExport(store, report);
  return { blob, fileName, report, mime: req.format === 'pdf' ? 'application/pdf' : XLSX_MIME };
}

/** The export event, in each record's audit trail (sent to the cloud with the next sync). */
export function recordExport(store: Store, report: Report) {
  for (const rec of report.records) {
    store.appendAudit(rec.key, [{
      id: `a-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`, collection: rec.collection, recordId: rec.id, ...store.actor(), action: 'export',
      detail: { ref: report.ref, format: report.format, mode: report.mode, recordId: rec.recordId, records: report.records.length }, at: store.auditNow(),
    }], true);
  }
}
