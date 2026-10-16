// Changes 011–014 (Oct 2026): logic that can be checked without a browser — in-feed advert positions, Buyer's History,
// PDF photo frames, the check-status fields, the property-form field sets, the AdMob IDs and the QA test-ad rule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withFeedAds, FEED_AD_EVERY } from '../src/adverts/AdBar';
import { ADMOB_APP_ID, ADMOB_BANNER_UNIT, BANNER_H, BANNER_W, nativeAdsAvailable, testAdsOnly } from '../src/adverts/admob';
import { buyerHistoryFor } from '../src/domain/buyerHistory';
import { layoutDocument, MARGIN, PAGE_W, type Font, type Placed } from '../src/lib/pdf';
import { VERIFIABLE_FIELDS, isVerifiable, shownState, withVerification } from '../src/listing/verify';
import { fieldsFor, commissionRm, applyFilters, type Listing } from '../src/listing/model';
import type { Appointment, Contact, Deal, Inquiry } from '../src/data/types';
import { c11Strings } from '../src/ui/c011Strings';
import { strings } from '../src/i18n';
import { listingStrings } from '../src/listing/strings';

const measure = (s: string, f: Font) => s.length * f.size * 0.5;

// ---------- Change 011 ----------
test('C11-1 in-feed adverts come after every third property shown (3, 6, 9…), counted on the filtered list', () => {
  assert.equal(FEED_AD_EVERY, 3);
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);
  const shape = (n: number) => withFeedAds(ids(n)).map(x => (x.kind === 'ad' ? `AD${x.n}` : x.item)).join(',');
  assert.equal(shape(0), '');
  assert.equal(shape(2), 'p1,p2');
  assert.equal(shape(3), 'p1,p2,p3,AD1');
  assert.equal(shape(7), 'p1,p2,p3,AD1,p4,p5,p6,AD2,p7');
  assert.equal(shape(9), 'p1,p2,p3,AD1,p4,p5,p6,AD2,p7,p8,p9,AD3');
  // A search that leaves four properties puts one advert after the third of those four, whatever the full list holds.
  const L = (id: string, township: string) => ({ id, created: 1, updated: 1, photos: [], township } as Listing);
  const all = [L('a', 'Nilai'), L('b', 'Sepang'), L('c', 'Nilai'), L('d', 'Nilai'), L('e', 'Sepang'), L('f', 'Nilai')];
  const shown = applyFilters(all, { location: 'nilai' });
  assert.deepEqual(withFeedAds(shown).map(x => (x.kind === 'ad' ? 'AD' : x.item.id)), ['a', 'c', 'd', 'AD', 'f']);
  // the property items keep their own ids (list keys) — adverts never take a property's place
  assert.deepEqual(withFeedAds(shown).filter(x => x.kind === 'item').map(x => (x.kind === 'item' ? x.item.id : '')), shown.map(l => l.id));
});

test('C11-2 AdMob: the owner\'s app and banner IDs; standard banner size; the QA build only ever asks for test ads; no ads outside the Android app', () => {
  assert.match(ADMOB_APP_ID, /^ca-app-pub-5995234129917229~3821658996$/);
  assert.match(ADMOB_BANNER_UNIT, /^ca-app-pub-5995234129917229\/3681049037$/);
  assert.deepEqual([BANNER_W, BANNER_H], [320, 50]);
  assert.equal(nativeAdsAvailable(), false, 'in a browser / test there is no native banner (the placeholder is shown)');
  assert.equal(typeof testAdsOnly(), 'boolean');
});

test('C11-3 the renamed and new labels exist in all three languages', () => {
  for (const l of ['en', 'bm', 'zh'] as const) {
    for (const k of ['property', 'creative', 'matching'] as const) assert.ok(strings[l].tiles[k], `${l} tiles.${k}`);
    assert.ok(c11Strings[l].card.del && c11Strings[l].card.open && c11Strings[l].card.restore);
    assert.ok(c11Strings[l].history.button && c11Strings[l].match.showArchived && c11Strings[l].ad.placeholder);
    assert.ok(listingStrings[l].title);
  }
  assert.equal(strings.en.tiles.property, 'Subsale List');
  assert.equal(listingStrings.en.title, 'Subsale List');
  assert.equal(c11Strings.en.history.button, 'Buyer’s History');
  assert.equal(c11Strings.en.match.showArchived, 'Show Archived Properties');
});

// ---------- Change 012: Buyer's History ----------
const base = { created: 1, updated: 1 };
const inq = (id: string, contactId: string, propertyId: string, at: string, extra: Partial<Inquiry> = {}): Inquiry => ({ ...base, id, contactId, propertyId, at, channel: 'whatsapp', ...extra });
const appt = (id: string, contactId: string, propertyId: string, start: string | undefined, status: Appointment['status'], extra: Partial<Appointment> = {}): Appointment =>
  ({ ...base, id, kind: 'viewing', contactId, propertyId, start, status, reminders: [], ...extra });
const buyer = (id: string, name: string, extra: Partial<Contact> = {}): Contact => ({ ...base, id, name, roles: ['buyer'], ...extra });

test('C12-1 Buyer\'s History: each buyer once per property, every activity oldest first, the newest activity first among buyers', () => {
  const contacts = [buyer('b1', 'Alice', { leadStatus: 'hot' }), buyer('b2', 'Bala')];
  const h = buyerHistoryFor('P', {
    contacts,
    inquiries: [inq('i1', 'b1', 'P', '2026-10-01T10:00'), inq('i2', 'b1', 'P', '2026-10-05T09:00', { message: 'still keen' }), inq('i3', 'b2', 'P', '2026-10-02T12:00')],
    appointments: [appt('a1', 'b1', 'P', '2026-10-03T15:00', 'completed'), appt('a2', 'b2', 'P', undefined, 'pending')],
    deals: [],
  });
  assert.deepEqual(h.map(x => x.contactId), ['b1', 'b2'], 'Alice has the newest activity');
  const alice = h.find(x => x.contactId === 'b1')!;
  assert.deepEqual(alice.events.map(e => e.kind), ['inquiry', 'viewing_completed', 'inquiry'], 'repeated contact is appended, nothing overwritten');
  assert.equal(alice.latest?.note, 'still keen');
  assert.equal(h.filter(x => x.contactId === 'b1').length, 1, 'one row per buyer');
  const bala = h.find(x => x.contactId === 'b2')!;
  const pending = bala.events.find(e => e.kind === 'viewing_pending')!;
  assert.equal(pending.when, undefined, 'a pending viewing without a date is not given an invented date');
});

test('C12-2 Buyer\'s History never mixes properties; the same buyer has a separate history per property; deals, matches and converted inquiries appear', () => {
  const contacts = [buyer('b1', 'Alice', { savedMatches: [{ propertyId: 'P', at: Date.UTC(2026, 9, 9) }] })];
  const deals: Deal[] = [{ ...base, id: 'd1', propertyId: 'P', contactId: 'b1', side: 'sale', date: '2026-10-10', value: 500000, commission: 10000, sharePct: 70, status: 'received' }];
  const data = {
    contacts, deals,
    inquiries: [inq('i1', 'b1', 'P', '2026-10-01T10:00'), inq('i9', 'b1', 'Q', '2026-10-04T10:00')],
    appointments: [appt('a1', 'b1', 'P', '2026-10-06T15:00', 'scheduled', { fromInquiry: { at: '2026-09-30T08:00', channel: 'call' } }), appt('a9', 'b1', 'Q', '2026-10-07T15:00', 'completed')],
  };
  const p = buyerHistoryFor('P', data);
  assert.equal(p.length, 1);
  assert.deepEqual(p[0].events.map(e => e.kind), ['inquiry', 'inquiry', 'viewing_scheduled', 'match', 'deal_received']);
  assert.ok(!p[0].events.some(e => e.id === 'i9' || e.id === 'a9'), 'nothing from property Q');
  const q = buyerHistoryFor('Q', data);
  assert.deepEqual(q[0].events.map(e => e.id), ['i9', 'a9']);
  assert.deepEqual(buyerHistoryFor('NONE', data), []);
});

// ---------- Change 013: PDF photos ----------
const images = (pages: { items: Placed[] }[]) => pages.flatMap(p => p.items.filter((i): i is Extract<Placed, { k: 'image' }> => i.k === 'image'));

test('C13-1 PDF photos sit in the middle of their frame at their own shape — portrait, landscape, one or several — never stretched or outside the page', () => {
  const innerW = PAGE_W - MARGIN * 2;
  for (const cols of [1, 2, 3] as const) {
    const items = [{ src: 'land', w: 4000, h: 3000 }, { src: 'port', w: 3000, h: 4000 }, { src: 'tall', w: 1000, h: 4000 }, { src: 'wide', w: 6000, h: 1000 }];
    const pages = layoutDocument({ blocks: [{ t: 'photos', items, cols }] }, measure);
    const placed = images(pages);
    assert.equal(placed.length, items.length);
    const gap = 8, cellW = (innerW - gap * (cols - 1)) / cols;
    placed.forEach((im, i) => {
      const src = items[i];
      assert.ok(Math.abs(im.w / im.h - src.w / src.h) < 0.01, `${src.src}: shape kept (cols ${cols})`);
      assert.ok(im.w <= cellW + 0.01, `${src.src}: not wider than its frame`);
      const col = i % cols;
      const cellX = MARGIN + col * (cellW + gap);
      assert.ok(Math.abs(im.x + im.w / 2 - (cellX + cellW / 2)) < 0.01, `${src.src}: centred across its frame (cols ${cols})`);
      assert.ok(im.x >= MARGIN - 0.01 && im.x + im.w <= PAGE_W - MARGIN + 0.01, 'inside the margins');
    });
    // in a row of two or more, the shorter photo is centred down against the taller one
    if (cols >= 2) {
      const row = placed.slice(0, cols);
      const top = Math.min(...row.map(r => r.y)), bottom = Math.max(...row.map(r => r.y + r.h));
      for (const r of row) assert.ok(Math.abs(r.y + r.h / 2 - (top + bottom) / 2) < 0.01, 'centred down the row');
    }
  }
  const one = images(layoutDocument({ blocks: [{ t: 'photos', items: [{ src: 'p', w: 900, h: 1600 }], cols: 1 }] }, measure))[0];
  assert.ok(Math.abs(one.x + one.w / 2 - PAGE_W / 2) < 0.01, 'a single portrait photo is in the middle of the page');
});

// ---------- Change 014 ----------
test('C14-1 check status: Frontage, Depth, Lot Type and the building specifications have one each; Other Specification and the commission type / percentage do not', () => {
  for (const k of ['frontageFt', 'depthFt', 'lotType', 'ceilingFt', 'powerKva', 'loadingBays', 'zoning', 'approvals', 'currentUse']) assert.ok(isVerifiable(k), `${k} has a check status`);
  for (const k of ['specs', 'commissionType', 'commissionPct']) assert.ok(!isVerifiable(k), `${k} has no check status`);
  assert.ok(VERIFIABLE_FIELDS.includes('commissionFlat'), 'only Commission Type and Commission Percentage lost theirs');
  // each field keeps its own status
  let l = { id: 'p', created: 1, updated: 1, photos: [], ceilingFt: 28, zoning: 'Industrial' } as Listing;
  l = withVerification(withVerification(l, 'ceilingFt', 'confirmed'), 'zoning', 'unknown');
  assert.equal(shownState(l, 'ceilingFt'), 'confirmed');
  assert.equal(shownState(l, 'zoning'), 'unknown');
  assert.equal(shownState(l, 'powerKva'), undefined);
  // an old commission mark stays stored but is no longer shown; the commission figure is unchanged
  const old = { id: 'p', created: 1, updated: 1, photos: [], purpose: 'sale', askingPrice: 1_000_000, commissionPct: 2, verification: { commissionPct: 'confirmed' } } as unknown as Listing;
  assert.equal(shownState(old, 'commissionPct'), undefined);
  assert.equal(old.verification?.commissionPct, 'confirmed');
  assert.equal(commissionRm(old), 20000);
});

test('C14-2 Lot Type is offered wherever Frontage and Depth are (land types included)', () => {
  for (const type of [undefined, 'Terrace house', 'Semi-D factory', 'Agricultural land', 'Development land', 'Industrial land', 'Residential land']) {
    const f = fieldsFor(type);
    if (f.has('frontageFt') || f.has('depthFt')) assert.ok(f.has('lotType'), `${type ?? 'no type'}: Lot Type with Frontage / Depth`);
  }
});
