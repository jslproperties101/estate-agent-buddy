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

// ---------- JoyChange010-04: share into the app, Shared Documents tray, move between folders ----------
import { MemoryBackend } from '../src/data/backend';
import { Store } from '../src/data/store';
import { addShared, removeShared, moveSharedToProperty, moveDocToFolder, sharedTray, cleanFileName, MAX_SHARED_BYTES, movableTargets } from '../src/share/inbox';
import { pullShared } from '../src/native/share';
import { guessFolder } from '../src/share/SharedDocsUI';
import { fileRefs, cloudFileRefs } from '../src/data/fileRefs';
import { shareStrings } from '../src/share/strings';

async function fresh() {
  const s = await Store.open(new MemoryBackend());
  s.upsert('properties', L({ id: 'p1', ref: 'S1001', documents: [] }));
  return s;
}
const blob = (text: string, type = 'application/pdf') => new Blob([text], { type });

test('J10-04a shared files land in the tray, newest first, with safe names; empty and too-big files are refused', async () => {
  const s = await fresh();
  const big = { size: MAX_SHARED_BYTES + 1, type: 'application/pdf' } as Blob;
  const r = await addShared(s, [{ name: 'Geran.pdf', blob: blob('x') }, { name: '../../etc/x.jpg', mime: 'image/jpeg', blob: blob('y', 'image/jpeg') }, { name: 'huge.pdf', blob: big }, { name: 'empty.pdf', blob: blob('') }]);
  assert.equal(r.added, 2);
  assert.deepEqual(r.tooBig, ['huge.pdf']);
  assert.deepEqual(sharedTray(s.getState()).map(f => f.name).sort(), ['Geran.pdf', 'x.jpg']);
  assert.equal(cleanFileName('', 'application/pdf'), 'Shared file.pdf');
  assert.equal(cleanFileName('a\u0000b.pdf'), 'ab.pdf');
  assert.ok(cleanFileName('x'.repeat(300) + '.pdf').endsWith('.pdf') && cleanFileName('x'.repeat(300) + '.pdf').length === 120);
  assert.equal(fileRefs(s.getState()).length, 0, 'a tray file belongs to no record yet');
});

test('J10-04b moving a tray file puts it in the chosen property folder and takes it out of the tray', async () => {
  const s = await fresh();
  await addShared(s, [{ name: 'Floor plan.pdf', blob: blob('fp') }]);
  const f = sharedTray(s.getState())[0];
  assert.equal(await moveSharedToProperty(s, f.id, 'p1', 'floorplan'), 'moved');
  const p = s.getState().properties.find(x => x.id === 'p1')!;
  assert.equal(p.documents!.length, 1);
  assert.deepEqual({ cat: p.documents![0].category, name: p.documents![0].name, file: p.documents![0].fileId }, { cat: 'floorplan', name: 'Floor plan.pdf', file: f.fileId });
  assert.equal(sharedTray(s.getState()).length, 0);
  assert.equal(await s.hasFile(f.fileId), true, 'the file itself is kept');
  assert.equal(await moveSharedToProperty(s, f.id, 'p1', 'title'), 'no-file', 'cannot be moved twice');
});

test('J10-04c a move is refused for a missing, archived or not-allowed property and for an unknown folder', async () => {
  const s = await fresh();
  s.upsert('properties', L({ id: 'p2', archived: { at: 1 } as never }));
  await addShared(s, [{ name: 'a.pdf', blob: blob('a') }]);
  const f = sharedTray(s.getState())[0];
  assert.equal(await moveSharedToProperty(s, f.id, 'nope', 'other'), 'no-property');
  assert.equal(await moveSharedToProperty(s, f.id, 'p2', 'other'), 'no-property');
  assert.equal(await moveSharedToProperty(s, f.id, 'p1', 'bogus' as never), 'bad-folder');
  assert.deepEqual(movableTargets(s.getState()).map(p => p.id), ['p1'], 'archived properties are not offered');
  assert.equal(sharedTray(s.getState()).length, 1, 'nothing moved');
});

test('J10-04d deleting from the tray removes the file from the phone', async () => {
  const s = await fresh();
  await addShared(s, [{ name: 'junk.jpg', mime: 'image/jpeg', blob: blob('j', 'image/jpeg') }]);
  const f = sharedTray(s.getState())[0];
  assert.equal(removeShared(s, f.id), true);
  await s.flush?.();
  assert.equal(sharedTray(s.getState()).length, 0);
  assert.equal(await s.hasFile(f.fileId), false);
  assert.equal(removeShared(s, f.id), false);
});

test('J10-04e moving a document between folders keeps the file; into a confidential folder an uploaded file gets a private copy', async () => {
  const s = await fresh();
  const local = await s.putFile(blob('plan'));
  const docs = [{ id: 'd1', category: 'floorplan' as const, name: 'plan.pdf', fileId: local, added: 1 }, { id: 'd2', category: 'other' as const, name: 'x.pdf', fileId: 'f2', added: 2 }];
  let moved = await moveDocToFolder(s, docs, 'd1', 'brochure');
  assert.equal(moved.find(d => d.id === 'd1')!.category, 'brochure');
  assert.equal(moved.find(d => d.id === 'd1')!.fileId, local, 'same file, never left the phone');
  // the file was already uploaded to the shared team bucket: moving it into Title documents makes a private copy
  s.setFileEntry({ ...s.fileEntry(local)!, status: 'uploaded' });
  const changes: [string | undefined, string | undefined][] = [];
  moved = await moveDocToFolder(s, moved, 'd1', 'title', (a, g) => changes.push([a, g]));
  const d1 = moved.find(d => d.id === 'd1')!;
  assert.equal(d1.category, 'title');
  assert.notEqual(d1.fileId, local);
  assert.deepEqual(changes, [[d1.fileId, local]]);
  s.upsert('properties', { ...s.getState().properties.find(x => x.id === 'p1')!, documents: moved });
  assert.ok(!cloudFileRefs(s.getState()).some(r => r.fileId === d1.fileId), 'the new copy never goes to the team bucket');
  assert.equal(await moveDocToFolder(s, moved, 'd1', 'title'), moved, 'same folder: nothing changes');
});

test('J10-04f the phone receiver reads the copies, fills the tray and deletes the copies; too-big files are reported', async () => {
  const s = await fresh();
  const removed: string[][] = [];
  const plugin = {
    take: async () => ({ files: [{ name: 'Geran.jpg', mime: 'image/jpeg', path: '/c/1' }, { name: 'Video.pdf', tooBig: true }, { name: 'bad.pdf', path: '/c/2' }] }),
    remove: async (o: { paths: string[] }) => { removed.push(o.paths); },
  };
  const r = await pullShared(s, plugin, async p => { if (p === '/c/2') throw new Error('gone'); return blob('img', 'image/jpeg'); });
  assert.equal(r.added, 1); assert.deepEqual(r.tooBig, ['Video.pdf']); assert.equal(r.unreadable, 1);
  assert.deepEqual(removed, [['/c/1', '/c/2']]);
  assert.equal(sharedTray(s.getState())[0].name, 'Geran.jpg');
});

test('J10-04g a first guess of the folder from the file name, and words in three languages', () => {
  assert.equal(guessFolder('Floor Plan Unit 3.pdf'), 'floorplan');
  assert.equal(guessFolder('GERAN hakmilik.jpg'), 'title');
  assert.equal(guessFolder('SPA signed.pdf'), 'transaction');
  assert.equal(guessFolder('Brosur Taman A.pdf'), 'brochure');
  assert.equal(guessFolder('IMG-20261021-WA0004.jpg'), 'other');
  for (const lang of ['en', 'bm', 'zh'] as const) assert.ok(shareStrings[lang].title && shareStrings[lang].moveToFolder && shareStrings[lang].how);
});
