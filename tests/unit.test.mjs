import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../web/js/store.js';
import * as C from '../web/js/content.js';
import { MENUS } from '../web/js/i18n.js';

const NOW = new Date('2026-10-29T10:00:00');

class MemStorage { constructor() { this.m = new Map(); } getItem(k) { return this.m.get(k) ?? null; } setItem(k, v) { this.m.set(k, String(v)); } }

test('19 menus, numbered 1-19, menu 16 is Future Integrations, News/Hotspots/Coupons present', () => {
  assert.equal(MENUS.length, 19);
  assert.deepEqual(MENUS.map(m => m.n), Array.from({ length: 19 }, (_, i) => i + 1));
  assert.equal(MENUS[15].id, 'integrations');
  for (const id of ['news', 'hotspots', 'coupons']) assert.ok(MENUS.some(m => m.id === id), id);
  for (const m of MENUS) assert.ok(m.en && m.ms, `${m.id} has English and Malay names`);
});

test('save and load round-trip; corrupt storage falls back to a fresh state', () => {
  const st = new MemStorage();
  const s = S.emptyState();
  s.profile.familyName = 'Tan';
  s.family.push({ id: '1', name: 'Ali' });
  assert.equal(S.save(s, st), true);
  const back = S.load(st);
  assert.equal(back.profile.familyName, 'Tan');
  assert.equal(back.family[0].name, 'Ali');
  st.setItem(S.STORAGE_KEY, '{not json');
  assert.equal(S.load(st).profile.familyName, '');
});

test('normalise fills missing keys and fixes a bad tier', () => {
  const n = S.normalise({ profile: { tier: 'Diamond' }, family: 'oops' });
  assert.equal(n.profile.tier, 'Undecided');
  assert.deepEqual(n.family, []);
  assert.equal(n.stages.length, S.DEFAULT_STAGES.length);
});

test('backup export/import, and foreign or broken backups are refused', () => {
  const s = S.emptyState();
  s.tasks.push({ id: 't', title: 'Medical check', due: '2026-11-01' });
  const back = S.importBackup(S.exportBackup(s));
  assert.equal(back.tasks[0].title, 'Medical check');
  assert.throws(() => S.importBackup('hello'), /not a valid backup/);
  assert.throws(() => S.importBackup('{"app":"other","state":{}}'), /not from Malaysia Welcome/);
});

test('daysUntil and urgency', () => {
  assert.equal(S.daysUntil('2026-10-29', NOW), 0);
  assert.equal(S.daysUntil('2026-11-08', NOW), 10);
  assert.equal(S.daysUntil('2026-10-19', NOW), -10);
  assert.equal(S.daysUntil('', NOW), null);
  assert.equal(S.daysUntil('29/10/2026', NOW), null);
  assert.equal(S.urgency(-1), 'overdue');
  assert.equal(S.urgency(0), 'soon');
  assert.equal(S.urgency(60), 'soon');
  assert.equal(S.urgency(61), 'ok');
  assert.equal(S.urgency(null), 'none');
});

test('age handles birthdays not yet reached this year', () => {
  assert.equal(S.age('1980-10-30', NOW), 45);
  assert.equal(S.age('1980-10-29', NOW), 46);
  assert.equal(S.age('', NOW), null);
});

test('tracker progress counts in-progress as half', () => {
  const st = S.DEFAULT_STAGES.map(s => ({ ...s, status: 'todo' }));
  assert.equal(S.stageProgress(st), 0);
  st[0].status = 'done'; st[1].status = 'doing';
  assert.equal(S.stageProgress(st), Math.round((1.5 / st.length) * 100));
  assert.equal(S.nextStatus('todo'), 'doing');
  assert.equal(S.nextStatus('doing'), 'done');
  assert.equal(S.nextStatus('done'), 'todo');
});

test('collectDeadlines gathers every dated item, soonest first, skipping done tasks and used coupons', () => {
  const s = S.emptyState();
  s.family.push({ id: 'a', name: 'Ali', passportExpiry: '2026-12-01', passExpiry: '2030-01-01' });
  s.tasks.push({ id: 't1', title: 'Old', due: '2026-10-01' }, { id: 't2', title: 'Done', due: '2026-10-30', done: true });
  s.coupons.push({ id: 'c1', title: 'Spa', expiry: '2026-11-01' }, { id: 'c2', title: 'Used', expiry: '2026-11-01', used: true });
  s.policies.push({ id: 'p', insurer: 'Insurer X', renewal: '2026-11-15' });
  s.fd.maturity = '2027-10-29';
  const d = S.collectDeadlines(s, NOW);
  assert.deepEqual(d.map(x => x.kind), ['task', 'coupon', 'insurance', 'passport', 'fd', 'pass']);
  assert.equal(d[0].level, 'overdue');
  assert.equal(d[1].route, 'coupons');
});

test('FD withdrawal limit is 50% and flags going over', () => {
  const s = S.withdrawalSummary({ amount: '500000' }, [{ amount: 100000 }, { amount: '50000' }]);
  assert.equal(s.cap, 250000);
  assert.equal(s.used, 150000);
  assert.equal(s.remaining, 100000);
  assert.equal(s.over, false);
  assert.equal(S.withdrawalSummary({ amount: 100 }, [{ amount: 60 }]).over, true);
  assert.equal(S.withdrawalSummary({ amount: '' }, []).cap, 0);
});

test('currency convert', () => {
  assert.equal(S.convert(150000, 4.2), 630000);
  assert.equal(S.convert(100, 0), null);
  assert.equal(S.convert('x', 4), null);
});

test('coupon status', () => {
  assert.equal(S.couponStatus({ used: true }, NOW), 'used');
  assert.equal(S.couponStatus({ expiry: '' }, NOW), 'active');
  assert.equal(S.couponStatus({ expiry: '2026-10-28' }, NOW), 'expired');
  assert.equal(S.couponStatus({ expiry: '2026-11-05' }, NOW), 'expiring');
  assert.equal(S.couponStatus({ expiry: '2026-12-25' }, NOW), 'active');
});

test('groupTasks', () => {
  const g = S.groupTasks([
    { id: 1, title: 'a', due: '2026-10-28' }, { id: 2, title: 'b', due: '2026-10-29' },
    { id: 3, title: 'c', due: '2026-11-02' }, { id: 4, title: 'd', due: '' }, { id: 5, title: 'e', due: '2026-10-01', done: true },
  ], NOW);
  assert.deepEqual([g.overdue.length, g.today.length, g.upcoming.length, g.someday.length, g.done.length], [1, 1, 1, 1, 1]);
});

test('mergeNews de-duplicates by link and sorts newest first', () => {
  const a = [{ title: 'old', link: 'https://x/1', date: 'Mon, 20 Oct 2026 10:00:00 GMT' }];
  const b = [{ title: 'new', link: 'https://x/2', date: 'Tue, 28 Oct 2026 10:00:00 GMT' }, { title: 'dup', link: 'https://x/1', date: '' }];
  const m = S.mergeNews(a, b);
  assert.equal(m.length, 2);
  assert.equal(m[0].title, 'new');
});

test('offline Buddy answers route to the right menu', () => {
  assert.equal(C.answer('How much FD can I withdraw?').go, 'finance');
  assert.equal(C.answer('Which tier is best, gold or silver?').go, 'tracker');
  assert.equal(C.answer('emergency number?').go, 'directory');
  assert.equal(C.answer('good schools with IB').go, 'schools');
  assert.equal(C.answer('qwerty').go, null);
});

test('reference content is complete and links are https', () => {
  assert.equal(C.TIER_INFO.length, 4);
  assert.ok(C.HOTSPOTS.length >= 15);
  assert.equal(new Set(C.HOTSPOTS.map(h => h.id)).size, C.HOTSPOTS.length);
  for (const h of C.HOTSPOTS) assert.ok(C.HOTSPOT_CATEGORIES.includes(h.cat), h.id);
  assert.ok(C.mapsLink(C.HOTSPOTS[0]).startsWith('https://www.google.com/maps/search/?api=1&query='));
  assert.ok(C.INTEGRATIONS.length >= 8);
  for (const c of C.SAMPLE_COUPONS) assert.match(c.merchant, /sample/i);
});
