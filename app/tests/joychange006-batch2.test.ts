// JoyChange006 Batch 2, Change D: where the field being typed in lands while the keyboard is open.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { targetTop, alignDelta, FIELD_AT, roomFor } from '../src/ui/keyboardAlign';

// A 384 x 824 phone with a tall keyboard (SwiftKey with its toolbar): 470 px visible; the title bar ends at 66 px.
const SCREEN = 470, HEAD = 66;

test('D-1 the field lands about 30% from the top of the visible screen', () => {
  assert.equal(FIELD_AT, 0.3);
  assert.equal(targetTop(HEAD, SCREEN, 50, 0, SCREEN), 141);
});
test('D-2 never under the title bar or above the top edge of a pop-up', () => {
  assert.equal(targetTop(200, SCREEN, 50, 0, SCREEN), 208);
});
test('D-3 a tall text box moves up just enough to show its bottom; one taller than the area lines up with the top', () => {
  assert.equal(targetTop(HEAD, SCREEN, 350, 0, SCREEN), SCREEN - 8 - 350);
  assert.equal(targetTop(HEAD, SCREEN, 500, 0, SCREEN), HEAD);
});
test('D-4 the scroll needed from the bottom of the page is covered by the spare room under the last field', () => {
  const field = 56;
  const need = alignDelta(SCREEN - field, HEAD, SCREEN - HEAD, field, 0, SCREEN);
  assert.ok(roomFor(SCREEN) >= need, `room ${roomFor(SCREEN)} >= ${need}`);
});
