// Phase 1 recheck (14 Oct 2026): gaps found when each Phase 1 requirement was compared with the code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryBackend } from '../src/data/backend';
import { Store } from '../src/data/store';
import { convertInactive, reviewContacts } from '../src/data/leadReview';
import { LEAD_STATUSES, Contact } from '../src/data/types';
import { strings } from '../src/i18n';
import { saveStrings } from '../src/ui/savestrings';
import { startupStrings } from '../src/startup/strings';
import { bugStrings } from '../src/bugreport/strings';
import { leadReviewStrings } from '../src/data/leadReviewStrings';
import { TILES } from '../src/App';

const mk = (id: string, name: string, leadStatus: string): Contact => ({ id, created: 1, updated: 1, name, roles: ['buyer'], leadStatus } as unknown as Contact);

test('R1 a buyer deleted after the conversion is not counted in the review or the notification', async () => {
  const s = await Store.open(new MemoryBackend());
  s.upsert('contacts', mk('a', 'Alpha', 'inactive'));
  s.upsert('contacts', mk('b', 'Beta', 'inactive'));
  s.upsert('contacts', mk('c', 'Gamma', 'inactive'));
  assert.equal(convertInactive(s, 1), 3);
  s.remove('contacts', 'b');
  const rep = s.getState().meta.leadReview!;
  assert.equal(rep.ids.length, 3, 'the report keeps its list');
  assert.deepEqual(reviewContacts(s.getState().contacts, rep.ids).map(c => c.name).sort(), ['Alpha', 'Gamma'], 'only buyers that still exist are shown and counted');
  s.remove('contacts', 'a'); s.remove('contacts', 'c');
  assert.equal(reviewContacts(s.getState().contacts, rep.ids).length, 0, 'nothing left to review: the notification count is zero');
});

test('R2 every buyer status has a name in all three languages, and Inactive is not offered', () => {
  assert.deepEqual([...LEAD_STATUSES], ['cold', 'warm', 'hot', 'dropped', 'booked']);
  for (const lang of ['en', 'bm', 'zh'] as const) {
    for (const st of LEAD_STATUSES) assert.ok(strings[lang].lead[st], `${lang} ${st}`);
    assert.equal(strings[lang].lead['inactive'], undefined, `${lang}: Inactive is not a current status`);
  }
  for (const st of ['dropped', 'booked', 'hot']) {
    assert.notEqual(strings.bm.lead[st], strings.en.lead[st], `bm ${st} is translated`);
    assert.notEqual(strings.zh.lead[st], strings.en.lead[st], `zh ${st} is translated`);
  }
});

test('R3 the Phase 1 screens have the same wording keys in English, Bahasa Malaysia and Chinese', () => {
  const same = (name: string, a: object, b: object, c: object) => {
    const ks = (o: object) => Object.keys(o).sort().join(',');
    assert.equal(ks(a), ks(b), `${name}: bm has the same keys as en`);
    assert.equal(ks(a), ks(c), `${name}: zh has the same keys as en`);
  };
  same('save', saveStrings.en, saveStrings.bm, saveStrings.zh);
  same('startup', startupStrings.en, startupStrings.bm, startupStrings.zh);
  same('bug report', bugStrings.en, bugStrings.bm, bugStrings.zh);
  same('lead review', leadReviewStrings.en, leadReviewStrings.bm, leadReviewStrings.zh);
  same('notifications', strings.en.notif, strings.bm.notif, strings.zh.notif);
  for (const lang of ['bm', 'zh'] as const) {
    assert.notEqual(strings[lang].comingSoon, strings.en.comingSoon);
    assert.notEqual(saveStrings[lang].phone, saveStrings.en.phone, `${lang} save line is translated`);
    assert.notEqual(startupStrings[lang].retry, startupStrings.en.retry, `${lang} retry is translated`);
  }
});

test('R4 the dashboard has 15 cards in the order of Change 011 / 013 (owner, 16 Oct 2026); Settings, News, Co-broke and Agent Profile are not cards', () => {
  assert.deepEqual(TILES.map(t => t.key), ['todo', 'calendar', 'opportunities', 'creative', 'contacts', 'activity', 'gps', 'finance', 'calculator', 'matching', 'expert', 'market', 'project', 'property', 'voice']);
  assert.equal(TILES.findIndex(t => t.key === 'creative') + 1, 4, 'Creative Media is card 4');
  assert.equal(TILES.findIndex(t => t.key === 'property') + 1, 14, 'the Subsale List is card 14, bottom centre');
  assert.equal(strings.en.tiles.property, 'Subsale List');
  assert.equal(strings.en.tiles.creative, 'Creative Media');
  assert.equal(strings.en.tiles.matching, 'Buyer Matching');
  for (const l of ['en', 'bm', 'zh'] as const) for (const t of TILES) assert.ok(strings[l].tiles[t.key], `${l} label for ${t.key}`);
  assert.deepEqual(TILES.find(t => t.key === 'property')?.target, { name: 'listing' });
  assert.deepEqual(TILES.find(t => t.key === 'creative')?.target, { name: 'creativeMedia' });
  assert.deepEqual(TILES.find(t => t.key === 'matching')?.target, { name: 'buyerMatching' });
});
