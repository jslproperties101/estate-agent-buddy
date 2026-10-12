// Property voice / text commands (Version 1L): proposals only, nothing invented.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand, applyChanges, Change } from '../src/listing/commands';
import { SAMPLE_LISTINGS as L } from '../src/listing/model';

const val = (cs: Change[], k: string) => cs.find(c => c.key === k)?.value;

test('C1 the brief example becomes a proposed new property with exactly the stated details', () => {
  const r = parseCommand('Create a new semi-detached factory in Salak Tinggi, land area 20,000 square feet, built-up 12,000 square feet, asking price RM3.2 million, leasehold.');
  assert.equal(r.kind, 'create');
  if (r.kind !== 'create') return;
  assert.equal(val(r.changes, 'type'), 'Semi-D factory');
  assert.equal(val(r.changes, 'area'), 'Salak Tinggi');
  assert.equal(val(r.changes, 'landSqft'), 20000);
  assert.equal(val(r.changes, 'builtUpSqft'), 12000);
  assert.equal(val(r.changes, 'askingPrice'), 3200000);
  assert.equal(val(r.changes, 'tenure'), 'leasehold');
  assert.deepEqual(r.changes.map(c => c.key).sort(), ['area', 'askingPrice', 'builtUpSqft', 'landSqft', 'tenure', 'type']);
});

test('C2 spoken numbers, Bahasa Malaysia and rentals', () => {
  const a = parseCommand('Create a new terrace house in Nilai for rent, rental one thousand eight hundred ringgit per month, three bedrooms, two bathrooms');
  assert.equal(a.kind, 'create');
  if (a.kind !== 'create') return;
  assert.equal(val(a.changes, 'monthlyRent'), 1800);
  assert.equal(val(a.changes, 'purpose'), 'rent');
  assert.equal(val(a.changes, 'bedrooms'), 3);
  assert.equal(val(a.changes, 'bathrooms'), 2);
  assert.equal(val(a.changes, 'askingPrice'), undefined, 'a rent is not taken as a sale price');
  const b = parseCommand('Cipta rumah teres baharu di Nilai, harga lima ratus lapan puluh ribu ringgit, pegangan bebas, empat bilik tidur');
  assert.equal(b.kind, 'create');
  if (b.kind !== 'create') return;
  assert.equal(val(b.changes, 'type'), 'Terrace house');
  assert.equal(val(b.changes, 'askingPrice'), 580000);
  assert.equal(val(b.changes, 'tenure'), 'freehold');
  assert.equal(val(b.changes, 'bedrooms'), 4);
  const c = parseCommand('Create a new factory in Nilai, 2 acres');
  assert.equal(c.kind, 'create');
  if (c.kind !== 'create') return;
  assert.equal(val(c.changes, 'type'), undefined, '"factory" alone does not choose a type');
  assert.deepEqual(c.unclear, ['factory']);
  assert.equal(val(c.changes, 'landSqft'), 87120);
});

test('C3 changes to an open property, with before and after', () => {
  const unit7 = L[0];
  const p = parseCommand('Change the asking price to RM3 million', unit7);
  assert.equal(p.kind, 'update');
  if (p.kind !== 'update') return;
  assert.deepEqual(p.changes, [{ key: 'askingPrice', value: 3000000 }]);
  const k = parseCommand('Add three parking bays', unit7);
  assert.equal(k.kind, 'update');
  if (k.kind !== 'update') return;
  assert.deepEqual(k.changes, [{ key: 'parking', value: 7, note: 'added' }], 'Unit 7 has 4 bays: 4 + 3');
  const s = parseCommand('Mark it as sold', unit7);
  assert.equal(s.kind === 'update' && val(s.changes, 'status'), 'sold');
});

test('C4 tenancy and notes: asks when the details were not said, never invents', () => {
  assert.deepEqual(parseCommand('Update the tenancy information', L[5]), { kind: 'ask', topic: 'tenancy' });
  const t = parseCommand('Update the tenancy: tenant Kedai Maju Sdn Bhd, rent RM 6,500 a month, from July 2027 to June 2029', L[5]);
  assert.equal(t.kind, 'update');
  if (t.kind !== 'update') return;
  assert.equal(val(t.changes, 'tenancy.tenant'), 'Kedai Maju Sdn Bhd');
  assert.equal(val(t.changes, 'tenancy.rent'), 6500);
  assert.equal(val(t.changes, 'tenancy.start'), '2027-07');
  assert.equal(val(t.changes, 'tenancy.end'), '2029-06');
  assert.deepEqual(parseCommand("Add a note about the owner's instructions", L[0]), { kind: 'ask', topic: 'note', prefix: "Owner's instructions: " });
  const n = parseCommand("Add a note about the owner's instructions: show only on weekends, call first", L[0]);
  assert.equal(n.kind === 'update' && val(n.changes, 'notes'), "Owner's instructions: show only on weekends, call first");
  const applied = applyChanges(L[0], n.kind === 'update' ? n.changes : []);
  assert.ok(applied.notes!.startsWith('Owner open to offers.'), 'earlier notes are kept');
  assert.ok(applied.notes!.endsWith('call first'));
});

test('C5 find, and things not understood', () => {
  assert.deepEqual(parseCommand('Find the factory in Salak Tinggi'), { kind: 'find', type: undefined, typeWord: 'factory', area: 'Salak Tinggi', purpose: undefined });
  assert.deepEqual(parseCommand('Show condos for rent in Putra Nilai'), { kind: 'find', type: 'Condo / apartment', area: 'Putra Nilai', purpose: 'rent' });
  assert.deepEqual(parseCommand('What is the weather today'), { kind: 'unknown' });
  assert.deepEqual(parseCommand('hello', L[0]), { kind: 'unknown' });
});
