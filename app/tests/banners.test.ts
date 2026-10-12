import { test } from 'node:test';
import assert from 'node:assert/strict';
import { numberChoices } from '../src/domain/refs';
import { activeBanners, bannerCounts, bannersOf, statusAfterAdd, statusAfterRemove } from '../src/domain/banners';
import type { Banner } from '../src/data/types';

test('R3 reference dropdown: used numbers carry the reference using them; free ones and gaps can be chosen', () => {
  const list = [
    { id: 'a', ref: 'P1001', refPrefix: 'P', refNo: 1001 },
    { id: 'b', ref: 'P1002', refPrefix: 'P', refNo: 1002 },
    { id: 'c', ref: 'A1004', refPrefix: 'A', refNo: 1004 },
  ];
  const ch = numberChoices(list);
  const at = (n: number) => ch.find(x => x.no === n)!;
  assert.deepEqual(at(1001).usedBy, ['P1001']);
  assert.deepEqual(at(1002).usedBy, ['P1002']);
  assert.deepEqual(at(1003).usedBy, [], 'a gap is free');
  assert.deepEqual(at(1004).usedBy, ['A1004'], 'unique across prefixes (owner rule): A1004 makes 1004 used for P too');
  assert.equal(ch[0].no, 1001);
  assert.equal(ch[ch.length - 1].no, 1014, 'ten free numbers after the highest used');
  // Editing P1002: its own number is "this property", not used.
  const edit = numberChoices(list, 'b');
  assert.deepEqual(edit.find(x => x.no === 1002), { no: 1002, usedBy: [], current: true });
  // Empty list starts at 1001.
  assert.equal(numberChoices([])[0].no, 1001);
  assert.ok(numberChoices([]).every(x => x.usedBy.length === 0));
});

const ban = (id: string, propertyId: string, placedOn: string, removedOn?: string): Banner =>
  ({ id, propertyId, placedOn, removedOn, lat: 2.8, lng: 101.8, source: 'gps', created: 1, updated: 1 });

test('B1 banners: status Yes when one is added, Removed when the last one comes down, history kept', () => {
  assert.equal(statusAfterAdd(), 'yes');
  assert.equal(statusAfterRemove('yes', 1), 'yes', 'another banner is still up');
  assert.equal(statusAfterRemove('yes', 0), 'removed');
  const all = [ban('1', 'p', '2026-10-01'), ban('2', 'p', '2026-10-10'), ban('3', 'p', '2026-09-01', '2026-09-20'), ban('4', 'q', '2026-10-05')];
  assert.deepEqual(bannersOf(all, 'p').map(b => b.id), ['2', '1', '3'], 'newest first, taken-down ones kept');
  assert.deepEqual(activeBanners(all, 'p').map(b => b.id), ['2', '1']);
  assert.deepEqual(bannerCounts([{ bannerStatus: 'yes' }, { bannerStatus: 'yes' }, { bannerStatus: 'not_allowed' }, {}]),
    { yes: 2, not_yet: 0, no: 0, not_allowed: 1, removed: 0, unset: 1 });
});
