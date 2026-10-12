// Property Listing (Version 1K): filters, years remaining, phone format, commission, filling from words.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SAMPLE_LISTINGS as L, applyFilters, activeCount, yearsRemaining, normalisePhone, commissionRm, fillEmptyFrom, title, Listing, fieldsFor, nextRef, missingDetails, rmShort, landText, mainPhoto } from '../src/listing/model';

const ids = (xs: Listing[]) => xs.map(x => x.id).sort();

test('P1 each filter on its own (10 invented samples)', () => {
  assert.deepEqual(ids(applyFilters(L, { type: 'Semi-D factory' })), ['s1', 's2']);
  assert.deepEqual(ids(applyFilters(L, { typeWord: 'factory' })), ['s1', 's10', 's2', 's3']);
  assert.deepEqual(ids(applyFilters(L, { status: 'available' })), ['s1', 's10', 's4', 's7', 's8', 's9']);
  assert.deepEqual(ids(applyFilters(L, { priceMax: 1000000 })), ['s4', 's5']);
  assert.deepEqual(ids(applyFilters(L, { priceMin: 3000000 })), ['s1', 's2', 's3', 's9']);
  assert.deepEqual(ids(applyFilters(L, { bedsMin: 4 })), ['s4', 's5']);
  assert.deepEqual(ids(applyFilters(L, { bathsMin: 4 })), ['s5']);
  assert.deepEqual(ids(applyFilters(L, { tenure: 'leasehold' })), ['s10', 's3', 's5', 's6', 's8']);
  assert.deepEqual(ids(applyFilters(L, { lotType: 'corner' })), ['s1', 's6']);
  assert.deepEqual(ids(applyFilters(L, { location: 'sepang' })), ['s6']);
  assert.deepEqual(ids(applyFilters(L, { location: 'Salak Tinggi' })), ['s10', 's5']);
  assert.deepEqual(ids(applyFilters(L, { location: 'P-1007' })), ['s7'], 'reference search');
});

test('P1b sale or rent, category, and rent price range', () => {
  assert.deepEqual(ids(applyFilters(L, { purpose: 'rent' })), ['s10', 's6', 's8']);
  assert.equal(applyFilters(L, { purpose: 'sale' }).some(l => l.purpose === 'rent'), false);
  assert.deepEqual(ids(applyFilters(L, { category: 'industrial' })), ['s1', 's10', 's2', 's3']);
  assert.deepEqual(ids(applyFilters(L, { category: 'development' })), ['s9']);
  assert.deepEqual(ids(applyFilters(L, { purpose: 'rent', priceMax: 7000 })), ['s6', 's8'], 'rent filter uses monthly rent');
});

test('P2 filters combine, and listings without a value are not shown as matches', () => {
  assert.deepEqual(ids(applyFilters(L, { location: 'Nilai', tenure: 'freehold', priceMax: 1000000 })), ['s4']);
  assert.equal(applyFilters(L, { bedsMin: 1 }).some(l => l.bedrooms === undefined), false);
  assert.equal(activeCount({ type: 'Shoplot', priceMin: 1 }), 2);
  assert.equal(applyFilters(L, {}).length, L.length);
});

test('P3 years remaining on leasehold only', () => {
  assert.equal(yearsRemaining({ tenure: 'leasehold', leaseExpiryYear: 2077 }, 2026), 51);
  assert.equal(yearsRemaining({ tenure: 'freehold', leaseExpiryYear: 2077 }, 2026), undefined);
  assert.equal(yearsRemaining({ tenure: 'leasehold' }, 2026), undefined);
  assert.equal(yearsRemaining({ tenure: 'leasehold', leaseExpiryYear: 2000 }, 2026), 0);
});

test('P4 phone numbers and commission', () => {
  assert.equal(normalisePhone('012-345 6789'), '+60 12-345 6789');
  assert.equal(normalisePhone('+60123456789'), '+60 12-345 6789');
  assert.equal(normalisePhone('011-2345 6789'), '+60 11-2345 6789');
  assert.equal(normalisePhone('03-8888 1234'), '+60 3-8888 1234');
  assert.equal(normalisePhone(''), undefined);
  assert.equal(commissionRm({ ...L[0], askingPrice: 650000, commissionPct: 2.5 }), 16250);
  assert.equal(commissionRm({ ...L[0], commissionPct: undefined }), undefined);
});

test('P5 filling from words never overwrites and marks what it filled', () => {
  const base: Listing = { id: 'x', created: 0, updated: 0, photos: [], type: 'Bungalow', askingPrice: 700000 };
  const { listing, filled } = fillEmptyFrom(base, { type: 'Terrace house', price: 'RM 580,000', bedrooms: '4', location: 'Nilai', tenure: 'Leasehold (99 years)', remarks: 'Owner wants to sell urgently' });
  assert.equal(listing.type, 'Bungalow');
  assert.equal(listing.askingPrice, 700000);
  assert.equal(listing.bedrooms, 4);
  assert.equal(listing.area, 'Nilai');
  assert.equal(listing.tenure, 'leasehold');
  assert.equal(listing.notes, 'Owner wants to sell urgently');
  assert.deepEqual(filled.sort(), ['area', 'bedrooms', 'notes', 'tenure'].sort());
  assert.equal(listing.filledFrom!.bedrooms, 'words');
  // a general word like "Factory" does not choose a type for the person
  assert.equal(fillEmptyFrom({ ...base, type: undefined }, { type: 'Factory' }).listing.type, undefined);
});

test('P6 titles from unit, lot and address; every field optional', () => {
  assert.equal(title(L[0]), 'Unit 7, Jalan Perindustrian 2/3');
  assert.equal(title(L[2]), 'Lot 21, Kawasan Perindustrian Nilai');
  assert.equal(title({ id: 'e', created: 0, updated: 0, photos: [] }), '');
});

test('P7 fields follow the property type: no house fields on land, no land size for condos', () => {
  const agri = fieldsFor('Agricultural land');
  assert.equal(agri.has('bedrooms'), false); assert.equal(agri.has('builtUpSqft'), false); assert.equal(agri.has('currentUse'), true);
  const fac = fieldsFor('Semi-D factory');
  assert.ok(fac.has('ceilingFt') && fac.has('powerKva') && fac.has('loadingBays') && !fac.has('bedrooms'));
  const condo = fieldsFor('Condo / apartment');
  assert.ok(condo.has('bedrooms') && condo.has('maintenanceFee') && !condo.has('landSqft'));
  const dev = fieldsFor('Development land');
  assert.ok(dev.has('zoning') && dev.has('approvals') && !dev.has('parking'));
  assert.equal(fieldsFor(undefined).size, fieldsFor('Other').size, 'no type yet: nothing hidden');
});

test('P8 references, missing details, short money, acres, sample pictures', () => {
  assert.equal(nextRef(L), 'P-1011');
  assert.equal(nextRef([]), 'P-1001');
  assert.deepEqual(missingDetails(L[0]), []);
  assert.deepEqual(missingDetails({ id: 'n', created: 0, updated: 0, photos: [], type: 'Terrace house' }).sort(), ['address', 'askingPrice', 'bedrooms', 'builtUpSqft', 'landSqft', 'tenure', 'vendorId'].sort());
  assert.equal(rmShort(3200000), 'RM 3.2m');
  assert.equal(rmShort(580000), 'RM 580k');
  assert.equal(rmShort(1800), 'RM 1,800');
  assert.equal(landText(217800), '5.00 acres (217,800 sq ft)');
  assert.equal(landText(8000), '8,000 sq ft');
  assert.equal(mainPhoto(L[0])?.sample, true, 'sample picture when no photo');
  assert.equal(mainPhoto({ id: 'x', created: 0, updated: 0, photos: [] }), undefined, 'no type, no picture');
});
