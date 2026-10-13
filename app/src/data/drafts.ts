// Draft rules, kept apart from React so they can be tested on their own.
// A draft is what a person has typed into a form but not saved with the Save button. It lives on the phone only, in the
// store's draft area, and it is NEVER a record: nothing in the app lists, counts or syncs a draft as data.
//  - key: "<collection>:<record id>" for an existing record; "<collection>:new:<variant>" for a new one (variant = what
//    the form was pre-filled with, so a draft for "new task for Ahmad" is not restored into "new task for Siti").
//  - baseHash: fingerprint of the saved record the draft was started from. If the saved record is different when the
//    form is opened again (another phone changed it, or it was edited elsewhere in the app), the draft is NOT applied
//    silently: the person chooses.
//  - A draft is cleared by a successful Save or by Discard. Closing the form or the app keeps it.
import type { Draft, Store } from './store';
import type { CollectionName } from './types';
import { hash53, recordHash, stableStringify } from './hash';

export const draftKeyFor = (collection: CollectionName, id?: string, variant?: unknown) =>
  id ? `${collection}:${id}` : `${collection}:new:${hash53(stableStringify(variant ?? {}))}`;

export type DraftDecision =
  | { kind: 'none' }
  | { kind: 'restore'; draft: Draft }          // same starting point: put the draft back
  | { kind: 'stale'; draft: Draft };           // the saved record changed since: ask first

/** What to do with a stored draft when its form opens. `committed` is the saved record (undefined for a new one). */
export function decideDraft(store: Store, key: string, committed: unknown): DraftDecision {
  const draft = store.getDraft(key);
  if (!draft) return { kind: 'none' };
  if (committed === undefined) return { kind: 'restore', draft };
  return draft.baseHash === recordHash(committed) ? { kind: 'restore', draft } : { kind: 'stale', draft };
}

/** Stores the draft if the form really differs from how it started. Returns true when something was written. */
export function saveDraftIfChanged(store: Store, key: string, form: string, committed: unknown, initialHash: string, value: unknown, extra: unknown, now = Date.now(), variant?: unknown): boolean {
  const h = recordHash(value);
  const cur = store.getDraft(key);
  if (h === initialHash) return false;                                   // nothing typed: no draft (and an old one is left alone)
  if (cur && recordHash(cur.data) === h && stableStringify(cur.extra ?? null) === stableStringify(extra ?? null)) return false;   // already stored
  store.saveDraft(key, { form, recordKey: key, baseHash: committed === undefined ? undefined : recordHash(committed), savedAt: now, data: structuredClone(value), extra: extra === undefined ? undefined : structuredClone(extra), variant: variant === undefined ? undefined : structuredClone(variant) });
  return true;
}
