// v1buddychange015 (Batch I): practice data shared by Buddy Walk: Streets, Viewing Rush and Match the Buyer.
// Every buyer and listing here is invented for practice; nothing comes from or goes to the agent's real records.
// Prices are rough Klang Valley asking prices per sq ft, good enough for a game, not a valuation.
import type { Lang } from '../i18n';
import { rng, hashStr } from './gl3d/math';

export type Rand = () => number;
export const pick = <T,>(r: Rand, a: readonly T[]): T => a[Math.floor(r() * a.length) % a.length];

export interface PType { id: 'condo' | 'terrace' | 'town' | 'semid' | 'bungalow'; n: Record<Lang, string>; k: number; min: number; max: number; beds: number[]; price: [number, number] }
export const PTYPES: readonly PType[] = [
  { id: 'condo', n: { en: 'Condominium', bm: 'Kondominium', zh: '公寓' }, k: 1.0, min: 750, max: 1400, beds: [1, 2, 3, 4], price: [350_000, 1_200_000] },
  { id: 'terrace', n: { en: '2-storey terrace', bm: 'Teres 2 tingkat', zh: '双层排屋' }, k: 0.92, min: 1400, max: 2200, beds: [3, 4, 5], price: [500_000, 1_300_000] },
  { id: 'town', n: { en: 'Townhouse', bm: 'Rumah bandar', zh: '联排别墅' }, k: 0.88, min: 1200, max: 1800, beds: [2, 3, 4], price: [450_000, 1_000_000] },
  { id: 'semid', n: { en: 'Semi-D', bm: 'Semi-D', zh: '半独立式洋房' }, k: 1.18, min: 2400, max: 3600, beds: [4, 5, 6], price: [900_000, 2_400_000] },
  { id: 'bungalow', n: { en: 'Bungalow', bm: 'Banglo', zh: '独立洋房' }, k: 1.35, min: 3500, max: 6000, beds: [5, 6, 7], price: [1_500_000, 4_500_000] },
];
/** [area, typical RM per sq ft] */
export const AREAS: readonly [string, number][] = [
  ['Bangsar', 1100], ['Mont Kiara', 880], ['Petaling Jaya', 650], ['Subang Jaya', 560], ['Ampang', 530], ['Cheras', 480],
  ['Sungai Besi', 450], ['Kepong', 450], ['Setapak', 430], ['Puchong', 420], ['Cyberjaya', 400], ['Shah Alam', 380], ['Nilai', 330], ['Sepang', 320],
];
export const AREA_NAMES = AREAS.map(a => a[0]);
export const BUYER_NAMES = ['Mr Tan', 'Puan Aisyah', 'Ms Priya', 'Encik Hafiz', 'Mrs Wong', 'Mr Raj', 'Cik Nurul', 'Mr Lee', 'Ms Chong', 'Encik Amir'] as const;

export const roundTo = (n: number, step: number) => Math.round(n / step) * step;
export const rm = (n: number) => `RM ${Math.round(n).toLocaleString('en-MY')}`;

/* ---------- Buddy Walk: Streets - price the listing behind each For Sale sign ---------- */
export interface StreetListing { no: number; area: string; type: PType; size: number; beds: number; freehold: boolean; price: number; psf: number; options: number[] }

/** The same sign always shows the same listing and the same three choices (one right, two wrong). */
export function streetListing(signId: string): StreetListing {
  const r = rng(hashStr(`listing:${signId}`));
  const [area, basePsf] = pick(r, AREAS), type = pick(r, PTYPES);
  const size = roundTo(type.min + r() * (type.max - type.min), 10);
  const beds = pick(r, type.beds.filter(b => b >= 2).length ? type.beds.filter(b => b >= 2) : type.beds);
  const freehold = r() < 0.6;
  const psf = basePsf * type.k * (freehold ? 1.06 : 0.94) * (0.9 + r() * 0.2);
  const price = Math.max(10_000, roundTo(psf * size, 10_000));
  const low = [0.6, 0.7, 0.8], high = [1.25, 1.36, 1.5];
  const take = (a: number[]) => a.splice(Math.floor(r() * a.length) % a.length, 1)[0];
  const pat = r();
  const m = pat < 0.3 ? [take(low), take(low)] : pat < 0.6 ? [take(high), take(high)] : [take(low), take(high)];
  const options = [price, ...m.map(x => roundTo(price * x, 10_000))].sort((a, b) => a - b);
  return { no: 1000 + Math.floor(r() * 8999), area, type, size, beds, freehold, price, psf: price / size, options };
}

/* ---------- Match the Buyer ---------- */
export interface Buyer { name: string; areas: [string, string]; type: PType | null; minBeds: number; budget: number }
export interface MatchListing { no: number; area: string; type: PType; beds: number; price: number; seed: number }
export type Miss = { k: 'price'; over: number } | { k: 'area'; area: string } | { k: 'type'; type: PType } | { k: 'beds'; beds: number };

export function newBuyer(r: Rand, notName?: string): Buyer {
  const a1 = pick(r, AREA_NAMES); let a2 = pick(r, AREA_NAMES);
  while (a2 === a1) a2 = pick(r, AREA_NAMES);
  const type = r() < 0.6 ? pick(r, PTYPES) : null;
  const ref = type ?? pick(r, PTYPES);
  const minBeds = Math.max(1, ref.beds[Math.floor(r() * (ref.beds.length - 1))]);
  const budget = roundTo(ref.price[0] + r() * (ref.price[1] - ref.price[0]), 50_000);
  let name: string = pick(r, BUYER_NAMES);
  if (name === notName) name = BUYER_NAMES[(BUYER_NAMES.indexOf(name as typeof BUYER_NAMES[number]) + 1) % BUYER_NAMES.length];
  return { name, areas: [a1, a2], type, minBeds, budget };
}

/** About half the listings fit the buyer exactly; the rest miss on exactly one need. */
export function newListing(r: Rand, b: Buyer): MatchListing {
  const okTypes = b.type ? [b.type] : PTYPES.filter(t => t.beds[t.beds.length - 1] >= b.minBeds);
  const type = pick(r, okTypes.length ? okTypes : PTYPES);
  const bedsOk = type.beds.filter(n => n >= b.minBeds);
  const L: MatchListing = {
    no: 1000 + Math.floor(r() * 8999), area: pick(r, b.areas), type, beds: bedsOk.length ? pick(r, bedsOk) : b.minBeds,
    price: roundTo(b.budget * (0.7 + r() * 0.3), 5_000), seed: 1 + Math.floor(r() * 1e6),
  };
  if (r() < 0.52) {
    const ways: Miss['k'][] = ['price', 'area'];
    if (b.type) ways.push('type');
    if (b.minBeds > 1) ways.push('beds');
    const w = pick(r, ways);
    if (w === 'price') L.price = roundTo(b.budget * (1.04 + r() * 0.26), 5_000);
    if (w === 'area') { let a = pick(r, AREA_NAMES); while (b.areas.includes(a)) a = pick(r, AREA_NAMES); L.area = a; }
    if (w === 'type') { let t = pick(r, PTYPES); while (t === b.type) t = pick(r, PTYPES); L.type = t; L.beds = Math.max(L.beds, b.minBeds); }
    if (w === 'beds') L.beds = b.minBeds - 1;
  }
  return L;
}

/** Every need the listing misses (empty = it fits). */
export function misses(b: Buyer, L: MatchListing): Miss[] {
  const out: Miss[] = [];
  if (L.price > b.budget) out.push({ k: 'price', over: L.price - b.budget });
  if (!b.areas.includes(L.area)) out.push({ k: 'area', area: L.area });
  if (b.type && L.type.id !== b.type.id) out.push({ k: 'type', type: L.type });
  if (L.beds < b.minBeds) out.push({ k: 'beds', beds: L.beds });
  return out;
}
