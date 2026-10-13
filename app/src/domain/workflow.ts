// To-Do, Calendar, Inquiry and Viewing rules. Pure functions: the screens call these and save the results.
import type { Appointment, ApptStatus, Inquiry, Task, Contact, LeadStatus } from '../data/types';
import { parseLocal, ymd, hasTime, addDays, startOfDay } from '../lib/dates';

// ---------- reminders ----------
/** Reminder choices in minutes before (owner's list: 3 days and 7 days before included). Custom values are allowed too. */
export const REMINDER_CHOICES = [0, 15, 30, 60, 120, 1440, 2880, 4320, 10080] as const;
export const DEFAULT_APPT_REMINDERS = [1440, 60];
export const DEFAULT_TASK_REMINDERS = [0];

export interface DueReminder {
  key: string; at: number; kind: 'task' | 'appointment'; id: string; minutesBefore: number;
  /** Earlier reminders for the same item that fell due at the same time: marked as shown, not shown again. */
  covers?: string[];
}

/** The time a reminder is due. A date without a time counts as 9:00 that day. */
export function reminderTimes(when: string | undefined, minutesBefore: number[]): { minutesBefore: number; at: number }[] {
  const base = parseLocal(when, 9);
  if (!base) return [];
  return [...new Set(minutesBefore)].map(m => ({ minutesBefore: m, at: base.getTime() - m * 60_000 }));
}

/** Reminders that are due now and not yet shown. Done tasks and completed or cancelled appointments never remind. */
export function dueReminders(tasks: Task[], appts: Appointment[], fired: string[], now: number, windowMs = 7 * 86_400_000): DueReminder[] {
  const seen = new Set(fired);
  const out: DueReminder[] = [];
  const add = (kind: 'task' | 'appointment', id: string, when: string | undefined, mins: number[], created: number) => {
    const base = parseLocal(when, 9)?.getTime();
    // Items that were already in the past when they were entered (for example a to-do typed in for yesterday)
    // do not remind. A reminder whose time passed while the item is still ahead (a 15-minute reminder for a
    // meeting entered 10 minutes before it) is shown straight away.
    if (base === undefined || base < created - 60_000) return;
    for (const r of reminderTimes(when, mins)) {
      const key = `${kind}:${id}:${when}:${r.minutesBefore}`;
      if (r.at <= now && r.at > now - windowMs && !seen.has(key)) out.push({ key, at: r.at, kind, id, minutesBefore: r.minutesBefore });
    }
  };
  for (const t of tasks) if (!t.done && t.due) add('task', t.id, t.due, t.reminders, t.created);
  for (const a of appts) if ((a.status === 'scheduled' || a.status === 'pending') && a.start) add('appointment', a.id, a.start, a.reminders, a.created);
  // One alert per item: when several of its reminders are due at once, the latest is shown.
  const byItem = new Map<string, DueReminder>();
  for (const r of out.sort((a, b) => a.at - b.at)) {
    const k = `${r.kind}:${r.id}`;
    const prev = byItem.get(k);
    byItem.set(k, prev ? { ...r, covers: [...(prev.covers ?? []), prev.key] } : r);
  }
  return [...byItem.values()].sort((a, b) => a.at - b.at);
}

/** Every reminder still to come (for scheduling phone notifications in the Android app). */
export function upcomingReminders(tasks: Task[], appts: Appointment[], now: number): DueReminder[] {
  const out: DueReminder[] = [];
  for (const t of tasks) if (!t.done && t.due) for (const r of reminderTimes(t.due, t.reminders)) if (r.at > now) out.push({ key: `task:${t.id}:${t.due}:${r.minutesBefore}`, at: r.at, kind: 'task', id: t.id, minutesBefore: r.minutesBefore });
  for (const a of appts) if ((a.status === 'scheduled' || a.status === 'pending') && a.start) for (const r of reminderTimes(a.start, a.reminders)) if (r.at > now) out.push({ key: `appointment:${a.id}:${a.start}:${r.minutesBefore}`, at: r.at, kind: 'appointment', id: a.id, minutesBefore: r.minutesBefore });
  return out.sort((a, b) => a.at - b.at);
}

// ---------- to-do ----------
export type TaskBucket = 'overdue' | 'today' | 'upcoming' | 'someday' | 'done';

export function taskBucket(t: Task, now: Date): TaskBucket {
  if (t.done) return 'done';
  if (!t.due) return 'someday';
  const due = parseLocal(t.due, 23)!;
  const today = ymd(now);
  if (t.due.slice(0, 10) < today) return 'overdue';
  if (t.due.slice(0, 10) === today) return hasTime(t.due) && due.getTime() < now.getTime() ? 'overdue' : 'today';
  return 'upcoming';
}

const PRIORITY_RANK: Record<Task['priority'], number> = { urgent: 0, high: 1, medium: 2, low: 3 };
export function sortTasks(list: Task[]): Task[] {
  return [...list].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.done && b.done) return (b.completedAt ?? 0) - (a.completedAt ?? 0);
    const da = a.due ?? '9999', db = b.due ?? '9999';
    if (da.slice(0, 10) !== db.slice(0, 10)) return da < db ? -1 : 1;
    if (PRIORITY_RANK[a.priority] !== PRIORITY_RANK[b.priority]) return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    return da < db ? -1 : da > db ? 1 : 0;
  });
}

export function completeTask(t: Task, done: boolean, now = Date.now()): Task {
  return { ...t, done, completedAt: done ? now : undefined };
}

/** A follow-up becomes a To-Do item of kind "follow-up", linked to the same property and contact. */
export function followUpTask(o: { id: string; title: string; due: string; contactId?: string; propertyId?: string; inquiryId?: string; appointmentId?: string; notes?: string }, now = Date.now()): Task {
  return {
    id: o.id, created: now, updated: now, title: o.title, due: o.due, priority: 'medium', done: false, kind: 'follow_up',
    contactId: o.contactId, propertyId: o.propertyId, inquiryId: o.inquiryId, appointmentId: o.appointmentId, notes: o.notes,
    reminders: DEFAULT_TASK_REMINDERS,
  };
}

// ---------- appointments and viewings ----------
/** Inquiry → Pending Viewing → Viewed. The inquiry leaves Inquiry History and its details stay on the viewing. */
export function convertToViewing(inq: Inquiry, o: { id: string; start?: string; reminders?: number[] }, now = Date.now()): Appointment {
  return {
    id: o.id, created: now, updated: now, kind: 'viewing', status: 'pending', start: o.start,
    propertyId: inq.propertyId, contactId: inq.contactId, reminders: o.reminders ?? DEFAULT_APPT_REMINDERS,
    fromInquiry: { at: inq.at, channel: inq.channel, message: inq.message },
  };
}

export function setApptStatus(a: Appointment, status: ApptStatus, now = Date.now()): Appointment {
  return { ...a, status, completedAt: status === 'completed' ? now : undefined };
}

/** Items for one calendar day: appointments by start time, then To-Do items due that day. */
export function dayItems(day: string, appts: Appointment[], tasks: Task[]) {
  return {
    appts: appts.filter(a => a.start?.slice(0, 10) === day).sort((a, b) => (a.start! < b.start! ? -1 : 1)),
    tasks: sortTasks(tasks.filter(t => t.due?.slice(0, 10) === day)),
  };
}

export const isOpenAppt = (a: Appointment) => a.status === 'scheduled' || a.status === 'pending';

// ---------- leads ----------
/** A contact counts as interacted with on an inquiry, a viewing, or a completed task or appointment (not on edits). */
export function touchContact(c: Contact, at = Date.now()): Contact {
  return { ...c, lastInteraction: Math.max(c.lastInteraction ?? 0, at) };
}

export function leadCounts(contacts: Contact[]): Record<LeadStatus, number> {
  const r: Record<LeadStatus, number> = { cold: 0, warm: 0, hot: 0, dropped: 0, booked: 0 };
  for (const c of contacts) if (c.leadStatus && c.leadStatus in r) r[c.leadStatus]++;   // a retired value (after Undo) is not counted
  return r;
}

/** Counts for the home screen strip. */
export function todayCounts(tasks: Task[], appts: Appointment[], now: Date) {
  const today = ymd(now);
  const tomorrow = ymd(addDays(startOfDay(now), 1));
  return {
    tasksDue: tasks.filter(t => !t.done && t.due && t.due.slice(0, 10) <= today).length,
    apptsToday: appts.filter(a => isOpenAppt(a) && a.start?.slice(0, 10) === today).length,
    apptsTomorrow: appts.filter(a => isOpenAppt(a) && a.start?.slice(0, 10) === tomorrow).length,
    pendingViewings: appts.filter(a => a.kind === 'viewing' && a.status === 'pending').length,
  };
}
