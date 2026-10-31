// EA AI Buddy rename and reskin, Phase A (owner, 31 Oct 2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { homeStats, greetingPart, firstName } from '../src/ui/homeStats';
import { tabOf, tabScreen, TAB_H } from '../src/ui/TabBar';
import { reskinStrings } from '../src/ui/reskinStrings';
import { strings } from '../src/i18n';
import type { Appointment, Inquiry, Task } from '../src/data/types';
import type { Listing } from '../src/listing/model';

const base = { created: 0, updated: 0 };
const now = new Date(2026, 9, 31, 11, 0); // Sat 31 Oct 2026, 11:00 local

test('EA1 home numbers come only from the records: inquiries in the last 7 days, viewings in the next 7, today due items', () => {
  const inquiries = [
    { ...base, id: 'i1', contactId: 'c', at: '2026-10-30T09:00', channel: 'whatsapp' },
    { ...base, id: 'i2', contactId: 'c', at: '2026-10-20T09:00', channel: 'whatsapp' },   // too old
    { ...base, id: 'i3', contactId: 'c', at: '2026-10-31T10:30', channel: 'call', sample: true },  // sample counts here
  ] as Inquiry[];
  const appointments = [
    { ...base, id: 'a1', kind: 'viewing', start: '2026-11-02T10:00', status: 'scheduled' },
    { ...base, id: 'a2', kind: 'viewing', start: '2026-11-20T10:00', status: 'scheduled' },  // too far
    { ...base, id: 'a3', kind: 'viewing', start: '2026-11-01T10:00', status: 'cancelled' },  // cancelled
    { ...base, id: 'a4', kind: 'meeting', start: '2026-10-31T15:00', status: 'scheduled' },  // today, not a viewing
  ] as Appointment[];
  const tasks = [
    { ...base, id: 't1', title: 'a', due: '2026-10-31', priority: 'normal', done: false, kind: 'task' },
    { ...base, id: 't2', title: 'b', due: '2026-10-31T09:00', priority: 'normal', done: true, kind: 'task' },  // done
    { ...base, id: 't3', title: 'c', due: '2026-11-01', priority: 'normal', done: false, kind: 'task' },        // tomorrow
  ] as unknown as Task[];
  const s = homeStats({ properties: [] as Listing[], inquiries, appointments, tasks }, now);
  assert.equal(s.newInquiries, 2);
  assert.equal(s.viewings, 1);
  assert.equal(s.todayCount, 2, 'one open task due today + one scheduled appointment today');
  assert.equal(s.salesMonth, 0);
  assert.equal(s.activeDeals, 0);
});

test('EA2 sales and active deals leave sample and archived properties out (as Track My Sales does)', () => {
  const p = (id: string, extra: Partial<Listing>) => ({ ...base, id, status: 'in_progress', ...extra }) as unknown as Listing;
  const s = homeStats({ properties: [p('real', {}), p('a', { sample: true }), p('b', { archived: { at: 1 } }), p('c', { status: 'available' } as Partial<Listing>)], inquiries: [], appointments: [], tasks: [] }, now);
  assert.equal(s.activeDeals, 1, 'only the real booked property');
  assert.equal(s.salesMonth, 0);
});

test('EA3 greeting and first name', () => {
  assert.equal(greetingPart(8), 'morning');
  assert.equal(greetingPart(12), 'afternoon');
  assert.equal(greetingPart(19), 'evening');
  assert.equal(firstName('  Joe  Lim '), 'Joe');
  assert.equal(firstName(''), undefined);
  assert.equal(firstName(undefined), undefined);
});

test('EA4 tab bar: five tabs to existing screens; each main screen lights its tab', () => {
  assert.deepEqual(tabScreen('home'), { name: 'home' });
  assert.deepEqual(tabScreen('ai'), { name: 'voice' });
  assert.deepEqual(tabScreen('inquiries'), { name: 'activity', tab: 'inquiries' });
  assert.equal(tabOf({ name: 'projects' }), 'projects');
  assert.equal(tabOf({ name: 'activity', tab: 'viewings' }), 'inquiries');
  assert.equal(tabOf({ name: 'more' }), 'more');
  assert.equal(tabOf({ name: 'calculator' }), undefined);
  assert.equal(TAB_H, 64);
});

test('EA5 the name is EA AI Buddy in all three languages; strings exist for every language', () => {
  for (const l of ['en', 'bm', 'zh'] as const) {
    assert.equal(strings[l].appName, 'EA AI Buddy');
    assert.equal(`${strings[l].appNameA} ${strings[l].appNameB}`, 'EA AI Buddy');
    const r = reskinStrings[l];
    assert.ok(r.tagline && r.quick && r.tabs.home && r.tabs.more && r.more.settings);
    for (const k of ['project', 'sales', 'opportunities', 'creative', 'contacts', 'activity', 'gps', 'finance', 'calculator', 'matching', 'expert', 'market', 'agenda', 'property']) assert.ok(r.sub[k], `${l} ${k}`);
  }
});

test('EA6 package com.jslproperties.eaaibuddy everywhere it is set; backup and save folders keep their old names', () => {
  assert.match(readFileSync('src/native/native.ts', 'utf8'), /'com\.jslproperties\.eaaibuddy\.qa' : 'com\.jslproperties\.eaaibuddy'/);
  assert.match(readFileSync('scripts/android-setup.mjs', 'utf8'), /LEGACY_APP_ID = 'com\.jslproperties\.estateagentbuddy'/);
  // Existing Google Drive backups and phone downloads must still be found: those folder names do not change.
  assert.match(readFileSync('src/backup/restorePoints.ts', 'utf8'), /ROOT_NAME = 'Estate Agent AI Buddy'/);
  assert.match(readFileSync('src/backup/drive.ts', 'utf8'), /FOLDER_NAME = 'Estate Agent AI Buddy backups'/);
  assert.match(readFileSync('src/lib/pdfRender.ts', 'utf8'), /SAVE_FOLDER = 'Estate Agent Buddy'/);
  // The push sign-up check in the database must accept the new packages (proposed migration).
  const m = readFileSync('../supabase/proposed/20261031000000_ea_ai_buddy_app_ids.sql', 'utf8');
  assert.match(m, /'com\.jslproperties\.eaaibuddy', 'com\.jslproperties\.eaaibuddy\.qa'/);
});
