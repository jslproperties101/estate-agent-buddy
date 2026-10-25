// AI Buddy POS: example books for trying the suite (Load example data). Every record is marked sample, so it is never
// sent to the cloud, never counted as the agent's own data and can be removed again in one tap. Dates follow "today":
// last month and this month.
import type {
  AcctAttendance, AcctEinvoice, AcctInvoice, AcctJournal, AcctLead, AcctPayrun, AcctProduct, AcctProfile, AcctSale, AcctStaff, JournalLine, Party,
} from './model';
import { makeSale, newJournal, payInvoice, postInvoice, postJournal, runPayroll } from './engine';
import { einvFromInvoice, einvFromSale } from './einvoice';

type Ids = { id: () => string; now: () => number };
export interface Books {
  journals: AcctJournal[]; invoices: AcctInvoice[]; sales: AcctSale[]; einvoices: AcctEinvoice[]; leads: AcctLead[];
  staff: AcctStaff[]; attendance: AcctAttendance[]; payruns: AcctPayrun[]; products: AcctProduct[]; profile: AcctProfile[];
}

export const DEFAULT_PRODUCTS: Omit<AcctProduct, 'id' | 'created' | 'updated'>[] = [
  { name: 'Tenancy agreement preparation', price: 350, taxPct: 8, acc: '4100', active: true },
  { name: 'Stamping handling fee', price: 100, taxPct: 8, acc: '4100', active: true },
  { name: 'Photography & listing package', price: 450, taxPct: 8, acc: '4100', active: true },
  { name: 'Inventory & handover report', price: 250, taxPct: 8, acc: '4100', active: true },
  { name: 'Key duplication', price: 15, taxPct: 0, acc: '4100', active: true },
  { name: 'Document certification', price: 30, taxPct: 0, acc: '4100', active: true },
];

export function sampleBooks(ids: Ids, today: string): Books {
  const m = today.slice(0, 7);
  const d0 = new Date(`${m}-01T00:00:00Z`); d0.setUTCMonth(d0.getUTCMonth() - 1);
  const p = d0.toISOString().slice(0, 7);
  const day = (mm: string, dd: number) => `${mm}-${String(Math.min(dd, +today.slice(8, 10) || 28)).padStart(2, '0')}`;
  const pday = (dd: number) => `${p}-${String(dd).padStart(2, '0')}`;
  const b: Books = { journals: [], invoices: [], sales: [], einvoices: [], leads: [], staff: [], attendance: [], payruns: [], products: [], profile: [] };
  const t = ids.now();
  const base = () => ({ id: ids.id(), created: t, updated: t, sample: true });
  const S = <T extends object>(x: T) => ({ ...x, sample: true });
  const jr = (date: string, memo: string, ls: [string, number, number][], post = true) => {
    const j = newJournal(ids, { date, memo, lines: ls.map(([acc, dr, cr]): JournalLine => ({ acc, dr, cr })) });
    b.journals.push(S(post ? postJournal(j, b.journals, t) : j));
  };

  b.profile.push({ ...base(), id: 'company', msic: '68201', msicDesc: 'Activities of real estate agents and brokers for buying, selling and renting of real estate',
    party: { name: 'Example Realty Sdn Bhd', tin: 'C21234567890', brn: '202301012345', sst: 'W10-2310-32000123', addr: 'Level 8, Menara Contoh, Jalan Ampang', city: 'Kuala Lumpur', state: '14', postcode: '50450', phone: '+60312345678', email: 'accounts@example-realty.my' } });
  for (const x of DEFAULT_PRODUCTS) b.products.push({ ...base(), ...x });

  jr(pday(1), 'Owner capital injection', [['1010', 50000, 0], ['3000', 0, 50000]]);
  jr(pday(5), 'Office rent', [['6100', 3000, 0], ['1010', 0, 3000]]);
  jr(pday(20), 'Co-broke commission – Taman Desa terrace', [['5000', 6000, 0], ['1010', 0, 6000]]);
  jr(day(m, 5), 'Office rent', [['6100', 3000, 0], ['1010', 0, 3000]]);
  jr(day(m, 12), 'Property portal listing credits', [['6000', 1200, 0], ['1010', 0, 1200]]);
  jr(day(m, 15), 'Electricity & fibre', [['6200', 420, 0], ['1010', 0, 420]]);

  const tan: Party = { name: 'Tan Holdings Sdn Bhd', tin: 'C10987654320', brn: '201901023456', addr: '12, Jalan Desa Utama, Taman Desa', city: 'Kuala Lumpur', state: '14', postcode: '58100', email: 'finance@tanholdings.example', phone: '+60379876543' };
  const lim: Party = { name: 'Lim Wei Ming', tin: 'IG12345678901', addr: 'B-21-3, Residensi Kiara', city: 'Kuala Lumpur', state: '14', postcode: '50480', email: 'weiming.lim@example.com', phone: '+60123456789' };
  const inv = (date: string, due: string, buyer: Party, lines: AcctInvoice['lines']): AcctInvoice => ({ ...base(), date, due, buyer, lines, status: 'draft' });
  const add = (i: AcctInvoice, paidOn?: string) => {
    let r = postInvoice(ids, i, b.invoices, b.journals); b.journals.push(S(r.journal)); let cur = S(r.invoice);
    if (paidOn) { r = payInvoice(ids, cur, b.journals, paidOn); b.journals.push(S(r.journal)); cur = S(r.invoice); }
    const e = S(einvFromInvoice(ids, cur)); b.einvoices.push(e); b.invoices.push({ ...cur, einvId: e.id });
  };
  add(inv(pday(18), day(m, 18), tan, [{ desc: 'Agency commission – sale of 3-storey terrace, Taman Desa (2% of RM1,200,000)', qty: 1, price: 24000, taxPct: 8, acc: '4000' }]), day(m, 5));
  add(inv(day(m, 10), `${m}-28`, lim, [{ desc: 'Rental management fee – Mont Kiara unit', qty: 1, price: 1500, taxPct: 8, acc: '4010' }]));
  b.invoices.push(inv(day(m, 22), `${m}-28`, { name: 'Nurul Aina binti Hassan', tin: 'IG98765432109', addr: 'No. 7, Jalan SK 2/3', city: 'Seri Kembangan', state: '10', postcode: '43300' },
    [{ desc: 'Agency fee – tenancy, Seri Kembangan double-storey (1 month rental)', qty: 1, price: 2200, taxPct: 8, acc: '4000' }]));

  const pr = (i: number) => b.products[i];
  const sale = (date: string, items: [number, number][], method: AcctSale['method'], buyer?: Party) => {
    const r = makeSale(ids, { date, time: '10:30:00', method, buyer, lines: items.map(([i, q]) => ({ desc: pr(i).name, qty: q, price: pr(i).price, taxPct: pr(i).taxPct, acc: pr(i).acc })) }, b.sales, b.journals);
    b.journals.push(S(r.journal));
    let s = S(r.sale);
    if (buyer) { const e = S(einvFromSale(ids, s)); b.einvoices.push(e); s = { ...s, einvId: e.id }; }
    b.sales.push(s);
  };
  sale(day(m, 8), [[0, 1], [1, 1]], 'qr');
  sale(day(m, 14), [[4, 3], [5, 2]], 'cash');
  sale(day(m, 21), [[2, 1], [3, 1]], 'card', { name: 'Rajesh a/l Kumar', tin: 'IG87654321098', addr: '22, Jalan Bukit Indah 3', city: 'Ampang', state: '10', postcode: '68000' });
  jr(day(m, 23), 'Staff mileage claims – viewings', [['6300', 380, 0], ['1000', 0, 380]], false);

  const lead = (name: string, phone: string, interest: string, stage: AcctLead['stage'], value: number, next?: string) => b.leads.push({ ...base(), name, phone, interest, stage, value, next });
  lead('Mohd Faizal bin Osman', '+60123344556', 'Buy – 3-room condo, Cheras, under RM550k', 'viewing', 11000, today);
  lead('Chong Mei Ling', '+60167788990', 'Sell – semi-D, Bandar Sunway', 'offer', 28000, day(m, 26));
  lead('Arjun Pillai', '+60149988776', 'Rent – studio near KL Sentral', 'contacted', 1800, day(m, 1));
  lead('Siti Hajar binti Yusof', '+60135566778', 'Rent out – Puchong terrace', 'new', 2000);

  const staff = (name: string, role: string, basic: number, allowance: number, commission: number, pcb: number) => { const s = { ...base(), name, role, basic, allowance, commission, pcb, active: true }; b.staff.push(s); return s; };
  const a = staff('Aisyah Rahman', 'Office admin', 3200, 200, 0, 0);
  const d = staff('Daniel Wong', 'Real estate negotiator', 2500, 300, 1800, 45);
  staff('Priya Nair', 'Accounts executive', 4200, 250, 0, 110);
  b.attendance.push({ ...base(), staffId: a.id, date: today, in: '08:52' }, { ...base(), staffId: d.id, date: today, in: '09:31' });
  const pay = runPayroll(ids, p, b.staff, b.payruns, b.journals);
  b.journals.push(S(pay.journal)); b.payruns.push(S(pay.payrun));
  return b;
}
