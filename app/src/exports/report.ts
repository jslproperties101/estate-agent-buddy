// Change 010: what an audit-history export contains, worked out before any file is made (so the preview, the PDF and
// the XLSX all say the same thing). Rules:
//  - Only records the person may see right now (checked again here, at the moment of exporting).
//  - ALL available history of each chosen record; a person and action-type filter may be chosen; no date range.
//  - Snapshot (optional): every current field the exporter may see, with confidential documents and identity details
//    withheld.
//  - Metadata: record ID(s), export date, exporter (name, email fallback), a unique export reference, the record owner,
//    the exporter's access at export time, permission history, totals by action type and earliest/latest entries.
import type { AppState, CollectionName } from '../data/types';
import type { Lang } from '../i18n';
import { AuditEntry, ActionFilter, ACTION_FILTERS, filterOf, newestFirst, showValue, ymdMyt } from '../audit/model';
import { applyAuditFilters, actorLabel, entrySummary } from '../audit/AuditUI';
import { levelOf, sharedInfo, personLabel, myLabel, scopesOf } from '../team/access';
import { recordTitle, fieldLabel } from '../sync/SyncUI';
import { CONFIDENTIAL_DOCS } from '../listing/model';

export type ExportFormat = 'pdf' | 'xlsx';
export type ExportMode = 'history' | 'snapshot';
export interface ReportRow { at: number; recordId: string; action: string; by: string; field: string; before: string; after: string; details: string; filter: ActionFilter }
export interface ReportRecord {
  key: string; collection: CollectionName; id: string; recordId: string; title: string;
  ownerLabel: string; access: 'owner' | 'view' | 'edit';
  snapshot?: [string, string][];
  permissions: AuditEntry[];
  entries: AuditEntry[];
}
export interface Report {
  ref: string; at: number; format: ExportFormat; mode: ExportMode;
  exporter: { id: string; label: string };
  person?: string; personLabel?: string; actions: ActionFilter[];
  records: ReportRecord[]; rows: ReportRow[];
  totals: Record<ActionFilter, number>; earliest?: number; latest?: number; count: number;
}

/** The ID people see for a record: the property reference (P1001) when there is one, else its own id. */
export function displayId(state: AppState, collection: CollectionName, id: string): string {
  const r = (state[collection] as unknown as Record<string, unknown>[]).find(x => x.id === id);
  return (collection === 'properties' && typeof r?.ref === 'string' && r.ref) ? r.ref : id;
}

const ALNUM = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** A new export reference, unique among the ones this phone has made (EXP + 8 random characters, ~40 bits). */
export function newExportRef(taken: Set<string> = new Set()): string {
  for (;;) {
    const b = new Uint8Array(8);
    crypto.getRandomValues(b);
    const ref = `EXP${[...b].map(x => ALNUM[x % ALNUM.length]).join('')}`;
    if (!taken.has(ref)) return ref;
  }
}
/** Audit-History-[RecordID]-[YYYYMMDD]-[ExportReference].[pdf|xlsx]; several records: MULTI<n> as the record part. */
export function exportFileName(recordIds: string[], at: number, ref: string, format: ExportFormat): string {
  const rid = recordIds.length === 1 ? recordIds[0] : `MULTI${recordIds.length}`;
  const safe = rid.replace(/[^A-Za-z0-9]+/g, '').slice(0, 40) || 'RECORD';
  return `Audit-History-${safe}-${ymdMyt(at)}-${ref}.${format}`;
}

// ---------- snapshot with privacy safeguards ----------
const SENSITIVE = /(^|\.)(ic|nric|icno|mykad|passport|identity|idnumber|bankaccount|accountno)$/i;
export function snapshotOf(lang: Lang, collection: CollectionName, rec: Record<string, unknown>, withheld: string, photosN: (n: number) => string): [string, string][] {
  const out: [string, string][] = [];
  const walk = (v: unknown, path: string) => {
    if (SENSITIVE.test(path)) { out.push([path, withheld]); return; }
    if (path === 'photos' && Array.isArray(v)) { out.push([path, photosN(v.length)]); return; }
    if (path === 'documents' && Array.isArray(v)) {
      v.forEach((d, i) => { const doc = d as { name?: string; category?: string }; out.push([`documents.${i + 1}`, CONFIDENTIAL_DOCS.includes(doc.category as never) ? withheld : `${doc.name ?? ''}${doc.category ? ` (${doc.category})` : ''}`]); });
      return;
    }
    if (v && typeof v === 'object' && !Array.isArray(v)) { for (const [k, x] of Object.entries(v as Record<string, unknown>)) walk(x, path ? `${path}.${k}` : k); return; }
    if (v === undefined || v === null || v === '') return;
    out.push([path, showValue(v)]);
  };
  for (const [k, v] of Object.entries(rec)) { if (k === 'id' || k === 'sample' || k === 'history') continue; walk(v, k); }
  return out.map(([p, v]) => [p.includes('.') ? `${fieldLabel(lang, collection, p)} (${p})` : fieldLabel(lang, collection, p), v] as [string, string]).sort((a, b) => a[0].localeCompare(b[0]));
}

export interface BuildInput {
  lang: Lang; keys: string[]; audit: Map<string, AuditEntry[]>; team: AuditEntry[];
  format: ExportFormat; mode: ExportMode; person?: string; actions?: ActionFilter[]; at: number; ref: string;
  withheld: string; photosN: (n: number) => string;
}

/** Builds the report. Throws 'not-allowed' if any chosen record is no longer visible to the person right now. */
export function buildReport(state: AppState, inp: BuildInput): Report {
  const actions = inp.actions?.length ? inp.actions : ACTION_FILTERS;
  const me = myLabel(state);
  const records: ReportRecord[] = [];
  for (const key of inp.keys) {
    const i = key.indexOf(':');
    const collection = key.slice(0, i) as CollectionName, id = key.slice(i + 1);
    const lv = levelOf(state, collection, id);
    if (!lv) throw new Error('not-allowed');
    const rec = (state[collection] as unknown as Record<string, unknown>[]).find(x => x.id === id)!;
    const info = sharedInfo(state, collection, id);
    const all = (inp.audit.get(key) ?? []).slice().sort(newestFirst);
    const ownerId = info?.ownerId;
    // Permission history: this record's own grants plus Share All changes by its owner that cover its category.
    const scopes = scopesOf(collection, rec);
    const scopeEvents = inp.team.filter(e => e.action === 'permission' && !e.recordId && e.ownerId === (ownerId ?? me.id) && scopes.includes(String(e.detail?.scope) as never));
    records.push({
      key, collection, id, recordId: displayId(state, collection, id), title: recordTitle(inp.lang, collection, rec),
      ownerLabel: info ? personLabel(info.ownerName, info.ownerEmail) : personLabel(me.name, me.email),
      access: lv,
      snapshot: inp.mode === 'snapshot' ? snapshotOf(inp.lang, collection, rec, inp.withheld, inp.photosN) : undefined,
      permissions: [...all.filter(e => e.action === 'permission'), ...scopeEvents].sort(newestFirst),
      entries: applyAuditFilters(all, inp.person ?? '', actions),
    });
  }
  const rows: ReportRow[] = [];
  const totals = Object.fromEntries(ACTION_FILTERS.map(a => [a, 0])) as Record<ActionFilter, number>;
  let earliest: number | undefined, latest: number | undefined, count = 0;
  for (const r of records) for (const e of r.entries) {
    count++; totals[filterOf(e.action)]++;
    earliest = earliest === undefined ? e.at : Math.min(earliest, e.at);
    latest = latest === undefined ? e.at : Math.max(latest, e.at);
    const by = actorLabel(state, e, inp.lang);
    const summary = entrySummary(state, e, inp.lang);
    const ch = e.changes ?? [];
    if (!ch.length) rows.push({ at: e.at, recordId: r.recordId, action: summary, by, field: '', before: '', after: '', details: '', filter: filterOf(e.action) });
    else for (const c of ch) rows.push({ at: e.at, recordId: r.recordId, action: summary, by, field: fieldLabel(inp.lang, r.collection, c.field), before: showValue(c.before), after: showValue(c.after), details: c.field, filter: filterOf(e.action) });
  }
  rows.sort((a, b) => b.at - a.at);
  const pl = inp.person ? (records.flatMap(r => r.entries).find(e => e.actorId === inp.person)) : undefined;
  return {
    ref: inp.ref, at: inp.at, format: inp.format, mode: inp.mode, exporter: { id: me.id, label: personLabel(me.name, me.email) },
    person: inp.person, personLabel: pl ? actorLabel(state, pl, inp.lang) : undefined, actions,
    records, rows, totals, earliest, latest, count,
  };
}

/** A rough size before generating (shown in the preview; the real size is known once the file is made). */
export function estimateBytes(r: Pick<Report, 'rows' | 'records' | 'format'>): number {
  const snap = r.records.reduce((n, x) => n + (x.snapshot?.length ?? 0), 0);
  if (r.format === 'xlsx') return 9000 + r.rows.length * 260 + snap * 90 + r.records.length * 400;
  const lines = r.rows.length * 1.6 + snap + r.records.length * 12 + 30;
  const pages = Math.max(1, Math.ceil(lines / 38));
  return pages * 95_000 + 2000;
}
export const LARGE_BYTES = 4_000_000;
export const fmtBytes = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`);

/** "P1001 · Jalan …" without repeating the ID when the title already starts with it. */
export const recLine = (r: { recordId: string; title: string }) => (r.title.startsWith(r.recordId) ? r.title : `${r.recordId} · ${r.title}`);
