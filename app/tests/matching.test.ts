// Buyer requirements and matching (domain/matching.ts). Unknown data is never counted as a fit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchRequirement, matchesForBuyer, matchesForProperty, isEmptyRequirement } from '../src/domain/matching';
import type { BuyerRequirement, Contact } from '../src/data/types';
import type { Listing } from '../src/listing/model';
import { findBuyers } from '../src/voice/buyerSearch';

const P = (id: string, extra: Partial<Listing> = {}): Listing => ({ id, created: 1, updated: 1, photos: [], ...extra });
const C = (id: string, name: string, requirements: BuyerRequirement[], extra: Partial<Contact> = {}): Contact => ({ id, created: 1, updated: 1, name, roles: ['buyer'], leadStatus: 'warm', requirements, ...extra });
const factory = P('f1', { type: 'Semi-D factory', township: 'Salak Tinggi', city: 'Sepang', purpose: 'sale', askingPrice: 3_200_000, landSqft: 20000, builtUpSqft: 12000, tenure: 'freehold', status: 'available' });

test('M1 every condition met from recorded facts is an exact match, with the reasons listed', () => {
  const r = matchRequirement({ id: 'r', purpose: 'sale', types: ['Semi-D factory', 'Detached factory'], areas: ['Salak Tinggi'], budgetMax: 3_500_000, landMinSqft: 15000, tenure: 'freehold' }, factory);
  assert.equal(r.level, 'exact');
  assert.deepEqual(r.criteria.map(c => c.verdict), ['fits', 'fits', 'fits', 'fits', 'fits', 'fits']);
  assert.deepEqual(r.criteria.map(c => c.key), ['purpose', 'type', 'area', 'budget', 'land', 'tenure']);
});

test('M2 a condition the record cannot answer makes it partial, never exact', () => {
  const bare = P('b1', { type: 'Semi-D factory', township: 'Salak Tinggi', status: 'available' });   // no price, no land
  const r = matchRequirement({ id: 'r', types: ['Semi-D factory'], areas: ['Salak Tinggi'], budgetMax: 3_500_000, landMinSqft: 15000 }, bare);
  assert.equal(r.level, 'partial');
  assert.deepEqual(r.criteria.filter(c => c.verdict === 'unknown').map(c => c.key), ['budget', 'land']);
});

test('M3 one failed condition with two or more met is "near"; two failures is no match', () => {
  const near = matchRequirement({ id: 'r', types: ['Semi-D factory'], areas: ['Salak Tinggi'], budgetMax: 3_000_000 }, factory);
  assert.equal(near.level, 'near');
  assert.deepEqual(near.criteria.filter(c => c.verdict === 'fails').map(c => c.key), ['budget']);
  assert.equal(matchRequirement({ id: 'r', types: ['Bungalow'], areas: ['Salak Tinggi'], budgetMax: 3_000_000 }, factory).level, 'none');
  assert.equal(matchRequirement({ id: 'r', budgetMax: 3_000_000 }, factory).level, 'none', 'a single failed condition with nothing met is no match');
});

test('M4 adjoining units can never be confirmed from one record, so such a requirement is at most partial', () => {
  const r = matchRequirement({ id: 'r', types: ['Semi-D factory'], adjoiningUnits: 2 }, factory);
  assert.equal(r.level, 'partial');
  assert.equal(r.criteria.find(c => c.key === 'adjoining')!.verdict, 'unknown');
});

test('M5 rent: budget is compared with the monthly rent; sale_or_rent properties fit either purpose', () => {
  const shop = P('s1', { type: 'Shoplot', purpose: 'sale_or_rent', askingPrice: 900_000, monthlyRent: 3_000, status: 'available' });
  assert.equal(matchRequirement({ id: 'r', purpose: 'rent', budgetMax: 3_500 }, shop).criteria.find(c => c.key === 'budget')!.verdict, 'fits');
  assert.equal(matchRequirement({ id: 'r', purpose: 'rent', budgetMax: 2_500 }, shop).criteria.find(c => c.key === 'budget')!.verdict, 'fails');
  assert.equal(matchRequirement({ id: 'r', purpose: 'sale', budgetMax: 1_000_000 }, shop).criteria.find(c => c.key === 'budget')!.verdict, 'fits');
});

test('M6 sold, rented and withdrawn properties are never offered; "needs check" adds an unknown', () => {
  const buyer = C('c1', 'Lim', [{ id: 'r', types: ['Semi-D factory'] }]);
  assert.equal(matchesForBuyer(buyer, [{ ...factory, status: 'sold' }, { ...factory, id: 'f2', status: 'off_market' }]).length, 0);
  const nc = matchesForBuyer(buyer, [{ ...factory, status: 'needs_check' }]);
  assert.equal(nc[0].level, 'partial');
  assert.equal(matchesForProperty({ ...factory, status: 'rented' }, [buyer]).length, 0);
});

test('M7 ranking: exact before partial before near, then the higher score; buyers are ordered by match, then heat', () => {
  const buyer = C('c1', 'Lim', [{ id: 'r', types: ['Semi-D factory'], areas: ['Salak Tinggi'], budgetMax: 3_500_000 }]);
  const exact = factory;
  const partial = P('p2', { type: 'Semi-D factory', township: 'Salak Tinggi', status: 'available' });
  const near = P('p3', { type: 'Semi-D factory', township: 'Salak Tinggi', askingPrice: 9_000_000, status: 'available' });
  assert.deepEqual(matchesForBuyer(buyer, [near, partial, exact]).map(m => [m.property.id, m.level]), [['f1', 'exact'], ['p2', 'partial'], ['p3', 'near']]);
  const cold = C('c2', 'Cold', [{ id: 'r', types: ['Semi-D factory'] }], { leadStatus: 'cold' });
  const hot = C('c3', 'Hot', [{ id: 'r', types: ['Semi-D factory'] }], { leadStatus: 'hot' });
  const dropped = C('c4', 'Dropped', [{ id: 'r', types: ['Semi-D factory'] }], { leadStatus: 'dropped' });
  const booked = C('c5', 'Booked', [{ id: 'r', types: ['Semi-D factory'] }], { leadStatus: 'booked' });
  const vendor = C('c6', 'Vendor', [{ id: 'r', types: ['Semi-D factory'] }], { roles: ['vendor'] });
  assert.deepEqual(matchesForProperty(factory, [cold, hot, dropped, booked, vendor]).map(m => m.contact.name), ['Hot', 'Cold']);
});

test('M8 a buyer with several requirements is matched on the best one; empty requirements match nothing; sample and real never mix', () => {
  const buyer = C('c1', 'Lim', [{ id: 'a', types: ['Bungalow'] }, { id: 'b', types: ['Semi-D factory'], areas: ['Salak Tinggi'] }, { id: 'e' }]);
  const m = matchesForBuyer(buyer, [factory]);
  assert.equal(m.length, 1); assert.equal(m[0].requirement.id, 'b');
  assert.equal(isEmptyRequirement({ id: 'e', label: 'just a name', notes: 'x', financing: 'cash' }), true);
  assert.equal(matchesForBuyer(C('c9', 'Empty', [{ id: 'e' }]), [factory]).length, 0);
  assert.equal(matchesForBuyer(C('s1', 'Sample buyer', [{ id: 'r', types: ['Semi-D factory'] }], { sample: true }), [factory]).length, 0);
});

test('M9 "find buyers looking for…" also uses the buyer\'s saved requirements, and still reads notes', () => {
  const withReq = C('c1', 'Structured', [{ id: 'r', types: ['Semi-D factory'], areas: ['Salak Tinggi'], budgetMax: 3_000_000 }]);
  const notesOnly: Contact = { id: 'c2', created: 1, updated: 1, name: 'Notes only', roles: ['buyer'], notes: 'wants a factory near Salak Tinggi' };
  const none: Contact = { id: 'c3', created: 1, updated: 1, name: 'Nothing', roles: ['buyer'] };
  const found = findBuyers({ type: 'factory', area: 'Salak Tinggi', maxPrice: 3_500_000 }, [withReq, notesOnly, none], [], [], []);
  assert.deepEqual(found.map(f => f.contact.name), ['Structured', 'Notes only']);
  assert.ok(found[0].reasons.some(r => r.startsWith('requirement:')));
});
