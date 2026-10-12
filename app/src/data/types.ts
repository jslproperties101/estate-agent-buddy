// Record types for everything the app keeps. The property record (Listing) lives in listing/model.ts.
// Every record has an id made on the device, so records created offline never collide when synced later.
import type { Listing } from '../listing/model';
import type { Lang } from '../i18n';

export interface Base { id: string; created: number; updated: number; sample?: boolean }

// ---------- contacts and leads ----------
export type LeadStatus = 'cold' | 'warm' | 'hot' | 'dropped' | 'inactive';
export const LEAD_STATUSES: LeadStatus[] = ['cold', 'warm', 'hot', 'dropped', 'inactive'];
/** Blue = Cold, Yellow = Warm, Red = Hot, Green = Dropped, Gray = Inactive (owner's colour rule). */
export const LEAD_COLOURS: Record<LeadStatus, string> = {
  cold: '#3B82F6', warm: '#EAB308', hot: '#EF4444', dropped: '#22C55E', inactive: '#9CA3AF',
};

export type ContactRole = 'vendor' | 'landlord' | 'buyer' | 'tenant' | 'investor' | 'professional' | 'other';
export const VENDOR_ROLES: ContactRole[] = ['vendor', 'landlord'];
export const BUYER_ROLES: ContactRole[] = ['buyer', 'tenant', 'investor'];
export const CONTACT_ROLES: ContactRole[] = ['vendor', 'landlord', 'buyer', 'tenant', 'investor', 'professional', 'other'];

export type ExpertKey = 'lawyer' | 'banker' | 'financial_advisor' | 'tax_adviser' | 'accountant' | 'valuer' | 'wealth_planner' | 'agent_ai';
export const EXPERTS: ExpertKey[] = ['lawyer', 'banker', 'financial_advisor', 'tax_adviser', 'accountant', 'valuer', 'wealth_planner', 'agent_ai'];

export interface Contact extends Base {
  name: string;
  phone?: string;
  email?: string;
  company?: string;
  roles: ContactRole[];
  /** For professional contacts: which Ask Expert specialist they are. */
  profession?: ExpertKey;
  leadStatus?: LeadStatus;
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
  syncSession?: { accessToken: string; refreshToken: string; expiresAt: number; email: string; userId: string };
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
}
export type CollectionName = keyof Collections;
export const COLLECTIONS: CollectionName[] = [
  'properties', 'contacts', 'inquiries', 'appointments', 'tasks', 'journeys', 'deals', 'expenses', 'incomes', 'targets', 'expertThreads',
];

export interface Singletons { profile: Profile; settings: Settings; options: OptionLists; meta: Meta }
export type SingletonName = keyof Singletons;

export type AppState = { [K in CollectionName]: Collections[K][] } & Singletons;
