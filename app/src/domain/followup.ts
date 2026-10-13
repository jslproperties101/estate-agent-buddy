// Follow-up reminders for contacts nobody has been in touch with for a while.
// This only ever *reminds*. It never changes a contact's status (no automatic "inactive" or "dropped").
import type { Contact } from '../data/types';

export const DEFAULT_FOLLOW_UP_DAYS = 30;
export const FOLLOW_UP_CHOICES = [0, 14, 30, 60, 90];   // 0 = off
const DAY = 86_400_000;

/** A contact that is still being worked on: not a finished or given-up buyer, not a closed or withdrawn vendor. */
function open(c: Contact): boolean {
  if (c.sample) return false;
  if (c.leadStatus === 'dropped' || c.leadStatus === 'booked') return false;
  if (c.vendorStatus === 'closed' || c.vendorStatus === 'withdrawn') return false;
  return c.roles.some(r => r === 'buyer' || r === 'tenant' || r === 'investor' || r === 'vendor' || r === 'landlord');
}

/** Contacts to follow up, longest-quiet first. `days` ≤ 0 turns the reminder off. Time with no interaction counts from the
 *  last interaction, or from when the contact was added if there never was one. */
export function followUpDue(contacts: Contact[], now: number, days = DEFAULT_FOLLOW_UP_DAYS): { contact: Contact; quietDays: number }[] {
  if (!(days > 0)) return [];
  return contacts
    .filter(open)
    .map(c => ({ contact: c, quietDays: Math.floor((now - (c.lastInteraction ?? c.created)) / DAY) }))
    .filter(x => x.quietDays >= days)
    .sort((a, b) => b.quietDays - a.quietDays);
}
