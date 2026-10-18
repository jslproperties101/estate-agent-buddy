// Invented sample records for trying the app out. They are added only when the agent chooses "Populate with Sample
// Data" on first start, or taps "Load sample data" in Settings. Every one is marked sample (and "(sample)" in its
// name), is shown with a Sample tag, is never sent to the cloud (data/sync.ts), and "Remove sample data" deletes
// them all again. Sample properties have NO map position: the map only ever shows positions the agent really saved.
import type { Listing, Marketing } from '../listing/model';
import type { Store } from './store';
import { COLLECTIONS, type Appointment, type Contact, type Deal, type Expense, type Inquiry, type Task } from './types';
import { addDays, startOfDay, ymd } from '../lib/dates';

const noAds: Marketing = { advertised: 'no', ads: [], custom: {} };

export function sampleData(now = Date.now()) {
  const day = (n: number) => ymd(addDays(startOfDay(new Date(now)), n));
  const at = (n: number, hm: string) => `${day(n)}T${hm}`;
  const base = { created: now, updated: now, sample: true };
  const mk = (id: string, no: number, x: Partial<Listing>): Listing => ({ id, ...base, photos: [], ref: `P${no}`, refPrefix: 'P', refNo: no, country: 'Malaysia', ...x });
  const NS = 'Negeri Sembilan', SEL = 'Selangor';

  const properties: Listing[] = [
    mk('s1', 1001, {
      unitNo: 'No. 7, Lot 2/14', purpose: 'sale', type: 'Semi-D factory',
      state: NS, city: 'Nilai', township: 'Kawasan Perindustrian Nilai', street: 'Jalan Sampel Industri 1',
      landSqft: 8000, builtUpSqft: 6500, frontageFt: 60, depthFt: 133, floors: 2, parking: 4, ceilingFt: 28, powerKva: 150, loadingBays: 1,
      lotType: 'corner', tenure: 'freehold', titleType: 'Individual title', landUse: 'industry', restriction: 'NON Bumiputera',
      askingPrice: 3200000, negotiable: 'yes', commissionPct: 2, maintenanceFee: 350, availability: 'immediate', condition: 'good',
      status: 'available', vendorId: 'v1', arrangement: 'direct',
      notes: 'Owner open to offers. Keys with guard house.',
      extraComments: 'Sample comment: side land can take a 40 ft container.\nAsk the guard house for the key (sample).',
      verification: { tenure: 'confirmed', titleType: 'confirmed', landSqft: 'confirmed', builtUpSqft: 'check', frontageFt: 'confirmed', ownerPhone: 'confirmed' },
      marketing: { advertised: 'yes', ads: [
        { id: 'a1', platform: 'PropertyGuru', start: day(-40), end: day(50), ref: 'PG-sample-001', status: 'live' },
        { id: 'a2', platform: 'Facebook Marketplace', start: day(-30), status: 'needs_update', notes: 'Price changed; update the post.' },
      ], custom: {} },
      documents: [{ id: 'd1', category: 'brochure', name: 'Unit 7 brochure (sample).pdf', added: now }],
    }),
    mk('s2', 1002, {
      unitNo: 'No. 6', purpose: 'sale', type: 'Semi-D factory',
      state: NS, city: 'Nilai', township: 'Kawasan Perindustrian Nilai', street: 'Jalan Sampel Industri 1', landSqft: 8000, builtUpSqft: 6200, parking: 3,
      lotType: 'intermediate', tenure: 'freehold', askingPrice: 3050000, negotiable: 'no', commissionPct: 2, availability: 'immediate',
      status: 'in_progress', verification: { tenure: 'check', builtUpSqft: 'owner', landSqft: 'check' }, vendorId: 'v2', arrangement: 'cobroke', cobroke: { name: 'Agent M (sample)', agency: 'Agency M (sample)' }, marketing: noAds,
    }),
    mk('s3', 1003, {
      unitNo: 'Lot 21', purpose: 'sale', type: 'Detached factory',
      street: 'Jalan Sampel Industri 5', state: NS, city: 'Nilai', township: 'Kawasan Perindustrian Nilai', landSqft: 43560, builtUpSqft: 20000, parking: 10,
      ceilingFt: 35, powerKva: 400, loadingBays: 2, lotType: 'single', tenure: 'leasehold', leaseExpiryYear: 2077, titleType: 'Individual title', landUse: 'industry',
      askingPrice: 7800000, availability: 'immediate', status: 'needs_check', verification: { tenure: 'check', leaseExpiryYear: 'check', titleType: 'check' }, vendorId: 'v3', arrangement: 'referral', arrangementNote: 'Referred by Banker R (sample)', marketing: noAds,
    }),
    mk('s4', 1004, {
      unitNo: 'No. 18', purpose: 'sale', type: 'Terrace house',
      state: NS, city: 'Nilai', township: 'Bandar Baru Nilai', street: 'Jalan Sampel 3/1', bedrooms: 4, bathrooms: 3, floors: 2, parking: 2,
      landSqft: 1540, builtUpSqft: 1800, frontageFt: 22, depthFt: 70, lotType: 'intermediate', tenure: 'freehold', landUse: 'building', furnishing: 'partly', condition: 'renovated',
      askingPrice: 580000, negotiable: 'yes', commissionPct: 3, availability: 'immediate', status: 'available', vendorId: 'v4', arrangement: 'direct',
      notes: 'Owner wants to sell urgently.', extraComments: 'Sample comment: new roof tiles in 2024 (owner stated).', verification: { bedrooms: 'confirmed', condition: 'owner', furnishing: 'check' }, marketing: { advertised: 'yes', ads: [{ id: 'a3', platform: 'Mudah', start: day(-10), status: 'live' }], custom: {} },
    }),
    mk('s5', 1005, {
      unitNo: 'No. 2', purpose: 'sale', type: 'Semi-D house',
      state: SEL, city: 'Salak Tinggi', township: 'Bandar Baru Salak Tinggi', street: 'Jalan Sampel Seri 8', bedrooms: 5, bathrooms: 4, floors: 2, parking: 3,
      landSqft: 3200, builtUpSqft: 2900, lotType: 'end', tenure: 'leasehold', leaseExpiryYear: 2105, askingPrice: 950000, status: 'sold', availability: 'not_available', vendorId: 'v5', marketing: noAds,
    }),
    mk('s6', 1006, {
      unitNo: 'No. 10', purpose: 'sale_or_rent', type: 'Shoplot',
      state: SEL, city: 'Sepang', street: 'Jalan Sampel Niaga 1', floors: 3, builtUpSqft: 4200, landSqft: 1650, lotType: 'corner', bathrooms: 3,
      tenure: 'leasehold', leaseExpiryYear: 2094, askingPrice: 1200000, monthlyRent: 6500, rentCommissionMonths: 1, securityDepositMonths: 2, utilityDepositMonths: 0.5,
      availability: 'tenanted', tenancy: { tenant: 'Tenant T (sample)', start: '2025-07', end: '2027-06', rent: 6000 }, status: 'rented', vendorId: 'v6', marketing: noAds,
      notes: 'Ground floor tenanted until June 2027.',
    }),
    mk('s7', 1007, {
      unitNo: 'Lot 501', purpose: 'sale', type: 'Agricultural land',
      state: NS, city: 'Labu', street: 'Jalan Sampel Ladang', landSqft: 217800, tenure: 'freehold', landUse: 'agriculture', currentUse: 'Oil palm (mature)', roadAccess: 'Tar road frontage',
      askingPrice: 1100000, availability: 'immediate', status: 'available', vendorId: 'v7', marketing: noAds,
    }),
    mk('s8', 1008, {
      unitNo: 'B-12-3', purpose: 'rent', type: 'Condo / apartment',
      state: NS, city: 'Nilai', township: 'Putra Nilai', street: 'Residensi Sampel', bedrooms: 3, bathrooms: 2, parking: 2, builtUpSqft: 1100,
      furnishing: 'fully', condition: 'good', tenure: 'leasehold', leaseExpiryYear: 2112, titleType: 'Strata title', monthlyRent: 1800, rentCommissionMonths: 1, securityDepositMonths: 2, utilityDepositMonths: 0.5, maintenanceFee: 320,
      availability: 'from_date', availableFrom: day(60).slice(0, 7), status: 'available', vendorId: 'v8', arrangement: 'direct',
      marketing: { advertised: 'yes', ads: [{ id: 'a4', platform: 'iProperty', start: day(-5), status: 'live', ref: 'IP-sample-118' }], custom: {} },
    }),
    mk('s9', 1009, {
      unitNo: 'Lot 900', purpose: 'sale', type: 'Development land',
      street: 'Jalan Sampel Enstek', state: NS, city: 'Nilai', township: 'Bandar Enstek', landSqft: 522720, tenure: 'freehold', landUse: 'building', zoning: 'Mixed development (to check with council)',
      roadAccess: 'Main road frontage', askingPrice: 15700000, availability: 'immediate', status: 'available', vendorId: 'v9', arrangement: 'cobroke', arrangementNote: 'Co-broke with Agency P (sample)', marketing: noAds,
    }),
    mk('s10', 1010, {
      unitNo: 'No. 4', purpose: 'rent', type: 'Detached factory',
      state: SEL, city: 'Salak Tinggi', street: 'Jalan Sampel Logistik 1', landSqft: 30000, builtUpSqft: 22000, ceilingFt: 40, powerKva: 300, loadingBays: 4, parking: 8,
      tenure: 'leasehold', leaseExpiryYear: 2085, monthlyRent: 33000, rentCommissionMonths: 2, securityDepositMonths: 3, utilityDepositMonths: 1, availability: 'immediate', condition: 'good', status: 'available', vendorId: 'v10', marketing: noAds,
    }),
  ];

  const c = (id: string, name: string, roles: Contact['roles'], x: Partial<Contact> = {}): Contact => ({ id, ...base, name, roles, ...x });
  const contacts: Contact[] = [
    c('v1', 'Owner A (sample)', ['vendor'], { phone: '+60 12-345 6789', vendorStatus: 'listed' }),
    c('v2', 'Owner B (sample)', ['vendor'], { phone: '+60 13-210 4455', vendorStatus: 'negotiating' }),
    c('v3', 'Owner E (sample)', ['vendor'], { phone: '+60 17-888 1200', vendorStatus: 'pending_info', notes: 'Waiting for the title copy and the latest quit rent receipt.' }),
    c('v4', 'Encik Ahmad (sample)', ['vendor'], { phone: '+60 19-222 3344', vendorStatus: 'pending_follow_up', notes: 'Call back after Buyer L views the house.' }),
    c('v5', 'Puan Siti (sample)', ['vendor'], { phone: '+60 16-555 0101', vendorStatus: 'closed' }),
    c('v6', 'Mr Lim (sample)', ['vendor', 'landlord'], { phone: '+60 12-700 8811', vendorStatus: 'listed' }),
    c('v7', 'Owner F (sample)', ['vendor'], { whatsapp: '@ownerF_sample', vendorStatus: 'pending_info', notes: 'Phone number not given yet; land search pending.' }),
    c('v8', 'Ms Tan (sample)', ['landlord'], { phone: '+60 11-2233 4455', vendorStatus: 'listed' }),
    c('v9', 'Syarikat G Sdn Bhd (sample)', ['vendor'], { phone: '+60 3-8888 1234', vendorStatus: 'on_hold', company: 'Syarikat G Sdn Bhd (sample)' }),
    c('v10', 'Owner H (sample)', ['landlord'], { phone: '+60 14-909 3030', vendorStatus: 'pending_follow_up' }),
    c('b1', 'Buyer K (sample)', ['buyer'], { phone: '+60 12-111 2222', whatsapp: '@buyerK_sample', leadStatus: 'hot', source: 'PropertyGuru',
      requirements: [{ id: 'rq-b1', label: 'Family home (sample)', purpose: 'sale', types: ['Terrace house', 'Semi-D house'], areas: ['Salak Tinggi', 'Sepang'], budgetMax: 1000000, bedroomsMin: 4 }] }),
    c('b2', 'Buyer L (sample)', ['buyer'], { phone: '+60 13-333 4444', leadStatus: 'warm', source: 'Referral' }),
    c('b3', 'Tenant M (sample)', ['tenant'], { phone: '+60 17-555 6666', leadStatus: 'cold', source: 'Mudah' }),
    c('b4', 'Investor N (sample)', ['investor'], { phone: '+60 19-777 8888', leadStatus: 'dropped' }),
    c('b5', 'Buyer O (sample)', ['buyer'], { leadStatus: 'booked' }),
    c('b6', 'Tenant R (sample)', ['tenant'], { phone: '+60 16-404 5050', leadStatus: 'hot', source: 'Facebook', notes: 'Needs a 20,000 sq ft factory near KLIA within 2 months.',
      requirements: [{ id: 'rq-b6', label: 'Factory near KLIA (sample)', types: ['Terrace factory', 'Semi-D factory', 'Detached factory', 'Warehouse'], landMinSqft: 20000, adjoiningUnits: 2 }] }),
    c('e1', 'Lawyer P (sample)', ['professional'], { profession: 'lawyer', phone: '+60 3-2222 1111', company: 'Messrs P & Co (sample)' }),
    c('e2', 'Banker Q (sample)', ['professional'], { profession: 'banker', phone: '+60 12-999 0000', company: 'Bank Q (sample)' }),
  ];

  const inquiries: Inquiry[] = [
    { id: 'i1', ...base, contactId: 'b2', propertyId: 's4', at: at(-1, '20:15'), channel: 'whatsapp', message: 'Is the price negotiable? Can view on Saturday?' },
    { id: 'i2', ...base, contactId: 'b3', propertyId: 's8', at: at(-3, '10:05'), channel: 'portal', message: 'Asked about move-in date and parking.' },
    { id: 'i3', ...base, contactId: 'b6', propertyId: 's10', at: at(0, '09:40'), channel: 'call', message: 'Wants to view the Salak Tinggi factory this week; asked about loading bays.' },
  ];
  const appointments: Appointment[] = [
    { id: 'ap1', ...base, kind: 'viewing', status: 'scheduled', start: at(1, '11:00'), durationMin: 45, propertyId: 's1', contactId: 'b1', reminders: [1440, 60], notes: 'Bring the brochure.' },
    { id: 'ap2', ...base, kind: 'viewing', status: 'completed', start: at(-9, '15:00'), propertyId: 's1', contactId: 'b1', reminders: [], outcome: 'Liked the side land; asked about power upgrade.', completedAt: now },
    { id: 'ap3', ...base, kind: 'meeting', status: 'pending', start: at(4, '14:30'), contactId: 'e1', title: 'SPA review with lawyer (sample)', reminders: [4320, 1440] },
    { id: 'ap4', ...base, kind: 'viewing', status: 'pending', start: at(2, '10:30'), propertyId: 's10', contactId: 'b6', reminders: [60], notes: 'Confirm the time with Owner H first.' },
    { id: 'ap5', ...base, kind: 'site_visit', status: 'scheduled', start: at(0, '16:00'), durationMin: 60, propertyId: 's3', contactId: 'v3', title: 'Site visit and photos (sample)', reminders: [60] },
  ];
  const tasks: Task[] = [
    { id: 't1', ...base, title: 'Send updated brochure to Buyer K (sample)', due: day(0), priority: 'high', done: false, kind: 'follow_up', contactId: 'b1', propertyId: 's1', reminders: [0] },
    { id: 't2', ...base, title: 'Update Facebook Marketplace price (sample)', due: day(-1), priority: 'medium', done: false, kind: 'task', propertyId: 's1', reminders: [] },
    { id: 't3', ...base, title: 'Collect keys from Owner B (sample)', due: day(3), priority: 'low', done: false, kind: 'task', propertyId: 's2', contactId: 'v2', reminders: [1440] },
    { id: 't5', ...base, title: 'Get title copy and quit rent receipt from Owner E (sample)', due: day(1), priority: 'high', done: false, kind: 'follow_up', contactId: 'v3', propertyId: 's3', reminders: [60] },
    { id: 't6', ...base, title: 'Call Encik Ahmad after the viewing (sample)', due: `${day(2)}T18:00`, priority: 'medium', done: false, kind: 'follow_up', contactId: 'v4', propertyId: 's4', reminders: [30] },
    { id: 't4', ...base, title: 'Call Puan Siti about SPA date (sample)', due: day(-4), priority: 'medium', done: true, completedAt: now, kind: 'follow_up', contactId: 'v5', reminders: [] },
  ];
  const deals: Deal[] = [
    { id: 'dl1', ...base, title: 'Semi-D, Bandar Baru Salak Tinggi (sample)', propertyId: 's5', side: 'sale', date: day(-20), value: 950000, commissionPct: 2.5, commission: 23750, sharePct: 70, status: 'received', receivedDate: day(-5), receivedAmount: 16625 },
    { id: 'dl2', ...base, title: 'Shoplot tenancy, Sepang (sample)', propertyId: 's6', side: 'rent', date: day(-12), value: 6000, commission: 6000, sharePct: 70, status: 'confirmed' },
    { id: 'dl3', ...base, title: 'Semi-D factory, Unit 6 (sample)', propertyId: 's2', side: 'sale', date: day(30), value: 3050000, commissionPct: 2, commission: 61000, sharePct: 50, status: 'estimated' },
  ];
  const expenses: Expense[] = [
    { id: 'x1', ...base, date: day(-2), category: 'Advertising', amount: 150, note: 'PropertyGuru credits (sample)' },
    { id: 'x2', ...base, date: day(-1), category: 'Fuel', amount: 80, note: 'Site visits, Nilai (sample)' },
  ];
  // Banner status only (no banner positions: those must come from the agent's own GPS, map tap or typing).
  const bannerMix = ['not_yet', 'no', 'not_allowed', 'not_yet', 'removed', 'no', 'not_yet', 'not_allowed', 'no', 'not_yet'] as const;
  properties.forEach((p, i) => { p.bannerStatus = bannerMix[i % bannerMix.length]; });
  return { properties, contacts, inquiries, appointments, tasks, deals, expenses };
}

/** "collection:id" of every sample record, so a deleted sample record is never sent to the cloud either. */
let keys: Set<string> | null = null;
export function isSampleKey(key: string): boolean {
  if (!keys) {
    const d = sampleData(0) as unknown as Record<string, { id: string }[]>;
    keys = new Set(COLLECTIONS.flatMap(c => (d[c] ?? []).map(r => `${c}:${r.id}`)));
  }
  return keys.has(key);
}

/** True when the phone holds no records at all (a new user's empty workspace). */
export function isEmptyWorkspace(state: Record<string, unknown>): boolean {
  return COLLECTIONS.every(c => !((state[c] as unknown[] | undefined)?.length));
}

/** Adds every sample record that is not on the phone yet. Returns how many were added. */
export function loadSampleInto(store: Store): number {
  const d = sampleData();
  const st = store.getState();
  let n = 0;
  for (const c of Object.keys(d) as (keyof typeof d)[]) {
    for (const r of d[c]) if (!(st[c] as { id: string }[]).some(x => x.id === r.id)) { store.upsert(c, r as never); n++; }
  }
  return n;
}
