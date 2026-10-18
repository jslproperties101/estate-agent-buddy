// ClaudeChanges001 (owner, 17 Oct 2026): rules that can be checked without a browser — the merged Availability list,
// the location chain, contacts kept once per person, the deal stages, commission totals, deadlines and the Calendar
// reminders made from a deal, the sync banner's countdown, and the source-level guarantees of the form.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Store } from '../src/data/store';
import { MemoryBackend } from '../src/data/backend';
import type { Listing } from '../src/listing/model';
import { AVAIL_CHOICES, availChoice, availPatch, ARRANGEMENT_CHOICES, locationListKey, clearBelow, parentPath } from '../src/listing/cc001';
import { isVerifiable } from '../src/listing/verify';
import { stageOf, totals, upcoming, dealDates, rentDueDates, daysUntil, commissionOf, reminderId, SPEC } from '../src/deals/model';
import { saveTypedContact, findSaved } from '../src/deals/contacts';
import { syncDealReminders } from '../src/deals/reminders';
import { secondsLeft } from '../src/ui/SyncBanner';
import { searchContacts } from '../src/ui/ContactPick';
import { listingStrings } from '../src/listing/strings';
import { cc001Strings } from '../src/ui/cc001Strings';
import { strings } from '../src/i18n';
import { TILES } from '../src/App';
import type { Contact } from '../src/data/types';

const L = (x: Partial<Listing>): Listing => ({ id: 'p1', created: 1, updated: 1, photos: [], ...x } as Listing);
const C = (id: string, name: string, phone?: string, extra: Partial<Contact> = {}): Contact => ({ id, name, phone, roles: ['vendor'], created: 1, updated: 1, ...extra } as Contact);
const day = (y: number, m: number, d: number) => new Date(y, m - 1, d, 10, 0, 0);

test('CC1 change 1: section 1 is "Basic Info and Availability" and the reference is shown as ID, in every language', () => {
  assert.equal(listingStrings.en.sec.basics, 'Basic Info and Availability');
  assert.equal(listingStrings.en.refPreview('B1012'), 'ID: B1012');
  assert.equal(listingStrings.en.l.ref, 'ID');
  for (const lang of ['bm', 'zh'] as const) assert.match(listingStrings[lang].refPreview('B1012'), /^ID[:：] ?B1012$/);
  assert.equal(listingStrings.en.l.purpose, 'Sale or Rent', 'the field label stays Sale or Rent');
});

test('CC3 change 3: Commission (RM) for a flat fee, Commission (%) for a percentage; neither has a check status', () => {
  assert.equal(listingStrings.en.l.commissionFlat, 'Commission (RM)');
  assert.equal(listingStrings.en.l.commissionPct, 'Commission (%)');
  assert.ok(!isVerifiable('commissionFlat') && !isVerifiable('commissionPct'));
  assert.ok(!isVerifiable('availability'), 'change 8: Availability has no check status');
  assert.ok(isVerifiable('rentCommissionFlat') && isVerifiable('tenure'), 'other fields keep theirs');
});

test('CC10 change 10: one Availability list writes both stored fields, and every record shows one choice', () => {
  // JoyChange002 Change 40: plain Booked became five Booked stages.
  assert.deepEqual([...AVAIL_CHOICES], ['available_now', 'available_from', 'booked_pending_loan', 'booked_pending_spa', 'booked_spa_signed', 'booked_other_agent', 'booked_pending_consent', 'sold', 'rented', 'withdrawn']);
  for (const ch of AVAIL_CHOICES) assert.equal(availChoice({ ...availPatch(ch, '2026-12') }), ch, `${ch} round-trips`);
  assert.equal(availPatch('available_from', '2026-12').availableFrom, '2026-12');
  assert.equal(availPatch('sold', '2026-12').availableFrom, undefined, 'only Available From keeps the month');
  assert.deepEqual(availPatch('booked'), { status: 'in_progress', availability: 'not_available', availableFrom: undefined, bookedStage: undefined });
  // older records
  assert.equal(availChoice({ status: 'available', availability: 'from_date' }), 'available_from');
  assert.equal(availChoice({ status: 'available' }), 'available_now');
  assert.equal(availChoice({ availability: 'tenanted' }), 'rented');
  assert.equal(availChoice({ status: 'sold', availability: 'immediate' }), 'sold', 'the status decides first');
  assert.equal(availChoice({ status: 'needs_check' }), undefined);
  assert.equal(availChoice({}), undefined);
  assert.deepEqual([...ARRANGEMENT_CHOICES], ['cobroke', 'direct']);
  for (const lang of ['en', 'bm', 'zh'] as const) for (const ch of AVAIL_CHOICES) assert.ok(cc001Strings[lang].avail[ch], `${lang} ${ch}`);
  assert.equal(listingStrings.en.status.in_progress, 'Booked');
  assert.equal(listingStrings.en.status.off_market, 'Withdrawn');
});

test('CC5 change 5: each level remembers its options under the filled levels above; a blank level is skipped', () => {
  const l = { country: 'Malaysia', state: 'Negeri Sembilan', city: 'Nilai', township: 'Kota Seriemas', neighborhood: 'Laman Kemboja' };
  assert.equal(locationListKey(l, 'country'), 'country');
  assert.equal(locationListKey(l, 'state'), 'state@Malaysia');
  assert.equal(locationListKey(l, 'neighborhood'), 'neighborhood@Malaysia/Negeri Sembilan/Nilai/Kota Seriemas');
  assert.notEqual(locationListKey({ ...l, township: 'Bandar Baru Nilai' }, 'neighborhood'), locationListKey(l, 'neighborhood'), 'another township has its own neighbourhoods');
  // a blank neighbourhood: the street belongs to the township
  assert.equal(locationListKey({ ...l, neighborhood: undefined }, 'street'), 'street@Malaysia/Negeri Sembilan/Nilai/Kota Seriemas');
  assert.equal(locationListKey({ ...l, neighborhood: '  ' }, 'street'), 'street@Malaysia/Negeri Sembilan/Nilai/Kota Seriemas');
  assert.deepEqual(parentPath({ country: 'Malaysia', city: 'Nilai' }, 'township'), ['Malaysia', 'Nilai']);
  assert.deepEqual(Object.keys(clearBelow('township')), ['neighborhood', 'street'], 'changing the township clears the levels below it');
  assert.deepEqual(Object.keys(clearBelow('street')), [], 'Unit/Lot Number is never cleared');
});

test('CC9 change 9: a typed or picked person is kept once (same number = same contact), with the role added', async () => {
  const s = await Store.open(new MemoryBackend());
  const id1 = saveTypedContact(s, { name: 'Ali', phone: '012-345 6789' }, 'tenant');
  assert.ok(id1);
  const id2 = saveTypedContact(s, { name: 'Ali bin Abu', phone: '+60 12-345 6789', whatsapp: '@ali' }, 'buyer');
  assert.equal(id2, id1, 'the same phone number is the same person');
  const c = s.getState().contacts.find(x => x.id === id1)!;
  assert.deepEqual(c.roles, ['tenant', 'buyer']);
  assert.equal(c.whatsapp, '@ali', 'a missing WhatsApp username is filled in');
  assert.equal(c.name, 'Ali', 'the saved name is not overwritten');
  assert.equal(saveTypedContact(s, { name: '  ' }, 'tenant'), undefined, 'no name, no contact');
  const noPhone = saveTypedContact(s, { name: 'Mei Ling' }, 'other', 'Agency M');
  assert.equal(saveTypedContact(s, { name: 'mei ling' }, 'other'), noPhone, 'without a number the same name is the same person');
  assert.equal(s.getState().contacts.find(x => x.id === noPhone)?.company, 'Agency M');
  assert.equal(findSaved([C('s', 'X', '0123456789', { sample: true })], { phone: '0123456789' }), undefined, 'sample contacts are never reused');
  // search by name or number
  const list = [C('a', 'Tan Ah Kow', '+60 12-111 2222'), C('b', 'Siti', '+60 17-999 0000')];
  assert.deepEqual(searchContacts(list, 'tan').map(x => x.id), ['a']);
  assert.deepEqual(searchContacts(list, '9990').map(x => x.id), ['b']);
  assert.equal(searchContacts(list, '').length, 2);
  assert.equal(listingStrings.en.l.ownerWhatsapp, 'Owner WhatsApp Username');
});

test('CC11 change 11: the agreed groups and fields are on each page', () => {
  const keys = (sec: keyof typeof SPEC) => SPEC[sec].flatMap(g => g.fields.map(f => f.key));
  const booking = keys('booking');
  for (const k of ['buyer', 'buyer2', 'buyerId', 'buyerAddress', 'buyerEmail', 'buyerNationality', 'buyerFirstTime', 'purchasePurpose', 'income', 'employer', 'propertiesOwned', 'moveIn',
    'leadSource', 'viewings', 'offers', 'agreedPrice', 'bookingFee', 'bookingDate', 'balanceDeposit', 'balanceDue', 'stakeholder', 'agreedCommission', 'buyerCobroke',
    'payment', 'loanBank', 'panelLawyer', 'ownerAccepted', 'specialTerms', 'files', 'bookingExpiry', 'targetSpa', 'outcome', 'cancelReason', 'notes']) assert.ok(booking.includes(k), `booking: ${k}`);
  const sale = keys('sale');
  for (const k of ['spaSigned', 'spaStamped', 'buyerLawyer', 'sellerLawyer', 'consentApplied', 'consentReceived', 'motSubmitted', 'motRegistered', 'stampDutySpa', 'completionDate', 'extensionGranted',
    'keyHandover', 'loanBank', 'loanAmount', 'loanStatus', 'loanOfferDate', 'valuationDate', 'redemptionBank', 'redemptionSum', 'disbursementDate', 'finalBalanceDate', 'quitRent',
    'rpgtFiled', 'commissionReceived', 'cobrokeSplit', 'invoiceNo', 'invoicePaid', 'files']) assert.ok(sale.includes(k), `sale: ${k}`);
  const rental = keys('rental');
  for (const k of ['tenant', 'tenantId', 'occupation', 'occupants', 'tenantCobroke', 'rent', 'securityDeposit', 'utilityDeposit', 'advanceRental', 'taStampDuty', 'commission', 'start', 'end', 'renewal', 'rentDueDay', 'files'])
    assert.ok(rental.includes(k), `rental: ${k}`);
  assert.deepEqual(keys('others'), ['agency', 'price']);
  for (const sec of Object.keys(SPEC) as (keyof typeof SPEC)[]) for (const g of SPEC[sec]) for (const f of g.fields) for (const lang of ['en', 'bm', 'zh'] as const) assert.ok(f.label[lang], `${sec}.${f.key} ${lang}`);
});

test('CC11b the stage of a deal follows the Availability and the recorded dates', () => {
  const today = '2026-10-17';
  assert.equal(stageOf(L({ status: 'available' }), today), undefined, 'no deal');
  assert.equal(stageOf(L({ status: 'in_progress' }), today), 'booked');
  assert.equal(stageOf(L({ status: 'in_progress', deal: { booking: { outcome: 'cancelled' } } }), today), 'cancelled');
  assert.equal(stageOf(L({ status: 'sold', deal: { soldBy: 'others' } }), today), 'others');
  assert.equal(stageOf(L({ status: 'sold', deal: { soldBy: 'me' } }), today), 'sold');
  assert.equal(stageOf(L({ status: 'sold', deal: { sale: { spaSigned: '2026-10-01' } } }), today), 'spa');
  assert.equal(stageOf(L({ status: 'sold', deal: { sale: { spaSigned: '2026-10-01', completionDate: '2027-01-15' } } }), today), 'spa', 'completion still ahead');
  assert.equal(stageOf(L({ status: 'sold', deal: { sale: { completionDate: '2026-10-17' } } }), today), 'completed');
  assert.equal(stageOf(L({ status: 'rented' }), today), 'rented');
});

test('CC12 commission: received (by date) and pending, from the deal or from the property\'s commission', () => {
  const now = day(2026, 10, 17);
  const list = [
    L({ id: 'a', status: 'sold', deal: { sale: { commissionReceived: 20000, commissionReceivedDate: '2026-10-05' } } }),
    L({ id: 'b', status: 'sold', deal: { sale: { commissionReceived: 5000, commissionReceivedDate: '2026-03-01' } } }),
    L({ id: 'c', status: 'in_progress', deal: { booking: { agreedCommission: 12000 } } }),
    L({ id: 'd', status: 'in_progress', purpose: 'sale', askingPrice: 500000, commissionPct: 2 }),
    L({ id: 'e', status: 'rented', purpose: 'rent', monthlyRent: 2000, rentCommissionMonths: 1 }),
    L({ id: 'f', status: 'rented', deal: { rental: { commission: 1800, commissionReceivedDate: '2025-12-30' } } }),
    L({ id: 'g', status: 'sold', deal: { soldBy: 'others', others: { price: 900000 } } }),
  ];
  const t = totals(list, now);
  assert.equal(t.received, 26800);
  assert.equal(t.month, 20000);
  assert.equal(t.year, 25000, '2025 is not this year');
  assert.equal(t.pending, 12000 + 10000 + 2000);
  assert.deepEqual(commissionOf(list[6], 'others'), {}, 'sold by others earns nothing');
});

test('CC12b deadlines and rent due dates: inside the tenancy, at most 12, the day kept (short months use their last day)', () => {
  assert.deepEqual(rentDueDates(31, '2026-01-15', '2026-05-31', 12), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31']);
  assert.equal(rentDueDates(5, '2026-10-17', undefined, 12).length, 12);
  assert.deepEqual(rentDueDates(40, '2026-10-17', undefined, 12), [], 'an impossible day gives none');
  const now = day(2026, 10, 17);
  const booked = L({ id: 'b', status: 'in_progress', deal: { booking: { bookingExpiry: '2026-10-20', targetSpa: '2026-11-10', balanceDue: '2027-03-01' } } });
  const rented = L({ id: 'r', status: 'rented', deal: { rental: { end: '2026-11-30', rentDueDay: 1 } } });
  const cancelled = L({ id: 'x', status: 'in_progress', deal: { booking: { outcome: 'cancelled', bookingExpiry: '2026-10-19' } } });
  assert.deepEqual(dealDates(cancelled, now), [], 'a cancelled booking asks for no reminders');
  const due = upcoming([booked, rented, cancelled], 60, now);
  assert.deepEqual(due.map(d => `${d.what}:${d.date}`), ['bookingExpiry:2026-10-20', 'rentDue:2026-11-01', 'targetSpa:2026-11-10', 'tenancyEnd:2026-11-30'], 'soonest first, within 60 days');
  assert.equal(daysUntil('2026-10-20', now), 3);
  assert.equal(daysUntil('2026-10-17', now), 0);
});

test('CC12c deal reminders are Calendar appointments: added, moved on a new date, removed when cleared; others untouched', async () => {
  const s = await Store.open(new MemoryBackend());
  s.upsert('appointments', { id: 'mine', created: 1, updated: 1, kind: 'viewing', start: '2026-10-20T10:00', status: 'scheduled', reminders: [], propertyId: 'p1' });
  const now = day(2026, 10, 17);
  let l = L({ status: 'in_progress', street: 'Jalan Kemboja 1/3', deal: { booking: { bookingExpiry: '2026-10-20', targetSpa: '2026-11-10' } } });
  assert.deepEqual(syncDealReminders(s, l, 'en', now), { added: 2, removed: 0 });
  const spa = s.getState().appointments.find(a => a.id === reminderId('p1', 'targetSpa'))!;
  assert.equal(spa.start, '2026-11-10T09:00');
  assert.equal(spa.kind, 'signing');
  assert.deepEqual(spa.reminders, [4320, 1440], '3 days and 1 day before');
  assert.match(spa.title ?? '', /Target SPA date: Jalan Kemboja 1\/3/);
  l = { ...l, deal: { booking: { bookingExpiry: '2026-10-22' } } };
  assert.deepEqual(syncDealReminders(s, l, 'en', now), { added: 0, removed: 1 }, 'target SPA cleared → its reminder goes');
  assert.equal(s.getState().appointments.find(a => a.id === reminderId('p1', 'bookingExpiry'))?.start, '2026-10-22T09:00', 'the date moved');
  assert.ok(s.getState().appointments.some(a => a.id === 'mine'), 'an appointment made by hand stays');
  l = { ...l, deal: { booking: { bookingExpiry: '2026-10-22', outcome: 'cancelled' } } };
  syncDealReminders(s, l, 'en', now);
  assert.equal(s.getState().appointments.filter(a => a.id.startsWith('deal-p1-')).length, 0, 'cancelled → no reminders');
});

test('CC2 change 2: the banner counts down to the next automatic try (every 60 s)', () => {
  assert.equal(secondsLeft(0, 1000), 60, 'unknown → 60');
  assert.equal(secondsLeft(61_000, 19_000), 42);
  assert.equal(secondsLeft(10_000, 20_000), 60, 'a time in the past → the next round');
  assert.equal(secondsLeft(20_500, 20_000), 1);
  assert.equal(cc001Strings.en.sync.listings(3), '3 listings not synced');
  assert.equal(cc001Strings.en.sync.retryIn(60), 'Retrying in 60s');
  const app = readFileSync('src/App.tsx', 'utf8');
  assert.ok(!app.includes('<SaveStatus'), 'no save-status line in the header');
  assert.ok(app.includes('<SyncBanner'), 'the banner is on the main page');
});

test('CC12d the dashboard: Calendar & To-Do (bottom left since JoyChange002 Change 43), card 2 Track My Sales, in every language', () => {
  assert.deepEqual([TILES[12], TILES[1]].map(t => t.key), ['agenda', 'sales']);
  assert.deepEqual(TILES[1].target, { name: 'trackSales' });
  assert.equal(TILES.length, 15);
  assert.equal(strings.en.tiles.agenda, 'Calendar & To\u2011Do', 'a non-breaking hyphen, so the card never splits To-Do');
  assert.equal(strings.en.tiles.sales, 'Track My Sales');
  for (const l of ['bm', 'zh'] as const) assert.ok(strings[l].tiles.agenda && strings[l].tiles.sales);
});

test('CC-src form guarantees: no Availability and Condition / Listing Arrangement sections, no Special Features, no "Saved by you"', () => {
  const form = readFileSync('src/listing/ListingForm.tsx', 'utf8');
  assert.ok(!form.includes('<Sec id="availability"') && !form.includes('<Sec id="arrangement"'));
  assert.ok(!form.includes("k: 'features'"), 'Special Features is gone from the form');
  assert.ok(!form.includes('vsel(\'availability\''));
  const opt = readFileSync('src/ui/OptionSelect.tsx', 'utf8');
  assert.ok(!opt.includes('savedByYou'), 'change 6');
  assert.match(opt, /const searchable = true/, 'change 9: every list has the search box');
  const box = readFileSync('src/ui/ContactBox.tsx', 'utf8');
  assert.ok(box.includes('-pick-phone') && box.includes('prefixed inside'), 'phone book on the phone row; @ inside the box');
});
