// Stage 6: Photo Studio — pixel operations (enhance, privacy masks, straighten fit) and how results are saved into a property.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adjust, applyMask, applyMasks, autoLevels, clampRect, editKind, fitSize, isEnhanced, isTiny, NO_ENHANCE, rectFrom, sharpen, straightenFit, type Pixels } from '../src/lib/photoOps';
import { addEditedCopy, copyName, replaceOriginal } from '../src/domain/photoStudio';
import { photoStrings } from '../src/photos/strings';
import type { Listing } from '../src/listing/model';

const make = (w: number, h: number, f: (x: number, y: number) => [number, number, number]): Pixels => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const [r, g, b] = f(x, y); const i = (y * w + x) * 4; data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255; }
  return { data, width: w, height: h };
};
const px = (p: Pixels, x: number, y: number) => { const i = (y * p.width + x) * 4; return [p.data[i], p.data[i + 1], p.data[i + 2]]; };

test('PH1 auto brightness stretches a dull picture to the full range, and leaves a full-range or flat one alone', () => {
  const dull = make(40, 40, (x) => { const v = 80 + Math.round((x / 39) * 80); return [v, v, v]; });
  const out = autoLevels(dull);
  const row = Array.from({ length: 40 }, (_, x) => px(out, x, 0)[0]);
  assert.ok(Math.min(...row) <= 10, `darkest ${Math.min(...row)}`);
  assert.ok(Math.max(...row) >= 245, `brightest ${Math.max(...row)}`);
  assert.deepEqual(Array.from(dull.data.slice(0, 4)), [80, 80, 80, 255], 'the input picture is not changed');
  const full = make(40, 40, (x) => [Math.round((x / 39) * 255), Math.round((x / 39) * 255), Math.round((x / 39) * 255)]);
  assert.equal(autoLevels(full), full);
  const flat = make(10, 10, () => [120, 120, 120]);
  assert.equal(autoLevels(flat), flat);
});

test('PH2 brightness, contrast and colour: zero changes nothing; each does what it says; grey stays grey', () => {
  const p = make(2, 1, (x) => (x === 0 ? [100, 120, 140] : [200, 50, 50]));
  assert.equal(adjust(p, { brightness: 0, contrast: 0, colour: 0 }), p);
  assert.ok(px(adjust(p, { brightness: 50, contrast: 0, colour: 0 }), 0, 0)[0] > 100);
  assert.ok(px(adjust(p, { brightness: -50, contrast: 0, colour: 0 }), 0, 0)[0] < 100);
  const hi = adjust(p, { brightness: 0, contrast: 60, colour: 0 });
  assert.ok(px(hi, 1, 0)[0] > 200 && px(hi, 0, 0)[0] < 100, 'contrast pushes light up and dark down');
  const grey = adjust(p, { brightness: 0, contrast: 0, colour: -100 });
  const [r, g, b] = px(grey, 1, 0);
  assert.ok(Math.abs(r - g) <= 1 && Math.abs(g - b) <= 1, `fully de-coloured: ${r},${g},${b}`);
  const same = make(3, 3, () => [90, 90, 90]);
  const [a, b2, c] = px(adjust(same, { brightness: 0, contrast: 0, colour: 80 }), 1, 1);
  assert.ok(a === b2 && b2 === c, 'colour on a grey picture keeps it grey');
  assert.ok(adjust(make(1, 1, () => [250, 250, 250]), { brightness: 100, contrast: 100, colour: 0 }).data[0] <= 255, 'values stay in range');
});

test('PH3 clarity sharpens an edge and amount 0 changes nothing', () => {
  const edge = make(9, 9, (x) => (x < 4 ? [80, 80, 80] : [160, 160, 160]));
  assert.equal(sharpen(edge, 0), edge);
  const s = sharpen(edge, 80);
  assert.ok(px(s, 3, 4)[0] < 80 && px(s, 4, 4)[0] > 160, 'the dark side gets darker and the light side lighter at the edge');
  assert.equal(px(s, 1, 4)[0], 80, 'flat areas are unchanged');
});

test('PH4 a solid privacy mask covers exactly the chosen area for good: the same result whatever was underneath, nothing outside changes', () => {
  const a = make(20, 20, (x, y) => [x * 10, y * 10, 5]);
  const b = make(20, 20, () => [255, 255, 255]);
  const m = { x: 0.25, y: 0.25, w: 0.5, h: 0.5, mode: 'solid' as const };
  const ma = applyMask(a, m), mb = applyMask(b, m);
  for (let y = 5; y < 15; y++) for (let x = 5; x < 15; x++) {
    assert.deepEqual(px(ma, x, y), [20, 20, 20]);
    assert.deepEqual(px(ma, x, y), px(mb, x, y), 'what was under the mask leaves no trace');
  }
  assert.deepEqual(px(ma, 4, 10), px(a, 4, 10)); assert.deepEqual(px(ma, 15, 10), px(a, 15, 10)); assert.deepEqual(px(ma, 10, 4), px(a, 10, 4)); assert.deepEqual(px(ma, 10, 15), px(a, 10, 15));
  assert.deepEqual(px(a, 10, 10), [100, 100, 5], 'the input picture is not modified');
});

test('PH5 coarse-block mask turns fine detail (like printed digits) into a few flat blocks', () => {
  const stripes = make(60, 30, (x) => (x % 2 ? [0, 0, 0] : [255, 255, 255]));
  const out = applyMask(stripes, { x: 0, y: 0, w: 1, h: 1, mode: 'pixelate' });
  const values = new Set<number>();
  for (let y = 0; y < 30; y++) for (let x = 0; x < 60; x++) values.add(px(out, x, y)[0]);
  assert.ok(values.size <= 12, `only a few flat colours remain, got ${values.size}`);
  const blockOf = (x: number, y: number) => px(out, x, y).join();
  assert.equal(blockOf(0, 0), blockOf(1, 0), 'neighbouring stripes are averaged together');
});

test('PH6 several masks apply one after the other; a mask partly outside the picture is clipped; an empty one does nothing', () => {
  const p = make(10, 10, () => [200, 200, 200]);
  const out = applyMasks(p, [{ x: 0, y: 0, w: 0.2, h: 0.2, mode: 'solid' }, { x: 0.9, y: 0.9, w: 0.5, h: 0.5, mode: 'solid' }]);
  assert.deepEqual(px(out, 0, 0), [20, 20, 20]); assert.deepEqual(px(out, 9, 9), [20, 20, 20]); assert.deepEqual(px(out, 5, 5), [200, 200, 200]);
  assert.equal(applyMask(p, { x: 0.5, y: 0.5, w: 0, h: 0.3, mode: 'solid' }), p);
  assert.deepEqual(clampRect({ x: -1, y: 0.5, w: 3, h: 3 }), { x: 0, y: 0.5, w: 1, h: 0.5 });
});

test('PH7 drawing a rectangle: corners in any order, stray taps are ignored', () => {
  assert.deepEqual(rectFrom(0.6, 0.7, 0.2, 0.3), { x: 0.2, y: 0.3, w: 0.39999999999999997, h: 0.39999999999999997 });
  assert.equal(isTiny(rectFrom(0.5, 0.5, 0.505, 0.9)), true);
  assert.equal(isTiny(rectFrom(0.1, 0.1, 0.4, 0.3)), false);
});

test('PH8 straighten: the crop that removes empty corners always fits inside the turned picture, and 0° keeps everything', () => {
  assert.deepEqual(straightenFit(1600, 1200, 0), { w: 1600, h: 1200 });
  for (const deg of [0.5, 2, 5, 10, -3, -10]) for (const [w, h] of [[1600, 1200], [1200, 1600], [1000, 1000]] as const) {
    const f = straightenFit(w, h, deg);
    assert.ok(f.w <= w && f.h <= h && f.w > 0 && f.h > 0);
    // corners of the fitted rectangle, turned back into the original picture's frame, must lie inside it
    const a = (deg * Math.PI) / 180;
    for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const x = (sx * f.w) / 2, y = (sy * f.h) / 2;
      const rx = x * Math.cos(a) - y * Math.sin(a), ry = x * Math.sin(a) + y * Math.cos(a);
      assert.ok(Math.abs(rx) <= w / 2 + 0.5 && Math.abs(ry) <= h / 2 + 0.5, `${w}x${h} @ ${deg}°: corner ${rx.toFixed(1)},${ry.toFixed(1)} outside`);
    }
  }
  assert.ok(straightenFit(1600, 1200, 10).w < straightenFit(1600, 1200, 2).w, 'more tilt, smaller picture');
});

test('PH9 sizes never enlarge; the saved label says what was done', () => {
  assert.deepEqual(fitSize(4000, 3000, 1800), { w: 1800, h: 1350 });
  assert.deepEqual(fitSize(800, 600, 1800), { w: 800, h: 600 });
  assert.equal(editKind(true, false), 'enhanced'); assert.equal(editKind(false, true), 'masked'); assert.equal(editKind(true, true), 'both'); assert.equal(editKind(false, false), undefined);
  assert.equal(isEnhanced(NO_ENHANCE), false); assert.equal(isEnhanced({ ...NO_ENHANCE, clarity: 5 }), true);
});

const listing = (): Listing => ({
  id: 'p1', created: 1, updated: 1, documents: [], ref: 'P1', mainPhotoId: 'ph1',
  photos: [{ id: 'ph1', fileId: 'f1', name: 'front.jpg' }, { id: 'ph2', fileId: 'f2', name: 'kitchen.jpg' }, { id: 'ph3', url: 'data:image/svg+xml,x', name: 'Sample picture', sample: true }],
} as Listing);

test('PH10 save as new photo: the original and every other photo stay exactly as they were; the copy sits next to the original and is labelled', () => {
  const l = listing();
  const words = photoStrings.en.copyWords;
  const out = addEditedCopy(l, 'ph1', { id: 'n1', fileId: 'f9', name: copyName('front.jpg', 'masked', words), bytes: 123, kind: 'masked' }, 50);
  assert.deepEqual(out.photos.map(p => p.id), ['ph1', 'n1', 'ph2', 'ph3']);
  assert.deepEqual(out.photos[0], l.photos[0], 'original untouched');
  assert.deepEqual(out.photos[2], l.photos[1]);
  assert.equal(out.mainPhotoId, 'ph1', 'the main photo does not switch to the edit');
  assert.deepEqual(out.photos[1], { id: 'n1', fileId: 'f9', name: 'front.jpg (privacy-masked)', bytes: 123, edit: 'masked', editedFrom: 'ph1' });
  assert.equal(out.history![0].source, 'form');
  assert.equal(l.photos.length, 3, 'the input record is not modified');
});

test('PH11 replacing the original is explicit: the file is swapped and the old file id is handed back for deletion; sample pictures cannot be replaced', () => {
  const l = listing();
  const r = replaceOriginal(l, 'ph2', 'f10', 'enhanced', 99, 60)!;
  assert.equal(r.oldFileId, 'f2');
  assert.equal(r.listing.photos[1].fileId, 'f10');
  assert.equal(r.listing.photos[1].edit, 'enhanced');
  assert.equal(r.listing.photos[1].id, 'ph2');
  assert.equal(r.listing.photos.length, 3);
  assert.equal(replaceOriginal(l, 'ph3', 'f10', 'enhanced', 1, 60), undefined);
  assert.equal(replaceOriginal(l, 'nope', 'f10', 'enhanced', 1, 60), undefined);
});

test('PH12 editing a copy again does not stack labels', () => {
  const w = photoStrings.en.copyWords;
  assert.equal(copyName('front.jpg (enhanced)', 'masked', w), 'front.jpg (privacy-masked)');
  assert.equal(copyName('front.jpg (privacy-masked)', 'both', w), 'front.jpg (enhanced + masked)');
});

test('PH13 Photo Studio text exists in all three languages; privacy wording never claims automatic detection', () => {
  const shape = (v: unknown): unknown => (typeof v === 'function' ? 'fn' : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shape(x)])) : typeof v);
  assert.deepEqual(shape(photoStrings.bm), shape(photoStrings.en));
  assert.deepEqual(shape(photoStrings.zh), shape(photoStrings.en));
  assert.match(photoStrings.en.maskWarning, /Nothing is detected automatically/);
  assert.match(photoStrings.bm.maskWarning, /Tiada apa dikesan secara automatik/);
  assert.match(photoStrings.zh.maskWarning, /不会自动检测/);
  for (const l of ['en', 'bm', 'zh'] as const) assert.doesNotMatch(JSON.stringify(photoStrings[l]), /automatically (removed|hidden|blurred)|auto-detect(ed)? and/i);
  assert.match(photoStrings.en.declutter, /not available/);
});
