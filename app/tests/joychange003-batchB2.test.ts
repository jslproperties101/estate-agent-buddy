// JoyChange003 Batch B2 (Change 51): remembered dropdown values follow the account across phones. Two (or more) phones
// and the stand-in cloud of tests/support/fakeCloud.ts, which follows supabase/migrations/20261019120000_*.sql (the SQL
// itself is checked by supabase/tests/user-options-test.sh).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { syncNow } from '../src/data/sync';
import { optionsAfterRename, optionsAfterDelete } from '../src/listing/optionEdit';
import { diffOptions, applyRows, settle, queue, optKey } from '../src/data/optionSync';
import type { Store } from '../src/data/store';
import { FakeCloud, cfg, phone } from './support/fakeCloud';

const sync = (s: Store, c: FakeCloud) => syncNow(s, cfg, c.fetch);
const vals = (s: Store, list: string) => (s.getState().options[list] ?? []).map(o => o.value).sort();
const later = () => new Promise(r => setTimeout(r, 3));

test('B2-1 values remembered on one phone (also before this version, also the agent\'s own WhatsApp texts) reach the other phone of the same account', async () => {
  const cloud = new FakeCloud();
  const a = await phone(cloud, 'joe@x.c'); const b = await phone(cloud, 'joe@x.c');
  a.store.addOption('township', 'Sungai Besi');
  a.store.addOption('waTexts', 'Hi {name}, see you soon');
  const r = await sync(a.store, cloud);
  assert.equal(r.optionsSent, 2);
  assert.deepEqual(a.store.getState().meta.optSync?.pending, {}, 'nothing left waiting');
  await sync(b.store, cloud);
  assert.deepEqual(vals(b.store, 'township'), ['Sungai Besi']);
  assert.deepEqual(vals(b.store, 'waTexts'), ['Hi {name}, see you soon']);
});

test('B2-2 a deletion and a rename on one phone are made on the other; the deletion does not come back from a phone that was offline', async () => {
  const cloud = new FakeCloud();
  const a = await phone(cloud, 'joe@x.c'); const b = await phone(cloud, 'joe@x.c');
  for (const v of ['Cheras', 'Kepong', 'Setapak']) a.store.addOption('township', v);
  await sync(a.store, cloud); await sync(b.store, cloud);
  await later();
  b.store.removeOption('township', 'Kepong');
  b.store.setSingleton('options', optionsAfterRename(b.store.getState().options, 'township', 'Setapak', 'Setapak Jaya'));
  await sync(b.store, cloud);
  await sync(a.store, cloud);
  assert.deepEqual(vals(a.store, 'township'), ['Cheras', 'Setapak Jaya']);
  // a phone that was offline the whole time and never changed Kepong does not bring it back
  await sync(a.store, cloud); await sync(b.store, cloud);
  assert.deepEqual(vals(b.store, 'township'), ['Cheras', 'Setapak Jaya']);
  // deleting a parent entry empties the lists under it, on the other phone too
  a.store.addOption('street@Selangor/Shah Alam', 'Jalan Kebun');
  await sync(a.store, cloud); await sync(b.store, cloud);
  assert.deepEqual(vals(b.store, 'street@Selangor/Shah Alam'), ['Jalan Kebun']);
});

test('B2-3 the same value changed on two phones offline: the change made last wins, on both', async () => {
  const cloud = new FakeCloud();
  const a = await phone(cloud, 'joe@x.c'); const b = await phone(cloud, 'joe@x.c');
  a.store.addOption('township', 'Bukit Jalil');
  await sync(a.store, cloud); await sync(b.store, cloud);
  await later();
  a.store.removeOption('township', 'Bukit Jalil');          // first
  await later();
  b.store.touchOption('township', 'Bukit Jalil');           // later: used again on the other phone
  await sync(a.store, cloud); await sync(b.store, cloud); await sync(a.store, cloud);
  assert.deepEqual(vals(a.store, 'township'), ['Bukit Jalil'], 'the later use wins');
  assert.deepEqual(vals(b.store, 'township'), ['Bukit Jalil']);
  await later();
  b.store.removeOption('township', 'Bukit Jalil');
  await sync(b.store, cloud); await sync(a.store, cloud);
  assert.deepEqual(vals(a.store, 'township'), [], 'and a later deletion wins too');
});

test('B2-4 values belong to the person: a teammate in the same workspace never receives them', async () => {
  const cloud = new FakeCloud();
  const a = await phone(cloud, 'joe@x.c');
  const t = await phone(cloud, 'mate@x.c', { role: 'agent' });
  a.store.addOption('waTexts', 'Private wording');
  await sync(a.store, cloud); await sync(t.store, cloud);
  assert.deepEqual(vals(t.store, 'waTexts'), []);
});

test('B2-5 another account signs in on the same phone: its own values replace the previous person\'s', async () => {
  const cloud = new FakeCloud();
  const other = await phone(cloud, 'ann@x.c');
  other.store.addOption('township', 'Cyberjaya');
  await sync(other.store, cloud);
  const a = await phone(cloud, 'joe@x.c');
  a.store.addOption('township', 'Kajang');
  await sync(a.store, cloud);
  const ann = cloud.users.get('ann@x.c')!;
  a.store.setSingleton('meta', { syncSession: { accessToken: `tok-${ann.id}`, refreshToken: 'r', expiresAt: Date.now() + 3600_000, email: 'ann@x.c', userId: ann.id } });
  await sync(a.store, cloud);
  assert.deepEqual(vals(a.store, 'township'), ['Cyberjaya']);
  assert.ok(![...cloud.options.values()].some(o => o.user === ann.id && o.value === 'Kajang'), 'Joe\'s values were not given to Ann');
});

test('B2-6 an older cloud without the table: records still sync and nothing fails; a lost connection keeps the change waiting', async () => {
  const cloud = new FakeCloud();
  cloud.optionsTable = false;
  const a = await phone(cloud, 'joe@x.c');
  a.store.addOption('township', 'Cheras');
  a.store.upsert('contacts', { id: 'c1', created: 1, updated: 1, name: 'Lim', roles: ['buyer'] });
  const r = await sync(a.store, cloud);
  assert.equal(r.pushed, 1); assert.equal(r.optionsFailed, undefined); assert.equal(r.optionsSent, undefined);
  assert.deepEqual(vals(a.store, 'township'), ['Cheras'], 'kept on the phone');
  cloud.optionsTable = true;
  cloud.failNext('eab_options_push');
  const r2 = await sync(a.store, cloud);
  assert.equal(r2.optionsFailed, true, 'the account part failed, the sync itself did not');
  assert.ok(Object.keys(a.store.getState().meta.optSync!.pending).length >= 1, 'still waiting');
  const r3 = await sync(a.store, cloud);
  assert.ok((r3.optionsSent ?? 0) >= 1);
  assert.ok([...cloud.options.values()].some(o => o.value === 'Cheras'));
});

test('B2-7 the rules: what changed, waiting changes, a newer local change is not overwritten, settled only when unchanged', () => {
  const before = { township: [{ value: 'Cheras', added: 1, used: 1 }, { value: 'Kepong', added: 1, used: 1 }] };
  const after = { township: [{ value: 'Cheras', added: 1, used: 5 }], city: [{ value: 'Nilai', added: 6, used: 6 }] };
  const d = diffOptions(before, after, 100);
  assert.deepEqual(d.map(x => `${x.list}:${x.value}:${x.deleted}`).sort(), ['city:Nilai:false', 'township:Cheras:false', 'township:Kepong:true']);
  assert.deepEqual(diffOptions(before, optionsAfterDelete(before, 'township', 'Kepong'), 1).map(x => x.value), ['Kepong']);
  const pending = queue({}, d);
  const mine = pending[optKey('township', 'cheras')];
  assert.ok(mine);
  assert.equal(applyRows(after, [{ list: 'township', value: 'Cheras', deleted: true, added: 1, used: 1, updated: 50, seq: 1 }], pending), undefined, 'an older cloud change does not undo a newer one here');
  assert.deepEqual(applyRows(after, [{ list: 'township', value: 'Cheras', deleted: true, added: 1, used: 1, updated: 500, seq: 2 }], pending)?.township, []);
  assert.equal(Object.keys(settle(pending, d)).length, 0);
  const changedAgain = queue(pending, [{ ...mine, used: 9, updated: 200 }]);
  assert.ok(settle(changedAgain, d)[optKey('township', 'Cheras')], 'changed again during the send: still waiting');
});
