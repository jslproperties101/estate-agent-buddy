// Deletion safeguards (Version 1E): delete moves an item to Recently deleted,
// where it can be restored. Permanent deletion needs the confirmation word typed.
// Items are kept 30 days (Proposed default, section 16.3).

export const KEEP_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface Deleted<T> {
  item: T;
  deletedAt: number;
}

export function moveToDeleted<T extends { id: string }>(
  items: T[], bin: Deleted<T>[], id: string, now: number,
): { items: T[]; bin: Deleted<T>[] } {
  const found = items.find(i => i.id === id);
  if (!found) return { items, bin };
  return { items: items.filter(i => i.id !== id), bin: [{ item: found, deletedAt: now }, ...bin] };
}

export function restore<T extends { id: string }>(
  items: T[], bin: Deleted<T>[], id: string,
): { items: T[]; bin: Deleted<T>[] } {
  const entry = bin.find(d => d.item.id === id);
  if (!entry) return { items, bin };
  return { items: [entry.item, ...items], bin: bin.filter(d => d.item.id !== id) };
}

export function daysLeft(entry: Deleted<unknown>, now: number): number {
  return Math.max(0, KEEP_DAYS - Math.floor((now - entry.deletedAt) / DAY_MS));
}

/** Removes entries older than KEEP_DAYS. */
export function purgeExpired<T>(bin: Deleted<T>[], now: number): Deleted<T>[] {
  return bin.filter(d => now - d.deletedAt < KEEP_DAYS * DAY_MS);
}

/** Permanent deletion only when the typed word matches exactly (ignoring case and spaces). */
export function deletePermanently<T extends { id: string }>(
  bin: Deleted<T>[], id: string, typed: string, word: string,
): { ok: boolean; bin: Deleted<T>[] } {
  if (typed.trim().toUpperCase() !== word.toUpperCase()) return { ok: false, bin };
  return { ok: true, bin: bin.filter(d => d.item.id !== id) };
}
