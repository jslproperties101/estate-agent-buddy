// Tests for the local pipeline, using synthetic sample files from tests/fixtures (invented data).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { pdfPagesWith } from '../src/local/pdf-core';
import { readSource, readNote, SourceResult } from '../src/local/pipeline';
import { extract, Proposal } from '../src/local/rules';
import { merge, keepDecisions } from '../src/local/merge';
import { checkSensitive, mask } from '../src/local/sensitive';
import { chooseCandidate, resetField, canSave, confirmField, rejectField, editField, Field } from '../src/review';

const FIX = new URL('./fixtures/', import.meta.url).pathname.replace('/.test-out/', '/tests/');
const pdf = (b: Uint8Array) => pdfPagesWith(pdfjs, b);
async function load(name: string, mime = ''): Promise<SourceResult> {
  return readSource({ id: name, name, mime, bytes: new Uint8Array(readFileSync(FIX + name)) }, pdf);
}
const props = (rs: SourceResult[]) => extract(rs.flatMap(r => r.segments), s => rs.find(r => r.blocked.has(s))?.blocked.get(s) ?? []);
const val = (ps: Proposal[], f: string) => ps.filter(p => p.field === f).map(p => p.value);

test('L1 English PDF: values read with page and exact words', async () => {
  const r = await load('brochure_en.pdf', 'application/pdf');
  assert.equal(r.info.status, 'read');
  assert.equal(r.info.pages, 2);
  const ps = props([r]);
  assert.deepEqual(val(ps, 'price'), ['RM 3,400,000']);
  const price = ps.find(p => p.field === 'price')!;
  assert.equal(price.page, 1);
  assert.match(price.quote, /Asking Price: RM 3\.4 mil/);
  assert.deepEqual(val(ps, 'land'), ['8,000 sq ft']);
  assert.equal(ps.find(p => p.field === 'land')!.page, 2);
  assert.deepEqual(val(ps, 'builtup'), ['6,500 sq ft']);
  assert.deepEqual(val(ps, 'tenure'), ['Freehold']);
  assert.deepEqual(val(ps, 'titleType'), ['Individual title']);
  assert.deepEqual(val(ps, 'ceiling'), ['28 ft']);
  assert.deepEqual(val(ps, 'power'), ['150 kVA']);
  assert.deepEqual(val(ps, 'lot'), ['2/14']);
  assert.deepEqual(val(ps, 'unit'), ['7']);
  assert.deepEqual(val(ps, 'type'), ['Semi-D factory']);
  assert.deepEqual(val(ps, 'docPhone'), ['+60 12-345 6789']);
  assert.ok(ps.every(p => !p.stated));
});

test('L2 Bahasa Malaysia Word file with a table', async () => {
  const r = await load('brochure_bm.docx');
  assert.equal(r.info.status, 'read');
  assert.equal(r.info.sensitive, false, '"Hakmilik individu" on a brochure is not a title document');
  const ps = props([r]);
  assert.deepEqual(val(ps, 'price'), ['RM 3,200,000']);
  assert.deepEqual(val(ps, 'land'), ['8,000 sq ft']);
  assert.deepEqual(val(ps, 'builtup'), ['6,500 sq ft']);
  assert.deepEqual(val(ps, 'tenure'), ['Freehold']);
  assert.deepEqual(val(ps, 'titleType'), ['Individual title']);
  assert.deepEqual(val(ps, 'power'), ['150 kVA']);
  assert.deepEqual(val(ps, 'type'), ['Semi-D factory']);
  assert.ok(val(ps, 'location')[0].includes('Nilai'));
  assert.deepEqual(val(ps, 'availability'), ['Available (for sale)']);
});

test('L3 two sources: price conflict flagged, agreeing values merged, nothing missing', async () => {
  const rs = [await load('brochure_en.pdf', 'application/pdf'), await load('brochure_bm.docx')];
  const m = merge(props(rs));
  assert.deepEqual(m.conflicts, ['price']);
  assert.match(m.fields.find(f => f.id === 'location')!.suggested, /Jalan Perindustrian 2\/3, Nilai/);
  const price = m.fields.find(f => f.id === 'price')!;
  assert.equal(price.candidates!.length, 2);
  assert.equal(price.suggested, '', 'the app does not pick one');
  const land = m.fields.find(f => f.id === 'land')!;
  assert.equal(land.candidates, undefined);
  assert.match(land.evidence, /brochure_en\.pdf p\.2.*brochure_bm\.docx/);
  assert.equal(m.group, 'industrial');
  assert.deepEqual(m.missing, []);
  assert.equal(m.wouldAskAi, false);
});

test('L4 SPA: sensitive, IC and account numbers never used, masked when shown', async () => {
  const r = await load('spa_sample.pdf', 'application/pdf');
  assert.equal(r.info.sensitive, true);
  assert.deepEqual(r.info.sensitiveReasons.sort(), ['bank', 'ic', 'spa']);
  const ps = props([r]);
  assert.ok(ps.every(p => !p.quote.includes('680101') && !p.value.includes('680101')));
  const seg = r.segments[0];
  const shown = mask(seg.text, r.blocked.get(seg)!);
  assert.ok(!shown.includes('680101-10-5678') && shown.includes('######-##-####'));
  assert.ok(!shown.includes('1234 5678 9012'));
});

test('L5 scanned PDF: marked as needing OCR, nothing guessed', async () => {
  const r = await load('scanned.pdf', 'application/pdf');
  assert.equal(r.info.status, 'needs-ocr');
  assert.deepEqual(r.info.scannedPages, [1, 2]);
  assert.equal(props([r]).length, 0);
});

test('L6 Chinese Word file (draft rules)', async () => {
  const ps = props([await load('brochure_zh.docx')]);
  assert.deepEqual(val(ps, 'price'), ['RM 3,200,000']);
  assert.deepEqual(val(ps, 'land'), ['8,000 sq ft']);
  assert.deepEqual(val(ps, 'tenure'), ['Freehold']);
  assert.deepEqual(val(ps, 'type'), ['Semi-D factory']);
  assert.deepEqual(val(ps, 'location'), ['Nilai']);
});

test('L7 Tamil Word file (draft rules)', async () => {
  const ps = props([await load('brochure_ta.docx')]);
  assert.deepEqual(val(ps, 'price'), ['RM 3,200,000']);
  assert.deepEqual(val(ps, 'land'), ['8,000 sq ft']);
  assert.deepEqual(val(ps, 'type'), ['Factory']);
});

test('L8 old .doc format is reported as unsupported', async () => {
  const r = await load('old_format.doc');
  assert.equal(r.info.status, 'unsupported');
});

test('L9 typed note: values are STATED', async () => {
  const r = await readNote('n1', 'Owner says asking RM 3.1 mil, freehold, 150 kVA');
  const m = merge(props([r]));
  const price = m.fields.find(f => f.id === 'price')!;
  assert.equal(price.label, 'STATED');
  assert.equal(price.suggested, 'RM 3,100,000');
});

test('L10 conflict must be chosen; Change brings the choice back', async () => {
  const rs = [await load('brochure_en.pdf', 'application/pdf'), await load('brochure_bm.docx')];
  let fs: Field[] = merge(props(rs)).fields;
  fs = fs.map(f => (f.candidates ? f : f.suggested ? confirmField(f, true) : rejectField(f)));
  assert.equal(canSave(fs), false, 'conflicts still open');
  fs = fs.map(f => (f.candidates ? chooseCandidate(f, 1) : f));
  assert.equal(canSave(fs), true);
  const price = fs.find(f => f.id === 'price')!;
  assert.equal(price.finalValue, price.candidates![1].value);
  const again = resetField(price);
  assert.equal(again.suggested, '');
  assert.equal(again.decision, 'pending');
});

test('L11 adding a file keeps decisions on values that did not change', async () => {
  const en = await load('brochure_en.pdf', 'application/pdf');
  let fs = merge(props([en])).fields.map(f => (f.id === 'land' ? editField(f, '8,100 sq ft') : f));
  const both = merge(props([en, await load('brochure_bm.docx')])).fields;
  fs = keepDecisions(fs, both);
  assert.equal(fs.find(f => f.id === 'land')!.finalValue, '8,100 sq ft');
  assert.equal(fs.find(f => f.id === 'price')!.decision, 'pending');
});

test('L12 money and area formats', () => {
  const seg = (text: string) => [{ sourceId: 'x', sourceName: 'x', page: null, text }];
  assert.deepEqual(val(extract(seg('Price: RM 850k')), 'price'), ['RM 850,000']);
  assert.deepEqual(val(extract(seg('Harga RM1.25 juta')), 'price'), ['RM 1,250,000']);
  assert.deepEqual(val(extract(seg('Maintenance: RM 0.30 psf')), 'price'), []);
  assert.deepEqual(val(extract(seg('Land: 1 acre')), 'land'), ['43,560 sq ft']);
  assert.deepEqual(val(extract(seg('Keluasan tanah: 2 ekar')), 'land'), ['87,120 sq ft']);
  assert.deepEqual(val(extract(seg('Built-up: 500 sq m')), 'builtup'), ['5,382 sq ft']);
  assert.deepEqual(val(extract(seg('Leasehold (99 years)')), 'tenure'), ['Leasehold (99 years)']);
  assert.equal(checkSensitive('IC: 900101105678').sensitive, true);
  assert.equal(checkSensitive('Hakmilik individu, Pegangan bebas').sensitive, false);
});
