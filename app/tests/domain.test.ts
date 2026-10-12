// References, location matching against saved values, workflow, finance, journeys, name card.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkRef, nextNumber, prefixChoices, defaultPrefix, makeRef, parseRef, checkPrefix } from '../src/domain/refs';
import { matchPlace, checkField, normalisePlace, partsFromGoogle } from '../src/domain/places';
import { dueReminders, convertToViewing, taskBucket, sortTasks, followUpTask, reminderTimes, setApptStatus } from '../src/domain/workflow';
import { summarise, myCommission } from '../src/domain/finance';
import { addPoint, newJourney, elapsedMs, addPlace } from '../src/domain/journey';
import { shareText, shareFiles, whatsappLink, DEFAULT_SHARE } from '../src/domain/namecard';
import { propertyContext } from '../src/domain/expert';
import type { Task, Appointment, Inquiry, Deal } from '../src/data/types';
import { sampleData } from '../src/data/sample';

const R = (id: string, ref: string) => ({ id, ref, ...parseRef(ref) && { refPrefix: parseRef(ref)!.prefix, refNo: parseRef(ref)!.no } });

test('R1 references: next number, unique number across prefixes, unique reference', () => {
  assert.equal(nextNumber([]), 1001);
  assert.equal(nextNumber([R('a', 'P1001')]), 1002, 'P1001 exists → suggest 1002');
  assert.equal(nextNumber([R('a', 'P1001'), R('b', 'INT1007'), R('c', 'ZA1003')]), 1008);
  const list = [R('a', 'P1001'), R('b', 'A1002')];
  assert.equal(checkRef(list, 'new', 'P', 1003), null);
  assert.equal(checkRef(list, 'new', 'B', 1001), 'numberTaken', 'the number part is unique whatever the prefix');
  assert.equal(checkRef(list, 'a', 'P', 1001), null, 'a property keeps its own number when edited');
  assert.equal(checkRef([{ id: 'x', ref: 'XY9' }], 'new', 'XY', 9), 'refTaken');
  assert.equal(checkRef(list, 'new', 'P1', 1003), 'invalidPrefix');
  assert.equal(checkRef(list, 'new', 'P', undefined), 'invalidNumber');
  assert.equal(makeRef('za', 1004), 'ZA1004');
  assert.deepEqual(parseRef('P-1001'), { prefix: 'P', no: 1001 });
  assert.equal(checkPrefix('INT'), null); assert.equal(checkPrefix(''), 'empty'); assert.equal(checkPrefix('A B'), 'invalid');
});

test('R2 prefixes: built-ins fixed; latest custom prefix on top and default', () => {
  const custom = [{ value: 'KL', added: 1, used: 5 }, { value: 'SG', added: 2, used: 9 }];
  assert.deepEqual(prefixChoices(custom).map(c => c.value), ['SG', 'KL', 'P', 'A', 'B', 'C', 'D', 'I', 'INT', 'ZA']);
  assert.deepEqual(prefixChoices(custom).filter(c => c.custom).map(c => c.value), ['SG', 'KL']);
  assert.equal(defaultPrefix(custom, 'KL'), 'KL', 'the prefix used last is the default');
  assert.equal(defaultPrefix(custom), 'SG', 'otherwise the latest custom prefix');
  assert.equal(defaultPrefix([], undefined), 'P');
  assert.equal(defaultPrefix([], 'GONE'), 'P', 'a deleted custom prefix is not suggested');
});

test('L1 location names: spelling, spacing, capitals and abbreviations do not make new values', () => {
  const saved = ['Taman Desa Nilai', 'Bandar Baru Salak Tinggi', 'Putra Nilai', 'Negeri Sembilan'];
  assert.deepEqual(matchPlace('Taman Desa Nilai', saved), { kind: 'exact', value: 'Taman Desa Nilai' });
  assert.deepEqual(matchPlace('Tmn. Desa Nilai', saved), { kind: 'same', value: 'Taman Desa Nilai' });
  assert.deepEqual(matchPlace('PUTRA NILAI', saved), { kind: 'same', value: 'Putra Nilai' });
  assert.deepEqual(matchPlace('PutraNilai', saved), { kind: 'same', value: 'Putra Nilai' });
  assert.deepEqual(matchPlace('Bdr Baru Salak Tinggi', saved), { kind: 'same', value: 'Bandar Baru Salak Tinggi' });
  assert.deepEqual(matchPlace('N. Sembilan', saved), { kind: 'same', value: 'Negeri Sembilan' });
  assert.deepEqual(matchPlace('Taman Desa Nilia', saved), { kind: 'similar', value: 'Taman Desa Nilai' }, 'a small misspelling');
  assert.deepEqual(matchPlace('Taman Pinggiran Nilai', saved), { kind: 'none' });
  assert.equal(normalisePlace('Jln. Perindustrian 2/3'), 'jalan industri 2 3');
});

test('L2 Google value against saved values and the current value', () => {
  const saved = ['Taman Desa Nilai', 'Putra Nilai'];
  assert.deepEqual(checkField('Tmn Desa Nilai', saved), { status: 'ok', value: 'Taman Desa Nilai', google: 'Tmn Desa Nilai', rewritten: true });
  assert.deepEqual(checkField('Taman Desa Nilia', saved), { status: 'diff', google: 'Taman Desa Nilia', closest: 'Taman Desa Nilai', current: undefined });
  assert.deepEqual(checkField('Kota Seriemas', saved), { status: 'diff', google: 'Kota Seriemas', closest: undefined, current: undefined });
  assert.deepEqual(checkField('Putra Nilai', saved, 'Taman Desa Nilai'), { status: 'diff', google: 'Putra Nilai', closest: 'Putra Nilai', current: 'Taman Desa Nilai' }, 'differs from what the property has now');
  assert.deepEqual(checkField(undefined, saved), { status: 'none' });
});

test('L3 Google address components → location fields', () => {
  const p = partsFromGoogle([
    { long_name: '12', short_name: '12', types: ['street_number'] },
    { long_name: 'Jalan BBN 3/1', short_name: 'Jln BBN 3/1', types: ['route'] },
    { long_name: 'Bandar Baru Nilai', short_name: 'BBN', types: ['sublocality_level_1', 'sublocality', 'political'] },
    { long_name: 'Nilai', short_name: 'Nilai', types: ['locality', 'political'] },
    { long_name: 'Negeri Sembilan', short_name: 'NSN', types: ['administrative_area_level_1', 'political'] },
    { long_name: 'Malaysia', short_name: 'MY', types: ['country', 'political'] },
    { long_name: '71800', short_name: '71800', types: ['postal_code'] },
  ]);
  assert.deepEqual(p, { country: 'Malaysia', state: 'Negeri Sembilan', city: 'Nilai', township: 'Bandar Baru Nilai', street: '12 Jalan BBN 3/1', postcode: '71800' });
  assert.equal(partsFromGoogle([{ long_name: 'Wilayah Persekutuan Kuala Lumpur', short_name: 'KL', types: ['administrative_area_level_1'] }]).state, 'Kuala Lumpur');
});

const NOW = new Date(2026, 9, 12, 10, 0).getTime();
const task = (x: Partial<Task>): Task => ({ id: 't', created: NOW - 86400000, updated: NOW, title: 'x', priority: 'medium', done: false, kind: 'task', reminders: [], ...x });
const appt = (x: Partial<Appointment>): Appointment => ({ id: 'a', created: NOW - 30 * 86400000, updated: NOW, kind: 'viewing', status: 'scheduled', reminders: [], ...x });

test('W1 reminders: 3 and 7 days before, never twice, not for done or cancelled items', () => {
  const a = appt({ start: '2026-10-19T10:00', reminders: [10080, 4320, 60] });
  assert.deepEqual(reminderTimes(a.start, [10080]).map(r => new Date(r.at).toString()), [new Date(2026, 9, 12, 10, 0).toString()], '7 days before');
  const due = dueReminders([], [a], [], NOW);
  assert.deepEqual(due.map(d => d.minutesBefore), [10080]);
  assert.deepEqual(dueReminders([], [a], [due[0].key], NOW), [], 'shown once only');
  const in3 = dueReminders([], [a], [], new Date(2026, 9, 16, 10, 1).getTime());
  assert.ok(in3.some(d => d.minutesBefore === 4320), '3 days before');
  assert.deepEqual(dueReminders([], [setApptStatus(a, 'cancelled')], [], NOW), []);
  const t = task({ due: '2026-10-12', reminders: [0] });
  assert.equal(dueReminders([t], [], [], NOW).length, 1, 'a date without time reminds at 9:00');
  assert.equal(dueReminders([{ ...t, done: true }], [], [], NOW).length, 0);
  const soon = appt({ created: NOW, start: '2026-10-12T10:10', reminders: [15] });
  assert.equal(dueReminders([], [soon], [], NOW).length, 1, 'a 15-minute reminder for a meeting entered 10 minutes before is shown at once');
  const several = dueReminders([], [{ ...soon, reminders: [1440, 60, 15] }], [], NOW);
  assert.equal(several.length, 1, 'one alert per item');
  assert.equal(several[0].minutesBefore, 15); assert.equal(several[0].covers?.length, 2);
  assert.equal(dueReminders([task({ created: NOW, due: '2026-10-11', reminders: [0] })], [], [], NOW).length, 0, 'an item entered for a past date does not remind');
});

test('W2 to-do buckets, order and follow-ups', () => {
  const now = new Date(2026, 9, 12, 10, 0);
  assert.equal(taskBucket(task({ due: '2026-10-11' }), now), 'overdue');
  assert.equal(taskBucket(task({ due: '2026-10-12T09:00' }), now), 'overdue');
  assert.equal(taskBucket(task({ due: '2026-10-12T16:00' }), now), 'today');
  assert.equal(taskBucket(task({ due: '2026-10-20' }), now), 'upcoming');
  assert.equal(taskBucket(task({}), now), 'someday');
  assert.equal(taskBucket(task({ done: true, due: '2026-10-01' }), now), 'done', 'completed items stay as history');
  const sorted = sortTasks([task({ id: '1', due: '2026-10-13', priority: 'low' }), task({ id: '2', due: '2026-10-13', priority: 'urgent' }), task({ id: '3', due: '2026-10-12' })]);
  assert.deepEqual(sorted.map(x => x.id), ['3', '2', '1']);
  const f = followUpTask({ id: 'f', title: 'Follow up Buyer L', due: '2026-10-14', contactId: 'b2', propertyId: 's4', inquiryId: 'i1' });
  assert.equal(f.kind, 'follow_up'); assert.equal(f.contactId, 'b2'); assert.equal(f.done, false);
});

test('W3 inquiry → Pending Viewing → Viewed', () => {
  const i: Inquiry = { id: 'i1', created: 0, updated: 0, contactId: 'b2', propertyId: 's4', at: '2026-10-11T20:15', channel: 'whatsapp', message: 'Can view Saturday?' };
  const v = convertToViewing(i, { id: 'v1' }, NOW);
  assert.equal(v.kind, 'viewing'); assert.equal(v.status, 'pending'); assert.equal(v.contactId, 'b2'); assert.equal(v.propertyId, 's4');
  assert.deepEqual(v.fromInquiry, { at: '2026-10-11T20:15', channel: 'whatsapp', message: 'Can view Saturday?' });
  const viewed = setApptStatus(v, 'completed', NOW);
  assert.equal(viewed.status, 'completed'); assert.equal(viewed.completedAt, NOW);
});

test('F1 finance summary: received, outstanding, expenses, target', () => {
  const d = sampleData(new Date(2026, 9, 12).getTime());
  const deals: Deal[] = [
    { id: 'a', created: 0, updated: 0, side: 'sale', date: '2026-10-01', value: 950000, commission: 23750, sharePct: 70, status: 'received', receivedDate: '2026-10-05', receivedAmount: 16625 },
    { id: 'b', created: 0, updated: 0, side: 'rent', date: '2026-10-03', value: 6000, commission: 6000, sharePct: 70, status: 'confirmed' },
    { id: 'c', created: 0, updated: 0, side: 'sale', date: '2026-11-20', value: 3050000, commission: 61000, sharePct: 50, status: 'estimated' },
  ];
  assert.equal(myCommission(deals[1]), 4200);
  const s = summarise({ kind: 'month', key: '2026-10' }, deals, [{ id: 'i', created: 0, updated: 0, date: '2026-10-09', source: 'Referral fee', amount: 500 }],
    [{ id: 'e', created: 0, updated: 0, date: '2026-10-02', category: 'Fuel', amount: 80 }, { id: 'e2', created: 0, updated: 0, date: '2026-09-30', category: 'Fuel', amount: 999 }],
    [{ id: 't', created: 0, updated: 0, period: 'month', key: '2026-10', amount: 20000 }]);
  assert.equal(s.commissionReceived, 16625); assert.equal(s.otherIncome, 500); assert.equal(s.received, 17125);
  assert.equal(s.expenses, 80); assert.equal(s.net, 17045);
  assert.equal(s.outstanding, 4200 + 30500); assert.equal(s.outstandingConfirmed, 4200);
  assert.equal(s.completedDeals, 2); assert.equal(s.target, 20000);
  assert.ok(Math.abs(s.targetProgress! - 0.85625) < 1e-9);
  assert.ok(d.deals.length > 0);
});

test('J1 House Shopping: poor fixes and jitter ignored, distance and paused time', () => {
  let j = newJourney('j', 0);
  const p = (lat: number, lng: number, acc: number, t: number) => ({ lat, lng, acc, t });
  let r = addPoint(j, p(2.8200, 101.8000, 120, 0)); assert.equal(r.result, 'poor'); j = r.journey;
  r = addPoint(j, p(2.8200, 101.8000, 8, 1000)); assert.equal(r.result, 'added'); j = r.journey;
  r = addPoint(j, p(2.82002, 101.80002, 8, 2000)); assert.equal(r.result, 'jitter'); j = r.journey;
  r = addPoint(j, p(2.8209, 101.8000, 8, 30000)); assert.equal(r.result, 'added'); j = r.journey;
  assert.ok(Math.abs(j.distanceM - 100) < 2, `about 100 m, got ${j.distanceM}`);
  r = addPoint(j, p(2.9200, 101.8000, 8, 31000)); assert.equal(r.result, 'jump', '11 km in a second is not real');
  j = addPlace(addPlace(j, 'Putra Nilai', 2.82, 101.8, 5), 'putra nilai', 2.82, 101.8, 6);
  assert.equal(j.places.length, 1);
  assert.equal(elapsedMs({ ...j, pausedMs: 10000, status: 'saved', endedAt: 70000 }, 99999), 60000);
});

test('N1 name card message follows the check boxes; WhatsApp link is prepared, not sent', () => {
  const p = { fullName: 'Lee Ah Kow', regType: 'REN', regNo: '12345', agency: 'Agency X', phone: '+60 12-345 6789', email: 'lee@example.com', cardFrontFileId: 'f', cardBackFileId: 'b' };
  const L = { greeting: 'Hi', regLabel: (t: string) => `${t} No.`, agency: 'Agency', phone: 'Phone', email: 'Email', closing: 'Thanks' };
  const all = shareText(p, { regNo: true, front: true, back: true, agency: true, phone: true, email: true }, L);
  assert.ok(all.includes('REN No.: 12345') && all.includes('Agency: Agency X') && all.includes('Email: lee@example.com'));
  const some = shareText(p, { ...DEFAULT_SHARE, regNo: false, email: false }, L);
  assert.ok(!some.includes('12345') && !some.includes('lee@'));
  assert.deepEqual(shareFiles(p, { ...DEFAULT_SHARE, back: true }), ['f', 'b']);
  assert.equal(whatsappLink('012-345 6789', 'Hi there'), 'https://wa.me/60123456789?text=Hi%20there');
});

test('X1 Ask Expert context carries property facts only, never owner details', () => {
  const s1 = sampleData().properties[0];
  const ctx = propertyContext(s1)!;
  assert.ok(ctx.includes('Semi-D factory') && ctx.includes('RM 3,200,000'));
  assert.ok(!ctx.includes('Owner') && !/\+60|012/.test(ctx));
});
