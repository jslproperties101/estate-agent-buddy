// Invented sample records for trying the app out. They are only added when the agent taps "Load sample data" in
// Profile → Settings, every one is marked sample, and "Remove sample data" deletes them all again.
// Sample properties have NO map position: the map only ever shows positions the agent really saved.
import type { Listing, Marketing } from '../listing/model';
import type { Appointment, Contact, Deal, Expense, Inquiry, Task } from './types';
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
      headline: 'Corner semi-D factory, Nilai industrial area', purpose: 'sale', type: 'Semi-D factory', unitNo: '7', lotNo: '2/14',
      state: NS, city: 'Nilai', township: 'Kawasan Perindustrian Nilai', street: 'Jalan Perindustrian 2/3',
      landSqft: 8000, builtUpSqft: 6500, frontageFt: 60, depthFt: 133, floors: 2, parking: 4, ceilingFt: 28, powerKva: 150, loadingBays: 1,
      lotType: 'corner', tenure: 'freehold', titleType: 'Individual title', landUse: 'industry', restriction: 'No restriction',
      askingPrice: 3200000, negotiable: 'yes', commissionPct: 2, maintenanceFee: 350, availability: 'immediate', condition: 'good',
      features: '2-storey office, 28 ft ceiling, 150 kVA, wide side land.', status: 'available', vendorId: 'v1', arrangement: 'direct',
      notes: 'Owner open to offers. Keys with guard house.',
      marketing: { advertised: 'yes', ads: [
        { id: 'a1', platform: 'PropertyGuru', start: day(-40), end: day(50), ref: 'PG-sample-001', status: 'live' },
        { id: 'a2', platform: 'Facebook Marketplace', start: day(-30), status: 'needs_update', notes: 'Price changed; update the post.' },
      ], custom: {} },
      documents: [{ id: 'd1', category: 'brochure', name: 'Unit 7 brochure (sample).pdf', added: now }],
    }),
    mk('s2', 1002, {
      headline: 'Semi-D factory with 6,200 sq ft built-up', purpose: 'sale', type: 'Semi-D factory', unitNo: '6',
      state: NS, city: 'Nilai', township: 'Kawasan Perindustrian Nilai', street: 'Jalan Perindustrian 2/3', landSqft: 8000, builtUpSqft: 6200, parking: 3,
      lotType: 'intermediate', tenure: 'freehold', askingPrice: 3050000, negotiable: 'no', commissionPct: 2, availability: 'immediate',
      status: 'in_progress', handledBy: 'Negotiator B (sample)', vendorId: 'v2', arrangement: 'cobroke', arrangementNote: 'Co-broke with Agency M (sample)', marketing: noAds,
    }),
    mk('s3', 1003, {
      headline: 'Detached factory on 1 acre, Nilai', purpose: 'sale', type: 'Detached factory', lotNo: '21',
      state: NS, city: 'Nilai', township: 'Kawasan Perindustrian Nilai', landSqft: 43560, builtUpSqft: 20000, parking: 10,
      ceilingFt: 35, powerKva: 400, loadingBays: 2, lotType: 'single', tenure: 'leasehold', leaseExpiryYear: 2077, titleType: 'Individual title', landUse: 'industry',
      askingPrice: 7800000, availability: 'immediate', status: 'needs_check', vendorId: 'v3', arrangement: 'referral', arrangementNote: 'Referred by Banker R (sample)', marketing: noAds,
    }),
    mk('s4', 1004, {
      headline: 'Renovated 2-storey terrace, Bandar Baru Nilai', purpose: 'sale', type: 'Terrace house',
      state: NS, city: 'Nilai', township: 'Bandar Baru Nilai', street: 'Jalan BBN 3/1 (sample)', bedrooms: 4, bathrooms: 3, floors: 2, parking: 2,
      landSqft: 1540, builtUpSqft: 1800, frontageFt: 22, depthFt: 70, lotType: 'intermediate', tenure: 'freehold', landUse: 'building', furnishing: 'partly', condition: 'renovated',
      askingPrice: 580000, negotiable: 'yes', commissionPct: 3, availability: 'immediate', status: 'available', vendorId: 'v4', arrangement: 'direct',
      notes: 'Owner wants to sell urgently.', marketing: { advertised: 'yes', ads: [{ id: 'a3', platform: 'Mudah', start: day(-10), status: 'live' }], custom: {} },
    }),
    mk('s5', 1005, {
      headline: 'End-lot semi-D, Bandar Baru Salak Tinggi', purpose: 'sale', type: 'Semi-D house',
      state: SEL, city: 'Salak Tinggi', township: 'Bandar Baru Salak Tinggi', street: 'Jalan Seri 8 (sample)', bedrooms: 5, bathrooms: 4, floors: 2, parking: 3,
      landSqft: 3200, builtUpSqft: 2900, lotType: 'end', tenure: 'leasehold', leaseExpiryYear: 2105, askingPrice: 950000, status: 'sold', availability: 'not_available', vendorId: 'v5', marketing: noAds,
    }),
    mk('s6', 1006, {
      headline: 'Corner 3-storey shoplot, Sepang town', purpose: 'sale_or_rent', type: 'Shoplot',
      state: SEL, city: 'Sepang', street: 'Jalan Pusat Niaga (sample)', floors: 3, builtUpSqft: 4200, landSqft: 1650, lotType: 'corner', bathrooms: 3,
      tenure: 'leasehold', leaseExpiryYear: 2094, askingPrice: 1200000, monthlyRent: 6500, securityDepositMonths: 2, utilityDepositMonths: 0.5,
      availability: 'tenanted', tenancy: { tenant: 'Tenant T (sample)', start: '2025-07', end: '2027-06', rent: 6000 }, status: 'rented', vendorId: 'v6', marketing: noAds,
      notes: 'Ground floor tenanted until June 2027.',
    }),
    mk('s7', 1007, {
      headline: '5 acres oil palm land, Labu', purpose: 'sale', type: 'Agricultural land',
      state: NS, city: 'Labu', street: 'Mukim Labu (sample)', landSqft: 217800, tenure: 'freehold', landUse: 'agriculture', currentUse: 'Oil palm (mature)', roadAccess: 'Tar road frontage',
      askingPrice: 1100000, availability: 'immediate', status: 'available', vendorId: 'v7', marketing: noAds,
    }),
    mk('s8', 1008, {
      headline: 'Furnished 3-bedroom condo, Putra Nilai', purpose: 'rent', type: 'Condo / apartment', unitNo: 'B-12-3',
      state: NS, city: 'Nilai', township: 'Putra Nilai', street: 'Residensi Sample', bedrooms: 3, bathrooms: 2, parking: 2, builtUpSqft: 1100,
      furnishing: 'fully', condition: 'good', tenure: 'leasehold', leaseExpiryYear: 2112, titleType: 'Strata title', monthlyRent: 1800, securityDepositMonths: 2, utilityDepositMonths: 0.5, maintenanceFee: 320,
      availability: 'from_date', availableFrom: day(60).slice(0, 7), status: 'available', vendorId: 'v8', arrangement: 'direct',
      marketing: { advertised: 'yes', ads: [{ id: 'a4', platform: 'iProperty', start: day(-5), status: 'live', ref: 'IP-sample-118' }], custom: {} },
    }),
    mk('s9', 1009, {
      headline: '12 acres development land, Bandar Enstek', purpose: 'sale', type: 'Development land',
      state: NS, city: 'Nilai', township: 'Bandar Enstek', landSqft: 522720, tenure: 'freehold', landUse: 'building', zoning: 'Mixed development (to check with council)',
      roadAccess: 'Main road frontage', askingPrice: 15700000, availability: 'immediate', status: 'available', vendorId: 'v9', arrangement: 'cobroke', arrangementNote: 'Co-broke with Agency P (sample)', marketing: noAds,
    }),
    mk('s10', 1010, {
      headline: 'Detached factory for rent, Salak Tinggi', purpose: 'rent', type: 'Detached factory',
      state: SEL, city: 'Salak Tinggi', street: 'Jalan Logistik 1 (sample)', landSqft: 30000, builtUpSqft: 22000, ceilingFt: 40, powerKva: 300, loadingBays: 4, parking: 8,
      tenure: 'leasehold', leaseExpiryYear: 2085, monthlyRent: 33000, securityDepositMonths: 3, utilityDepositMonths: 1, availability: 'immediate', condition: 'good', status: 'available', vendorId: 'v10', marketing: noAds,
    }),
  ];

  const c = (id: string, name: string, roles: Contact['roles'], x: Partial<Contact> = {}): Contact => ({ id, ...base, name, roles, ...x });
  const contacts: Contact[] = [
    c('v1', 'Owner A (sample)', ['vendor'], { phone: '+60 12-345 6789' }),
    c('v2', 'Owner B (sample)', ['vendor'], { phone: '+60 13-210 4455' }),
    c('v3', 'Owner E (sample)', ['vendor'], { phone: '+60 17-888 1200' }),
    c('v4', 'Encik Ahmad (sample)', ['vendor'], { phone: '+60 19-222 3344' }),
    c('v5', 'Puan Siti (sample)', ['vendor'], { phone: '+60 16-555 0101' }),
    c('v6', 'Mr Lim (sample)', ['vendor', 'landlord'], { phone: '+60 12-700 8811' }),
    c('v7', 'Owner F (sample)', ['vendor']),
    c('v8', 'Ms Tan (sample)', ['landlord'], { phone: '+60 11-2233 4455' }),
    c('v9', 'Syarikat G Sdn Bhd (sample)', ['vendor'], { phone: '+60 3-8888 1234' }),
    c('v10', 'Owner H (sample)', ['landlord'], { phone: '+60 14-909 3030' }),
    c('b1', 'Buyer K (sample)', ['buyer'], { phone: '+60 12-111 2222', leadStatus: 'hot', source: 'PropertyGuru' }),
    c('b2', 'Buyer L (sample)', ['buyer'], { phone: '+60 13-333 4444', leadStatus: 'warm', source: 'Referral' }),
    c('b3', 'Tenant M (sample)', ['tenant'], { phone: '+60 17-555 6666', leadStatus: 'cold', source: 'Mudah' }),
    c('b4', 'Investor N (sample)', ['investor'], { phone: '+60 19-777 8888', leadStatus: 'dropped' }),
    c('b5', 'Buyer O (sample)', ['buyer'], { leadStatus: 'inactive' }),
    c('e1', 'Lawyer P (sample)', ['professional'], { profession: 'lawyer', phone: '+60 3-2222 1111', company: 'Messrs P & Co (sample)' }),
    c('e2', 'Banker Q (sample)', ['professional'], { profession: 'banker', phone: '+60 12-999 0000', company: 'Bank Q (sample)' }),
  ];

  const inquiries: Inquiry[] = [
    { id: 'i1', ...base, contactId: 'b2', propertyId: 's4', at: at(-1, '20:15'), channel: 'whatsapp', message: 'Is the price negotiable? Can view on Saturday?' },
    { id: 'i2', ...base, contactId: 'b3', propertyId: 's8', at: at(-3, '10:05'), channel: 'portal', message: 'Asked about move-in date and parking.' },
  ];
  const appointments: Appointment[] = [
    { id: 'ap1', ...base, kind: 'viewing', status: 'scheduled', start: at(1, '11:00'), durationMin: 45, propertyId: 's1', contactId: 'b1', reminders: [1440, 60], notes: 'Bring the brochure.' },
    { id: 'ap2', ...base, kind: 'viewing', status: 'completed', start: at(-9, '15:00'), propertyId: 's1', contactId: 'b1', reminders: [], outcome: 'Liked the side land; asked about power upgrade.', completedAt: now },
    { id: 'ap3', ...base, kind: 'meeting', status: 'pending', start: at(4, '14:30'), contactId: 'e1', title: 'SPA review with lawyer', reminders: [4320, 1440] },
  ];
  const tasks: Task[] = [
    { id: 't1', ...base, title: 'Send updated brochure to Buyer K', due: day(0), priority: 'high', done: false, kind: 'follow_up', contactId: 'b1', propertyId: 's1', reminders: [0] },
    { id: 't2', ...base, title: 'Update Facebook Marketplace price', due: day(-1), priority: 'medium', done: false, kind: 'task', propertyId: 's1', reminders: [] },
    { id: 't3', ...base, title: 'Collect keys from Owner B', due: day(3), priority: 'low', done: false, kind: 'task', propertyId: 's2', contactId: 'v2', reminders: [1440] },
    { id: 't4', ...base, title: 'Call Puan Siti about SPA date', due: day(-4), priority: 'medium', done: true, completedAt: now, kind: 'follow_up', contactId: 'v5', reminders: [] },
  ];
  const deals: Deal[] = [
    { id: 'dl1', ...base, title: 'Semi-D, Bandar Baru Salak Tinggi', propertyId: 's5', side: 'sale', date: day(-20), value: 950000, commissionPct: 2.5, commission: 23750, sharePct: 70, status: 'received', receivedDate: day(-5), receivedAmount: 16625 },
    { id: 'dl2', ...base, title: 'Shoplot tenancy, Sepang', propertyId: 's6', side: 'rent', date: day(-12), value: 6000, commission: 6000, sharePct: 70, status: 'confirmed' },
    { id: 'dl3', ...base, title: 'Semi-D factory, Unit 6', propertyId: 's2', side: 'sale', date: day(30), value: 3050000, commissionPct: 2, commission: 61000, sharePct: 50, status: 'estimated' },
  ];
  const expenses: Expense[] = [
    { id: 'x1', ...base, date: day(-2), category: 'Advertising', amount: 150, note: 'PropertyGuru credits (sample)' },
    { id: 'x2', ...base, date: day(-1), category: 'Fuel', amount: 80 },
  ];
  return { properties, contacts, inquiries, appointments, tasks, deals, expenses };
}
