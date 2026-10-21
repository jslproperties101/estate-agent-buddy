// JoyChange010-02: "Rented - Pending TA Signing" is listed in Track My Sales, but earns nothing in the totals and has no deadlines.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Listing } from '../src/listing/model';
import { stageOf, STAGES, totals, upcoming, commissionOf } from '../src/deals/model';
import { cc001Strings } from '../src/ui/cc001Strings';

const L = (x: Partial<Listing>): Listing => ({ id: 'p1', created: 1, updated: 1, photos: [], ...x } as Listing);
const today = new Date(2026, 9, 21);

test('J10-02a a pending rental has its own stage, placed just before Rented', () => {
  assert.equal(stageOf(L({ status: 'rented_pending_ta' }), '2026-10-21'), 'rentpending');
  assert.equal(stageOf(L({ status: 'rented' }), '2026-10-21'), 'rented');
  assert.equal(STAGES.indexOf('rentpending') + 1, STAGES.indexOf('rented'));
});

test('J10-02b a pending rental counts for no money and no deadline, even with a rent and a tenancy end set', () => {
  const p = L({ status: 'rented_pending_ta', purpose: 'rent', monthlyRent: 2000, rentCommissionMonths: 1, deal: { rental: { commission: 1800, end: '2026-12-31', rentDueDay: 5 } } });
  assert.deepEqual(commissionOf(p, 'rentpending'), {});
  assert.deepEqual(totals([p], today), { received: 0, pending: 0, month: 0, year: 0 });
  assert.deepEqual(upcoming([p], 90, today), []);
});

test('J10-02c once the Tenancy Agreement is signed (plain Rented) the same property is counted again', () => {
  const p = L({ status: 'rented', purpose: 'rent', monthlyRent: 2000, rentCommissionMonths: 1 });
  assert.equal(totals([p], today).pending, 2000);
});

test('J10-02d the stage has a name in English, Malay and Chinese', () => {
  for (const lang of ['en', 'bm', 'zh'] as const) assert.ok(cc001Strings[lang].sales.stage.rentpending, lang);
  assert.match(cc001Strings.en.sales.stage.rentpending, /Pending TA Signing/);
});

// ---------- JoyChange010-03: the phone reports feed pushes (received / opened) ----------
import { FakeCloud, phone, cfg as fakeCfg } from './support/fakeCloud';
import { feedItemOf, ackFeedPush, pendingFeedAcks, clearFeedAcks } from '../src/native/push';

const ITEM = '11111111-2222-4333-8444-555555555555';
function server(okAt: () => boolean) {
  const calls: { url: string; body: unknown }[] = [];
  const fetchFn = (async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return new Response(okAt() ? 'true' : '{}', { status: okAt() ? 200 : 503 });
  }) as typeof fetch;
  return { calls, fetchFn };
}

test('J10-03a only a feed push with a proper post id is recognised, received or tapped', () => {
  assert.equal(feedItemOf({ data: { kind: 'feed', item_id: ITEM } }), ITEM, 'received while open');
  assert.equal(feedItemOf({ actionId: 'tap', notification: { data: { kind: 'feed', item_id: ITEM } } }), ITEM, 'tapped');
  assert.equal(feedItemOf({ data: { kind: 'invite', invite_id: ITEM } }), undefined, 'an invitation push is not a post');
  assert.equal(feedItemOf({ data: { kind: 'feed', item_id: 'x; drop' } }), undefined, 'a bad id is ignored');
  assert.equal(feedItemOf(undefined), undefined);
});

test('J10-03b the phone tells the server, and a report that failed offline is sent with the next one', async () => {
  clearFeedAcks();
  const a = await phone(new FakeCloud(), 'p@x.c');
  let online = false;
  const s = server(() => online);
  await ackFeedPush(a.store, fakeCfg, ITEM, 'received', s.fetchFn);
  assert.deepEqual(pendingFeedAcks(), [{ item: ITEM, what: 'received' }], 'kept while offline');
  online = true;
  await ackFeedPush(a.store, fakeCfg, ITEM, 'opened', s.fetchFn);
  const acks = s.calls.filter(c => c.url.endsWith('/rest/v1/rpc/eab_push_ack')).map(c => c.body);
  assert.deepEqual(acks.slice(-2), [{ p_item: ITEM, p_what: 'received' }, { p_item: ITEM, p_what: 'opened' }]);
  assert.deepEqual(pendingFeedAcks(), []);
});

test('J10-03c an invitation push sends no report; nothing is kept without a post id', async () => {
  clearFeedAcks();
  const a = await phone(new FakeCloud(), 'q@x.c');
  const s = server(() => true);
  await ackFeedPush(a.store, fakeCfg, feedItemOf({ data: { kind: 'invite', invite_id: ITEM } }), 'opened', s.fetchFn);
  assert.equal(s.calls.filter(c => c.url.includes('eab_push_ack')).length, 0);
  assert.deepEqual(pendingFeedAcks(), []);
});
