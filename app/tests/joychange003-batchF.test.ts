// JoyChange003 Batch F rules that need no browser: Changes 75 (A4 photo strip, footer gap), 76 (Details to Show),
// 77 (where downloads go), 78 / 79 (Photo Studio tools, swipe) and 81 (poster styles).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FORMATS, MARKETING_KEYS, buildPosterContent, marketingFields } from '../src/marketing/content';
import { STRIP_MAX, STRIP_ROW, FOOT_GAP, stripGrid, THEMES, PALETTE } from '../src/marketing/render';
import { marketingStrings } from '../src/marketing/strings';
import { mimeOf, goesToGallery } from '../src/lib/pdfRender';
import { photoStrings } from '../src/photos/strings';
import { c11Strings } from '../src/ui/c011Strings';
import type { Listing } from '../src/listing/model';

test('F75-1 the A4 flyer takes the main photo plus up to 8 in the strip, 4 to a row; the portrait post takes up to 4 small ones', () => {
  assert.equal(FORMATS.a4.maxPhotos, 1 + STRIP_MAX);
  assert.equal(STRIP_MAX, 8); assert.equal(STRIP_ROW, 4);
  assert.equal(FORMATS.portrait.maxPhotos, 5);
  assert.deepEqual([stripGrid(3, 1100).cols, stripGrid(3, 1100).rows], [3, 1]);
  assert.deepEqual([stripGrid(4, 1100).cols, stripGrid(4, 1100).rows], [4, 1]);
  assert.deepEqual([stripGrid(6, 1100).cols, stripGrid(6, 1100).rows], [3, 2]);
  assert.deepEqual([stripGrid(8, 1100).cols, stripGrid(8, 1100).rows], [4, 2]);
  const g = stripGrid(8, 1100);
  assert.ok(Math.abs(g.cols * g.tw + (g.cols - 1) * g.gap - 1100) < 0.01, 'the row fills the width');
  assert.ok(FOOT_GAP >= 24, 'a clear gap above the gold footer line');
});

const rec = (o: Partial<Listing> = {}): Listing => ({ id: 'p1', ref: 'P1', type: 'terrace', purpose: 'sale', street: 'Jalan Mawar 3', unitNo: '12', township: 'Taman Indah', city: 'Nilai', state: 'Negeri Sembilan',
  builtUpSqft: 1800, floors: 2, frontageFt: 22, depthFt: 70, photos: [], createdAt: 1, updatedAt: 1, ...o } as unknown as Listing);

test('F76-1 Details to Show offers the address and the size extras, all unticked at first', () => {
  const keys = MARKETING_KEYS.map(k => String(k.key));
  for (const k of ['street', 'unitNo', 'floors', 'frontageFt', 'depthFt', 'ceilingFt', 'powerKva', 'loadingBays']) {
    assert.ok(keys.includes(k), `${k} offered`);
    assert.equal(MARKETING_KEYS.find(m => m.key === k)!.on, false, `${k} unticked at first`);
  }
  const fields = marketingFields(rec(), 'en');
  assert.equal(fields.find(f => f.key === 'street')!.on, false);
});

test('F76-2 a ticked address leads the place line; size extras become facts', () => {
  const l = rec(); const fields = marketingFields(l, 'en');
  const base = Object.fromEntries(fields.filter(f => f.on).map(f => [String(f.key), true]));
  const plain = buildPosterContent({ lang: 'en', listing: l, fields, selected: base });
  assert.ok(!/Jalan Mawar/.test(plain.place ?? ''), 'not unless ticked');
  const c = buildPosterContent({ lang: 'en', listing: l, fields, selected: { ...base, street: true, unitNo: true, floors: true, frontageFt: true }, maxFacts: 12 });
  assert.match(c.place ?? '', /^12, Jalan Mawar 3, Taman Indah, Nilai/);
  assert.ok(c.facts.some(f => f.key === 'floors') && c.facts.some(f => f.key === 'frontageFt'));
});

test('F77-1 pictures go to the Gallery as well as Downloads; PDFs and other files to Downloads only', () => {
  assert.equal(goesToGallery('image/png'), true); assert.equal(goesToGallery('image/jpeg'), true); assert.equal(goesToGallery('image/webp'), true);
  assert.equal(goesToGallery('application/pdf'), false);
  assert.equal(mimeOf(new Blob([]), 'a.pdf'), 'application/pdf');
  assert.equal(mimeOf(new Blob([]), 'P1-square.webp'), 'image/webp');
  assert.equal(mimeOf(new Blob([], { type: 'image/png' }), 'x.bin'), 'image/png');
  for (const l of ['en', 'bm', 'zh'] as const) for (const k of ['savedDownloads', 'savedGallery', 'openFile', 'openFail'] as const) assert.ok(c11Strings[l].file[k], `${l}.${k}`);
});

test('F81-1 eight poster styles, each with a full palette and a name in every language', () => {
  assert.deepEqual(THEMES, ['dark', 'light', 'navy', 'burgundy', 'charcoal', 'cream', 'mono', 'sky']);
  for (const id of THEMES) {
    const p = PALETTE[id];
    for (const k of ['bg', 'panel', 'ink', 'muted', 'gold', 'onGold', 'line'] as const) assert.match(p[k], /^#[0-9A-F]{6}$/i, `${id}.${k}`);
    assert.match(p.rgb, /^\d+,\d+,\d+$/);
    for (const l of ['en', 'bm', 'zh'] as const) assert.ok(marketingStrings[l].themes[id], `${l} name of ${id}`);
  }
  assert.equal(marketingStrings.en.themes.charcoal.toLowerCase(), 'charcoal and silver');
});

test('F78-1 seven adjustment icons, named in every language', async () => {
  const { TOOLS, isSwipe } = await import('../src/photos/PhotoStudioUI');
  assert.deepEqual([...TOOLS], ['brightness', 'contrast', 'colour', 'clarity', 'straighten', 'rotate', 'crop']);
  for (const l of ['en', 'bm', 'zh'] as const) for (const k of TOOLS) assert.ok(photoStrings[l].tool[k], `${l}.${k}`);
  // F79: a swipe is a clear sideways move
  assert.equal(isSwipe(-80, 10), true); assert.equal(isSwipe(70, -20), true);
  assert.equal(isSwipe(30, 0), false, 'too short'); assert.equal(isSwipe(80, 70), false, 'mostly up or down');
});
