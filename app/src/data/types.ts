// Record types for everything the app keeps. The property record (Listing) lives in listing/model.ts.
import type { Project } from '../projects/model';
// Every record has an id made on the device, so records created offline never collide when synced later.
import type { Listing } from '../listing/model';
import type { Lang } from '../i18n';
import type { PurchaseInput, RentalInput, SaleInput } from '../domain/calculator';

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
  /** What a buyer / tenant / investor is looking for. A buyer can have several (for example a factory and a house). */
  requirements?: BuyerRequirement[];
  /** Change 013: properties the agent saved as matches for this buyer (a recommendation only; nothing is ever sent).
   *  Kept on the buyer's own record, so it syncs and is backed up with it; older records simply have none. */
  savedMatches?: SavedMatch[];
}

/** One saved buyer ↔ property match: which property, and when it was saved. */
export interface SavedMatch { propertyId: string; at: number }

export type FinancingState = 'cash' | 'approved' | 'in_progress' | 'not_started' | 'unknown';
export const FINANCING_STATES: FinancingState[] = ['cash', 'approved', 'in_progress', 'not_started', 'unknown'];
/** One thing a buyer wants. Every field is optional: only what is filled in is used when matching properties. */
export interface BuyerRequirement {
  id: string;
  /** A short name the agent gives it, e.g. "Factory for the logistics business". */
  label?: string;
  purpose?: 'sale' | 'rent' | 'sale_or_rent';
  /** Property types (as in the property list: "Semi-D factory", "Terrace house"…). Any one of them fits. */
  types?: string[];
  /** Township / city / state words; a property in any one of them fits. */
  areas?: string[];
  /** Price for a purchase, or monthly rent for a tenant. */
  budgetMin?: number;
  budgetMax?: number;
  bedroomsMin?: number;
  landMinSqft?: number;
  builtUpMinSqft?: number;
  tenure?: 'freehold' | 'leasehold';
  /** How many next-door units must be available together. Never verifiable from the records alone. */
  adjoiningUnits?: number;
  financing?: FinancingState;
  notes?: string;
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
/** JoyChange007: what the agent saw at a marked spot. `note` holds the comments. Older marks have none of the banner fields. */
export type BannerKind = 'agent' | 'owner' | 'maybe_owner';
export interface JourneyMark {
  id: string; lat: number; lng: number; at: number; propertyId?: string; note?: string;
  bannerType?: BannerKind; bannerPhone?: string; purpose?: 'sale' | 'rent' | 'sale_or_rent'; salePrice?: number; rentPrice?: number;
}
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
  /** JoyChange007: the neighbourhood (or township / town) shown on the journey card, found once when the journey stops. */
  area?: string;
  /** JoyChange007: the route following the roads (Google Roads API, sent in batches of up to 100 thinned points). */
  snapped?: { lat: number; lng: number }[];
  /** How many of the thinned points have been sent for snapping so far. */
  snapDone?: number;
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
  /** Where this banner stood before each later change of its position (oldest first), so a correction never erases the earlier place. */
  moves?: BannerMove[];
}
export interface BannerMove { id: string; /** when the position was changed (ms) */ at: number; lat: number; lng: number; acc?: number; source: Banner['source'] }

// ---------- Property Calculator: saved calculations ----------
export type CalcKind = 'purchase' | 'rental' | 'sale' | 'commission';
export const CALC_KINDS: CalcKind[] = ['purchase', 'rental', 'sale', 'commission'];
export interface CommissionInput { value: number; pct: number; sst: boolean }
/** One saved calculation: every input as the agent had it, and the rates used at that time (so an old result never
 *  changes when the rates under Assumptions are edited later). Results are always recalculated from these. */
export interface Calculation extends Base {
  kind: CalcKind;
  title?: string;
  propertyId?: string;
  contactId?: string;
  purchase: PurchaseInput;
  rental: RentalInput;
  sale: SaleInput;
  commission: CommissionInput;
  /** The rates under Assumptions at the time (flat numbers, see calculator/saved.ts). */
  rates: Record<string, number>;
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
  /** MainForAdmin-B (JoyChange005-Main Part2 Change C): the Terms version this account accepted on this phone, and an
   *  answer still waiting to reach the database (made offline). */
  termsAccepted?: { version: string; user: string; at: number };
  termsPending?: { version: string; marketing: boolean; user: string; at: number };
  /** A marketing on / off choice made in Settings that has not reached the database yet. */
  marketingPending?: { on: boolean; user: string };
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
  /** JoyChange002 Change 46: the country chosen at first login (the Country of new properties), the account it belongs to,
   *  and whether it still has to be saved on the account (it was chosen offline or the save failed). */
  country?: string; countryUser?: string; countryPending?: boolean;
  /** Remind about contacts with no interaction for this many days; 0 = off. Default 30. Never changes a contact. */
  followUpDays?: number;
  /** Change 010: which workspace the lists show (switching needs no sign-out). Team only while in a Team Workspace. */
  workspaceView?: 'personal' | 'team';
  /** Change 010 Q120: the Export Management section used last (Saved Exports or Deleted Exports). */
  exportSection?: 'saved' | 'deleted';
}

export interface CustomOption { value: string; added: number; used: number }
/** Remembered custom values per dropdown (e.g. township, refPrefix). */
export type OptionLists = Record<string, CustomOption[]>;

export interface Meta {
  /** JoyChange002 Change 25: this phone's push address as last registered, and for whom, so it is sent again only when it changes. */
  push?: { token: string; userId: string; lang: string };
  /** Reminder keys already shown, so a reminder is never shown twice. */
  fired: string[];
  /** Records changed since the last cloud sync: "collection:id". */
  dirty: string[];
  /** Deleted records not yet removed from the cloud copy: "collection:id". */
  tombstones: string[];
  lastSync?: number;
  /** When the last whole-app backup file was made / the last restore was applied on this phone. */
  lastBackupAt?: number;
  lastRestoreAt?: number;
  /** Google Drive backup access: a short-lived Google token kept only on this phone (never in a backup file or the cloud). */
  drive?: { token: string; expiresAt: number; connectedAt: number };
  driveLastOkAt?: number;
  /** Change 23: restore points made since the last full re-check of every file */
  driveFastRuns?: number;
  driveLast?: { at: number; ok: boolean; error?: string; copies?: number; fileName?: string };
  /** Change 006 Layer 2: the last update of the readable Drive folders (status, and how many items wait or failed). */
  driveTree?: { at: number; ok: boolean; status?: 'complete' | 'partial'; waiting?: number; failed?: number; editedOutside?: number; error?: string };
  syncSession?: {
    accessToken: string; refreshToken: string; expiresAt: number; email: string; userId: string;
    /** From the Google account (via Supabase). */
    name?: string;
    /** JoyChange002 Change 46: the country chosen at first login, kept on the account. */
    country?: string;
    /** Team workspace and role, from the database (eab_my_membership). */
    workspaceId?: string; workspaceName?: string; role?: 'owner' | 'admin' | 'team_leader' | 'agent' | 'limited';
    /** MainForAdmin-B: when this sign-in happened on this phone (a forced sign-out applies to sign-ins before it). */
    signedInAt?: number;
  };
  /** MainForAdmin-B: why the agent was signed out by the company (suspended / banned / closed / forced), with the support
   *  contact to show on the sign-in screen. Cleared by the next good sign-in. */
  accountBlock?: { status: 'suspended' | 'banned' | 'closed' | 'forced'; reason?: string; supportEmail?: string; address?: string; at: number };
  /** MainForAdmin-B: the account as the company's database last reported it (eab_my_account). */
  account?: { userId: string; terms?: { version: string; at: string } | null; marketing?: boolean | null; licence?: { type?: string | null; number?: string | null; verified?: boolean } | null;
    companyName?: string; supportEmail?: string | null; address?: string | null; checkedAt: number };
  /** MainForAdmin-D: the last feed the database gave this account (Market News, pushed Projects, announcements). */
  feed?: { userId: string; lang: string; items: import('../feed/feed').FeedItem[]; at: number };
  /** JoyChange010-04: files shared into the app from WhatsApp or another app, waiting in the Shared Documents tray
   *  (this phone only; moved into a property's document folder by the agent). */
  sharedInbox?: import('../share/inbox').SharedFile[];
  /** MainForAdmin-D: read / acknowledged / closed marks made on this phone and not yet sent. */
  feedMarks?: { id: string; what: 'opened' | 'acknowledged' | 'dismissed'; at: string; userId: string }[];
  /** MainForAdmin-D: force update and maintenance mode as last heard from the company's database. */
  publicSettings?: import('../feed/feed').PublicSettings;
  /** MainForAdmin-E: the feature switches Admin EAB set for this account, as last heard (eab_my_flags). */
  flags?: import('../feed/flags').FlagCache;
  /** MainForAdmin-D: the minimum version whose soft "please update" notice was closed on this phone. */
  softUpdateClosed?: string;
  /** MainForAdmin-B: the licence last sent to the database ("TYPE|number|user"), so it is sent only when it changed. */
  licenceSent?: string;
  /** MainForAdmin-F: the Contact number last sent to the database ("user|number"), so it is sent only when it changed. */
  phoneSent?: string;
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
  /** Change 010: my Team Workspace as the cloud last described it (eab_team_status). Absent = no Team Workspace known. */
  team?: TeamState;
  /** Change 13: which invitation alerts the phone has already announced (so each is announced once), and which
   *  "accepted / declined" notes I have read. Ids only. */
  inviteAlerts?: { notified: string[]; seenAnswers: string[] };
  /** Change 010: records another agent shares with me right now ("collection:id" → owner and my access). Everything
   *  NOT listed here is my own record. Kept up to date by every sync; an entry disappears the moment access ends. */
  shared?: Record<string, SharedInfo>;
  /** Change 010: position in the cloud's audit-history order up to which this phone has taken entries. */
  lastAuditSeq?: number;
  /** JoyChange003 Change 72: notifications the person dismissed (kept as History) or snoozed with "Remind me later". This phone only. */
  notifs?: { dismissed: Record<string, { at: number; title: string }>; snoozed: Record<string, number> };
  /** JoyChange003 Change 51 (Batch B2): the account whose remembered values this phone holds, the position in the cloud's
   *  change order up to which they were taken, and the changes made here that wait to be sent (data/optionSync.ts). */
  optSync?: { userId?: string; since: number; pending: Record<string, { list: string; value: string; deleted: boolean; added: number; used: number; updated: number }> };
  /** JoyChange003 Change 62: the last 10 commands on the AI Assisted Command screen (this phone only). */
  recentCmds?: string[];
}

// ---------- Change 010: Team Workspace and sharing ----------
export type ShareLevel = 'view' | 'edit';
/** Share All categories. Calculator and every other kind of record are never shared. */
export type ShareScope = 'properties' | 'buyers' | 'vendors' | 'tasks' | 'appointments';
export const SHARE_SCOPES: ShareScope[] = ['properties', 'buyers', 'vendors', 'tasks', 'appointments'];
export interface TeamMember { userId: string; email: string; name?: string; joinedAt?: string }
export interface TeamInvite { id: string; email?: string | null; fromEmail?: string; fromName?: string | null; createdAt: string; expiresAt: string }
/** Change 13: an invitation I sent that the other agent answered (told to me by the cloud for 7 days). */
export interface TeamAnswer { id: string; status: 'accepted' | 'declined'; email?: string | null; name?: string | null; answeredAt: string }
export interface DeleteRequest { id: string; workspaceId: string; collection: CollectionName; recordId: string; ownerId: string; requesterId: string; createdAt: string }
export interface TeamState {
  /** Absent when I am in no Team Workspace (invitations for me may still be listed). */
  id?: string;
  /** The agent who created the Team Workspace (the "team owner"). */
  createdBy?: string;
  createdAt?: string;
  members: TeamMember[];
  invitesSent: TeamInvite[];
  invitesForMe: TeamInvite[];
  /** Change 13: invitations I sent that were accepted or declined in the last 7 days. */
  invitesAnswered?: TeamAnswer[];
  sharesGiven: { workspaceId: string; collection: CollectionName; recordId: string; level: ShareLevel }[];
  shareAllGiven: { scope: ShareScope; level: ShareLevel }[];
  shareAllReceived: { scope: ShareScope; level: ShareLevel; ownerId: string }[];
  /** JoyChange010-05: my "Include confidential documents" switches that are on: for Share All, and per property ("workspace:id"). */
  confidential?: { all: boolean; records: string[] };
  deleteRequests: DeleteRequest[];
  /** When this was read from the cloud (ms). */
  at: number;
}
/** A record that another agent owns and shares with me. */
export interface SharedInfo { workspaceId: string; ownerId: string; ownerEmail: string; ownerName?: string | null; level: ShareLevel }

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
  calculations: Calculation;
  /** JoyChange002: new developments (projects/model.ts). */
  projects: Project;
}
export type CollectionName = keyof Collections;
export const COLLECTIONS: CollectionName[] = [
  'properties', 'contacts', 'inquiries', 'appointments', 'tasks', 'journeys', 'deals', 'expenses', 'incomes', 'targets', 'expertThreads', 'banners', 'calculations', 'projects',
];

export interface Singletons { profile: Profile; settings: Settings; options: OptionLists; meta: Meta }
export type SingletonName = keyof Singletons;

export type AppState = { [K in CollectionName]: Collections[K][] } & Singletons;
