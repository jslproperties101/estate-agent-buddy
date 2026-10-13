// Voice / text commands: property capture by voice. Proposals only, nothing invented.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand, applyChanges, Change } from '../src/listing/commands';
import { sampleData } from '../src/data/sample';

const L = sampleData().properties;
const val = (cs: Change[], k: string) => cs.find(c => c.key === k)?.value;

test('C1 the brief example becomes a proposed new property with exactly the stated details', () => {
  const r = parseCommand('Create a new semi-detached factory in Salak Tinggi, land area 20,000 square feet, built-up 12,000 square feet, asking price RM3.2 million, leasehold.');
  assert.equal(r.kind, 'create');
  if (r.kind !== 'create') return;
  assert.deepEqual(Object.fromEntries(r.changes.map(c => [c.key, c.value])), {
    type: 'Semi-D factory', city: 'Salak Tinggi', landSqft: 20000, builtUpSqft: 12000, askingPrice: 3200000, tenure: 'leasehold',
  });
});

test('C2 location, owner and phone captured by voice; townships go to Township', () => {
  const r = parseCommand('Create a new terrace house in Putra Nilai, Jalan PN 3/2, unit 12, for rent, rental RM1,800 per month, three bedrooms, owner Encik Ahmad 012 345 6789');
  assert.equal(r.kind, 'create');
  if (r.kind !== 'create') return;
  assert.equal(val(r.changes, 'township'), 'Putra Nilai');
  assert.equal(val(r.changes, 'street'), 'Jalan PN 3/2');
  assert.equal(val(r.changes, 'unitNo'), '12');
  assert.equal(val(r.changes, 'monthlyRent'), 1800);
  assert.equal(val(r.changes, 'purpose'), 'rent');
  assert.equal(val(r.changes, 'bedrooms'), 3);
  assert.equal(val(r.changes, 'ownerName'), 'Encik Ahmad');
  assert.equal(val(r.changes, 'ownerPhone'), '+60 12-345 6789');
  assert.equal(val(r.changes, 'askingPrice'), undefined, 'a rent is not taken as a sale price');
});

test('C3 Bahasa Malaysia, spoken numbers, saved custom township', () => {
  const b = parseCommand('Cipta rumah teres baharu di Taman Sri Pajam, harga lima ratus lapan puluh ribu ringgit, pegangan bebas, empat bilik tidur', undefined, ['Taman Sri Pajam']);
  assert.equal(b.kind, 'create');
  if (b.kind !== 'create') return;
  assert.equal(val(b.changes, 'type'), 'Terrace house');
  assert.equal(val(b.changes, 'township'), 'Taman Sri Pajam');
  assert.equal(val(b.changes, 'askingPrice'), 580000);
  assert.equal(val(b.changes, 'tenure'), 'freehold');
  const c = parseCommand('Create a new factory in Nilai, 2 acres');
  assert.equal(c.kind === 'create' && val(c.changes, 'type'), undefined, '"factory" alone does not choose a type');
});

test('C4 changes to an open property, with before and after; location only when asked', () => {
  const unit7 = L[0];
  assert.deepEqual(parseCommand('Change the asking price to RM3 million', unit7), { kind: 'update', changes: [{ key: 'askingPrice', value: 3000000 }], unclear: [] });
  const k = parseCommand('Add three parking bays', unit7);
  assert.deepEqual(k.kind === 'update' && k.changes, [{ key: 'parking', value: 7, note: 'added' }]);
  const n = parseCommand('Change the price to RM2.9 million, buyer from Seremban', unit7);
  assert.equal(n.kind === 'update' && n.changes.some(c => c.key === 'city'), false, 'a place said in passing does not move the property');
});

test('C5 tenancy and notes ask when details are missing; notes are appended', () => {
  assert.deepEqual(parseCommand('Update the tenancy information', L[5]), { kind: 'ask', topic: 'tenancy' });
  const n = parseCommand("Add a note about the owner's instructions: show only on weekends", L[0]);
  const applied = applyChanges(L[0], n.kind === 'update' ? n.changes : []);
  assert.ok(applied.notes!.startsWith('Owner open to offers.'));
  assert.ok(applied.notes!.endsWith('show only on weekends'));
});

test('C6 find, and things not understood', () => {
  assert.deepEqual(parseCommand('Find the factory in Salak Tinggi'), { kind: 'find', type: undefined, typeWord: 'factory', area: 'Salak Tinggi', purpose: undefined });
  assert.deepEqual(parseCommand('Show condos for rent in Putra Nilai'), { kind: 'find', type: 'Condo / apartment', area: 'Putra Nilai', purpose: 'rent' });
  assert.deepEqual(parseCommand('What is the weather today'), { kind: 'unknown' });
});

test('C-RL Residential land can be created by voice in English and Malay', () => {
  for (const say of ['Create a new residential land in Salak Tinggi, land area 8,000 square feet, asking price RM900,000', 'Cipta tanah kediaman baharu di Salak Tinggi, harga RM900,000']) {
    const r = parseCommand(say);
    assert.equal(r.kind, 'create', say);
    if (r.kind === 'create') assert.equal(r.changes.find(c => c.key === 'type')?.value, 'Residential land', say);
  }
});
