// Property List: the property record, filters and helpers.
// Every field is optional except the id. Field names follow the planned database (properties, property_contacts,
// documents, listings/marketing) so the record can be synced to the cloud database unchanged.
// Inquiries and viewings are separate records (data/types.ts) linked to the property by id.

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
export type DocCategory = 'title' | 'brochure' | 'floorplan' | 'correspondence' | 'transaction' | 'other';
export type AdStatus = 'planned' | 'live' | 'needs_update' | 'paused' | 'expired';
/** Is a "For Sale / For Rent" banner up for this property? (owner, 12 Oct 2026) */
export type BannerStatus = 'yes' | 'no' | 'not_yet' | 'not_allowed' | 'removed';

export const TYPES = [
  'Terrace house', 'Semi-D house', 'Bungalow', 'Townhouse', 'Condo / apartment', 'Residential land', 'Shoplot', 'Office',
  'Terrace factory', 'Semi-D factory', 'Detached factory', 'Warehouse',
  'Industrial land', 'Agricultural land', 'Development land',
] as const;
export const CATEGORIES: Category[] = ['residential', 'commercial', 'industrial', 'agricultural', 'development'];
export const TYPE_CATEGORY: Record<string, Category> = {
  'Terrace house': 'residential', 'Semi-D house': 'residential', 'Bungalow': 'residential', 'Townhouse': 'residential', 'Condo / apartment': 'residential', 'Residential land': 'residential',
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
/** Built-in restriction values; others can be typed and are remembered. */
export const RESTRICTIONS = ['No restriction', 'Bumiputera lot', 'Malay reserve'] as const;
export const TITLE_TYPES = ['Individual title', 'Strata title', 'Master title'] as const;
export const DOC_CATEGORIES: DocCategory[] = ['title', 'brochure', 'floorplan', 'correspondence', 'transaction', 'other'];
/** Title documents and owner correspondence can hold personal details: kept on this phone only. */
export const CONFIDENTIAL_DOCS: DocCategory[] = ['title', 'correspondence', 'transaction'];
export const PLATFORMS = ['PropertyGuru', 'iProperty', 'Mudah', 'The Edge Property', 'Facebook Ads', 'Facebook Marketplace'] as const;
export const AD_STATUSES: AdStatus[] = ['planned', 'live', 'needs_update', 'paused', 'expired'];
export const BANNER_STATUSES: BannerStatus[] = ['yes', 'not_yet', 'no', 'not_allowed', 'removed'];
export const MAX_CUSTOM_FIELDS = 10;

/** A photo is either a stored file (fileId, kept in the phone's storage) or a built-in sample picture (url). */
export interface Photo {
  id: string; fileId?: string; url?: string; name: string; bytes?: number; sample?: boolean;
  /** Set on a copy made by the Photo Studio: enhanced, privacy-masked by hand, or both. The untouched original stays a separate photo unless the agent chose to replace it. */
  edit?: 'enhanced' | 'masked' | 'both';
  /** The photo this copy was made from (it may since have been removed). */
  editedFrom?: string;
}
export interface Doc { id: string; category: DocCategory; name: string; fileId?: string; bytes?: number; mime?: string; added: number }
export interface Tenancy { tenant?: string; start?: string; end?: string; rent?: number; notes?: string }
/** What kind of advert it is (Stage 6). */
export type AdType = 'listing' | 'featured' | 'boosted' | 'social' | 'other';
export const AD_TYPES: AdType[] = ['listing', 'featured', 'boosted', 'social', 'other'];
/** One advert for a property. The Stage 6 fields are all optional, so adverts saved before them stay valid. `fake` marks a dummy / test
 *  listing: it is never counted in costs or reminders and is always shown with a TEST label. The app records adverts; it never posts to a platform. */
export interface Advert {
  id: string; platform: string; start?: string; end?: string; ref?: string; status?: AdStatus; notes?: string;
  type?: AdType; title?: string; url?: string; cost?: number; screenshotFileId?: string; fake?: boolean;
  /** Days before the end date to remind (default 3). */
  remindDays?: number;
}
export interface Marketing { advertised?: 'yes' | 'no'; ads: Advert[]; custom: Record<string, string> }
export interface ChangeEntry { at: number; source: 'form' | 'voice' | 'map'; summary: string }
/** Extra marketing fields the agent creates (at most 10). Shared by all properties; each property keeps its own values. */
export interface MarketingFieldDef { id: string; label: string }

export interface Listing {
  id: string;
  created: number;
  updated: number;
  sample?: boolean;
  /** Full reference, prefix + running number, e.g. P1001. Shown on the detail page only, not on cards. */
  ref?: string;
  refPrefix?: string;
  refNo?: number;
  headline?: string;
  photos: Photo[];
  mainPhotoId?: string;
  type?: string;
  // location, in the order the agent fills it
  country?: string;
  state?: string;
  city?: string;
  township?: string;
  lotNo?: string;
  street?: string;
  unitNo?: string;
  /** Saved map position (from GPS, Google Maps or typed). Used by the map, navigation and House Shopping. */
  lat?: number;
  lng?: number;
  geoSource?: 'gps' | 'google' | 'manual';
  geoAccuracy?: number;
  placeId?: string;
  // property details
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
  ceilingFt?: number;
  powerKva?: number;
  loadingBays?: number;
  specs?: string;
  zoning?: string;
  approvals?: string;
  currentUse?: string;
  roadAccess?: string;
  // owner (quick details) and the linked contact record
  ownerName?: string;
  ownerPhone?: string;
  vendorId?: string;
  // tenure and title
  tenure?: Tenure;
  leaseExpiryYear?: number;
  titleType?: string;
  landUse?: LandUse;
  restriction?: string;
  // money
  purpose?: Purpose;
  askingPrice?: number;
  negotiable?: Negotiable;
  commissionPct?: number;
  monthlyRent?: number;
  securityDepositMonths?: number;
  utilityDepositMonths?: number;
  maintenanceFee?: number;
  tenancy?: Tenancy;
  // availability and condition
  availability?: Availability;
  availableFrom?: string;
  condition?: Condition;
  features?: string;
  // arrangement and marketing
  arrangement?: Arrangement;
  arrangementNote?: string;
  marketing?: Marketing;
  /** Banner placed? Where each banner stands is kept in the banners records (data/types.ts). */
  bannerStatus?: BannerStatus;
  status?: Status;
  handledBy?: string;
  notes?: string;
  documents?: Doc[];
  history?: ChangeEntry[];
  /** Where each value came from: typed by hand, or taken from what the agent said (voice). */
  filledFrom?: Partial<Record<keyof Listing, 'typed' | 'words'>>;
  /** How far each important fact can be trusted (listing/verify.ts). A field with no entry has not been marked yet. */
  verification?: Partial<Record<string, 'confirmed' | 'owner' | 'check' | 'unknown'>>;
}

export const thisYear = () => new Date().getFullYear();
export const categoryOf = (l: Pick<Listing, 'type'>): Category | undefined => (l.type ? TYPE_CATEGORY[l.type] : undefined);

export function yearsRemaining(l: Pick<Listing, 'tenure' | 'leaseExpiryYear'>, year = thisYear()): number | undefined {
  if (l.tenure !== 'leasehold' || !l.leaseExpiryYear) return undefined;
  return Math.max(0, l.leaseExpiryYear - year);
}

export { rm, rm2, rmShort } from '../lib/money';
export const sqft = (n?: number) => (n === undefined ? '' : Math.round(n).toLocaleString('en-US') + ' sq ft');
export const landText = (n?: number) => (n === undefined ? '' : n >= 43560 ? `${(n / 43560).toFixed(2)} acres (${sqft(n)})` : sqft(n));

export const commissionRm = (l: Listing) =>
  l.askingPrice !== undefined && l.commissionPct !== undefined ? (l.askingPrice * l.commissionPct) / 100 : undefined;

export const forRent = (l: Pick<Listing, 'purpose'>) => l.purpose === 'rent' || l.purpose === 'sale_or_rent';
export const forSale = (l: Pick<Listing, 'purpose'>) => l.purpose !== 'rent';

/** Malaysian phone numbers in one format (+60 …); anything else is kept as typed. */
export function normalisePhone(raw?: string): string | undefined {
  if (!raw || !raw.trim()) return undefined;
  const d = raw.replace(/\D/g, '');
  const local = d.startsWith('60') ? '0' + d.slice(2) : d;
  if (/^01\d{8,9}$/.test(local)) return '+60 ' + local.slice(1, 3) + '-' + local.slice(3, local.length - 4) + ' ' + local.slice(-4);
  if (/^0[3-9]\d{7,8}$/.test(local)) return '+60 ' + local.slice(1, 2) + '-' + local.slice(2, local.length - 4) + ' ' + local.slice(-4);
  return raw.trim();
}
/** Digits for tel: and wa.me links (+60…); a local 0… number gets the Malaysian country code. */
export function phoneDigits(raw?: string): string {
  const d = (raw ?? '').replace(/\D/g, '');
  return d.startsWith('0') ? '6' + d : d;
}
/** A number worth calling or opening in WhatsApp: at least 9 digits (the same rule as the name card). Anything shorter is
 *  kept as typed but gets no call / WhatsApp link, so a broken link is never opened. */
export const usablePhone = (raw?: string): boolean => phoneDigits(raw).length >= 9;

/** The place name shown on cards: township, else city. */
export const placeName = (l: Pick<Listing, 'township' | 'city'>) => l.township || l.city || '';

/** Address-style title: unit number or lot, street, then township. The unit number is shown as it was typed, without
 *  the word "Unit" in front (owner, 13 Oct 2026). The stored unitNo itself is never changed. */
export function title(l: Listing): string {
  const head = l.unitNo ? l.unitNo : l.lotNo ? `Lot ${l.lotNo}` : '';
  return [head, l.street, placeName(l)].filter(Boolean).join(', ');
}
export const cardTitle = (l: Listing) => l.headline || title(l);

/** Full address, in the agreed order from the most specific part. */
export function addressLine(l: Listing): string {
  return [l.unitNo && `Unit ${l.unitNo}`, l.lotNo && `Lot ${l.lotNo}`, l.street, l.township, l.city, l.state, l.country].filter(Boolean).join(', ');
}

export const hasPosition = (l: Pick<Listing, 'lat' | 'lng'>) =>
  typeof l.lat === 'number' && typeof l.lng === 'number' && Number.isFinite(l.lat) && Number.isFinite(l.lng);

/** The main photo, or a drawn sample picture of the property type when there is no photo (same look on every card). */
export function mainPhoto(l: Listing): Photo | undefined {
  const p = l.photos.find(x => x.id === l.mainPhotoId) ?? l.photos[0];
  if (p) return p;
  const scene = sceneForType(l.type);
  return { id: 'type-' + (scene ?? 'generic'), url: sceneUrl(scene ?? 'generic'), name: 'Sample picture', sample: true };
}

// ---------- which fields apply to which property type ----------
export type FormField =
  | 'bedrooms' | 'bathrooms' | 'floors' | 'parking' | 'landSqft' | 'builtUpSqft' | 'frontageFt' | 'depthFt' | 'lotType' | 'furnishing'
  | 'ceilingFt' | 'powerKva' | 'loadingBays' | 'specs' | 'zoning' | 'approvals' | 'currentUse' | 'roadAccess'
  | 'maintenanceFee' | 'condition' | 'landUse';
export const ALL_FORM_FIELDS: FormField[] = ['bedrooms', 'bathrooms', 'floors', 'parking', 'landSqft', 'builtUpSqft', 'frontageFt', 'depthFt', 'lotType', 'furnishing',
  'ceilingFt', 'powerKva', 'loadingBays', 'specs', 'zoning', 'approvals', 'currentUse', 'roadAccess', 'maintenanceFee', 'condition', 'landUse'];

const BUILT: FormField[] = ['floors', 'parking', 'builtUpSqft', 'condition', 'maintenanceFee', 'specs'];
const LANDED: FormField[] = ['landSqft', 'frontageFt', 'depthFt', 'lotType', 'landUse'];
const LAND_ONLY: FormField[] = ['landSqft', 'frontageFt', 'depthFt', 'roadAccess', 'landUse'];

/** Fields shown for a property type. Unknown or custom types show every field, so nothing is hidden. */
export function fieldsFor(type?: string): Set<FormField> {
  if (!type || !TYPE_CATEGORY[type]) return new Set(ALL_FORM_FIELDS);
  const strata = type === 'Condo / apartment' || type === 'Office';
  switch (TYPE_CATEGORY[type]) {
    case 'residential': if (type === 'Residential land') return new Set<FormField>([...LAND_ONLY, 'zoning', 'approvals']);
      return new Set<FormField>([...BUILT, 'bedrooms', 'bathrooms', 'furnishing', ...(strata ? [] : LANDED)]);
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
  /** e.g. 'cobroke' for the Co-broke card. */
  arrangement?: Arrangement;
}

export function activeCount(f: Filters): number {
  return Object.values(f).filter(v => v !== undefined && v !== '').length;
}

/** A listing passes a filter only when it has that value and it matches. Rent filters use the monthly rent. */
export function applyFilters(list: Listing[], f: Filters): Listing[] {
  const q = f.location?.trim().toLowerCase();
  return list.filter(l => {
    if (q && ![l.street, l.township, l.city, l.state, l.unitNo, l.lotNo, l.headline, l.ref].some(v => (v ?? '').toLowerCase().includes(q))) return false;
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
    if (f.arrangement && l.arrangement !== f.arrangement) return false;
    return true;
  });
}

/** Details still missing that an agent normally needs. */
export function missingDetails(l: Listing): (keyof Listing)[] {
  const need: (keyof Listing)[] = ['type', 'street', 'tenure'];
  if (!l.township && !l.city) need.push('township');
  if (forSale(l)) need.push('askingPrice');
  if (forRent(l)) need.push('monthlyRent');
  const f = fieldsFor(l.type);
  if (f.has('landSqft')) need.push('landSqft');
  if (f.has('builtUpSqft')) need.push('builtUpSqft');
  if (f.has('bedrooms')) need.push('bedrooms');
  if (!l.vendorId && !l.ownerName) need.push('vendorId');
  if (!hasPosition(l)) need.push('lat');
  return need.filter(k => k === 'township' || k === 'lat' ? true : l[k] === undefined || l[k] === '');
}
