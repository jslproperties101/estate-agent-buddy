// JoyChange003 Batch C rules that can be checked without a browser: Change 54 (a picture has ONE web address however many boxes
// ask for it, and an old address is not cancelled the moment the file is written again), and the photo order helpers of Change 67.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryBackend } from '../src/data/backend';
import { Store } from '../src/data/store';
import { movePhoto, type Photo } from '../src/listing/model';

// The unit tests run in Node, where the web address helpers are numbered stand-ins.
let made = 0; const cancelled: string[] = [];
(URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = () => `blob:test/${++made}`;
(URL as unknown as { revokeObjectURL: (u: string) => void }).revokeObjectURL = u => { cancelled.push(u); };

test('C54-1 boxes asking for the same picture at the same moment share one web address', async () => {
  const s = await Store.open(new MemoryBackend());
  const id = await s.putFile(new Blob(['x'], { type: 'image/png' }));
  const before = made;
  const urls = await Promise.all([1, 2, 3, 4, 5, 6, 7, 8].map(() => s.fileUrl(id)));
  assert.equal(new Set(urls).size, 1, 'one address for all eight boxes');
  assert.equal(made - before, 1, 'one address was made');
  assert.equal(await s.fileUrl(id), urls[0], 'and it is kept');
});

test('C54-2 writing the same file again does not cancel the address a screen is still showing', async () => {
  const s = await Store.open(new MemoryBackend());
  const id = await s.putFile(new Blob(['x'], { type: 'image/png' }));
  const shown = await s.fileUrl(id);
  await s.putFileAs(id, new Blob(['x'], { type: 'image/png' }), 'local');
  assert.ok(!cancelled.includes(shown!), 'the address still on screen is not cancelled at once');
  const next = await s.fileUrl(id);
  assert.notEqual(next, shown, 'a later screen gets a fresh address');
});

test('C54-3 refreshFileUrl gives a fresh address for a picture that would not show', async () => {
  const s = await Store.open(new MemoryBackend());
  const id = await s.putFile(new Blob(['x'], { type: 'image/png' }));
  const a = await s.fileUrl(id);
  const b = await s.refreshFileUrl(id);
  assert.ok(a && b && a !== b);
  assert.equal(await s.refreshFileUrl('missing-file'), undefined, 'a file that is not on the phone stays missing');
});

test('C67-1 moving a photo changes the order; the first one is the main photo', () => {
  const P = (id: string): Photo => ({ id, name: id, fileId: id } as Photo);
  const list = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(P);
  assert.deepEqual(movePhoto(list, 7, 0).map(p => p.id), ['h', 'a', 'b', 'c', 'd', 'e', 'f', 'g']);
  assert.deepEqual(movePhoto(list, 0, 3).map(p => p.id), ['b', 'c', 'd', 'a', 'e', 'f', 'g', 'h']);
  assert.equal(movePhoto(list, 2, 2), list, 'no move, same list');
  assert.equal(movePhoto(list, 2, 99), list, 'out of range, same list');
});

import { autoScrollSpeed } from '../src/listing/PhotoReorder';
test('C67-2 the screen scrolls by itself only near the top or bottom edge, faster nearer the edge', () => {
  assert.equal(autoScrollSpeed(400, 100, 800), 0, 'middle: no scrolling');
  assert.ok(autoScrollSpeed(790, 100, 800) > 0, 'near the bottom: down');
  assert.ok(autoScrollSpeed(110, 100, 800) < 0, 'near the top: up');
  assert.ok(autoScrollSpeed(799, 100, 800) > autoScrollSpeed(760, 100, 800), 'faster at the very edge');
  assert.ok(Math.abs(autoScrollSpeed(900, 100, 800)) <= 18, 'never faster than the top speed');
});
