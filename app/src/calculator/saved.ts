// Saved calculations: turning the screen's inputs into a record, reading the results back, listing the lines for
// the history and the PDF, and proposing (never applying by itself) changes to the linked property record.
// The formulas are in domain/calculator.ts and are NOT changed here.
import {
  Assumptions, DEFAULT_ASSUMPTIONS, purchase, rental, sale, agentCommission, TierPart,
} from '../domain/calculator';
import type { Calculation, CalcKind, CommissionInput } from '../data/types';
import type { Listing } from '../listing/model';
import { rm, rm2, cardTitle } from '../listing/model';
import type { CalcStrings } from './strings';

/** Rates are kept on the phone as plain numbers. */
export function toFlat(a: Assumptions): Record<string, number> {
  const f: Record<string, number> = {
    nonCitizen: a.nonCitizenMotPct, loanStamp: a.loanStampPct, legalMin: a.legalMin, sst: a.sstPct, spaDisb: a.spaDisbursements,
    loanDisb: a.loanDisbursements, firstHomeCap: a.firstHomeCap, rpgtExemptPct: a.rpgtExemptPct, rpgtExemptMin: a.rpgtExemptMin,
  };
  a.motTiers.forEach((t, i) => { f[`mot${i}`] = t.pct; });
  a.legalTiers.forEach((t, i) => { f[`legal${i}`] = t.pct; });
  a.rpgtByYear.forEach((p, i) => { f[`rpgt${i}`] = p; });
  return f;
}
export function fromFlat(f: Record<string, number> | undefined): Assumptions {
  const d = DEFAULT_ASSUMPTIONS;
  const g = (k: string, dv: number) => (f && Number.isFinite(f[k]) ? f[k] : dv);
  return {
    motTiers: d.motTiers.map((t, i) => ({ ...t, pct: g(`mot${i}`, t.pct) })),
    nonCitizenMotPct: g('nonCitizen', d.nonCitizenMotPct), loanStampPct: g('loanStamp', d.loanStampPct),
    legalTiers: d.legalTiers.map((t, i) => ({ ...t, pct: g(`legal${i}`, t.pct) })), legalMin: g('legalMin', d.legalMin),
    sstPct: g('sst', d.sstPct), spaDisbursements: g('spaDisb', d.spaDisbursements), loanDisbursements: g('loanDisb', d.loanDisbursements),
    firstHomeCap: g('firstHomeCap', d.firstHomeCap), rpgtByYear: d.rpgtByYear.map((p, i) => g(`rpgt${i}`, p)),
    rpgtExemptPct: g('rpgtExemptPct', d.rpgtExemptPct), rpgtExemptMin: g('rpgtExemptMin', d.rpgtExemptMin),
  };
}

export interface CalcInputs { purchase: Calculation['purchase']; rental: Calculation['rental']; sale: Calculation['sale']; commission: CommissionInput }

/** The record to save. Everything is copied, so later edits on the screen never change a saved calculation. */
export function buildCalculation(
  id: string, now: number, kind: CalcKind, inputs: CalcInputs, rates: Record<string, number>,
  link: { propertyId?: string; contactId?: string; title?: string },
): Calculation {
  const copy = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
  return {
    id, created: now, updated: now, kind,
    ...(link.title?.trim() ? { title: link.title.trim() } : {}),
    ...(link.propertyId ? { propertyId: link.propertyId } : {}),
    ...(link.contactId ? { contactId: link.contactId } : {}),
    purchase: copy(inputs.purchase), rental: copy(inputs.rental), sale: copy(inputs.sale), commission: copy(inputs.commission),
    rates: { ...rates },
  };
}

/** Every result of a saved calculation, worked out again from what was saved. */
export function calcResults(c: Pick<Calculation, 'purchase' | 'rental' | 'sale' | 'commission' | 'rates'>) {
  const a = fromFlat(c.rates);
  const pr = purchase(c.purchase, a);
  return { a, pr, rr: rental(c.rental, c.purchase.price, pr), sr: sale(c.sale, a), cr: agentCommission(c.commission.value, c.commission.pct, c.commission.sst, a) };
}

export interface CalcRow { k: string; v: string; strong?: boolean; sub?: boolean; heading?: boolean }

const tierRows = (t: CalcStrings, parts: TierPart[]): CalcRow[] => parts.map(x => ({ sub: true, k: t.out.tier(rm(x.from), rm(x.to), x.pct), v: rm2(x.amount) }));

/** The one number shown for a calculation in the history list. */
export function headline(c: Calculation, t: CalcStrings): { label: string; value: string } {
  const { pr, rr, sr, cr } = calcResults(c);
  switch (c.kind) {
    case 'purchase': return { label: t.out.monthly, value: rm2(pr.monthly) };
    case 'rental': return { label: t.out.netYield, value: `${rr.netYieldPct.toFixed(2)}%` };
    case 'sale': return { label: t.out.afterLoan, value: rm2(sr.cashAfterLoan) };
    default: return { label: t.out.total, value: rm2(cr.total) };
  }
}

/** What the agent typed, as lines (for the PDF and the history). */
export function inputRows(c: Calculation, t: CalcStrings): CalcRow[] {
  const p = c.purchase, r = c.rental, s = c.sale, m = c.commission;
  const yes = (b: boolean) => (b ? '✓' : '—');
  switch (c.kind) {
    case 'purchase': return [
      { k: t.in.price, v: rm2(p.price) }, { k: t.in.downPct, v: `${p.downPct}%` }, { k: t.in.tenure, v: String(p.tenureYears) }, { k: t.in.rate, v: `${p.ratePct}%` },
      { k: t.in.buyer, v: p.buyer === 'citizen' ? t.in.citizen : t.in.nonCitizen },
      ...(p.buyer === 'citizen' ? [{ k: t.in.firstHome, v: yes(p.firstHome) }] : []),
      ...(p.valuationFee ? [{ k: t.in.valuation, v: rm2(p.valuationFee) }] : []), ...(p.otherCosts ? [{ k: t.in.other, v: rm2(p.otherCosts) }] : []),
    ];
    case 'rental': return [
      { k: t.in.price, v: rm2(p.price) }, { k: t.in.downPct, v: `${p.downPct}%` }, { k: t.in.tenure, v: String(p.tenureYears) }, { k: t.in.rate, v: `${p.ratePct}%` },
      { k: t.in.rent, v: rm2(r.monthlyRent) }, { k: t.in.maint, v: rm2(r.maintenanceMonthly) }, { k: t.in.vacancy, v: String(r.vacancyMonths) },
      ...(r.quitRentAssessmentYearly ? [{ k: t.in.quit, v: rm2(r.quitRentAssessmentYearly) }] : []), ...(r.insuranceYearly ? [{ k: t.in.insurance, v: rm2(r.insuranceYearly) }] : []),
      ...(r.otherMonthly ? [{ k: t.in.otherMonthly, v: rm2(r.otherMonthly) }] : []),
    ];
    case 'sale': return [
      { k: t.in.salePrice, v: rm2(s.salePrice) }, { k: t.in.purchasePrice, v: rm2(s.purchasePrice) }, { k: t.in.purchaseCosts, v: rm2(s.purchaseCosts) },
      { k: t.in.years, v: String(s.holdingYears) }, { k: t.in.commPct, v: `${s.commissionPct}%` }, { k: t.in.commSst, v: yes(s.commissionSst) },
      { k: t.in.loanLeft, v: rm2(s.outstandingLoan) }, ...(s.earlySettlementPenalty ? [{ k: t.in.penalty, v: rm2(s.earlySettlementPenalty) }] : []),
      ...(s.otherSaleCosts ? [{ k: t.in.otherSale, v: rm2(s.otherSaleCosts) }] : []),
    ];
    default: return [{ k: t.in.dealValue, v: rm2(m.value) }, { k: t.in.commPct, v: `${m.pct}%` }, { k: t.in.commSst, v: yes(m.sst) }];
  }
}

/** The full breakdown of a saved calculation, the same figures the calculator screen shows. */
export function resultRows(c: Calculation, t: CalcStrings): CalcRow[] {
  const { a, pr, rr, sr, cr } = calcResults(c);
  const R = (k: string, v: string, o: Partial<CalcRow> = {}): CalcRow => ({ k, v, ...o });
  if (c.kind === 'purchase') {
    return [
      R(t.out.downPayment, rm2(pr.downPayment)), R(t.out.loan, rm2(pr.loan)), R(t.out.monthly, rm2(pr.monthly), { strong: true }),
      R(t.out.totalInterest, rm2(pr.totalInterest)), R(t.out.totalRepayment, rm2(pr.totalRepayment)),
      R(t.out.mot, rm2(pr.mot.stamp)),
      ...(pr.mot.exempt ? [R(t.out.motExempt, 'RM 0.00', { sub: true })] : pr.mot.flat ? [R(t.out.motFlat(a.nonCitizenMotPct), rm2(pr.mot.stamp), { sub: true })] : tierRows(t, pr.mot.parts)),
      R(`${t.out.loanStamp} (${a.loanStampPct}%)`, rm2(pr.loanStamp.stamp)),
      ...(pr.loanStamp.exempt ? [R(t.out.motExempt, 'RM 0.00', { sub: true })] : []),
      R(t.out.spaLegal, rm2(pr.spaLegal.total)), ...tierRows(t, pr.spaLegal.parts), R(t.out.sst(a.sstPct), rm2(pr.spaLegal.sst), { sub: true }),
      R(t.out.loanLegal, rm2(pr.loanLegal.total)), ...tierRows(t, pr.loanLegal.parts), R(t.out.sst(a.sstPct), rm2(pr.loanLegal.sst), { sub: true }),
      R(t.out.disb, rm2(pr.disbursements)),
      ...(pr.valuationFee > 0 ? [R(t.out.valuation, rm2(pr.valuationFee))] : []), ...(pr.otherCosts > 0 ? [R(t.out.other, rm2(pr.otherCosts))] : []),
      R(t.out.entry, rm2(pr.entryCosts)), R(t.out.cash, rm2(pr.cashRequired), { strong: true }),
    ];
  }
  if (c.kind === 'rental') {
    return [
      R(t.out.grossYearly, rm2(rr.grossYearly)), R(t.out.effective, rm2(rr.effectiveYearly)), R(t.out.costs, rm2(rr.costsYearly)), R(t.out.netYearly, rm2(rr.netYearly)),
      R(t.out.grossYield, `${rr.grossYieldPct.toFixed(2)}%`, { strong: true }), R(t.out.netYield, `${rr.netYieldPct.toFixed(2)}%`, { strong: true }),
      R(`${t.out.monthly} (${t.out.loan} ${rm(pr.loan)})`, rm2(pr.monthly)), R(t.out.mortgageYearly, rm2(rr.mortgageYearly)),
      R(`${t.out.cashFlow} · ${t.out.perYear}`, rm2(rr.cashFlowYearly)), R(`${t.out.cashFlow} · ${t.out.perMonth}`, rm2(rr.cashFlowMonthly)),
      R(t.out.cash, rm2(pr.cashRequired)), R(t.out.roi, `${rr.roiPct.toFixed(2)}%`, { strong: true }),
    ];
  }
  if (c.kind === 'sale') {
    return [
      R(`${t.out.commission} (${c.sale.commissionPct}%)`, rm2(sr.commission)),
      ...(c.sale.commissionSst ? [R(t.out.commissionSst, rm2(sr.commissionSst), { sub: true })] : []),
      R(t.out.sellerLegal, rm2(sr.sellerLegal.total)),
      ...(c.sale.otherSaleCosts > 0 ? [R(t.out.other, rm2(c.sale.otherSaleCosts))] : []),
      R(t.out.saleCosts, rm2(sr.saleCosts)),
      R(t.out.gain, rm2(sr.gain)), R(t.out.exemption, rm2(sr.exemption)), R(t.out.chargeable, rm2(sr.chargeableGain)),
      R(t.out.rpgtRate, `${sr.rpgtPct}%`), R(t.out.rpgt, rm2(sr.rpgt)),
      R(t.out.net, rm2(sr.netProceeds), { strong: true }), R(t.out.afterLoan, rm2(sr.cashAfterLoan), { strong: true }),
    ];
  }
  return [
    R(`${t.out.fee} (${c.commission.pct}%)`, rm2(cr.fee)),
    ...(c.commission.sst ? [R(t.out.sst(a.sstPct), rm2(cr.sst), { sub: true })] : []),
    R(t.out.total, rm2(cr.total), { strong: true }),
  ];
}

// ---------- explicit, reviewable update of the property record ----------
export type PropertyUpdateKey = 'askingPrice' | 'monthlyRent' | 'maintenanceFee' | 'commissionPct';
export interface PropertyUpdate { key: PropertyUpdateKey; current: number | undefined; proposed: number }

/** Values from this calculation that differ from the property record. Only values the agent actually entered
 *  (greater than zero) are offered. Nothing is changed here: the screen shows these for the agent to tick and confirm. */
export function proposeUpdates(c: Calculation, prop: Pick<Listing, 'askingPrice' | 'monthlyRent' | 'maintenanceFee' | 'commissionPct'> & Partial<Pick<Listing, 'purpose'>>): PropertyUpdate[] {
  const wanted: [PropertyUpdateKey, number | undefined][] = [];
  // A percentage is a sale commission only: a rental's commission is in months of rent (Change 009), so a percentage
  // from the calculator is never written onto a rent-only property.
  const rentOnly = prop.purpose === 'rent';
  if (c.kind === 'purchase') wanted.push(['askingPrice', c.purchase.price]);
  else if (c.kind === 'rental') wanted.push(['monthlyRent', c.rental.monthlyRent], ['maintenanceFee', c.rental.maintenanceMonthly]);
  else if (c.kind === 'sale') wanted.push(['askingPrice', c.sale.salePrice], ...(rentOnly ? [] : [['commissionPct', c.sale.commissionPct] as [PropertyUpdateKey, number]]));
  else if (!rentOnly) wanted.push(['commissionPct', c.commission.pct]);
  return wanted
    .filter(([k, v]) => typeof v === 'number' && Number.isFinite(v) && v > 0 && v !== prop[k])
    .map(([k, v]) => ({ key: k, current: prop[k], proposed: v as number }));
}

/** Applies the updates the agent ticked, and records them in the property's change history. */
export function applyPropertyUpdates(l: Listing, updates: PropertyUpdate[], now: number, summary: string): Listing {
  if (!updates.length) return l;
  const next: Listing = { ...l };
  for (const u of updates) (next as unknown as Record<string, unknown>)[u.key] = u.proposed;
  next.history = [{ at: now, source: 'form', summary }, ...(l.history ?? [])];
  return next;
}

/** Properties matching what the agent typed: every word must appear in the reference, title, place, street, type or owner. */
export function searchProperties(list: Listing[], query: string, limit = 30): Listing[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const hay = (l: Listing) => [l.ref, cardTitle(l), l.headline, l.type, l.township, l.city, l.street, l.unitNo, l.lotNo, l.ownerName].filter(Boolean).join(' ').toLowerCase();
  return list.filter(l => words.every(w => hay(l).includes(w))).sort((a, b) => (a.ref ?? '').localeCompare(b.ref ?? '') || b.updated - a.updated).slice(0, limit);
}
