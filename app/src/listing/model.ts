// Property List (Version 1L; first built as Property Listing in 1K): data model, sample listings, filters and helpers.
// Every field is optional. Field names follow the planned database (properties, property_contacts, documents,
// listings/marketing, viewings), so voice, Smart Capture or the database can fill a record later.

import { sceneUrl, sceneForType } from './illustrations';

export type Tenure = 'freehold' | 'leasehold';
export type LotType = 'intermediate' | 'corner' | 'end' | 'single';
export type Status = 'available' | 'in_progress' | 'sold' | 'rented' | 'off_market' | 'needs_check';
export type Negotiable = 'yes' | 'no';
export type Category = 'residential' | 'commercial' | 'industrial' | 'agricultural' | 'development';
export type Purpose = 'sale' | 'rent' | 'sale_or_rent';
export type Arrangement = 'direct' | 'referral' | 'cobroke' | 'other';
export type Availability = 'immediate' | 'from_date' | 'tenanted' | 'under_construction' | 'not_available';
export type Condition = 'new' | 'good' | 'renovated' | 'needs_repair' | 'bare';
export type Furnishing = 'unfurnished' | 'partly' | 'fully';
export type LandUse = 'building' | 'industry' | 'agriculture';
export type Restriction = 'none' | 'bumi_lot' | 'malay_reserve' | 'other';
export type DocCategory = 'title' | 'brochure' | 'floorplan' | 'correspondence' | 'transaction' | 'other';
export type AdStatus = 'planned' | 'live' | 'needs_update' | 'paused' | 'expired';

export const TYPES = [
  'Terrace house', 'Semi-D house', 'Bungalow', 'Townhouse', 'Condo / apartment', 'Shoplot', 'Office',
  'Terrace factory', 'Semi-D factory', 'Detached factory', 'Warehouse',
  'Industrial land', 'Agricultural land', 'Development land', 'Other',
] as const;
export const CATEGORIES: Category[] = ['residential', 'commercial', 'industrial', 'agricultural', 'development'];
export const TYPE_CATEGORY: Record<string, Category> = {
  'Terrace house': 'residential', 'Semi-D house': 'residential', 'Bungalow': 'residential', 'Townhouse': 'residential', 'Condo / apartment': 'residential',
  'Shoplot': 'commercial', 'Office': 'commercial',
  'Terrace factory': 'industrial', 'Semi-D factory': 'industrial', 'Detached factory': 'industrial', 'Warehouse': 'industrial', 'Industrial land': 'industrial',
  'Agricultural land': 'agricultural', 'Development land': 'development',
};
export const TENURES: Tenure[] = ['freehold', 'leasehold'];
export const LOT_TYPES: LotType[] = ['intermediate', 'corner', 'end', 'single'];
export const STATUSES: Status[] = ['available', 'in_progress', 'sold', 'rented', 'off_market', 'needs_check'];
export const PURPOSES: Purpose[] = ['sale', 'rent', 'sale_or_rent'];
export const ARRANGEMENTS: Arrangement[] = ['direct', 'referral', 'cobroke', 'other'];
export const AVAILABILITY: Availability[] = ['immediate', 'from_date', 'tenanted', 'under_construction', 'not_available'];
export const CONDITIONS: Condition[] = ['new', 'good', 'renovated', 'needs_repair', 'bare'];
export const FURNISHING: Furnishing[] = ['unfurnished', 'partly', 'fully'];
export const LAND_USES: LandUse[] = ['building', 'industry', 'agriculture'];
export const RESTRICTIONS: Restriction[] = ['none', 'bumi_lot', 'malay_reserve', 'other'];
export const TITLE_TYPES = ['Individual title', 'Strata title', 'Master title'] as const;
export const DOC_CATEGORIES: DocCategory[] = ['title', 'brochure', 'floorplan', 'correspondence', 'transaction', 'other'];
/** Title documents and owner correspondence can hold personal details: kept on this phone only, never sent to AI. */
export const CONFIDENTIAL_DOCS: DocCategory[] = ['title', 'correspondence', 'transaction'];
export const PLATFORMS = ['PropertyGuru', 'iProperty', 'Mudah', 'The Edge Property', 'Facebook Ads', 'Facebook Marketplace', 'Other'] as const;
export const AD_STATUSES: AdStatus[] = ['planned', 'live', 'needs_update', 'paused', 'expired'];
export const MAX_CUSTOM_FIELDS = 10;

export interface Photo { id: string; url: string; name: string; bytes?: number; sample?: boolean }
export interface Doc { id: string; category: DocCategory; name: string; url?: string; bytes?: number; mime?: string; added: number }
/** Map-pin ready: a pin can come from GPS or be placed by hand. */
export interface Pin { lat: number; lon: number; accuracy?: number; source: 'gps' | 'manual' }
export interface Tenancy { tenant?: string; start?: string; end?: string; rent?: number; notes?: string }
export interface Advert { id: string; platform: string; start?: string; end?: string; ref?: string; status?: AdStatus; notes?: string }
export interface Marketing { advertised?: 'yes' | 'no'; ads: Advert[]; custom: Record<string, string> }
export interface Viewing { id: string; date: string; viewer?: string; attended?: 'yes' | 'no'; note?: string }
export interface ChangeEntry { at: number; source: 'form' | 'voice' | 'words'; summary: string }
/** Extra marketing fields the agent creates (at most 10). Shared by all properties; each property keeps its own values. */
export interface MarketingFieldDef { id: string; label: string }

export interface Listing {
  id: string;
  created: number;
  updated: number;
  ref?: string;              // agent's own reference, e.g. P-1001
  headline?: string;         // short title for cards and adverts
  photos: Photo[];
  mainPhotoId?: string;
  // property details
  type?: string;
  unitNo?: string;
  lotNo?: string;
  address?: string;
  area?: string;            // Nilai, Sepang, Salak Tinggi …
  pin?: Pin;
  bedrooms?: number;
  bathrooms?: number;
  floors?: number;
  parking?: number;
  landSqft?: number;
  builtUpSqft?: number;
  frontageFt?: number;
  depthFt?: number;
  lotType?: LotType;
  furnishing?: Furnishing;
  ceilingFt?: number;       // industrial
  powerKva?: number;
  loadingBays?: number;
  specs?: string;           // other building specifications
  zoning?: string;          // development land
  approvals?: string;
  currentUse?: string;      // agricultural land: crop or current use
  roadAccess?: string;
  // owner (quick details) and the linked vendor record
  ownerName?: string;
  ownerPhone?: string;
  vendorId?: string;
  // tenure and title
  tenure?: Tenure;
  leaseExpiryYear?: number;
  titleType?: string;
  landUse?: LandUse;
  restriction?: Restriction;
  // money
  purpose?: Purpose;
  askingPrice?: number;
  negotiable?: Negotiable;
  commissionPct?: number;
  monthlyRent?: number;
  securityDepositMonths?: number;
  utilityDepositMonths?: number;
  maintenanceFee?: number;  // per month
  tenancy?: Tenancy;
  // availability and condition
  availability?: Availability;
  availableFrom?: string;   // yyyy-mm
  condition?: Condition;
  features?: string;
  // listing arrangement and marketing
  arrangement?: Arrangement;
  arrangementNote?: string; // referrer or co-broke agency
  marketing?: Marketing;
  // listing status
  status?: Status;
  handledBy?: string;       // shown when the sale is in progress
  notes?: string;           // internal notes
  documents?: Doc[];
  viewings?: Viewing[];
  history?: ChangeEntry[];
  /** Where each value came from: typed by hand, or filled from words (voice or typed description). */
  filledFrom?: Partial<Record<keyof Listing, 'typed' | 'words'>>;
}

export const thisYear = () => new Date().getFullYear();
export const categoryOf = (l: Pick<Listing, 'type'>): Category | undefined => (l.type ? TYPE_CATEGORY[l.type] : undefined);

/** Years left on a leasehold title, or undefined when not known. */
export function yearsRemaining(l: Pick<Listing, 'tenure' | 'leaseExpiryYear'>, year = thisYear()): number | undefined {
  if (l.tenure !== 'leasehold' || !l.leaseExpiryYear) return undefined;
  return Math.max(0, l.leaseExpiryYear - year);
}

export const rm = (n?: number) => (n === undefined ? '' : 'RM ' + Math.round(n).toLocaleString('en-US'));
export const sqft = (n?: number) => (n === undefined ? '' : Math.round(n).toLocaleString('en-US') + ' sq ft');
/** Land shown in acres as well when it is an acre or more. */
export const landText = (n?: number) => (n === undefined ? '' : n >= 43560 ? `${(n / 43560).toFixed(2)} acres (${sqft(n)})` : sqft(n));
/** Short money for small cards: RM 3.2m, RM 580k, RM 8,500. */
export function rmShort(n?: number): string {
  if (n === undefined) return '';
  if (n >= 1_000_000) return `RM ${+(n / 1_000_000).toFixed(2)}m`;
  if (n >= 100_000) return `RM ${Math.round(n / 1000)}k`;
  return rm(n);
}

/** Commission in RM, when both the price and the percentage are known. */
export const commissionRm = (l: Listing) =>
  l.askingPrice !== undefined && l.commissionPct !== undefined ? (l.askingPrice * l.commissionPct) / 100 : undefined;

export const forRent = (l: Listing) => l.purpose === 'rent' || l.purpose === 'sale_or_rent';
export const forSale = (l: Listing) => l.purpose !== 'rent';

/** Malaysian phone numbers in one format (+60 …); anything else is kept as typed. */
export function normalisePhone(raw?: string): string | undefined {
  if (!raw || !raw.trim()) return undefined;
  const d = raw.replace(/\D/g, '');
  const local = d.startsWith('60') ? '0' + d.slice(2) : d;
  if (/^01\d{8,9}$/.test(local)) return '+60 ' + local.slice(1, 3) + '-' + local.slice(3, local.length - 4) + ' ' + local.slice(-4);
  if (/^0[3-9]\d{7,8}$/.test(local)) return '+60 ' + local.slice(1, 2) + '-' + local.slice(2, local.length - 4) + ' ' + local.slice(-4);
  return raw.trim();
}

/** Address-based title (unit or lot, then address). */
export function title(l: Listing): string {
  const head = [l.unitNo && `Unit ${l.unitNo}`, l.lotNo && !l.unitNo && `Lot ${l.lotNo}`].filter(Boolean).join(' ');
  return [head, l.address].filter(Boolean).join(', ') || l.area || '';
}
/** Card title: the headline when there is one, otherwise the address-based title. */
export const cardTitle = (l: Listing) => l.headline || title(l);

/** The property's main photo; a sample picture of its type when it has no photo. */
export function mainPhoto(l: Listing): Photo | undefined {
  const p = l.photos.find(x => x.id === l.mainPhotoId) ?? l.photos[0];
  if (p) return p;
  const scene = sceneForType(l.type);
  return scene ? { id: 'type-' + scene, url: sceneUrl(scene), name: 'Sample picture', sample: true } : undefined;
}

// ---------- which fields apply to which property type ----------
export type FormField =
  | 'bedrooms' | 'bathrooms' | 'floors' | 'parking' | 'landSqft' | 'builtUpSqft' | 'frontageFt' | 'depthFt' | 'lotType' | 'furnishing'
  | 'ceilingFt' | 'powerKva' | 'loadingBays' | 'specs' | 'zoning' | 'approvals' | 'currentUse' | 'roadAccess'
  | 'maintenanceFee' | 'condition' | 'landUse';

const BUILT: FormField[] = ['floors', 'parking', 'builtUpSqft', 'condition', 'maintenanceFee', 'specs'];
const LANDED: FormField[] = ['landSqft', 'frontageFt', 'depthFt', 'lotType', 'landUse'];
const LAND_ONLY: FormField[] = ['landSqft', 'frontageFt', 'depthFt', 'roadAccess', 'landUse'];

/**
 * The fields shown in the form for a property type. Unknown or "Other" types show every field,
 * so nothing is hidden before the type is chosen. Land shows no house fields; condos and offices show no land size.
 */
export function fieldsFor(type?: string): Set<FormField> {
  const all: FormField[] = ['bedrooms', 'bathrooms', 'floors', 'parking', 'landSqft', 'builtUpSqft', 'frontageFt', 'depthFt', 'lotType', 'furnishing',
    'ceilingFt', 'powerKva', 'loadingBays', 'specs', 'zoning', 'approvals', 'currentUse', 'roadAccess', 'maintenanceFee', 'condition', 'landUse'];
  if (!type || type === 'Other' || !TYPE_CATEGORY[type]) return new Set(all);
  const strata = type === 'Condo / apartment' || type === 'Office';
  switch (TYPE_CATEGORY[type]) {
    case 'residential': return new Set<FormField>([...BUILT, 'bedrooms', 'bathrooms', 'furnishing', ...(strata ? [] : LANDED)]);
    case 'commercial': return new Set<FormField>([...BUILT, 'bathrooms', 'furnishing', ...(strata ? [] : LANDED)]);
    case 'industrial': return type === 'Industrial land'
      ? new Set<FormField>([...LAND_ONLY, 'zoning', 'approvals'])
      : new Set<FormField>([...BUILT, ...LANDED, 'ceilingFt', 'powerKva', 'loadingBays']);
    case 'agricultural': return new Set<FormField>([...LAND_ONLY, 'currentUse']);
    case 'development': return new Set<FormField>([...LAND_ONLY, 'zoning', 'approvals']);
  }
}

// ---------- filters ----------
export interface Filters {
  location?: string;
  type?: string;
  /** Any type containing this word, e.g. every kind of factory. */
  typeWord?: string;
  category?: Category;
  purpose?: 'sale' | 'rent';
  priceMin?: number;
  priceMax?: number;
  bedsMin?: number;
  bathsMin?: number;
  tenure?: Tenure;
  lotType?: LotType;
  status?: Status;
}

export function activeCount(f: Filters): number {
  return Object.values(f).filter(v => v !== undefined && v !== '').length;
}

/**
 * A listing passes a filter only when it has that value and it matches.
 * Listings with no value for a filtered field are left out (they cannot be shown to match).
 * Price filters use the asking price, or the monthly rent when filtering rentals.
 */
export function applyFilters(list: Listing[], f: Filters): Listing[] {
  const q = f.location?.trim().toLowerCase();
  return list.filter(l => {
    if (q && !`${l.address ?? ''} ${l.area ?? ''} ${l.unitNo ?? ''} ${l.lotNo ?? ''} ${l.headline ?? ''} ${l.ref ?? ''}`.toLowerCase().includes(q)) return false;
    if (f.type && l.type !== f.type) return false;
    if (f.typeWord && !(l.type ?? '').toLowerCase().includes(f.typeWord.toLowerCase())) return false;
    if (f.category && categoryOf(l) !== f.category) return false;
    if (f.purpose === 'sale' && !(l.purpose === undefined ? l.askingPrice !== undefined : forSale(l))) return false;
    if (f.purpose === 'rent' && !forRent(l)) return false;
    const price = f.purpose === 'rent' ? l.monthlyRent : l.askingPrice;
    if (f.priceMin !== undefined && !(price !== undefined && price >= f.priceMin)) return false;
    if (f.priceMax !== undefined && !(price !== undefined && price <= f.priceMax)) return false;
    if (f.bedsMin !== undefined && !(l.bedrooms !== undefined && l.bedrooms >= f.bedsMin)) return false;
    if (f.bathsMin !== undefined && !(l.bathrooms !== undefined && l.bathrooms >= f.bathsMin)) return false;
    if (f.tenure && l.tenure !== f.tenure) return false;
    if (f.lotType && l.lotType !== f.lotType) return false;
    if (f.status && l.status !== f.status) return false;
    return true;
  });
}

/** Next free reference number (P-1001, P-1002 …). */
export function nextRef(list: Listing[]): string {
  const n = list.map(l => /^P-(\d+)$/.exec(l.ref ?? '')?.[1]).filter(Boolean).map(Number);
  return `P-${(n.length ? Math.max(...n) : 1000) + 1}`;
}

/** Details still missing that an agent normally needs (used by the record screen and, later, the To-Do centre). */
export function missingDetails(l: Listing): (keyof Listing)[] {
  const need: (keyof Listing)[] = ['type', 'address', 'tenure'];
  if (forSale(l)) need.push('askingPrice');
  if (forRent(l)) need.push('monthlyRent');
  const f = fieldsFor(l.type);
  if (f.has('landSqft')) need.push('landSqft');
  if (f.has('builtUpSqft')) need.push('builtUpSqft');
  if (f.has('bedrooms')) need.push('bedrooms');
  if (!l.vendorId && !l.ownerName) need.push('vendorId');
  return need.filter(k => l[k] === undefined || l[k] === '');
}

/** Values found in a person's words (voice or typed description), keyed like Smart Capture fields. */
export interface WordValues {
  type?: string; location?: string; price?: string; bedrooms?: string; bathrooms?: string; floors?: string;
  land?: string; builtup?: string; tenure?: string; titleType?: string; ownerName?: string; docPhone?: string;
  remarks?: string; unit?: string; lot?: string;
}

const num = (s?: string) => {
  if (!s) return undefined;
  const n = parseFloat(s.replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : undefined;
};

/**
 * Fills only the EMPTY fields of a listing from words. Never overwrites a value the person already has.
 * Returns the new listing and the list of fields that were filled, so the form can highlight them for checking.
 */
export function fillEmptyFrom(l: Listing, w: WordValues): { listing: Listing; filled: (keyof Listing)[] } {
  const next: Listing = { ...l, filledFrom: { ...(l.filledFrom ?? {}) } };
  const filled: (keyof Listing)[] = [];
  const set = <K extends keyof Listing>(k: K, v: Listing[K] | undefined) => {
    if (v === undefined || v === '' || (next[k] !== undefined && next[k] !== '')) return;
    next[k] = v;
    next.filledFrom![k] = 'words';
    filled.push(k);
  };
  // Only exact types are used; a general word like "factory" leaves the type for the person to choose.
  set('type', w.type && (TYPES as readonly string[]).includes(w.type) ? w.type : undefined);
  set('area', w.location && !/\d/.test(w.location) && w.location.length < 30 ? w.location : undefined);
  set('address', w.location && (/\d/.test(w.location) || w.location.length >= 30) ? w.location : undefined);
  set('askingPrice', num(w.price));
  set('bedrooms', num(w.bedrooms));
  set('bathrooms', num(w.bathrooms));
  set('floors', num(w.floors));
  set('landSqft', num(w.land));
  set('builtUpSqft', num(w.builtup));
  if (w.tenure) {
    set('tenure', /free/i.test(w.tenure) ? 'freehold' : 'leasehold');
  }
  set('titleType', w.titleType);
  set('ownerName', w.ownerName);
  set('ownerPhone', w.docPhone);
  set('unitNo', w.unit);
  set('lotNo', w.lot);
  set('notes', w.remarks);
  return { listing: next, filled };
}

// ---------- sample listings (invented) ----------
const now = Date.now();
const DAY = 86_400_000;
const mk = (id: string, x: Partial<Listing>): Listing => ({ id, created: now, updated: now, photos: [], ...x });
const noAds: Marketing = { advertised: 'no', ads: [], custom: {} };

export const SAMPLE_LISTINGS: Listing[] = [
  mk('s1', {
    ref: 'P-1001', headline: 'Corner semi-D factory, Nilai Industrial Park', purpose: 'sale',
    type: 'Semi-D factory', unitNo: '7', lotNo: '2/14', address: 'Jalan Perindustrian 2/3', area: 'Nilai',
    landSqft: 8000, builtUpSqft: 6500, frontageFt: 60, depthFt: 133, floors: 2, parking: 4, ceilingFt: 28, powerKva: 150, loadingBays: 1,
    lotType: 'corner', tenure: 'freehold', titleType: 'Individual title', landUse: 'industry', restriction: 'none',
    askingPrice: 3200000, negotiable: 'yes', commissionPct: 2, maintenanceFee: 350, availability: 'immediate', condition: 'good',
    features: '2-storey office, 28 ft ceiling, 150 kVA, wide side land.', status: 'available', vendorId: 'v1', arrangement: 'direct',
    pin: { lat: 2.8205, lon: 101.8036, source: 'gps', accuracy: 6 }, notes: 'Owner open to offers. Keys with guard house.',
    marketing: { advertised: 'yes', ads: [
      { id: 'a1', platform: 'PropertyGuru', start: '2026-09-01', end: '2026-11-30', ref: 'PG-sample-001', status: 'live' },
      { id: 'a2', platform: 'Facebook Marketplace', start: '2026-09-10', status: 'needs_update', notes: 'Price changed; update the post.' },
    ], custom: {} },
    viewings: [{ id: 'w1', date: '2026-10-03', viewer: 'Buyer K (sample)', attended: 'yes', note: 'Liked the side land; asked about power upgrade.' }],
    documents: [{ id: 'd1', category: 'brochure', name: 'Unit 7 brochure (sample).pdf', added: now - 9 * DAY }],
  }),
  mk('s2', {
    ref: 'P-1002', headline: 'Semi-D factory with 6,200 sq ft built-up', purpose: 'sale',
    type: 'Semi-D factory', unitNo: '6', address: 'Jalan Perindustrian 2/3', area: 'Nilai', landSqft: 8000, builtUpSqft: 6200, parking: 3,
    lotType: 'intermediate', tenure: 'freehold', askingPrice: 3050000, negotiable: 'no', commissionPct: 2, availability: 'immediate',
    status: 'in_progress', handledBy: 'Negotiator B (sample)', vendorId: 'v2', arrangement: 'cobroke', arrangementNote: 'Co-broke with Agency M (sample)',
    pin: { lat: 2.8205, lon: 101.8032, source: 'gps', accuracy: 8 }, marketing: noAds,
  }),
  mk('s3', {
    ref: 'P-1003', headline: 'Detached factory on 1 acre, Nilai', purpose: 'sale',
    type: 'Detached factory', lotNo: '21', address: 'Kawasan Perindustrian Nilai', area: 'Nilai', landSqft: 43560, builtUpSqft: 20000, parking: 10,
    ceilingFt: 35, powerKva: 400, loadingBays: 2, lotType: 'single', tenure: 'leasehold', leaseExpiryYear: 2077, titleType: 'Individual title', landUse: 'industry',
    askingPrice: 7800000, availability: 'immediate', status: 'needs_check', vendorId: 'v3', arrangement: 'referral', arrangementNote: 'Referred by Banker R (sample)', marketing: noAds,
  }),
  mk('s4', {
    ref: 'P-1004', headline: 'Renovated 2-storey terrace, Taman Desa Nilai', purpose: 'sale',
    type: 'Terrace house', address: 'Jalan Desa 3, Taman Desa Nilai', area: 'Nilai', bedrooms: 4, bathrooms: 3, floors: 2, parking: 2,
    landSqft: 1540, builtUpSqft: 1800, frontageFt: 22, depthFt: 70, lotType: 'intermediate', tenure: 'freehold', landUse: 'building', furnishing: 'partly', condition: 'renovated',
    askingPrice: 580000, negotiable: 'yes', commissionPct: 3, availability: 'immediate', status: 'available', vendorId: 'v4', arrangement: 'direct',
    notes: 'Owner wants to sell urgently.', marketing: { advertised: 'yes', ads: [{ id: 'a3', platform: 'Mudah', start: '2026-10-01', status: 'live' }], custom: {} },
  }),
  mk('s5', {
    ref: 'P-1005', headline: 'End-lot semi-D, Bandar Baru Salak Tinggi', purpose: 'sale',
    type: 'Semi-D house', address: 'Jalan Seri 8, Bandar Baru Salak Tinggi', area: 'Salak Tinggi', bedrooms: 5, bathrooms: 4, floors: 2, parking: 3,
    landSqft: 3200, builtUpSqft: 2900, lotType: 'end', tenure: 'leasehold', leaseExpiryYear: 2105, askingPrice: 950000, status: 'sold', availability: 'not_available', vendorId: 'v5', marketing: noAds,
  }),
  mk('s6', {
    ref: 'P-1006', headline: 'Corner 3-storey shoplot, Sepang town', purpose: 'sale_or_rent',
    type: 'Shoplot', address: 'Jalan Pusat Niaga, Sepang', area: 'Sepang', floors: 3, builtUpSqft: 4200, landSqft: 1650, lotType: 'corner', bathrooms: 3,
    tenure: 'leasehold', leaseExpiryYear: 2094, askingPrice: 1200000, monthlyRent: 6500, securityDepositMonths: 2, utilityDepositMonths: 0.5,
    availability: 'tenanted', tenancy: { tenant: 'Tenant T (sample)', start: '2025-07', end: '2027-06', rent: 6000 }, status: 'rented', vendorId: 'v6', marketing: noAds,
    notes: 'Ground floor tenanted until June 2027.',
  }),
  mk('s7', {
    ref: 'P-1007', headline: '5 acres oil palm land, Labu', purpose: 'sale',
    type: 'Agricultural land', address: 'Mukim Labu', area: 'Labu', landSqft: 217800, tenure: 'freehold', landUse: 'agriculture', currentUse: 'Oil palm (mature)', roadAccess: 'Tar road frontage',
    askingPrice: 1100000, availability: 'immediate', status: 'available', vendorId: 'v7', marketing: noAds,
  }),
  mk('s8', {
    ref: 'P-1008', headline: 'Furnished 3-bedroom condo near Nilai station', purpose: 'rent',
    type: 'Condo / apartment', unitNo: 'B-12-3', address: 'Residensi Sample, Putra Nilai', area: 'Putra Nilai', bedrooms: 3, bathrooms: 2, parking: 2, builtUpSqft: 1100,
    furnishing: 'fully', condition: 'good', tenure: 'leasehold', leaseExpiryYear: 2112, titleType: 'Strata title', monthlyRent: 1800, securityDepositMonths: 2, utilityDepositMonths: 0.5, maintenanceFee: 320,
    availability: 'from_date', availableFrom: '2026-12', status: 'available', vendorId: 'v8', arrangement: 'direct',
    marketing: { advertised: 'yes', ads: [{ id: 'a4', platform: 'iProperty', start: '2026-10-05', status: 'live', ref: 'IP-sample-118' }], custom: {} },
  }),
  mk('s9', {
    ref: 'P-1009', headline: '12 acres development land, Bandar Enstek', purpose: 'sale',
    type: 'Development land', address: 'Off Jalan Enstek', area: 'Bandar Enstek', landSqft: 522720, tenure: 'freehold', landUse: 'building', zoning: 'Mixed development (to check with council)',
    roadAccess: 'Main road frontage', askingPrice: 15700000, availability: 'immediate', status: 'available', vendorId: 'v9', arrangement: 'cobroke', arrangementNote: 'Co-broke with Agency P (sample)', marketing: noAds,
  }),
  mk('s10', {
    ref: 'P-1010', headline: 'Detached factory for rent, Salak Tinggi', purpose: 'rent',
    type: 'Detached factory', address: 'Jalan Logistik 1, Salak Tinggi', area: 'Salak Tinggi', landSqft: 30000, builtUpSqft: 22000, ceilingFt: 40, powerKva: 300, loadingBays: 4, parking: 8,
    tenure: 'leasehold', leaseExpiryYear: 2085, monthlyRent: 33000, securityDepositMonths: 3, utilityDepositMonths: 1, availability: 'immediate', condition: 'good', status: 'available', vendorId: 'v10', marketing: noAds,
  }),
];
