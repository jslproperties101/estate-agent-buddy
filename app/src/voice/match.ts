// JoyChange002 Change 50: finding the property and the contact an agent's words are about.
//  - A property is found by its ID ("P1001"), its address (street, neighbourhood, township, city, unit) or the name or
//    phone number of a linked vendor or buyer (a buyer is linked by an inquiry or a viewing of the property).
//  - A contact (buyer or vendor) is found by name or phone number.
// Results are ranked best first. The review area pre-selects the best one when it is a clear match; otherwise it offers
// "Create new" by default. Nothing is saved until the agent confirms.
import type { Listing } from '../listing/model';
import type { Contact, Inquiry, Appointment } from '../data/types';

export interface Ranked<T> { item: T; score: number; why: ('ref' | 'address' | 'vendor' | 'buyer' | 'name' | 'phone' | 'hint')[] }

/** A score from which a match is pre-selected (an ID, a phone number, a full name, or most of an address). */
export const SURE = 30;

/** Words that say nothing about which property or person is meant. */
const STOP = new Set([
  'the', 'a', 'an', 'in', 'at', 'of', 'for', 'to', 'and', 'with', 'on', 'my', 'is', 'it', 'this', 'that', 'new', 'create', 'add',
  'set', 'change', 'update', 'mark', 'status', 'price', 'asking', 'rent', 'rental', 'sale', 'sell', 'buy', 'buyer', 'vendor', 'owner',
  'property', 'house', 'unit', 'lot', 'no', 'number', 'jalan', 'jln', 'taman', 'tmn', 'lorong', 'persiaran', 'bandar', 'kampung', 'kg',
  'mr', 'mrs', 'ms', 'encik', 'puan', 'cik', 'tuan', 'dato', 'datin', 'sample', 'rm', 'million', 'thousand', 'call', 'phone',
  'booked', 'sold', 'rented', 'available', 'di', 'ke', 'untuk', 'dan', 'yang', 'baru', 'baharu', 'tukar', 'harga', 'cipta',
]);
const words = (s?: string) => (s ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\(sample\)/g, ' ')
  .split(/[^\p{L}\p{N}]+/u).filter(Boolean);
const keyWords = (s?: string) => words(s).filter(w => !STOP.has(w) && (w.length >= 3 || /^\d+[a-z]?$/.test(w)));
const digits = (s?: string) => (s ?? '').replace(/\D/g, '');

/** Every phone-like run of digits in the text (spaces and dashes inside a number are allowed). */
export function phonesIn(text: string): string[] {
  return (text.match(/(?:\+?6?0)?\d[\d\s-]{6,}\d/g) ?? []).map(digits).filter(d => d.length >= 7 && d.length <= 13);
}
/** Same phone number? The last 9 digits are compared, so 012-345 6789 matches +60 12 345 6789. */
export const samePhone = (a: string, b?: string) => { const x = digits(b); return x.length >= 7 && a.slice(-9) === x.slice(-9); };

/** How much of a name the text says: 1 for every word of it, less for part of it, 0 for none. */
function nameHit(textWords: Set<string>, name?: string): number {
  const w = keyWords(name);
  if (!w.length) return 0;
  const n = w.filter(x => textWords.has(x)).length;
  return n / w.length;
}

const refNorm = (r?: string) => (r ?? '').replace(/[\s-]+/g, '').toUpperCase();
function refsIn(text: string): string[] {
  return (text.match(/\b[A-Za-z]{1,6}[\s-]?\d{2,9}\b/g) ?? []).map(refNorm).filter(r => !/^RM\d/.test(r));
}

/** Contacts by name or phone number, best first. Only contacts the text points to are returned. */
export function rankContacts(text: string, contacts: Contact[]): Ranked<Contact>[] {
  const tw = new Set(keyWords(text));
  const phones = phonesIn(text);
  const out: Ranked<Contact>[] = [];
  for (const c of contacts) {
    let score = 0; const why: Ranked<Contact>['why'] = [];
    if (phones.some(p => samePhone(p, c.phone))) { score += 100; why.push('phone'); }
    const h = nameHit(tw, c.name);
    if (h) { score += h === 1 ? 40 + keyWords(c.name).length * 5 : 20 * h; why.push('name'); }
    if (score > 0) out.push({ item: c, score, why });
  }
  return out.sort((a, b) => b.score - a.score || (b.item.lastInteraction ?? 0) - (a.item.lastInteraction ?? 0));
}

const ADDRESS: [keyof Listing, number][] = [['street', 3], ['unitNo', 2], ['neighborhood', 2], ['township', 2], ['headline', 1], ['city', 1], ['state', 0.5]];

/** Properties by ID, address, or a linked vendor or buyer, best first. Every property is returned (unmatched ones last),
 *  so the agent can still pick any of them. `hints` are ids the command itself already pointed to (type and place). */
export function rankProperties(text: string, properties: Listing[], contacts: Contact[], links: { inquiries?: Inquiry[]; appointments?: Appointment[] } = {}, hints: string[] = []): Ranked<Listing>[] {
  const tw = new Set(keyWords(text));
  const refs = refsIn(text);
  const phones = phonesIn(text);
  const byId = new Map(contacts.map(c => [c.id, c]));
  // Buyers linked to each property by an inquiry or a viewing.
  const buyers = new Map<string, Set<string>>();
  for (const x of [...(links.inquiries ?? []), ...(links.appointments ?? [])]) {
    if (!x.propertyId || !x.contactId) continue;
    if (!buyers.has(x.propertyId)) buyers.set(x.propertyId, new Set());
    buyers.get(x.propertyId)!.add(x.contactId);
  }
  const person = (c: { name?: string; phone?: string } | undefined) => {
    if (!c) return 0;
    if (phones.some(p => samePhone(p, c.phone))) return 80;
    const h = nameHit(tw, c.name);
    return h === 1 ? 50 : h >= 0.5 ? 25 : 0;
  };
  const out: Ranked<Listing>[] = properties.map(l => {
    let score = 0; const why: Ranked<Listing>['why'] = [];
    if (l.ref && refs.includes(refNorm(l.ref))) { score += 100; why.push('ref'); }
    let addr = 0;
    for (const [k, w] of ADDRESS) {
      const fw = keyWords(l[k] as string | undefined);
      if (!fw.length) continue;
      const hit = fw.filter(x => tw.has(x)).length;
      // A street number alone ("1") says nothing; it counts only with the street's name.
      const named = fw.filter(x => !/^\d/.test(x) && tw.has(x)).length;
      if (!named) continue;
      addr += hit === fw.length ? w * 10 : w * 10 * (hit / fw.length) * 0.6;
    }
    if (addr) { score += addr; why.push('address'); }
    const vendor = l.vendorId ? byId.get(l.vendorId) : undefined;
    const v = Math.max(person(vendor), person({ name: l.ownerName, phone: l.ownerPhone }));
    if (v) { score += v; why.push('vendor'); }
    let b = 0;
    for (const id of buyers.get(l.id) ?? []) b = Math.max(b, person(byId.get(id)) * 0.8);
    if (b) { score += b; why.push('buyer'); }
    if (hints.includes(l.id)) { score += 40; why.push('hint'); }
    return { item: l, score, why };
  });
  return out.sort((a, b) => b.score - a.score || (b.item.updated ?? 0) - (a.item.updated ?? 0));
}

/** The match to pre-select: the best one when it is clear enough, otherwise none ("Create new"). */
export function preselect<T>(ranked: Ranked<T>[]): T | undefined {
  const a = ranked[0];
  return a && a.score >= SURE ? a.item : undefined;
}
