// Joining two edits of the same record. `base` is the version both phones last agreed on (what the cloud accepted),
// `local` is this phone's version, `remote` the cloud's. Each field is decided on its own:
//   only one side changed it  → that change is kept
//   both made the same change → kept once
//   both changed it differently → a conflict: the field is listed for the person, and this phone's value stays in the
//                                 meantime (the cloud's value is kept in the record's history, never thrown away)
// Lists of items that have an `id` (photos, documents, adverts) are joined item by item, so a photo added on one phone
// and a document added on the other both survive. No clock is used anywhere.
import type { FieldConflict } from './types';
import { stableStringify } from './hash';

type Rec = Record<string, unknown>;
const same = (a: unknown, b: unknown) => stableStringify(a) === stableStringify(b);
const isObj = (v: unknown): v is Rec => !!v && typeof v === 'object' && !Array.isArray(v);
const hasIds = (v: unknown): v is Rec[] => Array.isArray(v) && v.every(x => isObj(x) && typeof x.id === 'string');
/** Fields that are only ever added to; two phones' entries are simply combined. */
const UNION_BY_CONTENT = new Set(['history']);
/** Not a real difference between versions. */
const IGNORED = new Set(['updated']);

export interface MergeResult { merged: Rec; conflicts: FieldConflict[] }

function mergeValue(path: string, base: unknown, local: unknown, remote: unknown, out: FieldConflict[]): unknown {
  if (same(local, remote)) return local;
  if (same(base, local)) return remote;
  if (same(base, remote)) return local;
  const leaf = path.split('.').pop() ?? path;
  if (UNION_BY_CONTENT.has(leaf) && Array.isArray(local) && Array.isArray(remote)) {
    const seen = new Set<string>(); const all: unknown[] = [];
    for (const x of [...local, ...remote]) { const k = stableStringify(x); if (!seen.has(k)) { seen.add(k); all.push(x); } }
    return all.sort((a, b) => ((b as { at?: number }).at ?? 0) - ((a as { at?: number }).at ?? 0)).slice(0, 50);
  }
  if (isObj(local) && isObj(remote) && (base === undefined || isObj(base))) {
    const b = (base ?? {}) as Rec;
    const result: Rec = {};
    for (const k of new Set([...Object.keys(local), ...Object.keys(remote)])) {
      const v = mergeValue(path ? `${path}.${k}` : k, b[k], local[k], remote[k], out);
      if (v !== undefined) result[k] = v;
    }
    return result;
  }
  if (hasIds(local) && hasIds(remote) && (base === undefined || hasIds(base))) {
    const b = new Map(((base ?? []) as Rec[]).map(x => [x.id as string, x]));
    const l = new Map(local.map(x => [x.id as string, x]));
    const r = new Map(remote.map(x => [x.id as string, x]));
    const items: Rec[] = [];
    let clash = false;
    for (const id of new Set([...l.keys(), ...r.keys()])) {
      const bi = b.get(id), li = l.get(id), ri = r.get(id);
      if (li && ri) {
        const sub: FieldConflict[] = [];
        const m = mergeValue(`${path}[${id}]`, bi, li, ri, sub);
        if (sub.length) clash = true;
        items.push(m as Rec);
      } else if (li || ri) {
        // Present on one side only. Added there (not in base): keep. Removed on the other side: stays removed if this side
        // did not touch it, otherwise it is a real disagreement.
        const only = (li ?? ri) as Rec;
        if (!bi) items.push(only);
        else if (!same(bi, only)) clash = true;
      }
    }
    if (!clash) {
      const order = new Map(local.map((x, i) => [x.id as string, i]));
      return items.sort((a, b2) => (order.get(a.id as string) ?? 1e9) - (order.get(b2.id as string) ?? 1e9));
    }
  }
  out.push({ field: path, local, remote });
  return local;
}

export function merge3(base: Rec | null | undefined, local: Rec, remote: Rec): MergeResult {
  const b = base ?? {};
  const conflicts: FieldConflict[] = [];
  const merged: Rec = {};
  for (const k of new Set([...Object.keys(local), ...Object.keys(remote)])) {
    if (IGNORED.has(k)) continue;
    const v = mergeValue(k, b[k], local[k], remote[k], conflicts);
    if (v !== undefined) merged[k] = v;
  }
  merged.updated = Math.max(Number(local.updated) || 0, Number(remote.updated) || 0);
  return { merged, conflicts };
}

function setPath(o: Rec, path: string, value: unknown) {
  const parts = path.split('.');
  let cur = o;
  for (let i = 0; i < parts.length - 1; i++) {
    const nxt = cur[parts[i]];
    cur[parts[i]] = isObj(nxt) ? { ...nxt } : {};
    cur = cur[parts[i]] as Rec;
  }
  const last = parts[parts.length - 1];
  if (value === undefined) delete cur[last]; else cur[last] = value;
}

/** The merged record with each conflicting field set to the side the person chose. */
export function applyChoices(merged: Rec, conflicts: readonly FieldConflict[], choice: Record<string, 'local' | 'remote'>): Rec {
  const out = structuredClone(merged);
  for (const c of conflicts) {
    // Item-level paths look like "photos[abc]"; the whole field is replaced for those.
    const path = c.field.replace(/\[[^\]]*\].*$/, '');
    setPath(out, path, structuredClone(choice[c.field] === 'remote' ? c.remote : c.local));
  }
  return out;
}
