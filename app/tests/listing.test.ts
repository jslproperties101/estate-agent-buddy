// Property List: filters, years remaining, phone format, commission, titles, fields by type, missing details.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyFilters, activeCount, yearsRemaining, normalisePhone, commissionRm, title, Listing, fieldsFor, missingDetails, rmShort, landText, mainPhoto, phoneDigits, addressLine } from '../src/listing/model';
import { sampleData } from '../src/data/sample';

const L = sampleData(Date.UTC(2026, 9, 12)).properties;
const ids = (xs: Listing[]) => xs.map(x => x.id).sort();

test('P1 each filter on its own', () => {
  assert.deepEqual(ids(applyFilters(L, { type: 'Semi-D factory' })), ['s1', 's2']);
  assert.deepEqual(ids(applyFilters(L, { typeWord: 'factory' })), ['s1', 's10', 's2', 's3']);
  assert.deepEqual(ids(applyFilters(L, { status: 'available' })), ['s1', 's10', 's4', 's7', 's8', 's9']);
  assert.deepEqual(ids(applyFilters(L, { priceMax: 1000000 })), ['s4', 's5']);
  assert.deepEqual(ids(applyFilters(L, { bedsMin: 4 })), ['s4', 's5']);
  assert.deepEqual(ids(applyFilters(L, { tenure: 'leasehold' })), ['s10', 's3', 's5', 's6', 's8']);
  assert.deepEqual(ids(applyFilters(L, { location: 'sepang' })), ['s6']);
  assert.deepEqual(ids(applyFilters(L, { location: 'Salak Tinggi' })), ['s10', 's5']);
  assert.deepEqual(ids(applyFilters(L, { location: 'P1007' })), ['s7'], 'reference search');
  assert.deepEqual(ids(applyFilters(L, { location: 'Putra Nilai' })), ['s8'], 'township search');
});

test('P2 sale or rent, category, rent price range; filters combine', () => {
  assert.deepEqual(ids(applyFilters(L, { purpose: 'rent' })), ['s10', 's6', 's8']);
  assert.deepEqual(ids(applyFilters(L, { category: 'industrial' })), ['s1', 's10', 's2', 's3']);
  assert.deepEqual(ids(applyFilters(L, { purpose: 'rent', priceMax: 7000 })), ['s6', 's8']);
  assert.deepEqual(ids(applyFilters(L, { location: 'Nilai', tenure: 'freehold', priceMax: 1000000 })), ['s4']);
  assert.equal(activeCount({ type: 'Shoplot', priceMin: 1 }), 2);
});

test('P3 years remaining, phone numbers, commission', () => {
  assert.equal(yearsRemaining({ tenure: 'leasehold', leaseExpiryYear: 2077 }, 2026), 51);
  assert.equal(yearsRemaining({ tenure: 'freehold', leaseExpiryYear: 2077 }, 2026), undefined);
  assert.equal(normalisePhone('012-345 6789'), '+60 12-345 6789');
  assert.equal(normalisePhone('03-8888 1234'), '+60 3-8888 1234');
  assert.equal(phoneDigits('012-345 6789'), '60123456789');
  assert.equal(phoneDigits('+60 12-345 6789'), '60123456789');
  assert.equal(commissionRm({ ...L[0], askingPrice: 650000, commissionPct: 2.5 }), 16250);
});

test('P4 titles and address in the agreed location order', () => {
  assert.equal(title(L[0]), 'Unit 7, Jalan Perindustrian 2/3, Kawasan Perindustrian Nilai');
  assert.equal(addressLine(L[0]), 'Unit 7, Lot 2/14, Jalan Perindustrian 2/3, Kawasan Perindustrian Nilai, Nilai, Negeri Sembilan, Malaysia');
  assert.equal(title({ id: 'e', created: 0, updated: 0, photos: [] }), '');
});

test('P5 fields follow the property type; custom types show every field', () => {
  const agri = fieldsFor('Agricultural land');
  assert.equal(agri.has('bedrooms'), false); assert.equal(agri.has('currentUse'), true);
  const fac = fieldsFor('Semi-D factory');
  assert.ok(fac.has('ceilingFt') && fac.has('powerKva') && !fac.has('bedrooms'));
  assert.ok(!fieldsFor('Condo / apartment').has('landSqft'));
  assert.equal(fieldsFor('Petrol station').size, fieldsFor(undefined).size);
});

test('P6 missing details include the map position; every card has a picture', () => {
  assert.deepEqual(missingDetails(L[0]), ['lat'], 'samples have no invented position');
  assert.deepEqual(missingDetails({ id: 'n', created: 0, updated: 0, photos: [], type: 'Terrace house', lat: 2.8, lng: 101.8 }).sort(),
    ['askingPrice', 'bedrooms', 'builtUpSqft', 'landSqft', 'street', 'tenure', 'township', 'vendorId'].sort());
  assert.equal(rmShort(3200000), 'RM 3.2m');
  assert.equal(landText(217800), '5.00 acres (217,800 sq ft)');
  assert.equal(mainPhoto(L[0])?.sample, true);
  assert.equal(mainPhoto({ id: 'x', created: 0, updated: 0, photos: [] })?.sample, true, 'no type: generic picture, same card layout');
});

test('P7 sample data never carries invented map positions', () => {
  assert.equal(L.some(l => l.lat !== undefined || l.lng !== undefined), false);
  assert.ok(L.every(l => l.sample && /^P\d{4}$/.test(l.ref!)));
});
