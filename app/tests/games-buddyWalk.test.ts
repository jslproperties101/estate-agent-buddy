// v1buddychange014: Buddy Walk - the gallery, walking into walls, which listing is in front, visits, the 60-second clock
// (one onFinish only), the 3D drawing, and which listings hang in the gallery.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWorld, startPlayer, move, nudge, walk, facingPanel, updateVisits, dwellProgress, NO_VISITS, newClock, tick, timeUp, secondsLeft,
  roundResult, once, castRay, cellAt, free, panelRow, DWELL, RADIUS, MAX_PANELS, PANEL0, WALL, END, FLOOR, NUDGE_TURN, type Player, type Visits,
} from '../src/games/buddyWalk/engine';
import { renderFrame, VIEW_W, VIEW_H, rgb, type Texture } from '../src/games/buddyWalk/render';
import { walkListings, listingFacts } from '../src/games/buddyWalk/listings';
import { bwStrings } from '../src/games/buddyWalk/strings';
import { houseKind } from '../src/games/buddyWalk/textures';
import type { Listing } from '../src/listing/model';
import { listingStrings } from '../src/listing/strings';
import type { AppState } from '../src/data/types';

const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;
const keys = (o: object) => Object.keys(o).sort();

test('BW1 the gallery: listings hang in facing pairs every second row, inside walls, with an end wall at each end', () => {
  const w = buildWorld(10);
  assert.equal(w.w, 4); assert.equal(w.h, 13);
  assert.equal(w.panels.length, 10);
  assert.deepEqual(w.panels.slice(0, 4).map(p => [p.side, p.cx, p.cy]), [['left', 0, 2], ['right', 3, 2], ['left', 0, 4], ['right', 3, 4]]);
  for (const p of w.panels) assert.equal(cellAt(w, p.cx + 0.5, p.cy + 0.5), PANEL0 + p.index);
  for (let y = 1; y < w.h - 1; y++) for (const x of [1, 2]) assert.equal(cellAt(w, x + 0.5, y + 0.5), FLOOR);
  for (const x of [0, 1, 2, 3]) { assert.equal(cellAt(w, x + 0.5, 0.5), END); assert.equal(cellAt(w, x + 0.5, w.h - 0.5), END); }
  assert.equal(cellAt(w, -1, 5), WALL, 'outside the map counts as wall');
  assert.equal(buildWorld(1).h, 5); assert.equal(buildWorld(0).panels.length, 0);
  assert.equal(buildWorld(MAX_PANELS + 50).panels.length, MAX_PANELS, 'a huge list is capped');
  assert.equal(panelRow(0), 2); assert.equal(panelRow(3), 4);
});

test('BW2 walking: forward follows the facing direction, walls stop the body, and the body slides along a wall', () => {
  const w = buildWorld(4);
  const p0 = startPlayer();
  assert.ok(free(w, p0.x, p0.y), 'the start point is free');
  const p1 = move(p0, { fwd: 1, turn: 0 }, 0.1, w);
  assert.ok(near(p1.x, p0.x) && p1.y > p0.y, 'forward is down the corridor');
  // Walk forward for 10 seconds: the end wall stops the agent one body-radius before it.
  let p: Player = p0;
  for (let i = 0; i < 600; i++) p = move(p, { fwd: 1, turn: 0 }, 1 / 60, w);
  assert.ok(p.y <= w.h - 1 - RADIUS + 1e-9 && p.y > w.h - 1 - RADIUS - 0.05, `stopped at the end wall (${p.y})`);
  // Walk at 45 degrees into the left wall: x stops at the wall, y keeps going (sliding).
  let q: Player = { x: 2, y: 2, a: Math.PI * 0.75 };
  for (let i = 0; i < 60; i++) q = move(q, { fwd: 1, turn: 0 }, 1 / 60, w);
  assert.ok(near(q.x, 1 + RADIUS, 0.05), `held off the left wall (${q.x})`);
  assert.ok(q.y > 2.5, 'slid along the wall');
  // Backwards from the start never goes through the start wall.
  let b: Player = p0;
  for (let i = 0; i < 120; i++) b = move(b, { fwd: -1, turn: 0 }, 1 / 60, w);
  assert.ok(b.y >= 1 + RADIUS - 1e-9);
});

test('BW3 turning and slow frames: left turns raise the angle, a long frame is capped so nobody jumps through a wall', () => {
  const w = buildWorld(2);
  const p0 = startPlayer();
  assert.ok(move(p0, { fwd: 0, turn: 1 }, 0.1, w).a > p0.a);
  assert.ok(move(p0, { fwd: 0, turn: -1 }, 0.1, w).a < p0.a);
  const big = move(p0, { fwd: 1, turn: 0 }, 5, w);
  const capped = move(p0, { fwd: 1, turn: 0 }, 0.1, w);
  assert.ok(near(big.y, capped.y), 'a 5-second frame moves no further than a 0.1-second one');
  const turned = nudge(nudge(p0, 'left', w), 'right', w);
  assert.ok(near(turned.a, p0.a));
  assert.ok(near(nudge(p0, 'left', w).a - p0.a, NUDGE_TURN));
  assert.ok(near(walk(p0, 0.5, w).y, p0.y + 0.5));
});

test('BW4 which listing is "in front": walk two steps, turn left to face listing 1, turn right to face listing 2', () => {
  const w = buildWorld(4);
  const p0 = startPlayer();
  assert.equal(facingPanel(p0, w), -1, 'nothing in front at the start');
  let p = nudge(nudge(p0, 'fwd', w), 'fwd', w);
  assert.equal(facingPanel(p, w), -1, 'looking down the corridor, the side frames are not "in front"');
  let l = p; for (let i = 0; i < 6; i++) l = nudge(l, 'left', w);
  assert.equal(facingPanel(l, w), 0, 'left wall: listing 0');
  let r = p; for (let i = 0; i < 6; i++) r = nudge(r, 'right', w);
  assert.equal(facingPanel(r, w), 1, 'right wall: listing 1');
  // Too far away: further down the corridor facing the same wall, listing 0 is out of reach.
  const far: Player = { x: 2.75, y: 2.5, a: Math.PI };
  assert.equal(facingPanel(far, w), -1, 'too far from the left frame');
  // Two rows further, the next pair.
  const p2: Player = { x: 1.6, y: 4.5, a: Math.PI };
  assert.equal(facingPanel(p2, w), 2);
});

test('BW5 visits: staying in front for the dwell time counts a listing once; turning away resets the wait', () => {
  let v: Visits = NO_VISITS;
  let r = updateVisits(v, 0, DWELL / 2); v = r.visits;
  assert.equal(r.newly, -1); assert.ok(near(dwellProgress(v), 0.5));
  r = updateVisits(v, -1, 0.1); v = r.visits;
  assert.equal(v.dwell, 0, 'turned away');
  r = updateVisits(v, 0, DWELL / 2); v = r.visits;
  assert.equal(r.newly, -1, 'the wait started again');
  r = updateVisits(v, 0, DWELL / 2 + 0.01); v = r.visits;
  assert.equal(r.newly, 0); assert.deepEqual(v.visited, [0]); assert.equal(dwellProgress(v), 1);
  r = updateVisits(v, 0, 5); v = r.visits;
  assert.equal(r.newly, -1, 'never counted twice'); assert.deepEqual(v.visited, [0]);
  r = updateVisits(v, 1, DWELL); v = r.visits;
  assert.equal(r.newly, 1, 'switching straight to another listing starts its own wait');
  assert.deepEqual(v.visited, [0, 1]);
  r = updateVisits(v, 1, -3); assert.ok(r.visits.dwell >= 0, 'a negative time step is ignored');
});

test('BW6 the 60-second clock: ends at 60 s, long gaps add at most one second, seconds shown round up', () => {
  let c = newClock();
  assert.equal(secondsLeft(c), 60); assert.equal(timeUp(c), false);
  c = tick(c, 250); assert.equal(secondsLeft(c), 60);
  c = tick(c, 30_000); assert.equal(c.elapsedMs, 1250, 'a phone asleep for 30 s adds only 1 s');
  for (let i = 0; i < 400 && !timeUp(c); i++) c = tick(c, 250);
  assert.equal(timeUp(c), true); assert.equal(secondsLeft(c), 0); assert.equal(c.elapsedMs, 60_000);
  assert.equal(tick(c, 1000).elapsedMs, 60_000, 'never past the limit');
});

test('BW7 the round ends with exactly one onFinish: time running out, then Finish tapped, still one call', () => {
  const calls: { score: number; maxScore: number }[] = [];
  const finish = once((r: { score: number; maxScore: number }) => calls.push(r));
  let c = newClock(1000);
  let v: Visits = NO_VISITS;
  v = updateVisits(v, 2, DWELL).visits;
  v = updateVisits(v, 0, DWELL).visits;
  for (let i = 0; i < 10; i++) { c = tick(c, 250); if (timeUp(c)) finish(roundResult(v.visited.length, 5)); }
  assert.equal(finish(roundResult(5, 5)), false, 'Finish after time is up does nothing');
  assert.deepEqual(calls, [{ score: 2, maxScore: 5 }]);
  assert.deepEqual(roundResult(0, 0), { score: 0, maxScore: 1 }, 'maxScore at least 1');
  assert.deepEqual(roundResult(9, 3), { score: 3, maxScore: 3 });
});

test('BW8 rays: the distance to the wall ahead, a side wall and a listing frame, without fish-eye', () => {
  const w = buildWorld(2);  // rows 0..4, end walls at 0 and 4, listings 0 and 1 on row 2
  const ahead = castRay(w, 2, 1.3, 0, 1);
  assert.equal(ahead.cell, END); assert.ok(near(ahead.dist, 2.7, 1e-9));
  const left = castRay(w, 2, 2.5, -1, 0);
  assert.equal(left.cell, PANEL0 + 0); assert.ok(near(left.dist, 1)); assert.ok(near(left.wallX, 0.5));
  const right = castRay(w, 2, 2.5, 1, 0);
  assert.equal(right.cell, PANEL0 + 1); assert.ok(near(right.dist, 1));
  const wall = castRay(w, 2, 1.5, -1, 0);
  assert.equal(wall.cell, WALL);
  // A ray to the side of the view direction reports the straight-ahead distance (perpendicular), not the slanted one.
  const slanted = castRay(w, 2, 1.3, 0.5, 1);
  assert.ok(slanted.dist <= 2.7 + 1e-9);
});

test('BW9 the 3D view draws floor, ceiling and walls into the pixel buffer', () => {
  const w = buildWorld(4);
  const solid = (c: number): Texture => ({ w: 64, h: 64, data: new Uint32Array(64 * 64).fill(c) });
  const wallT = solid(rgb(200, 0, 0)), endT = solid(rgb(0, 200, 0)), panT = solid(rgb(0, 0, 200));
  const buf = new Uint32Array(VIEW_W * VIEW_H);
  const ahead = renderFrame(buf, VIEW_W, VIEW_H, startPlayer(), w, c => (c >= PANEL0 ? panT : c === END ? endT : wallT), { highlight: 0 });
  assert.ok(near(ahead, 4.7, 1e-6), 'the far end wall is straight ahead');
  assert.equal(buf.filter(x => x === 0).length, 0, 'every pixel drawn');
  assert.ok(new Set(buf).size > 20, 'many different colours (fog, tiles, lamps)');
  const mid = buf[(VIEW_H >> 1) * VIEW_W + (VIEW_W >> 1)];
  assert.ok(((mid >>> 8) & 255) > ((mid >>> 16) & 255), 'the middle of the view shows the green end wall');
  const side = buf[(VIEW_H >> 1) * VIEW_W + 2];
  assert.ok((side & 255) > 0 || ((side >>> 16) & 255) > 0, 'the left edge shows a side wall or a frame');
});

const L = (x: Partial<Listing>): Listing => ({ id: x.id ?? 'x', created: 1, updated: 1, photos: [], ...x });

test('BW10 the gallery holds the Subsale List default listings: no deleted (archived), no Sold / Rented / Withdrawn', () => {
  const props = [
    L({ id: 'a', status: 'available' }), L({ id: 'b', archived: { at: 1 } }), L({ id: 'c', status: 'sold' }),
    L({ id: 'd', status: 'rented' }), L({ id: 'e', status: 'off_market' }), L({ id: 'f' }), L({ id: 'g', status: 'in_progress', bookedStage: 'pending_loan' }),
  ];
  const state = { properties: props, meta: {} } as unknown as AppState;
  assert.deepEqual(walkListings(state).map(l => l.id), ['a', 'f', 'g']);
});

test('BW11 the gold card: title, type, bedrooms, bathrooms, land, built-up and the price in 3 languages', () => {
  const l = L({ unitNo: 'No. 7', street: 'jalan sampel 1', city: 'Nilai', type: 'Terrace house', purpose: 'sale_or_rent', askingPrice: 650000, monthlyRent: 2200, bedrooms: 4, bathrooms: 3, landSqft: 1650, builtUpSqft: 2200, sample: true });
  const en = listingFacts(l, 'en');
  assert.equal(en.title, 'No. 7, Jalan Sampel 1, Nilai');
  assert.equal(en.type, 'Terrace House');
  assert.deepEqual(en.prices, ['RM 650,000', 'RM 2,200 / month']);
  assert.deepEqual(en.rows.map(r => r.k), ['beds', 'baths', 'land', 'builtUp']);
  assert.equal(en.rows[2].value, '1,650 sq ft'); assert.equal(en.sample, true);
  const bm = listingFacts(l, 'bm'), zh = listingFacts(l, 'zh');
  assert.ok(bm.prices[1].endsWith('/ bulan')); assert.ok(zh.prices[1].endsWith('/ 月'));
  assert.notEqual(bm.rows[0].label, en.rows[0].label);
  const bare = listingFacts(L({ purpose: 'sale' }), 'en');
  assert.deepEqual(bare.prices, [listingStrings.en.noPrice]); assert.equal(bare.title, listingStrings.en.untitled); assert.deepEqual(bare.rows, []);
});

test('BW12 words: English, Bahasa Melayu and Chinese have every phrase; pixel house kinds follow the property type', () => {
  for (const lang of ['bm', 'zh'] as const) assert.deepEqual(keys(bwStrings[lang]), keys(bwStrings.en), lang);
  for (const lang of ['en', 'bm', 'zh'] as const) {
    const s = bwStrings[lang];
    for (const [k, v] of Object.entries(s)) if (typeof v === 'string') assert.ok(v.trim(), `${lang}.${k}`);
    assert.ok(s.canvas(3, 'X').includes('X')); assert.ok(s.visited(1, 3).includes('3')); assert.ok(s.timeLeft(42).includes('42'));
  }
  assert.equal(houseKind('Condo / apartment'), 'tower'); assert.equal(houseKind('Semi-D factory'), 'factory');
  assert.equal(houseKind('Agricultural land'), 'land'); assert.equal(houseKind('Bungalow'), 'house'); assert.equal(houseKind(undefined), 'house');
});
