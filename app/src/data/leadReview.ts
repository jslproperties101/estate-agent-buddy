// "Inactive" is no longer a buyer status. Records that still carry it (from an older version of the app, or from another
// phone that has not been updated yet) are moved to Dropped. Nothing is lost or hidden:
//  - the original value is kept on the record (previousLeadStatus: 'inactive'),
//  - a report lists exactly which contacts were changed, until the owner marks it reviewed,
//  - the owner can open each contact and choose any current status.
// Only the status field of those contacts changes. The function does nothing when there is nothing to convert.
import type { Contact } from './types';
import type { Store } from './store';

/** Contacts whose stored status is the retired value "inactive". */
export function inactiveContacts(contacts: readonly Contact[]): Contact[] {
  return contacts.filter(c => (c.leadStatus as string | undefined) === 'inactive');
}

/** Converts every Inactive buyer to Dropped, records the report, and returns how many were converted. */
export function convertInactive(store: Store, now = Date.now()): number {
  const found = inactiveContacts(store.getState().contacts);
  if (!found.length) return 0;
  for (const c of found) store.upsert('contacts', { ...c, leadStatus: 'dropped', previousLeadStatus: 'inactive' });
  const old = store.getState().meta.leadReview;
  const ids = [...new Set([...(old && !old.reviewed ? old.ids : []), ...found.map(c => c.id)])];
  store.setSingleton('meta', { leadReview: { at: now, ids, reviewed: false } });
  return found.length;
}

/** The contacts listed in the report that still exist. */
export function reviewContacts(contacts: readonly Contact[], ids: readonly string[]): Contact[] {
  return ids.map(id => contacts.find(c => c.id === id)).filter((c): c is Contact => !!c);
}
