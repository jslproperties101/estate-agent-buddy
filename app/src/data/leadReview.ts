// "Inactive" is no longer a buyer status. Records that still carry it (from an older version of the app, or from another
// phone that has not been updated yet) are moved to Dropped. Nothing is lost or hidden:
//  - the original value is kept on the record (previousLeadStatus: 'inactive'),
//  - a report lists exactly which contacts were changed, until the owner marks it reviewed,
//  - the owner can open each contact and choose any current status.
// Only the status field of those contacts changes. The function does nothing when there is nothing to convert.
//
// Undo (Phase 2): the owner can put a converted buyer back to its original value. Only the two status fields of that one
// contact change; every other edit made since (a new phone number, notes, a different status chosen on purpose) is left
// exactly as it is. A contact whose status was changed on purpose after the conversion is NOT touched: it is reported as
// "changed since" instead. An undone contact is flagged (inactiveKept) so the automatic conversion leaves it alone on
// every phone until a current status is chosen.
import type { Contact } from './types';
import type { Store } from './store';

/** Contacts whose stored status is the retired value "inactive". */
export function inactiveContacts(contacts: readonly Contact[]): Contact[] {
  return contacts.filter(c => (c.leadStatus as string | undefined) === 'inactive' && !c.inactiveKept);
}

/** Converts every Inactive buyer to Dropped, records the report, and returns how many were converted. */
export function convertInactive(store: Store, now = Date.now()): number {
  const found = inactiveContacts(store.getState().contacts);
  if (!found.length) return 0;
  for (const c of found) store.upsert('contacts', { ...c, leadStatus: 'dropped', previousLeadStatus: 'inactive' }, false, 'migration', 'Inactive → Dropped');
  const old = store.getState().meta.leadReview;
  const ids = [...new Set([...(old && !old.reviewed ? old.ids : []), ...found.map(c => c.id)])];
  store.setSingleton('meta', { leadReview: { at: now, ids, reviewed: false } });
  return found.length;
}

/** The contacts listed in the report that still exist. */
export function reviewContacts(contacts: readonly Contact[], ids: readonly string[]): Contact[] {
  return ids.map(id => contacts.find(c => c.id === id)).filter((c): c is Contact => !!c);
}

export interface UndoResult {
  restored: string[];
  /** changed: the buyer's status was changed on purpose after the conversion · missing: the contact no longer exists */
  skipped: { id: string; reason: 'changed' | 'missing' }[];
}

/** Puts converted buyers back to "inactive" (the retired value). `ids` defaults to every buyer in the report.
 *  Touches only leadStatus / previousLeadStatus / inactiveKept of buyers that are still exactly as the conversion left them. */
export function undoInactiveConversion(store: Store, ids?: readonly string[]): UndoResult {
  const rep = store.getState().meta.leadReview;
  const wanted = ids ?? rep?.ids ?? [];
  const res: UndoResult = { restored: [], skipped: [] };
  for (const id of wanted) {
    const c = store.getState().contacts.find(x => x.id === id);
    if (!c) { res.skipped.push({ id, reason: 'missing' }); continue; }
    if (c.leadStatus !== 'dropped' || c.previousLeadStatus !== 'inactive') { res.skipped.push({ id, reason: 'changed' }); continue; }
    const { previousLeadStatus: _p, ...rest } = c; void _p;
    store.upsert('contacts', { ...rest, leadStatus: 'inactive' as unknown as Contact['leadStatus'], inactiveKept: true }, false, 'undo', 'Dropped → Inactive (undo of the status conversion)');
    res.restored.push(id);
  }
  if (rep && res.restored.length) {
    store.setSingleton('meta', { leadReview: { ...rep, undone: [...new Set([...(rep.undone ?? []), ...res.restored])] } });
  }
  return res;
}
