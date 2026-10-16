// ClaudeChanges001 change 12: deal dates in the Calendar. Every dated reminder of a deal (booking expiry, target SPA date,
// balance deposit, completion, tenancy end, the next 12 rent due dates) is an ordinary Calendar appointment at 9:00 with
// reminders 3 days and 1 day before, so it shows in the Calendar, in Notifications and as a phone notification like any
// other appointment. Its id is fixed per property and date kind: saving the deal again moves it; a date that was cleared
// (or a deal that was cancelled) removes it. Appointments the agent made by hand are never touched.
import type { Store } from '../data/store';
import type { Lang } from '../i18n';
import type { Appointment } from '../data/types';
import { cardTitle, Listing } from '../listing/model';
import { cc001Strings } from '../ui/cc001Strings';
import { dealDates, reminderId, DEAL_REMINDERS } from './model';

export const isDealReminder = (a: Pick<Appointment, 'id'>, propertyId?: string) => a.id.startsWith(propertyId ? `deal-${propertyId}-` : 'deal-');

export function syncDealReminders(store: Store, l: Listing, lang: Lang, now = new Date()): { added: number; removed: number } {
  const t = cc001Strings[lang].sales.due;
  const want = dealDates(l, now);
  const ids = new Set(want.map(d => reminderId(l.id, d.key)));
  const existing = store.getState().appointments.filter(a => isDealReminder(a, l.id));
  let removed = 0;
  for (const a of existing) if (!ids.has(a.id)) { store.remove('appointments', a.id); removed++; }
  let added = 0;
  const place = cardTitle(l) || l.ref || '';
  for (const d of want) {
    const id = reminderId(l.id, d.key);
    const cur = store.getState().appointments.find(a => a.id === id);
    const start = `${d.date}T09:00`;
    const title = cc001Strings[lang].reminderTitle(t[d.what], place);
    if (cur && cur.start === start && cur.title === title) continue;
    const ts = Date.now();
    store.upsert('appointments', {
      ...(cur ?? {}), id, created: cur?.created ?? ts, updated: ts, kind: d.what === 'targetSpa' ? 'signing' : 'other',
      title, start, durationMin: 30, status: cur?.status === 'completed' ? 'completed' : 'scheduled', propertyId: l.id, reminders: DEAL_REMINDERS,
    } as Appointment);
    if (!cur) added++;
  }
  return { added, removed };
}
