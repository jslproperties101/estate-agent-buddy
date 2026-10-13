// Phase 2: draft autosave rules (the browser behaviour of the forms is in ui.test.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryBackend } from '../src/data/backend';
import { Store } from '../src/data/store';
import { decideDraft, draftKeyFor, saveDraftIfChanged } from '../src/data/drafts';
import { recordHash } from '../src/data/hash';
import { recordStateOf } from '../src/data/recordstate';
import { syncNow } from '../src/data/sync';
import type { Contact } from '../src/data/types';
import { FakeCloud, cfg, phone } from './support/fakeCloud';

const contact = (id: string, name: string, extra: Partial<Contact> = {}): Contact => ({ id, created: 1, updated: 1, name, roles: ['buyer'], ...extra });

test('D1 nothing typed means no draft; typing writes one once; the same text is not written again', async () => {
  const s = await Store.open(new MemoryBackend());
  const start = contact('n1', '');
  const key = draftKeyFor('contacts', undefined);
  assert.equal(saveDraftIfChanged(s, key, 'contacts', undefined, recordHash(start), start, undefined), false);
  assert.equal(s.getDraft(key), undefined);
  const typed = { ...start, name: 'Ahma' };
  assert.equal(saveDraftIfChanged(s, key, 'contacts', undefined, recordHash(start), typed, undefined), true);
  assert.equal(saveDraftIfChanged(s, key, 'contacts', undefined, recordHash(start), typed, undefined), false);
  assert.equal(saveDraftIfChanged(s, key, 'contacts', undefined, recordHash(start), { ...typed, name: 'Ahmad' }, undefined), true);
  assert.equal((s.getDraft(key)?.data as Contact).name, 'Ahmad');
});

test('D2 the app is closed during typing: after reopening the draft is there, and it is not a record', async () => {
  const backend = new MemoryBackend();
  const s = await Store.open(backend);
  const start = contact('n1', '');
  const key = draftKeyFor('contacts', undefined);
  saveDraftIfChanged(s, key, 'contacts', undefined, recordHash(start), { ...start, name: 'Half typed', phone: '012' }, '012');
  await s.flush();
  // "closed": a new store over the same storage
  const again = await Store.open(backend);
  const d = decideDraft(again, key, undefined);
  assert.equal(d.kind, 'restore');
  assert.equal((d.kind === 'restore' && (d.draft.data as Contact).name), 'Half typed');
  assert.equal(again.getState().contacts.length, 0, 'a draft is not a record');
  assert.deepEqual(again.getState().meta.dirty, [], 'and nothing is waiting to sync because of it');
});

test('D3 editing an existing record: the draft is restored only when the saved record is still the one it started from', async () => {
  const s = await Store.open(new MemoryBackend());
  const saved = s.upsert('contacts', contact('c1', 'Ahmad'));
  const key = draftKeyFor('contacts', 'c1');
  saveDraftIfChanged(s, key, 'contacts', saved, recordHash(saved), { ...saved, notes: 'typed but not saved' }, undefined);
  assert.equal(decideDraft(s, key, saved).kind, 'restore');
  assert.equal(recordStateOf(s, 'contacts', 'c1'), 'draft', 'the record shows "Draft saved on this phone"');
  // another phone (or another screen) changes the saved record
  const newer = s.upsert('contacts', { ...saved, phone: '999' });
  const d = decideDraft(s, key, newer);
  assert.equal(d.kind, 'stale', 'never silently applied over a newer saved record');
  assert.equal(s.getState().contacts[0].notes, undefined, 'and the saved record was not touched by the draft');
});

test('D4 discarding clears the draft and the record is exactly as saved; saving clears it too', async () => {
  const s = await Store.open(new MemoryBackend());
  const saved = s.upsert('contacts', contact('c1', 'Ahmad'));
  const key = draftKeyFor('contacts', 'c1');
  saveDraftIfChanged(s, key, 'contacts', saved, recordHash(saved), { ...saved, name: 'Changed' }, undefined);
  s.discardDraft(key);
  assert.equal(s.getDraft(key), undefined);
  assert.equal(s.getState().contacts[0].name, 'Ahmad');
  assert.equal(recordStateOf(s, 'contacts', 'c1'), 'phone');
  saveDraftIfChanged(s, key, 'contacts', saved, recordHash(saved), { ...saved, name: 'Changed again' }, undefined);
  s.upsert('contacts', { ...saved, name: 'Changed again' });
  s.discardDraft(key);                                      // what Save does
  assert.equal(s.allDrafts().length, 0);
});

test('D5 pressing Save again with the same form can only ever update the same record (no duplicates)', async () => {
  const s = await Store.open(new MemoryBackend());
  const form = contact('fixed-id', 'Siti');
  s.upsert('contacts', form); s.upsert('contacts', form); s.upsert('contacts', { ...form, notes: 'x' });
  assert.equal(s.getState().contacts.length, 1);
});

test('D6 drafts are never sent to the cloud', async () => {
  const cloud = new FakeCloud();
  const a = await phone(cloud, 'o@x.c');
  const start = contact('n1', '');
  saveDraftIfChanged(a.store, draftKeyFor('contacts', undefined), 'contacts', undefined, recordHash(start), { ...start, name: 'Draft only' }, undefined);
  a.store.upsert('contacts', contact('real', 'Real'));
  await syncNow(a.store, cfg, cloud.fetch);
  assert.deepEqual([...cloud.rows.keys()].map(k => k.split('|')[2]), ['real']);
});

test('D7 a draft nobody came back to for 30 days is removed with the pictures only it used', async () => {
  const s = await Store.open(new MemoryBackend());
  const fid = await s.putFile(new Blob(['pic'], { type: 'image/jpeg' }));
  s.saveDraft('properties:new:x', { form: 'properties', savedAt: Date.now(), data: { id: 'p', photos: [{ id: 'a', fileId: fid, name: 'a.jpg' }] } });
  await s.purgeOld(Date.now() + 10 * 24 * 3600_000);
  assert.equal(s.allDrafts().length, 1);
  await s.purgeOld(Date.now() + 31 * 24 * 3600_000);
  assert.equal(s.allDrafts().length, 0);
  assert.equal(await s.getFile(fid), undefined);
});
