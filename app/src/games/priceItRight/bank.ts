// Price It Right: the built-in practice scenarios. These are INVENTED examples set at plausible Malaysian price levels
// for each place and property type. They are not real listings and not valuations, and the game says so on every screen.
// Prices are in RM: the asking price for sale items, the monthly rent for rent items. Sizes are in square feet.
import type { Lang } from '../../i18n';

export type BankType = 'terrace' | 'semid' | 'bungalow' | 'condo' | 'shoplot' | 'landAgri' | 'landInd' | 'landRes';
export type StateKey = 'kl' | 'selangor' | 'ns' | 'johor' | 'penang';
export interface BankItem {
  id: string;
  kind: 'sale' | 'rent';
  type: BankType;
  /** Township or area, with the town: proper names stay the same in every language. */
  area: string;
  state: StateKey;
  tenure: 'freehold' | 'leasehold';
  /** Asking price (sale) or monthly rent (rent), in RM. */
  price: number;
  builtUp?: number; land?: number; beds?: number; baths?: number; floors?: number;
  /** One short line about the property, in all three languages. */
  note: Record<Lang, string>;
}

/** The short lines used by the scenarios. */
export const NOTES = {
  lrt: { en: 'Near an LRT or MRT station', bm: 'Dekat stesen LRT atau MRT', zh: '靠近 LRT 或 MRT 站' },
  highway: { en: 'Easy highway access', bm: 'Akses mudah ke lebuh raya', zh: '靠近高速公路，出入方便' },
  gated: { en: 'Gated and guarded community', bm: 'Komuniti berpagar dan berpengawal', zh: '封闭式社区，有保安' },
  reno: { en: 'Renovated, ready to move in', bm: 'Telah diubah suai, sedia diduduki', zh: '已装修，可即刻入住' },
  school: { en: 'Close to schools', bm: 'Dekat sekolah', zh: '靠近学校' },
  klia: { en: 'Close to KLIA', bm: 'Dekat KLIA', zh: '靠近吉隆坡国际机场' },
  town: { en: 'In the town centre', bm: 'Di pusat bandar', zh: '位于市中心' },
  sea: { en: 'Sea view', bm: 'Pemandangan laut', zh: '海景' },
  newer: { en: 'Newer development', bm: 'Pembangunan yang lebih baharu', zh: '较新的发展项目' },
  mainRoad: { en: 'Main road frontage', bm: 'Menghadap jalan utama', zh: '面向主要道路' },
  industrial: { en: 'Near factories and logistics hubs', bm: 'Dekat kilang dan pusat logistik', zh: '靠近工厂与物流中心' },
  rural: { en: 'Quiet, rural surroundings', bm: 'Persekitaran desa yang tenang', zh: '安静的乡村环境' },
  heritage: { en: 'Heritage shophouse in a tourist area', bm: 'Rumah kedai warisan di kawasan pelancong', zh: '旅游区内的传统老店屋' },
  family: { en: 'Popular with families', bm: 'Popular dalam kalangan keluarga', zh: '深受家庭欢迎' },
  furnished: { en: 'Fully furnished', bm: 'Lengkap berperabot', zh: '家具齐全' },
  unfurnished: { en: 'Unfurnished', bm: 'Tanpa perabot', zh: '无家具' },
  facilities: { en: 'Pool and gym facilities', bm: 'Kemudahan kolam renang dan gim', zh: '设有泳池与健身房' },
  corner: { en: 'Corner lot', bm: 'Lot sudut', zh: '转角单位' },
  uni: { en: 'Near a university, steady tenant demand', bm: 'Dekat universiti, permintaan penyewa stabil', zh: '靠近大学，租客需求稳定' },
  cbd: { en: 'City-centre address', bm: 'Alamat pusat bandar', zh: '市中心地段' },
  airport: { en: 'Near the airport and Cyberjaya', bm: 'Dekat lapangan terbang dan Cyberjaya', zh: '靠近机场与赛城' },
  customs: { en: 'Near the Singapore Causeway', bm: 'Dekat Tambak Johor', zh: '靠近新柔长堤' },
  open: { en: 'Open, flat land', bm: 'Tanah lapang dan rata', zh: '平坦开阔的土地' },
  busy: { en: 'Busy commercial row, good footfall', bm: 'Deretan komersial sibuk, ramai pengunjung', zh: '热闹商业街，人流旺' },
} as const satisfies Record<string, Record<Lang, string>>;
type Tag = keyof typeof NOTES;

interface Size { b?: number; l?: number; bd?: number; ba?: number; f?: number }
type Tenure = 'freehold' | 'leasehold';
const it = (id: string, kind: 'sale' | 'rent', type: BankType, area: string, state: StateKey, tenure: Tenure, price: number, s: Size, tag: Tag): BankItem =>
  ({ id, kind, type, area, state, tenure, price, builtUp: s.b, land: s.l, beds: s.bd, baths: s.ba, floors: s.f, note: NOTES[tag] });
const F: Tenure = 'freehold', L: Tenure = 'leasehold';

export const BANK: BankItem[] = [
  // ---- Klang Valley: for sale ----
  it('kv-t1', 'sale', 'terrace', 'USJ 9, Subang Jaya', 'selangor', F, 1280000, { b: 1900, l: 1540, bd: 4, ba: 3, f: 2 }, 'lrt'),
  it('kv-t2', 'sale', 'terrace', 'Setia Alam, Shah Alam', 'selangor', F, 780000, { b: 1800, l: 1650, bd: 4, ba: 3, f: 2 }, 'gated'),
  it('kv-t3', 'sale', 'terrace', 'Bandar Mahkota Cheras, Kajang', 'selangor', F, 720000, { b: 1700, l: 1540, bd: 4, ba: 3, f: 2 }, 'family'),
  it('kv-t4', 'sale', 'terrace', 'Seksyen 17, Petaling Jaya', 'selangor', F, 1450000, { b: 1400, l: 1650, bd: 3, ba: 2, f: 1 }, 'reno'),
  it('kv-t5', 'sale', 'terrace', 'Bandar Puteri, Puchong', 'selangor', F, 1050000, { b: 2000, l: 1650, bd: 4, ba: 4, f: 2 }, 'highway'),
  it('kv-t6', 'sale', 'terrace', 'Taman Connaught, Cheras', 'kl', F, 880000, { b: 1700, l: 1430, bd: 4, ba: 3, f: 2 }, 'lrt'),
  it('kv-s1', 'sale', 'semid', 'Kota Damansara, Petaling Jaya', 'selangor', F, 2650000, { b: 3500, l: 3000, bd: 5, ba: 5, f: 3 }, 'gated'),
  it('kv-s2', 'sale', 'semid', 'Bukit Jelutong, Shah Alam', 'selangor', F, 2150000, { b: 3200, l: 2800, bd: 5, ba: 4, f: 2 }, 'family'),
  it('kv-s3', 'sale', 'semid', 'Bandar Seri Putra, Bangi', 'selangor', F, 1350000, { b: 2600, l: 2400, bd: 5, ba: 4, f: 2 }, 'school'),
  it('kv-b1', 'sale', 'bungalow', 'Bukit Damansara', 'kl', F, 9800000, { b: 6500, l: 9000, bd: 6, ba: 6, f: 3 }, 'cbd'),
  it('kv-b2', 'sale', 'bungalow', 'Bukit Jelutong, Shah Alam', 'selangor', F, 3800000, { b: 5200, l: 5000, bd: 6, ba: 6, f: 3 }, 'gated'),
  it('kv-c1', 'sale', 'condo', 'Mont Kiara', 'kl', F, 920000, { b: 1100, bd: 3, ba: 2 }, 'facilities'),
  it('kv-c2', 'sale', 'condo', 'Bangsar South', 'kl', L, 780000, { b: 850, bd: 2, ba: 2 }, 'lrt'),
  it('kv-c3', 'sale', 'condo', 'Bandar Tun Razak, Cheras', 'kl', L, 520000, { b: 900, bd: 3, ba: 2 }, 'lrt'),
  it('kv-c4', 'sale', 'condo', 'Jalan Ampang, KLCC', 'kl', F, 1600000, { b: 950, bd: 2, ba: 2 }, 'cbd'),
  it('kv-sh1', 'sale', 'shoplot', 'SS15, Subang Jaya', 'selangor', F, 3600000, { b: 4200, l: 1760, f: 2 }, 'busy'),
  it('kv-sh2', 'sale', 'shoplot', 'Bandar Baru Bangi', 'selangor', F, 1850000, { b: 2800, l: 1540, f: 2 }, 'mainRoad'),
  it('kv-l1', 'sale', 'landAgri', 'Banting, Kuala Langat', 'selangor', L, 480000, { l: 43560 }, 'rural'),
  // ---- Klang Valley: for rent ----
  it('kv-r1', 'rent', 'condo', 'Mont Kiara', 'kl', F, 3800, { b: 1100, bd: 3, ba: 2 }, 'furnished'),
  it('kv-r2', 'rent', 'condo', 'Bandar Tun Razak, Cheras', 'kl', L, 1500, { b: 900, bd: 3, ba: 2 }, 'unfurnished'),
  it('kv-r3', 'rent', 'terrace', 'USJ 9, Subang Jaya', 'selangor', F, 3000, { b: 1900, l: 1540, bd: 4, ba: 3, f: 2 }, 'family'),
  it('kv-r4', 'rent', 'condo', 'Bangsar South', 'kl', L, 3300, { b: 850, bd: 2, ba: 2 }, 'furnished'),
  it('kv-r5', 'rent', 'shoplot', 'SS15, Subang Jaya', 'selangor', F, 8000, { b: 2100, f: 1 }, 'busy'),
  // ---- Negeri Sembilan (Nilai, Seremban) and Sepang: for sale ----
  it('ns-t1', 'sale', 'terrace', 'Nilai Impian, Nilai', 'ns', F, 520000, { b: 1800, l: 1540, bd: 4, ba: 3, f: 2 }, 'family'),
  it('ns-t2', 'sale', 'terrace', 'Bandar Baru Nilai, Nilai', 'ns', L, 330000, { b: 1100, l: 1540, bd: 3, ba: 2, f: 1 }, 'town'),
  it('ns-t3', 'sale', 'terrace', 'Putra Nilai, Nilai', 'ns', F, 470000, { b: 1700, l: 1430, bd: 4, ba: 3, f: 2 }, 'highway'),
  it('ns-t4', 'sale', 'terrace', 'Bandar Baru Salak Tinggi, Sepang', 'selangor', F, 560000, { b: 1700, l: 1540, bd: 4, ba: 3, f: 2 }, 'klia'),
  it('ns-t5', 'sale', 'terrace', 'Seremban 2, Seremban', 'ns', F, 680000, { b: 2000, l: 1650, bd: 4, ba: 3, f: 2 }, 'newer'),
  it('ns-t6', 'sale', 'terrace', 'Bandar Sri Sendayan, Seremban', 'ns', F, 540000, { b: 1800, l: 1500, bd: 4, ba: 3, f: 2 }, 'gated'),
  it('ns-s1', 'sale', 'semid', 'Nilai Impian, Nilai', 'ns', F, 980000, { b: 3200, l: 3000, bd: 5, ba: 4, f: 2 }, 'corner'),
  it('ns-s2', 'sale', 'semid', 'Seremban 2, Seremban', 'ns', F, 1250000, { b: 3000, l: 3000, bd: 5, ba: 4, f: 2 }, 'family'),
  it('ns-b1', 'sale', 'bungalow', 'Bukit Kepayang, Seremban', 'ns', F, 1900000, { b: 4500, l: 7000, bd: 5, ba: 5, f: 2 }, 'gated'),
  it('ns-c1', 'sale', 'condo', 'Nilai Impian, Nilai', 'ns', F, 280000, { b: 800, bd: 3, ba: 2 }, 'town'),
  it('ns-c2', 'sale', 'condo', 'Seremban 2, Seremban', 'ns', L, 330000, { b: 850, bd: 3, ba: 2 }, 'facilities'),
  it('ns-c3', 'sale', 'condo', 'Cyberjaya, Sepang', 'selangor', F, 400000, { b: 700, bd: 2, ba: 1 }, 'airport'),
  it('ns-sh1', 'sale', 'shoplot', 'Bandar Baru Nilai, Nilai', 'ns', L, 1450000, { b: 3000, l: 1430, f: 2 }, 'busy'),
  it('ns-sh2', 'sale', 'shoplot', 'Seremban 2, Seremban', 'ns', F, 1800000, { b: 3300, l: 1540, f: 2 }, 'mainRoad'),
  it('ns-l1', 'sale', 'landAgri', 'Sepang', 'selangor', L, 380000, { l: 43560 }, 'rural'),
  it('ns-l2', 'sale', 'landInd', 'Kawasan Perindustrian Nilai, Nilai', 'ns', F, 3400000, { l: 43560 }, 'industrial'),
  it('ns-l3', 'sale', 'landRes', 'Seremban 2, Seremban', 'ns', F, 520000, { l: 5000 }, 'open'),
  // ---- Negeri Sembilan and Sepang: for rent ----
  it('ns-r1', 'rent', 'terrace', 'Nilai Impian, Nilai', 'ns', F, 1500, { b: 1800, l: 1540, bd: 4, ba: 3, f: 2 }, 'unfurnished'),
  it('ns-r2', 'rent', 'condo', 'Nilai Impian, Nilai', 'ns', F, 850, { b: 800, bd: 3, ba: 2 }, 'town'),
  it('ns-r3', 'rent', 'terrace', 'Bandar Baru Salak Tinggi, Sepang', 'selangor', F, 1300, { b: 1700, l: 1540, bd: 4, ba: 3, f: 2 }, 'klia'),
  it('ns-r4', 'rent', 'terrace', 'Seremban 2, Seremban', 'ns', F, 1600, { b: 2000, l: 1650, bd: 4, ba: 3, f: 2 }, 'newer'),
  it('ns-r5', 'rent', 'condo', 'Cyberjaya, Sepang', 'selangor', F, 1600, { b: 700, bd: 2, ba: 1 }, 'furnished'),
  it('ns-r6', 'rent', 'shoplot', 'Bandar Baru Nilai, Nilai', 'ns', L, 3800, { b: 3000, f: 2 }, 'busy'),
  // ---- Johor ----
  it('jh-t1', 'sale', 'terrace', 'Taman Mount Austin, Johor Bahru', 'johor', F, 760000, { b: 1800, l: 1540, bd: 4, ba: 3, f: 2 }, 'family'),
  it('jh-t2', 'sale', 'terrace', 'Taman Molek, Johor Bahru', 'johor', F, 920000, { b: 1900, l: 1650, bd: 4, ba: 3, f: 2 }, 'school'),
  it('jh-t3', 'sale', 'terrace', 'Taman Universiti, Skudai', 'johor', F, 680000, { b: 1800, l: 1540, bd: 4, ba: 3, f: 2 }, 'uni'),
  it('jh-s1', 'sale', 'semid', 'Horizon Hills, Iskandar Puteri', 'johor', F, 1850000, { b: 3200, l: 3000, bd: 5, ba: 5, f: 2 }, 'gated'),
  it('jh-s2', 'sale', 'semid', 'Bukit Indah, Johor Bahru', 'johor', F, 1450000, { b: 3000, l: 2800, bd: 5, ba: 4, f: 2 }, 'family'),
  it('jh-b1', 'sale', 'bungalow', 'Horizon Hills, Iskandar Puteri', 'johor', F, 3200000, { b: 4500, l: 5500, bd: 6, ba: 6, f: 2 }, 'gated'),
  it('jh-c1', 'sale', 'condo', 'Danga Bay, Johor Bahru', 'johor', L, 580000, { b: 900, bd: 2, ba: 2 }, 'sea'),
  it('jh-c2', 'sale', 'condo', 'Bukit Indah, Johor Bahru', 'johor', F, 520000, { b: 1000, bd: 3, ba: 2 }, 'facilities'),
  it('jh-sh1', 'sale', 'shoplot', 'Taman Century, Johor Bahru', 'johor', F, 2100000, { b: 3300, l: 1540, f: 2 }, 'busy'),
  it('jh-l1', 'sale', 'landInd', 'Kulai', 'johor', L, 4600000, { l: 87120 }, 'industrial'),
  it('jh-r1', 'rent', 'terrace', 'Taman Mount Austin, Johor Bahru', 'johor', F, 1800, { b: 1800, l: 1540, bd: 4, ba: 3, f: 2 }, 'unfurnished'),
  it('jh-r2', 'rent', 'condo', 'Bukit Indah, Johor Bahru', 'johor', F, 1500, { b: 1000, bd: 3, ba: 2 }, 'facilities'),
  it('jh-r3', 'rent', 'condo', 'Danga Bay, Johor Bahru', 'johor', L, 1700, { b: 900, bd: 2, ba: 2 }, 'customs'),
  // ---- Penang ----
  it('pg-t1', 'sale', 'terrace', 'Bayan Baru, Bayan Lepas', 'penang', F, 1100000, { b: 1900, l: 1540, bd: 4, ba: 3, f: 2 }, 'highway'),
  it('pg-t2', 'sale', 'terrace', 'Seberang Jaya, Perai', 'penang', F, 640000, { b: 1700, l: 1540, bd: 4, ba: 3, f: 2 }, 'family'),
  it('pg-t3', 'sale', 'terrace', 'Gelugor, Penang Island', 'penang', F, 1400000, { b: 1950, l: 1650, bd: 4, ba: 3, f: 2 }, 'uni'),
  it('pg-s1', 'sale', 'semid', 'Seberang Jaya, Perai', 'penang', F, 1300000, { b: 3000, l: 3000, bd: 5, ba: 4, f: 2 }, 'corner'),
  it('pg-b1', 'sale', 'bungalow', 'Tanjung Bungah', 'penang', F, 5500000, { b: 5000, l: 7000, bd: 6, ba: 6, f: 3 }, 'sea'),
  it('pg-c1', 'sale', 'condo', 'Tanjung Tokong', 'penang', F, 1150000, { b: 1100, bd: 3, ba: 2 }, 'sea'),
  it('pg-c2', 'sale', 'condo', 'Bayan Lepas', 'penang', L, 600000, { b: 900, bd: 3, ba: 2 }, 'facilities'),
  it('pg-sh1', 'sale', 'shoplot', 'George Town', 'penang', F, 3800000, { b: 4500, l: 1800, f: 2 }, 'heritage'),
  it('pg-sh2', 'sale', 'shoplot', 'Seberang Jaya, Perai', 'penang', F, 1650000, { b: 3200, l: 1540, f: 2 }, 'mainRoad'),
  it('pg-l1', 'sale', 'landAgri', 'Balik Pulau', 'penang', F, 480000, { l: 21780 }, 'rural'),
  it('pg-r1', 'rent', 'condo', 'Tanjung Tokong', 'penang', F, 2800, { b: 1100, bd: 3, ba: 2 }, 'sea'),
  it('pg-r2', 'rent', 'condo', 'Bayan Lepas', 'penang', L, 1700, { b: 900, bd: 3, ba: 2 }, 'furnished'),
  it('pg-r3', 'rent', 'shoplot', 'George Town', 'penang', F, 6500, { b: 2200, f: 2 }, 'heritage'),
];

/** Problems found in a list of scenarios (an empty list means the bank is sound). Used by the unit tests. */
export function bankProblems(bank: readonly BankItem[]): string[] {
  const out: string[] = [];
  const ids = new Set<string>();
  for (const b of bank) {
    if (ids.has(b.id)) out.push(`${b.id}: duplicate id`);
    ids.add(b.id);
    if (!b.area.trim()) out.push(`${b.id}: no area`);
    if (!(b.price > 0)) out.push(`${b.id}: no price`);
    if (b.kind === 'rent' && b.price > 20000) out.push(`${b.id}: rent looks like a sale price`);
    if (b.kind === 'sale' && b.price < 50000) out.push(`${b.id}: sale price looks like a rent`);
    for (const l of ['en', 'bm', 'zh'] as const) if (!b.note?.[l]?.trim()) out.push(`${b.id}: note missing in ${l}`);
    if (b.type.startsWith('land')) { if (!b.land) out.push(`${b.id}: land item needs a land size`); }
    else if (!b.builtUp) out.push(`${b.id}: needs a built-up size`);
    if (b.type !== 'shoplot' && !b.type.startsWith('land') && (!b.beds || !b.baths)) out.push(`${b.id}: needs bedrooms and bathrooms`);
  }
  return out;
}
