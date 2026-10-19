// Stage 6: Marketing Studio content rules — formats, what can never appear, missing and unverified facts, headline, languages.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FORMATS, FORMAT_IDS, MARKETING_KEYS, MIME, buildPosterContent, defaultMarketingSelection, marketingFields, marketingFileName } from '../src/marketing/content';
import { marketingStrings } from '../src/marketing/strings';
import { NEVER_SHARED, defaultAgentChoice } from '../src/listing/buyerPdf';
import type { Listing } from '../src/listing/model';

const rec = (o: Partial<Listing> = {}): Listing => ({
  id: 'p1', created: 1, updated: 1, photos: [], documents: [], ref: 'P1004', headline: 'Renovated corner terrace', type: 'Terrace house', purpose: 'sale',
  township: 'Bandar Baru Nilai', city: 'Nilai', state: 'Negeri Sembilan', street: 'Jalan Rahsia 9', unitNo: '12', lotNo: '77',
  bedrooms: 4, bathrooms: 3, parking: 2, builtUpSqft: 1800, landSqft: 2200, tenure: 'freehold', furnishing: 'partly', askingPrice: 580000, features: 'Corner lot, extra land',
  ownerName: 'SECRET OWNER', ownerPhone: '+60 12-999 8888', commissionPct: 2, notes: 'SECRET NOTE', arrangement: 'referral', handledBy: 'SECRET HANDLER', lat: 2.8123, lng: 101.7654,
  verification: { askingPrice: 'confirmed', bedrooms: 'confirmed', builtUpSqft: 'confirmed', tenure: 'confirmed' },
  ...o,
} as Listing);
const make = (l: Listing, o: Record<string, unknown> = {}, lang: 'en' | 'bm' | 'zh' = 'en') => {
  const fields = marketingFields(l, lang);
  return buildPosterContent({ lang, listing: l, fields, selected: defaultMarketingSelection(fields), ...o });
};

test('MK1 formats: A4 is 210:297, the square is 1:1, the portrait post is 4:5; each format offers only its own file types', () => {
  assert.deepEqual(FORMAT_IDS, ['a4', 'square', 'portrait']);
  assert.ok(Math.abs(FORMATS.a4.w / FORMATS.a4.h - 210 / 297) < 0.001);
  assert.equal(FORMATS.square.w, FORMATS.square.h); assert.equal(FORMATS.square.w, 1080);
  assert.equal(FORMATS.portrait.w / FORMATS.portrait.h, 4 / 5); assert.equal(FORMATS.portrait.w, 1080);
  assert.deepEqual(FORMATS.a4.outputs, ['pdf', 'png', 'jpg']);
  for (const f of ['square', 'portrait'] as const) assert.ok(!FORMATS[f].outputs.includes('pdf' as never));
  assert.deepEqual(Object.keys(MIME).sort(), ['jpg', 'pdf', 'png', 'webp']);
  assert.ok(FORMATS.a4.maxPhotos > FORMATS.portrait.maxPhotos && FORMATS.portrait.maxPhotos > FORMATS.square.maxPhotos - 1);
});

test('MK2 owner, commission, notes, handler, tenancy and map position are never offered or printed, even with everything ticked (JoyChange003 Change 76: the street and unit/lot are offered, never ticked at first)', () => {
  const keys = MARKETING_KEYS.map(k => String(k.key));
  for (const n of [...NEVER_SHARED, 'lotNo']) assert.ok(!keys.includes(n), `${n} must not be offered`);
  for (const n of ['street', 'unitNo']) assert.equal(MARKETING_KEYS.find(k => k.key === n)?.on, false, `${n} is offered but not ticked at first`);
  const l = rec();
  const fields = marketingFields(l, 'en');
  const c = buildPosterContent({ lang: 'en', listing: l, fields, selected: Object.fromEntries(fields.map(f => [String(f.key), true])), agent: { fullName: 'Agent Lee', phone: '012-111 2222' }, agentChoice: { name: true, agency: false, regNo: false, phone: true, email: false }, showRef: true });
  const text = JSON.stringify(c);
  for (const secret of ['SECRET', '999 8888', '2.8123', '101.7654']) assert.ok(!text.includes(secret), `${secret} leaked`);
  assert.deepEqual(c.agent, ['Agent Lee', '012-111 2222']);
});

test('MK3 headline: the agent\'s words first, then the property\'s advert title, then its card title, then its type — never made up', () => {
  const l = rec();
  assert.equal(make(l, { headline: '  Last unit! Call now  ' }).headline, 'Last unit! Call now');
  assert.equal(make(l).headline, 'Renovated corner terrace');
  const noHeadline = make(rec({ headline: undefined }));
  assert.equal(noHeadline.headline, 'Terrace House, Bandar Baru Nilai', 'type and area only');
  assert.ok(!/Jalan Rahsia|12/.test(noHeadline.headline), 'never the street or unit number');
  assert.ok(!/stunning|luxury|dream|prime|must see/i.test(noHeadline.headline), noHeadline.headline);
  const fields = marketingFields(rec({ headline: undefined }), 'en');
  const noPlace = buildPosterContent({ lang: 'en', listing: rec({ headline: undefined }), fields, selected: { ...defaultMarketingSelection(fields), township: false, city: false, state: false } });
  assert.equal(noPlace.headline, 'Terrace House', 'area unticked: type only');
  assert.equal(make(rec({ headline: undefined, type: undefined })).headline, 'Bandar Baru Nilai');
  assert.equal(make(rec({ headline: undefined, type: undefined, township: undefined, city: undefined, state: undefined, ref: undefined })).headline, 'Property');
});

test('MK3b a headline too long for the design is flagged so the agent can shorten it', () => {
  assert.equal(make(rec()).headlineLong, false);
  assert.equal(make(rec(), { headline: 'x'.repeat(71) }).headlineLong, true);
  assert.match(marketingStrings.en.warn.long, /shorten/);
});

test('MK4 a ticked detail with no value is left off the design and reported; with no price the design says so', () => {
  const l = rec({ askingPrice: undefined, bathrooms: undefined });
  const fields = marketingFields(l, 'en');
  const c = buildPosterContent({ lang: 'en', listing: l, fields, selected: { ...defaultMarketingSelection(fields), bathrooms: true, askingPrice: true } });
  assert.deepEqual(c.empty.sort(), ['Asking Price (RM)', 'Bathrooms'].sort());
  assert.equal(c.noPrice, true);
  assert.equal(c.prices.length, 0);
  assert.ok(!c.facts.some(f => f.key === 'bathrooms'));
  assert.ok(!JSON.stringify(c).includes('To Be Confirmed'), 'nothing invented as a placeholder on the artwork');
});

test('MK5 only facts the record marks Confirmed go without a *; others are marked, listed, and the design gets a footnote', () => {
  const allConfirmed = Object.fromEntries(['askingPrice', 'monthlyRent', 'tenure', 'builtUpSqft', 'landSqft', 'bedrooms', 'bathrooms', 'parking', 'furnishing', 'condition', 'availability', 'titleType'].map(k => [k, 'confirmed']));
  const ok = make(rec({ verification: allConfirmed as Listing['verification'] }));
  assert.equal(ok.unverified.length, 0); assert.equal(ok.footnote, undefined);
  assert.ok([...ok.prices, ...ok.facts].every(f => !f.unverified));
  const un = make(rec({ verification: { ...allConfirmed, askingPrice: 'owner', bedrooms: 'check', tenure: 'unknown' } as Listing['verification'] }));
  // Owner, 17 Oct 2026: a price has no check status, so an old Owner Stated mark on it does not add a *.
  assert.deepEqual(un.unverified.sort(), ['Bedrooms', 'Tenure'].sort());
  assert.match(un.footnote!, /^\* Not yet verified/);
  assert.equal(un.prices[0].unverified, false);
  assert.equal(un.facts.find(f => f.key === 'builtUpSqft')!.unverified, false);
  const unmarked = make(rec({ verification: {} }));
  assert.ok(unmarked.unverified.includes('Tenure'), '"Not marked" counts as not confirmed');
  assert.ok(!unmarked.unverified.includes('Asking Price (RM)'), 'a price has no check status');
});

test('MK6 price: asking price for a sale, rent per month for a rental; both when both are ticked; price formatted as RM', () => {
  const sale = make(rec());
  assert.deepEqual(sale.prices.map(p => p.value), ['RM 580,000']);
  const rent = make(rec({ purpose: 'rent', askingPrice: undefined, monthlyRent: 2400 }));
  assert.match(rent.prices[0].value, /RM 2,400/); assert.match(rent.prices[0].value, /month/);
  const both = make(rec({ purpose: 'sale_or_rent', monthlyRent: 2400 }));
  assert.equal(both.prices.length, 2);
  assert.equal(both.ribbon, 'Sale or Rent');
});

test('MK7 location line is township, city, state as ticked; the street is part of it only when ticked (Change 76); unticking removes it', () => {
  const c = make(rec());
  assert.equal(c.place, 'Bandar Baru Nilai, Nilai, Negeri Sembilan');
  const fields = marketingFields(rec(), 'en');
  const sel = { ...defaultMarketingSelection(fields), township: false, state: false };
  assert.equal(buildPosterContent({ lang: 'en', listing: rec(), fields, selected: sel }).place, 'Nilai');
});

test('MK8 a sample property says so; the reference number is shown only when the agent asks; the fact list is capped', () => {
  assert.equal(make(rec({ sample: true })).sample, true);
  assert.equal(make(rec()).sample, false);
  assert.equal(make(rec()).ref, undefined);
  assert.equal(make(rec(), { showRef: true }).ref, 'P1004');
  assert.ok(make(rec(), { maxFacts: 3 }).facts.length <= 3);
});

test('MK9 the design follows the chosen language: Bahasa Malaysia and Chinese labels, ribbon and footnote', () => {
  const bm = make(rec({ verification: {} }), {}, 'bm');
  const zh = make(rec({ verification: {} }), {}, 'zh');
  assert.equal(bm.ribbon, 'Untuk Dijual'); assert.match(zh.ribbon!, /出售/);
  assert.match(bm.footnote!, /Belum disahkan/); assert.match(zh.footnote!, /尚未核实/);
  assert.ok(bm.facts.some(f => /Bilik tidur/i.test(f.label)), bm.facts.map(f => f.label).join());
  assert.ok(zh.facts.some(f => /卧室|睡房|房间/.test(f.label)), zh.facts.map(f => f.label).join());
  assert.match(make(rec({ sample: true }), {}, 'zh').sampleLabel, /示例/);
});

test('MK10 file names are safe and say which format it is', () => {
  assert.equal(marketingFileName('P1004', 'property', 'square', 'png'), 'P1004-square.png');
  assert.equal(marketingFileName('A 12/3 *', 'property', 'a4', 'pdf'), 'A-12-3-a4.pdf');
  assert.equal(marketingFileName(undefined, '房产', 'portrait', 'webp'), '房产-portrait.webp');
  assert.equal(marketingFileName(undefined, '', 'square', 'jpg'), 'property-square.jpg');
});

test('MK11 Marketing Studio text exists in all three languages and says nothing is posted', () => {
  const shape = (v: unknown): unknown => (typeof v === 'function' ? 'fn' : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shape(x)])) : typeof v);
  assert.deepEqual(shape(marketingStrings.bm), shape(marketingStrings.en));
  assert.deepEqual(shape(marketingStrings.zh), shape(marketingStrings.en));
  assert.match(marketingStrings.en.intro, /Nothing is posted anywhere/);
  assert.match(marketingStrings.en.notPublished, /does not publish an advert/);
  assert.match(marketingStrings.bm.notPublished, /tidak menerbitkan iklan/);
  assert.match(marketingStrings.zh.notPublished, /不会发布广告/);
  assert.equal(defaultAgentChoice({ fullName: 'A', phone: '1' }).regNo, false);
});

test('MK12 (Stage 7) no screen text claims a size is right for a named social platform — the sizes are not verified against the platforms', () => {
  for (const lang of ['en', 'bm', 'zh'] as const) {
    const all = JSON.stringify(marketingStrings[lang]);
    assert.doesNotMatch(all, /Instagram|Facebook|WhatsApp|Meta/i, `${lang}: no platform named in the Marketing Studio text`);
  }
  assert.match(marketingStrings.en.formatHelp.square, /Check each platform/);
});
