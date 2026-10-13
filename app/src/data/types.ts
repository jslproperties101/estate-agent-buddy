// Record types for everything the app keeps. The property record (Listing) lives in listing/model.ts.
// Every record has an id made on the device, so records created offline never collide when synced later.
import type { Listing } from '../listing/model';
import type { Lang } from '../i18n';

export interface Base { id: string; created: number; updated: number; sample?: boolean }

// ---------- contacts and leads ----------
export type LeadStatus = 'cold' | 'warm' | 'hot' | 'dropped' | 'booked';
export const LEAD_STATUSES: LeadStatus[] = ['cold', 'warm', 'hot', 'dropped', 'booked'];
/** Blue = Cold, Yellow = Warm, Red = Hot, Gray = Dropped, Green = Booked / Bought (owner's colour rule, 13 Oct 2026).
 *  "Inactive" is no longer a status: records that had it were moved to Dropped (see data/leadReview.ts). */
export const LEAD_COLOURS: Record<LeadStatus, string> = {
  cold: '#3B82F6', warm: '#EAB308', hot: '#EF4444', dropped: '#9CA3AF', booked: '#22C55E',
};

export type ContactRole = 'vendor' | 'landlord' | 'buyer' | 'tenant' | 'investor' | 'professional' | 'other';
/** Vendor (owner / landlord) status — a separate system from the buyer lead colours (owner, 13 Oct 2026). It says
 *  what is waiting with this owner, not how "hot" they are. */
export type VendorStatus = 'pending_info' | 'pending_follow_up' | 'listed' | 'negotiating' | 'on_hold' | 'closed' | 'withdrawn';
export const VENDOR_STATUSES: VendorStatus[] = ['pending_info', 'pending_follow_up', 'listed', 'negotiating', 'on_hold', 'closed', 'withdrawn'];
export const VENDOR_COLOURS: Record<VendorStatus, string> = {
  pending_info: '#F0C060', pending_follow_up: '#E8963A', listed: '#6FD49B', negotiating: '#8EC1F5', on_hold: '#A39883', closed: '#D4AF37', withdrawn: '#6B6558',
};

export const VENDOR_ROLES: ContactRole[] = ['vendor', 'landlord'];
export const BUYER_ROLES: ContactRole[] = ['buyer', 'tenant', 'investor'];
export const CONTACT_ROLES: ContactRole[] = ['vendor', 'landlord', 'buyer', 'tenant', 'investor', 'professional', 'other'];

export type ExpertKey = 'lawyer' | 'banker' | 'financial_advisor' | 'tax_adviser' | 'accountant' | 'valuer' | 'wealth_planner' | 'agent_ai';
export const EXPERTS: ExpertKey[] = ['lawyer', 'banker', 'financial_advisor', 'tax_adviser', 'accountant', 'valuer', 'wealth_planner', 'agent_ai'];

export interface Contact extends Base {
  name: string;
  phone?: string;
  /** WhatsApp username or alias (for example @example). Not a phone number; may exist without one. */
  whatsapp?: string;
  email?: string;
  company?: string;
  roles: ContactRole[];
  /** For professional contacts: which Ask Expert specialist they are. */
  profession?: ExpertKey;
  /** Buyer / tenant lead colour (Cold, Warm, Hot, Dropped, Booked / Bought). */
  leadStatus?: LeadStatus;
  /** Set only when the old status "Inactive" was converted to Dropped, so the original is never lost. */
  previousLeadStatus?: 'inactive';
  /** Set when the owner put a converted buyer back to the retired "Inactive" (Undo in the status review). It stops the
   *  automatic conversion from moving this buyer to Dropped again, on any phone. */
  inactiveKept?: boolean;
  /** Vendor / landlord status (Pending Property Info, Pending Follow-up, …), kept separate from the buyer colours. */
  vendorStatus?: VendorStatus;
  source?: string;
  notes?: string;
  /** Last meaningful interaction (inquiry, viewing, completed task or appointment). Routine edits do not change it. */
  lastInteraction?: number;
}

// ---------- inquiries and viewings ----------
export type InquiryChannel = 'call' | 'whatsapp' | 'walk_in' | 'portal' | 'referral' | 'social' | 'other';
export const INQUIRY_CHANNELS: InquiryChannel[] = ['call', 'whatsapp', 'walk_in', 'portal', 'referral', 'social', 'other'];

/** An enquiry or interaction where no viewing has necessarily happened. */
export interface Inquiry extends Base {
  contactId: string;
  propertyId?: string;
  /** yyyy-mm-ddThh:mm (local time) */
  at: string;
  channel: InquiryChannel;
  message?: string;
  followUpTaskId?: string;
}

export type ApptKind = 'viewing' | 'meeting' | 'site_visit' | 'follow_up' | 'signing' | 'other';
export const APPT_KINDS: ApptKind[] = ['viewing', 'meeting', 'site_visit', 'follow_up', 'signing', 'other'];
/** Scheduled = date and time agreed; Pending = not confirmed yet; Completed (a viewing shows as Viewed); Cancelled. */
export type ApptStatus = 'scheduled' | 'pending' | 'completed' | 'cancelled';
export const APPT_STATUSES: ApptStatus[] = ['scheduled', 'pending', 'completed', 'cancelled'];

export interface Appointment extends Base {
  kind: ApptKind;
  title?: string;
  /** yyyy-mm-ddThh:mm (local time). A pending viewing may not have a time yet. */
  start?: string;
  durationMin?: number;
  status: ApptStatus;
  propertyId?: string;
  contactId?: string;
  place?: string;
  notes?: string;
  outcome?: string;
  /** Minutes before the start at which to remind. */
  reminders: number[];
  /** Kept when a viewing came from an inquiry (the inquiry itself leaves Inquiry History). */
  fromInquiry?: { at: string; channel: InquiryChannel; message?: string };
  completedAt?: number;
}

// ---------- to-do ----------
export type Priority = 'low' | 'medium' | 'high' | 'urgent';
export const PRIORITIES: Priority[] = ['urgent', 'high', 'medium', 'low'];
export interface Task extends Base {
  title: string;
  notes?: string;
  /** yyyy-mm-dd or yyyy-mm-ddThh:mm (local time) */
  due?: string;
  priority: Priority;
  done: boolean;
  completedAt?: number;
  kind: 'task' | 'follow_up';
  propertyId?: string;
  contactId?: string;
  inquiryId?: string;
  appointmentId?: string;
  reminders: number[];
}

// ---------- GPS House Shopping ----------
export interface TrackPoint { lat: number; lng: number; acc: number; t: number }
export interface JourneyPlace { name: string; lat: number; lng: number; at: number }
export interface JourneyMark { id: string; lat: number; lng: number; at: number; propertyId?: string; note?: string }
export interface Journey extends Base {
  title?: string;
  startedAt: number;
  endedAt?: number;
  /** Time spent paused is not counted in the elapsed time. */
  pausedMs: number;
  points: TrackPoint[];
  distanceM: number;
  places: JourneyPlace[];
  marks: JourneyMark[];
  status: 'recording' | 'paused' | 'saved';
}

// ---------- banners (My Banner Location) ----------
/** One "For Sale / For Rent" banner put up for a property: where it stands, when, and a photo of it. A property can
 *  have several (for example one at the gate and one at the main road junction). */
export interface Banner extends Base {
  propertyId: string;
  lat: number;
  lng: number;
  /** GPS accuracy in metres, when the position came from the phone's GPS. */
  acc?: number;
  /** Where the position came from: the phone's GPS at the spot, a tap on Google Maps, or typed in. */
  source: 'gps' | 'map' | 'manual';
  /** yyyy-mm-dd */
  placedOn: string;
  note?: string;
  photoFileId?: string;
  /** yyyy-mm-dd: set when the banner is taken down. The record is kept as history. */
  removedOn?: string;
}

// ---------- Agent Financial ----------
export type DealStatus = 'estimated' | 'confirmed' | 'received';
export const DEAL_STATUSES: DealStatus[] = ['estimated', 'confirmed', 'received'];
export interface Deal extends Base {
  title?: string;
  propertyId?: string;
  contactId?: string;
  side: 'sale' | 'rent';
  /** yyyy-mm-dd: date the deal was closed (or expected). */
  date: string;
  value: number;
  commissionPct?: number;
  /** Total commission for the deal (RM). */
  commission: number;
  /** The agent's own share of the commission, in percent (after agency split). */
  sharePct: number;
  status: DealStatus;
  receivedDate?: string;
  receivedAmount?: number;
  notes?: string;
}
export interface Expense extends Base { date: string; category: string; amount: number; note?: string; propertyId?: string }
export interface Income extends Base { date: string; source: string; amount: number; note?: string }
export interface Target extends Base { period: 'month' | 'year'; key: string; amount: number }

// ---------- Ask Expert ----------
export interface ExpertMessage {
  id: string;
  from: 'me' | 'expert' | 'ai';
  text: string;
  at: number;
  via?: 'whatsapp' | 'manual' | 'ai';
  contactId?: string;
}
export interface ExpertThread extends Base {
  expert: ExpertKey;
  question: string;
  propertyId?: string;
  contactId?: string;
  messages: ExpertMessage[];
}

// ---------- singletons ----------
export interface ShareChoice { regNo: boolean; front: boolean; back: boolean; agency: boolean; phone: boolean; email: boolean }
export interface Profile {
  fullName?: string;
  regType?: string;
  regNo?: string;
  agency?: string;
  phone?: string;
  email?: string;
  photoFileId?: string;
  cardFrontFileId?: string;
  cardBackFileId?: string;
  /** The checkboxes chosen last time a name card was sent; preselected next time. */
  shareDefaults?: ShareChoice;
}

export interface Settings {
  lang: Lang;
  layout: 'grid' | 'large';
  /** Typed in on the phone instead of at build time. Never committed to the code. */
  mapsApiKey?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  expertApiUrl?: string;
  /** Prefix used for the last new property reference. */
  lastPrefix?: string;
  calc?: Record<string, number>;
  /** Map / Satellite / Hybrid, kept for every map screen. */
  mapType?: 'roadmap' | 'satellite' | 'hybrid';
  /** The new-user choice on first start: sample data or a clean workspace (asked once per phone). */
  startChoice?: 'sample' | 'empty';
}

export interface CustomOption { value: string; added: number; used: number }
/** Remembered custom values per dropdown (e.g. township, refPrefix). */
export type OptionLists = Record<string, CustomOption[]>;

export interface Meta {
  /** Reminder keys already shown, so a reminder is never shown twice. */
  fired: string[];
  /** Records changed since the last cloud sync: "collection:id". */
  dirty: string[];
  /** Deleted records not yet removed from the cloud copy: "collection:id". */
  tombstones: string[];
  lastSync?: number;
  syncSession?: {
    accessToken: string; refreshToken: string; expiresAt: number; email: string; userId: string;
    /** From the Google account (via Supabase). */
    name?: string;
    /** Team workspace and role, from the database (eab_my_membership). */
    workspaceId?: string; workspaceName?: string; role?: 'owner' | 'admin' | 'team_leader' | 'agent' | 'limited';
  };
  /** The last automatic sync problem, shown in Settings (cleared after a good sync). */
  syncError?: string;
  /** The person chose to use the app on this phone only, without signing in (only when sign-in is not set up). */
  offlineOnly?: boolean;
  /** The report of buyers whose old "Inactive" status was moved to Dropped, until the owner marks it reviewed.
   *  `undone` lists the ones the owner chose to put back (only those; nothing else is touched). */
  leadReview?: { at: number; ids: string[]; reviewed: boolean; undone?: string[] };
  /** Random name of this phone for the cloud's records of who wrote what. Never shown, never a person's data. */
  deviceId?: string;
  /** The workspace the phone's sync position and cloud copies belong to; a different one starts a fresh position. */
  syncWorkspaceId?: string;
  /** Set once by the first start of a version that knows whose records a phone holds (see Store.open). */
  ownerChecked?: boolean;
  /** Set at that first start when the database ALREADY held real records but no team could be established for them. */
  ownerUnknown?: boolean;
  /** Set at that first start ONLY when the database was completely empty and nobody was signed in: the one state that
   *  positively identifies a genuinely new phone. Without it, real records with no known team are treated as unowned. */
  ownerFresh?: boolean;
  /** Position in the cloud's own change order (not a clock) up to which this phone has taken changes. */
  lastSeq?: number;
  /** Changes that could not be joined automatically. Both versions are kept; nothing is sent for these records
   *  until the person decides (Settings → Sync review). */
  conflicts?: Conflict[];
  /** Records whose last send was refused for a reason other than a conflict, e.g. "denied": "collection:id" → why. */
  recErrors?: Record<string, string>;
}

/** One field that differs between this phone and the cloud. */
export interface FieldConflict { field: string; local: unknown; remote: unknown }
export interface Conflict {
  /** "collection:id" */
  key: string;
  collection: CollectionName;
  id: string;
  at: number;
  /** fields: same field changed on both sides · deleted-remote: deleted elsewhere, edited here · deleted-local: deleted here,
   *  edited elsewhere · reference: the property number is already used by another property. */
  kind: 'fields' | 'deleted-remote' | 'deleted-local' | 'reference';
  fields?: FieldConflict[];
  /** The cloud copy at the time (also kept in the record's history). */
  remote?: { rev: number; data: Record<string, unknown> | null; deleted: boolean };
  ref?: { ref: string; refNo: number; otherRef?: string; otherId?: string; otherTitle?: string; otherVisible: boolean };
}

export interface Collections {
  properties: Listing;
  contacts: Contact;
  inquiries: Inquiry;
  appointments: Appointment;
  tasks: Task;
  journeys: Journey;
  deals: Deal;
  expenses: Expense;
  incomes: Income;
  targets: Target;
  expertThreads: ExpertThread;
  banners: Banner;
}
export type CollectionName = keyof Collections;
export const COLLECTIONS: CollectionName[] = [
  'properties', 'contacts', 'inquiries', 'appointments', 'tasks', 'journeys', 'deals', 'expenses', 'incomes', 'targets', 'expertThreads', 'banners',
];

export interface Singletons { profile: Profile; settings: Settings; options: OptionLists; meta: Meta }
export type SingletonName = keyof Singletons;

export type AppState = { [K in CollectionName]: Collections[K][] } & Singletons;
