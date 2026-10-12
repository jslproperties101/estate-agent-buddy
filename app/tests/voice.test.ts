// Spoken numbers and the To-Do / Calendar / contact voice commands.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normaliseSpoken, wordsToNumber } from '../src/voice/spoken';
import { parseAgenda, readDate, readTime } from '../src/voice/agenda';

const MON_12_OCT_2026 = new Date(2026, 9, 12, 14, 0);

test('V1 spoken numbers in English and Bahasa Malaysia', () => {
  assert.equal(wordsToNumber(['five', 'hundred', 'and', 'eighty', 'thousand']), 580000);
  assert.equal(wordsToNumber(['lima', 'ratus', 'lapan', 'puluh', 'ribu']), 580000);
  assert.equal(wordsToNumber(['dua', 'juta', 'setengah']), 2500000);
  assert.equal(normaliseSpoken('asking five hundred and eighty thousand ringgit'), 'asking RM 580000');
});

test('V2 dates and times said in words', () => {
  assert.equal(readDate('tomorrow', MON_12_OCT_2026).date, '2026-10-13');
  assert.equal(readDate('esok', MON_12_OCT_2026).date, '2026-10-13');
  assert.equal(readDate('on Friday', MON_12_OCT_2026).date, '2026-10-16');
  assert.equal(readDate('hari Jumaat', MON_12_OCT_2026).date, '2026-10-16');
  assert.equal(readDate('on Monday', MON_12_OCT_2026).date, '2026-10-19', 'the coming Monday');
  assert.equal(readDate('25 Dec', MON_12_OCT_2026).date, '2026-12-25');
  assert.equal(readDate('5 Jan', MON_12_OCT_2026).date, '2027-01-05', 'a past date means next year');
  assert.equal(readTime('at 3pm').time, '15:00');
  assert.equal(readTime('3.30 pm').time, '15:30');
  assert.equal(readTime('pukul 3 petang').time, '15:00');
  assert.equal(readTime('10 pagi').time, '10:00');
  assert.equal(readTime('at 15:45').time, '15:45');
  assert.equal(readTime('no time here').time, undefined);
});

test('V3 tasks, appointments, show and contacts', () => {
  assert.deepEqual(parseAgenda('Remind me to call Buyer K tomorrow at 3pm', MON_12_OCT_2026), { kind: 'task', title: 'Call Buyer K', date: '2026-10-13', time: '15:00', priority: undefined });
  assert.deepEqual(parseAgenda('Ingatkan saya hantar brosur esok', MON_12_OCT_2026), { kind: 'task', title: 'Hantar brosur', date: '2026-10-13', time: undefined, priority: undefined });
  const a = parseAgenda('Schedule a viewing for P1001 with Buyer K on Friday at 11am', MON_12_OCT_2026);
  assert.equal(a?.kind, 'appointment');
  if (a?.kind !== 'appointment') return;
  assert.equal(a.apptKind, 'viewing'); assert.equal(a.ref, 'P1001'); assert.equal(a.date, '2026-10-16'); assert.equal(a.time, '11:00'); assert.equal(a.who, 'Buyer K');
  assert.deepEqual(parseAgenda('Show my appointments tomorrow', MON_12_OCT_2026), { kind: 'show', what: 'appointments', date: '2026-10-13' });
  assert.deepEqual(parseAgenda('Add a new buyer Lim 012 888 7777', MON_12_OCT_2026), { kind: 'contact', role: 'buyer', name: 'Lim', phone: '012 888 7777' });
  assert.equal(parseAgenda('Create a new terrace house in Nilai', MON_12_OCT_2026), null, 'property commands are left for the property reader');
});
