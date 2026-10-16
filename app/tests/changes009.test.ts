// Changes 001–009 (owner, Oct 2026): the data rules behind the Property List and the property form.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Listing, TYPES, LAND_USES, RESTRICTIONS, RENT_COMMISSION_MONTHS, unitLot, title, cardTitle, addressLine, forEditing, orderedPhotos, mainPhoto,
  movePhoto, parseMapsLink, commissionRm, rentCommissionRm, restrictionValue, applyFilters,
} from '../src/listing/model';
import { shownState, toCheck } from '../src/listing/verify';
import { titleCase } from '../src/lib/titleCase';
import { listingStrings } from '../src/listing/strings';
import { sampleData } from '../src/data/sample';
import { dealStart } from '../src/finance/FinanceUI';
import { proposeUpdates } from '../src/calculator/saved';
import { possibleDuplicates } from '../src/domain/duplicates';
import { readDetails } from '../src/listing/commands';
import { aliasValue, phoneTyped } from '../src/ui/ContactBox';
import { buyerFields } from '../src/listing/buyerPdf';

const L = (x: Partial<Listing>): Listing => ({ id: 'p', created: 0, updated: 0, photos: [], ...x });
const ph = (id: string) => ({ id, name: `${id}.jpg`, fileId: `f-${id}` });

test('C9-1 one Unit/Lot Number: older records with a lot number show both, nothing is lost, and search finds either', () => {
  assert.equal(unitLot({ unitNo: '7', lotNo: '2/14' }), '7, Lot 2/14');
  assert.equal(unitLot({ lotNo: '21' }), 'Lot 21');
  assert.equal(unitLot({ lotNo: 'Lot 21' }), 'Lot 21', 'no "Lot Lot"');
  assert.equal(unitLot({ unitNo: 'No. 7, Lot 2/14', lotNo: '2/14' }), 'No. 7, Lot 2/14', 'not repeated when already inside');
  const old = L({ unitNo: '7', lotNo: '2/14', restriction: 'No restriction', street: 'Jalan A' });
  const e = forEditing(old);
  assert.equal(e.unitNo, '7, Lot 2/14');
  assert.equal(e.lotNo, undefined, 'the form edits one field');
  assert.equal(old.lotNo, '2/14', 'the stored record itself is not changed until the agent saves');
  assert.equal(applyFilters([old], { location: '2/14' }).length, 1);
});

test('C9-2 cards are titled by the address (unit/lot + street, then place once), never the headline', () => {
  const l = L({ headline: 'Stunning corner unit', unitNo: 'No. 12', street: 'Jalan Sampel 3', township: 'Taman Sampel', city: 'Nilai', state: 'Negeri Sembilan' });
  assert.equal(cardTitle(l), 'No. 12, Jalan Sampel 3, Taman Sampel, Nilai');
  assert.ok(!cardTitle(l).includes('Stunning'));
  assert.equal(title(L({ street: 'Jalan Nilai 3', city: 'Nilai' })), 'Jalan Nilai 3', 'a town already in the street is not repeated');
  assert.equal(addressLine(L({ unitNo: 'B-1', street: 'Jalan X', township: 'Putra Nilai', city: 'Nilai', state: 'NS', country: 'Malaysia' })), 'B-1, Jalan X, Putra Nilai, NS, Malaysia');
});

test('C9-3 sample data: no headlines, clearly made-up addresses, unit/lot in one field, rentals with months of commission', () => {
  const { properties } = sampleData(Date.UTC(2026, 9, 15));
  assert.ok(properties.every(p => !p.headline), 'sample headlines are empty');
  assert.ok(properties.every(p => /Sampel/.test(p.street ?? '')), 'every sample street is obviously invented');
  assert.ok(properties.every(p => p.lotNo === undefined));
  assert.ok(properties.every(p => !p.restriction || (RESTRICTIONS as readonly string[]).includes(p.restriction)));
  for (const p of properties.filter(x => x.purpose === 'rent')) assert.ok(p.rentCommissionMonths !== undefined && p.commissionPct === undefined, p.id);
  assert.ok(properties.some(p => p.extraComments));
});

test('C9-4 commission: a percentage for a sale, months of rent for a rental (1, 1.5, 2) — never months as a percent', () => {
  assert.deepEqual([...RENT_COMMISSION_MONTHS], [1, 1.5, 2]);
  assert.equal(commissionRm({ purpose: 'sale', askingPrice: 1_250_000, commissionPct: 2 }), 25_000);
  assert.equal(commissionRm({ purpose: 'sale', askingPrice: 580_000, commissionPct: 2.5 }), 14_500);
  assert.equal(commissionRm({ purpose: 'rent', askingPrice: 580_000, commissionPct: 2 }), undefined, 'a rental has no sale commission');
  assert.equal(rentCommissionRm({ purpose: 'rent', monthlyRent: 1800, rentCommissionMonths: 1 }), 1800);
  assert.equal(rentCommissionRm({ purpose: 'rent', monthlyRent: 1800, rentCommissionMonths: 1.5 }), 2700);
  assert.equal(rentCommissionRm({ purpose: 'rent', monthlyRent: 1800, rentCommissionMonths: 2 }), 3600);
  assert.equal(rentCommissionRm({ purpose: 'sale', monthlyRent: 1800, rentCommissionMonths: 2 }), undefined);
  const both = { purpose: 'sale_or_rent' as const, askingPrice: 1_200_000, commissionPct: 2, monthlyRent: 6500, rentCommissionMonths: 1 };
  assert.deepEqual([commissionRm(both), rentCommissionRm(both)], [24_000, 6500], 'sale or rent: each deal uses its own input');
  // Finance and calculator never read months as a percentage.
  assert.deepEqual(dealStart(L({ purpose: 'rent', monthlyRent: 1800, rentCommissionMonths: 1.5 })), { value: 1800, commissionPct: undefined, commission: 2700 });
  assert.deepEqual(dealStart(L({ purpose: 'sale', askingPrice: 500000, commissionPct: 2 })), { value: 500000, commissionPct: 2, commission: 0 });
  const calc = { kind: 'commission', commission: { value: 2700, pct: 100, sst: true } } as never;
  assert.deepEqual(proposeUpdates(calc, { purpose: 'rent', monthlyRent: 1800 }), [], 'no percentage written onto a rental');
  assert.equal(proposeUpdates(calc, { purpose: 'sale', askingPrice: 1 }).length, 1);
});

test('C9-5 photos: the first is the main photo; moving, deleting and the old main choice all keep that rule', () => {
  const photos = [ph('a'), ph('b'), ph('c')];
  assert.deepEqual(orderedPhotos({ photos, mainPhotoId: 'c' }).map(p => p.id), ['c', 'a', 'b'], 'an older main choice goes first');
  assert.equal(mainPhoto(L({ photos, mainPhotoId: 'b' }))!.id, 'b');
  const e = forEditing(L({ photos, mainPhotoId: 'b' }));
  assert.deepEqual([e.photos.map(p => p.id), e.mainPhotoId], [['b', 'a', 'c'], 'b']);
  assert.deepEqual(movePhoto(photos, 2, 0).map(p => p.id), ['c', 'a', 'b']);
  assert.deepEqual(movePhoto(photos, 0, 2).map(p => p.id), ['b', 'c', 'a']);
  assert.equal(movePhoto(photos, 0, 9), photos, 'out of range: unchanged');
  assert.deepEqual(movePhoto([], 0, 0), []);
  assert.equal(mainPhoto(L({ type: 'Terrace house' }))!.sample, true, 'no photos: the drawn sample picture, safely');
});

test('C9-6 Google Maps link: coordinates only when the link itself holds them; short links and other sites give none', () => {
  assert.deepEqual(parseMapsLink('https://www.google.com/maps/place/X/@2.8167,101.7972,17z'), { lat: 2.8167, lng: 101.7972 });
  assert.deepEqual(parseMapsLink('https://maps.google.com/?q=2.81,101.79'), { lat: 2.81, lng: 101.79 });
  assert.deepEqual(parseMapsLink('https://www.google.com/maps/search/?api=1&query=3.1390,101.6869'), { lat: 3.139, lng: 101.6869 });
  assert.deepEqual(parseMapsLink('https://www.google.com/maps/place/Y/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d2.9!4d101.7'), { lat: 2.9, lng: 101.7 });
  assert.equal(parseMapsLink('https://maps.app.goo.gl/ExampleLink'), undefined);
  assert.equal(parseMapsLink('https://example.com/@2.8,101.7'), undefined);
  assert.equal(parseMapsLink('not a link'), undefined);
  assert.equal(parseMapsLink('https://maps.google.com/?q=200,500'), undefined, 'impossible coordinates');
});

test('C9-7 verification: an unmarked fact with a value counts as Need to check; marks are kept; Unknown is also to check', () => {
  const l = L({ builtUpSqft: 1500, bedrooms: 3, tenure: 'freehold', verification: { tenure: 'confirmed', bedrooms: 'owner' } });
  assert.equal(shownState(l, 'builtUpSqft'), 'check');
  assert.equal(shownState(l, 'tenure'), 'confirmed');
  assert.equal(shownState(l, 'bedrooms'), 'owner');
  assert.equal(shownState(l, 'landSqft'), undefined, 'no value, no mark: nothing to show');
  assert.equal(shownState(l, 'headline'), undefined, 'not a verifiable fact');
  assert.deepEqual(toCheck(l), ['builtUpSqft']);
  assert.deepEqual(toCheck(L({ verification: { landSqft: 'unknown' } })), ['landSqft']);
  // Owner, 17 Oct 2026: a price has no check status, so it is never "to check".
  assert.equal(shownState(L({ askingPrice: 500000, monthlyRent: 2000 }), 'askingPrice'), undefined);
  assert.deepEqual(toCheck(L({ askingPrice: 500000, monthlyRent: 2000 })), []);
  const pdf = buyerFields(l, 'en', 2026).find(f => f.key === 'builtUpSqft')!;
  assert.deepEqual([pdf.status, pdf.confirmed], ['Need to Check', false], 'the buyer PDF never shows an unmarked fact as confirmed');
});

test('C9-8 form lists: land types together, land use NIL, NON Bumiputera (old "No restriction" maps to it)', () => {
  const lands = TYPES.map((t, i) => [t, i] as const).filter(([t]) => /land$/.test(t)).map(([, i]) => i);
  assert.deepEqual(lands, [lands[0], lands[0] + 1, lands[0] + 2, lands[0] + 3], 'the four land types sit together');
  assert.ok(TYPES.includes('Residential land'));
  assert.ok((LAND_USES as readonly string[]).includes('nil'));
  assert.equal(listingStrings.en.landUse.nil, 'NIL');
  assert.deepEqual([...RESTRICTIONS], ['NON Bumiputera', 'Bumiputera lot', 'Malay reserve']);
  assert.equal(restrictionValue('No restriction'), 'NON Bumiputera');
  assert.equal(restrictionValue('Malay reserve'), 'Malay reserve');
  assert.equal(listingStrings.en.restrictions['No restriction'], 'NON Bumiputera');
});

test('C9-9 Title Case for short labels (English, Malay); sentences and Chinese are untouched', () => {
  assert.equal(titleCase('Price, tenure and title info', 'en'), 'Price, Tenure and Title Info');
  assert.equal(titleCase('Land area (sq ft)', 'en'), 'Land Area (sq ft)');
  assert.equal(titleCase('Power supply (kVA)', 'en'), 'Power Supply (kVA)');
  assert.equal(titleCase('Approvals (e.g. DO, KM)', 'en'), 'Approvals (e.g. DO, KM)');
  assert.equal(titleCase('Komisen (bulan sewa)', 'bm'), 'Komisen (Bulan Sewa)');
  assert.equal(titleCase('地契与产权', 'zh'), '地契与产权');
  assert.equal(listingStrings.en.sec.tenure, 'Price, Tenure and Title Info');
  assert.equal(listingStrings.en.l.unitNo, 'Unit/Lot Number');
  assert.equal(listingStrings.en.l.askingPrice, 'Asking Price (RM)');
  assert.match(listingStrings.en.allOptional, /^Every field is optional\. Fill what you know/, 'help sentences keep sentence case');
});

test('C9-10 duplicates and voice use the one Unit/Lot Number', () => {
  const a = L({ id: 'a', unitNo: 'Lot 2/14', township: 'Nilai' });
  assert.deepEqual(possibleDuplicates(L({ id: 'b', lotNo: '2/14', township: 'Nilai' }), [a]).map(x => x.reason), ['lot']);
  const { changes } = readDetails('New terrace house, unit 7, lot 2/14, Jalan Sampel 3');
  assert.equal(changes.find(c => c.key === 'unitNo')?.value, '7, Lot 2/14');
  assert.equal(changes.find(c => (c.key as string) === 'lotNo'), undefined);
});

test('C9-11 contact boxes: "+" and "@" are display prefixes; stored values never get them twice', () => {
  assert.equal(phoneTyped('012-345 6789'), '+012-345 6789');
  assert.equal(phoneTyped('+60 12'), '+60 12');
  assert.equal(phoneTyped('++60'), '+60');
  assert.equal(phoneTyped(''), undefined);
  assert.equal(aliasValue('@@ali_ns'), '@ali_ns');
  assert.equal(aliasValue('ali ns'), '@alins');
  assert.equal(aliasValue('  '), undefined);
});

test('C9-12 owner 15 Oct: sale commission % or flat RM; rental commission months (any number) or flat RM; neither is read as a percent', async () => {
  assert.equal(commissionRm({ purpose: 'sale', askingPrice: 800_000, commissionType: 'flat', commissionFlat: 15_000, commissionPct: 3 }), 15_000, 'flat wins, the % is ignored');
  assert.equal(commissionRm({ purpose: 'sale', askingPrice: 800_000, commissionType: 'pct', commissionPct: 2.5 }), 20_000);
  assert.equal(rentCommissionRm({ purpose: 'rent', monthlyRent: 2000, rentCommissionType: 'flat', rentCommissionFlat: 2500, rentCommissionMonths: 2 }), 2500);
  assert.equal(rentCommissionRm({ purpose: 'rent', monthlyRent: 2000, rentCommissionMonths: 0.75 }), 1500, 'a custom number of months');
  assert.deepEqual(dealStart(L({ purpose: 'sale', askingPrice: 800_000, commissionType: 'flat', commissionFlat: 15_000 })), { value: 800_000, commissionPct: undefined, commission: 15_000 });
  assert.deepEqual(dealStart(L({ purpose: 'rent', monthlyRent: 2000, rentCommissionType: 'flat', rentCommissionFlat: 2500 })), { value: 2000, commissionPct: undefined, commission: 2500 });
  const calc = { kind: 'commission', commission: { value: 15000, pct: 100, sst: true } } as never;
  assert.deepEqual(proposeUpdates(calc, { purpose: 'sale', commissionType: 'flat', askingPrice: 1 }), [], 'no % written onto a flat-fee sale');
});

test('C9-13 Title Case across the app: short labels only; sentences, fragments, codes, lists and functions are untouched', async () => {
  const { isLabel, titleTable } = await import('../src/lib/titleCase');
  const { strings } = await import('../src/i18n');
  assert.ok(isLabel('Save settings') && isLabel('Banner placed?'));
  for (const no of ['No contact was chosen.', 'beds', '/ month', 'en', 'ms-MY', 'Opening phone book…', 'https://maps.app.goo.gl/x', 'Enter:', 'One two three four five six seven'])
    assert.equal(isLabel(no), false, no);
  const t = titleTable({ a: 'Save settings', b: 'Every field is optional.', list: ['near me'], f: (n: number) => `${n} items`, nested: { x: 'Check for updates' } }, 'en');
  assert.deepEqual([t.a, t.b, t.list, t.f(2), t.nested.x], ['Save Settings', 'Every field is optional.', ['near me'], '2 items', 'Check for Updates']);
  assert.equal(strings.en.update.check, 'Check for Updates');
  assert.equal(strings.zh.update.check, '检查更新', 'Chinese unchanged');
});
