// Property voice / text commands. Voice is how property information is captured: the words are read on the phone
// with simple rules (no AI, no internet, no cost) and become a list of PROPOSED values that the agent reviews
// before anything is saved. Only what was actually said is used: nothing is guessed or invented.
// An AI reader (for example Gemini) could replace these rules later as an optional layer; the review step stays.

import { normaliseSpoken } from '../voice/spoken';
import { Listing, Tenure, Purpose, Status, TYPES, normalisePhone } from './model';
import { allBuiltInCities, allBuiltInTownships, chainFor } from '../domain/places';

export type ChangeKey =
  | 'type' | 'city' | 'township' | 'street' | 'unitNo' | 'lotNo' | 'landSqft' | 'builtUpSqft' | 'askingPrice' | 'monthlyRent'
  | 'tenure' | 'leaseExpiryYear' | 'bedrooms' | 'bathrooms' | 'parking' | 'floors' | 'purpose' | 'ceilingFt' | 'powerKva' | 'status'
  | 'ownerName' | 'ownerPhone' | 'notes' | 'tenancy.tenant' | 'tenancy.rent' | 'tenancy.start' | 'tenancy.end' | 'state';

export interface Change { key: ChangeKey; value: string | number; note?: 'unitAssumed' | 'added' | 'appended' }

export type Command =
  | { kind: 'create'; changes: Change[]; unclear: string[] }
  | { kind: 'update'; changes: Change[]; unclear: string[] }
  | { kind: 'find'; type?: string; typeWord?: 'factory'; area?: string; purpose?: 'sale' | 'rent';
      /** JoyChange003 Change 57 ("Search and find"): price range, least bedrooms, tenure and status, when said. */
      priceMin?: number; priceMax?: number; bedsMin?: number; tenure?: Tenure; status?: Status }
  | { kind: 'ask'; topic: 'tenancy' | 'note'; prefix?: string }
  | { kind: 'unknown' };

/** Places the agent works in (helps when speech recognition writes a place in lower case). More can be added. */
export const KNOWN_AREAS = [
  'Bandar Baru Salak Tinggi', 'Bandar Baru Nilai', 'Bandar Enstek', 'Putra Nilai', 'Kota Warisan', 'Salak Tinggi',
  'Nilai', 'Sepang', 'Labu', 'Mantin', 'Seremban', 'Dengkil', 'Cyberjaya', 'Putrajaya', 'Pajam', 'Lenggeng', 'Banting', 'Semenyih', 'Kajang',
];

const TYPE_WORDS: [RegExp, string][] = [
  [/\bresidential\s+land|tanah\s+kediaman|tanah\s+rumah|住宅地/i, 'Residential land'],
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

const STATUS_WORD = String.raw`(available|sold|rented|off[-\s]?market|in[-\s]?progress|tersedia|terjual|disewa|tersewa|dalam\s+proses|tarik\s+balik)`;
const STATUS_MAP: Record<string, Status> = {
  available: 'available', tersedia: 'available', sold: 'sold', terjual: 'sold', rented: 'rented', disewa: 'rented', tersewa: 'rented',
  'off market': 'off_market', 'tarik balik': 'off_market', 'in progress': 'in_progress', 'dalam proses': 'in_progress',
};
/** "mark as sold", "change the status to Sold", "it has been rented", "tandakan sebagai terjual", "status kepada disewa". */
export function readStatus(text: string): Status | undefined {
  const low = prepare(text).toLowerCase();
  const patterns = [
    String.raw`\b(?:status|keadaan)\b.*?\b(?:to|as|is|kepada|ialah|sebagai|jadi)\s+${STATUS_WORD}\b`,
    String.raw`\b(?:mark(?:ed)?|tandakan|tanda)\b.*?\b(?:as|sebagai)\s+${STATUS_WORD}\b`,
    String.raw`\b(?:change|set|update|make|tukar|ubah|tetapkan)\b.*?\b(?:to|kepada)\s+${STATUS_WORD}\b`,
    String.raw`\b(?:is|has\s+been|been|now|already|sudah|telah|kini)\s+${STATUS_WORD}\b`,
  ];
  for (const re of patterns) {
    const m = new RegExp(re, 'i').exec(low);
    if (m) return STATUS_MAP[m[1].replace(/[-\s]+/, ' ')];
  }
  return undefined;
}

/** "set the asking price to RM3 million", "change the rent to 1800", "tukar harga kepada RM2 juta": the number after "to" is used,
 *  with or without "RM". Rent is chosen when the words say rent / sewa, otherwise the asking price. */
export function readSetMoney(text: string): { key: 'askingPrice' | 'monthlyRent'; value: number } | undefined {
  const low = prepare(text).toLowerCase();
  /** An optional property reference right after the words, e.g. "price of P1001 to …". */
  const REF_OPT = String.raw`(?:\s+(?:(?:of|for|untuk|bagi)\s+)?(?:the\s+)?(?!rm\d)[a-z]{1,6}-?\d{3,9})?`;
  const num = String.raw`(?:rm|ringgit)?\s*([\d]+(?:\.\d+)?)\s*(?:rm|ringgit)?`;
  const rent = new RegExp(String.raw`\b(?:monthly\s+rent(?:al)?|rent(?:al)?|sewa(?:an)?(?:\s+bulanan)?)\b${REF_OPT}[^\d]{0,80}?\b(?:to|kepada|at|is|ialah|jadi|menjadi)\s*${num}`, 'i').exec(low);
  if (rent && Number.isFinite(parseFloat(rent[1]))) return { key: 'monthlyRent', value: parseFloat(rent[1]) };
  const price = new RegExp(String.raw`\b(?:asking\s+price|selling\s+price|price|harga(?:\s+diminta|\s+jualan)?)\b${REF_OPT}[^\d]{0,80}?\b(?:to|kepada|at|is|ialah|jadi|menjadi)\s*${num}`, 'i').exec(low);
  if (price && Number.isFinite(parseFloat(price[1]))) return { key: 'askingPrice', value: parseFloat(price[1]) };
  return undefined;
}

function monthYear(s: string): string | undefined {
  const m = /\b([a-z]{3})[a-z]*\s+(\d{4})\b/i.exec(s);
  if (!m) return undefined;
  const k = m[1].toLowerCase();
  const i = MONTHS.indexOf(k) >= 0 ? MONTHS.indexOf(k) : BM_MONTHS.indexOf(k);
  return i >= 0 ? `${m[2]}-${String(i + 1).padStart(2, '0')}` : undefined;
}

/** Words that end a place name said in lower case ("in sungai besi for sale" → "Sungai Besi"). */
const PLACE_END = new Set(['for', 'to', 'with', 'asking', 'price', 'at', 'and', 'owner', 'harga', 'untuk', 'dengan', 'pemilik', 'kepada', 'dan', 'yang',
  'freehold', 'leasehold', 'rent', 'rental', 'sale', 'sewa', 'jual', 'dijual', 'disewa', 'bedroom', 'bedrooms', 'bilik', 'land', 'built', 'built-up', 'near', 'dekat',
  'under', 'below', 'above', 'over', 'between', 'bawah', 'atas', 'antara', 'priced', 'tenure', 'status', 'pegangan', 'rm', 'ringgit', 'call', 'phone', 'telefon']);
const titleWords = (s: string) => s.replace(/\b\w/g, c => c.toUpperCase());
function findArea(original: string, extra: string[] = []): string | undefined {
  const low = original.toLowerCase();
  // Change 58: the agent's own places first, then the built-in towns and areas (so "Sungai Besi" is known).
  const all = [...new Set([...extra, ...KNOWN_AREAS, ...allBuiltInTownships(), ...allBuiltInCities()])].sort((a, b) => b.length - a.length);
  const known = all.find(a => new RegExp(`\\b${a.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(low));
  if (known) return known;
  const m = /\b(?:in|at|di)\s+((?!Jalan\b|Jln\b|Lorong\b)[A-Z][\w']*(?:\s+[A-Z][\w']*){0,3})/.exec(original);
  if (m) return m[1];
  // Speech often comes in lower case: up to three words after "in" / "di", stopping at a word that starts something else.
  const lower = /\b(?:in|di)\s+([a-z][a-z']*(?:\s+[a-z][a-z']*){0,2})/.exec(original);
  if (!lower) return undefined;
  const words: string[] = [];
  for (const w of lower[1].split(/\s+/)) { if (PLACE_END.has(w) || /^(?:jalan|jln|lorong|the|a|an)$/.test(w)) break; words.push(w); }
  return words.length ? titleWords(words.join(' ')) : undefined;
}

/** A place said in a command goes to City when it is a known town, otherwise to Township. */
export function placeKey(place: string): 'city' | 'township' {
  return allBuiltInCities().some(c => c.toLowerCase() === place.toLowerCase()) ? 'city' : 'township';
}

/** Every property detail stated in the text. Nothing that was not said is returned. */
export function readDetails(original: string, places: string[] = []): { changes: Change[]; unclear: string[] } {
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

  const place = findArea(original, places);
  if (place) {
    add(placeKey(place), place);
    // Change 58: the rest of the address chain from the built-in lists (township → city → state).
    const chain = chainFor(place);
    if (chain.township && placeKey(place) === 'township') { add('city', chain.city); add('state', chain.state); }
    else if (chain.city) add('state', chain.state);
  }
  const street = /\b((?:jalan|jln\.?|lorong|lrg\.?|persiaran)\s+[A-Za-z0-9][\w/ ]*?)(?=\s*(?:,|\.(?:\s|$)|$|\bin\b|\bdi\b|\bnear\b))/i.exec(original);
  if (street) add('street', street[1].replace(/^jln\.?/i, 'Jalan').replace(/^lrg\.?/i, 'Lorong').replace(/\s+/g, ' ').replace(/^\w/, c => c.toUpperCase()));
  // One Unit/Lot Number field (Change 009): "unit 7" and "lot 2/14" both go there, together when both are said.
  const unit = /\bunit\s+(?:no\.?\s*|number\s+)?([A-Z]?-?\d[\w-]*)/i.exec(t);
  const lot = /\blot\s+(?:no\.?\s*|number\s+)?([A-Z]?\d[\w/-]*)/i.exec(t);
  const unitLotText = [unit && unit[1].toUpperCase(), lot && `Lot ${lot[1].toUpperCase()}`].filter(Boolean).join(', ');
  if (unitLotText) add('unitNo', unitLotText);
  const owner = /\b(?:owner|pemilik|tuan\s+rumah)\s+(?:is\s+|ialah\s+|named\s+|bernama\s+)?((?:(?:Mr|Mrs|Ms|Madam|Encik|En|Puan|Pn|Cik|Dato'?|Datuk|Dr)\.?\s+)?[A-Z][\w'.-]*(?:\s+(?:bin|binti|a\/l|a\/p|[A-Z][\w'.-]*)){0,4})/.exec(original);
  if (owner && !/^(?:Wants|Says|Is)\b/.test(owner[1])) add('ownerName', owner[1].trim());
  else {
    // Change 58: a name said in lower case ("owner ahmad bin ali 012…"): up to four words, written in Title Case.
    const lowOwner = /\b(?:owner|pemilik|tuan\s+rumah)\s+(?:is\s+|ialah\s+|named\s+|bernama\s+)?((?:encik|en|puan|pn|cik|mr|mrs|ms|madam|dato'?|datuk|dr)?\.?\s*[a-z][a-z'.-]*(?:\s+(?:bin|binti|a\/l|a\/p|[a-z][a-z'.-]*)){0,3})/i.exec(original);
    const name = lowOwner?.[1].split(/\s+/).filter(Boolean);
    if (name?.length) {
      const stop = name.findIndex((w, i) => i > 0 && PLACE_END.has(w.toLowerCase()));
      const kept = (stop > 0 ? name.slice(0, stop) : name).join(' ');
      if (!/^(?:wants|says|is|phone|number)\b/i.test(kept)) add('ownerName', titleWords(kept.toLowerCase()).replace(/\b(Bin|Binti|A\/l|A\/p)\b/g, m => m.toLowerCase()));
    }
  }
  const phone = /(?:\+?6?0)1\d[\s-]?\d{3,4}[\s-]?\d{4}\b|\b0[3-9][\s-]?\d{3,4}[\s-]?\d{4}\b/.exec(t);
  if (phone) add('ownerPhone', normalisePhone(phone[0]) ?? phone[0]);

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
  // JoyChange003 Change 58: speech often leaves out "RM" ("rental 1800 per month", "asking price 500k"): a plain number
  // straight after the word is the amount when it is big enough to be one (never "3 bedrooms").
  const NOT_MONEY = String.raw`(?!\s*(?:sq|square|kaki|bed|bilik|bath|acre|ekar|storey|tingkat|%|per\s*cent|parking|car))`;
  const bareRent = rent ? null : new RegExp(String.raw`\b(?:monthly\s+rent(?:al)?|rent(?:al)?|sewa(?:an)?(?:\s+bulanan)?)\s*(?:is|of|at|to|:)?\s*([\d.]+)\b${NOT_MONEY}`, 'i').exec(low);
  const rentValue = rent ? [1, 2, 3, 4, 5, 6].map(i => rent[i]).find(Boolean) : bareRent && n(bareRent[1]) >= 100 ? bareRent[1] : undefined;
  if (rentValue && !/tenan(?:t|cy)|penyewa/.test(low)) add('monthlyRent', n(rentValue));
  const price = new RegExp(String.raw`(?:asking(?:\s+price)?|price|harga(?:\s+diminta)?|selling\s+(?:at|for)|jual(?:\s+pada)?)\s*(?:is|of|at|to|:)?\s*(?:to\s*)?(?:${MONEY})`, 'i').exec(low);
  const barePrice = price ? null : new RegExp(String.raw`\b(?:asking\s+price|selling\s+price|price|harga(?:\s+diminta|\s+jualan)?)\s*(?:is|of|at|to|:)?\s*([\d.]+)\b${NOT_MONEY}`, 'i').exec(low);
  if (price) add('askingPrice', money(price));
  else if (barePrice && n(barePrice[1]) >= 1000) add('askingPrice', n(barePrice[1]));
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
export function parseCommand(text: string, current?: Listing, places: string[] = []): Command {
  const original = text.trim();
  if (!original) return { kind: 'unknown' };
  const t = prepare(original);
  const low = t.toLowerCase();

  // Find / show (list or central voice screen)
  if (!current && /^(?:please\s+)?(?:find|show|search|look\s+for|cari|tunjuk)\b/i.test(low) && !/\b(?:buyers?|vendors?|appointments?|tasks?|to-?dos?|viewings?|pembeli|penjual|temujanji|tugasan|lawatan)\b/.test(low)) {
    const r = readDetails(original, places);
    const pick = (k: ChangeKey) => r.changes.find(c => c.key === k)?.value as string | undefined;
    const purpose = pick('purpose');
    return {
      kind: 'find', type: pick('type'), ...(r.unclear.includes('factory') ? { typeWord: 'factory' as const } : {}),
      area: pick('township') ?? pick('city'), purpose: purpose === 'rent' ? 'rent' : purpose === 'sale' ? 'sale' : undefined,
      ...findFilters(t),
    };
  }

  const isCreate = /^(?:please\s+)?(?:create|new|add\s+(?:a\s+)?new|register|cipta|daftar)\b|\b(?:tambah|buat)\b.*\bbaharu\b/i.test(low);
  if (isCreate && !current) {
    const r = readDetails(original, places);
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

  // Status: "mark as sold", "change the status to Sold", "it has been rented", "tandakan sebagai terjual"
  const status = readStatus(original);
  if (status) changes.push({ key: 'status', value: status });

  // "set the asking price to RM3 million" (RM optional), "change the rent to 1800"
  const setMoney = readSetMoney(original);
  if (setMoney) changes.push({ key: setMoney.key, value: setMoney.value });

  for (const c of readDetails(original, places).changes) if (!changes.some(x => x.key === c.key) && !(c.key === 'parking')) changes.push(c);
  // A place, street, unit, lot or owner mentioned in an edit is only used when the agent says to change it.
  const LOCATION_KEYS: ChangeKey[] = ['city', 'township', 'street', 'unitNo', 'lotNo', 'state'];
  const filtered = changes.filter(c =>
    (!LOCATION_KEYS.includes(c.key) || /\b(?:location|area|address|street|jalan|unit|lot|township|city|kawasan|lokasi|alamat)\b/i.test(low))
    && (!['ownerName', 'ownerPhone'].includes(c.key) || /\b(?:owner|pemilik|phone|telefon|number|nombor)\b/i.test(low)));
  return filtered.length ? { kind: 'update', changes: filtered, unclear: [] } : { kind: 'unknown' };
}

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** Change 57 ("Search and find"): "under RM500k", "above 1 million", "between RM400k and RM600k", "at least 3 bedrooms",
 *  "freehold", "sold" / "available" — only what was said. `t` is the prepared text (numbers already in digits). */
export function findFilters(t: string): { priceMin?: number; priceMax?: number; bedsMin?: number; tenure?: Tenure; status?: Status } {
  const low = t.toLowerCase();
  const num = String.raw`(?:rm|ringgit)?\s*(\d+(?:\.\d+)?)`;
  const out: { priceMin?: number; priceMax?: number; bedsMin?: number; tenure?: Tenure; status?: Status } = {};
  const between = new RegExp(String.raw`\b(?:between|antara)\s+${num}\s+(?:and|to|dan|hingga)\s+${num}`).exec(low);
  if (between) { out.priceMin = parseFloat(between[1]); out.priceMax = parseFloat(between[2]); }
  else {
    const max = new RegExp(String.raw`\b(?:under|below|less\s+than|up\s+to|max(?:imum)?|within|bawah|kurang\s+(?:dari(?:pada)?|daripada)|tidak\s+melebihi)\s+${num}`).exec(low);
    if (max) out.priceMax = parseFloat(max[1]);
    const min = new RegExp(String.raw`\b(?:above|over|more\s+than|from|min(?:imum)?|atas|lebih\s+(?:dari(?:pada)?|daripada))\s+${num}`).exec(low);
    if (min) out.priceMin = parseFloat(min[1]);
  }
  const beds = /\b(?:at\s+least\s+|minimum\s+|min\s+|sekurang-kurangnya\s+)?(\d+)\s*(?:\+\s*)?(?:bed(?:room)?s?\b|bilik(?:\s+tidur)?\b|rooms?\b)/.exec(low);
  if (beds) out.bedsMin = Number(beds[1]);
  if (/\bfree\s?hold|pegangan\s+bebas|hak\s+milik\s+kekal/.test(low)) out.tenure = 'freehold';
  else if (/\blease\s?hold|pajakan/.test(low)) out.tenure = 'leasehold';
  const st = /\b(available|sold|rented|tersedia|terjual|disewa|tersewa)\b/.exec(low)?.[1];
  if (st) out.status = STATUS_MAP[st];
  return out;
}

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
