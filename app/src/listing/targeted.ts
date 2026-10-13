// Voice from the central Voice Command screen: "set the asking price of P1001 to RM3 million", "change the status of the
// factory in Salak Tinggi to Sold". The words are read on the phone; the property is found by its reference or by the
// type and place that were said. The result is only a PROPOSAL (before → after) that the agent ticks and confirms.
import { Listing } from './model';
import { Change, prepare, readDetails, readSetMoney, readStatus, currentValue } from './commands';

export type Targeted =
  | { kind: 'update'; property: Listing; changes: Change[] }
  /** Several properties fit what was said; the agent picks one (or says the reference). */
  | { kind: 'choose'; options: Listing[]; changes: Change[] }
  /** Nothing to change: the property already has these values. */
  | { kind: 'same'; property: Listing }
  | { kind: 'none'; reason: 'noTarget' | 'notFound'; changes: Change[] };

const norm = (r?: string) => (r ?? '').replace(/[\s-]+/g, '').toUpperCase();

/** The property reference said in the text, if one of the known properties has it. */
export function findByRef(text: string, props: Listing[]): Listing | undefined {
  const tokens = text.match(/\b[A-Za-z]{1,6}[\s-]?\d{3,9}\b/g) ?? [];
  for (const t of tokens) {
    const n = norm(t);
    if (/^RM\d/.test(n)) continue;
    const hit = props.find(p => norm(p.ref) === n);
    if (hit) return hit;
  }
  return undefined;
}

/** Properties that fit "the factory in Salak Tinggi" (type and/or place). Needs at least one of the two. */
export function findByDescription(text: string, props: Listing[], places: string[] = []): Listing[] | undefined {
  const d = readDetails(text, places);
  const val = (k: string) => d.changes.find(c => c.key === k)?.value as string | undefined;
  const type = val('type') ?? (d.unclear.includes('factory') ? 'factory' : undefined);
  const area = val('township') ?? val('city');
  if (!type && !area) return undefined;
  const t = type?.toLowerCase();
  return props.filter(p => {
    if (t && !(p.type ?? '').toLowerCase().includes(t)) return false;
    if (area) {
      const a = area.toLowerCase();
      if ((p.township ?? '').toLowerCase() !== a && (p.city ?? '').toLowerCase() !== a) return false;
    }
    return true;
  });
}

/** Reads a "set price / rent / status of <property> to …" command. Returns null when the text is not such a command. */
export function parseTargetedUpdate(text: string, props: Listing[], places: string[] = []): Targeted | null {
  const raw = text.trim();
  if (!raw) return null;
  const changes: Change[] = [];
  const status = readStatus(raw);
  const money = readSetMoney(raw);
  if (/^(?:please\s+)?(?:create|new|add\s+(?:a\s+)?new|register|cipta|daftar)\b/i.test(raw)) return null;
  if (!status && !money) return null;
  if (!/\b(?:set|change|update|mark|make|tukar|ubah|tetapkan|tandakan|kemas\s*kini|is|been|sudah|telah|now)\b/i.test(raw)) return null;
  if (money) changes.push({ key: money.key, value: money.value });
  if (status) changes.push({ key: 'status', value: status });

  const byRef = findByRef(prepare(raw), props);
  const candidates: Listing[] | undefined = byRef ? [byRef] : findByDescription(raw, props, places);
  if (!candidates) {
    // A reference was said (letters + digits, not an RM amount) but no property has it.
    const said = (prepare(raw).match(/\b[A-Za-z]{1,6}-?\d{3,9}\b/g) ?? []).some(t => !/^rm/i.test(t));
    return { kind: 'none', reason: said ? 'notFound' : 'noTarget', changes };
  }
  if (!candidates.length) return { kind: 'none', reason: 'notFound', changes };
  if (candidates.length > 1) return { kind: 'choose', options: candidates.slice(0, 8), changes };
  const property = candidates[0];
  const real = changes.filter(c => currentValue(property, c.key) !== c.value);
  return real.length ? { kind: 'update', property, changes: real } : { kind: 'same', property };
}
