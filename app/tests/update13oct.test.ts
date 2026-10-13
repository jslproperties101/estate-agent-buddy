// 13 Oct 2026 update: name-card requirements, sample data kept apart from real data, phone book parsing, vendor
// statuses in the sample, field help completeness.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryBackend } from '../src/data/backend';
import { Store } from '../src/data/store';
import { syncNow, signIn } from '../src/data/sync';
import { FakeCloud, cfg } from './support/fakeCloud';
import { sampleData, loadSampleInto, isSampleKey, isEmptyWorkspace } from '../src/data/sample';
import { missingProfile, REQUIRED_PROFILE, shareText, DEFAULT_SHARE } from '../src/domain/namecard';
import { fromNative } from '../src/lib/phonebook';
import { HELP } from '../src/ui/help';
import { VENDOR_STATUSES } from '../src/data/types';

test('N1 name card: required details are full name, registration type and number, agency and a full phone number', () => {
  assert.deepEqual([...REQUIRED_PROFILE], ['fullName', 'regType', 'regNo', 'agency', 'phone']);
  assert.deepEqual(missingProfile({}), ['fullName', 'regType', 'regNo', 'agency', 'phone']);
  assert.deepEqual(missingProfile({ fullName: 'Agent J', regType: 'REN', regNo: '12345', agency: 'JSL', phone: '+60 12-34' }), ['phone'], 'a short number is not enough');
  const p = { fullName: 'Agent J', regType: 'REN', regNo: '12345', agency: 'JSL', phone: '+60 12-345 6789' };
  assert.deepEqual(missingProfile(p), []);
  assert.deepEqual(missingProfile({ ...p, agency: '   ' }), ['agency'], 'spaces only do not count');
  const text = shareText(p, DEFAULT_SHARE, { greeting: 'Hi', regLabel: t => `${t} No.`, agency: 'Agency', phone: 'Phone', email: 'Email', closing: 'Thanks' });
  assert.match(text, /\*Agent J\*\nREN No\.: 12345\nAgency: JSL\nPhone: \+60 12-345 6789/);
});

test('N2 sample data: every record marked, vendors have vendor statuses, linked only to sample records', () => {
  const d = sampleData(Date.UTC(2026, 9, 13));
  const all = Object.values(d).flat() as { id: string; sample?: boolean }[];
  assert.ok(all.length >= 45);
  assert.ok(all.every(r => r.sample === true), 'all marked sample');
  const vendors = d.contacts.filter(c => c.roles.some(r => r === 'vendor' || r === 'landlord'));
  assert.ok(vendors.every(v => v.vendorStatus && VENDOR_STATUSES.includes(v.vendorStatus)));
  assert.ok(vendors.some(v => v.vendorStatus === 'pending_info') && vendors.some(v => v.vendorStatus === 'pending_follow_up'));
  const ids = new Set(all.map(r => r.id));
  for (const x of [...d.tasks, ...d.appointments, ...d.inquiries] as { contactId?: string; propertyId?: string }[]) {
    if (x.contactId) assert.ok(ids.has(x.contactId)); if (x.propertyId) assert.ok(ids.has(x.propertyId));
  }
  for (const t of d.tasks) assert.match(t.title, /\(sample\)/);
  assert.ok(d.appointments.some(a => a.kind === 'viewing' && a.status === 'pending'), 'a viewing still to confirm');
  assert.ok(isSampleKey('properties:s1') && !isSampleKey('properties:abc'));
});

test('N3 sample data never goes to the cloud (nor its deletions); real records still sync; a clean workspace is empty', async () => {
  const s = await Store.open(new MemoryBackend());
  assert.ok(isEmptyWorkspace(s.getState() as unknown as Record<string, unknown>));
  const n = loadSampleInto(s);
  assert.ok(n > 40);
  assert.equal(loadSampleInto(s), 0, 'loading twice adds nothing');
  s.remove('tasks', 't1');
  s.upsert('contacts', { id: 'real1', created: 1, updated: 1, name: 'Real buyer', roles: ['buyer'] });
  const cloud = new FakeCloud();
  // A sample record somehow in the cloud is not taken down either.
  cloud.rows.set('ws1|contacts|x9', { data: { id: 'x9', created: 1, updated: 99, name: 'Cloud sample', roles: ['buyer'], sample: true }, deleted: false, rev: 1, seq: 1, user_id: 'u-a@b.c', updated: 99 });
  cloud.seq = 1;
  s.setSingleton('meta', { syncSession: await signIn(cfg, 'a@b.c', 'pw', cloud.addUser('a@b.c') && cloud.fetch) });
  const r = await syncNow(s, cfg, cloud.fetch);
  assert.deepEqual([...cloud.rows.keys()].filter(k => !k.endsWith('x9')).map(k => k.split('|')[2]), ['real1'], 'only the real record is sent');
  assert.equal(r.pulled, 0);
  assert.ok(!s.getState().contacts.some(c => c.id === 'x9'));
  assert.deepEqual(s.getState().meta.dirty, [], 'nothing left waiting');
});

test('N4 phone book: name and first number read from the Android plugin, whichever field names it uses', () => {
  assert.deepEqual(fromNative({ name: { display: 'Puan Siti' }, phones: [{ number: '012-345 6789' }], emails: [{ address: 's@x.my' }] }), { name: 'Puan Siti', tel: '012-345 6789', email: 's@x.my' });
  assert.deepEqual(fromNative({ name: { given: 'Lim', family: 'Ah Kow' }, phoneNumbers: [{ value: '+60123' }] }), { name: 'Lim Ah Kow', tel: '+60123', email: undefined });
  assert.equal(fromNative({ name: {} }), null);
  assert.equal(fromNative(undefined), null);
});

test('N5 field help: every topic has what / enter in all three languages', () => {
  for (const [k, topic] of Object.entries(HELP)) for (const l of ['en', 'bm', 'zh'] as const) {
    assert.ok(topic[l]?.what && topic[l]?.enter, `${k} ${l}`);
  }
  assert.ok(Object.keys(HELP).length >= 25);
});
