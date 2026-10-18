// Malaysian places for the location dropdowns, and the rules for comparing a place name from Google Maps with
// the values the agent already saved. Google Maps is a source, not the master list: a name that differs only in
// spelling, spacing, capital letters or abbreviation (Tmn / Taman, Jln / Jalan) is treated as the saved value,
// and nothing new is saved without the agent's confirmation.

export const DEFAULT_COUNTRY = 'Malaysia';

// JoyChange002 Change 46: every country can be chosen (the first-login pick and the Country level of the address chain).
// Names are saved in English, as before (Malaysia, Singapore ... stay exactly as they were); screens show them in the
// chosen language. Built from the browser's own region names, so no list has to be kept by hand.
const COUNTRY_CODES = 'AF AL DZ AD AO AG AR AM AU AT AZ BS BH BD BB BY BE BZ BJ BT BO BA BW BR BN BG BF BI CV KH CM CA CF TD CL CN CO KM CG CD CR CI HR CU CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FJ FI FR GA GM GE DE GH GR GD GT GN GW GY HT HN HK HU IS IN ID IR IQ IE IL IT JM JP JO KZ KE KI KP KR XK KW KG LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MR MU MX FM MD MC MN ME MA MZ MM NA NR NP NL NZ NI NE NG MK NO OM PK PW PS PA PG PY PE PH PL PT QA RO RU RW KN LC VC WS SM ST SA SN RS SC SL SG SK SI SB SO ZA SS ES LK SD SR SE CH SY TW TJ TZ TH TL TG TO TT TN TR TM TV UG UA AE GB US UY UZ VU VA VE VN YE ZM ZW'.split(' ');
const regionNames = (lang: string): { of(code: string): string | undefined } | null => {
  try { return new Intl.DisplayNames([lang], { type: 'region' }); } catch { return null; }
};
const EN_NAMES = regionNames('en');
const ENGLISH: [string, string][] = COUNTRY_CODES.flatMap(c => { const n = EN_NAMES?.of(c); return n && n !== c ? [[c, n] as [string, string]] : []; });
/** Malaysia first, then the rest A to Z. If the browser has no region names, the five countries used before. */
export const COUNTRIES: readonly string[] = ENGLISH.length > 100
  ? [DEFAULT_COUNTRY, ...ENGLISH.map(x => x[1]).filter(n => n !== DEFAULT_COUNTRY).sort((a, b) => a.localeCompare(b, 'en'))]
  : ['Malaysia', 'Singapore', 'Brunei', 'Indonesia', 'Thailand'];
/** A country's name in the app language ('en' | 'bm' | 'zh'); the English name when no translation exists. */
export function countryLabel(english: string, lang: 'en' | 'bm' | 'zh'): string {
  const code = ENGLISH.find(x => x[1] === english)?.[0];
  if (!code || lang === 'en') return english;
  return regionNames(lang === 'bm' ? 'ms' : 'zh')?.of(code) ?? english;
}

export const MY_STATES = [
  'Johor', 'Kedah', 'Kelantan', 'Melaka', 'Negeri Sembilan', 'Pahang', 'Perak', 'Perlis', 'Pulau Pinang',
  'Sabah', 'Sarawak', 'Selangor', 'Terengganu', 'Kuala Lumpur', 'Labuan', 'Putrajaya',
] as const;

/** Main towns and cities by state (Change 009: a useful starting list for type-to-search, not an official register).
 *  Anything missing is typed once and remembered on this phone, with ✕ to remove it again. */
export const MY_CITIES: Record<string, string[]> = {
  'Johor': ['Johor Bahru', 'Iskandar Puteri', 'Pasir Gudang', 'Kulai', 'Skudai', 'Batu Pahat', 'Muar', 'Kluang', 'Segamat', 'Pontian', 'Kota Tinggi', 'Mersing', 'Tangkak'],
  'Kedah': ['Alor Setar', 'Sungai Petani', 'Kulim', 'Langkawi', 'Jitra', 'Baling', 'Pendang'],
  'Kelantan': ['Kota Bharu', 'Pasir Mas', 'Tanah Merah', 'Machang', 'Kuala Krai', 'Gua Musang', 'Tumpat'],
  'Melaka': ['Melaka', 'Ayer Keroh', 'Alor Gajah', 'Jasin', 'Masjid Tanah'],
  'Negeri Sembilan': ['Seremban', 'Nilai', 'Senawang', 'Mantin', 'Labu', 'Lenggeng', 'Pajam', 'Port Dickson', 'Rembau', 'Rantau', 'Kuala Pilah', 'Bahau', 'Gemas', 'Tampin'],
  'Pahang': ['Kuantan', 'Temerloh', 'Mentakab', 'Bentong', 'Raub', 'Pekan', 'Jerantut', 'Rompin', 'Cameron Highlands'],
  'Perak': ['Ipoh', 'Taiping', 'Teluk Intan', 'Sitiawan', 'Lumut', 'Kampar', 'Batu Gajah', 'Kuala Kangsar', 'Seri Iskandar', 'Tanjung Malim', 'Parit Buntar'],
  'Perlis': ['Kangar', 'Arau', 'Padang Besar'],
  'Pulau Pinang': ['George Town', 'Butterworth', 'Bukit Mertajam', 'Seberang Jaya', 'Bayan Lepas', 'Balik Pulau', 'Nibong Tebal'],
  'Sabah': ['Kota Kinabalu', 'Penampang', 'Putatan', 'Sandakan', 'Tawau', 'Lahad Datu', 'Keningau', 'Semporna'],
  'Sarawak': ['Kuching', 'Kota Samarahan', 'Miri', 'Sibu', 'Bintulu', 'Sri Aman', 'Sarikei', 'Mukah'],
  'Selangor': ['Sepang', 'Salak Tinggi', 'Cyberjaya', 'Dengkil', 'Banting', 'Kajang', 'Semenyih', 'Bangi', 'Seri Kembangan', 'Shah Alam', 'Petaling Jaya', 'Subang Jaya', 'Puchong', 'Klang', 'Port Klang', 'Ampang', 'Selayang', 'Rawang', 'Kuala Selangor'],
  'Terengganu': ['Kuala Terengganu', 'Kuala Nerus', 'Kemaman', 'Dungun', 'Marang', 'Besut'],
  'Kuala Lumpur': ['Kuala Lumpur'],
  'Labuan': ['Labuan'],
  'Putrajaya': ['Putrajaya'],
};
export const MY_TOWNSHIPS: Record<string, string[]> = {
  'Nilai': ['Putra Nilai', 'Bandar Baru Nilai', 'Kota Seriemas', 'Bandar Enstek', 'Kawasan Perindustrian Nilai'],
  'Salak Tinggi': ['Bandar Baru Salak Tinggi', 'Kota Warisan'],
  'Sepang': ['Kota Warisan', 'Bandar Baru Salak Tinggi'],
};

export const allBuiltInCities = () => [...new Set(Object.values(MY_CITIES).flat())];
export const allBuiltInTownships = () => [...new Set(Object.values(MY_TOWNSHIPS).flat())];
export const citiesFor = (state?: string) => (state && MY_CITIES[state]) || allBuiltInCities();
export const townshipsFor = (city?: string) => (city && MY_TOWNSHIPS[city]) || allBuiltInTownships();

const ABBREVIATIONS: [RegExp, string][] = [
  [/\bjln\b/g, 'jalan'], [/\btmn\b/g, 'taman'], [/\bbdr\b/g, 'bandar'], [/\bbndr\b/g, 'bandar'],
  [/\bkg\b/g, 'kampung'], [/\bkpg\b/g, 'kampung'], [/\bkampong\b/g, 'kampung'], [/\bsek\b/g, 'seksyen'],
  [/\bsg\b/g, 'sungai'], [/\bsungei\b/g, 'sungai'], [/\bbkt\b/g, 'bukit'], [/\blrg\b/g, 'lorong'],
  [/\bpsn\b/g, 'persiaran'], [/\bkaw\b/g, 'kawasan'], [/\bind\b/g, 'industri'], [/\bindustrial\b/g, 'industri'],
  [/\bperindustrian\b/g, 'industri'], [/\bbt\b/g, 'batu'], [/\bpt\b/g, 'parit'], [/\bspg\b/g, 'simpang'],
  [/\bkl\b/g, 'kuala lumpur'], [/\bn\s*sembilan\b/g, 'negeri sembilan'], [/\bns\b/g, 'negeri sembilan'],
  [/\bpenang\b/g, 'pulau pinang'], [/\bmalacca\b/g, 'melaka'], [/\bwilayah persekutuan\b/g, ''], [/\bfederal territory of\b/g, ''],
  [/\bwp\b/g, ''], [/\bst\b/g, 'street'], [/\brd\b/g, 'road'], [/\bmt\b/g, 'mount'],
];

/** A place name reduced to its essentials: lower case, no accents or punctuation, abbreviations written out. */
export function normalisePlace(s: string): string {
  let t = s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[.,'’`()\-/]/g, ' ');
  t = ` ${t} `.replace(/\s+/g, ' ');
  for (const [re, w] of ABBREVIATIONS) t = t.replace(re, w);
  return t.replace(/\s+/g, ' ').trim();
}
/** For comparing: spaces removed too, so "PutraNilai" and "Putra Nilai" are the same. */
const compact = (s: string) => normalisePlace(s).replace(/\s/g, '');

export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

export type PlaceMatch =
  /** Exactly a saved value. */
  | { kind: 'exact'; value: string }
  /** Same place written differently (capitals, spaces, abbreviations): use the saved value, save nothing new. */
  | { kind: 'same'; value: string }
  /** Close to a saved value (a small spelling difference): the agent chooses. */
  | { kind: 'similar'; value: string }
  /** Not in the saved values at all: the agent chooses. */
  | { kind: 'none' };

/** Compares a name from Google Maps with the saved values for one dropdown. */
export function matchPlace(google: string, saved: readonly string[]): PlaceMatch {
  const g = google.trim();
  if (!g) return { kind: 'none' };
  const exact = saved.find(v => v === g);
  if (exact) return { kind: 'exact', value: exact };
  const gc = compact(g);
  const same = saved.find(v => compact(v) === gc);
  if (same) return { kind: 'same', value: same };
  let best: { v: string; d: number } | null = null;
  for (const v of saved) {
    const vc = compact(v);
    const d = editDistance(gc, vc);
    const allowed = Math.max(gc.length, vc.length) >= 12 ? 2 : Math.max(gc.length, vc.length) >= 5 ? 1 : 0;
    if (d <= allowed && (!best || d < best.d)) best = { v, d };
  }
  return best ? { kind: 'similar', value: best.v } : { kind: 'none' };
}

/** The parts of an address the location form uses, read from Google's address components. */
export interface AddressParts { country?: string; state?: string; city?: string; township?: string; street?: string; postcode?: string }
export interface GoogleComponent { long_name: string; short_name: string; types: string[] }

export function partsFromGoogle(components: GoogleComponent[]): AddressParts {
  const get = (...types: string[]) => {
    for (const t of types) { const c = components.find(x => x.types.includes(t)); if (c) return c.long_name; }
    return undefined;
  };
  const route = get('route');
  const number = get('street_number');
  const state = get('administrative_area_level_1');
  const city = get('locality', 'postal_town', 'administrative_area_level_2');
  let township = get('sublocality_level_1', 'sublocality', 'neighborhood', 'administrative_area_level_3');
  if (township && city && compact(township) === compact(city)) township = undefined;
  return {
    country: get('country'),
    state: state ? cleanState(state) : undefined,
    city,
    township,
    street: [number, route].filter(Boolean).join(' ') || undefined,
    postcode: get('postal_code'),
  };
}

/** Google writes federal territories as "Wilayah Persekutuan Kuala Lumpur"; the app uses the short name. */
function cleanState(s: string): string {
  const n = normalisePlace(s);
  const hit = MY_STATES.find(x => normalisePlace(x) === n);
  return hit ?? s;
}

export type FieldCheck =
  /** Nothing from Google for this field: the current value stays. */
  | { status: 'none' }
  /** Google's value is (or is written like) a saved value and agrees with the property: use `value`, no question. */
  | { status: 'ok'; value: string; google: string; rewritten: boolean }
  /** Google differs from the saved values or from what the property has now: the agent chooses. */
  | { status: 'diff'; google: string; closest?: string; current?: string };

/**
 * Compares Google's value for one location field with the saved dropdown values and the property's current value.
 * Saved values win over Google's spelling. A new value is never chosen automatically.
 */
export function checkField(google: string | undefined, saved: readonly string[], current?: string): FieldCheck {
  const g = (google ?? '').trim();
  if (!g) return { status: 'none' };
  const m = matchPlace(g, saved);
  const cur = current?.trim() || undefined;
  const sameAsCurrent = (v: string) => !cur || compact(cur) === compact(v);
  if ((m.kind === 'exact' || m.kind === 'same') && sameAsCurrent(m.value)) return { status: 'ok', value: m.value, google: g, rewritten: m.kind === 'same' };
  if (m.kind === 'none' && cur && compact(cur) === compact(g)) return { status: 'ok', value: cur, google: g, rewritten: cur !== g };
  return { status: 'diff', google: g, closest: m.kind === 'none' ? undefined : m.value, current: cur };
}
