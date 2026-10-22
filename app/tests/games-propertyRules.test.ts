// v1buddychange013: Property Rules Quiz - question bank checks and pure round logic.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BANK, TOPICS } from '../src/games/propertyRules/bank';
import { makeRound, scoreRound, isCorrect, correctPosition, ROUND_SIZE } from '../src/games/propertyRules/logic';

const LANGS = ['en', 'bm', 'zh'] as const;

test('PR1 the bank has at least 40 questions with unique ids', () => {
  assert.ok(BANK.length >= 40, `only ${BANK.length}`);
  assert.equal(new Set(BANK.map(q => q.id)).size, BANK.length);
});
test('PR2 every question has 4 distinct options, a valid correct index and an explanation in EN, BM and ZH', () => {
  for (const q of BANK) {
    assert.ok(TOPICS.includes(q.topic), q.id);
    assert.equal(q.options.length, 4, q.id);
    assert.ok(Number.isInteger(q.correct) && q.correct >= 0 && q.correct < 4, q.id);
    for (const l of LANGS) {
      assert.ok(q.q[l]?.trim(), `${q.id} question ${l}`);
      assert.ok(q.explain[l]?.trim(), `${q.id} explain ${l}`);
      const opts = q.options.map(o => o[l]?.trim());
      assert.ok(opts.every(Boolean), `${q.id} option text ${l}`);
      assert.equal(new Set(opts).size, 4, `${q.id} options distinct in ${l}`);
    }
  }
});
test('PR3 Chinese text really is Chinese and Malay text is not copied from English', () => {
  for (const q of BANK) {
    assert.match(q.q.zh, /[一-鿿]/, q.id);
    assert.match(q.explain.zh, /[一-鿿]/, q.id);
    assert.notEqual(q.q.bm, q.q.en, q.id);
    assert.notEqual(q.explain.bm, q.explain.en, q.id);
  }
});
test('PR4 questions with a number carry a source and checked date', () => {
  const numeric = BANK.filter(q => q.numeric);
  assert.ok(numeric.length >= 1);
  for (const q of numeric) { assert.ok(q.source && q.source.length > 5, q.id); assert.equal(q.checked, '2026-10', q.id); }
  // any question or explanation containing a digit must be marked numeric
  for (const q of BANK) {
    const text = [q.q.en, q.explain.en, ...q.options.map(o => o.en)].join(' ');
    if (/\d/.test(text.replace(/\b(19|20)\d\d\b/g, ''))) assert.ok(q.numeric, `${q.id} contains a number but is not marked numeric`);
  }
});
test('PR5 the correct answer moves around (not always the same position)', () => {
  const positions = new Set(BANK.map(q => q.correct));
  assert.equal(positions.size, 4);
});
test('PR6 a seeded round is repeatable and has 10 unique questions', () => {
  const a = makeRound(12345), b = makeRound(12345);
  assert.equal(a.length, ROUND_SIZE);
  assert.deepEqual(a.map(r => r.q.id), b.map(r => r.q.id));
  assert.deepEqual(a.map(r => r.order), b.map(r => r.order));
  assert.equal(new Set(a.map(r => r.q.id)).size, ROUND_SIZE);
  assert.notDeepEqual(makeRound(1).map(r => r.q.id), makeRound(2).map(r => r.q.id));
});
test('PR7 option order is a permutation and correctPosition points at the right text', () => {
  for (let seed = 1; seed <= 30; seed++) for (const r of makeRound(seed)) {
    assert.deepEqual([...r.order].sort(), [0, 1, 2, 3]);
    assert.ok(isCorrect(r, correctPosition(r)));
    assert.equal(r.order[correctPosition(r)], r.q.correct);
  }
});
test('PR8 scoring gives 1 point per right answer, 0 for wrong or unanswered', () => {
  const round = makeRound(7);
  const allRight = round.map(correctPosition);
  assert.equal(scoreRound(round, allRight), 10);
  const allWrong = round.map(r => (correctPosition(r) + 1) % 4);
  assert.equal(scoreRound(round, allWrong), 0);
  const mixed = round.map((r, i) => (i < 4 ? correctPosition(r) : i < 6 ? null : (correctPosition(r) + 2) % 4));
  assert.equal(scoreRound(round, mixed), 4);
});
test('PR9 a smaller bank still gives a round without repeats', () => {
  const r = makeRound(3, BANK.slice(0, 6));
  assert.equal(r.length, 6);
  assert.equal(new Set(r.map(x => x.q.id)).size, 6);
});
