// Local extraction rules (Version 1I proposal): free, run on the device, no AI.
// Each rule finds a labelled value in text and keeps the exact words it matched,
// so every result can be shown with its source and quote.
// English and Bahasa Malaysia rules are the main set. Chinese and Tamil rules are
// a small first draft and must be tested on real documents before they are relied on.

export type FieldKey =
  | 'location' | 'unit' | 'lot' | 'type' | 'availability' | 'price' | 'land' | 'builtup'
  | 'tenure' | 'titleType' | 'ceiling' | 'power' | 'bedrooms' | 'bathrooms' | 'docPhone'
  | 'floors' | 'ownerName' | 'remarks';

export const ALL_FIELDS: FieldKey[] = [
  'location', 'unit', 'lot', 'type', 'availability', 'price', 'land', 'builtup',
  'tenure', 'titleType', 'ceiling', 'power', 'bedrooms', 'bathrooms', 'docPhone',
  'floors', 'ownerName', 'remarks',
];

export interface Segment {
  sourceId: string;
  sourceName: string;
  page: number | null;          // null for Word files and notes
  text: string;
  stated?: boolean;             // true when a person typed it (a note): label STATED
}

export interface Proposal {
  field: FieldKey;
  value: string;                // shown to the person
  key: string;                  // normalised, used to compare sources
  quote: string;                // exact words from the source
  sourceId: string;
  sourceName: string;
  page: number | null;
  stated: boolean;
}

const num = (s: string) => parseFloat(s.replace(/,/g, ''));
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

// ---------- money ----------
function money(raw: string): { value: string; key: string } | null {
  const m = raw.match(/(?:RM|MYR)?\s*([\d][\d,]*(?:\.\d+)?)\s*(mil(?:lion)?|juta|m\b|k\b|j\b|万)?/i);
  if (!m) return null;
  let n = num(m[1]);
  const unit = (m[2] || '').toLowerCase();
  if (['mil', 'million', 'juta', 'm', 'j'].includes(unit)) n *= 1_000_000;
  else if (unit === 'k') n *= 1_000;
  else if (unit === '万') n *= 10_000;
  if (!isFinite(n) || n < 1000) return null;
  return { value: 'RM ' + fmt(n), key: String(Math.round(n)) };
}

// ---------- area ----------
const AREA_UNIT = String.raw`(sq\.?\s?ft\.?|sqft|s\.?f\.?|square\s+feet|kps|kaki\s+persegi|acres?|ekar|sq\.?\s?m\.?|m2|m²|meter\s+persegi|hectares?|ha|平方尺|英亩|சதுர\s*அடி)`;
function area(nRaw: string, unitRaw: string): { value: string; key: string } | null {
  let n = num(nRaw);
  if (!isFinite(n) || n <= 0) return null;
  const u = unitRaw.toLowerCase().replace(/\s+/g, ' ');
  if (/acre|ekar|英亩/.test(u)) n *= 43_560;
  else if (/hectare|^ha$/.test(u)) n *= 107_639;
  else if (/sq\.? ?m|m2|m²|meter/.test(u)) n *= 10.7639;
  return { value: fmt(n) + ' sq ft', key: String(Math.round(n)) };
}

interface Rule {
  field: FieldKey;
  re: RegExp;                     // must be global
  make: (m: RegExpExecArray) => { value: string; key: string } | null;
}

const PRICE_LABEL = String.raw`(?:asking\s+price|selling\s+price|sale\s+price|price|asking|harga\s+jualan|harga\s+diminta|harga|售价|价格|叫价|விலை)`;
const LAND_LABEL = String.raw`(?:land\s+area|land\s+size|land|keluasan\s+tanah|luas\s+tanah|土地面积|地段面积|நில\s*பரப்பு)`;
const BUILT_LABEL = String.raw`(?:built[-\s]?up(?:\s+area)?|b\/u|floor\s+area|keluasan\s+(?:binaan|lantai)|luas\s+binaan|建筑面积|கட்டட\s*பரப்பு)`;

const AREAS = ['Bandar Baru Nilai', 'Putra Nilai', 'Nilai Impian', 'Nilai', 'Bandar Baru Salak Tinggi', 'Salak Tinggi', 'Sepang', 'Dengkil', 'Cyberjaya', 'Bangi', 'Seremban', 'Labu', 'Mantin', 'Enstek', 'KLIA'];

const TYPES: [RegExp, string][] = [
  [/semi[-\s]?d(?:etached)?\s+factory|kilang\s+(?:berkembar|semi[-\s]?d)|半独立式?厂房/i, 'Semi-D factory'],
  [/detached\s+factory|kilang\s+sesebuah|独立式?厂房/i, 'Detached factory'],
  [/terrace\s+factory|kilang\s+teres|排屋厂房/i, 'Terrace factory'],
  [/cluster\s+factory|kilang\s+kluster/i, 'Cluster factory'],
  [/warehouse|gudang|货仓/i, 'Warehouse'],
  [/factory|kilang|厂房|தொழிற்சாலை/i, 'Factory'],
  [/shop\s?(?:lot|office|house)|kedai\s+pejabat|rumah\s+kedai|店屋/i, 'Shoplot'],
  [/office\s+(?:suite|unit|space)|ruang\s+pejabat|办公室/i, 'Office'],
  [/condo(?:minium)?|kondominium|apartment|pangsapuri|serviced\s+residence|公寓/i, 'Condo / apartment'],
  [/semi[-\s]?d(?:etached)?\s+house|rumah\s+berkembar|半独立式?洋房/i, 'Semi-D house'],
  [/bungalow|banglo|独立式?洋房/i, 'Bungalow'],
  [/terrace\s+house|rumah\s+teres|排屋/i, 'Terrace house'],
  [/industrial\s+land|tanah\s+industri|工业地/i, 'Industrial land'],
  [/agricultural\s+land|tanah\s+pertanian|农业地/i, 'Agricultural land'],
  [/development\s+land|tanah\s+pembangunan|发展地/i, 'Development land'],
  // Spoken short forms (checked last, so a factory is never read as a house)
  [/\bterrace\b|\bteres\b/i, 'Terrace house'],
  [/\bsemi[-\s]?d\b/i, 'Semi-D house'],
  [/\bshop\s?lot\b|\bkedai\b/i, 'Shoplot'],
];

const RULES: Rule[] = [
  { field: 'price', re: new RegExp(PRICE_LABEL + String.raw`\s*[:：\-]?\s*((?:RM|MYR)\s?[\d][\d,]*(?:\.\d+)?\s*(?:mil(?:lion)?|juta|m\b|k\b|万)?|[\d][\d,]*(?:\.\d+)?\s*(?:mil(?:lion)?|juta|万))`, 'gi'), make: m => money(m[1]) },
  { field: 'price', re: /\b(RM\s?\d+(?:\.\d+)?\s*(?:mil(?:lion)?|juta))\b/gi, make: m => money(m[1]) },
  // Spoken or plain prices without "RM": "harga 580000", "asking 580,000" (5 or more digits only).
  { field: 'price', re: new RegExp(PRICE_LABEL + String.raw`\s*[:：\-]?\s*(\d[\d,]{4,}(?:\.\d+)?)(?![\d,]*\s*(?:sq|kaki|ft|m2|kva))`, 'gi'), make: m => money(m[1]) },
  { field: 'land', re: new RegExp(LAND_LABEL + String.raw`\s*[:：\-]?\s*(?:approx\.?\s*|lebih\s+kurang\s*)?([\d][\d,]*(?:\.\d+)?)\s*` + AREA_UNIT, 'gi'), make: m => area(m[1], m[2]) },
  { field: 'builtup', re: new RegExp(BUILT_LABEL + String.raw`\s*[:：\-]?\s*(?:approx\.?\s*)?([\d][\d,]*(?:\.\d+)?)\s*` + AREA_UNIT, 'gi'), make: m => area(m[1], m[2]) },
  { field: 'tenure', re: /\b(freehold|leasehold|pegangan\s+bebas|pajakan)\b(?:\s*\(?\s*(\d{2,3})\s*(?:years?|yrs?|tahun)\)?)?|(永久地契|租赁地契)/gi, make: m => {
      const w = (m[1] || m[3] || '').toLowerCase();
      const free = /freehold|bebas|永久/.test(w);
      const v = free ? 'Freehold' : 'Leasehold' + (m[2] ? ` (${m[2]} years)` : '');
      return { value: v, key: v.toLowerCase() };
    } },
  { field: 'titleType', re: /\b(individual\s+title|strata\s+title|master\s+title|hakmilik\s+(?:individu|strata|induk))\b/gi, make: m => {
      const w = m[1].toLowerCase();
      const v = /individ/.test(w) ? 'Individual title' : /strata/.test(w) ? 'Strata title' : 'Master title';
      return { value: v, key: v.toLowerCase() };
    } },
  { field: 'ceiling', re: /(?:ceiling(?:\s+height)?|ketinggian\s+siling|siling|楼高)\s*[:：\-]?\s*(?:approx\.?\s*)?([\d.]+)\s*(ft|feet|kaki|'|m|meter|尺)(?![a-z])/gi, make: m => {
      let n = parseFloat(m[1]); if (!isFinite(n)) return null;
      if (/^m/.test(m[2].toLowerCase())) n = n * 3.28084;
      return { value: (Math.round(n * 10) / 10) + ' ft', key: String(Math.round(n * 10) / 10) };
    } },
  { field: 'power', re: /([\d][\d,]*(?:\.\d+)?)\s*(kva|amp(?:ere)?s?)\b/gi, make: m => {
      const v = fmt(num(m[1])) + (/kva/i.test(m[2]) ? ' kVA' : ' amp');
      return { value: v, key: v.toLowerCase() };
    } },
  { field: 'bedrooms', re: /\b(\d{1,2})\s*(?:bedrooms?|beds?|bilik\s+tidur|间房|卧室)/gi, make: m => ({ value: m[1], key: m[1] }) },
  { field: 'bathrooms', re: /\b(\d{1,2})\s*(?:bathrooms?|baths?|bilik\s+(?:air|mandi)|toilets?|浴室|厕所)/gi, make: m => ({ value: m[1], key: m[1] }) },
  { field: 'floors', re: /\b(\d{1,2})\s*[-\s]?\s*(?:storey|story|storeys|stories|tingkat)\b/gi, make: m => ({ value: m[1], key: m[1] }) },
  { field: 'ownerName', re: /\b(?:owner|pemilik|tuan\s+punya)(?:'s\s+name|\s+name|\s+is|\s+bernama|\s+nama(?:nya)?)?\s*(?:is\s+)?[:：]?\s*((?:Mr|Mrs|Ms|Madam|Mdm|Encik|En|Puan|Pn|Cik|Dato'?|Datin|Tuan|Dr)\.?\s+[A-Z][A-Za-z'-]+(?:\s+(?!(?:wants?|says?|said|kata|nak|mahu|is|was|phone|telefon|tel|number|nombor|and|dan|selling|jual|at|di|in)\b)(?:bin|binti|a\/l|a\/p|[A-Z][A-Za-z'-]+)){0,3})/gi, make: m => {
      // Speech often comes back in lower case: capitalise names, keep "bin"/"binti"/"a/l" as they are.
      const v = m[1].trim().split(/\s+/).map(w => (/^(bin|binti|a\/l|a\/p)$/i.test(w) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1))).join(' ');
      return { value: v, key: v.toLowerCase().replace(/[^a-z]/g, '') };
    } },
  { field: 'remarks', re: /\b(owner\s+(?:wants|wishes|needs)\s+to\s+sell[^.,;]*|sell(?:ing)?\s+urgently|urgent(?:ly)?(?:\s+sale)?|price\s+(?:is\s+)?negotiable|negotiable|nego|boleh\s+runding|harga\s+boleh\s+runding|nak\s+jual\s+(?:cepat|segera)|jual\s+segera|segera|below\s+market(?:\s+value)?|bawah\s+harga\s+pasaran|corner\s+unit|lot\s+tepi|end\s+lot|access\s+road[^.,;]*|jalan\s+masuk[^.,;]*)/gi, make: m => {
      const v = m[1].trim();
      return { value: v.charAt(0).toUpperCase() + v.slice(1), key: v.toLowerCase() };
    } },
  { field: 'unit', re: /\bunit\s*(?:no\.?)?\s*[:#]?\s*([A-Z]?\d{1,4}[A-Z]?(?:-\d{1,4}){0,2})\b/gi, make: m => ({ value: m[1].toUpperCase(), key: m[1].toUpperCase() }) },
  { field: 'lot', re: /\b(?:lot|PT)\s*(?:no\.?)?\s*[:#]?\s*((?:PT\s*)?\d{1,6}[A-Z]?(?:\/\d{1,6})?)\b/gi, make: m => {
      const v = m[1].replace(/\s+/g, ' ').toUpperCase();
      return { value: v, key: v.replace(/\s/g, '') };
    } },
  { field: 'location', re: /(?:location|address|lokasi|alamat|地点|地址)\s*[:：\-]\s*([^\n]{4,90})/gi, make: m => {
      const v = m[1].trim().replace(/[.;]+$/, '');
      return { value: v, key: v.toLowerCase().replace(/[^a-z0-9]/g, '') };
    } },
  { field: 'availability', re: /\b(for\s+sale|for\s+rent|to\s+let|untuk\s+dijual|dijual|untuk\s+disewa|disewa|vacant|kosong|tenanted|ready\s+to\s+move\s+in)\b|(出售|出租)/gi, make: m => {
      const w = (m[1] || m[2] || '').toLowerCase();
      if (/tenanted/.test(w)) return { value: 'Tenanted', key: 'tenanted' };
      const v = /rent|let|sewa|出租/.test(w) ? 'Available (for rent)' : /sale|jual|出售/.test(w) ? 'Available (for sale)' : 'Available';
      return { value: v, key: v.toLowerCase() };
    } },
  { field: 'docPhone', re: /(?<![\d-])((?:\+?60|0)1\d[-\s]?\d{3,4}[-\s]?\d{4})(?![\d-])/g, make: m => {
      const d = m[1].replace(/\D/g, '').replace(/^60/, '0');
      const v = '+60 ' + d.slice(1, 3) + '-' + d.slice(3, d.length - 4) + ' ' + d.slice(-4);
      return { value: v, key: d };
    } },
];

/** Runs every rule over the segments. Text inside `blocked` ranges (sensitive numbers) is never used. */
export function extract(segments: Segment[], blocked: (seg: Segment) => [number, number][] = () => []): Proposal[] {
  const out: Proposal[] = [];
  for (const seg of segments) {
    const bad = blocked(seg);
    const isBlocked = (a: number, b: number) => bad.some(([s, e]) => a < e && b > s);
    for (const rule of RULES) {
      rule.re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = rule.re.exec(seg.text))) {
        if (isBlocked(m.index, m.index + m[0].length)) continue;
        const r = rule.make(m);
        if (r) out.push({ field: rule.field, value: r.value, key: r.key, quote: m[0].trim(), sourceId: seg.sourceId, sourceName: seg.sourceName, page: seg.page, stated: !!seg.stated });
        if (m[0].length === 0) rule.re.lastIndex++;
      }
    }
    // property type: first (most specific) match only per segment
    for (const [re, v] of TYPES) {
      const m = re.exec(seg.text);
      if (m && !isBlocked(m.index, m.index + m[0].length)) {
        out.push({ field: 'type', value: v, key: v.toLowerCase(), quote: m[0], sourceId: seg.sourceId, sourceName: seg.sourceName, page: seg.page, stated: !!seg.stated });
        break;
      }
    }
    // area name, if no labelled address in this segment
    if (!out.some(p => p.field === 'location' && p.sourceId === seg.sourceId)) {
      for (const a of AREAS) {
        const i = seg.text.toLowerCase().indexOf(a.toLowerCase());
        if (i >= 0 && !isBlocked(i, i + a.length)) {
          out.push({ field: 'location', value: a, key: a.toLowerCase().replace(/[^a-z0-9]/g, ''), quote: seg.text.substr(i, a.length), sourceId: seg.sourceId, sourceName: seg.sourceName, page: seg.page, stated: !!seg.stated });
          break;
        }
      }
    }
  }
  return dedupeSameSource(out);
}

/** Within one source, the same field with the same value counts once; keeps the first quote. */
function dedupeSameSource(ps: Proposal[]): Proposal[] {
  const seen = new Set<string>();
  return ps.filter(p => {
    const k = p.sourceId + '|' + p.field + '|' + p.key;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
