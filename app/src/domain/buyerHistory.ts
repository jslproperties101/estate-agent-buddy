// Buyer's History for one property (Change 012): every buyer linked to the property, once each, with a dated running
// history built from what is already recorded — inquiries, viewings and other appointments, deals, and saved matches
// (Change 013). Nothing is stored twice and nothing is invented: an entry without a date says so, and a repeated inquiry
// or viewing simply becomes one more line under the same buyer. Another property's records never appear here.
import type { Appointment, Contact, Deal, Inquiry } from '../data/types';

export type HistoryKind =
  | 'inquiry' | 'viewing_pending' | 'viewing_scheduled' | 'viewing_completed' | 'viewing_cancelled'
  | 'follow_up' | 'meeting' | 'site_visit' | 'signing' | 'other'
  | 'deal_estimated' | 'deal_confirmed' | 'deal_received' | 'match';

export interface HistoryEvent {
  /** Where the line comes from, so tapping it can open the record. */
  source: 'inquiry' | 'appointment' | 'deal' | 'match';
  id: string;
  kind: HistoryKind;
  /** The recorded date and time (local "yyyy-mm-ddThh:mm" or "yyyy-mm-dd"), or a timestamp. Absent when none was recorded. */
  when?: string | number;
  /** Used only to put the lines in order when no date was recorded (the time the entry itself was made). */
  sortAt: number;
  channel?: string;
  note?: string;
}

export interface BuyerHistory { contactId: string; contact?: Contact; events: HistoryEvent[]; latest?: HistoryEvent }

const ms = (v: string | number | undefined, fallback: number): number => {
  if (v === undefined || v === '') return fallback;
  if (typeof v === 'number') return v;
  const t = new Date(v.length === 10 ? `${v}T00:00` : v).getTime();
  return Number.isFinite(t) ? t : fallback;
};

const apptKind = (a: Appointment): HistoryKind =>
  a.kind === 'viewing' ? (a.status === 'completed' ? 'viewing_completed' : a.status === 'cancelled' ? 'viewing_cancelled' : a.status === 'scheduled' ? 'viewing_scheduled' : 'viewing_pending')
    : a.kind;

/** One entry per buyer who has anything recorded against this property; each buyer's lines oldest first; the buyer with
 *  the most recent activity first. */
export function buyerHistoryFor(propertyId: string, data: { inquiries: Inquiry[]; appointments: Appointment[]; deals: Deal[]; contacts: Contact[] }): BuyerHistory[] {
  const by = new Map<string, HistoryEvent[]>();
  const add = (contactId: string | undefined, e: HistoryEvent) => {
    if (!contactId) return;
    const list = by.get(contactId) ?? [];
    list.push(e); by.set(contactId, list);
  };
  for (const i of data.inquiries) {
    if (i.propertyId !== propertyId) continue;
    add(i.contactId, { source: 'inquiry', id: i.id, kind: 'inquiry', when: i.at || undefined, sortAt: ms(i.at, i.created), channel: i.channel, note: i.message });
  }
  for (const a of data.appointments) {
    if (a.propertyId !== propertyId) continue;
    // A viewing that came from an inquiry keeps that inquiry as its own first line (the inquiry record itself was moved).
    if (a.fromInquiry) add(a.contactId, { source: 'appointment', id: `${a.id}:inq`, kind: 'inquiry', when: a.fromInquiry.at, sortAt: ms(a.fromInquiry.at, a.created), channel: a.fromInquiry.channel, note: a.fromInquiry.message });
    const when = a.status === 'completed' && !a.start && a.completedAt ? a.completedAt : a.start;
    add(a.contactId, { source: 'appointment', id: a.id, kind: apptKind(a), when, sortAt: ms(when, a.created), note: a.outcome || a.title });
  }
  for (const d of data.deals) {
    if (d.propertyId !== propertyId) continue;
    add(d.contactId, { source: 'deal', id: d.id, kind: d.status === 'received' ? 'deal_received' : d.status === 'confirmed' ? 'deal_confirmed' : 'deal_estimated', when: d.date, sortAt: ms(d.date, d.created), note: d.title });
  }
  for (const c of data.contacts) {
    const m = (c.savedMatches ?? []).find(x => x.propertyId === propertyId);
    if (m) add(c.id, { source: 'match', id: `${c.id}:match`, kind: 'match', when: m.at, sortAt: m.at });
  }
  const out: BuyerHistory[] = [];
  for (const [contactId, events] of by) {
    events.sort((x, y) => x.sortAt - y.sortAt || x.id.localeCompare(y.id));
    out.push({ contactId, contact: data.contacts.find(c => c.id === contactId), events, latest: events[events.length - 1] });
  }
  return out.sort((a, b) => (b.latest?.sortAt ?? 0) - (a.latest?.sortAt ?? 0));
}
