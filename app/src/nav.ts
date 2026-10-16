// Every screen in the app and what it needs to open. App.tsx draws the current screen; others call go(...).
import type { Filters, Listing } from './listing/model';
import type { ApptKind, CollectionName, ExpertKey, Task } from './data/types';

export type FormSection =
  | 'basics' | 'tenure' | 'photos' | 'location' | 'details' | 'specs' | 'money' | 'tenancy' | 'availability'
  | 'owner' | 'arrangement' | 'banner' | 'marketing' | 'notes' | 'docs';

export type Screen =
  | { name: 'home' }
  | { name: 'notifications' }
  | { name: 'contactsHome' }
  | { name: 'opportunities' }
  | { name: 'listing'; filters?: Filters }
  | { name: 'listingDetail'; id: string }
  | { name: 'listingForm'; id?: string; prefill?: Partial<Listing>; section?: FormSection }
  | { name: 'contacts'; role: 'vendor' | 'buyer' }
  | { name: 'contactDetail'; id: string }
  | { name: 'contactForm'; id?: string; role?: 'vendor' | 'buyer' | 'professional'; prefill?: { name?: string; phone?: string } }
  | { name: 'activity'; propertyId?: string; contactId?: string; tab?: 'inquiries' | 'viewings' }
  | { name: 'inquiryForm'; id?: string; propertyId?: string; contactId?: string }
  | { name: 'apptForm'; id?: string; kind?: ApptKind; propertyId?: string; contactId?: string; date?: string; time?: string; title?: string }
  | { name: 'todo' }
  | { name: 'taskForm'; id?: string; prefill?: Partial<Task> }
  | { name: 'calendar'; date?: string }
  | { name: 'gps' }
  | { name: 'houseShopping' }
  | { name: 'journey'; id: string }
  | { name: 'propertyMap'; id?: string }
  | { name: 'banners'; propertyId?: string }
  | { name: 'finance' }
  | { name: 'dealForm'; id?: string; propertyId?: string }
  | { name: 'expenseForm'; id?: string }
  | { name: 'incomeForm'; id?: string }
  | { name: 'calculator'; propertyId?: string }
  | { name: 'buyerPdf'; propertyId: string }
  | { name: 'adTracker'; propertyId: string }
  | { name: 'adSummary' }
  | { name: 'photoStudio'; propertyId: string; photoId?: string }
  | { name: 'marketingStudio'; propertyId: string }
  | { name: 'profile' }
  | { name: 'profileEdit' }
  | { name: 'nameCard' }
  | { name: 'settings' }
  | { name: 'bugReport'; from?: string }
  | { name: 'syncReview' }
  | { name: 'history'; collection: CollectionName; id: string }
  | { name: 'recentlyDeleted' }
  | { name: 'expert' }
  | { name: 'expertAsk'; expert: ExpertKey; propertyId?: string }
  | { name: 'expertThread'; id: string }
  | { name: 'voice' }
  | { name: 'voiceDiag' }
  | { name: 'comingSoon'; key: 'subsale' | 'project' | 'market' | 'cobrokeMap' }
  | { name: 'cobroke' }
  // Changes 011–013
  | { name: 'creativeMedia'; propertyId?: string }
  | { name: 'buyerHistory'; propertyId: string }
  | { name: 'buyerMatching' }
  | { name: 'buyerMatches'; contactId: string }
  // Change 010
  | { name: 'team' }
  | { name: 'manageSharing'; focus?: string }
  | { name: 'auditSearch'; collection?: CollectionName; id?: string }
  | { name: 'exports'; section?: 'saved' | 'deleted' }
  | { name: 'auditExport'; keys: string[]; person?: string; actions?: ('edit' | 'delete' | 'restore' | 'permission' | 'membership' | 'export')[] };

/** Opens a screen. With replace, the current screen is not kept for Back (used after saving a form). */
export type Go = (s: Screen, opts?: { replace?: boolean }) => void;
