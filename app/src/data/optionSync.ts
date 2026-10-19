// JoyChange003 Change 51 (Batch B2): remembered dropdown values (and the agent's own WhatsApp texts, Change 64) follow the
// ACCOUNT across phones and the laptop website.
//  - They belong to the person, not to the team workspace: they are kept in their own cloud table, eab_user_options
//    (supabase/migrations/20261019120000_joychange003_user_options.sql), one row per value, readable and writable only by
//    that person (through two functions).
//  - Every change made on this phone (added, used, renamed, deleted, restored from a backup) is noticed by comparing the
//    lists before and after (`diffOptions`) and waits in `meta.optSync.pending` until it reaches the cloud.
//  - Two phones changing the same value: the change made last wins (by the time it was made). A deletion is kept as a
//    deleted row, so a phone that was offline does not bring the value back.
//  - A cloud without the table (an older database) simply has no account values: the rest of the sync is unaffected.
import type { CustomOption, OptionLists } from './types';

export interface OptChange { list: string; value: string; deleted: boolean; added: number; used: number; updated: number }
export interface OptSyncState { userId?: string; since: number; pending: Record<string, OptChange> }
/** A cloud row of eab_user_options, as the pull function returns it. */
export interface OptRow { list: string; value: string; deleted: boolean; added: number; used: number; updated: number; seq: number }

export const optKey = (list: string, value: string) => `${list}\u0001${value.trim().toLowerCase()}`;
/** Longest list name and value the cloud keeps (an agent's own WhatsApp text can be long). */
export const MAX_LIST = 300, MAX_VALUE = 2000;
const fits = (c: { list: string; value: string }) => !!c.list && c.list.length <= MAX_LIST && !!c.value.trim() && c.value.length <= MAX_VALUE;

/** What changed between two versions of the lists: values added or changed (also the time last used) and values removed. */
export function diffOptions(before: OptionLists, after: OptionLists, now: number): OptChange[] {
  const out: OptChange[] = [];
  for (const list of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const old = new Map((before[list] ?? []).map(o => [o.value.trim().toLowerCase(), o]));
    const cur = new Map((after[list] ?? []).map(o => [o.value.trim().toLowerCase(), o]));
    for (const [k, o] of cur) {
      const was = old.get(k);
      if (!was || was.value !== o.value || was.used !== o.used || was.added !== o.added) out.push({ list, value: o.value, deleted: false, added: o.added, used: o.used, updated: now });
    }
    for (const [k, o] of old) if (!cur.has(k)) out.push({ list, value: o.value, deleted: true, added: o.added, used: o.used, updated: now });
  }
  return out.filter(fits);
}

/** Adds changes to the waiting ones (a newer change to the same value replaces the older one). */
export function queue(pending: Record<string, OptChange>, changes: OptChange[]): Record<string, OptChange> {
  if (!changes.length) return pending;
  const next = { ...pending };
  for (const c of changes) next[optKey(c.list, c.value)] = c;
  return next;
}

/** Every value on this phone, as changes to send (the first sync of this phone for an account). */
export function allAsChanges(options: OptionLists, now: number): OptChange[] {
  return Object.entries(options).flatMap(([list, items]) => items.map(o => ({ list, value: o.value, deleted: false, added: o.added, used: o.used, updated: Math.max(o.used || 0, o.added || 0) || now }))).filter(fits);
}

/** The lists after taking rows from the cloud. A value changed on this phone later than the cloud row is kept as it is
 *  here (it is still waiting to be sent). Returns undefined when nothing changes. */
export function applyRows(options: OptionLists, rows: OptRow[], pending: Record<string, OptChange>): OptionLists | undefined {
  let changed = false;
  const out: OptionLists = { ...options };
  for (const r of rows) {
    const mine = pending[optKey(r.list, r.value)];
    if (mine && mine.updated > r.updated) continue;
    const k = r.value.trim().toLowerCase();
    const items = out[r.list] ?? [];
    const at = items.findIndex(o => o.value.trim().toLowerCase() === k);
    if (r.deleted) {
      if (at >= 0) { out[r.list] = items.filter((_, i) => i !== at); changed = true; }
      continue;
    }
    const next: CustomOption = at >= 0
      ? { value: r.value, added: Math.min(items[at].added || r.added, r.added || items[at].added), used: Math.max(items[at].used, r.used) }
      : { value: r.value, added: r.added, used: r.used };
    if (at >= 0) {
      const o = items[at];
      if (o.value === next.value && o.added === next.added && o.used === next.used) continue;
      out[r.list] = items.map((x, i) => (i === at ? next : x));
    } else out[r.list] = [...items, next];
    changed = true;
  }
  return changed ? out : undefined;
}

/** After a send: the waiting changes that were sent and not changed again meanwhile are done. */
export function settle(pending: Record<string, OptChange>, sent: OptChange[]): Record<string, OptChange> {
  const next = { ...pending };
  for (const c of sent) {
    const k = optKey(c.list, c.value);
    if (next[k] && next[k].updated === c.updated && next[k].deleted === c.deleted && next[k].used === c.used && next[k].value === c.value) delete next[k];
  }
  return next;
}
