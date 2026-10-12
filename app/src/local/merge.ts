// Turns local proposals into review fields (Version 1I proposal).
// The app, not an AI, compares sources: different values for one field become a conflict;
// important fields with no value are listed as missing.
import { Field, Label } from '../review';
import { FieldKey, Proposal } from './rules';

export type Group = 'industrial' | 'residential' | 'commercial' | 'land' | 'unknown';

export const IMPORTANT: Record<Group, FieldKey[]> = {
  industrial: ['location', 'lot', 'type', 'price', 'land', 'builtup', 'tenure', 'titleType', 'ceiling', 'power'],
  residential: ['location', 'type', 'price', 'land', 'builtup', 'tenure', 'bedrooms', 'bathrooms'],
  commercial: ['location', 'type', 'price', 'builtup', 'tenure', 'titleType'],
  land: ['location', 'lot', 'type', 'price', 'land', 'tenure'],
  unknown: ['location', 'type', 'price', 'land', 'builtup', 'tenure'],
};

const ORDER: FieldKey[] = ['location', 'unit', 'lot', 'type', 'floors', 'availability', 'price', 'land', 'builtup', 'tenure', 'titleType', 'ceiling', 'power', 'bedrooms', 'bathrooms', 'ownerName', 'docPhone', 'remarks'];

export function groupOf(typeValue: string | undefined): Group {
  const t = (typeValue || '').toLowerCase();
  if (/factory|warehouse/.test(t)) return 'industrial';
  if (/land/.test(t)) return 'land';
  if (/shoplot|office/.test(t)) return 'commercial';
  if (/condo|house|bungalow|terrace/.test(t)) return 'residential';
  return 'unknown';
}

const where = (p: Proposal) => p.sourceName + (p.page ? ` p.${p.page}` : '');
const evidenceOf = (ps: Proposal[]) => ps.map(p => `${where(p)}: "${p.quote}"`).join(' · ');
const labelOf = (ps: Proposal[]): Label => (ps.every(p => p.stated) ? 'STATED' : 'DETECTED');

export interface MergeResult {
  fields: Field[];
  conflicts: FieldKey[];
  missing: FieldKey[];
  group: Group;
  /** True when important fields are still missing after local reading, so AI help could be asked for. */
  wouldAskAi: boolean;
}

export function merge(proposals: Proposal[]): MergeResult {
  const by = new Map<FieldKey, Map<string, Proposal[]>>();
  for (const p of proposals) {
    if (!by.has(p.field)) by.set(p.field, new Map());
    const m = by.get(p.field)!;
    if (!m.has(p.key)) m.set(p.key, []);
    m.get(p.key)!.push(p);
  }
  // Property type: a specific type beats the generic "Factory" from another line.
  const typeMap = by.get('type');
  if (typeMap && typeMap.size > 1 && typeMap.has('factory')) {
    const specific = [...typeMap.keys()].filter(k => k !== 'factory' && /factory|warehouse/.test(k));
    if (specific.length) typeMap.delete('factory');
  }
  // Remarks are notes, not competing values: all of them are kept together.
  const rem = by.get('remarks');
  if (rem && rem.size > 1) {
    const all = [...rem.values()].flat();
    const joined: Proposal = { ...all[0], value: all.map(p => p.value).join('; '), key: all.map(p => p.key).join('|'), quote: all.map(p => p.quote).join(' … ') };
    rem.clear();
    rem.set(joined.key, [joined]);
  }
  // Location: "Nilai" and "Jalan Perindustrian 2/3, Nilai" agree; keep the fuller one.
  const locMap = by.get('location');
  if (locMap && locMap.size > 1) {
    const keys = [...locMap.keys()].sort((a, b) => b.length - a.length);
    for (const short of keys.slice().reverse()) {
      const long = keys.find(k => k !== short && k.length > short.length && k.includes(short));
      if (long && locMap.has(short)) { locMap.get(long)!.push(...locMap.get(short)!); locMap.delete(short); }
    }
  }
  const fields: Field[] = [];
  const conflicts: FieldKey[] = [];
  for (const key of ORDER) {
    const m = by.get(key);
    if (!m) continue;
    const groups = [...m.values()];
    if (groups.length === 1) {
      const ps = groups[0];
      fields.push({ id: key, name: key, suggested: ps[0].value, label: labelOf(ps), evidence: evidenceOf(ps), readText: ps[0].quote, decision: 'pending', finalValue: '', sig: ps[0].key });
    } else {
      conflicts.push(key);
      fields.push({
        id: key, name: key, suggested: '', label: labelOf(groups.flat()), evidence: 'conflict', readText: groups.map(g => g[0].quote).join(' | '),
        decision: 'pending', finalValue: '', sig: groups.map(g => g[0].key).sort().join('|'),
        candidates: groups.map(ps => ({ value: ps[0].value, label: labelOf(ps), evidence: evidenceOf(ps), quote: ps[0].quote })),
      });
    }
  }
  const typeField = fields.find(f => f.id === 'type');
  const group = groupOf(typeField?.suggested || typeField?.candidates?.[0]?.value);
  const missing = IMPORTANT[group].filter(k => !fields.some(f => f.id === k));
  for (const k of missing) {
    fields.push({ id: k, name: k, suggested: '', label: null, evidence: 'notFound', decision: 'pending', finalValue: '', sig: '' });
  }
  fields.sort((a, b) => ORDER.indexOf(a.id as FieldKey) - ORDER.indexOf(b.id as FieldKey));
  return { fields, conflicts, missing, group, wouldAskAi: missing.length > 0 };
}

/** Keeps decisions already made on fields whose sources propose the same thing as before. */
export function keepDecisions(oldFields: Field[], newFields: Field[]): Field[] {
  return newFields.map(n => {
    const o = oldFields.find(x => x.id === n.id);
    if (!o || o.decision === 'pending' || o.sig !== n.sig) return n;
    return { ...o };
  });
}
