// Change 015 (owner, 16 Oct 2026): rules that can be checked without a browser — transaction labels, the card's
// specification order, the "to check" / "not filled" counts (no double counting), the photo menu actions, the location
// labels and order in every language, and the source-level guarantees (no place search in Add Location, no
// "Use my current location", black navigation area in the Android setup).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transactionLabels, specLines, checkAndMissing, cardCounts, makeMainPhoto, removePhoto, LOCATION_ORDER } from '../src/listing/change015';
import { missingDetails, type Listing, type Photo } from '../src/listing/model';
import { toCheck, withVerification } from '../src/listing/verify';
import { listingStrings, typeLabel } from '../src/listing/strings';
import { mapStrings } from '../src/maps/strings';
import { c15Strings } from '../src/ui/c015Strings';

const L = (x: Partial<Listing>): Listing => ({ id: 'p1', created: 1, updated: 1, photos: [], ...x } as Listing);
const en = c15Strings.en.card;
const words = (l: Listing) => ({ ...en, type: typeLabel(listingStrings.en, l.type) || undefined, lotType: l.lotType ? listingStrings.en.lotType[l.lotType] : undefined });
const text = (l: Listing) => specLines(l, words(l)).map(x => x.parts.map(p => p.text.replace(/\u00a0/g, ' ')).join(', '));

test('C15-1 transaction labels follow the property’s own purpose: sale, rent, both stacked FOR SALE then FOR RENT, none when not set', () => {
  assert.deepEqual(transactionLabels(L({ purpose: 'sale' })), ['sale']);
  assert.deepEqual(transactionLabels(L({ purpose: 'rent' })), ['rent']);
  assert.deepEqual(transactionLabels(L({ purpose: 'sale_or_rent' })), ['sale', 'rent']);
  assert.deepEqual(transactionLabels(L({})), []);
  for (const lang of ['en', 'bm', 'zh'] as const) {
    assert.ok(c15Strings[lang].card.forSale && c15Strings[lang].card.forRent && c15Strings[lang].card.clickToOpen);
  }
  assert.equal(en.forSale, 'FOR SALE');
  assert.equal(en.forRent, 'FOR RENT');
  assert.equal(en.clickToOpen, 'Click to open');
});

test('C15-2 specification order: type, storeys, corner; then bedrooms and bathrooms; then land; then built-up', () => {
  const l = L({ type: 'Terrace house', floors: 2.5, lotType: 'corner', bedrooms: 4, bathrooms: 3, landSqft: 1650, builtUpSqft: 2200 });
  const lines = specLines(l, words(l));
  assert.deepEqual(lines.map(x => x.key), ['type', 'rooms', 'land', 'builtUp']);
  const t = text(l);
  assert.match(t[0], /^Terrace.*, 2\.5 storeys, Corner$/);
  assert.equal(t[1], '4 bedrooms, 3 bathrooms');
  assert.equal(t[2], 'Land 1,650 sq ft');
  assert.equal(t[3], 'Built-up 2,200 sq ft');
  // Each part keeps its field key, so the Change 009 check colour stays on the value.
  assert.deepEqual(lines[0].parts.map(p => p.k), ['type', 'floors', 'lotType']);
});

test('C15-3 only real values are shown; empty lines are left out; acres from one acre up', () => {
  assert.deepEqual(text(L({})), []);
  assert.deepEqual(text(L({ bathrooms: 1 })), ['1 bathroom']);
  assert.deepEqual(text(L({ floors: 1, landSqft: 87120 })), ['1 storey', 'Land 2.0 acres']);
  const noType = specLines(L({ lotType: 'end' }), { ...en, lotType: 'End lot' });
  assert.deepEqual(noType.map(x => x.parts.map(p => p.text)), [['End lot']]);
});

test('C15-4 counts use the established rules and never count one field twice', () => {
  // A complete-ish record: filled values with no mark are "Need to check" (Change 009).
  const l = L({ type: 'Terrace house', purpose: 'sale', street: 'Jalan 1', township: 'Taman A', tenure: 'freehold', askingPrice: 500000,
    landSqft: 1650, builtUpSqft: 2200, bedrooms: 4, ownerName: 'Lim', lat: 2.8, lng: 101.8 });
  const { check, missing } = checkAndMissing(l);
  assert.deepEqual(missing, missingDetails(l).map(String));
  assert.deepEqual(check, toCheck(l));
  assert.deepEqual(cardCounts(l), { toCheck: check.length, notFilled: missing.length });
  assert.ok(check.includes('askingPrice') && check.includes('tenure'));
  // Confirming a field takes it off "to check".
  const confirmed = withVerification(l, 'askingPrice', 'confirmed');
  assert.equal(cardCounts(confirmed).toCheck, cardCounts(l).toCheck - 1);
  // An empty field marked Unknown is counted once, as "not filled", not also as "to check".
  const empty = withVerification(L({ type: 'Terrace house', purpose: 'sale' }), 'landSqft', 'unknown');
  const r = checkAndMissing(empty);
  assert.ok(r.missing.includes('landSqft'));
  assert.ok(!r.check.includes('landSqft'));
  assert.ok(toCheck(empty).includes('landSqft'), 'the Change 009 rule itself is unchanged');
  // The owner: missing owner covers an Unknown mark on the owner name.
  const owner = withVerification(L({}), 'ownerName', 'unknown');
  const o = checkAndMissing(owner);
  assert.ok(o.missing.includes('vendorId') && !o.check.includes('ownerName'));
  const set = new Set([...o.check, ...o.missing]);
  assert.equal(set.size, o.check.length + o.missing.length, 'no field is in both lists');
});

test('C15-5 counts on a record with nothing in it, odd marks or zero values do not crash or miscount', () => {
  const blank = L({});
  assert.equal(cardCounts(blank).toCheck, 0);
  assert.ok(cardCounts(blank).notFilled > 0);
  const odd = L({ verification: { askingPrice: 'nonsense', landSqft: 'confirmed' } as Record<string, string>, bedrooms: 0, landSqft: 0 } as Partial<Listing>);
  const c = checkAndMissing(odd);
  assert.ok(c.check.includes('bedrooms'), 'zero is a real value: it is to check, not missing');
  assert.ok(!c.check.includes('landSqft'), 'confirmed stays confirmed');
  assert.ok(!c.missing.includes('bedrooms') && !c.missing.includes('landSqft'));
  assert.equal(en.toCheck(11), '* 11 to check');
  assert.equal(en.notFilled(3), '* 3 not filled');
});

const P = (id: string): Photo => ({ id, name: id, fileId: `f-${id}` });

test('C15-6 Make as Main Photo moves the photo to position 1 and makes it the only main photo; others keep their order', () => {
  const ps = [P('a'), P('b'), P('c'), P('d')];
  const r = makeMainPhoto(ps, 'c');
  assert.deepEqual(r.photos.map(p => p.id), ['c', 'a', 'b', 'd']);
  assert.equal(r.mainPhotoId, 'c');
  assert.deepEqual(makeMainPhoto(ps, 'a').photos.map(p => p.id), ['a', 'b', 'c', 'd']);
  assert.deepEqual(makeMainPhoto(ps, 'zz').photos, ps, 'an unknown photo changes nothing');
  assert.deepEqual(ps.map(p => p.id), ['a', 'b', 'c', 'd'], 'the input list is not changed');
});

test('C15-7 Remove takes out only that photo; removing the main photo makes the first remaining one main; none left = no main', () => {
  const ps = [P('a'), P('b'), P('c')];
  const r1 = removePhoto(ps, 'b');
  assert.deepEqual(r1.photos.map(p => p.id), ['a', 'c']);
  assert.equal(r1.mainPhotoId, 'a');
  assert.equal(r1.removed?.fileId, 'f-b', 'the removed file is reported, to be removed on save as before');
  const r2 = removePhoto(ps, 'a');
  assert.deepEqual(r2.photos.map(p => p.id), ['b', 'c']);
  assert.equal(r2.mainPhotoId, 'b');
  const r3 = removePhoto([P('x')], 'x');
  assert.deepEqual(r3.photos, []);
  assert.equal(r3.mainPhotoId, undefined);
  assert.deepEqual(removePhoto(ps, 'zz').photos, ps);
});

test('C15-8 location labels and order in every language: City, Township, Neighborhood, Street; no "City / town" or "Jalan /"', () => {
  assert.deepEqual([...LOCATION_ORDER], ['country', 'state', 'city', 'township', 'neighborhood', 'street', 'unitNo']);
  const e = listingStrings.en.l;
  assert.equal(e.city, 'City');
  assert.equal(e.township, 'Township');
  assert.equal(e.neighborhood, 'Neighborhood');
  assert.equal(e.street, 'Street');
  assert.equal(e.unitNo, 'Unit/Lot Number', 'unit / lot number unchanged');
  for (const lang of ['en', 'bm', 'zh'] as const) {
    const l = listingStrings[lang].l;
    for (const k of LOCATION_ORDER) assert.ok(l[k], `${lang} has a label for ${k}`);
    assert.ok(!/\//.test(l.city) && !/\//.test(l.street), `${lang}: City and Street are single words`);
    assert.ok(!/\//.test(mapStrings[lang].field.city) && !/\//.test(mapStrings[lang].field.street));
  }
  // The form and the property page list the fields in this order.
  const form = readFileSync('src/listing/ListingForm.tsx', 'utf8');
  const sec = form.slice(form.indexOf('<Sec id="location"'), form.indexOf('{/* 4. Photos */}'));
  const order = ['country', 'state', 'city', 'township', 'neighborhood', 'street', 'unitNo'].map(k => sec.indexOf(`k: '${k}'`));
  assert.ok(order.every(i => i > 0), 'every location field is on the form');
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'form order');
  const view = readFileSync('src/listing/ListingUI.tsx', 'utf8');
  const vsec = view.slice(view.indexOf('testId="sec-location-view"'));
  const vorder = ['country', 'state', 'city', 'township', 'neighborhood', 'street', 'unitNo'].map(k => vsec.indexOf(`row('${k}'`));
  assert.ok(vorder.every(i => i > 0));
  assert.deepEqual([...vorder].sort((a, b) => a - b), vorder, 'property page order');
});

test('C15-9 source guarantees: no place search or GPS button in Add Location, no Use my current location on the form', () => {
  const picker = readFileSync('src/maps/LocationPicker.tsx', 'utf8');
  assert.ok(!/searchPlaces|search-box|searchPh/.test(picker), 'no place / address search in the popup');
  assert.ok(!/getCurrentPosition|picker-gps|myLocation/.test(picker), 'no "Use my current location" in the popup');
  assert.ok(!/useImmersive/.test(picker), 'the bottom advert stays visible: the popup ends above it');
  assert.ok(/picker-close/.test(picker) && /compactTypes/.test(picker));
  const form = readFileSync('src/listing/ListingForm.tsx', 'utf8');
  assert.ok(!/useMyLocation|getCurrentPosition/.test(form), 'no "Use my current location" on the form');
  assert.ok(/clearPosition/.test(form), 'Remove Position stays');
  assert.ok(!/pg-moves|moveEarlier|moveLater/.test(form), 'no left / right arrows on photos');
  const pdf = readFileSync('src/ui/PdfPreview.tsx', 'utf8');
  assert.ok(/useImmersive\(true\)/.test(pdf), 'the full-screen PDF preview still hides the advert (Change 011)');
});

test('C15-10 Android setup: black navigation area and content kept above the system bars', () => {
  const s = readFileSync('scripts/android-setup.mjs', 'utf8');
  assert.match(s, /android:navigationBarColor">@android:color\/black/);
  assert.match(s, /setNavigationBarColor\(Color\.BLACK\)/);
  assert.match(s, /WindowInsetsCompat\.Type\.systemBars\(\)/);
  assert.match(s, /setNavigationBarContrastEnforced\(false\)/);
  const css = readFileSync('src/styles.css', 'utf8');
  assert.match(css, /\.content \{ position: relative; flex: 1 1 auto; min-height: 0; overflow-y: auto;/, 'one scrolling region');
  assert.match(css, /\.ad-bar \{ position: relative; flex: none;/, 'the advert is the last row, not over the content');
});
