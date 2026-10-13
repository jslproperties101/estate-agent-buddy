// Stage 6: Advertising & Listing Tracker rules — statuses, expiry, reminders, costs, test (fake) and sample separation,
// saving into the property record, and the three languages.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attention, adReminders, costSummary, daysBetween, deleteAd, isRealAd, newAd, newFakeAd, saveAd, shownStatus, validateAd, UNDATED } from '../src/domain/adverts';
import { adStrings } from '../src/adverts/strings';
import { AD_STATUSES, AD_TYPES, type Advert, type Listing } from '../src/listing/model';

const prop = (id: string, ads: Advert[], o: Partial<Listing> = {}): Listing => ({
  id, created: 1, updated: 1, photos: [], documents: [], ref: id.toUpperCase(), headline: `House ${id}`, marketing: { advertised: 'yes', ads, custom: {} }, ...o,
} as Listing);
const T = '2026-10-14';
const title = (l: Listing) => l.ref ?? l.id;

test('AD1 days between dates; a live advert past its end date is SHOWN as expired but the saved status is not changed', () => {
  assert.equal(daysBetween('2026-10-14', '2026-10-17'), 3);
  assert.equal(daysBetween('2026-10-14', '2026-10-10'), -4);
  assert.equal(daysBetween('2026-10-14', 'nonsense'), undefined);
  const a: Advert = { id: 'a', platform: 'PropertyGuru', status: 'live', end: '2026-10-13' };
  assert.equal(shownStatus(a, T), 'expired');
  assert.equal(a.status, 'live');
  assert.equal(shownStatus({ ...a, end: '2026-10-14' }, T), 'live', 'ends today: still live');
  assert.equal(shownStatus({ ...a, status: 'paused' }, T), 'paused', 'only live adverts turn expired by date');
  assert.equal(shownStatus({ id: 'b', platform: 'x' }, T), undefined);
});

test('AD2 every status and type the brief names exists', () => {
  assert.deepEqual([...AD_STATUSES].sort(), ['expired', 'live', 'needs_update', 'paused', 'planned']);
  for (const lang of ['en', 'bm', 'zh'] as const) for (const t of AD_TYPES) assert.ok(adStrings[lang].types[t], `${lang} ${t}`);
});

test('AD3 validation: bad link, expiry before publish date, negative cost are refused; a normal advert passes', () => {
  assert.deepEqual(validateAd({ id: 'a', platform: '  ' }), ['platform'], 'a platform name is required');
  assert.deepEqual(validateAd({ id: 'a', platform: 'x', url: 'www.example.com' }), ['url']);
  assert.deepEqual(validateAd({ id: 'a', platform: 'x', url: 'javascript:alert(1)' }), ['url']);
  assert.deepEqual(validateAd({ id: 'a', platform: 'x', url: 'https://www.propertyguru.com.my/listing/123' }), []);
  assert.deepEqual(validateAd({ id: 'a', platform: 'x', start: '2026-10-10', end: '2026-10-01' }), ['dates']);
  assert.deepEqual(validateAd({ id: 'a', platform: 'x', cost: -5 }), ['cost']);
  assert.deepEqual(validateAd({ id: 'a', platform: 'x', cost: 0, start: '2026-10-01', end: '2026-10-01' }), []);
});

test('AD4 a fake listing is always flagged, always planned (never live), and never counted as real', () => {
  const f = newFakeAd('f1', { status: 'live', cost: 999 });
  assert.equal(f.fake, true);
  assert.equal(f.status, 'planned');
  assert.equal(isRealAd({}, f), false);
  assert.equal(isRealAd({}, newAd('r')), true);
  assert.equal(isRealAd({ sample: true }, newAd('r')), false, 'adverts on a sample property are not real');
});

test('AD5 attention list: expired, needs update and expiring soon — but never test, sample, planned, paused or already-expired adverts', () => {
  const l = prop('p1', [
    { id: 'e', platform: 'A', status: 'live', end: '2026-10-10' },
    { id: 'n', platform: 'B', status: 'needs_update' },
    { id: 's', platform: 'C', status: 'live', end: '2026-10-16' },
    { id: 'far', platform: 'D', status: 'live', end: '2026-12-31' },
    { id: 'pa', platform: 'E', status: 'paused', end: '2026-10-10' },
    { id: 'pl', platform: 'F', status: 'planned', end: '2026-10-15' },
    { id: 'ex', platform: 'G', status: 'expired', end: '2026-10-01' },
    { id: 'fk', platform: 'H', status: 'live', end: '2026-10-10', fake: true },
  ]);
  const sample = prop('p2', [{ id: 'sm', platform: 'I', status: 'live', end: '2026-10-10' }], { sample: true });
  const got = attention([l, sample], T);
  assert.deepEqual(got.map(x => [x.adId, x.kind]), [['e', 'expired'], ['n', 'needs_update'], ['s', 'expiring']]);
  assert.equal(got[0].days, -4);
  assert.equal(got[2].days, 2);
});

test('AD6 the reminder window is the advert\'s own setting (default 3 days)', () => {
  const l = (remindDays?: number) => prop('p', [{ id: 'a', platform: 'A', status: 'live', end: '2026-10-20', remindDays }]);
  assert.equal(attention([l()], T).length, 0, '6 days left, default window is 3');
  assert.equal(attention([l(7)], T).length, 1);
  assert.equal(attention([l(0)], '2026-10-20').length, 1, 'on the day');
});

test('AD7 phone reminders: 9:00 on the reminder day, only for real running adverts with a future time', () => {
  const l = prop('p', [
    { id: 'a', platform: 'A', status: 'live', end: '2026-10-20' },
    { id: 'b', platform: 'B', status: 'live', end: '2026-10-20', fake: true },
    { id: 'c', platform: 'C', status: 'paused', end: '2026-10-20' },
    { id: 'd', platform: 'D', status: 'live', end: '2026-10-15' },
    { id: 'e', platform: 'E', status: 'live', end: '2026-10-25', remindDays: 7 },
  ]);
  const now = new Date(2026, 9, 14, 12, 0).getTime();
  const r = adReminders([l, prop('s', [{ id: 'z', platform: 'Z', status: 'live', end: '2026-10-20' }], { sample: true })], now);
  assert.deepEqual(r.map(x => x.adId), ['a', 'e'], 'a: 17 Oct; e: 18 Oct (7 days before 25 Oct); d was due 12 Oct (past); fake, paused and sample never remind');
  assert.equal(r[0].at, new Date(2026, 9, 17, 9, 0).getTime());
  assert.equal(r[1].at, new Date(2026, 9, 18, 9, 0).getTime());
  assert.equal(new Set(r.map(x => x.key)).size, 2, 'distinct stable keys');
});

test('AD8 cost summary: real adverts only, by property / platform / month; tests and samples are counted separately, never added in', () => {
  const p1 = prop('p1', [
    { id: 'a', platform: 'PropertyGuru', start: '2026-09-05', cost: 300 },
    { id: 'b', platform: 'Mudah', start: '2026-10-01', cost: 100 },
    { id: 'c', platform: 'PropertyGuru', start: '2026-10-09' },
    { id: 'f', platform: 'iProperty', start: '2026-10-02', cost: 5000, fake: true },
  ]);
  const p2 = prop('p2', [{ id: 'd', platform: 'PropertyGuru', cost: 250 }]);
  const sm = prop('p3', [{ id: 'e', platform: 'PropertyGuru', start: '2026-10-03', cost: 9999 }], { sample: true });
  const s = costSummary([p1, p2, sm], title);
  assert.equal(s.total, 650);
  assert.equal(s.count, 4);
  assert.equal(s.withCost, 3);
  assert.equal(s.withoutCost, 1);
  assert.equal(s.testCount, 1);
  assert.equal(s.sampleCount, 1);
  assert.deepEqual(s.byProperty.map(x => [x.label, x.total]), [['P1', 400], ['P2', 250]]);
  assert.deepEqual(s.byPlatform.map(x => [x.label, x.total, x.count]), [['PropertyGuru', 550, 3], ['Mudah', 100, 1]]);
  assert.deepEqual(s.byMonth.map(x => [x.key, x.total]), [['2026-10', 100], ['2026-09', 300], [UNDATED, 250]], 'newest month first, undated last');
});

test('AD9 cost summary period limits use the published date; adverts with no date drop out when a limit is set', () => {
  const p = prop('p', [
    { id: 'a', platform: 'A', start: '2026-09-30', cost: 1 }, { id: 'b', platform: 'A', start: '2026-10-01', cost: 10 },
    { id: 'c', platform: 'A', start: '2026-10-31', cost: 100 }, { id: 'd', platform: 'A', start: '2026-11-01', cost: 1000 }, { id: 'e', platform: 'A', cost: 10000 },
  ]);
  assert.equal(costSummary([p], title, { from: '2026-10-01', to: '2026-10-31' }).total, 110);
  assert.equal(costSummary([p], title, { from: '2026-10-01' }).total, 1110);
  assert.equal(costSummary([p], title).total, 11111);
  assert.equal(costSummary([], title).total, 0);
});

test('AD10 saving an advert keeps the other adverts and the rest of the record, adds a history entry, and a test advert does not mark the property as advertised', () => {
  const l = prop('p', [{ id: 'a', platform: 'A', status: 'live' }], { askingPrice: 100, marketing: { ads: [{ id: 'a', platform: 'A', status: 'live' }], custom: { x: 'y' } } });
  const added = saveAd(l, newAd('b', { platform: 'Mudah', cost: 50 }), 5);
  assert.deepEqual(added.marketing!.ads.map(a => a.id), ['a', 'b']);
  assert.equal(added.marketing!.advertised, 'yes');
  assert.deepEqual(added.marketing!.custom, { x: 'y' });
  assert.equal(added.askingPrice, 100);
  assert.equal(added.history![0].source, 'form');
  const edited = saveAd(added, { ...added.marketing!.ads[1], cost: 75 }, 6);
  assert.equal(edited.marketing!.ads.length, 2);
  assert.equal(edited.marketing!.ads[1].cost, 75);
  const bare = prop('q', [], { marketing: { ads: [], custom: {} } });
  const withFake = saveAd(bare, newFakeAd('f'), 7);
  assert.equal(withFake.marketing!.advertised, undefined, 'a test advert is not "advertised"');
  assert.match(withFake.history![0].summary, /test/);
  const gone = deleteAd(added, 'a', 8);
  assert.deepEqual(gone.marketing!.ads.map(a => a.id), ['b']);
  assert.equal(deleteAd(gone, 'nope', 9), gone);
});

test('AD11 adverts saved before Stage 6 (no new fields) still validate, show and count', () => {
  const old: Advert = { id: 'o', platform: 'Mudah', start: '2026-10-01', end: '2026-10-30', ref: 'M-1', status: 'live', notes: 'x' };
  assert.deepEqual(validateAd(old), []);
  assert.equal(shownStatus(old, T), 'live');
  const s = costSummary([prop('p', [old])], title);
  assert.equal(s.count, 1); assert.equal(s.withoutCost, 1); assert.equal(s.total, 0);
});

test('AD12 text exists in English, Bahasa Malaysia and Chinese for every label, and the Fake Listing label is unmistakable', () => {
  const shape = (v: unknown): unknown => (typeof v === 'function' ? 'fn' : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shape(x)])) : typeof v);
  assert.deepEqual(shape(adStrings.bm), shape(adStrings.en));
  assert.deepEqual(shape(adStrings.zh), shape(adStrings.en));
  assert.match(adStrings.en.fakeLabel, /TEST/); assert.match(adStrings.bm.fakeLabel, /UJIAN/); assert.match(adStrings.zh.fakeLabel, /测试/);
  assert.match(adStrings.en.intro, /never posts/);
  for (const l of ['en', 'bm', 'zh'] as const) assert.ok(adStrings[l].attn.expired(-3).includes('3'));
});
