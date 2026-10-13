// Stage 5 B: the buyer-facing property PDF — what can be chosen, what is never included, how missing and unverified
// facts are shown, and the three languages.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BUYER_KEYS, MAX_PDF_PHOTOS, NEVER_SHARED, agentLines, buildBuyerDoc, buyerFields, buyerStrings, defaultAgentChoice, defaultSelection, valueOf,
} from '../src/listing/buyerPdf';
import { listingStrings } from '../src/listing/strings';
import { layoutDocument, type Block, type Font } from '../src/lib/pdf';
import type { Listing } from '../src/listing/model';

const full = (o: Partial<Listing> = {}): Listing => ({
  id: 'p1', created: 1, updated: 1, photos: [], documents: [], ref: 'P1001', headline: 'Corner factory', type: 'factory', purpose: 'sale',
  township: 'Salak Tinggi', city: 'Sepang', state: 'Selangor', street: 'Jalan Industri 3', unitNo: 'A-12', lotNo: '55',
  bedrooms: 0, landSqft: 20000, builtUpSqft: 12000, askingPrice: 3_200_000, negotiable: 'yes', tenure: 'leasehold', leaseExpiryYear: 2090, titleType: 'Individual title',
  powerKva: 500, features: 'Two loading bays',
  ownerName: 'SECRET OWNER', ownerPhone: '+60 12-999 8888', commissionPct: 2, notes: 'SECRET NOTE: owner will drop to 3.0m', arrangement: 'referral', arrangementNote: 'SECRET AGENCY',
  tenancy: { tenant: 'SECRET TENANT', rent: 7777 }, handledBy: 'SECRET HANDLER', lat: 2.81234, lng: 101.76543,
  ...o,
} as Listing);
const text = (d: ReturnType<typeof buildBuyerDoc>) => JSON.stringify(d);
const all = (l: Listing, lang: 'en' | 'bm' | 'zh' = 'en') => { const fields = buyerFields(l, lang, 2026); return { fields, selected: Object.fromEntries(fields.map(f => [String(f.key), true])) }; };
const input = (l: Listing, extra = {}) => ({ lang: 'en' as const, listing: l, ...all(l), photos: [], now: Date.UTC(2026, 9, 14), ...extra });

test('BP1 owner, commission, notes, tenancy, arrangement and exact map position can never be in the PDF, even with everything ticked', () => {
  const keys = BUYER_KEYS.map(k => String(k.key));
  for (const n of NEVER_SHARED) assert.ok(!keys.includes(n), `${n} must not be offered`);
  const l = full();
  const doc = buildBuyerDoc(input(l, { agent: { fullName: 'Agent Lee' }, agentChoice: { name: true, agency: false, regNo: false, phone: false, email: false } }));
  const t = text(doc);
  for (const secret of ['SECRET', '999 8888', '7777', '2.81234', '101.76543', 'ownerName', 'Commission']) assert.ok(!t.includes(secret), `${secret} leaked`);
  assert.ok(t.includes('Corner factory') && t.includes('RM 3,200,000'));
});

test('BP2 the first ticks: everything with a value that is normally shared; the exact address and anything missing start unticked', () => {
  const sel = defaultSelection(buyerFields(full(), 'en', 2026));
  assert.ok(sel.askingPrice && sel.township && sel.city && sel.landSqft && sel.tenure && sel.features);
  assert.ok(!sel.street && !sel.unitNo && !sel.lotNo, 'exact address is off until the agent ticks it');
  assert.ok(!sel.monthlyRent && !sel.furnishing, 'missing details are not ticked');
  assert.ok(!sel.status, 'status is off at first');
});

test('BP3 missing information is left out unless the agent ticks it, and then shows "To be confirmed" — never a made-up value', () => {
  const l = full({ monthlyRent: undefined, furnishing: undefined });
  const fields = buyerFields(l, 'en', 2026);
  const base = buildBuyerDoc({ ...input(l), selected: defaultSelection(fields) });
  assert.ok(!text(base).includes('Monthly rent') && !text(base).includes('To be confirmed'));
  const withMissing = buildBuyerDoc({ ...input(l), selected: { ...defaultSelection(fields), monthlyRent: true, furnishing: true } });
  const rows = (withMissing.blocks.filter(b => b.t === 'rows') as Extract<Block, { t: 'rows' }>[]).flatMap(b => b.rows);
  const rent = rows.find(r => r.k.startsWith('Monthly rent'))!;
  assert.deepEqual([rent.v, rent.warn], ['To be confirmed', true]);
  assert.equal(rows.find(r => r.k === 'Furnishing')?.v, 'To be confirmed');
});

test('BP4 a record with almost nothing, no photos and no agent still makes a document and lays out on a page', () => {
  const bare: Listing = { id: 'x', created: 1, updated: 1, photos: [], documents: [] } as Listing;
  const doc = buildBuyerDoc({ ...input(bare), selected: defaultSelection(buyerFields(bare, 'en', 2026)) });
  assert.ok(doc.blocks.length >= 2);
  assert.doesNotThrow(() => buildBuyerDoc(input(bare)), 'even with every detail ticked (all "To be confirmed")');
  assert.ok(!text(doc).includes('undefined') && !text(doc).includes('NaN'));
  assert.ok(!doc.blocks.some(b => b.t === 'photos'), 'no photos block when there are none');
  const pages = layoutDocument(doc, (s: string, f: Font) => s.length * f.size * 0.5);
  assert.equal(pages.length, 1);
  assert.equal(valueOf(bare, 'askingPrice', listingStrings.en, 'en'), undefined);
});

test('BP5 each important fact keeps its check-status label; anything but Confirmed is marked as not verified', () => {
  const l = full({ verification: { askingPrice: 'confirmed', landSqft: 'owner', builtUpSqft: 'check', tenure: 'unknown' } });
  const rows = (buildBuyerDoc(input(l)).blocks.filter(b => b.t === 'rows') as Extract<Block, { t: 'rows' }>[]).flatMap(b => b.rows);
  const by = (k: string) => rows.find(r => r.k.startsWith(k))!;
  assert.deepEqual([by('Asking price').tag, by('Asking price').warn], ['Confirmed', false]);
  assert.deepEqual([by('Land area').tag, by('Land area').warn], ['Owner stated', true]);
  assert.deepEqual([by('Built-up').tag, by('Built-up').warn], ['Need to check', true]);
  assert.deepEqual([by('Tenure').tag, by('Tenure').warn], ['Unknown', true]);
  assert.deepEqual([by('Lease expiry').tag, by('Lease expiry').warn], ['Not marked', true], 'not marked is not confirmed');
  assert.equal(by('Property type').tag, undefined, 'facts without a check status carry no mark');
  const t = text(buildBuyerDoc(input(l)));
  assert.ok(t.includes('have not been verified'), 'legend warns about unconfirmed facts');
  const allConfirmed = full({ verification: Object.fromEntries(['askingPrice', 'landSqft', 'builtUpSqft', 'tenure', 'leaseExpiryYear', 'bedrooms', 'titleType', 'negotiable'].map(k => [k, 'confirmed'])) as never });
  const t2 = text(buildBuyerDoc({ ...input(allConfirmed), selected: Object.fromEntries(Object.keys(defaultSelection(buyerFields(allConfirmed, 'en', 2026))).filter(k => !['bedrooms', 'features', 'powerKva'].includes(k)).map(k => [k, true])) }));
  assert.ok(!t2.includes('have not been verified'));
});

test('BP6 values are written the way the property screens write them, with years left on a lease', () => {
  const s = listingStrings.en;
  const l = full();
  assert.equal(valueOf(l, 'askingPrice', s, 'en'), 'RM 3,200,000');
  assert.equal(valueOf(l, 'landSqft', s, 'en'), '20,000 sq ft');
  assert.equal(valueOf(l, 'tenure', s, 'en'), 'Leasehold');
  assert.equal(valueOf(l, 'leaseExpiryYear', s, 'en', 2026), `2090 (${s.yearsLeft(64)})`);
  assert.equal(valueOf(l, 'powerKva', s, 'en'), '500 kVA');
  assert.equal(valueOf(l, 'bedrooms', s, 'en'), '0', 'zero is a real value, not missing');
  assert.equal(valueOf(l, 'monthlyRent', s, 'en'), undefined);
});

test('BP7 the PDF can be written in English, Bahasa Malaysia or Chinese', () => {
  const l = full({ verification: { askingPrice: 'confirmed' } });
  for (const lang of ['en', 'bm', 'zh'] as const) {
    const doc = buildBuyerDoc({ ...input(l), lang, ...all(l, lang) });
    const headings = doc.blocks.filter(b => b.t === 'heading').map(b => (b as { text: string }).text);
    assert.ok(headings.includes(buyerStrings[lang].groups.money), `${lang} money heading`);
    assert.ok(text(doc).includes(buyerStrings[lang].disclaimer.slice(0, 20)));
  }
  assert.ok(text(buildBuyerDoc({ ...input(l), lang: 'zh', ...all(l, 'zh') })).includes('价格'));
  assert.ok(text(buildBuyerDoc({ ...input(l), lang: 'bm', ...all(l, 'bm') })).includes('Disahkan'));
  const en = Object.keys(buyerStrings.en).sort();
  assert.deepEqual(Object.keys(buyerStrings.bm).sort(), en); assert.deepEqual(Object.keys(buyerStrings.zh).sort(), en);
});

test('BP8 photos: none, some, or too many; the first is shown large; the number is capped', () => {
  const l = full();
  const mk = (n: number) => Array.from({ length: n }, (_, i) => ({ src: `blob:${i}`, w: 800, h: 600 }));
  const blocksOf = (n: number) => buildBuyerDoc(input(l, { photos: mk(n) })).blocks.filter(b => b.t === 'photos') as Extract<Block, { t: 'photos' }>[];
  assert.equal(blocksOf(0).length, 0);
  assert.deepEqual(blocksOf(1).map(b => b.items.length), [1]);
  const many = blocksOf(30);
  assert.equal(many.reduce((n, b) => n + b.items.length, 0), MAX_PDF_PHOTOS);
  assert.equal(many[0].cols, 1);
});

test('BP9 contact details follow the agent\'s ticks; a sample property is marked as a sample', () => {
  const p = { fullName: 'Agent Lee', agency: 'Lee Realty', regNo: 'E1234', phone: '+60 12-345 6789', email: 'lee@example.com' };
  assert.deepEqual(agentLines(p, defaultAgentChoice(p)), ['Agent Lee', 'Lee Realty', '+60 12-345 6789']);
  assert.deepEqual(agentLines({}, defaultAgentChoice({})), []);
  assert.deepEqual(agentLines(p, { name: false, agency: false, regNo: true, phone: false, email: true }), ['E1234', 'lee@example.com']);
  const t = text(buildBuyerDoc(input(full({ sample: true }))));
  assert.ok(t.includes('(Sample)'));
});

test('BP10 a long, fully ticked document lays out on A4 pages without losing a row', () => {
  const l = full({ features: 'Feature line. '.repeat(120), specs: 'Spec. '.repeat(80) });
  const doc = buildBuyerDoc(input(l, { photos: Array.from({ length: 9 }, (_, i) => ({ src: `blob:${i}`, w: 800, h: 600 })) }));
  const pages = layoutDocument(doc, (s: string, f: Font) => s.length * f.size * 0.5);
  assert.ok(pages.length >= 2);
  const printed = pages.flatMap(p => p.items.filter(i => i.k === 'text')).map(i => (i as { text: string }).text).join(' ');
  assert.ok(printed.includes('RM 3,200,000') && printed.includes('Salak Tinggi'));
});
