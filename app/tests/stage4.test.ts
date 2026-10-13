// Stage 4: GPS Assistance gaps found in the audit: banner position history, sample banners, and the pure banner rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryBackend } from '../src/data/backend';
import { Store } from '../src/data/store';
import { syncNow } from '../src/data/sync';
import { merge3 } from '../src/data/merge';
import { loadSampleInto } from '../src/data/sample';
import { buildBanner, changeBanner } from '../src/domain/banners';
import { gpsStrings } from '../src/gps/strings';
import type { Banner } from '../src/data/types';
import { FakeCloud, cfg, phone } from './support/fakeCloud';

const pos = (lat: number, lng: number, source: Banner['source'] = 'gps', acc?: number) => ({ lat, lng, source, acc });
const base = (): Banner => buildBanner('b1', { id: 'p1' }, pos(2.82, 101.8, 'gps', 7), { placedOn: '2026-10-01', note: ' Gate ' }, 1000);

test('G1 a new banner keeps its position, source, date and trimmed note; no sample flag for a real property', () => {
  const b = base();
  assert.deepEqual([b.propertyId, b.lat, b.lng, b.source, b.acc, b.placedOn, b.note], ['p1', 2.82, 101.8, 'gps', 7, '2026-10-01', 'Gate']);
  assert.equal('sample' in b, false);
  assert.equal(b.moves, undefined);
});

test('G2 a banner on a sample property is itself a sample', () => {
  assert.equal(buildBanner('b', { id: 's1', sample: true }, pos(1, 2), { placedOn: '2026-10-01' }, 1).sample, true);
});

test('G3 changing the position keeps where it stood before; changing only the note or date does not add a move', () => {
  const b = base();
  const moved = changeBanner(b, pos(2.83, 101.81, 'map'), { placedOn: '2026-10-02', note: 'Corner' }, 'm1', 2000);
  assert.equal(moved.lat, 2.83); assert.equal(moved.source, 'map'); assert.equal(moved.placedOn, '2026-10-02'); assert.equal(moved.note, 'Corner');
  assert.deepEqual(moved.moves, [{ id: 'm1', at: 2000, lat: 2.82, lng: 101.8, acc: 7, source: 'gps' }]);
  const again = changeBanner(moved, pos(2.84, 101.82, 'manual'), {}, 'm2', 3000);
  assert.deepEqual(again.moves!.map(m => [m.id, m.lat]), [['m1', 2.82], ['m2', 2.83]], 'oldest first');
  assert.equal(again.placedOn, '2026-10-02', 'an empty date leaves the date alone');
  const same = changeBanner(moved, pos(2.83, 101.81, 'map'), { note: 'Only the note' }, 'm3', 4000);
  assert.equal(same.moves!.length, 1, 'same spot: no new move');
  assert.equal(same.note, 'Only the note');
  assert.equal(b.moves, undefined, 'the original is not changed');
});

test('G4 a removed photo is gone from the record; a taken-down banner keeps its removal date and moves', () => {
  const withPhoto = { ...base(), photoFileId: 'f1', removedOn: '2026-10-10' };
  const c = changeBanner(withPhoto, pos(2.82, 101.8), { photoFileId: undefined }, 'm', 1);
  assert.equal(c.photoFileId, undefined);
  assert.equal(c.removedOn, '2026-10-10');
});

test('G5 the move history survives a record history revision and a three-way merge from two phones', async () => {
  const s = await Store.open(new MemoryBackend());
  s.upsert('banners', base());
  s.upsert('banners', changeBanner(s.getState().banners[0], pos(2.9, 101.9, 'map'), {}, 'm1', 5000), false, 'edit');
  const h = await s.revisions('banners:b1');
  assert.equal((h[0].data as Banner).lat, 2.82, 'the earlier version of the banner is in the record history');
  // phone A moves it again, phone B changes the note: both survive, nothing is lost
  const root = changeBanner(base(), pos(2.9, 101.9, 'map'), {}, 'm1', 5000) as unknown as Record<string, unknown>;
  const a = changeBanner(root as unknown as Banner, pos(3, 102, 'map'), {}, 'mA', 6000) as unknown as Record<string, unknown>;
  const b = { ...root, note: 'Painted over' };
  const r = merge3(root, a, b);
  assert.deepEqual(r.conflicts, []);
  assert.equal(r.merged.lat, 3); assert.equal(r.merged.note, 'Painted over');
  assert.equal((r.merged.moves as unknown[]).length, 2);
  // both phones moved it differently: the two earlier places are both kept as items, the position itself is a normal conflict
  const bb = changeBanner(root as unknown as Banner, pos(4, 103, 'map'), {}, 'mB', 6000) as unknown as Record<string, unknown>;
  const r2 = merge3(root, a, bb);
  assert.ok(r2.conflicts.some(c => c.field === 'lat' || c.field === 'lng'));
});

test('G6 sample banners never reach the team; a real banner does', async () => {
  const cloud = new FakeCloud();
  const a = await phone(cloud, 'o@x.c');
  loadSampleInto(a.store);
  const sampleProp = a.store.getState().properties[0];
  a.store.upsert('banners', buildBanner('sb', sampleProp, pos(2.8, 101.8), { placedOn: '2026-10-01' }, Date.now()));
  a.store.upsert('properties', { id: 'real', created: 1, updated: 1, photos: [], documents: [], ref: 'P2001', refPrefix: 'P', refNo: 2001 } as never);
  a.store.upsert('banners', buildBanner('rb', { id: 'real' }, pos(2.8, 101.8), { placedOn: '2026-10-01' }, Date.now()));
  await syncNow(a.store, cfg, cloud.fetch);
  const keys = [...cloud.rows.keys()].map(k => k.split('|').slice(1).join('|'));
  assert.ok(keys.includes('banners|rb'));
  assert.ok(!keys.includes('banners|sb'), 'a banner on a sample property is not sent');
  assert.ok(![...cloud.rows.values()].some(r => (r.data as { sample?: boolean } | null)?.sample));
});

test('G7 English, Bahasa Malaysia and Chinese all have the new banner strings', () => {
  for (const l of ['en', 'bm', 'zh'] as const) {
    const b = gpsStrings[l].bn;
    assert.ok(b.removePhoto.length > 1, `${l} removePhoto`);
    assert.ok(b.moved(2).includes('2') && b.moved(1).length > 3, `${l} moved`);
    assert.ok(b.movedFrom('1 Oct', '2.8', '101.8').includes('2.8'), `${l} movedFrom`);
  }
  assert.notEqual(gpsStrings.bm.bn.moved(2), gpsStrings.en.bn.moved(2));
  assert.notEqual(gpsStrings.zh.bn.moved(2), gpsStrings.en.bn.moved(2));
});
