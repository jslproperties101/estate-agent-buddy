// v1buddychange013: Games tile shell - scores, streaks, badges and the game registry.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY, recordResult, liveStreak, myDay } from '../src/games/scores';
import { GAMES, gameByKey } from '../src/games/registry';
import { gameStrings } from '../src/games/strings';

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 9, 22, 4); // 22 Oct 2026 12:00 Malaysia

test('GS1 first round saves best score, play count, streak 1 and the First game badge', () => {
  const s = recordResult(EMPTY, 'priceItRight', { score: 7, maxScore: 10 }, T0);
  assert.deepEqual(s.games.priceItRight, { best: 7, bestMax: 10, plays: 1, lastDay: '2026-10-22' });
  assert.equal(s.streak, 1); assert.deepEqual(s.badges, ['first']);
});
test('GS2 a lower score never replaces the best; a higher one does', () => {
  let s = recordResult(EMPTY, 'propertyRules', { score: 8, maxScore: 10 }, T0);
  s = recordResult(s, 'propertyRules', { score: 3, maxScore: 10 }, T0 + 1000);
  assert.equal(s.games.propertyRules!.best, 8); assert.equal(s.games.propertyRules!.plays, 2);
  s = recordResult(s, 'propertyRules', { score: 10, maxScore: 10 }, T0 + 2000);
  assert.equal(s.games.propertyRules!.best, 10); assert.ok(s.badges.includes('perfect'));
});
test('GS3 scores are clamped to 0..max', () => {
  const s = recordResult(EMPTY, 'buddyWalk', { score: 99, maxScore: 5 }, T0);
  assert.equal(s.games.buddyWalk!.best, 5);
  const s2 = recordResult(EMPTY, 'buddyWalk', { score: -4, maxScore: 5 }, T0);
  assert.equal(s2.games.buddyWalk!.best, 0);
});
test('GS4 streak grows on consecutive Malaysia days, stays the same day, resets after a gap', () => {
  let s = recordResult(EMPTY, 'priceItRight', { score: 1, maxScore: 1 }, T0);
  s = recordResult(s, 'priceItRight', { score: 1, maxScore: 1 }, T0 + 3600_000);
  assert.equal(s.streak, 1);
  s = recordResult(s, 'priceItRight', { score: 1, maxScore: 1 }, T0 + DAY);
  s = recordResult(s, 'priceItRight', { score: 1, maxScore: 1 }, T0 + 2 * DAY);
  assert.equal(s.streak, 3); assert.ok(s.badges.includes('streak3'));
  assert.equal(liveStreak(s, T0 + 3 * DAY), 3, 'still alive the next day');
  assert.equal(liveStreak(s, T0 + 4 * DAY), 0, 'lapsed after a missed day');
  s = recordResult(s, 'priceItRight', { score: 1, maxScore: 1 }, T0 + 5 * DAY);
  assert.equal(s.streak, 1);
});
test('GS5 Malaysia day changes at midnight UTC+8', () => {
  assert.equal(myDay(Date.UTC(2026, 9, 21, 15, 59)), '2026-10-21');
  assert.equal(myDay(Date.UTC(2026, 9, 21, 16, 0)), '2026-10-22');
});
test('GS6 playing every game earns Tried every game', () => {
  let s = EMPTY;
  for (const g of GAMES) s = recordResult(s, g.key, { score: 1, maxScore: 2 }, T0);
  assert.ok(s.badges.includes('allGames'));
});
test('GS7 seven games registered in order (Batch I added four), each with EN/BM/ZH title and blurb; badge names in 3 languages', () => {
  assert.deepEqual(GAMES.map(g => g.key), ['buddyWalk', 'priceItRight', 'propertyRules', 'buddyStreets', 'viewingRush', 'openHouse', 'matchBuyer']);
  for (const g of GAMES) for (const l of ['en', 'bm', 'zh'] as const) { assert.ok(g.title[l]); assert.ok(g.blurb[l]); }
  assert.equal(gameByKey('nope'), undefined);
  for (const l of ['en', 'bm', 'zh'] as const) for (const b of Object.keys(gameStrings.en.badge)) assert.ok((gameStrings[l].badge as Record<string, string>)[b]);
});
