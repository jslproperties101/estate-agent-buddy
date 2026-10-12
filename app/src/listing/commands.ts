// Property voice / text commands (Version 1L). Runs on the phone with simple rules: no AI, no internet, no cost.
// A command becomes a list of PROPOSED changes that the agent reviews before anything is saved.
// Only what was actually said is used: nothing is guessed or invented. Gemini can replace this reader later,
// after the owner approves the integration; the review step stays the same.

import { normaliseSpoken } from '../voice/spoken';
import { Listing, Tenure, Purpose, Status, TYPES } from './model';

export type ChangeKey =
  | 'type' | 'area' | 'landSqft' | 'builtUpSqft' | 'askingPrice' | 'monthlyRent' | 'tenure' | 'leaseExpiryYear'
  | 'bedrooms' | 'bathrooms' | 'parking' | 'floors' | 'purpose' | 'ceilingFt' | 'powerKva' | 'status'
  | 'notes' | 'tenancy.tenant' | 'tenancy.rent' | 'tenancy.start' | 'tenancy.end';

export interface Change { key: ChangeKey; value: string | number; note?: 'unitAssumed' | 'added' | 'appended' }

export type Command =
  | { kind: 'create'; changes: Change[]; unclear: string[] }
  | { kind: 'update'; changes: Change[]; unclear: string[] }
  | { kind: 'find'; type?: string; typeWord?: 'factory'; area?: string; purpose?: 'sale' | 'rent' }
  | { kind: 'ask'; topic: 'tenancy' | 'note'; prefix?: string }
  | { kind: 'unknown' };

/** Places the agent works in (helps when speech recognition writes a place in lower case). More can be added. */
export const KNOWN_AREAS = [
  'Bandar Baru Salak Tinggi', 'Bandar Baru Nilai', 'Bandar Enstek', 'Putra Nilai', 'Kota Warisan', 'Salak Tinggi',
  'Nilai', 'Sepang', 'Labu', 'Mantin', 'Seremban', 'Dengkil', 'Cyberjaya', 'Putrajaya', 'Pajam', 'Lenggeng', 'Banting', 'Semenyih', 'Kajang',
];

const TYPE_WORDS: [RegExp, string][] = [
  [/\bsemi[-\s]?d(?:etached)?\s+(?:factor(?:y|ies)|kilang)|kilang\s+berkembar/i, 'Semi-D factory'],
  [/\bterrace(?:d)?\s+factor(?:y|ies)|kilang\s+teres/i, 'Terrace factory'],
  [/\bdetached\s+factor(?:y|ies)|kilang\s+sesebuah/i, 'Detached factory'],
  [/\bwarehouses?|gudang/i, 'Warehouse'],
  [/\bindustrial\s+land|tanah\s+industri/i, 'Industrial land'],
  [/\bagricultur(?:al|e)\s+land|tanah\s+pertanian|oil\s+palm\s+land|kebun/i, 'Agricultural land'],
  [/\bdevelopment\s+land|tanah\s+pembangunan/i, 'Development land'],
  [/\bsemi[-\s]?d(?:etached)?(?:\s+house)?\b|rumah\s+berkembar/i, 'Semi-D house'],
  [/\bterrace(?:d)?(?:\s+house)?\b|link\s+house|rumah\s+teres/i, 'Terrace house'],
  [/\bbungalows?|banglo/i, 'Bungalow'],
  [/\btown\s?houses?/i, 'Townhouse'],
  [/\bcondo(?:minium)?s?\b|apartments?|kondominium|pangsapuri/i, 'Condo / apartment'],
  [/\bshop\s?(?:lots?|offices?|houses?)|rumah\s+kedai|kedai/i, 'Shoplot'],
  [/\boffices?\b|pejabat/i, 'Office'],
];

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const BM_MONTHS = ['jan', 'feb', 'mac', 'apr', 'mei', 'jun', 'jul', 'ogo', 'sep', 'okt', 'nov', 'dis'];

/** "3.2 million", "580k", "3.2 mil", "2.5 juta" in digits become plain numbers before the spoken-number step. */
function expandScales(s: string): string {
  return s
    .replace(/(\d+(?:\.\d+)?)\s*(?:million|mil|juta|m)\b/gi, (_, n) => String(Math.round(parseFloat(n) * 1_000_000)))
    .replace(/(\d+(?:\.\d+)?)\s*(?:k|thousand|ribu)\b/gi, (_, n) => String(Math.round(parseFloat(n) * 1000)));
}

/** Text with spoken numbers turned into digits (English and Bahasa Malaysia). */
export function prepare(text: string): string {
  return normaliseSpoken(expandScales(normaliseSpoken(expandScales(text)))).replace(/(\d),(\d{3})/g, '$1$2').replace(/(\d),(\d{3})/g, '$1$2');
}

const n = (x: string) => parseFloat(x.replace(/,/g, ''));
const MONEY = String.raw`(?:rm|ringgit)\s*([\d.]+)|([\d.]+)\s*(?:rm|ringgit)`;
const money = (m: RegExpMatchArray | null, at = 1) => (m ? n(m[at] ?? m[at + 1]) : undefined);

function monthYear(s: string): string | undefined {
  const m = /\b([a-z]{3})[a-z]*\s+(\d{4})\b/i.exec(s);
  if (!m) return undefined;
  const k = m[1].toLowerCase();
  const i = MONTHS.indexOf(k) >= 0 ? MONTHS.indexOf(k) : BM_MONTHS.indexOf(k);
  return i >= 0 ? `${m[2]}-${String(i + 1).padStart(2, '0')}` : undefined;
}

function findArea(original: string): string | undefined {
  const low = original.toLowerCase();
  const known = KNOWN_AREAS.find(a => new RegExp(`\\b${a.toLowerCase()}\\b`).test(low));
  if (known) return known;
  const m = /\b(?:in|at|di)\s+([A-Z][\w']*(?:\s+[A-Z][\w']*){0,3})/.exec(original);
  return m?.[1];
}

/** Every property detail stated in the text. Nothing that was not said is returned. */
export function readDetails(original: string): { changes: Change[]; unclear: string[] } {
  const t = prepare(original);
  const low = t.toLowerCase();
  const out: Change[] = [];
  const unclear: string[] = [];
  const add = (key: ChangeKey, value: string | number | undefined, note?: Change['note']) => {
    if (value === undefined || (typeof value === 'number' && !Number.isFinite(value))) return;
    if (!out.some(c => c.key === key)) out.push({ key, value, ...(note ? { note } : {}) });
  };

  const type = TYPE_WORDS.find(([re]) => re.test(t))?.[1];
  if (type && (TYPES as readonly string[]).includes(type)) add('type', type);
  else if (/\bfactor(?:y|ies)\b|\bkilang\b/i.test(t)) unclear.push('factory');

  add('area', findArea(original));

  const area = (label: string) => {
    const m = new RegExp(String.raw`(?:${label})\s*(?:area|size|of|is|:)?\s*(?:of|is|to)?\s*([\d.]+)\s*(square\s*feet|sq\.?\s*ft|sqft|kaki\s+persegi|kps|acres?|ekar)?`, 'i').exec(low);
    if (!m) return undefined;
    const v = n(m[1]);
    const unit = m[2] ?? '';
    return { v: /acre|ekar/.test(unit) ? Math.round(v * 43560) : v, assumed: !unit };
  };
  const land = area(String.raw`land(?:\s+area|\s+size)?|keluasan\s+tanah|tanah`);
  if (land) add('landSqft', land.v, land.assumed ? 'unitAssumed' : undefined);
  const built = area(String.raw`built[-\s]?up(?:\s+area)?|keluasan\s+binaan|binaan`);
  if (built) add('builtUpSqft', built.v, built.assumed ? 'unitAssumed' : undefined);
  if (!land) {
    const acres = /([\d.]+)\s*(?:acres?|ekar)\b/i.exec(low);
    if (acres) add('landSqft', Math.round(n(acres[1]) * 43560));
  }

  const rent = new RegExp(String.raw`(?:rent(?:al)?|sewa(?:an)?)\s*(?:is|of|at|to|price|harga)?\s*(?:to\s*)?(?:${MONEY})`, 'i').exec(low)
    ?? new RegExp(String.raw`(?:${MONEY})\s*(?:per|a|sebulan|setiap)\s*(?:month|bulan)|(?:${MONEY})\s*monthly`, 'i').exec(low);
  const rentValue = rent ? [1, 2, 3, 4, 5, 6].map(i => rent[i]).find(Boolean) : undefined;
  if (rentValue && !/tenan(?:t|cy)|penyewa/.test(low)) add('monthlyRent', n(rentValue));
  const price = new RegExp(String.raw`(?:asking(?:\s+price)?|price|harga(?:\s+diminta)?|selling\s+(?:at|for)|jual(?:\s+pada)?)\s*(?:is|of|at|to|:)?\s*(?:to\s*)?(?:${MONEY})`, 'i').exec(low);
  if (price) add('askingPrice', money(price));
  else if (!rentValue) {
    const any = new RegExp(MONEY, 'i').exec(low);
    if (any && !/tenan(?:t|cy)|penyewa/.test(low)) add('askingPrice', money(any));
  }

  if (/\bfree\s?hold|pegangan\s+bebas|hak\s+milik\s+kekal/i.test(t)) add('tenure', 'freehold' satisfies Tenure);
  else if (/\blease\s?hold|pajakan/i.test(t)) add('tenure', 'leasehold' satisfies Tenure);
  const expiry = /(?:expir(?:es|ing|y)|lease\s+(?:ends|until|till)|tamat)\s*(?:in|on|pada)?\s*(\d{4})/i.exec(t);
  if (expiry) add('leaseExpiryYear', Number(expiry[1]));

  const count = (re: RegExp) => { const m = re.exec(low); return m ? Number(m[1]) : undefined; };
  add('bedrooms', count(/(\d+)\s*(?:bed(?:room)?s?\b|bilik\s+tidur)/));
  add('bathrooms', count(/(\d+)\s*(?:bath(?:room)?s?\b|bilik\s+air|toilets?)/));
  add('floors', count(/(\d+)[-\s]*(?:stor(?:e)?y|storeys|stories|floors?|tingkat)\b/));
  add('ceilingFt', count(/(?:ceiling(?:\s+height)?)\s*(?:of|is)?\s*(\d+)\s*(?:ft|feet|kaki)?|(\d+)\s*(?:ft|feet)\s+ceiling/) ?? count(/(\d+)\s*(?:ft|feet)\s+ceiling/));
  add('powerKva', count(/(\d+)\s*kva\b/));

  if (/\b(?:for|to)\s+(?:rent|let)\b|untuk\s+disewa|\bdisewakan\b/i.test(t)) add('purpose', (/\bfor\s+sale\b|dijual/i.test(t) ? 'sale_or_rent' : 'rent') satisfies Purpose);
  else if (/\bfor\s+sale\b|untuk\s+dijual|\bdijual\b/i.test(t)) add('purpose', 'sale' satisfies Purpose);

  return { changes: out, unclear };
}

/**
 * Reads one command. `current` is the open property, if any: then changes are proposed for that property.
 * In the list, "create a new …" proposes a new property and "find …" searches.
 */
export function parseCommand(text: string, current?: Listing): Command {
  const original = text.trim();
  if (!original) return { kind: 'unknown' };
  const t = prepare(original);
  const low = t.toLowerCase();

  // Find / show (list or central voice screen)
  if (!current && /^(?:please\s+)?(?:find|show|search|look\s+for|cari|tunjuk)\b/i.test(low) && !/\b(?:buyers?|vendors?|appointments?|pembeli|penjual|temujanji)\b/.test(low)) {
    const r = readDetails(original);
    const pick = (k: ChangeKey) => r.changes.find(c => c.key === k)?.value as string | undefined;
    const purpose = pick('purpose');
    return {
      kind: 'find', type: pick('type'), ...(r.unclear.includes('factory') ? { typeWord: 'factory' as const } : {}),
      area: pick('area'), purpose: purpose === 'rent' ? 'rent' : purpose === 'sale' ? 'sale' : undefined,
    };
  }

  const isCreate = /^(?:please\s+)?(?:create|new|add\s+(?:a\s+)?new|register|cipta|daftar)\b|\b(?:tambah|buat)\b.*\bbaharu\b/i.test(low);
  if (isCreate && !current) {
    const r = readDetails(original);
    return { kind: 'create', changes: r.changes.filter(c => !c.key.startsWith('tenancy') && c.key !== 'status'), unclear: r.unclear };
  }
  if (!current) return { kind: 'unknown' };

  // ----- changes to the open property -----
  const changes: Change[] = [];

  // Notes: "add a note …"
  const note = /\b(?:add|make|tambah)\s+(?:a\s+)?(?:note|catatan)\b\s*(.*)$/i.exec(original);
  if (note) {
    let body = note[1].trim().replace(/[.\s]+$/, '');
    const colon = body.indexOf(':');
    if (colon >= 0) {
      const topic = body.slice(0, colon).replace(/^(?:about|on|regarding|tentang|mengenai)\s+(?:the\s+)?/i, '').trim();
      const rest = body.slice(colon + 1).trim();
      if (!rest) return { kind: 'ask', topic: 'note', prefix: cap(topic) + ': ' };
      body = topic ? `${cap(topic)}: ${rest}` : rest;
    } else if (/^(?:about|on|regarding|tentang|mengenai)\s+/i.test(body) && body.split(/\s+/).length <= 6) {
      // Only a topic was said ("add a note about the owner's instructions"): ask for the note itself.
      return { kind: 'ask', topic: 'note', prefix: cap(body.replace(/^(?:about|on|regarding|tentang|mengenai)\s+(?:the\s+)?/i, '')) + ': ' };
    } else {
      body = body.replace(/^(?:that|saying|:)\s*/i, '');
    }
    if (!body) return { kind: 'ask', topic: 'note' };
    return { kind: 'update', changes: [{ key: 'notes', value: cap(body), note: 'appended' }], unclear: [] };
  }

  // Tenancy
  if (/\btenan(?:cy|t)|penyewa(?:an)?\b/i.test(low)) {
    const tenant = /\btenant\s+(?:is\s+)?([A-Z][\w&.'-]*(?:\s+(?:[A-Z][\w&.'-]*|sdn|bhd|sdn\.|bhd\.))*)/.exec(original)?.[1]?.trim();
    const rentM = new RegExp(String.raw`(?:${MONEY})`, 'i').exec(low);
    const from = /\b(?:from|starting|start(?:s|ed)?|mula)\b\s*(?:on|in)?\s*([a-z]+\s+\d{4})/i.exec(t);
    const to = /\b(?:to|until|till|ends?|ending|expir(?:es|ing)|tamat|hingga)\b\s*(?:on|in)?\s*([a-z]+\s+\d{4})/i.exec(t);
    if (tenant) changes.push({ key: 'tenancy.tenant', value: tenant });
    if (rentM) changes.push({ key: 'tenancy.rent', value: money(rentM)! });
    const st = from && monthYear(from[1]); if (st) changes.push({ key: 'tenancy.start', value: st });
    const en = to && monthYear(to[1]); if (en) changes.push({ key: 'tenancy.end', value: en });
    if (!changes.length) return { kind: 'ask', topic: 'tenancy' };
    return { kind: 'update', changes, unclear: [] };
  }

  // "add three parking bays": adds to what is there (shown as before → after for review)
  const addParking = /\b(?:add|tambah)\s+(\d+)\s*(?:more\s+)?(?:car\s*)?(?:parking(?:\s+(?:bays?|lots?|spaces?))?|car\s*parks?|petak\s+(?:letak\s+)?kereta)/i.exec(low);
  if (addParking) changes.push({ key: 'parking', value: (current.parking ?? 0) + Number(addParking[1]), note: 'added' });
  const setParking = /\b(?:parking|car\s*parks?)\s*(?:bays?|lots?|spaces?)?\s*(?:to|is|=)\s*(\d+)/i.exec(low);
  if (setParking && !addParking) changes.push({ key: 'parking', value: Number(setParking[1]) });

  // Status: "mark as sold", "it's been rented"
  const st = /\b(?:mark(?:ed)?\s+(?:it\s+)?as|status\s+(?:to|is)|now)\s+(available|sold|rented|off\s+market|in\s+progress)/i.exec(low);
  if (st) changes.push({ key: 'status', value: ({ available: 'available', sold: 'sold', rented: 'rented', 'off market': 'off_market', 'in progress': 'in_progress' } as Record<string, Status>)[st[1].replace(/\s+/, ' ')] });

  for (const c of readDetails(original).changes) if (!changes.some(x => x.key === c.key) && !(c.key === 'parking')) changes.push(c);
  // A place mentioned in an edit is only used when the agent says to change the location.
  const filtered = changes.filter(c => c.key !== 'area' || /\b(?:location|area|kawasan|lokasi)\b/i.test(low));
  return filtered.length ? { kind: 'update', changes: filtered, unclear: [] } : { kind: 'unknown' };
}

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** Applies reviewed changes to a property. Notes are added on a new line, never replacing earlier notes. */
export function applyChanges(l: Listing, changes: Change[]): Listing {
  const next: Listing = { ...l, tenancy: { ...(l.tenancy ?? {}) } };
  for (const c of changes) {
    if (c.key === 'notes') next.notes = [l.notes, String(c.value)].filter(Boolean).join('\n');
    else if (c.key.startsWith('tenancy.')) (next.tenancy as Record<string, unknown>)[c.key.slice(8)] = c.value;
    else (next as unknown as Record<string, unknown>)[c.key] = c.value;
  }
  if (!Object.keys(next.tenancy!).length) delete next.tenancy;
  return next;
}

/** The current value of a field, for showing "before → after". */
export function currentValue(l: Listing | undefined, key: ChangeKey): unknown {
  if (!l) return undefined;
  if (key.startsWith('tenancy.')) return (l.tenancy as Record<string, unknown> | undefined)?.[key.slice(8)];
  return (l as unknown as Record<string, unknown>)[key];
}
