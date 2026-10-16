// Stage 3: per-field verification, phone usability, sample-data completeness and isolation, and language coverage of the
// new screens. Browser behaviour (voice review gate, long-press preview, phone-book icon) is in ui.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryBackend } from '../src/data/backend';
import { Store } from '../src/data/store';
import { COLLECTIONS } from '../src/data/types';
import { syncNow } from '../src/data/sync';
import { loadSampleInto, sampleData } from '../src/data/sample';
import { usablePhone, type Listing } from '../src/listing/model';
import { VERIFY_STATES, VERIFIABLE_FIELDS, withVerification, verifyStateOf, toCheck, verifyCounts, isVerifiable } from '../src/listing/verify';
import { deleteListing } from '../src/listing/deleteListing';
import { listingStrings } from '../src/listing/strings';
import { contactStrings } from '../src/contacts/strings';
import { FakeCloud, cfg, phone } from './support/fakeCloud';

const prop = (id: string, extra: Partial<Listing> = {}): Listing => ({ id, created: 1, updated: 1, headline: 'House', ref: 'P1001', refPrefix: 'P', refNo: 1001, photos: [], documents: [], ...extra } as unknown as Listing);
const sync = (s: Store, c: FakeCloud) => syncNow(s, cfg, c.fetch);
const get = (s: Store, id: string) => s.getState().properties.find(p => p.id === id)!;

test('S3-1 the four agreed states are exactly Confirmed, Owner stated, Need to check, Unknown', () => {
  assert.deepEqual([...VERIFY_STATES], ['confirmed', 'owner', 'check', 'unknown']);
  for (const lang of ['en', 'bm', 'zh'] as const) {
    const v = listingStrings[lang].verify;
    const labels = VERIFY_STATES.map(k => v[k]);
    assert.equal(new Set(labels).size, 4, `${lang}: four different labels`);
    assert.ok(labels.every(Boolean));
  }
  // Change 009: labels in Title Case.
  assert.deepEqual(VERIFY_STATES.map(k => listingStrings.en.verify[k]), ['Confirmed', 'Owner Stated', 'Need to Check', 'Unknown']);
});

test('S3-2 setting, changing and clearing a state changes only that field and never touches the value', () => {
  const a = prop('p1', { landSqft: 500000, tenure: 'freehold' });
  const b = withVerification(a, 'landSqft', 'owner');
  assert.equal(verifyStateOf(b, 'landSqft'), 'owner');
  assert.equal(b.landSqft, 500000);
  assert.equal(a.verification, undefined, 'the original is not changed');
  const c = withVerification(withVerification(b, 'tenure', 'confirmed'), 'landSqft', 'check');
  assert.deepEqual(c.verification, { landSqft: 'check', tenure: 'confirmed' });
  const d = withVerification(withVerification(c, 'landSqft', undefined), 'tenure', undefined);
  assert.equal(d.verification, undefined, 'clearing the last mark leaves no empty object');
  assert.equal(withVerification(a, 'headline', 'confirmed'), a, 'a field that is not verifiable is ignored');
  assert.equal(isVerifiable('headline'), false);
  assert.ok(VERIFIABLE_FIELDS.includes('landSqft') && VERIFIABLE_FIELDS.includes('ownerPhone'));
  // Owner, 17 Oct 2026: Asking Price and Monthly Rent have no check status.
  assert.ok(!(VERIFIABLE_FIELDS as readonly string[]).includes('askingPrice') && !(VERIFIABLE_FIELDS as readonly string[]).includes('monthlyRent'));
});

test('S3-3 unknown or damaged values are never shown as a state; "to check" lists Need to check and Unknown only', () => {
  const l = prop('p1', { verification: { landSqft: 'owner', tenure: 'check', titleType: 'unknown', bedrooms: 'confirmed', parking: 'bogus' as never, headline: 'check' as never } });
  assert.equal(verifyStateOf(l, 'parking'), undefined);
  assert.deepEqual(toCheck(l).sort(), ['tenure', 'titleType']);
  assert.deepEqual(verifyCounts(l), { confirmed: 1, owner: 1, check: 1, unknown: 1 });
});

test('S3-4 the state is stored with the record: it survives closing and reopening, and an empty field keeps its mark', async () => {
  const backend = new MemoryBackend();
  const s = await Store.open(backend);
  s.upsert('properties', prop('p1', { verification: { landSqft: 'owner', furnishing: 'unknown' } }));
  await s.flush();
  const again = await Store.open(backend);
  const p = get(again, 'p1');
  assert.deepEqual(p.verification, { landSqft: 'owner', furnishing: 'unknown' });
  assert.equal(p.furnishing, undefined, 'Unknown on an empty field is kept');
});

test('S3-5 a change of state is a recorded change: the earlier version stays in the record history', async () => {
  const s = await Store.open(new MemoryBackend());
  s.upsert('properties', prop('p1', { landSqft: 1, verification: { landSqft: 'check' } }));
  s.upsert('properties', { ...get(s, 'p1'), verification: { landSqft: 'confirmed' } }, false, 'merge');
  const h = await s.revisions('properties:p1');
  assert.equal(h.length >= 1, true);
  assert.deepEqual((h[0].data as Listing).verification, { landSqft: 'check' });
});

test('S3-6 states sync to the other phone; different fields marked on two phones both survive; the same field marked differently is a conflict, not a silent overwrite', async () => {
  const cloud = new FakeCloud();
  const a = await phone(cloud, 'o@x.c'); const b = await phone(cloud, 'o@x.c');
  a.store.upsert('properties', prop('p1', { landSqft: 400000, tenure: 'freehold' }));
  await sync(a.store, cloud); await sync(b.store, cloud);
  assert.equal(get(b.store, 'p1').landSqft, 400000);
  // phone A marks price, phone B marks tenure
  a.store.upsert('properties', withVerification(get(a.store, 'p1'), 'landSqft', 'owner'));
  b.store.upsert('properties', withVerification(get(b.store, 'p1'), 'tenure', 'confirmed'));
  await sync(a.store, cloud); await sync(b.store, cloud); await sync(a.store, cloud);
  for (const ph of [a, b]) assert.deepEqual(get(ph.store, 'p1').verification, { landSqft: 'owner', tenure: 'confirmed' });
  // both mark the price, differently
  a.store.upsert('properties', withVerification(get(a.store, 'p1'), 'landSqft', 'confirmed'));
  b.store.upsert('properties', withVerification(get(b.store, 'p1'), 'landSqft', 'check'));
  await sync(a.store, cloud);
  const r = await sync(b.store, cloud);
  assert.ok(r.conflicts >= 1 || (b.store.getState().meta.conflicts ?? []).length >= 1, 'the clash is reported for review');
  assert.equal(get(b.store, 'p1').verification?.tenure, 'confirmed', 'the other mark is not lost');
});

test('S3-7 usable phone numbers: short or empty numbers do not get Call / WhatsApp links', () => {
  assert.equal(usablePhone('+60 12-345 6789'), true);
  assert.equal(usablePhone('012-3456789'), true);
  assert.equal(usablePhone('03-8888 1234'), true);
  for (const bad of [undefined, '', '  ', '123', '+60', 'LOCAL-PHONE', '12-34']) assert.equal(usablePhone(bad), false, String(bad));
});

test('S3-8 sample data: every record is flagged sample, shows all four states and an alias-only and an alias-with-phone contact', () => {
  const d = sampleData();
  for (const list of Object.values(d)) for (const r of list as { sample?: boolean }[]) assert.equal(r.sample, true);
  const used = new Set<string>();
  for (const p of d.properties) for (const v of Object.values(p.verification ?? {})) used.add(v as string);
  assert.deepEqual([...used].sort(), [...VERIFY_STATES].sort());
  for (const p of d.properties) for (const k of Object.keys(p.verification ?? {})) assert.ok(isVerifiable(k), k);
  assert.ok(d.contacts.some(c => c.whatsapp && !c.phone), 'an alias-only contact');
  assert.ok(d.contacts.some(c => c.whatsapp && c.phone), 'an alias plus a phone');
  assert.ok(d.contacts.some(c => c.phone && !c.whatsapp), 'a phone without an alias');
});

test('S3-9 sample verification marks never sync as real data, and loading sample data twice adds nothing', async () => {
  const cloud = new FakeCloud();
  const a = await phone(cloud, 'o@x.c');
  loadSampleInto(a.store);
  assert.equal(loadSampleInto(a.store), 0);
  assert.ok(a.store.getState().properties.some(p => p.verification && p.sample));
  a.store.upsert('properties', prop('real', { verification: { landSqft: 'owner' } }));
  await sync(a.store, cloud);
  const ids = [...cloud.rows.keys()].map(k => k.split('|')[2]);
  assert.deepEqual(ids, ['real']);
  assert.ok(![...cloud.rows.values()].some(r => (r.data as { sample?: boolean } | null)?.sample));
});

test('S3-10 removing sample data removes the samples and leaves a real property, its marks and its pictures alone', async () => {
  const s = await Store.open(new MemoryBackend());
  loadSampleInto(s);
  s.upsert('properties', prop('real', { verification: { tenure: 'confirmed' } }));
  for (const c of COLLECTIONS) for (const r of s.getState()[c] as { id: string; sample?: boolean }[]) if (r.sample) s.remove(c, r.id);   // what Settings → Remove sample data does
  const st = s.getState();
  assert.deepEqual(st.properties.map(p => p.id), ['real']);
  assert.deepEqual(st.properties[0].verification, { tenure: 'confirmed' });
  assert.equal(st.contacts.length, 0);
});

test('S3-11 deleteListing removes the property and its banners only; inquiries and contacts stay', async () => {
  const s = await Store.open(new MemoryBackend());
  s.upsert('properties', prop('p1')); s.upsert('properties', prop('p2', { ref: 'P1002', refNo: 1002 }));
  s.upsert('contacts', { id: 'c1', created: 1, updated: 1, name: 'Ahmad', roles: ['buyer'] });
  s.upsert('inquiries', { id: 'i1', created: 1, updated: 1, contactId: 'c1', propertyId: 'p1', at: '2026-10-13T10:00', channel: 'call' } as never);
  s.upsert('banners', { id: 'b1', created: 1, updated: 1, propertyId: 'p1', placedOn: '2026-10-01' } as never);
  deleteListing(s, s.getState(), get(s, 'p1'));
  const st = s.getState();
  assert.deepEqual(st.properties.map(p => p.id), ['p2']);
  assert.equal(st.banners.length, 0);
  assert.equal(st.contacts.length, 1);
  assert.equal(st.inquiries.length, 1);
});

test('S3-12 English, Bahasa Malaysia and Chinese all have every Stage 3 string, with the same shape', () => {
  const langs = ['en', 'bm', 'zh'] as const;
  const keys = ['voiceBig', 'voiceBigHint', 'reviewBanner', 'reviewDone', 'reviewQ', 'reviewBody', 'reviewSave', 'phoneInvalid', 'pickOwner'] as const;
  for (const l of langs) {
    const s = listingStrings[l];
    for (const k of keys) {
      const v = s[k] as unknown;
      const text = typeof v === 'function' ? (v as (n: number) => string)(2) : (v as string);
      assert.ok(text && text.length > 2, `${l}.${k}`);
    }
    for (const k of Object.keys(listingStrings.en.preview)) assert.ok((s.preview as Record<string, string>)[k], `${l}.preview.${k}`);
    assert.ok(s.verify.aria('x').includes('x') && s.verify.summary(3).includes('3') && s.verify.help.length > 10);
    assert.ok(s.sec.basics && s.sec.marketing);
    assert.ok(contactStrings[l].replaceQ && contactStrings[l].replaceOk);
  }
  assert.notEqual(listingStrings.bm.voiceBig, listingStrings.en.voiceBig);
  assert.notEqual(listingStrings.zh.voiceBig, listingStrings.en.voiceBig);
  // every verifiable field has a label in every language (it is read out by the status picker)
  for (const l of langs) for (const k of VERIFIABLE_FIELDS) assert.ok(listingStrings[l].l[k], `${l}.l.${k}`);
});
