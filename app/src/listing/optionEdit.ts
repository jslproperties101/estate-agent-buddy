// JoyChange002 Change 36: editing (pencil) and deleting (X) a remembered dropdown entry, safely.
// The address chain (Change 5) keeps each level's remembered entries under the level above, e.g. the townships of Nilai
// live in the list "township@Malaysia/Negeri Sembilan/Nilai". So:
//  - deleting a State also removes the Cities, Townships, Neighbourhoods and Jalan saved under it (the first warning
//    counts them), and properties whose address uses it lose that part of their address (the second warning counts them);
//  - renaming (pencil) changes the entry in place: the lists under it move with it and the properties using it are
//    updated to the new name, so nothing goes missing.
// Lists that are not part of the address chain have nothing below them and no property is changed by them.
import type { OptionLists } from '../data/types';
import type { Listing } from './model';
import { LOCATION_LEVELS, LocationLevel } from './cc001';

/** The level and parent path of an address-chain list ("township@Malaysia/Negeri Sembilan/Nilai"), or undefined. */
export function chainOf(listKey: string): { level: LocationLevel; parents: string[] } | undefined {
  if (listKey === 'country') return { level: 'country', parents: [] };
  const m = /^([a-z]+)@(.*)$/.exec(listKey);
  if (!m || !(LOCATION_LEVELS as readonly string[]).includes(m[1])) return undefined;
  return { level: m[1] as LocationLevel, parents: m[2] ? m[2].split('/') : [] };
}

const pathOf = (listKey: string, value: string) => { const c = chainOf(listKey); return c ? [...c.parents, value] : undefined; };
const startsWith = (a: string[], p: string[]) => p.length <= a.length && p.every((x, i) => a[i] === x);
const lc = (s: string) => s.trim().toLowerCase();

/** Remembered entries saved below an entry (in lists under it, at any depth), by list. */
export function entriesBelow(options: OptionLists, listKey: string, value: string): { list: string; count: number }[] {
  const p = pathOf(listKey, value);
  if (!p) return [];
  const out: { list: string; count: number }[] = [];
  for (const [k, items] of Object.entries(options)) {
    const c = chainOf(k);
    if (!c || k === listKey || !items?.length) continue;
    if (startsWith(c.parents, p)) out.push({ list: k, count: items.length });
  }
  return out;
}
export const countBelow = (options: OptionLists, listKey: string, value: string) => entriesBelow(options, listKey, value).reduce((n, x) => n + x.count, 0);

/** The address of a property as a chain path up to `depth` levels (blank levels are skipped, as in Change 5). */
function chainPath(l: Partial<Record<LocationLevel, string>>, upTo: LocationLevel): string[] {
  const i = LOCATION_LEVELS.indexOf(upTo);
  return LOCATION_LEVELS.slice(0, i + 1).map(k => (l[k] ?? '').trim()).filter(Boolean);
}

/** Properties whose address uses the entry (at its level, under the same parents). */
export function propertiesUsing(properties: Listing[], listKey: string, value: string): Listing[] {
  const c = chainOf(listKey);
  if (!c) return [];
  return properties.filter(l => {
    const v = (l[c.level] ?? '').trim();
    if (lc(v) !== lc(value)) return false;
    const path = chainPath(l, c.level);
    return path.length === c.parents.length + 1 && c.parents.every((x, i) => lc(path[i]) === lc(x));
  });
}

/** The options after deleting an entry: the entry and every list under it. */
export function optionsAfterDelete(options: OptionLists, listKey: string, value: string): OptionLists {
  const below = new Set(entriesBelow(options, listKey, value).map(x => x.list));
  const out: OptionLists = {};
  for (const [k, items] of Object.entries(options)) {
    if (below.has(k)) { out[k] = []; continue; }
    out[k] = k === listKey ? items.filter(o => o.value !== value) : items;
  }
  return out;
}

/** The options after renaming an entry: the entry keeps its place and the lists under it move to the new name. */
export function optionsAfterRename(options: OptionLists, listKey: string, from: string, to: string): OptionLists {
  const c = chainOf(listKey);
  const out: OptionLists = {};
  const old = pathOf(listKey, from);
  for (const [k, items] of Object.entries(options)) {
    if (k === listKey) { out[k] = items.map(o => (o.value === from ? { ...o, value: to } : o)); continue; }
    const kc = c && old ? chainOf(k) : undefined;
    if (kc && old && startsWith(kc.parents, old)) {
      const parents = [...kc.parents]; parents[old.length - 1] = to;
      const nk = `${kc.level}@${parents.join('/')}`;
      out[nk] = [...(out[nk] ?? []), ...items];
      out[k] = out[k] ?? [];
      continue;
    }
    out[k] = [...(out[k] ?? []), ...items];
  }
  // A renamed entry may now match one already there (or two moved lists may meet): keep one of each, most recent use.
  for (const k of Object.keys(out)) {
    const seen = new Map<string, (typeof out)[string][number]>();
    for (const o of out[k]) { const key = lc(o.value); const had = seen.get(key); if (!had || o.used > had.used) seen.set(key, o); }
    out[k] = [...seen.values()];
  }
  return out;
}

/** A property after its address entry is renamed (only that level changes). */
export const renamedIn = (l: Listing, listKey: string, to: string): Listing => {
  const c = chainOf(listKey);
  return c ? { ...l, [c.level]: to } : l;
};
/** A property after its address entry is deleted: that level and every level below it are cleared. */
export const clearedIn = (l: Listing, listKey: string): Listing => {
  const c = chainOf(listKey);
  if (!c) return l;
  const out = { ...l } as Listing & Record<string, unknown>;
  for (const k of LOCATION_LEVELS.slice(LOCATION_LEVELS.indexOf(c.level))) delete out[k];
  return out;
};
