// Marketing Studio: what goes on a property flyer / social post, decided from the property record and the agent's ticks.
// Pure functions (no drawing), so the rules are tested without a browser. Rules:
//  - Only facts that are in the record are written. A ticked detail with no value is left off the design and reported to the agent.
//  - The headline is the property's own advert title (editable by the agent). It is never made up.
//  - A fact that is not "Confirmed" keeps a * on the design and a footnote says it is not yet verified.
//  - Owner, vendor, commission, notes, tenancy, documents, exact street / unit / lot and exact map position are never offered.
//  - A sample property's design says SAMPLE, so it can't pass as a real listing.
import type { Lang } from '../i18n';
import type { Profile } from '../data/types';
import type { Listing } from '../listing/model';
import { listingStrings } from '../listing/strings';
import { BuyerField, buyerFields, AgentChoice, agentLines, publicTitle } from '../listing/buyerPdf';

export type FormatId = 'a4' | 'square' | 'portrait';
export type OutputId = 'pdf' | 'png' | 'jpg' | 'webp';
export interface FormatSpec {
  id: FormatId; /** pixels */ w: number; h: number; outputs: OutputId[]; /** most photos the design can show */ maxPhotos: number;
}
/** Sizes: A4 is 210 × 297 mm drawn at 150 dpi (1240 × 1754). The two post sizes (1080 × 1080 square, 1080 × 1350 portrait 4:5) are common social-post sizes from a third-party guide and are NOT verified against any platform, so no screen text names a platform. */
export const FORMATS: Record<FormatId, FormatSpec> = {
  a4: { id: 'a4', w: 1240, h: 1754, outputs: ['pdf', 'png', 'jpg'], maxPhotos: 4 },
  square: { id: 'square', w: 1080, h: 1080, outputs: ['png', 'jpg', 'webp'], maxPhotos: 1 },
  portrait: { id: 'portrait', w: 1080, h: 1350, outputs: ['png', 'jpg', 'webp'], maxPhotos: 3 },
};
export const FORMAT_IDS: FormatId[] = ['a4', 'square', 'portrait'];
export const MIME: Record<OutputId, string> = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };

/** The details the agent can tick, in the order they are listed. `on` = ticked at first when the record has a value. */
export const MARKETING_KEYS: { key: keyof Listing; on: boolean; price?: boolean }[] = [
  { key: 'askingPrice', on: true, price: true }, { key: 'monthlyRent', on: true, price: true },
  { key: 'type', on: true }, { key: 'township', on: true }, { key: 'city', on: true }, { key: 'state', on: true },
  { key: 'bedrooms', on: true }, { key: 'bathrooms', on: true }, { key: 'parking', on: true },
  { key: 'builtUpSqft', on: true }, { key: 'landSqft', on: true }, { key: 'tenure', on: true }, { key: 'furnishing', on: true },
  { key: 'condition', on: false }, { key: 'availability', on: false }, { key: 'titleType', on: false }, { key: 'lotType', on: false },
  { key: 'features', on: true },
];
const LOCATION_KEYS = ['township', 'city', 'state'];

export const marketingFields = (l: Listing, lang: Lang): BuyerField[] => {
  const all = buyerFields(l, lang);
  return MARKETING_KEYS.map(m => {
    const f = all.find(x => x.key === m.key)!;
    return { ...f, on: m.on && f.value !== undefined };
  });
};
export const defaultMarketingSelection = (fields: BuyerField[]): Record<string, boolean> => Object.fromEntries(fields.filter(f => f.on).map(f => [String(f.key), true]));

export interface PosterFact { key: string; label: string; value: string; unverified: boolean }
export interface PosterContent {
  lang: Lang;
  headline: string;
  /** "For sale" / "For rent" ribbon. */
  ribbon?: string;
  /** Township, city, state (as ticked), never the street. */
  place?: string;
  prices: PosterFact[];
  facts: PosterFact[];
  highlights?: string;
  agent: string[];
  sample: boolean;
  ref?: string;
  footnote?: string;
  disclaimer: string;
  sampleLabel: string;
  /** For the screen, not the design. */
  unverified: string[];
  /** Ticked details that have no value in the record and were left off. */
  empty: string[];
  noPrice: boolean;
  /** Longer than fits on two lines of the design: the end is cut with …, so the agent should shorten it. */
  headlineLong: boolean;
}

export interface PosterInput {
  lang: Lang;
  listing: Listing;
  fields: BuyerField[];
  selected: Record<string, boolean>;
  /** The agent's own headline text; empty = use the property's advert title, then its card title. */
  headline?: string;
  agent?: Pick<Profile, 'fullName' | 'agency' | 'regNo' | 'phone' | 'email'>;
  agentChoice?: AgentChoice;
  /** Reference number printed on the design (the agent chooses). */
  showRef?: boolean;
  maxFacts?: number;
}

/** Characters that fit on the two headline lines of the posts (about 38 per line at the design's size). */
export const HEADLINE_FITS = 70;

export function posterText(lang: Lang) { return posterWords[lang]; }

export function buildPosterContent(i: PosterInput): PosterContent {
  const l = i.listing;
  const s = listingStrings[i.lang];
  const w = posterWords[i.lang];
  const price = new Set(MARKETING_KEYS.filter(m => m.price).map(m => String(m.key)));
  const prices: PosterFact[] = [], facts: PosterFact[] = [], unverified: string[] = [], empty: string[] = [];
  const placeParts: string[] = [];
  let highlights: string | undefined;
  for (const f of i.fields) {
    const k = String(f.key);
    if (!i.selected[k]) continue;
    if (f.value === undefined) { empty.push(f.label); continue; }
    const un = f.status !== undefined && !f.confirmed;
    if (un) unverified.push(f.label);
    const fact: PosterFact = { key: k, label: f.label, value: f.value, unverified: un };
    if (price.has(k)) prices.push(fact);
    else if (LOCATION_KEYS.includes(k)) placeParts.push(f.value);
    else if (k === 'features') highlights = f.value;
    else facts.push(fact);
  }
  const headline = i.headline?.trim() || publicTitle(l, s, placeParts.length > 0, w.untitled);
  const lines = i.agent && i.agentChoice ? agentLines(i.agent, i.agentChoice) : [];
  const shownFacts = facts.filter(x => x.key !== 'type').slice(0, i.maxFacts ?? 8);
  const anyUn = [...prices, ...shownFacts].some(x => x.unverified);
  return {
    lang: i.lang, headline,
    ribbon: l.purpose ? s.purpose[l.purpose] : undefined,
    place: placeParts.length ? placeParts.join(', ') : undefined,
    prices, facts: shownFacts, highlights, agent: lines, sample: !!l.sample,
    ref: i.showRef ? l.ref : undefined,
    footnote: anyUn ? w.footnote : undefined,
    disclaimer: w.disclaimer, sampleLabel: w.sample,
    unverified, empty, noPrice: prices.length === 0, headlineLong: headline.length > HEADLINE_FITS,
  };
}

/** A file name safe on every system, e.g. "P1004-square.png". */
export function marketingFileName(ref: string | undefined, fallback: string, format: FormatId, output: OutputId): string {
  const base = (ref || fallback || 'property').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'property';
  return `${base}-${format}.${output}`;
}

const posterWords = {
  en: { untitled: 'Property', footnote: '* Not yet verified. Please confirm before relying on it.', disclaimer: 'Information supplied by the agent and not guaranteed. Please verify before you decide.', sample: 'SAMPLE · not a real property' },
  bm: { untitled: 'Hartanah', footnote: '* Belum disahkan. Sila sahkan sebelum bergantung padanya.', disclaimer: 'Maklumat dibekalkan oleh ejen dan tidak dijamin. Sila sahkan sebelum membuat keputusan.', sample: 'CONTOH · bukan hartanah sebenar' },
  zh: { untitled: '房产', footnote: '* 尚未核实，请确认后再依赖。', disclaimer: '资料由代理提供，不作保证。请在决定前核实。', sample: '示例 · 非真实房产' },
};
