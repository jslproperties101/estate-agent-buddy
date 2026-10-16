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
export type LandUse = 'building' | 'industry' | 'agriculture' | 'nil';
export type DocCategory = 'title' | 'brochure' | 'floorplan' | 'correspondence' | 'transaction' | 'other';
export type AdStatus = 'planned' | 'live' | 'needs_update' | 'paused' | 'expired';
/** Is a "For Sale / For Rent" banner up for this property? (owner, 12 Oct 2026) */
export type BannerStatus = 'yes' | 'no' | 'not_yet' | 'not_allowed' | 'removed';

/** Property types in the order shown. The land types sit together, Residential land with them (Change 009). */
export const TYPES = [
  'Terrace house', 'Semi-D house', 'Bungalow', 'Townhouse', 'Condo / apartment', 'Shoplot', 'Office',
  'Terrace factory', 'Semi-D factory', 'Detached factory', 'Warehouse',
  'Residential land', 'Industrial land', 'Agricultural land', 'Development land',
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
export const LAND_USES: LandUse[] = ['building', 'industry', 'agriculture', 'nil'];
/** Built-in restriction values; others can be typed and are remembered. "No restriction" was renamed "NON Bumiputera"
 *  (Change 009); records saved with the old value show and edit as the new one (restrictionValue). */
export const RESTRICTIONS = ['NON Bumiputera', 'Bumiputera lot', 'Malay reserve'] as const;
export const LEGACY_RESTRICTIONS: Record<string, string> = { 'No restriction': 'NON Bumiputera' };
export const restrictionValue = (v?: string) => (v ? LEGACY_RESTRICTIONS[v] ?? v : undefined);
/** Rental commission choices, in months of rent (Change 009); any other number of months can be typed. Never a percentage. */
export const RENT_COMMISSION_MONTHS = [1, 1.5, 2] as const;
export type SaleCommissionType = 'pct' | 'flat';
export type RentCommissionType = 'months' | 'flat';
export const SALE_COMMISSION_TYPES: SaleCommissionType[] = ['pct', 'flat'];
export const RENT_COMMISSION_TYPES: RentCommissionType[] = ['months', 'flat'];
export const TITLE_TYPES = ['Individual title', 'Strata title', 'Master title'] as const;
export const DOC_CATEGORIES: DocCategory[] = ['title', 'brochure', 'floorplan', 'correspondence', 'transaction', 'other'];
/** Documents that can hold personal details: in the owner's own backups and Google Drive, never in the shared team cloud bucket (data/fileRefs.ts). */
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
export interface Tenancy { tenant?: string; start?: string; end?: string; rent?: number; notes?: string; /** Tenant's phone (+ format) and WhatsApp alias (Change 009). */ tenantPhone?: string; tenantWhatsapp?: string }
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
  /** Neighborhood / Taman (Change 015): optional, between Township and Street; kept exactly as typed. */
  neighborhood?: string;
  /** Older records only: since Change 009 one "Unit/Lot Number" field (unitNo) holds both. Shown through unitLot(). */
  lotNo?: string;
  street?: string;
  /** "Unit/Lot Number": a unit, a house number or a lot, as typed. */
  unitNo?: string;
  /** A Google Maps link typed or pasted by the agent (Change 009). Kept as typed; coordinates are taken from it only when
   *  the link itself contains them (parseMapsLink). */
  mapsLink?: string;
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
  /** Extra Comments: long free text under Furnishing, shown in full on the card and in Property Details (Change 009). */
  extraComments?: string;
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
  /** Owner's WhatsApp ID / alias, typed in the property form; it moves to the vendor record when that is created. */
  ownerWhatsapp?: string;
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
  /** How the sale commission is set (owner, 15 Oct): a percentage of the asking price (default) or a flat fee in RM. */
  commissionType?: SaleCommissionType;
  /** Sale commission, a percentage of the asking price. */
  commissionPct?: number;
  /** Sale commission as a flat fee (RM). */
  commissionFlat?: number;
  monthlyRent?: number;
  /** How the rental commission is set: months of rent (default) or a flat fee in RM. Never a percentage. */
  rentCommissionType?: RentCommissionType;
  /** Rental commission, in months of rent (1, 1.5, 2 or any number the agent types). */
  rentCommissionMonths?: number;
  /** Rental commission as a flat fee (RM). */
  rentCommissionFlat?: number;
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
  /** Change 010: set when the property was deleted. It moves to the Archived section (kept until an authorised person
   *  deletes it permanently); Restore clears it. `by` is the user id (or "local" when signed out). */
  archived?: { at: number; by?: string; byName?: string };
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

/** Sale commission in RM: asking price × percentage, or the flat fee. Only for sale listings. */
export function commissionRm(l: Pick<Listing, 'askingPrice' | 'commissionPct' | 'purpose'> & Partial<Pick<Listing, 'commissionType' | 'commissionFlat'>>): number | undefined {
  if (!forSale(l)) return undefined;
  if (l.commissionType === 'flat') return l.commissionFlat;
  return l.askingPrice !== undefined && l.commissionPct !== undefined ? Math.round(l.askingPrice * l.commissionPct) / 100 : undefined;
}
/** Rental commission in RM: monthly rent × months, or the flat fee. Only for rental listings; never a percentage. */
export function rentCommissionRm(l: Pick<Listing, 'monthlyRent' | 'rentCommissionMonths' | 'purpose'> & Partial<Pick<Listing, 'rentCommissionType' | 'rentCommissionFlat'>>): number | undefined {
  if (!forRent(l)) return undefined;
  if (l.rentCommissionType === 'flat') return l.rentCommissionFlat;
  return l.monthlyRent !== undefined && l.rentCommissionMonths !== undefined ? Math.round(l.monthlyRent * l.rentCommissionMonths * 100) / 100 : undefined;
}

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

/** The one "Unit/Lot Number" (Change 009). Older records may still hold a separate lot number: both are shown together. */
export function unitLot(l: Pick<Listing, 'unitNo' | 'lotNo'>): string {
  const u = l.unitNo?.trim() ?? '';
  const lot = l.lotNo?.trim() ?? '';
  if (!lot) return u;
  const lotText = /^lot\b/i.test(lot) ? lot : `Lot ${lot}`;
  if (!u) return lotText;
  return u.toLowerCase().includes(lot.toLowerCase()) ? u : `${u}, ${lotText}`;
}

/** Joins address parts, leaving out a part already contained in an earlier one (no "Nilai" twice). */
function joinParts(parts: (string | undefined)[]): string {
  const out: string[] = [];
  for (const raw of parts) {
    const p = raw?.trim();
    if (!p) continue;
    const low = p.toLowerCase();
    if (out.some(x => x.toLowerCase().includes(low))) continue;
    out.push(p);
  }
  return out.join(', ');
}

/** The card's address (Change 009): Unit/Lot Number and street together, then township and town, each once. */
export function title(l: Listing): string {
  return joinParts([unitLot(l), l.street, l.township, l.city]);
}
/** Cards and lists are titled by the address, never by the marketing headline (which stays for Marketing Studio). */
export const cardTitle = (l: Listing) => title(l);

/** Full address, in the agreed order from the most specific part. */
export function addressLine(l: Listing): string {
  return joinParts([unitLot(l), l.street, l.township, l.city, l.state, l.country]);
}

/** Photos in their saved order. The first is the main photo (Change 009). Older records that chose another main photo
 *  show it first, so nothing they chose changes. */
export function orderedPhotos(l: Pick<Listing, 'photos' | 'mainPhotoId'>): Photo[] {
  const i = l.photos.findIndex(p => p.id === l.mainPhotoId);
  if (i <= 0) return l.photos;
  return [l.photos[i], ...l.photos.slice(0, i), ...l.photos.slice(i + 1)];
}

/** Moves one photo to another place; the first photo is then the main photo. */
export function movePhoto(photos: Photo[], from: number, to: number): Photo[] {
  if (from === to || from < 0 || to < 0 || from >= photos.length || to >= photos.length) return photos;
  const next = [...photos];
  const [p] = next.splice(from, 1);
  next.splice(to, 0, p);
  return next;
}

/** Coordinates written inside a full Google Maps link (…/@3.1,101.6,17z, ?q=3.1,101.6, ?query=…, !3d3.1!4d101.6).
 *  Short share links (maps.app.goo.gl/…) hide them behind a redirect, so they give undefined: the link is still saved
 *  and opened as typed, and the map position is chosen with Add Location. */
export function parseMapsLink(raw?: string): { lat: number; lng: number } | undefined {
  const s = raw?.trim();
  if (!s) return undefined;
  let url: URL;
  try { url = new URL(s); } catch { return undefined; }
  if (!/(^|\.)google\.[a-z.]+$|^goo\.gl$|^maps\.app\.goo\.gl$/i.test(url.hostname)) return undefined;
  const ok = (a: number, b: number) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) <= 90 && Math.abs(b) <= 180 && !(a === 0 && b === 0);
  const text = decodeURIComponent(url.pathname + url.search + url.hash);
  const d = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/.exec(text);
  if (d && ok(+d[1], +d[2])) return { lat: +d[1], lng: +d[2] };
  for (const key of ['q', 'query', 'll', 'destination']) {
    const v = url.searchParams.get(key);
    const m = v && /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(v);
    if (m && ok(+m[1], +m[2])) return { lat: +m[1], lng: +m[2] };
  }
  const at = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(url.pathname);
  if (at && ok(+at[1], +at[2])) return { lat: +at[1], lng: +at[2] };
  return undefined;
}

/** A record as the form edits it (Change 009). Older values are mapped, never dropped:
 *  - a separate lot number joins the one Unit/Lot Number field;
 *  - "No restriction" shows as "NON Bumiputera";
 *  - the main photo becomes the first photo. */
export function forEditing(l: Listing): Listing {
  const photos = orderedPhotos(l);
  const out: Listing = { ...l, photos: [...photos], mainPhotoId: photos[0]?.id };
  const ul = unitLot(l);
  if (l.lotNo) { out.unitNo = ul || undefined; delete out.lotNo; }
  if (l.restriction) out.restriction = restrictionValue(l.restriction);
  return out;
}

export const hasPosition = (l: Pick<Listing, 'lat' | 'lng'>) =>
  typeof l.lat === 'number' && typeof l.lng === 'number' && Number.isFinite(l.lat) && Number.isFinite(l.lng);

/** The main photo, or a drawn sample picture of the property type when there is no photo (same look on every card). */
export function mainPhoto(l: Listing): Photo | undefined {
  const p = orderedPhotos(l)[0];
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
// Change 014: land also shows Lot Type next to Frontage and Depth.
const LAND_ONLY: FormField[] = ['landSqft', 'frontageFt', 'depthFt', 'lotType', 'roadAccess', 'landUse'];

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
    if (q && ![l.street, l.township, l.city, l.state, l.unitNo, l.lotNo, unitLot(l), l.headline, l.ref].some(v => (v ?? '').toLowerCase().includes(q))) return false;
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
