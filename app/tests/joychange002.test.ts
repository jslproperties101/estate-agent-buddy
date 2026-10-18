// JoyChange002 Batch C rules that can be checked without a browser: Change 35 (three check statuses), Change 40 (the five
// Booked stages) and Change 41 (tick-box filters, Sold / Rented / Withdrawn hidden by default).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VERIFY_STATES, shownState, toCheck, verifyStateOf, withVerification } from '../src/listing/verify';
import { applyFilters, statusKey, STATUS_KEYS, DEFAULT_STATUSES, HIDDEN_BY_DEFAULT, BOOKED_STAGES, type Listing } from '../src/listing/model';
import { AVAIL_CHOICES, availChoice, availPatch, isBookedChoice } from '../src/listing/cc001';
import { listingStrings, statusText, statusKeyText } from '../src/listing/strings';
import { cc001Strings } from '../src/ui/cc001Strings';

const L = (x: Partial<Listing>): Listing => ({ id: x.id ?? 'p', created: 1, updated: 1, photos: [], ...x } as Listing);

test('J35-1 three check statuses; an old Unknown reads and saves as Need to check', () => {
  assert.deepEqual([...VERIFY_STATES], ['confirmed', 'owner', 'check']);
  const old = L({ tenure: 'freehold', landSqft: 1000, verification: { tenure: 'unknown', landSqft: 'owner' } });
  assert.equal(verifyStateOf(old, 'tenure'), 'check');
  assert.equal(shownState(old, 'tenure'), 'check');
  assert.deepEqual(toCheck(old), ['tenure']);
  const saved = withVerification(old, 'landSqft', 'confirmed');
  assert.deepEqual(saved.verification, { tenure: 'check', landSqft: 'confirmed' }, 'the old Unknown is rewritten as Need to check');
  assert.equal(shownState(L({ bedrooms: 3 }), 'bedrooms'), 'check', 'a value with no mark shows as Need to check');
});

test('J40-1 five Booked stages, then Sold; each round-trips and asks for booking details; old plain Booked still shows', () => {
  assert.deepEqual(BOOKED_STAGES, ['pending_loan', 'pending_spa', 'spa_signed', 'other_agent', 'pending_consent']);
  const i = AVAIL_CHOICES.indexOf('sold');
  assert.deepEqual(AVAIL_CHOICES.slice(i - 5, i), ['booked_pending_loan', 'booked_pending_spa', 'booked_spa_signed', 'booked_other_agent', 'booked_pending_consent']);
  assert.ok(!(AVAIL_CHOICES as readonly string[]).includes('booked'), 'plain Booked is no longer offered');
  for (const ch of AVAIL_CHOICES) assert.equal(availChoice(availPatch(ch)), ch);
  assert.deepEqual(availPatch('booked_spa_signed'), { status: 'in_progress', availability: 'not_available', availableFrom: undefined, bookedStage: 'spa_signed' });
  assert.equal(availPatch('sold').bookedStage, undefined, 'leaving Booked clears the stage');
  assert.equal(availChoice({ status: 'in_progress' }), 'booked', 'an old plain Booked keeps showing');
  assert.ok(isBookedChoice('booked_pending_loan') && isBookedChoice('booked') && !isBookedChoice('sold'));
  const s = listingStrings.en;
  assert.equal(statusText(s, { status: 'in_progress', bookedStage: 'other_agent' }), 'Booked - Other Agent (Pending SPA)');
  assert.equal(statusText(s, { status: 'in_progress' }), 'Booked');
  assert.equal(statusText(s, { status: 'sold', bookedStage: 'pending_loan' }), 'Sold', 'a stage only counts while Booked');
  for (const lang of ['en', 'bm', 'zh'] as const) for (const b of BOOKED_STAGES) {
    assert.ok(listingStrings[lang].bookedStage[b], `${lang} ${b}`);
    assert.equal(cc001Strings[lang].avail[`booked_${b}`], listingStrings[lang].bookedStage[b], `${lang} ${b}: the same words in the form and on cards`);
  }
});

test('J41-1 status keys list each Booked stage and old Booked separately; Sold, Rented and Withdrawn are hidden by default', () => {
  assert.deepEqual(STATUS_KEYS, ['available', 'booked_pending_loan', 'booked_pending_spa', 'booked_spa_signed', 'booked_other_agent', 'booked_pending_consent', 'booked', 'sold', 'rented', 'off_market', 'needs_check']);
  assert.deepEqual(HIDDEN_BY_DEFAULT, ['sold', 'rented', 'off_market']);
  assert.ok(!DEFAULT_STATUSES.some(k => HIDDEN_BY_DEFAULT.includes(k)));
  assert.equal(statusKey({ status: 'in_progress', bookedStage: 'pending_spa' }), 'booked_pending_spa');
  assert.equal(statusKey({ status: 'in_progress' }), 'booked');
  for (const k of STATUS_KEYS) assert.ok(statusKeyText(listingStrings.en, k) && statusKeyText(listingStrings.en, k) !== k, k);
});

test('J41-2 tick boxes: several choices per field; no ticks means any; 5+ bedrooms', () => {
  const list = [
    L({ id: 'a', status: 'available', type: 'Terrace house', bedrooms: 3, tenure: 'freehold', purpose: 'sale', askingPrice: 1 }),
    L({ id: 'b', status: 'in_progress', bookedStage: 'pending_loan', type: 'Condo / apartment', bedrooms: 2, tenure: 'leasehold', purpose: 'rent', monthlyRent: 1 }),
    L({ id: 'c', status: 'sold', type: 'Terrace house', bedrooms: 6, tenure: 'freehold', purpose: 'sale', askingPrice: 1 }),
    L({ id: 'd', status: 'in_progress', type: 'Shop office', bedrooms: 5 }),
  ];
  const ids = (f: Parameters<typeof applyFilters>[1]) => applyFilters(list, f).map(l => l.id);
  assert.deepEqual(ids({}), ['a', 'b', 'c', 'd']);
  assert.deepEqual(ids({ statuses: ['booked_pending_loan', 'sold'] }), ['b', 'c']);
  assert.deepEqual(ids({ statuses: ['booked'] }), ['d'], 'old plain Booked has its own tick');
  assert.deepEqual(ids({ types: ['Terrace house', 'Shop office'] }), ['a', 'c', 'd']);
  assert.deepEqual(ids({ beds: [2, 5] }), ['b', 'c', 'd'], '5 means five or more');
  assert.deepEqual(ids({ tenures: [] }), ['a', 'b', 'c', 'd'], 'no ticks: any');
  assert.deepEqual(ids({ purposes: ['rent'] }), ['b']);
  assert.deepEqual(ids({ statuses: DEFAULT_STATUSES }), ['a', 'b', 'd'], 'the default ticks leave Sold out');
});

// ---------- Change 36 ----------
import { chainOf, countBelow, entriesBelow, propertiesUsing, optionsAfterDelete, optionsAfterRename, renamedIn, clearedIn } from '../src/listing/optionEdit';
const O = (...vs: string[]) => vs.map((value, i) => ({ value, added: i, used: i }));
const OPTS = {
  'state@Malaysia': O('Negeri Sembilan', 'Selangor'),
  'city@Malaysia/Negeri Sembilan': O('Nilai', 'Seremban'),
  'township@Malaysia/Negeri Sembilan/Nilai': O('Kota Seriemas', 'Taman Desa'),
  'street@Malaysia/Negeri Sembilan/Nilai/Kota Seriemas': O('Jalan Seriemas 1'),
  'city@Malaysia/Selangor': O('Sepang'),
  type: O('Warehouse hub'),
};

test('J36-1 the address chain: what is saved under an entry, and which properties use it', () => {
  assert.deepEqual(chainOf('township@Malaysia/Negeri Sembilan/Nilai'), { level: 'township', parents: ['Malaysia', 'Negeri Sembilan', 'Nilai'] });
  assert.equal(chainOf('type'), undefined, 'other lists are not part of the chain');
  assert.equal(countBelow(OPTS, 'state@Malaysia', 'Negeri Sembilan'), 5, '2 cities + 2 townships + 1 street');
  assert.equal(countBelow(OPTS, 'city@Malaysia/Negeri Sembilan', 'Seremban'), 0);
  assert.deepEqual(entriesBelow(OPTS, 'type', 'Warehouse hub'), []);
  const props = [
    L({ id: 'a', country: 'Malaysia', state: 'Negeri Sembilan', city: 'Nilai', township: 'Kota Seriemas' }),
    L({ id: 'b', country: 'Malaysia', state: 'Negeri Sembilan', city: 'Seremban' }),
    L({ id: 'c', country: 'Malaysia', state: 'Selangor', city: 'Nilai' }),
  ];
  assert.deepEqual(propertiesUsing(props, 'city@Malaysia/Negeri Sembilan', 'Nilai').map(p => p.id), ['a'], 'the same name under another state is a different entry');
  assert.deepEqual(propertiesUsing(props, 'state@Malaysia', 'Negeri Sembilan').map(p => p.id), ['a', 'b']);
});

test('J36-2 delete removes the entry and everything under it, and clears that part of the address; rename keeps everything attached', () => {
  const del = optionsAfterDelete(OPTS, 'city@Malaysia/Negeri Sembilan', 'Nilai');
  assert.deepEqual(del['city@Malaysia/Negeri Sembilan'].map(o => o.value), ['Seremban']);
  assert.deepEqual(del['township@Malaysia/Negeri Sembilan/Nilai'], []);
  assert.deepEqual(del['street@Malaysia/Negeri Sembilan/Nilai/Kota Seriemas'], []);
  assert.deepEqual(del['city@Malaysia/Selangor'].map(o => o.value), ['Sepang'], 'other states untouched');
  const p = L({ id: 'a', country: 'Malaysia', state: 'Negeri Sembilan', city: 'Nilai', township: 'Kota Seriemas', street: 'Jalan Seriemas 1', askingPrice: 5 });
  const cleared = clearedIn(p, 'city@Malaysia/Negeri Sembilan');
  assert.deepEqual([cleared.state, cleared.city, cleared.township, cleared.street, cleared.askingPrice], ['Negeri Sembilan', undefined, undefined, undefined, 5]);
  const ren = optionsAfterRename(OPTS, 'city@Malaysia/Negeri Sembilan', 'Nilai', 'Nilai Utama');
  assert.deepEqual(ren['city@Malaysia/Negeri Sembilan'].map(o => o.value), ['Nilai Utama', 'Seremban'], 'renamed in place');
  assert.deepEqual(ren['township@Malaysia/Negeri Sembilan/Nilai Utama'].map(o => o.value), ['Kota Seriemas', 'Taman Desa'], 'townships moved with it');
  assert.deepEqual(ren['street@Malaysia/Negeri Sembilan/Nilai Utama/Kota Seriemas'].map(o => o.value), ['Jalan Seriemas 1'], 'and the streets under them');
  assert.deepEqual(ren['township@Malaysia/Negeri Sembilan/Nilai'] ?? [], []);
  assert.equal(renamedIn(p, 'city@Malaysia/Negeri Sembilan', 'Nilai Utama').city, 'Nilai Utama');
  assert.equal(renamedIn(p, 'city@Malaysia/Negeri Sembilan', 'Nilai Utama').township, 'Kota Seriemas', 'lower levels stay');
  const merged = optionsAfterRename(OPTS, 'city@Malaysia/Negeri Sembilan', 'Seremban', 'Nilai');
  assert.deepEqual(merged['city@Malaysia/Negeri Sembilan'].map(o => o.value), ['Nilai'], 'renaming onto an existing name keeps one');
});

// ---------- Batch D: Changes 49 and 50 ----------
import { correctTerms, vocabularyFrom, distance } from '../src/voice/correct';
import { rankProperties, rankContacts, preselect, phonesIn, samePhone } from '../src/voice/match';
import type { Contact } from '../src/data/types';

test('J49-1 near-misses of property words and the agent’s own places are fixed; other words are left alone', () => {
  const V = ['Kota Seriemas', 'Jalan Seriemas 1', 'Bandar Enstek', 'Salak Tinggi'];
  assert.equal(correctTerms('create a new terrace house in kota seri emas jalan seri mas 1 freehold non bumi putra', V),
    'create a new terrace house in Kota Seriemas Jalan Seriemas 1 freehold Non Bumiputera');
  assert.equal(correctTerms('the s p a is signed, pending loan', V), 'the SPA is signed, pending loan', 'ordinary words keep their case');
  assert.equal(correctTerms('semi d factory in salak tinggy lease hold', V), 'Semi-D factory in Salak Tinggi leasehold');
  assert.equal(correctTerms('call Thomas at 3pm tomorrow', V), 'call Thomas at 3pm tomorrow', 'not close to a known word: unchanged');
  assert.equal(correctTerms('RM580,000, four bedrooms', V), 'RM580,000, four bedrooms', 'numbers and punctuation untouched');
  assert.equal(correctTerms('', V), '');
  assert.equal(distance('seriemas', 'serimas'), 1);
  const vocab = vocabularyFrom({ 'township@Malaysia/Negeri Sembilan/Nilai': [{ value: 'Kota Seriemas' }], type: [{ value: 'Warehouse hub' }] }, [{ street: 'Jalan Aina 1' }]);
  assert.deepEqual(vocab, ['Kota Seriemas', 'Jalan Aina 1'], 'address entries and property addresses, not other lists');
});

const C = (x: Partial<Contact>): Contact => ({ id: x.id ?? 'c', created: 1, updated: 1, name: 'X', roles: ['buyer'], ...x } as Contact);
test('J50-1 the property is found by ID, address, or a linked vendor or buyer; best first', () => {
  const props = [
    L({ id: 'a', ref: 'P1001', street: 'Jalan Seriemas 1', township: 'Kota Seriemas', city: 'Nilai', vendorId: 'v1', updated: 3 }),
    L({ id: 'b', ref: 'P1002', street: 'Jalan Aina 2', township: 'Bandar Enstek', city: 'Nilai', ownerName: 'Encik Ahmad', ownerPhone: '013-222 3333', updated: 2 }),
    L({ id: 'c', ref: 'P1003', street: 'Jalan Logistik 5', city: 'Salak Tinggi', updated: 1 }),
  ];
  const contacts = [C({ id: 'v1', name: 'Victor Tan', phone: '012-345 6789', roles: ['vendor'] }), C({ id: 'k', name: 'Buyer Kamal', phone: '019-111 2222' })];
  const links = { inquiries: [{ id: 'i', created: 1, updated: 1, contactId: 'k', propertyId: 'c' }] as never[] };
  const top = (text: string) => rankProperties(text, props, contacts, links)[0].item.id;
  assert.equal(top('change the status of P1003 to sold'), 'c', 'by ID');
  assert.equal(top('the house at jalan seriemas 1 kota seriemas'), 'a', 'by address');
  assert.equal(top('the property of Victor Tan'), 'a', 'by the linked vendor’s name');
  assert.equal(top('owner 013 222 3333'), 'b', 'by the owner’s phone');
  assert.equal(top('the one Buyer Kamal asked about'), 'c', 'by a linked buyer');
  assert.equal(rankProperties('x', props, contacts).length, 3, 'every property stays choosable');
  assert.equal(preselect(rankProperties('a new bungalow somewhere', props, contacts)), undefined, 'no clear match: Create new');
  assert.equal(preselect(rankProperties('P1002', props, contacts))?.id, 'b');
});

test('J50-2 contacts by name or phone, best first; phone numbers match in any format', () => {
  assert.deepEqual(phonesIn('call 012-345 6789 or +60 13 222 3333 about RM580,000'), ['0123456789', '60132223333']);
  assert.ok(samePhone('60123456789', '012-345 6789'));
  const cs = [C({ id: 'a', name: 'Lim Wei', phone: '012 888 7777' }), C({ id: 'b', name: 'Lim Ah Kow' }), C({ id: 'c', name: 'Siti' })];
  assert.deepEqual(rankContacts('add buyer Lim Wei 012 888 7777', cs).map(r => r.item.id), ['a', 'b']);
  assert.deepEqual(rankContacts('call 0128887777', cs).map(r => r.item.id), ['a']);
  assert.deepEqual(rankContacts('nobody', cs), []);
});
