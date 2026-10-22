// Price It Right: all the game rules in plain functions, no screen code. Every random choice takes a random function
// (see mulberry32), so a round built from the same seed is always the same round and can be tested.
import type { Listing } from '../../listing/model';
import type { BankItem, BankType, StateKey } from './bank';
import type { Lang } from '../../i18n';

export type Rng = () => number;
export type Kind = 'sale' | 'rent';
export type Art = 'terrace' | 'semid' | 'bungalow' | 'condo' | 'shoplot' | 'land' | 'factory';

/** Questions in one round. One point per right answer, so the top score is exactly the number of questions. */
export const ROUND_SIZE = 8;
/** My listings mode needs at least this many listings that have an asking price or a rent. */
export const MIN_MINE = 4;
/** Rent questions mixed into a built-in round. */
export const RENT_PER_ROUND = 2;
/** A built-in round never shows more than this many properties of the same picture type. */
export const MAX_PER_ART = 2;
/** Prices below these are treated as typing slips in the agent's own listings and are left out of the game. */
export const MIN_SALE_PRICE = 10_000;
export const MIN_RENT = 100;

/** A small, fast seeded random function (mulberry32): same seed, same sequence, values in [0, 1). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** A fresh seed for a new round. */
export const newSeed = (): number => (Date.now() ^ Math.floor(Math.random() * 0xFFFFFFFF)) >>> 0;

/** Fisher-Yates shuffle; returns a new array. */
export function shuffle<T>(rng: Rng, list: readonly T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const between = (rng: Rng, lo: number, hi: number) => lo + rng() * (hi - lo);

// ---------- the four answer options ----------
/** Wrong answers come from four separate bands around the right price, so they are always clearly different from it and
 *  from each other: about 40-55% and 60-74% of the price, or 126-140% and 145-160% of it. Three of the four bands are used. */
export const WRONG_BANDS: ReadonlyArray<readonly [number, number]> = [[0.40, 0.55], [0.60, 0.74], [1.26, 1.40], [1.45, 1.60]];
const STEPS = [100000, 50000, 25000, 10000, 5000, 2500, 1000, 500, 250, 100, 50, 25, 10, 5, 1];

/** The rounding step for the wrong answers: the biggest tidy step that is at most 2% of the price and divides the right
 *  price, so the right answer never looks different from the wrong ones (for example, it is not the only odd number). */
export function stepFor(price: number): number {
  const limit = price * 0.02;
  for (const s of STEPS) if (s <= limit && price % s === 0) return s;
  return 1;
}

export interface Options { options: number[]; correctIndex: number }

/** Four distinct prices in a shuffled order, one of them the right answer. The right price is rounded to whole ringgit. */
export function makeOptions(price: number, rng: Rng): Options {
  const p = Math.max(1, Math.round(price));
  const step = stepFor(p);
  const bands = shuffle(rng, WRONG_BANDS).slice(0, 3);
  const wrong = bands.map(([lo, hi]) => Math.max(step, Math.round((p * between(rng, lo, hi)) / step) * step));
  const all = shuffle(rng, [p, ...wrong]);
  if (new Set(all).size !== 4) throw new Error(`Price It Right: options for ${p} were not distinct`);   // cannot happen: the bands are 5%+ apart and the step is at most 2%
  return { options: all, correctIndex: all.indexOf(p) };
}

// ---------- one question ----------
/** What the property card shows. Words are kept as keys or as the agent's own text; the screen turns keys into the language. */
export interface PropCard {
  art: Art;
  typeKey?: BankType; typeText?: string;
  area: string;
  stateKey?: StateKey; stateText?: string;
  tenure?: 'freehold' | 'leasehold';
  builtUp?: number; land?: number; beds?: number; baths?: number; floors?: number;
  note?: Record<Lang, string>;
}
export interface Question {
  id: string;
  source: 'bank' | 'mine';
  kind: Kind;
  card: PropCard;
  /** The right price: asking price in RM, or monthly rent in RM. */
  price: number;
  options: number[];
  correctIndex: number;
}

export const artOfBankType = (t: BankType): Art => (t === 'landAgri' || t === 'landInd' || t === 'landRes' ? 'land' : t);

/** The picture for one of the agent's own listing types (the types in listing/model.ts). */
export function artOfListingType(type?: string): Art {
  switch (type) {
    case 'Terrace house': case 'Townhouse': return 'terrace';
    case 'Semi-D house': return 'semid';
    case 'Bungalow': return 'bungalow';
    case 'Condo / apartment': return 'condo';
    case 'Shoplot': case 'Office': return 'shoplot';
    case 'Terrace factory': case 'Semi-D factory': case 'Detached factory': case 'Warehouse': return 'factory';
    case 'Residential land': case 'Industrial land': case 'Agricultural land': case 'Development land': return 'land';
    default: return 'bungalow';
  }
}

function bankQuestion(item: BankItem, rng: Rng): Question {
  const o = makeOptions(item.price, rng);
  return {
    id: item.id, source: 'bank', kind: item.kind, price: item.price, options: o.options, correctIndex: o.correctIndex,
    card: {
      art: artOfBankType(item.type), typeKey: item.type, area: item.area, stateKey: item.state, tenure: item.tenure,
      builtUp: item.builtUp, land: item.land, beds: item.beds, baths: item.baths, floors: item.floors, note: item.note,
    },
  };
}

/** Built-in round: 6 sale + 2 rent questions in a shuffled order, at most 2 of any picture type, no property twice. */
export function buildBankRound(rng: Rng, bank: readonly BankItem[], n = ROUND_SIZE): Question[] {
  const rentWanted = Math.min(RENT_PER_ROUND, n, bank.filter(b => b.kind === 'rent').length);
  const counts: Partial<Record<Art, number>> = {};
  const chosen: BankItem[] = [];
  const take = (pool: BankItem[], want: number, strict: boolean) => {
    let got = 0;
    for (const b of pool) {
      if (got >= want) break;
      const art = artOfBankType(b.type);
      if (chosen.includes(b) || (strict && (counts[art] ?? 0) >= MAX_PER_ART)) continue;
      chosen.push(b); counts[art] = (counts[art] ?? 0) + 1; got++;
    }
    return got;
  };
  const rent = shuffle(rng, bank.filter(b => b.kind === 'rent'));
  const sale = shuffle(rng, bank.filter(b => b.kind === 'sale'));
  const rentGot = take(rent, rentWanted, true);
  if (rentGot < rentWanted) take(rent, rentWanted - rentGot, false);
  const saleWant = n - chosen.length;
  const saleGot = take(sale, saleWant, true);
  if (saleGot < saleWant) take(sale, saleWant - saleGot, false);
  if (chosen.length < n) take(shuffle(rng, bank), n - chosen.length, false);   // a very small bank: top up with anything left
  return shuffle(rng, chosen).map(b => bankQuestion(b, rng));
}

// ---------- the agent's own listings ----------
const validPrice = (n: unknown, min: number): n is number => typeof n === 'number' && Number.isFinite(n) && n >= min;
const saleOf = (l: Listing) => (l.purpose !== 'rent' && validPrice(l.askingPrice, MIN_SALE_PRICE) ? Math.round(l.askingPrice) : undefined);
const rentOf = (l: Listing) => ((l.purpose === 'rent' || l.purpose === 'sale_or_rent') && validPrice(l.monthlyRent, MIN_RENT) ? Math.round(l.monthlyRent) : undefined);

/** Listings that can be turned into a question: not archived/deleted (the same rule as the Subsale List) and with an
 *  asking price (for sale) or a monthly rent (for rent). Quietly leaves out listings with no price or an absurdly low one. */
export function priceableListings(listings: readonly Listing[]): Listing[] {
  return listings.filter(l => !l.archived && (saleOf(l) !== undefined || rentOf(l) !== undefined));
}
export const mineAvailable = (listings: readonly Listing[]) => priceableListings(listings).length >= MIN_MINE;

function mineQuestion(l: Listing, rng: Rng): Question {
  const sale = saleOf(l), rent = rentOf(l);
  // A "sale or rent" listing with both prices is asked either way, chosen at random.
  const kind: Kind = sale !== undefined && rent !== undefined ? (rng() < 0.5 ? 'sale' : 'rent') : sale !== undefined ? 'sale' : 'rent';
  const price = (kind === 'sale' ? sale : rent) as number;
  const o = makeOptions(price, rng);
  const area = [l.neighborhood, l.township, l.city].filter(Boolean).join(', ');
  return {
    id: `${l.id}:${kind}`, source: 'mine', kind, price, options: o.options, correctIndex: o.correctIndex,
    card: {
      art: artOfListingType(l.type), typeText: l.type, area, stateText: l.state, tenure: l.tenure,
      builtUp: l.builtUpSqft, land: l.landSqft, beds: l.bedrooms, baths: l.bathrooms, floors: l.floors,
    },
  };
}

/** My listings round: one question per listing, up to n, chosen at random. Fewer than n listings gives a shorter round. */
export function buildMineRound(rng: Rng, listings: readonly Listing[], n = ROUND_SIZE): Question[] {
  return shuffle(rng, priceableListings(listings)).slice(0, n).map(l => mineQuestion(l, rng));
}

// ---------- scoring ----------
export interface Score { score: number; maxScore: number }
/** One point for each question whose picked option is the right one. maxScore is the number of questions. */
export function scoreRound(questions: readonly Question[], picks: ReadonlyArray<number | null | undefined>): Score {
  let score = 0;
  questions.forEach((q, i) => { if (picks[i] === q.correctIndex) score++; });
  return { score, maxScore: questions.length };
}
