// EA AI Buddy reskin Phase C (owner's mockups, 9 Nov 2026): the Track My Sales chart figures, and the Phase C words.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Listing } from '../src/listing/model';
import { changeVsLastYear, receivedByMonth, totals } from '../src/deals/model';
import { reskinCStrings } from '../src/ui/reskinCStrings';

const L = (x: Partial<Listing>): Listing => ({ id: 'p1', created: 1, updated: 1, photos: [], ...x } as Listing);
const day = (y: number, m: number, d: number) => new Date(y, m - 1, d, 10, 0, 0);
const sold = (id: string, amount: number, on: string) => L({ id, status: 'sold', deal: { sale: { commissionReceived: amount, commissionReceivedDate: on } } });

test('RC1 the chart: commission received in each month of the year, by the date received; pending and other years left out', () => {
  const list = [
    sold('a', 20000, '2026-10-05'), sold('b', 5000, '2026-03-01'), sold('c', 1500.5, '2026-03-20'),
    L({ id: 'r', status: 'rented', deal: { rental: { commission: 1800, commissionReceivedDate: '2026-01-30' } } }),
    L({ id: 'old', status: 'rented', deal: { rental: { commission: 900, commissionReceivedDate: '2025-12-30' } } }),
    L({ id: 'pend', status: 'in_progress', deal: { booking: { agreedCommission: 12000 } } }),
    L({ id: 'oth', status: 'sold', deal: { soldBy: 'others', others: { price: 900000 } } }),
  ];
  const now = day(2026, 11, 9);
  const m = receivedByMonth(list, 2026, now);
  assert.equal(m.length, 12);
  assert.deepEqual([m[0], m[2], m[9], m[11]], [1800, 6500.5, 20000, 0]);
  assert.equal(m.reduce((x, y) => x + y, 0), totals(list, now).year, 'the bars add up to the year on the card');
  assert.deepEqual(receivedByMonth(list, 2025, now)[11], 900);
});

test('RC2 the change against last year compares the same months only, and is left out when last year had nothing', () => {
  const now = day(2026, 3, 15);
  const list = [sold('a', 10000, '2026-02-01'), sold('b', 8000, '2025-01-10'), sold('c', 50000, '2025-11-01')];
  assert.equal(changeVsLastYear(list, now), 25, 'Jan–Mar 2026 (10,000) against Jan–Mar 2025 (8,000); November 2025 not counted');
  assert.equal(changeVsLastYear([sold('a', 10000, '2026-02-01')], now), undefined);
  assert.equal(changeVsLastYear([sold('b', 8000, '2025-01-10')], now), -100);
});

test('RC3 every Phase C word exists in English, Malay and Chinese', () => {
  const shape = (o: unknown): string[] => (o && typeof o === 'object' ? Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' ? shape(v).map(x => `${k}.${x}`) : [k])) : []);
  const en = shape(reskinCStrings.en).sort();
  for (const lang of ['bm', 'zh'] as const) assert.deepEqual(shape(reskinCStrings[lang]).sort(), en, lang);
  for (const lang of ['en', 'bm', 'zh'] as const) assert.ok(reskinCStrings[lang].sales.chart(2026).includes('2026'));
});
