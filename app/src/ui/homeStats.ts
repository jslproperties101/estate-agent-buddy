// EA AI Buddy reskin, Phase A: the numbers on the new home dashboard. Every number comes from the agent's own records on
// this phone; nothing is invented. Money (sales, deals) leaves sample records out, exactly like Track My Sales; the
// inquiry, viewing and today counts include them, as the Inquiries & Viewings, Calendar and To-Do screens do.
// Pure functions, so they are unit-tested.
import type { Appointment, Inquiry, Task } from '../data/types';
import type { Listing } from '../listing/model';
import { stageOf, totals, ymdLocal } from '../deals/model';

export interface HomeStats {
  /** Commission received this calendar month (RM). */
  salesMonth: number;
  /** Properties whose deal is booked, sold, at SPA or rent pending (not completed, rented, cancelled or others). */
  activeDeals: number;
  /** Inquiries received in the last 7 days. */
  newInquiries: number;
  /** Viewings scheduled or pending from now to 7 days ahead. */
  viewings: number;
  /** Open tasks due today plus today's scheduled appointments. */
  todayCount: number;
}

const ACTIVE = new Set(['booked', 'sold', 'spa', 'rentpending']);
const DAY = 86_400_000;

/** Local "yyyy-mm-ddThh:mm" from a Date. */
const localStamp = (d: Date) => `${ymdLocal(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

export function homeStats(
  s: { properties: Listing[]; inquiries: Inquiry[]; appointments: Appointment[]; tasks: Task[] },
  now = new Date(),
): HomeStats {
  const props = s.properties.filter(p => !p.archived && !p.sample);
  const today = ymdLocal(now);
  const weekAgo = localStamp(new Date(now.getTime() - 7 * DAY));
  const nowStamp = localStamp(now);
  const weekAhead = localStamp(new Date(now.getTime() + 7 * DAY));
  const appts = s.appointments.filter(a => a.status === 'scheduled' || a.status === 'pending');
  return {
    salesMonth: totals(props, now).month,
    activeDeals: props.filter(p => { const st = stageOf(p, today); return !!st && ACTIVE.has(st); }).length,
    newInquiries: s.inquiries.filter(i => i.at >= weekAgo && i.at <= nowStamp).length,
    viewings: appts.filter(a => a.kind === 'viewing' && !!a.start && a.start >= nowStamp && a.start <= weekAhead).length,
    todayCount: s.tasks.filter(t => !t.done && !!t.due && t.due.slice(0, 10) === today).length
      + appts.filter(a => a.status === 'scheduled' && !!a.start && a.start.slice(0, 10) === today).length,
  };
}

/** Which greeting fits the hour: before 12 morning, before 18 afternoon, otherwise evening. */
export const greetingPart = (hour: number): 'morning' | 'afternoon' | 'evening' => (hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening');

/** The first word of the agent's name, or undefined. */
export const firstName = (full?: string): string | undefined => full?.trim().split(/\s+/)[0] || undefined;
