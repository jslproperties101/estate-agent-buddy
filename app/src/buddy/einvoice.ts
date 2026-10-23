// Buddy POS AI: LHDN MyInvois e-Invoices. Builds the UBL 2.1 JSON document LHDN expects and checks it before it is sent.
// Sending happens only through the myinvois server function (myinvoisClient.ts); nothing here talks to LHDN.
//  - Rules used (checked 24 Oct 2026): a sale above RM10,000 needs its own e-Invoice; other POS receipts may go into one
//    consolidated e-Invoice per month, due within 7 days after the month ends; a validated e-Invoice can be cancelled
//    within 72 hours, after that a credit note is needed.
import type { AcctEinvoice, AcctInvoice, AcctProfile, AcctSale, EinvLine, Party } from './model';
import { r2, totals, SINGLE_EINV_LIMIT, monthEnd } from './engine';

export const GENERAL_PUBLIC_TIN = 'EI00000000010';
/** LHDN TIN formats: companies and other entities (C, CS, D, E, F, FA, PT, TA, TC, TN, TR, TP, J, LE) and individuals (IG). */
export const TIN_RE = /^(C|CS|D|E|F|FA|PT|TA|TC|TN|TR|TP|J|LE)\d{9,11}$|^IG\d{11}$|^EI\d{11}$/;
export const STATE_CODES: [string, string][] = [
  ['01', 'Johor'], ['02', 'Kedah'], ['03', 'Kelantan'], ['04', 'Melaka'], ['05', 'Negeri Sembilan'], ['06', 'Pahang'], ['07', 'Pulau Pinang'],
  ['08', 'Perak'], ['09', 'Perlis'], ['10', 'Selangor'], ['11', 'Terengganu'], ['12', 'Sabah'], ['13', 'Sarawak'], ['14', 'WP Kuala Lumpur'],
  ['15', 'WP Labuan'], ['16', 'WP Putrajaya'], ['17', 'Not applicable'],
];
export const CANCEL_WINDOW_MS = 72 * 3600_000;
export const canCancel = (e: AcctEinvoice, now: number) => e.status === 'valid' && !!e.validatedAt && now - e.validatedAt < CANCEL_WINDOW_MS;

type Ids = { id: () => string; now: () => number };
const base = (ids: Ids) => { const t = ids.now(); return { id: ids.id(), created: t, updated: t }; };
const cleanTin = (t: string) => t.replace(/\s+/g, '').toUpperCase();

export function einvFromInvoice(ids: Ids, inv: AcctInvoice): AcctEinvoice {
  return { ...base(ids), kind: 'invoice', refNo: inv.no ?? '', date: inv.date, time: '00:00:00', buyer: { ...inv.buyer, tin: cleanTin(inv.buyer.tin) },
    lines: inv.lines.map(l => ({ desc: l.desc, qty: l.qty, price: l.price, taxPct: l.taxPct, cls: '022' })), status: 'ready' };
}
export function einvFromSale(ids: Ids, s: AcctSale): AcctEinvoice {
  if (!s.buyer) throw new Error('sale without buyer');
  return { ...base(ids), kind: 'pos', refNo: s.no, date: s.date, time: s.time, buyer: { ...s.buyer, tin: cleanTin(s.buyer.tin) },
    lines: s.lines.map(l => ({ desc: l.desc, qty: l.qty, price: l.price, taxPct: l.taxPct, cls: '022' })), status: 'ready' };
}
export const GENERAL_PUBLIC: Party = { name: 'General Public', tin: GENERAL_PUBLIC_TIN, brn: 'NA', addr: 'NA', city: 'NA', state: '17', email: 'NA', phone: 'NA' };
/** The month's POS receipts that have no e-Invoice of their own go into one consolidated e-Invoice (one line each). */
export function consolidate(ids: Ids, month: string, sales: AcctSale[], today: string, time: string): { einv: AcctEinvoice; sales: AcctSale[] } | null {
  const pool = sales.filter(s => s.date.startsWith(month) && !s.einvId && !s.consolidatedIn && s.total <= SINGLE_EINV_LIMIT);
  if (!pool.length) return null;
  const lines: EinvLine[] = [];
  for (const s of pool) {
    // A receipt with taxed and untaxed lines becomes two lines, so each keeps its own tax rate.
    for (const rate of [...new Set(s.lines.map(l => l.taxPct))]) {
      const amt = r2(s.lines.filter(l => l.taxPct === rate).reduce((x, l) => x + r2(l.qty * l.price), 0));
      lines.push({ desc: `Receipt ${s.no} (${s.date})`, qty: 1, price: amt, taxPct: rate, cls: '004' });
    }
  }
  const einv: AcctEinvoice = { ...base(ids), kind: 'consolidated', refNo: `CON-${month.replace('-', '')}`, date: today, time, period: month, buyer: GENERAL_PUBLIC, lines, status: 'ready' };
  return { einv, sales: pool.map(s => ({ ...s, consolidatedIn: einv.id })) };
}

/** Errors stop the submission; warnings are shown but do not. Same words in every language are built by the screen. */
export interface Check { errors: CheckCode[]; warnings: CheckCode[]; dueBy?: string }
export type CheckCode =
  | 'supplier-tin' | 'supplier-brn' | 'supplier-msic' | 'supplier-address' | 'buyer-name' | 'buyer-tin' | 'buyer-address'
  | 'no-lines' | 'line-qty' | 'line-class' | 'over-limit-general' | 'zero-total'
  | 'buyer-brn-na' | 'supplier-sst-na';
export function check(e: AcctEinvoice, co: AcctProfile | undefined): Check {
  const errors: CheckCode[] = [], warnings: CheckCode[] = [];
  const p = co?.party;
  if (!p || !TIN_RE.test(p.tin)) errors.push('supplier-tin');
  if (!p?.brn) errors.push('supplier-brn');
  if (!/^\d{5}$/.test(co?.msic ?? '')) errors.push('supplier-msic');
  if (!p?.addr || !p.city || !p.state) errors.push('supplier-address');
  if (!e.buyer.name.trim()) errors.push('buyer-name');
  if (!TIN_RE.test(e.buyer.tin)) errors.push('buyer-tin');
  if (e.kind !== 'consolidated' && (!e.buyer.addr || !e.buyer.city)) errors.push('buyer-address');
  if (!e.lines.length) errors.push('no-lines');
  if (e.lines.some(l => !(l.qty > 0))) errors.push('line-qty');
  if (e.lines.some(l => !l.cls)) errors.push('line-class');
  const t = totals(e.lines);
  if (t.total <= 0) errors.push('zero-total');
  if (e.kind !== 'consolidated' && t.total > SINGLE_EINV_LIMIT && e.buyer.tin === GENERAL_PUBLIC_TIN) errors.push('over-limit-general');
  if (e.kind !== 'consolidated' && !e.buyer.brn) warnings.push('buyer-brn-na');
  if (!p?.sst) warnings.push('supplier-sst-na');
  const out: Check = { errors, warnings };
  if (e.kind === 'consolidated' && e.period) { const [y, m] = e.period.split('-').map(Number); out.dueBy = new Date(Date.UTC(y, m, 7)).toISOString().slice(0, 10); }
  return out;
}

// ---------- UBL 2.1 JSON (MyInvois format: every value is an array of objects with "_") ----------
const v = (x: string | number, attrs: Record<string, string> = {}) => [{ _: x, ...attrs }];
const money = (x: number) => v(r2(x), { currencyID: 'MYR' });
function party(p: Party, supplier: AcctProfile | null) {
  return [{ Party: [{
    ...(supplier ? { IndustryClassificationCode: v(supplier.msic, { name: supplier.msicDesc }) } : {}),
    PartyIdentification: [
      { ID: v(p.tin, { schemeID: 'TIN' }) }, { ID: v(p.brn || 'NA', { schemeID: 'BRN' }) },
      { ID: v(supplier ? (p.sst || 'NA') : 'NA', { schemeID: 'SST' }) }, { ID: v('NA', { schemeID: 'TTX' }) },
    ],
    PostalAddress: [{ CityName: v(p.city || 'NA'), PostalZone: v(p.postcode || ''), CountrySubentityCode: v(p.state || '17'),
      AddressLine: [{ Line: v(p.addr || 'NA') }], Country: [{ IdentificationCode: v('MYS', { listID: 'ISO3166-1', listAgencyID: '6' }) }] }],
    PartyLegalEntity: [{ RegistrationName: v(p.name) }],
    Contact: [{ Telephone: v(p.phone || 'NA'), ElectronicMail: v(p.email || 'NA') }],
  }] }];
}
function taxSub(baseAmt: number, rate: number) {
  return { TaxableAmount: money(baseAmt), TaxAmount: money(r2(baseAmt * rate / 100)), ...(rate ? { Percent: v(rate) } : {}),
    TaxCategory: [{ ID: v(rate ? '02' : '06'), ...(rate ? {} : { TaxExemptionReason: v('Not subject to service tax') }),
      TaxScheme: [{ ID: v('OTH', { schemeID: 'UN/ECE 5153', schemeAgencyID: '6' }) }] }] };
}
/** The document before signing. version 1.1 must be signed by the server function before LHDN accepts it. */
export function buildUBL(e: AcctEinvoice, co: AcctProfile, version: '1.0' | '1.1' = '1.1') {
  const t = totals(e.lines);
  const rates = [...new Set(e.lines.map(l => l.taxPct))].sort();
  return {
    _D: 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
    _A: 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
    _B: 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
    Invoice: [{
      ID: v(e.refNo), IssueDate: v(e.date), IssueTime: v(`${e.time}Z`),
      InvoiceTypeCode: v('01', { listVersionID: version }), DocumentCurrencyCode: v('MYR'),
      ...(e.kind === 'consolidated' && e.period ? { InvoicePeriod: [{ StartDate: v(`${e.period}-01`), EndDate: v(monthEnd(e.period)), Description: v('Monthly') }] } : {}),
      AccountingSupplierParty: party(co.party, co),
      AccountingCustomerParty: party(e.buyer, null),
      TaxTotal: [{ TaxAmount: money(t.tax), TaxSubtotal: rates.map(rt => taxSub(r2(e.lines.filter(l => l.taxPct === rt).reduce((s, l) => s + r2(l.qty * l.price), 0)), rt)) }],
      LegalMonetaryTotal: [{ LineExtensionAmount: money(t.sub), TaxExclusiveAmount: money(t.sub), TaxInclusiveAmount: money(t.total), PayableAmount: money(t.total) }],
      InvoiceLine: e.lines.map((l, i) => {
        const amt = r2(l.qty * l.price);
        return { ID: v(String(i + 1)), InvoicedQuantity: v(l.qty, { unitCode: 'C62' }), LineExtensionAmount: money(amt),
          TaxTotal: [{ TaxAmount: money(r2(amt * l.taxPct / 100)), TaxSubtotal: [taxSub(amt, l.taxPct)] }],
          Item: [{ CommodityClassification: [{ ItemClassificationCode: v(l.cls, { listID: 'CLASS' }) }], Description: v(l.desc) }],
          Price: [{ PriceAmount: money(l.price) }], ItemPriceExtension: [{ Amount: money(amt) }] };
      }),
    }],
  };
}
export const shareUrl = (e: AcctEinvoice) => e.uuid && e.longId ? `https://${e.env === 'prod' ? '' : 'preprod.'}myinvois.hasil.gov.my/${e.uuid}/share/${e.longId}` : undefined;
