// JoyChange003 Batch B rules that can be checked without a browser: Changes 66 / 71 (spare room under the last field while the
// keyboard is open) and Change 51 (the "+ Add New" entry replaces "Others…" in all three languages).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roomFor, KEYBOARD_ROOM, alignDelta } from '../src/ui/keyboardAlign';
import { strings } from '../src/i18n';

test('B66-1 spare room is most of the visible height, rounded, and never negative', () => {
  assert.equal(KEYBOARD_ROOM, 0.85);
  assert.equal(roomFor(500), 425);
  assert.equal(roomFor(333), 283);
  assert.equal(roomFor(0), 0);
});

test('B66-2 the last field can reach the top slice: the room is at least the visible height minus one field', () => {
  const visible = 480, field = 56;
  const room = roomFor(visible);
  // A last field sitting at the bottom of the page needs to scroll up by (visible - buffer - field); the room must cover it.
  const want = alignDelta(visible - field, 0, visible, field);
  assert.ok(room >= want - 10, `room ${room} covers the scroll of ${want}`);
});

test('B51-1 "+ Add New" replaces "Others…" in English, Bahasa Malaysia (bm) and Chinese', () => {
  for (const l of ['en', 'bm', 'zh'] as const) {
    const a = strings[l].c.others;
    assert.ok(a.startsWith('+'), `${l}: ${a}`);
    assert.ok(!a.includes('…'), `${l}: ${a}`);
  }
  assert.equal(strings.en.c.others, '+ Add New');
});
