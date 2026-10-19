// JoyChange003 Change 72: each notification can be dismissed or snoozed ("Remind me later"). Dismissed ones are kept in a History list
// on the Notifications screen (and can be put back). The marks live on this phone only (meta.notifs); nothing here is synced.
import type { Meta } from '../data/types';

export interface NotifMarks { dismissed: Record<string, { at: number; title: string }>; snoozed: Record<string, number> }
export const HISTORY_MAX = 50;

const marks = (m: Pick<Meta, 'notifs'>): NotifMarks => m.notifs ?? { dismissed: {}, snoozed: {} };

/** Is the notification with this key shown right now? Not when dismissed, and not while snoozed. */
export function isShown(m: Pick<Meta, 'notifs'>, key: string, now: number): boolean {
  const n = marks(m);
  if (n.dismissed[key]) return false;
  const until = n.snoozed[key];
  return !(until && until > now);
}

export function dismissMarks(m: Pick<Meta, 'notifs'>, key: string, title: string, now: number): NotifMarks {
  const n = marks(m);
  const dismissed = { ...n.dismissed, [key]: { at: now, title } };
  // Only the newest HISTORY_MAX are kept.
  const keep = Object.entries(dismissed).sort((a, b) => b[1].at - a[1].at).slice(0, HISTORY_MAX);
  const snoozed = { ...n.snoozed }; delete snoozed[key];
  return { dismissed: Object.fromEntries(keep), snoozed };
}

export function snoozeMarks(m: Pick<Meta, 'notifs'>, key: string, until: number): NotifMarks {
  const n = marks(m);
  return { dismissed: n.dismissed, snoozed: { ...n.snoozed, [key]: until } };
}

export function restoreMarks(m: Pick<Meta, 'notifs'>, key: string): NotifMarks {
  const n = marks(m);
  const dismissed = { ...n.dismissed }; delete dismissed[key];
  const snoozed = { ...n.snoozed }; delete snoozed[key];
  return { dismissed, snoozed };
}

/** History, newest first. */
export function historyList(m: Pick<Meta, 'notifs'>): { key: string; at: number; title: string }[] {
  return Object.entries(marks(m).dismissed).map(([key, v]) => ({ key, ...v })).sort((a, b) => b.at - a.at);
}

export type SnoozeChoice = 'hour' | 'tonight' | 'tomorrow';
export const SNOOZE_CHOICES: SnoozeChoice[] = ['hour', 'tonight', 'tomorrow'];
/** When a snooze ends: in 1 hour; tonight at 8 pm (or 2 hours from now when it is already evening); tomorrow at 9 am (local time). */
export function snoozeUntil(choice: SnoozeChoice, now: number): number {
  if (choice === 'hour') return now + 3_600_000;
  const d = new Date(now);
  if (choice === 'tonight') {
    d.setHours(20, 0, 0, 0);
    return d.getTime() - now >= 30 * 60_000 ? d.getTime() : now + 2 * 3_600_000;
  }
  d.setHours(9, 0, 0, 0); d.setDate(d.getDate() + 1);
  return d.getTime();
}
