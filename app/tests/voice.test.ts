// Voice tests (Version 1J): spoken numbers and property details in English, Bahasa Malaysia and mixed speech,
// and when a voice note may be attached automatically. Text stands in for what a speech recogniser returns.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normaliseSpoken, wordsToNumber } from '../src/voice/spoken';
import { readNote } from '../src/local/pipeline';
import { extract } from '../src/local/rules';
import { merge } from '../src/local/merge';
import { decideAttachment, Place } from '../src/voice/attach';

async function fields(text: string) {
  const r = await readNote('v', text, 'Voice note');
  const m = merge(extract(r.segments, s => r.blocked.get(s) ?? []));
  const get = (id: string) => m.fields.find(f => f.id === id);
  return { m, get, val: (id: string) => get(id)?.suggested ?? '' };
}

test('V1 English example from the brief', async () => {
  const { get, val } = await fields('Two-storey terrace in Nilai, asking five hundred and eighty thousand ringgit, four bedrooms, owner wants to sell urgently.');
  assert.equal(val('type'), 'Terrace house');
  assert.equal(val('floors'), '2');
  assert.equal(val('location'), 'Nilai');
  assert.equal(val('price'), 'RM 580,000');
  assert.equal(val('bedrooms'), '4');
  assert.match(val('remarks'), /Owner wants to sell urgently/);
  assert.equal(get('price')!.label, 'STATED');
});

test('V2 Bahasa Malaysia', async () => {
  const { val } = await fields('Rumah teres dua tingkat di Nilai, harga lima ratus lapan puluh ribu ringgit, empat bilik tidur, tiga bilik air, pegangan bebas, nak jual cepat');
  assert.equal(val('type'), 'Terrace house');
  assert.equal(val('floors'), '2');
  assert.equal(val('price'), 'RM 580,000');
  assert.equal(val('bedrooms'), '4');
  assert.equal(val('bathrooms'), '3');
  assert.equal(val('tenure'), 'Freehold');
  assert.match(val('remarks'), /Nak jual cepat/);
});

test('V3 mixed English and Bahasa Malaysia', async () => {
  const { val } = await fields('Semi-D factory kat Sepang, harga three point two million, land eight thousand kaki persegi, freehold, boleh runding');
  assert.equal(val('type'), 'Semi-D factory');
  assert.equal(val('location'), 'Sepang');
  assert.equal(val('price'), 'RM 3,200,000');
  assert.equal(val('land'), '8,000 sq ft');
  assert.equal(val('tenure'), 'Freehold');
  assert.match(val('remarks'), /Boleh runding/);
});

test('V4 exploration note: observations kept as remarks, no price invented', async () => {
  const { val } = await fields('Three factory units side by side, corner unit available, access road is wide enough for lorries.');
  assert.equal(val('type'), 'Factory');
  assert.match(val('remarks'), /Corner unit/);
  assert.match(val('remarks'), /Access road is wide enough for lorries/);
  assert.equal(val('price'), '');
  assert.equal(val('bedrooms'), '');
});

test('V5 nothing invented from vague speech', async () => {
  const { m } = await fields('nice area near the highway, will come back later');
  assert.ok(m.fields.every(f => !f.suggested || f.id === 'location'));
});

test('V6 owner name and phone only when said', async () => {
  const { val } = await fields('Owner Encik Ahmad bin Ali, phone zero one two three four five six seven eight nine');
  assert.equal(val('ownerName'), 'Encik Ahmad bin Ali');
  assert.equal(val('docPhone'), '+60 12-345 6789');
  const lower = await fields('owner encik tan wants to sell, owner wants it fast');
  assert.equal(lower.val('ownerName'), 'Encik Tan');
});

test('V7 spoken numbers', () => {
  assert.equal(wordsToNumber(['dua', 'belas']), 12);
  assert.equal(wordsToNumber(['seribu', 'lima', 'ratus']), 1500);
  assert.equal(wordsToNumber(['satu', 'juta', 'dua', 'ratus', 'ribu']), 1_200_000);
  assert.equal(wordsToNumber(['lapan', 'ratus', 'lima', 'puluh', 'ribu']), 850_000);
  assert.equal(wordsToNumber(['three', 'point', 'five', 'million']), 3_500_000);
  assert.equal(wordsToNumber(['dua', 'juta', 'setengah']), 2_500_000);
  assert.equal(normaliseSpoken('asking 850k ringgit'), 'asking RM 850k');
});

test('V8 voice note attaches automatically only when reliable', () => {
  const places: Place[] = [
    { id: 'u6', name: 'Unit 6', lat: 2.8200, lon: 101.8000 },
    { id: 'u7', name: 'Unit 7', lat: 2.8200, lon: 101.8003 },   // about 33 m from Unit 6
    { id: 'l21', name: 'Lot 21', lat: 2.8300, lon: 101.8100 },
  ];
  const at = (lat: number, lon: number, accuracy: number) => ({ lat, lon, accuracy });
  const a = decideAttachment(at(2.83001, 101.81001, 8), places);
  assert.equal(a.kind, 'property');
  assert.equal(a.kind === 'property' && a.place.id, 'l21');
  assert.deepEqual(decideAttachment(at(2.82, 101.80015, 8), places).kind === 'ask' && (decideAttachment(at(2.82, 101.80015, 8), places) as { reason: string }).reason, 'several-near');
  assert.equal((decideAttachment(at(2.83001, 101.81001, 80), places) as { reason: string }).reason, 'poor-fix');
  assert.equal((decideAttachment(at(2.9, 101.9, 5), places) as { reason: string }).reason, 'none-near');
  assert.equal((decideAttachment(null, places) as { reason: string }).reason, 'no-fix');
});
