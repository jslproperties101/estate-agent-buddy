// Duplicate-property warning: it warns, never blocks, and compares addresses sensibly.
import test from 'node:test';
import assert from 'node:assert/strict';
import { possibleDuplicates, norm } from '../src/domain/duplicates';
import { dupStrings } from '../src/listing/dupStrings';
import type { Listing } from '../src/listing/model';

const p = (id: string, over: Partial<Listing>): Listing => ({ id, created: 1, updated: 1, photos: [], ...over } as Listing);

test('DUP1 the same street and unit in the same area is flagged, however the street is typed', () => {
  const a = p('a', { street: 'Jalan Mawar 3', unitNo: '12', township: 'Salak Tinggi' });
  const b = p('b', { street: 'Jln. Mawar 3', unitNo: '12', township: 'salak tinggi' });
  assert.deepEqual(possibleDuplicates(b, [a]).map(x => [x.property.id, x.reason]), [['a', 'address']]);
  assert.equal(norm('Jalan Mawar 3'), norm('JLN  mawar 3'));
});

test('DUP2 the same lot in the same area is flagged; the same lot number in a different area is not', () => {
  const a = p('a', { lotNo: '2/14', township: 'Nilai' });
  assert.deepEqual(possibleDuplicates(p('b', { lotNo: '2/14', township: 'Nilai' }), [a]).map(x => x.reason), ['lot']);
  assert.deepEqual(possibleDuplicates(p('c', { lotNo: '2/14', township: 'Sepang' }), [a]), []);
});

test('DUP3 a different unit on the same street, and the property itself, are not flagged; empty fields never match', () => {
  const a = p('a', { street: 'Jalan Mawar 3', unitNo: '12', township: 'X' });
  assert.deepEqual(possibleDuplicates(p('b', { street: 'Jalan Mawar 3', unitNo: '14', township: 'X' }), [a]), []);
  assert.deepEqual(possibleDuplicates(a, [a]), [], 'itself');
  assert.deepEqual(possibleDuplicates(p('e', {}), [p('f', {})]), [], 'nothing typed, nothing matches');
});

test('DUP4 the warning exists in three languages', () => {
  for (const l of ['bm', 'zh'] as const) {
    assert.deepEqual(Object.keys(dupStrings[l]).sort(), Object.keys(dupStrings.en).sort());
    assert.notEqual(dupStrings[l].title, dupStrings.en.title);
  }
});
