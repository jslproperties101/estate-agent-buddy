// AI Buddy POS (Phase 1): the records of the accounting suite. Every record is an ordinary synced record (eab_records),
// so it is saved on the phone first and reaches the cloud with the next sync, exactly like a property or a contact.
//  - Money is always Malaysian ringgit, kept as a number rounded to sen.
//  - A posted journal is never edited or deleted: a mistake is corrected with a reversal (see locks.ts).
import type { Base } from '../data/types';

export type AccountType = 'asset' | 'liability' | 'equity' | 'income' | 'expense';
export interface Account { code: string; name: string; type: AccountType }

export interface JournalLine { acc: string; dr: number; cr: number }
export type JournalStatus = 'draft' | 'posted' | 'reversed';
export type JournalSource = 'manual' | 'invoice' | 'receipt' | 'pos' | 'payroll' | 'reversal';
export interface AcctJournal extends Base {
  /** JV-0001, given when it is posted (a draft has none). */
  no?: string;
  date: string;
  memo: string;
  /** The document it came from (INV-0001, POS-0001, PAY-2026-10, or the journal it reverses). */
  ref?: string;
  source: JournalSource;
  lines: JournalLine[];
  status: JournalStatus;
  postedAt?: number;
  /** Set on a reversed journal: the number of the journal that reversed it. */
  reversedBy?: string;
}

/** A buyer or a supplier as LHDN needs it on an e-Invoice. */
export interface Party {
  name: string; tin: string; brn?: string; sst?: string;
  addr: string; city: string; state: string; postcode?: string;
  email?: string; phone?: string;
}
export interface SaleLine { desc: string; qty: number; price: number; /** service tax %, 0 or 8 */ taxPct: number; acc: string }

export type InvoiceStatus = 'draft' | 'posted' | 'paid';
export interface AcctInvoice extends Base {
  no?: string;
  date: string;
  due: string;
  buyer: Party;
  contactId?: string;
  leadId?: string;
  lines: SaleLine[];
  status: InvoiceStatus;
  journalNo?: string;
  receiptNo?: string;
  paidOn?: string;
  einvId?: string;
}

export type PayMethod = 'cash' | 'card' | 'qr';
export interface AcctSale extends Base {
  no: string;
  date: string;
  time: string;
  lines: SaleLine[];
  method: PayMethod;
  sub: number; tax: number; total: number;
  /** Only when the buyer asked for an e-Invoice (or the sale is above RM10,000). */
  buyer?: Party;
  journalNo: string;
  einvId?: string;
  /** The consolidated e-Invoice this receipt went into. */
  consolidatedIn?: string;
}

export type EinvKind = 'invoice' | 'pos' | 'consolidated';
export type EinvStatus = 'ready' | 'submitted' | 'valid' | 'invalid' | 'cancelled';
export interface EinvLine { desc: string; qty: number; price: number; taxPct: number; /** LHDN classification code, e.g. 022 Others, 004 Consolidated */ cls: string }
export interface AcctEinvoice extends Base {
  kind: EinvKind;
  /** The invoice or receipt number it is for (CON-202610 for a consolidated one). */
  refNo: string;
  date: string;
  time: string;
  period?: string;
  buyer: Party;
  lines: EinvLine[];
  status: EinvStatus;
  env?: 'preprod' | 'prod';
  submissionUid?: string;
  uuid?: string;
  longId?: string;
  submittedAt?: number;
  validatedAt?: number;
  cancelledAt?: number;
  errors?: string[];
}

export type LeadStage = 'new' | 'contacted' | 'viewing' | 'offer' | 'won' | 'lost';
export const LEAD_STAGES: LeadStage[] = ['new', 'contacted', 'viewing', 'offer', 'won', 'lost'];
export interface AcctLead extends Base {
  name: string; phone?: string; contactId?: string;
  interest: string; stage: LeadStage;
  /** Expected fee (RM). */
  value: number;
  next?: string;
  invoiceId?: string;
}

export interface AcctStaff extends Base {
  name: string; role: string;
  basic: number; allowance: number; commission: number;
  /** Monthly PCB (MTD) entered by hand until the official schedule is built in. */
  pcb: number;
  active: boolean;
}
export interface AcctAttendance extends Base { staffId: string; date: string; in: string; out?: string }

export interface Payslip {
  staffId: string; name: string;
  gross: number; epfEe: number; epfEr: number; socsoEe: number; socsoEr: number; eisEe: number; eisEr: number; pcb: number; net: number;
}
export interface AcctPayrun extends Base { month: string; journalNo: string; slips: Payslip[] }

export interface AcctProduct extends Base { name: string; price: number; taxPct: number; acc: string; active: boolean }

/** The company's own details, sent as the supplier on every e-Invoice. One record, id 'company'. */
export interface AcctProfile extends Base {
  party: Party;
  msic: string;
  msicDesc: string;
}
