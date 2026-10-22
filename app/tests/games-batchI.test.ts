// v1buddychange015 (Batch I): rules of Buddy Walk: Streets, Viewing Rush, Open House Tour and Match the Buyer,
// and the 3D maths they share (tapping things, walking into walls, the direction arrow).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rayBox, raySphere, pushOut, relAngle, rng, forward, trs, mul, invert, perspective, lookAt } from '../src/games/gl3d/math';
import { streetListing, newBuyer, newListing, misses, PTYPES } from '../src/games/sample';
import { pointsFor as streetPoints, MAX_SCORE as STREET_MAX } from '../src/games/buddyStreets/game';
import { nextViewing, viewingPoints, BLOCK, ROAD } from '../src/games/viewingRush/logic';
import { FEATURES, newTourBuyer, showFeature, WRONG_PENALTY, HAPPY_BONUS_SECONDS } from '../src/games/openHouse/logic';
import { pointsFor as matchPoints, missText } from '../src/games/matchBuyer';
import { bsStrings } from '../src/games/buddyStreets/strings';
import { vrStrings } from '../src/games/viewingRush/strings';
import { ohStrings } from '../src/games/openHouse/strings';
import { mbStrings } from '../src/games/matchBuyer/strings';

const close = (a: number, b: number, eps = 1e-5) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('B1 ray tests: a ray hits a ball and a box at the right distance and misses when aimed away', () => {
  close(raySphere([0, 0, 0], [0, 0, -1], [0, 0, -5], 1), 4);
  assert.equal(raySphere([0, 0, 0], [0, 0, 1], [0, 0, -5], 1), -1);
  close(rayBox([0, 1, 0], [1, 0, 0], [3, 0, -1, 4, 2, 1]), 3);
  assert.equal(rayBox([0, 5, 0], [1, 0, 0], [3, 0, -1, 4, 2, 1]), -1);
  assert.equal(raySphere([0, 0, -5], [0, 0, -1], [0, 0, -5], 1), 0, 'standing inside the tap area still counts');
});

test('B2 walking into a wall stops at the wall; walking beside it does not', () => {
  const p = { x: 0.9, z: 0 };
  assert.ok(pushOut(p, 0.5, [[1, 3, -1, 1]]));
  close(p.x, 0.5);
  const q = { x: 0, z: 5 };
  assert.equal(pushOut(q, 0.5, [[1, 3, -1, 1]]), false);
  assert.deepEqual(q, { x: 0, z: 5 });
});

test('B3 the direction arrow: straight ahead is 0, to the right is positive, behind is ±π', () => {
  close(relAngle(0, 0, -10), 0);
  assert.ok(relAngle(0, 10, 0) > 0);
  close(Math.abs(relAngle(0, 0, 10)), Math.PI);
  const f = forward(Math.PI / 2);
  close(f[0], -1); close(f[2], 0);
});

test('B4 camera maths: a point in front of the camera lands in the middle of the screen', () => {
  const vp = mul(perspective(1.2, 1, 0.1, 100), lookAt([0, 1.7, 0], [0, 1.7, -1]));
  const p = [0, 1.7, -10, 1];
  const x = vp[0] * p[0] + vp[4] * p[1] + vp[8] * p[2] + vp[12], y = vp[1] * p[0] + vp[5] * p[1] + vp[9] * p[2] + vp[13], w = vp[3] * p[0] + vp[7] * p[1] + vp[11] * p[2] + vp[15];
  close(x / w, 0); close(y / w, 0);
  const inv = invert(vp)!, back = mul(vp, inv);
  for (let i = 0; i < 16; i++) close(back[i], i % 5 === 0 ? 1 : 0, 1e-3);
  const m = trs(1, 2, 3, Math.PI / 2, 2, 1, 1);
  close(m[12], 1); close(m[13], 2); close(m[14], 3);
});

test('B5 Streets: each sign always shows the same listing with three different prices, one of them right', () => {
  for (const id of ['0_0', '3_-2', '-7_11', '42_5']) {
    const a = streetListing(id), b = streetListing(id);
    assert.deepEqual(a, b, 'same sign, same listing');
    assert.equal(a.options.length, 3);
    assert.equal(new Set(a.options).size, 3, 'no duplicate choices');
    assert.equal(a.options.filter(x => x === a.price).length, 1);
    assert.deepEqual([...a.options].sort((x, y) => x - y), a.options, 'cheapest first');
    assert.ok(a.price >= 10_000 && a.size > 0 && a.beds >= 1);
  }
  assert.equal(streetPoints(0), 100); assert.equal(streetPoints(3), 175);
  assert.equal(STREET_MAX, 2500);
});

test('B6 Match the Buyer: every listing either fits the brief or misses exactly one need', () => {
  const r = rng(2026);
  let fits = 0, total = 0;
  for (let k = 0; k < 40; k++) {
    const b = newBuyer(r);
    assert.notEqual(b.areas[0], b.areas[1]);
    for (let i = 0; i < 20; i++) {
      const L = newListing(r, b), m = misses(b, L);
      assert.ok(m.length <= 1, JSON.stringify({ b: { ...b, type: b.type?.id }, L: { ...L, type: L.type.id }, m }));
      total++; if (m.length === 0) fits++;
    }
  }
  assert.ok(fits / total > 0.3 && fits / total < 0.7, `about half fit (${fits}/${total})`);
  assert.equal(matchPoints(0), 100); assert.equal(matchPoints(2), 140);
});

test('B7 Match the Buyer: the reason for a miss is written in each language', () => {
  const b = { name: 'Mr Tan', areas: ['Cheras', 'Ampang'] as [string, string], type: PTYPES[0], minBeds: 3, budget: 600_000 };
  const L = { no: 1, area: 'Cheras', type: PTYPES[0], beds: 3, price: 640_000, seed: 1 };
  const m = misses(b, L);
  assert.deepEqual(m, [{ k: 'price', over: 40_000 }]);
  assert.equal(missText('en', m[0]), 'Over budget by RM 40,000');
  assert.match(missText('bm', m[0]), /Melebihi bajet/);
  assert.match(missText('zh', m[0]), /超出预算/);
  assert.deepEqual(misses(b, { ...L, price: 600_000 }), [], 'exactly at budget fits');
});

test('B8 Viewing Rush: the next viewing is on a road, at least 2 blocks away, and arriving fast earns a bonus', () => {
  const r = rng(7);
  for (let i = 0; i < 200; i++) {
    const cx = (r() - 0.5) * 400, cz = (r() - 0.5) * 400, v = nextViewing(r, cx, cz);
    const lx = ((v.x % BLOCK) + BLOCK) % BLOCK, lz = ((v.z % BLOCK) + BLOCK) % BLOCK;
    assert.ok(lx < ROAD || lz < ROAD, 'on a road');
    const blocks = Math.abs(Math.floor(v.x / BLOCK) - Math.floor(cx / BLOCK)) + Math.abs(Math.floor(v.z / BLOCK) - Math.floor(cz / BLOCK));
    assert.ok(blocks >= 2, 'not in the next block');
    assert.ok(v.par > 4);
  }
  assert.deepEqual(viewingPoints(20, 15), { base: 100, bonus: 50 });
  assert.deepEqual(viewingPoints(20, 30), { base: 100, bonus: 0 });
});

test('B9 Open House: right features score, a wrong one costs 5 s, showing twice does nothing, all three = happy buyer', () => {
  const b = newTourBuyer(rng(3), 0);
  assert.equal(b.want.length, 3); assert.equal(new Set(b.want).size, 3);
  const wrong = FEATURES.map(f => f.id).find(id => !b.want.includes(id))!;
  assert.deepEqual(showFeature(b, wrong, 1), { k: 'wrong', seconds: WRONG_PENALTY });
  assert.deepEqual(showFeature(b, wrong, 2), { k: 'already' });
  assert.deepEqual(showFeature(b, b.want[0], 3), { k: 'right', points: 100 });
  assert.deepEqual(showFeature(b, b.want[1], 4), { k: 'right', points: 100 });
  const last = showFeature(b, b.want[2], 10);
  assert.equal(last.k, 'happy');
  if (last.k === 'happy') { assert.equal(last.seconds, HAPPY_BONUS_SECONDS); assert.equal(last.bonus, 150); }
});

test('B10 every new game has its words in English, Bahasa Malaysia and Chinese', () => {
  for (const S of [bsStrings, vrStrings, ohStrings, mbStrings] as Record<string, Record<string, unknown>>[]) {
    const keys = Object.keys(S.en);
    for (const l of ['bm', 'zh']) for (const k of keys) assert.ok(S[l][k] !== undefined && S[l][k] !== '', `${l}.${k}`);
  }
  for (const id of FEATURES.map(f => f.id)) for (const l of ['en', 'bm', 'zh'] as const) assert.ok(ohStrings[l].f[id], `${l} feature ${id}`);
});
