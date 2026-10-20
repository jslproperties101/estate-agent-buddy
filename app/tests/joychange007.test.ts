// JoyChange007 (Batch 5): House Shopping tracking rules — thinning, road-snap batches, continue, area name.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { thinPoints, nextSnapBatch, mergeSnapped, continued, areaFromProperties, displayPath, MIN_STEP_M, SNAP_BATCH, SNAP_OVERLAP, addPoint, newJourney } from '../src/domain/journey';
import { snapToRoads } from '../src/gps/roads';

// A straight road north: one point every 10 m (1 degree of latitude ≈ 111,195 m).
const line = (n: number, step = 10) => Array.from({ length: n }, (_, i) => ({ lat: 3 + (i * step) / 111195, lng: 101.7, acc: 5, t: i * 1000 }));

test('T7-1 moves under about 10 m are not new points', () => {
  assert.equal(MIN_STEP_M, 10);
  let j = newJourney('j', 0);
  j = addPoint(j, { lat: 3, lng: 101.7, acc: 5, t: 0 }).journey;
  assert.equal(addPoint(j, { lat: 3 + 6 / 111195, lng: 101.7, acc: 5, t: 5000 }).result, 'jitter');
  assert.equal(addPoint(j, { lat: 3 + 12 / 111195, lng: 101.7, acc: 5, t: 5000 }).result, 'added');
});
test('T7-2 thinning keeps about one point every 45 m on a straight road, plus first and last', () => {
  const pts = line(101);   // 1 km
  const t = thinPoints(pts);
  assert.equal(t[0], pts[0]); assert.equal(t[t.length - 1], pts[100]);
  assert.ok(t.length >= 20 && t.length <= 25, `${t.length} points for 1 km`);
});
test('T7-3 a turn is kept even when it is closer than 45 m', () => {
  const pts = [...line(5), ...[1, 2, 3, 4].map(i => ({ lat: 3 + 40 / 111195, lng: 101.7 + (i * 10) / 111000, acc: 5, t: 10000 + i }))];
  const t = thinPoints(pts);
  assert.ok(t.includes(pts[4]), 'the corner is kept');
});
test('T7-4 batches: nothing until 100 points, then 100; the next batch repeats 3 for joining; Stop sends the rest', () => {
  const t = Array.from({ length: 150 }, (_, i) => i);
  assert.equal(nextSnapBatch(t.slice(0, 99), 0), null);
  const b1 = nextSnapBatch(t, 0)!;
  assert.equal(b1.from, 0); assert.equal(b1.points.length, SNAP_BATCH);
  assert.equal(nextSnapBatch(t, 100), null, 'not a full batch yet');
  const last = nextSnapBatch(t, 100, true)!;
  assert.equal(last.from, 100 - SNAP_OVERLAP); assert.equal(last.points.length, 53);
  assert.equal(nextSnapBatch(t, 150, true), null, 'nothing left');
});
test('T7-5 joining snapped pieces drops the repeated overlap', () => {
  const prev = [{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }];
  const batch = [{ lat: 1.9, lng: 1.9, originalIndex: 0 }, { lat: 2, lng: 2, originalIndex: 2 }, { lat: 2.5, lng: 2.5 }, { lat: 3, lng: 3, originalIndex: 3 }];
  assert.deepEqual(mergeSnapped(prev, batch, 3), [...prev, { lat: 2.5, lng: 2.5 }, { lat: 3, lng: 3 }]);
  assert.deepEqual(mergeSnapped([], batch, 0).length, 4);
});
test('T7-6 continue: same journey records again and the break is not counted', () => {
  const j = { ...newJourney('j', 0), status: 'saved' as const, endedAt: 60_000, pausedMs: 5_000 };
  const c = continued(j, 600_000);
  assert.equal(c.status, 'recording'); assert.equal(c.endedAt, undefined);
  assert.equal(c.pausedMs, 5_000 + 540_000);
});
test('T7-7 area name: nearest saved property within 1.5 km (neighbourhood, else township, else town), no Google call', () => {
  const pts = line(3);
  const props = [
    { lat: 3.0005, lng: 101.7, township: 'Kota Seriemas', neighborhood: 'Laman Kemboja' },
    { lat: 3.0009, lng: 101.7, city: 'Nilai' },
    { lat: 3.2, lng: 101.7, neighborhood: 'Far Away' },
  ];
  assert.equal(areaFromProperties(pts, props), 'Laman Kemboja');
  assert.equal(areaFromProperties(pts, [props[2]]), undefined);
});
test('T7-8 the drawn line: snapped road first, then GPS points not yet snapped', () => {
  const points = line(300);
  const thinnedCount = 20;   // 300 points (3 km) thin to about 67
  const j = { points, snapped: [{ lat: 9, lng: 9 }], snapDone: thinnedCount };
  const d = displayPath(j);
  assert.deepEqual(d[0], { lat: 9, lng: 9 });
  assert.ok(d.length > 1 && d.length < points.length, 'the snapped part replaces its raw points');
  assert.equal(displayPath({ points, snapDone: 0 }), points);
});
test('T7-9 snapToRoads asks with interpolate=true and up to 100 points; reads snapped points', async () => {
  let asked = '';
  const fake = (async (url: string) => { asked = url; return { ok: true, json: async () => ({ snappedPoints: [{ location: { latitude: 3, longitude: 101 }, originalIndex: 0 }, { location: { latitude: 3.1, longitude: 101.1 } }] }) }; }) as unknown as typeof fetch;
  const r = await snapToRoads('KEY', [{ lat: 3, lng: 101 }, { lat: 3.1, lng: 101.1 }], fake);
  assert.match(asked, /^https:\/\/roads\.googleapis\.com\/v1\/snapToRoads\?interpolate=true&path=/);
  assert.deepEqual(r, [{ lat: 3, lng: 101, originalIndex: 0 }, { lat: 3.1, lng: 101.1, originalIndex: undefined }]);
  const bad = (async () => ({ ok: false, status: 403 })) as unknown as typeof fetch;
  await assert.rejects(snapToRoads('KEY', [{ lat: 3, lng: 101 }, { lat: 3.1, lng: 101.1 }], bad));
});
