// JoyChange006 Part 2, Batch 3: F (new Availability status) and G (Check-status colours).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AVAIL_CHOICES, availChoice, availPatch } from '../src/listing/cc001';
import { STATUS_KEYS, HIDDEN_BY_DEFAULT, DEFAULT_STATUSES } from '../src/listing/model';
import { offerable } from '../src/domain/matching';
import { listingStrings } from '../src/listing/strings';
import { cc001Strings } from '../src/ui/cc001Strings';

test('F-1 "Rented - Pending TA Signing" sits just before "Rented" everywhere it is listed', () => {
  assert.equal(AVAIL_CHOICES.indexOf('rented_pending_ta') + 1, AVAIL_CHOICES.indexOf('rented'));
  assert.equal(STATUS_KEYS.indexOf('rented_pending_ta') + 1, STATUS_KEYS.indexOf('rented'));
});
test('F-2 the choice round-trips through the two stored fields and is hidden by default, like Rented and Sold', () => {
  assert.deepEqual(availPatch('rented_pending_ta'), { status: 'rented_pending_ta', availability: 'tenanted', availableFrom: undefined, bookedStage: undefined });
  assert.equal(availChoice({ status: 'rented_pending_ta' } as never), 'rented_pending_ta');
  assert.ok(HIDDEN_BY_DEFAULT.includes('rented_pending_ta'));
  assert.ok(!DEFAULT_STATUSES.includes('rented_pending_ta'));
});
test('F-3 does not count as available: never offered to a buyer (Joe’s choice)', () => {
  assert.equal(offerable({ status: 'rented_pending_ta' } as never), false);
  assert.equal(offerable({ status: 'available' } as never), true);
});
test('F-4 the exact English wording from JoyChange006-Main-Part2.txt, and BM/ZH are filled in', () => {
  assert.equal(listingStrings.en.status.rented_pending_ta, 'Rented - Pending TA Signing');
  for (const l of ['en', 'bm', 'zh'] as const) {
    assert.ok(listingStrings[l].status.rented_pending_ta?.length);
    assert.ok(cc001Strings[l].avail.rented_pending_ta?.length);
  }
});
