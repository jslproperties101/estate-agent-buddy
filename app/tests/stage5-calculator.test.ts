// Stage 5 A: Property Calculator — formulas unchanged, saved calculations (save, retrieve, delete, sync), the property
// search, and the reviewable update of the property record. Also the PDF layout and file writer used by the calculator
// and the buyer PDF (the browser drawing step is tested in the screen tests).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryBackend } from '../src/data/backend';
import { Store } from '../src/data/store';
import { syncNow } from '../src/data/sync';
import { DEFAULT_ASSUMPTIONS, purchase, rental, sale, agentCommission, monthlyInstalment } from '../src/domain/calculator';
import {
  applyPropertyUpdates, buildCalculation, calcResults, fromFlat, headline, inputRows, proposeUpdates, resultRows, searchProperties, toFlat,
} from '../src/calculator/saved';
import { calcStrings } from '../src/calculator/strings';
import { buildCalculationDoc } from '../src/calculator/pdfDoc';
import { PAGE_H, PAGE_W, buildPdf, layoutDocument, wrap, type Block, type Font } from '../src/lib/pdf';
import { rm, rm2, type Listing } from '../src/listing/model';
import { FakeCloud, cfg, phone } from './support/fakeCloud';

const inputs = () => ({
  purchase: { price: 500_000, downPct: 10, tenureYears: 35, ratePct: 4.2, buyer: 'citizen' as const, firstHome: false, valuationFee: 0, otherCosts: 0 },
  rental: { monthlyRent: 2000, maintenanceMonthly: 150, quitRentAssessmentYearly: 0, insuranceYearly: 0, otherMonthly: 0, vacancyMonths: 1 },
  sale: { salePrice: 800_000, purchasePrice: 500_000, purchaseCosts: 0, holdingYears: 6, outstandingLoan: 300_000, commissionPct: 2, commissionSst: true, earlySettlementPenalty: 0, otherSaleCosts: 0 },
  commission: { value: 600_000, pct: 2, sst: true },
});
const prop = (o: Partial<Listing> = {}): Listing => ({ id: 'p1', created: 1, updated: 1, photos: [], documents: [], ref: 'P1001', ...o } as Listing);
const mk = (kind: 'purchase' | 'rental' | 'sale' | 'commission' = 'purchase', link = {}) => buildCalculation('c1', 1000, kind, inputs(), toFlat(DEFAULT_ASSUMPTIONS), link);

// ---------- the existing formulas and Malaysian assumptions are untouched ----------
test('CA1 purchase figures still follow the Malaysian rules (MOT tiers, loan stamp, legal fee, SST)', () => {
  const r = purchase(inputs().purchase, DEFAULT_ASSUMPTIONS);
  assert.equal(r.loan, 450_000);
  assert.equal(r.downPayment, 50_000);
  assert.equal(r.mot.stamp, 9_000, '1% of 100,000 + 2% of 400,000');
  assert.equal(r.loanStamp.stamp, 2_250, '0.5% of the loan');
  const rate = 0.042 / 12, n = 35 * 12;
  assert.ok(Math.abs(r.monthly - (450_000 * rate) / (1 - (1 + rate) ** -n)) < 0.01);
  assert.ok(Math.abs(monthlyInstalment(450_000, 4.2, 35) - r.monthly) < 0.01);
  assert.equal(r.spaLegal.fee, 6_250 + 0, '1.25% of the first RM500,000');
  assert.equal(r.spaLegal.sst, 500, '8% SST on the legal fee');
});

test('CA2 sale (RPGT in year 6 is 0), commission with SST and rental yield are unchanged', () => {
  const s = sale(inputs().sale, DEFAULT_ASSUMPTIONS);
  assert.equal(s.rpgtPct, 0); assert.equal(s.rpgt, 0);
  const c = agentCommission(600_000, 2, true, DEFAULT_ASSUMPTIONS);
  assert.equal(c.fee, 12_000); assert.equal(c.sst, 960); assert.equal(c.total, 12_960);
  const p = purchase(inputs().purchase, DEFAULT_ASSUMPTIONS);
  const r = rental(inputs().rental, 500_000, p);
  assert.equal(r.grossYearly, 24_000);
  assert.ok(Math.abs(r.grossYieldPct - 4.8) < 1e-9);
});

test('CA3 the rates round-trip through the flat form, and missing values fall back to the defaults', () => {
  assert.deepEqual(fromFlat(toFlat(DEFAULT_ASSUMPTIONS)), DEFAULT_ASSUMPTIONS);
  assert.deepEqual(fromFlat(undefined), DEFAULT_ASSUMPTIONS);
  assert.equal(fromFlat({ sst: 6 }).sstPct, 6);
  assert.equal(fromFlat({ sst: 6 }).nonCitizenMotPct, 8);
});

// ---------- saving and retrieving ----------
test('CB1 a saved calculation is a copy: later edits to the inputs never change it', () => {
  const i = inputs();
  const c = buildCalculation('c1', 5, 'rental', i, toFlat(DEFAULT_ASSUMPTIONS), { propertyId: 'p1', contactId: 'k1', title: '  Tan family  ' });
  i.rental.monthlyRent = 9999; i.purchase.price = 1;
  assert.equal(c.rental.monthlyRent, 2000); assert.equal(c.purchase.price, 500_000);
  assert.deepEqual([c.kind, c.title, c.propertyId, c.contactId, c.created, c.updated], ['rental', 'Tan family', 'p1', 'k1', 5, 5]);
  const bare = mk('purchase');
  assert.equal('propertyId' in bare, false); assert.equal('contactId' in bare, false); assert.equal('title' in bare, false);
});

test('CB2 a calculation uses the rates saved with it, not today\'s: editing the rates later does not change an old result', () => {
  const c = mk('purchase');
  const before = calcResults(c).pr.cashRequired;
  const later = { ...c, rates: { ...c.rates, sst: 0, loanStamp: 2 } };
  assert.equal(calcResults(c).pr.cashRequired, before);
  assert.notEqual(calcResults(later).pr.cashRequired, before);
});

test('CB3 save, close and reopen the phone: the calculation, its property and its client are still there; delete is recoverable', async () => {
  const backend = new MemoryBackend();
  const s1 = await Store.open(backend);
  s1.upsert('calculations', mk('sale', { propertyId: 'p1', contactId: 'k1', title: 'Offer 800k' }));
  s1.upsert('calculations', { ...mk('commission'), id: 'c2', created: 2000, updated: 2000 });
  await s1.flush();
  const s2 = await Store.open(backend);
  const list = s2.getState().calculations;
  assert.deepEqual(list.map(c => c.id), ['c2', 'c1'], 'newest first');
  const c1 = list.find(c => c.id === 'c1')!;
  assert.deepEqual([c1.kind, c1.propertyId, c1.contactId, c1.title], ['sale', 'p1', 'k1', 'Offer 800k']);
  assert.equal(calcResults(c1).sr.cashAfterLoan, sale(inputs().sale, DEFAULT_ASSUMPTIONS).cashAfterLoan);
  s2.remove('calculations', 'c1');
  await s2.flush();
  assert.deepEqual(s2.getState().calculations.map(c => c.id), ['c2']);
  const gone = await s2.recentlyDeleted();
  assert.ok(gone.some(g => g.collection === 'calculations' && g.id === 'c1'), 'listed under Recently Deleted');
});

test('CB4 editing a saved calculation keeps one record and writes a history entry', async () => {
  const s = await Store.open(new MemoryBackend());
  s.upsert('calculations', mk('purchase'));
  const edited = { ...s.getState().calculations[0], purchase: { ...inputs().purchase, price: 650_000 } };
  s.upsert('calculations', edited);
  assert.equal(s.getState().calculations.length, 1);
  assert.equal(s.getState().calculations[0].purchase.price, 650_000);
  const h = await s.revisions('calculations:c1');
  assert.ok(h.length >= 1, 'the earlier version is kept');
});

test('CB5 a saved calculation reaches the team\'s other phone', async () => {
  const cloud = new FakeCloud();
  const a = await phone(cloud, 'o@x.c');
  a.store.upsert('calculations', mk('rental', { title: 'Rent check' }));
  await syncNow(a.store, cfg, cloud.fetch);
  assert.ok([...cloud.rows.keys()].some(k => k.endsWith('|calculations|c1')));
  const b = await phone(cloud, 'o@x.c');
  await syncNow(b.store, cfg, cloud.fetch);
  assert.equal(b.store.getState().calculations.find(c => c.id === 'c1')?.title, 'Rent check');
});

// ---------- choosing a property ----------
test('CC1 the property search matches every typed word against reference, place, type, street and owner', () => {
  const list = [
    prop({ id: 'a', ref: 'P1001', type: 'factory', township: 'Salak Tinggi', ownerName: 'Encik Ahmad' }),
    prop({ id: 'b', ref: 'P1002', type: 'terrace_house', township: 'Putra Nilai', street: 'Jalan Melor 3' }),
    prop({ id: 'c', ref: 'P1003', type: 'condo', township: 'Putra Nilai' }),
  ];
  assert.deepEqual(searchProperties(list, '').map(l => l.id), ['a', 'b', 'c'], 'empty search lists everything');
  assert.deepEqual(searchProperties(list, 'p1002').map(l => l.id), ['b']);
  assert.deepEqual(searchProperties(list, 'putra nilai').map(l => l.id), ['b', 'c']);
  assert.deepEqual(searchProperties(list, 'salak ahmad').map(l => l.id), ['a'], 'place and owner together');
  assert.deepEqual(searchProperties(list, 'melor').map(l => l.id), ['b']);
  assert.deepEqual(searchProperties(list, 'nothing like this'), []);
  assert.equal(searchProperties(Array.from({ length: 80 }, (_, i) => prop({ id: `x${i}`, ref: `P${2000 + i}` })), '').length, 30, 'long lists are capped');
});

// ---------- updating the property record ----------
test('CD1 the update proposes only changed, entered values and never touches the record by itself', () => {
  const p = prop({ askingPrice: 500_000, monthlyRent: 1800, maintenanceFee: 150, commissionPct: 2 });
  const snapshot = JSON.stringify(p);
  assert.deepEqual(proposeUpdates(mk('purchase'), p), [], 'same price: nothing to update');
  assert.deepEqual(proposeUpdates({ ...mk('purchase'), purchase: { ...inputs().purchase, price: 480_000 } }, p), [{ key: 'askingPrice', current: 500_000, proposed: 480_000 }]);
  assert.deepEqual(proposeUpdates(mk('rental'), p), [{ key: 'monthlyRent', current: 1800, proposed: 2000 }], 'maintenance is the same');
  assert.deepEqual(proposeUpdates(mk('sale'), p).map(u => u.key), ['askingPrice'], 'commission 2% is the same');
  assert.deepEqual(proposeUpdates({ ...mk('commission'), commission: { value: 600_000, pct: 3, sst: true } }, p), [{ key: 'commissionPct', current: 2, proposed: 3 }]);
  assert.deepEqual(proposeUpdates({ ...mk('purchase'), purchase: { ...inputs().purchase, price: 0 } }, p), [], 'an empty (zero) price is never proposed');
  assert.deepEqual(proposeUpdates(mk('purchase'), prop()), [{ key: 'askingPrice', current: undefined, proposed: 500_000 }], 'a missing value can be filled in');
  assert.equal(JSON.stringify(p), snapshot, 'the property object is not changed by proposing');
});

test('CD2 applying the ticked updates changes only those fields and records it in the property history', () => {
  const p = prop({ askingPrice: 500_000, monthlyRent: 1800, notes: 'keep' });
  const ups = proposeUpdates(mk('rental'), p);
  const next = applyPropertyUpdates(p, ups, 9000, 'Updated from a saved calculation');
  assert.equal(next.monthlyRent, 2000); assert.equal(next.askingPrice, 500_000); assert.equal(next.notes, 'keep');
  assert.equal(p.monthlyRent, 1800, 'the original object is not mutated');
  assert.deepEqual(next.history?.[0], { at: 9000, source: 'form', summary: 'Updated from a saved calculation' });
  assert.equal(applyPropertyUpdates(p, [], 1, 'x'), p, 'nothing ticked: the same record');
});

test('CD3 updating through the store keeps the record and its other data, and an unlinked/deleted property just has nothing to update', async () => {
  const s = await Store.open(new MemoryBackend());
  s.upsert('properties', prop({ askingPrice: 500_000, ref: 'P1001' }));
  const c = mk('sale');
  const cur = s.getState().properties[0];
  s.upsert('properties', applyPropertyUpdates(cur, proposeUpdates(c, cur), 5, 'from calc'));
  const after = s.getState().properties[0];
  assert.equal(after.askingPrice, 800_000); assert.equal(after.ref, 'P1001');
  assert.equal(s.getState().properties.length, 1);
});

// ---------- lines shown in the history and the PDF ----------
test('CE1 the breakdown lines equal the calculator\'s own figures, in every language', () => {
  for (const lang of ['en', 'bm', 'zh'] as const) {
    const t = calcStrings[lang];
    for (const kind of ['purchase', 'rental', 'sale', 'commission'] as const) {
      const c = mk(kind);
      const rows = resultRows(c, t);
      assert.ok(rows.length >= 3, `${lang} ${kind} has result rows`);
      assert.ok(rows.every(r => r.k.trim() && r.v.trim()), `${lang} ${kind}: no empty label or value`);
      assert.ok(inputRows(c, t).every(r => r.k.trim() && r.v.trim()), `${lang} ${kind}: input rows`);
      assert.ok(headline(c, t).label && headline(c, t).value);
    }
  }
  const t = calcStrings.en;
  const pr = purchase(inputs().purchase, DEFAULT_ASSUMPTIONS);
  const rows = resultRows(mk('purchase'), t);
  assert.equal(rows.find(r => r.k === t.out.monthly)?.v, rm2(pr.monthly));
  assert.equal(rows.find(r => r.k === t.out.cash)?.v, rm2(pr.cashRequired));
  assert.equal(rows.find(r => r.k === t.out.mot)?.v, 'RM 9,000.00');
  assert.equal(headline(mk('commission'), t).value, rm2(12_960));
  assert.equal(rm(500_000), 'RM 500,000');
});

test('CE2 the calculator PDF document holds the property, client, inputs, results, rates and the estimate notice', () => {
  const c = mk('purchase', { propertyId: 'p1', contactId: 'k1', title: 'Offer for Mr Tan' });
  const doc = buildCalculationDoc(c, { lang: 'en', property: prop({ type: 'condo', township: 'Putra Nilai' }), contact: { name: 'Mr Tan' }, agent: { fullName: 'Agent Lee', agency: 'Lee Realty' }, now: Date.UTC(2026, 9, 14) });
  const text = JSON.stringify(doc.blocks);
  for (const must of ['Offer for Mr Tan', 'P1001', 'Prepared for Mr Tan', 'Monthly repayment', 'Estimated total cash required', 'Rates used', 'Estimates for discussion only', 'Agent Lee']) assert.ok(text.includes(must), must);
  assert.ok(doc.footer && doc.footer.includes('Estimate only'));
  const noLinks = buildCalculationDoc(mk('rental'), { lang: 'zh', now: 0 });
  assert.ok(JSON.stringify(noLinks.blocks).includes('结果'), 'Chinese headings');
  assert.ok(!JSON.stringify(noLinks.blocks).includes('undefined'));
});

// ---------- PDF layout and file ----------
const measure = (text: string, f: Font) => text.length * f.size * 0.5;

test('PD1 text is wrapped to the line width, long words and Chinese are cut, nothing is lost', () => {
  const f: Font = { size: 10, colour: '#000' };
  const lines = wrap('alpha beta gamma delta epsilon zeta eta theta iota kappa', f, 100, measure);
  assert.ok(lines.length > 1 && lines.every(l => measure(l, f) <= 100));
  assert.equal(lines.join(' ').replace(/\s+/g, ' '), 'alpha beta gamma delta epsilon zeta eta theta iota kappa');
  const long = wrap('x'.repeat(100), f, 100, measure);
  assert.ok(long.length > 1 && long.join('') === 'x'.repeat(100));
  const zh = wrap('这是一个很长的中文句子，没有空格，也必须换行显示出来才可以。', f, 60, measure);
  assert.ok(zh.length > 1 && zh.join('') === '这是一个很长的中文句子，没有空格，也必须换行显示出来才可以。');
  assert.deepEqual(wrap('', f, 100, measure), ['']);
});

test('PD2 a long document is split over several A4 pages; every item stays inside the page; the footer numbers the pages', () => {
  const rows = Array.from({ length: 140 }, (_, i) => ({ k: `Line ${i + 1} with some words to wrap`, v: `RM ${i * 1000}.00`, strong: i % 7 === 0 }));
  const pages = layoutDocument({ blocks: [{ t: 'title', text: 'Big' }, { t: 'heading', text: 'Rows' }, { t: 'rows', rows }], footer: 'Footer' }, measure);
  assert.ok(pages.length >= 3, `pages: ${pages.length}`);
  for (const [i, p] of pages.entries()) {
    for (const it of p.items) {
      if (it.k === 'text') assert.ok(it.y > 0 && it.y <= PAGE_H, `text y on page ${i + 1}`);
      if (it.k === 'rect' || it.k === 'image') assert.ok(it.y + it.h <= PAGE_H && it.x + it.w <= PAGE_W + 0.01);
    }
    assert.ok(p.items.some(it => it.k === 'text' && it.text === `${i + 1} / ${pages.length}`), 'page number');
  }
});

test('PD3 photos go in a grid, move to the next page when they do not fit, and a photo without a size still gets a frame', () => {
  const items = Array.from({ length: 9 }, (_, i) => ({ src: `blob:${i}`, w: 400, h: 300, caption: `Photo ${i + 1}` }));
  const blocks: Block[] = [{ t: 'text', text: 'x' }, { t: 'photos', items, cols: 2 }, { t: 'photos', items: [{ src: 'blob:z', w: 0, h: 0 }], cols: 1 }];
  const pages = layoutDocument({ blocks }, measure);
  const imgs = pages.flatMap(p => p.items.filter(i => i.k === 'image'));
  assert.equal(imgs.length, 10);
  assert.ok(pages.length >= 2, 'photos continue on another page');
});

test('PD4 empty and odd input never throws: an empty document is one page', () => {
  assert.equal(layoutDocument({ blocks: [] }, measure).length, 1);
  assert.doesNotThrow(() => layoutDocument({ blocks: [{ t: 'rows', rows: [{ k: '', v: '' }] }, { t: 'text', text: '' }, { t: 'photos', items: [] }, { t: 'rule' }, { t: 'space', h: 5000 }] }, measure));
});

test('PD5 the PDF file is valid: header, one page object per picture, an exact cross-reference table', () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 0xff, 0xd9]);
  const bytes = buildPdf([{ data: jpeg, w: 1190, h: 1684 }, { data: jpeg, w: 1190, h: 1684 }], { title: 'Test "PDF" (1)', now: new Date(Date.UTC(2026, 9, 14, 8, 0, 0)) });
  const text = Buffer.from(bytes).toString('latin1');
  assert.ok(text.startsWith('%PDF-1.4'));
  assert.ok(text.trimEnd().endsWith('%%EOF'));
  assert.equal((text.match(/\/Type \/Page /g) ?? []).length, 2);
  assert.ok(text.includes('/Count 2') && text.includes('/DCTDecode'));
  assert.ok(text.includes('/Title (Test "PDF" \\(1\\))'), 'title escaped');
  assert.ok(text.includes('D:20261014080000Z'));
  // every xref offset points at "<n> 0 obj"
  const x = /xref\n0 (\d+)\n([\s\S]*?)trailer/.exec(text)!;
  const entries = x[2].trim().split('\n');
  assert.equal(entries.length, Number(x[1]));
  entries.slice(1).forEach((e, i) => {
    const off = Number(e.slice(0, 10));
    assert.ok(Buffer.from(bytes).subarray(off, off + 12).toString('latin1').startsWith(`${i + 1} 0 obj`), `object ${i + 1} at ${off}`);
  });
  const start = Number(/startxref\n(\d+)/.exec(text)![1]);
  assert.ok(Buffer.from(bytes).subarray(start, start + 4).toString('latin1') === 'xref');
  assert.throws(() => buildPdf([]));
  // the JPEG bytes are carried through unchanged
  const bin = Buffer.from(bytes);
  assert.ok(bin.includes(Buffer.from(jpeg)));
});

test('CF1 English, Bahasa Malaysia and Chinese all have every new calculator string', () => {
  const keys = (o: unknown, p = ''): string[] => Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v, `${p}${k}.`) : [`${p}${k}`]));
  const en = keys(calcStrings.en.x).sort();
  assert.deepEqual(keys(calcStrings.bm.x).sort(), en);
  assert.deepEqual(keys(calcStrings.zh.x).sort(), en);
  for (const l of ['bm', 'zh'] as const) {
    assert.notEqual(calcStrings[l].x.tab, calcStrings.en.x.tab);
    assert.notEqual(calcStrings[l].x.save.button, calcStrings.en.x.save.button);
    assert.notEqual(calcStrings[l].x.upd.title, calcStrings.en.x.upd.title);
    assert.notEqual(calcStrings[l].x.pdf.button, calcStrings.en.x.pdf.button);
  }
  assert.ok(/[一-鿿]/.test(calcStrings.zh.x.upd.apply));
});
