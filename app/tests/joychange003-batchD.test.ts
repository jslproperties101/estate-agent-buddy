// JoyChange003 Batch D: Change 72 (dismiss, remind me later, History) rules that need no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isShown, dismissMarks, snoozeMarks, restoreMarks, historyList, snoozeUntil, HISTORY_MAX } from '../src/lib/notifState';
import { strings } from '../src/i18n';

const NOW = new Date(2026, 9, 19, 14, 30).getTime();

test('D72-1 a new notification is shown; Dismiss hides it and puts it in History; Put back shows it again', () => {
  let m: any = {};
  assert.equal(isShown(m, 'a', NOW), true);
  m = { notifs: dismissMarks(m, 'a', 'Call the lawyer', NOW) };
  assert.equal(isShown(m, 'a', NOW + 1e9), false, 'a dismissed notification stays hidden');
  assert.deepEqual(historyList(m).map(h => h.title), ['Call the lawyer']);
  m = { notifs: restoreMarks(m, 'a') };
  assert.equal(isShown(m, 'a', NOW), true);
  assert.equal(historyList(m).length, 0);
});

test('D72-2 Remind me later hides it only until the chosen time, and it does not enter History', () => {
  let m: any = { notifs: snoozeMarks({}, 'b', snoozeUntil('hour', NOW)) };
  assert.equal(isShown(m, 'b', NOW + 30 * 60_000), false);
  assert.equal(isShown(m, 'b', NOW + 61 * 60_000), true);
  assert.equal(historyList(m).length, 0);
  m = { notifs: dismissMarks(m, 'b', 'x', NOW) };
  assert.equal(isShown(m, 'b', NOW + 1e9), false, 'dismissing replaces the snooze');
});

test('D72-3 snooze times (as agreed): 1 hour, tonight 8 pm, tomorrow 9 am', () => {
  assert.equal(snoozeUntil('hour', NOW) - NOW, 3_600_000);
  const n = new Date(snoozeUntil('tonight', NOW)); assert.deepEqual([n.getDate(), n.getHours(), n.getMinutes()], [19, 20, 0]);
  const late = new Date(2026, 9, 19, 19, 50).getTime();
  assert.equal(snoozeUntil('tonight', late) - late, 2 * 3_600_000, 'already evening: two hours from now');
  const t = new Date(snoozeUntil('tomorrow', NOW)); assert.deepEqual([t.getDate(), t.getHours(), t.getMinutes()], [20, 9, 0]);
});

test('D72-4 History keeps only the newest ones', () => {
  let m: any = {};
  for (let i = 0; i < HISTORY_MAX + 5; i++) m = { notifs: dismissMarks(m, `k${i}`, `t${i}`, NOW + i) };
  const h = historyList(m);
  assert.equal(h.length, HISTORY_MAX);
  assert.equal(h[0].key, `k${HISTORY_MAX + 4}`);
});

test('D72-5 the new words exist in English, Bahasa Malaysia (bm) and Chinese', () => {
  for (const l of ['en', 'bm', 'zh'] as const) {
    const n = strings[l].notif;
    for (const k of ['dismiss', 'remindLater', 'history', 'restore', 'historyEmpty'] as const) assert.ok(n[k], `${l}.${k}`);
    for (const c of ['hour', 'tonight', 'tomorrow'] as const) assert.ok(n.snooze[c], `${l}.snooze.${c}`);
  }
});
