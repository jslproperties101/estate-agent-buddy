// Change 010, Phases 4–5: audit-history reports (content rules, PDF page rules, XLSX workbook rules, file names, export
// references, export events) and saved export copies (Saved/Deleted Exports, owner-only deletion, one retry, restore,
// permission recheck, audit of every deletion). Runs in Node; the browser part is tests/ui-change010.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/data/store';
import { MemoryBackend } from '../src/data/backend';
import { readZip } from '../src/backup/zip';
import { buildReport, exportFileName, newExportRef, snapshotOf, estimateBytes, displayId } from '../src/exports/report';
import { layoutReport } from '../src/exports/pdfReport';
import { buildXlsx, SHEETS, HISTORY_HEADER_ROW } from '../src/exports/xlsx';
import { recordExport } from '../src/exports/generate';
import { keepExport, listExports, bulk, refusedFor, canDeleteExport, canAccessExport } from '../src/exports/saved';
import { allVisibleAudit } from '../src/audit/AuditUI';
import { EXACT_EXPORT } from '../src/exports/strings';
import type { Listing } from '../src/listing/model';
import type { Page } from '../src/lib/pdf';

const measure = (t: string, f: { size: number }) => t.length * f.size * 0.5;
const prop = (id: string, extra: Partial<Listing> = {}): Listing => ({ id, created: 1, updated: 1, photos: [], ...extra } as unknown as Listing);
const ws = { withheld: 'Withheld (confidential)', photosN: (n: number) => `${n} photos` };
const signedIn = (s: Store, userId = 'u-me') => s.setSingleton('meta', { syncSession: { accessToken: 'a', refreshToken: 'r', expiresAt: 9e15, email: 'me@x.com', userId, name: 'Mei', workspaceId: 'ws-me' } });

async function storeWithHistory(edits = 3) {
  const s = await Store.open(new MemoryBackend());
  signedIn(s);
  s.upsert('properties', prop('p1', { ref: 'P1001', street: 'Jalan 0' }));
  for (let i = 1; i <= edits; i++) s.upsert('properties', prop('p1', { ref: 'P1001', street: `Jalan ${i}`, askingPrice: 100000 * i }));
  s.upsert('properties', prop('p2', { ref: 'P1002' }));
  return s;
}
async function report(s: Store, keys: string[], extra: Partial<Parameters<typeof buildReport>[1]> = {}) {
  const audit = await allVisibleAudit(s);
  return buildReport(s.getState(), { lang: 'en', keys, audit, team: audit.get('team') ?? [], format: 'pdf', mode: 'history', at: Date.UTC(2026, 9, 15, 8, 30), ref: 'EXPTEST0001', ...ws, ...extra });
}

test('R1 file name, export reference and record ID', async () => {
  assert.equal(exportFileName(['P1001'], Date.UTC(2026, 9, 15, 8, 30), 'EXPAB12CD34', 'pdf'), 'Audit-History-P1001-20261015-EXPAB12CD34.pdf');
  assert.equal(exportFileName(['P1001', 'P1002'], Date.UTC(2026, 9, 15, 8, 30), 'EXPAB12CD34', 'xlsx'), 'Audit-History-MULTI2-20261015-EXPAB12CD34.xlsx');
  assert.match(exportFileName(['task/../x'], 0, 'EXP1', 'pdf'), /^Audit-History-taskx-19700101-EXP1\.pdf$/);
  const refs = new Set<string>();
  for (let i = 0; i < 500; i++) { const r = newExportRef(refs); assert.match(r, /^EXP[A-Z2-9]{8}$/); assert.ok(!refs.has(r)); refs.add(r); }
  const s = await storeWithHistory();
  assert.equal(displayId(s.getState(), 'properties', 'p1'), 'P1001');
});

test('R2 all history is included; person/action filters apply; totals and earliest/latest; access at export time', async () => {
  const s = await storeWithHistory(4);
  const r = await report(s, ['properties:p1']);
  assert.equal(r.count, 5, 'create + 4 edits, nothing left out');
  assert.equal(r.totals.edit, 5);
  assert.ok(r.earliest! <= r.latest!);
  assert.equal(r.records[0].recordId, 'P1001');
  assert.equal(r.records[0].access, 'owner');
  assert.equal(r.records[0].ownerLabel, 'Mei');
  assert.equal(r.exporter.label, 'Mei');
  assert.ok(r.rows.some(x => x.field === 'Asking Price (RM)' || x.details === 'askingPrice'));
  const none = await report(s, ['properties:p1'], { actions: ['permission'] });
  assert.equal(none.count, 0);
  const other = await report(s, ['properties:p1'], { person: 'u-somebody-else' });
  assert.equal(other.count, 0);
});

test('R3 a record that is no longer visible cannot be exported', async () => {
  const s = await storeWithHistory();
  await assert.rejects(() => report(s, ['properties:gone']), /not-allowed/);
});

test('R4 snapshot: every visible field, but confidential documents and identity details withheld; photos counted', () => {
  const rows = snapshotOf('en', 'properties', { id: 'p', street: 'Jalan 1', ownerIc: 'x', tenancy: { tenantName: 'Ali', nric: '900101-01-1234' },
    photos: [{ id: 'a' }, { id: 'b' }], documents: [{ name: 'Geran.pdf', category: 'title' }, { name: 'Brochure.pdf', category: 'brochure' }] }, ws.withheld, ws.photosN);
  const flat = Object.fromEntries(rows.map(([k, v]) => [k, v]));
  assert.ok(Object.values(flat).includes('Jalan 1'));
  assert.ok(Object.values(flat).includes('2 photos'));
  assert.ok(!JSON.stringify(rows).includes('900101-01-1234'), 'NRIC withheld');
  assert.ok(!JSON.stringify(rows).includes('Geran.pdf'), 'title document withheld');
  assert.ok(JSON.stringify(rows).includes('Brochure.pdf'));
});

function texts(p: Page) { return p.items.filter(i => i.k === 'text').map(i => (i as { text: string }).text); }
test('R5 PDF: header and footer on every page, watermark on every page, table headings only once, no agency/TOC/signature', async () => {
  const s = await storeWithHistory(60);
  const r = await report(s, ['properties:p1'], { mode: 'snapshot' });
  const pages = layoutReport({ report: r, lang: 'en', logo: { src: 'logo' } }, measure);
  assert.ok(pages.length >= 3, `long report spans pages (${pages.length})`);
  pages.forEach((p, i) => {
    const t = texts(p);
    assert.ok(t.includes('Estate Agent AI Buddy'), `brand on page ${i + 1}`);
    assert.ok(t.includes('Audit History Report'), `title on page ${i + 1}`);
    assert.ok(t.includes('15 Oct 2026, 4:30 PM (MYT, UTC+8)'), `export date on page ${i + 1}`);
    assert.ok(t.includes(`Page ${i + 1} of ${pages.length}`), `page number on page ${i + 1}`);
    assert.ok(t.includes('Record ID: P1001'), `record ID on page ${i + 1}`);
    assert.ok(t.includes('Export Reference: EXPTEST0001'), `export reference on page ${i + 1}`);
    assert.ok(p.items.some(x => x.k === 'image' && x.src === 'logo'), `logo on page ${i + 1}`);
    const mark = p.items.find(x => x.k === 'text' && x.text === 'CONFIDENTIAL') as { rotate?: number; alpha?: number } | undefined;
    assert.ok(mark && mark.rotate && (mark.alpha ?? 1) <= 0.15, `subtle watermark on page ${i + 1}`);
    assert.equal(p.items[0], mark as unknown, 'watermark drawn first, under the content');
  });
  const all = pages.flatMap(texts);
  assert.equal(all.filter(x => x === 'Date and Time (MYT)').length, 1, 'table headings appear once');
  assert.ok(all.some(x => x.startsWith('Confidential Information:')));
  assert.ok(!all.some(x => /agency|table of contents|signature|approved by/i.test(x)));
  assert.ok(all.includes('Permission Summary') && all.includes('Audit Summary') && all.includes('Current Record Snapshot: P1001'));
});

test('R6 XLSX: three worksheets, filters and frozen header on the detailed sheet, CONFIDENTIAL and warning on every sheet, action colours with labels', async () => {
  const s = await storeWithHistory(3);
  const dec = new TextDecoder();
  const files = (bytes: Uint8Array) => Object.fromEntries(readZip(bytes).map(e => [e.name, dec.decode(e.data)]));
  const snap = files(buildXlsx(await report(s, ['properties:p1'], { mode: 'snapshot', format: 'xlsx' }), 'en'));
  assert.match(snap['xl/workbook.xml'], new RegExp(`name="${SHEETS.summary}"[\\s\\S]*name="${SHEETS.snapshot}"[\\s\\S]*name="${SHEETS.history}"`));
  for (const n of [1, 2, 3]) {
    const x = snap[`xl/worksheets/sheet${n}.xml`];
    assert.match(x, /<t xml:space="preserve">CONFIDENTIAL<\/t>/, `label on sheet ${n}`);
    assert.ok(x.includes(EXACT_EXPORT.en.warning.replace(/&/g, '&amp;')), `warning on sheet ${n}`);
  }
  const hist = snap['xl/worksheets/sheet3.xml'];
  assert.match(hist, new RegExp(`<pane ySplit="${HISTORY_HEADER_ROW}" topLeftCell="A${HISTORY_HEADER_ROW + 1}" activePane="bottomLeft" state="frozen"/>`));
  assert.match(hist, new RegExp(`<autoFilter ref="A${HISTORY_HEADER_ROW}:H\\d+"/>`));
  assert.match(hist, /s="4"><is><t xml:space="preserve">Edited/, 'edits coloured, text label kept');
  const only = files(buildXlsx(await report(s, ['properties:p1'], { format: 'xlsx' }), 'en'));
  assert.doesNotMatch(only['xl/workbook.xml'], new RegExp(SHEETS.snapshot), 'no snapshot sheet for history only');
  assert.ok(estimateBytes(await report(s, ['properties:p1'], { format: 'xlsx' })) > 0);
});

test('R7 every export is recorded in the audit trail of every record in it', async () => {
  const s = await storeWithHistory(1);
  const r = await report(s, ['properties:p1', 'properties:p2']);
  recordExport(s, r);
  for (const k of ['properties:p1', 'properties:p2']) {
    const e = (await s.auditEntries(k)).find(x => x.action === 'export')!;
    assert.equal(e.detail?.ref, 'EXPTEST0001'); assert.equal(e.actorName, 'Mei'); assert.equal(e.detail?.records, 2);
  }
  assert.ok((await s.auditOutbox()).length >= 2, 'queued for the cloud');
});

// ---------- saved exports ----------
async function saved(s: Store, ref: string, ownerIds = ['u-me'], keys = ['properties:p1'], exporterId = 'u-me') {
  return keepExport(s, { ref, fileName: `Audit-History-P1001-20261015-${ref}.pdf`, format: 'pdf', mode: 'history', recordIds: ['P1001'], recordKeys: keys, ownerIds, exporterId, exporterLabel: 'Mei', at: Date.UTC(2026, 9, 15) }, new Blob(['%PDF-1.4 test'], { type: 'application/pdf' }));
}

test('E1 keep in the app; delete moves to Deleted Exports (recoverable), records who and when, and audits it', async () => {
  const s = await storeWithHistory(1);
  const e = await saved(s, 'EXPA');
  assert.equal(await s.hasFile(e.fileId), true);
  const r = await bulk(s, ['EXPA'], 'delete');
  assert.deepEqual(r, { done: ['EXPA'], failed: [], refused: [] });
  const [x] = await listExports(s);
  assert.ok(x.deletedAt); assert.equal(x.deletedByLabel, 'Mei');
  assert.equal(await s.hasFile(e.fileId), true, 'file still there: recoverable');
  const ev = (await s.auditEntries('properties:p1')).find(a => a.detail?.event === 'export_copy_deleted')!;
  assert.deepEqual([ev.detail?.count, ev.detail?.refs], [1, ['EXPA']]);
  assert.ok((await s.auditEntries('properties:p1')).some(a => a.action === 'edit'), 'the audit history itself is untouched');
  await bulk(s, ['EXPA'], 'restore');
  assert.equal((await listExports(s))[0].deletedAt, undefined);
});

test('E2 permanent deletion removes the file; bulk deletions are audited with the number of files and their references', async () => {
  const s = await storeWithHistory(1);
  const a = await saved(s, 'EXPA'); await saved(s, 'EXPB');
  await bulk(s, ['EXPA', 'EXPB'], 'delete');
  const r = await bulk(s, ['EXPA', 'EXPB'], 'purge');
  assert.deepEqual(r.done.sort(), ['EXPA', 'EXPB']);
  assert.deepEqual(await listExports(s), []);
  assert.equal(await s.hasFile(a.fileId), false);
  const ev = (await s.auditEntries('properties:p1')).find(x => x.detail?.event === 'export_copy_purged')!;
  assert.deepEqual([ev.detail?.count, (ev.detail?.refs as string[]).sort(), ev.detail?.bulk], [2, ['EXPA', 'EXPB'], true]);
});

test('E3 owner decision: people delete their OWN export copies (even of a shared record); never the record, its history or another person\'s copy; opening needs current access', async () => {
  const s = await storeWithHistory(1);
  s.setSingleton('meta', { shared: { 'properties:p2': { workspaceId: 'ws-her', ownerId: 'u-her', ownerEmail: 'her@x.com', level: 'view' } } });
  const mineOfHers = await saved(s, 'EXPMINE', ['u-her'], ['properties:p2']);
  const someoneElses = await saved(s, 'EXPOTHER', ['u-me'], ['properties:p1'], 'u-other');
  assert.equal(canDeleteExport(s.getState(), mineOfHers), true, 'my copy, though the record is hers');
  assert.equal(canDeleteExport(s.getState(), someoneElses), false, 'a copy made by another account');
  assert.deepEqual((await refusedFor(s, ['EXPMINE', 'EXPOTHER'], 'delete')).map(e => e.ref), ['EXPOTHER']);
  const histBefore = (await s.auditEntries('properties:p1')).filter(e => e.action !== 'export').length;
  const r = await bulk(s, ['EXPMINE', 'EXPOTHER'], 'delete');
  assert.deepEqual(r, { done: ['EXPMINE'], failed: [], refused: ['EXPOTHER'] });
  assert.equal((await listExports(s)).find(e => e.ref === 'EXPOTHER')!.deletedAt, undefined, 'the other copy untouched');
  await bulk(s, ['EXPMINE'], 'purge');
  assert.ok(s.getState().properties.some(p => p.id === 'p2'), 'the record stays');
  assert.equal((await s.auditEntries('properties:p1')).filter(e => e.action !== 'export').length, histBefore, 'audit history stays');
  // Opening still needs current access to the record.
  const again = await saved(s, 'EXPMINE2', ['u-her'], ['properties:p2']);
  assert.equal(canAccessExport(s.getState(), again), true);
  s.setSingleton('meta', { shared: {} });
  s.forgetRecord('properties', 'p2');
  assert.equal(canAccessExport(s.getState(), again), false);
  assert.equal(canDeleteExport(s.getState(), again), true, 'but I can still delete my own copy');
});

test('E5 owner decision: audit history of my own records is in my backup and comes back on restore; never other agents\' records', async () => {
  const { buildBackupManifest } = await import('../src/data/manifest');
  const { createBackup, inspectBackup, restoreBackup } = await import('../src/backup/backup');
  const s = await storeWithHistory(2);
  s.setSingleton('meta', { shared: { 'properties:p2': { workspaceId: 'ws-her', ownerId: 'u-her', ownerEmail: 'her@x.com', level: 'view' } } });
  s.appendAudit('team', [{ id: 'team-1', actorId: 'u-her', action: 'membership', at: 1 }]);
  const m = await buildBackupManifest(s);
  assert.deepEqual(Object.keys(m.audit ?? {}), ['properties:p1'], 'own record only: not the shared p2, not Team Workspace events');
  assert.equal(m.audit!['properties:p1'].length, 3);
  const b = await createBackup(s);
  const t = await Store.open(new MemoryBackend());
  signedIn(t);
  const res = await restoreBackup(t, await inspectBackup(b.bytes), 'missing');
  assert.equal(res.auditRestored, 3);
  const back = await t.auditEntries('properties:p1');
  for (const e of m.audit!['properties:p1']) assert.ok(back.some(x => x.id === e.id), 'every original entry is back');
  const again = await restoreBackup(t, await inspectBackup(b.bytes), 'missing');
  assert.equal(again.auditRestored, 0, 'restoring twice never duplicates');
});

test('E4 a failed deletion is retried once automatically; if it fails again the file is kept and named', async () => {
  const s = await storeWithHistory(1);
  await saved(s, 'EXPA'); await saved(s, 'EXPB');
  const once = await bulk(s, ['EXPA'], 'delete', (_ref, n) => n === 1);
  assert.deepEqual(once.done, ['EXPA'], 'second try succeeded');
  const twice = await bulk(s, ['EXPB'], 'delete', () => true);
  assert.deepEqual([twice.done, twice.failed], [[], ['EXPB']]);
  assert.equal((await listExports(s)).find(e => e.ref === 'EXPB')!.deletedAt, undefined, 'kept');
  assert.equal((await s.auditEntries('properties:p1')).filter(x => x.detail?.event === 'export_copy_deleted').length, 1, 'only the real deletion is audited');
});

test('R8 an archived record can be exported without restoring it, with its archive history', async () => {
  const s = await storeWithHistory(1);
  const p = s.getState().properties.find(x => x.id === 'p1')!;
  s.upsert('properties', { ...p, archived: { at: Date.now(), by: 'u-me' } });
  const r = await report(s, ['properties:p1']);
  assert.ok(s.getState().properties.find(x => x.id === 'p1')!.archived, 'still archived');
  assert.ok(r.records[0].entries.some(e => e.action === 'archive'));
  assert.equal(r.totals.delete, 1, 'archiving counts as a deletion');
});
