// Follow-up reminder for quiet contacts: only reminds, never changes a contact.
import test from 'node:test';
import assert from 'node:assert/strict';
import { followUpDue, DEFAULT_FOLLOW_UP_DAYS } from '../src/domain/followup';
import { followStrings } from '../src/contacts/followStrings';
import type { Contact } from '../src/data/types';

const DAY = 86_400_000; const NOW = Date.UTC(2026, 9, 14);
const c = (id: string, over: Partial<Contact>): Contact => ({ id, created: NOW - 100 * DAY, updated: NOW, name: id, roles: ['buyer'], ...over });

test('F1 a quiet buyer or vendor is listed, longest quiet first; recent contact is not', () => {
  const r = followUpDue([
    c('recent', { lastInteraction: NOW - 5 * DAY }),
    c('old', { lastInteraction: NOW - 40 * DAY }),
    c('older', { lastInteraction: NOW - 90 * DAY }),
    c('vendor', { roles: ['vendor'], lastInteraction: NOW - 31 * DAY }),
  ], NOW);
  assert.deepEqual(r.map(x => x.contact.id), ['older', 'old', 'vendor']);
  assert.equal(r[0].quietDays, 90);
});

test('F2 finished or given-up contacts, professionals, other roles and sample data are never listed', () => {
  const r = followUpDue([
    c('dropped', { leadStatus: 'dropped' }), c('booked', { leadStatus: 'booked' }),
    c('closed', { roles: ['vendor'], vendorStatus: 'closed' }), c('withdrawn', { roles: ['vendor'], vendorStatus: 'withdrawn' }),
    c('pro', { roles: ['professional'] }), c('sample', { sample: true }),
    c('live', { leadStatus: 'hot' }),
  ], NOW);
  assert.deepEqual(r.map(x => x.contact.id), ['live']);
});

test('F3 a contact with no interaction counts from when it was added; the threshold is respected; 0 turns it off', () => {
  const fresh = c('fresh', { created: NOW - 10 * DAY });
  const stale = c('stale', { created: NOW - 31 * DAY });
  assert.deepEqual(followUpDue([fresh, stale], NOW).map(x => x.contact.id), ['stale']);
  assert.deepEqual(followUpDue([fresh, stale], NOW, 7).map(x => x.contact.id), ['stale', 'fresh']);
  assert.deepEqual(followUpDue([fresh, stale], NOW, 0), [], 'off');
  assert.equal(DEFAULT_FOLLOW_UP_DAYS, 30);
});

test('F4 listing never changes the contacts it reads (no automatic inactive or dropped)', () => {
  const list = [c('a', { leadStatus: 'cold', lastInteraction: NOW - 99 * DAY })];
  const before = JSON.stringify(list);
  followUpDue(list, NOW);
  assert.equal(JSON.stringify(list), before);
});

test('F5 the wording exists in English, Bahasa Malaysia and Chinese', () => {
  const keys = Object.keys(followStrings.en).sort();
  for (const l of ['bm', 'zh'] as const) {
    assert.deepEqual(Object.keys(followStrings[l]).sort(), keys);
    assert.match(followStrings[l].notice(2, 30), /30/);
    assert.notEqual(followStrings[l].title, followStrings.en.title);
  }
});
