// Owner, 17 Oct 2026 (branch 2.0.26.10.17.1): rules behind the Subsale List card and form changes that can be checked
// without a browser — the title with the neighbourhood, Title Case after a "/", the card's spaced lines, the location
// links, who is offered in Share Location, no check status on prices, and the source-level form guarantees.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { addressCase, title, cardTitle, addressLine, applyFilters, type Listing } from '../src/listing/model';
import { mapsUrl, shareLocationLink, specLines } from '../src/listing/change015';
import { isVerifiable, toCheck, shownState } from '../src/listing/verify';
import { shareGroups } from '../src/listing/LocationMenu';
import { c1017Strings } from '../src/ui/c1017Strings';
import { c15Strings } from '../src/ui/c015Strings';
import type { Contact } from '../src/data/types';

const L = (x: Partial<Listing>): Listing => ({ id: 'p1', created: 1, updated: 1, photos: [], ...x } as Listing);
const C = (id: string, name: string, roles: Contact['roles'], phone?: string): Contact => ({ id, name, roles, phone, created: 1, updated: 1 } as Contact);

test('D17-1 the title is Street, Neighbourhood, Township, City, each once, everywhere a property is named', () => {
  const l = L({ unitNo: '12', street: 'Jalan BBN 1/3A', neighborhood: 'Taman Desa Melati', township: 'Bandar Baru Nilai', city: 'Nilai', state: 'Negeri Sembilan' });
  // "Nilai" is already in "Bandar Baru Nilai", so it is not repeated (Change 009 rule, unchanged).
  assert.equal(title(l), '12, Jalan BBN 1/3A, Taman Desa Melati, Bandar Baru Nilai');
  assert.equal(title({ ...l, township: 'Putra Nilai', city: 'Seremban' }), '12, Jalan BBN 1/3A, Taman Desa Melati, Putra Nilai, Seremban');
  assert.equal(cardTitle(l), title(l));
  assert.equal(addressLine(l), '12, Jalan BBN 1/3A, Taman Desa Melati, Bandar Baru Nilai, Negeri Sembilan');
  assert.equal(title(L({ street: 'Jalan 1', city: 'Nilai' })), 'Jalan 1, Nilai', 'no neighbourhood: nothing extra');
  assert.equal(title(L({ street: 'Jalan Melati 2', neighborhood: 'Melati' })), 'Jalan Melati 2', 'a part already in the street is not repeated');
  // The neighbourhood can be searched for in the list.
  assert.equal(applyFilters([l, L({ id: 'p2', street: 'Jalan 2' })], { location: 'desa melati' }).length, 1);
});

test('D17-2 Title Case on displayed addresses, including after a "/"; stored values unchanged; capitals typed on purpose kept', () => {
  assert.equal(addressCase('jalan bbn 1/3a'), 'Jalan Bbn 1/3A');
  assert.equal(addressCase('taman desa/bandar baru'), 'Taman Desa/Bandar Baru');
  assert.equal(addressCase('jalan pjs 7/2'), 'Jalan Pjs 7/2');
  assert.equal(addressCase('Jalan BBN 1/3A'), 'Jalan BBN 1/3A', 'BBN stays as typed');
  assert.equal(addressCase('lot 77, persiaran klia'), 'Lot 77, Persiaran Klia');
  assert.equal(addressCase('(kawasan) seri-indah'), '(Kawasan) Seri-indah', 'after a hyphen the word is left as typed');
  assert.equal(addressCase('jalan kedua-dua 3'), 'Jalan Kedua-dua 3');
  assert.equal(addressCase('芙蓉 花园'), '芙蓉 花园', 'Chinese is unchanged');
  const l = L({ street: 'jalan bbn 1/3a', neighborhood: 'taman melati' });
  assert.equal(title(l), 'Jalan Bbn 1/3A, Taman Melati');
  assert.equal(l.street, 'jalan bbn 1/3a', 'the record keeps what was typed');
});

test('D17-3 card lines: no parking line; card wording in Title Case in English and Bahasa Malaysia', () => {
  const en = c15Strings.en.card;
  const l = L({ type: 'Terrace house', floors: 2.5, lotType: 'corner', parking: 2, bedrooms: 3, landSqft: 1650, builtUpSqft: 2200 });
  const lines = specLines(l, { ...en, type: 'Terrace House', lotType: 'Corner' });
  assert.ok(!lines.some(x => x.parts.some(p => p.k === 'parking')), 'parking is not a card line');
  assert.equal(en.storeys(2.5), '2.5 Storeys');
  assert.equal(en.builtUp('900 sq ft'), 'Built-Up 900 sq ft', 'the unit stays lower case');
  assert.equal(c15Strings.bm.card.bedrooms(3), '3 Bilik Tidur');
  assert.equal(c15Strings.bm.card.toCheck(2), '* 2 Perlu Disemak');
  const src = readFileSync('src/listing/ListingUI.tsx', 'utf8');
  const card = src.slice(src.indexOf('function SubsaleCard'), src.indexOf('export const LOCATION_BUBBLE_MS'));
  assert.ok(!/t\.parking|data-spec="parking"/.test(card), 'no parking on the card');
  assert.ok(!/availabilityText/.test(card), 'no "Available Now" on the card');
  assert.ok(/IconPencil/.test(card) && !/IconGear/.test(card), 'the edit button is a pencil');
  assert.ok(card.indexOf('sc-txs') < card.indexOf('sc-body'), 'FOR SALE / FOR RENT are on the photo');
  assert.ok(card.indexOf("x.key === 'type'") < card.indexOf('<TenureLine') && card.indexOf('<TenureLine') < card.indexOf("x.key !== 'type'"),
    'tenure sits between the type line and the bedrooms line');
});

test('D17-4 location links: Google Maps at the saved point; WhatsApp message with the title and the link', () => {
  const p = { lat: 2.8123456, lng: 101.7654321 };
  assert.equal(mapsUrl(p), 'https://www.google.com/maps/search/?api=1&query=2.812346,101.765432');
  const wa = shareLocationLink('60123456789', 'Jalan 1, Nilai', p);
  assert.ok(wa.startsWith('https://wa.me/60123456789?text='));
  assert.equal(decodeURIComponent(wa.split('text=')[1]), `Jalan 1, Nilai\n${mapsUrl(p)}`);
  assert.equal(decodeURIComponent(shareLocationLink('601', '', p).split('text=')[1]), mapsUrl(p), 'no title: just the link');
});

test('D17-5 Share Location offers buyers and vendors (tenants, investors, landlords too), sorted, searchable by name or phone', () => {
  const list = [
    C('b2', 'Zara', ['buyer'], '012-111 2222'), C('b1', 'Amin', ['tenant'], '013-333 4444'), C('i1', 'Ivy', ['investor']),
    C('v1', 'Lim', ['vendor'], '014-555 6666'), C('v2', 'Kumar', ['landlord', 'buyer'], '015-777 8888'), C('x1', 'Dr Tan', ['professional'], '016-1'),
  ];
  const g = shareGroups(list, '');
  assert.deepEqual(g.buyers.map(c => c.id), ['b1', 'i1', 'v2', 'b2']);
  assert.deepEqual(g.vendors.map(c => c.id), ['v2', 'v1']);
  assert.ok(![...g.buyers, ...g.vendors].some(c => c.id === 'x1'), 'professionals are not offered');
  assert.deepEqual(shareGroups(list, 'lim').vendors.map(c => c.id), ['v1']);
  assert.deepEqual(shareGroups(list, '5556').vendors.map(c => c.id), ['v1'], 'search by phone digits');
  assert.deepEqual(shareGroups([{ ...list[0], archived: { at: 1 } } as never], ''), { buyers: [], vendors: [] }, 'archived contacts are left out');
});

test('D17-6 Asking Price and Monthly Rent have no check status; other facts keep theirs', () => {
  assert.ok(!isVerifiable('askingPrice') && !isVerifiable('monthlyRent'));
  assert.ok(isVerifiable('tenure') && isVerifiable('landSqft'));
  const l = L({ askingPrice: 500000, monthlyRent: 2000, tenure: 'freehold', verification: { askingPrice: 'confirmed' } });
  assert.equal(shownState(l, 'askingPrice'), undefined);
  assert.deepEqual(toCheck(l), ['tenure']);
  assert.deepEqual(l.verification, { askingPrice: 'confirmed' }, 'an old mark stays on the record');
});

test('D17-7 form and Add Location source guarantees: no Fill with Voice, no Google Maps link field, Hybrid only, search bar', () => {
  const form = readFileSync('src/listing/ListingForm.tsx', 'utf8');
  assert.ok(!/voice-fill-btn|voiceBig|fillFromWords/.test(form), 'no Fill with voice button');
  assert.ok(!/data-field="mapsLink"|setMapsLink|open-maps-link/.test(form), 'no Google Maps link field');
  const picker = readFileSync('src/maps/LocationPicker.tsx', 'utf8');
  assert.ok(/fixedType="hybrid"/.test(picker), 'Hybrid view only');
  assert.ok(/picker-search-input/.test(picker) && /searchPlaces/.test(picker) && /geocodeAddress/.test(picker), 'a search bar, with a plain address look-up as the fallback');
  const map = readFileSync('src/maps/MapView.tsx', 'utf8');
  assert.ok(/\{!fixedType && \(/.test(map), 'a fixed type hides the Map / Satellite / Hybrid buttons');
});

test('D17-8 new wording exists in all three languages; English and Malay labels in Title Case', () => {
  for (const lang of ['en', 'bm', 'zh'] as const) {
    const t = c1017Strings[lang];
    for (const [k, v] of Object.entries(t)) assert.ok(typeof v === 'function' || (typeof v === 'string' && v.length > 0), `${lang}.${k}`);
  }
  assert.equal(c1017Strings.en.notSet, 'Location Not Set');
  assert.equal(c1017Strings.en.share, 'Share Location');
  assert.equal(c1017Strings.en.openMaps, 'Open in Google Maps');
});
