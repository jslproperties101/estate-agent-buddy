// Buddy POS AI: the double-entry ledger and everything that posts to it. Pure functions: they take the current records
// and return the records to save, so the screens decide when to save and the tests can check every rule.
import type {
  Account, AcctAttendance, AcctEinvoice, AcctInvoice, AcctJournal, AcctLead, AcctPayrun, AcctSale, AcctStaff, JournalLine,
  JournalSource, Party, PayMethod, Payslip, SaleLine,
} from './model';

export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** The starting chart of accounts for a Malaysian estate agency. */
export const ACCOUNTS: Account[] = [
  { code: '1000', name: 'Cash in hand', type: 'asset' },
  { code: '1010', name: 'Bank – current account', type: 'asset' },
  { code: '1100', name: 'Trade receivables', type: 'asset' },
  { code: '2000', name: 'Trade payables', type: 'liability' },
  { code: '2200', name: 'Service tax payable', type: 'liability' },
  { code: '2300', name: 'EPF payable', type: 'liability' },
  { code: '2310', name: 'SOCSO payable', type: 'liability' },
  { code: '2320', name: 'EIS payable', type: 'liability' },
  { code: '2330', name: 'PCB (MTD) payable', type: 'liability' },
  { code: '3000', name: "Owner's capital", type: 'equity' },
  { code: '3100', name: 'Retained earnings', type: 'equity' },
  { code: '4000', name: 'Agency commission income', type: 'income' },
  { code: '4010', name: 'Rental management fees', type: 'income' },
  { code: '4100', name: 'Counter services (POS)', type: 'income' },
  { code: '5000', name: 'Co-broke commission paid', type: 'expense' },
  { code: '6000', name: 'Property portal listings', type: 'expense' },
  { code: '6100', name: 'Office rent', type: 'expense' },
  { code: '6200', name: 'Utilities & internet', type: 'expense' },
  { code: '6300', name: 'Transport & fuel', type: 'expense' },
  { code: '6400', name: 'Salaries, allowances & commission', type: 'expense' },
  { code: '6410', name: 'Employer EPF, SOCSO & EIS', type: 'expense' },
];
export const accountOf = (code: string) => ACCOUNTS.find(a => a.code === code);

export class BuddyError extends Error { constructor(public code: 'unbalanced' | 'not-draft' | 'not-posted' | 'empty' | 'already-run' | 'nothing-to-consolidate' | 'needs-buyer', message?: string) { super(message ?? code); } }

// ---------- journals ----------
export const sumDr = (ls: JournalLine[]) => r2(ls.reduce((s, l) => s + (l.dr || 0), 0));
export const sumCr = (ls: JournalLine[]) => r2(ls.reduce((s, l) => s + (l.cr || 0), 0));
/** Debits equal credits, above zero, every line has a known account and only one side filled. */
export const balanced = (ls: JournalLine[]) =>
  ls.length >= 2 && sumDr(ls) > 0 && sumDr(ls) === sumCr(ls) && ls.every(l => !!accountOf(l.acc) && l.dr >= 0 && l.cr >= 0 && !(l.dr && l.cr));
export const cleanLines = (ls: JournalLine[]) => ls.map(l => ({ acc: l.acc, dr: r2(+l.dr || 0), cr: r2(+l.cr || 0) })).filter(l => l.acc && (l.dr || l.cr));

/** The next number for a prefix, one above the highest already used (works across synced phones once they have synced). */
export function nextNo(prefix: string, used: (string | undefined)[]): string {
  let max = 0;
  for (const u of used) { const m = u && u.startsWith(prefix + '-') ? /^\d+$/.exec(u.slice(prefix.length + 1)) : null; if (m) max = Math.max(max, +m[0]); }
  return `${prefix}-${String(max + 1).padStart(4, '0')}`;
}
export const counted = (j: AcctJournal) => j.status === 'posted' || j.status === 'reversed';

type Ids = { id: () => string; now: () => number };

export function newJournal(ids: Ids, o: { date: string; memo: string; lines: JournalLine[]; source?: JournalSource; ref?: string }): AcctJournal {
  const t = ids.now();
  return { id: ids.id(), created: t, updated: t, date: o.date, memo: o.memo.trim(), ref: o.ref, source: o.source ?? 'manual', lines: cleanLines(o.lines), status: 'draft' };
}
export function postJournal(j: AcctJournal, all: AcctJournal[], now: number): AcctJournal {
  if (j.status !== 'draft') throw new BuddyError('not-draft');
  if (!balanced(j.lines)) throw new BuddyError('unbalanced');
  return { ...j, status: 'posted', no: nextNo('JV', all.map(x => x.no)), postedAt: now };
}
/** A new posted journal with debits and credits swapped; the original is marked reversed (and stays in the ledger). */
export function reverseJournal(ids: Ids, j: AcctJournal, all: AcctJournal[], date: string): { original: AcctJournal; reversal: AcctJournal } {
  if (j.status !== 'posted') throw new BuddyError('not-posted');
  const draft = newJournal(ids, { date, memo: `Reversal of ${j.no} – ${j.memo}`, ref: j.no, source: 'reversal', lines: j.lines.map(l => ({ acc: l.acc, dr: l.cr, cr: l.dr })) });
  const reversal = postJournal(draft, all, ids.now());
  return { original: { ...j, status: 'reversed', reversedBy: reversal.no }, reversal };
}
const posted = (ids: Ids, all: AcctJournal[], o: Parameters<typeof newJournal>[1]) => postJournal(newJournal(ids, o), all, ids.now());

// ---------- sales lines, invoices, POS ----------
export function totals(ls: Pick<SaleLine, 'qty' | 'price' | 'taxPct'>[]) {
  let sub = 0, tax = 0;
  for (const l of ls) { const x = r2((+l.qty || 0) * (+l.price || 0)); sub += x; tax += r2(x * (+l.taxPct || 0) / 100); }
  return { sub: r2(sub), tax: r2(tax), total: r2(sub + tax) };
}
function saleLines(ls: SaleLine[], debitAcc: string, total: number): JournalLine[] {
  const byAcc = new Map<string, number>();
  for (const l of ls) byAcc.set(l.acc || '4000', r2((byAcc.get(l.acc || '4000') ?? 0) + r2(l.qty * l.price)));
  const tax = totals(ls).tax;
  return [{ acc: debitAcc, dr: total, cr: 0 }, ...[...byAcc].map(([acc, v]) => ({ acc, dr: 0, cr: v })), ...(tax ? [{ acc: '2200', dr: 0, cr: tax }] : [])];
}
export function postInvoice(ids: Ids, inv: AcctInvoice, invoices: AcctInvoice[], journals: AcctJournal[]): { invoice: AcctInvoice; journal: AcctJournal } {
  if (inv.status !== 'draft') throw new BuddyError('not-draft');
  const t = totals(inv.lines);
  if (t.total <= 0) throw new BuddyError('empty');
  if (!inv.buyer.name.trim()) throw new BuddyError('needs-buyer');
  const no = nextNo('INV', invoices.map(i => i.no));
  const journal = posted(ids, journals, { date: inv.date, memo: `Invoice ${no} – ${inv.buyer.name}`, ref: no, source: 'invoice', lines: saleLines(inv.lines, '1100', t.total) });
  return { invoice: { ...inv, no, status: 'posted', journalNo: journal.no }, journal };
}
export function payInvoice(ids: Ids, inv: AcctInvoice, journals: AcctJournal[], date: string, acc = '1010'): { invoice: AcctInvoice; journal: AcctJournal } {
  if (inv.status !== 'posted') throw new BuddyError('not-posted');
  const t = totals(inv.lines).total;
  const journal = posted(ids, journals, { date, memo: `Receipt for ${inv.no} – ${inv.buyer.name}`, ref: inv.no, source: 'receipt', lines: [{ acc, dr: t, cr: 0 }, { acc: '1100', dr: 0, cr: t }] });
  return { invoice: { ...inv, status: 'paid', receiptNo: journal.no, paidOn: date }, journal };
}
/** Above this a sale needs its own e-Invoice (no consolidation), from 1 January 2026. */
export const SINGLE_EINV_LIMIT = 10000;
export function makeSale(ids: Ids, o: { date: string; time: string; lines: SaleLine[]; method: PayMethod; buyer?: Party }, sales: AcctSale[], journals: AcctJournal[]): { sale: AcctSale; journal: AcctJournal } {
  const t = totals(o.lines);
  if (t.total <= 0) throw new BuddyError('empty');
  if (t.total > SINGLE_EINV_LIMIT && !(o.buyer?.name && o.buyer.tin)) throw new BuddyError('needs-buyer');
  const no = nextNo('POS', sales.map(s => s.no));
  const journal = posted(ids, journals, { date: o.date, memo: `POS sale ${no}${o.buyer ? ' – ' + o.buyer.name : ''}`, ref: no, source: 'pos', lines: saleLines(o.lines, o.method === 'cash' ? '1000' : '1010', t.total) });
  const at = ids.now();
  return { sale: { id: ids.id(), created: at, updated: at, no, date: o.date, time: o.time, lines: o.lines, method: o.method, ...t, buyer: o.buyer, journalNo: journal.no! }, journal };
}

// ---------- reports ----------
export function balance(journals: AcctJournal[], code: string, from?: string, to?: string): number {
  let b = 0;
  for (const j of journals) { if (!counted(j) || (from && j.date < from) || (to && j.date > to)) continue; for (const l of j.lines) if (l.acc === code) b += l.dr - l.cr; }
  return r2(b);
}
/** Positive in the account's normal direction (debit for assets and expenses, credit for the rest). */
export const natural = (a: Account, b: number) => (a.type === 'asset' || a.type === 'expense' ? b : r2(-b));
export interface PnlRow { acc: Account; amount: number }
export function profitAndLoss(journals: AcctJournal[], from?: string, to?: string) {
  const rows = (type: 'income' | 'expense') => ACCOUNTS.filter(a => a.type === type).map(acc => ({ acc, amount: natural(acc, balance(journals, acc.code, from, to)) })).filter(r => r.amount);
  const income = rows('income'), expenses = rows('expense');
  const ti = r2(income.reduce((s, r) => s + r.amount, 0)), te = r2(expenses.reduce((s, r) => s + r.amount, 0));
  return { income, expenses, totalIncome: ti, totalExpenses: te, net: r2(ti - te) };
}
export function trialBalance(journals: AcctJournal[], to?: string) {
  const rows = ACCOUNTS.map(acc => ({ acc, b: balance(journals, acc.code, undefined, to) })).filter(r => r.b)
    .map(r => ({ acc: r.acc, dr: r.b > 0 ? r.b : 0, cr: r.b < 0 ? r2(-r.b) : 0 }));
  return { rows, dr: r2(rows.reduce((s, r) => s + r.dr, 0)), cr: r2(rows.reduce((s, r) => s + r.cr, 0)) };
}
export function balanceSheet(journals: AcctJournal[], to?: string) {
  const sec = (type: 'asset' | 'liability' | 'equity') => ACCOUNTS.filter(a => a.type === type).map(acc => ({ acc, amount: natural(acc, balance(journals, acc.code, undefined, to)) })).filter(r => r.amount);
  const assets = sec('asset'), liabilities = sec('liability'), equity = sec('equity');
  const profit = profitAndLoss(journals, undefined, to).net;
  const tA = r2(assets.reduce((s, r) => s + r.amount, 0)), tL = r2(liabilities.reduce((s, r) => s + r.amount, 0));
  const tE = r2(equity.reduce((s, r) => s + r.amount, 0) + profit);
  return { assets, liabilities, equity, profit, totalAssets: tA, totalLiabilities: tL, totalEquity: tE, balanced: r2(tL + tE) === tA };
}

// ---------- payroll (estimates) ----------
/** Flat-rate ESTIMATES: EPF 11% employee, 13% employer (12% above RM5,000); SOCSO 0.5% / 1.75% and EIS 0.2% / 0.2% on
 *  wages up to RM6,000; PCB as entered. Live payroll must use the official KWSP, PERKESO and LHDN schedules. */
export function payslip(s: AcctStaff): Payslip {
  const gross = r2(s.basic + s.allowance + s.commission), base = Math.min(gross, 6000);
  const epfEe = Math.ceil(gross * 0.11), epfEr = Math.ceil(gross * (gross <= 5000 ? 0.13 : 0.12));
  const socsoEe = r2(base * 0.005), socsoEr = r2(base * 0.0175), eisEe = r2(base * 0.002), eisEr = r2(base * 0.002), pcb = r2(s.pcb || 0);
  return { staffId: s.id, name: s.name, gross, epfEe, epfEr, socsoEe, socsoEr, eisEe, eisEr, pcb, net: r2(gross - epfEe - socsoEe - eisEe - pcb) };
}
export const monthEnd = (m: string) => { const [y, mm] = m.split('-').map(Number); return new Date(Date.UTC(y, mm, 0)).toISOString().slice(0, 10); };
export function runPayroll(ids: Ids, month: string, staff: AcctStaff[], payruns: AcctPayrun[], journals: AcctJournal[]): { payrun: AcctPayrun; journal: AcctJournal } {
  if (payruns.some(p => p.month === month)) throw new BuddyError('already-run');
  const slips = staff.filter(s => s.active).map(payslip);
  if (!slips.length) throw new BuddyError('empty');
  const T = (k: keyof Payslip) => r2(slips.reduce((s, p) => s + (p[k] as number), 0));
  const lines: JournalLine[] = [
    { acc: '6400', dr: T('gross'), cr: 0 }, { acc: '6410', dr: r2(T('epfEr') + T('socsoEr') + T('eisEr')), cr: 0 },
    { acc: '2300', dr: 0, cr: r2(T('epfEe') + T('epfEr')) }, { acc: '2310', dr: 0, cr: r2(T('socsoEe') + T('socsoEr')) },
    { acc: '2320', dr: 0, cr: r2(T('eisEe') + T('eisEr')) }, { acc: '2330', dr: 0, cr: T('pcb') }, { acc: '1010', dr: 0, cr: T('net') },
  ];
  const journal = posted(ids, journals, { date: monthEnd(month), memo: `Payroll ${month} – ${slips.length} staff`, ref: `PAY-${month}`, source: 'payroll', lines });
  const t = ids.now();
  return { payrun: { id: ids.id(), created: t, updated: t, month, journalNo: journal.no!, slips }, journal };
}
export const minutes = (hm: string) => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
export const hoursWorked = (a: AcctAttendance) => (a.out ? r2((minutes(a.out) - minutes(a.in)) / 60) : 0);

// ---------- CRM ----------
export function nextStage(l: AcctLead): AcctLead['stage'] {
  const order: AcctLead['stage'][] = ['new', 'contacted', 'viewing', 'offer', 'won'];
  const i = order.indexOf(l.stage);
  return i < 0 || i === order.length - 1 ? l.stage : order[i + 1];
}

// ---------- insights (rule-based in Phase 1) ----------
export type Insight = { key: 'overdue' | 'receivables' | 'followup' | 'runway' | 'payroll' | 'sst' | 'einvoice'; count?: number; amount?: number; names?: string[]; months?: number };
export function insights(b: { journals: AcctJournal[]; invoices: AcctInvoice[]; leads: AcctLead[]; payruns: AcctPayrun[]; einvoices: AcctEinvoice[]; sales: AcctSale[] }, today: string): Insight[] {
  const out: Insight[] = [];
  const od = b.invoices.filter(i => i.status === 'posted' && i.due < today);
  if (od.length) out.push({ key: 'overdue', count: od.length, amount: r2(od.reduce((s, i) => s + totals(i.lines).total, 0)) });
  const ar = balance(b.journals, '1100'); if (ar > 0) out.push({ key: 'receivables', amount: ar });
  const fu = b.leads.filter(l => l.next && l.next <= today && l.stage !== 'won' && l.stage !== 'lost');
  if (fu.length) out.push({ key: 'followup', count: fu.length, names: fu.map(l => l.name.split(' ')[0]) });
  const ready = b.einvoices.filter(e => e.status === 'ready' || e.status === 'invalid').length;
  const pending = b.sales.filter(s => !s.einvId && !s.consolidatedIn).length;
  if (ready || pending) out.push({ key: 'einvoice', count: ready + pending });
  const lastMonth = (() => { const d = new Date(today + 'T00:00:00Z'); d.setUTCDate(0); return d.toISOString().slice(0, 7); })();
  const exp = profitAndLoss(b.journals, lastMonth + '-01', monthEnd(lastMonth)).totalExpenses;
  const cash = r2(balance(b.journals, '1000') + balance(b.journals, '1010'));
  if (exp > 0) out.push({ key: 'runway', months: Math.round((cash / exp) * 10) / 10 });
  if (!b.payruns.some(p => p.month === today.slice(0, 7))) out.push({ key: 'payroll' });
  const sst = -balance(b.journals, '2200'); if (sst > 0) out.push({ key: 'sst', amount: r2(sst) });
  return out;
}
