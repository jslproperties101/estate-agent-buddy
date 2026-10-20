// JoyChange006 Batch 1, Change C: the one search rule used by every pick list.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesText, joy006Strings } from '../src/ui/pickSearch';

test('J6-1 empty search matches everything', () => {
  assert.equal(matchesText('Ahmad Rahman', ''), true);
  assert.equal(matchesText('Ahmad Rahman', '   '), true);
});
test('J6-2 part of a name matches, any case, any word order', () => {
  assert.equal(matchesText('Ahmad Rahman 012-345 6789', 'rahm'), true);
  assert.equal(matchesText('Ahmad Rahman', 'RAHMAN ahmad'), true);
  assert.equal(matchesText('Ahmad Rahman', 'lim'), false);
});
test('J6-3 accents are ignored', () => {
  assert.equal(matchesText('José Álvarez', 'jose alv'), true);
});
test('J6-4 a phone number matches however it is written', () => {
  assert.equal(matchesText('Ali 012-345 6789', '0123456'), true);
  assert.equal(matchesText('Ali 012-345 6789', '+60 12'), false);
  assert.equal(matchesText('Ali +6012-345 6789', '+60 12'), true);
  assert.equal(matchesText('Ali 012-345 6789', '999'), false);
});
test('J6-5 a single digit does not match every phone number by accident', () => {
  assert.equal(matchesText('Ali Ahmad', '1'), false);
});
test('J6-6 "No results" and the search hint exist in all three languages', () => {
  for (const l of ['en', 'bm', 'zh'] as const) {
    assert.ok(joy006Strings[l].noResults.length > 0);
    assert.ok(joy006Strings[l].searchNamePhone.length > 0);
  }
});
