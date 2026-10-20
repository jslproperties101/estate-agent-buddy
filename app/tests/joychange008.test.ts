// JoyChange008 (Batch 4): parent-child location lists from the Malaysia postcode list.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { citiesFor, townshipsFor, allMalaysiaTowns, MY_STATES, allBuiltInCities } from '../src/domain/places';
import { MY_OFFICIAL_TOWNS } from '../src/domain/myPlacesData';
import { LOC_PARENT, LOCATION_LEVELS } from '../src/listing/cc001';
import { c008Strings } from '../src/ui/c008Strings';

test('L8-1 every state has its own official towns; state names match the app', () => {
  assert.deepEqual(Object.keys(MY_OFFICIAL_TOWNS).sort(), [...MY_STATES].sort());
  assert.ok(Object.values(MY_OFFICIAL_TOWNS).reduce((n, x) => n + x.length, 0) >= 400);
});
test('L8-2 a City / Town list shows ONLY towns of the chosen state (no more fall-back to all of Malaysia)', () => {
  const ns = citiesFor('Negeri Sembilan');
  assert.ok(ns.includes('Nilai') && ns.includes('Seremban'));
  assert.ok(!ns.includes('Shah Alam') && !ns.includes('Johor Bahru'), 'no towns of other states');
  assert.deepEqual(citiesFor(undefined), [], 'no state chosen: nothing offered');
  assert.deepEqual(citiesFor('Bavaria'), [], 'another country: nothing built in');
  assert.ok(citiesFor('negeri sembilan').includes('Nilai'), 'any capitals');
  // towns from the earlier short list stay (agents already use them), each once, A to Z
  assert.ok(ns.includes('Senawang'));
  assert.deepEqual(ns, [...ns].sort((a, b) => a.localeCompare(b)));
  assert.equal(new Set(ns.map(x => x.toLowerCase())).size, ns.length);
});
test('L8-3 Townships only under their own City / Town', () => {
  assert.ok(townshipsFor('Nilai').includes('Kota Seriemas'));
  assert.ok(!townshipsFor('Nilai').includes('Bangsar'));
  assert.deepEqual(townshipsFor('Seremban'), [], 'a town without a built-in list offers none (agents add their own)');
  assert.deepEqual(townshipsFor(undefined), []);
});
test('L8-4 Google names are matched against the full town list; voice commands keep the short list', () => {
  assert.ok(allMalaysiaTowns().includes('Bandar Baru Enstek'));
  assert.ok(!allBuiltInCities().includes('Rasa'), 'everyday words such as "rasa" are not place names for voice');
});
test('L8-5 Township is kept as its own level (Joe, 21 Oct 2026); lower levels hang under the City / Town', () => {
  assert.deepEqual([...LOCATION_LEVELS], ['country', 'state', 'city', 'township', 'neighborhood', 'street']);
  assert.equal(LOC_PARENT.city, 'state'); assert.equal(LOC_PARENT.street, 'city'); assert.equal(LOC_PARENT.state, undefined);
});
test('L8-6 the delete warning and credits exist in all three languages', () => {
  for (const l of ['en', 'bm', 'zh'] as const) {
    assert.ok(c008Strings[l].deleteBody.length > 20);
    assert.ok(c008Strings[l].credits('X').includes('X'));
  }
  assert.match(c008Strings.en.deleteBody, /Properties you already saved keep their place names/);
});
