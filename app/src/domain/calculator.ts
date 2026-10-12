// Malaysian property calculator. Every rate is an assumption the agent can change on screen; defaults follow the
// published rules as at October 2026 and every result is labelled an estimate:
//  - Stamp duty on the Memorandum of Transfer (Stamp Act 1949, First Schedule item 32(a)): 1% on the first
//    RM100,000, 2% up to RM500,000, 3% up to RM1,000,000, 4% above. Non-citizens and foreign companies: flat rate
//    (default 8%, to be checked for the date of the SPA).
//  - Stamp duty on the loan agreement: 0.5% of the loan.
//  - First home (Malaysian citizen, SPA from 1 Jan 2021 to 31 Dec 2027, value up to RM500,000): full exemption on
//    both the MOT and the loan agreement.
//  - Legal fees (Solicitors' Remuneration Order 2023): 1.25% of the first RM500,000, 1% of the next RM7,000,000,
//    above that negotiable (1% used), minimum RM500; charged separately for the SPA and the loan agreement.
//  - Service tax (SST) on legal fees and agent commission: 8%.
//  - RPGT for Malaysian citizens: 30% within 3 years, 20% in year 4, 15% in year 5, 0% from year 6; exemption of
//    10% of the gain or RM10,000, whichever is higher.

export interface Tier { upTo: number | null; pct: number }

export interface Assumptions {
  motTiers: Tier[];
  nonCitizenMotPct: number;
  loanStampPct: number;
  legalTiers: Tier[];
  legalMin: number;
  sstPct: number;
  spaDisbursements: number;
  loanDisbursements: number;
  firstHomeCap: number;
  /** RPGT % by year of disposal: index 0 = year 1, the last value applies to every later year. */
  rpgtByYear: number[];
  rpgtExemptPct: number;
  rpgtExemptMin: number;
}

export const DEFAULT_ASSUMPTIONS: Assumptions = {
  motTiers: [{ upTo: 100_000, pct: 1 }, { upTo: 500_000, pct: 2 }, { upTo: 1_000_000, pct: 3 }, { upTo: null, pct: 4 }],
  nonCitizenMotPct: 8,
  loanStampPct: 0.5,
  legalTiers: [{ upTo: 500_000, pct: 1.25 }, { upTo: 7_500_000, pct: 1 }, { upTo: null, pct: 1 }],
  legalMin: 500,
  sstPct: 8,
  spaDisbursements: 1000,
  loanDisbursements: 1000,
  firstHomeCap: 500_000,
  rpgtByYear: [30, 30, 30, 20, 15, 0],
  rpgtExemptPct: 10,
  rpgtExemptMin: 10_000,
};

export interface TierPart { from: number; to: number; pct: number; amount: number }
/** Tiered charge: each slice of the amount is charged at its own rate. */
export function tiered(amount: number, tiers: Tier[]): { total: number; parts: TierPart[] } {
  const parts: TierPart[] = [];
  let from = 0;
  for (const t of tiers) {
    if (amount <= from) break;
    const to = t.upTo === null ? amount : Math.min(amount, t.upTo);
    if (to > from) parts.push({ from, to, pct: t.pct, amount: ((to - from) * t.pct) / 100 });
    if (t.upTo === null || amount <= t.upTo) break;
    from = t.upTo;
  }
  return { total: round2(parts.reduce((s, p) => s + p.amount, 0)), parts };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Monthly instalment for a loan (reducing balance, monthly rest). */
export function monthlyInstalment(loan: number, ratePct: number, years: number): number {
  const n = Math.round(years * 12);
  if (loan <= 0 || n <= 0) return 0;
  const r = ratePct / 100 / 12;
  if (r === 0) return loan / n;
  const f = Math.pow(1 + r, n);
  return (loan * r * f) / (f - 1);
}

export function legalFee(value: number, a: Assumptions): { fee: number; sst: number; total: number; parts: TierPart[] } {
  if (value <= 0) return { fee: 0, sst: 0, total: 0, parts: [] };
  const t = tiered(value, a.legalTiers);
  const fee = Math.max(a.legalMin, t.total);
  const sst = round2((fee * a.sstPct) / 100);
  return { fee: round2(fee), sst, total: round2(fee + sst), parts: t.parts };
}

export interface PurchaseInput {
  price: number;
  /** Down payment in percent of the price (10 is usual for a first and second housing loan). */
  downPct: number;
  tenureYears: number;
  ratePct: number;
  buyer: 'citizen' | 'non_citizen';
  firstHome: boolean;
  valuationFee: number;
  otherCosts: number;
}

export interface PurchaseResult {
  downPayment: number;
  loan: number;
  monthly: number;
  totalRepayment: number;
  totalInterest: number;
  mot: { stamp: number; parts: TierPart[]; exempt: boolean; flat: boolean };
  loanStamp: { stamp: number; exempt: boolean };
  spaLegal: ReturnType<typeof legalFee>;
  loanLegal: ReturnType<typeof legalFee>;
  disbursements: number;
  valuationFee: number;
  otherCosts: number;
  /** Everything except the down payment. */
  entryCosts: number;
  cashRequired: number;
}

export function purchase(i: PurchaseInput, a: Assumptions = DEFAULT_ASSUMPTIONS): PurchaseResult {
  const price = Math.max(0, i.price || 0);
  const downPayment = round2((price * Math.min(100, Math.max(0, i.downPct || 0))) / 100);
  const loan = round2(price - downPayment);
  const monthly = monthlyInstalment(loan, i.ratePct || 0, i.tenureYears || 0);
  const n = Math.round((i.tenureYears || 0) * 12);
  const totalRepayment = round2(monthly * n);
  const exempt = i.buyer === 'citizen' && i.firstHome && price > 0 && price <= a.firstHomeCap;
  const flat = i.buyer === 'non_citizen';
  const motT = flat ? { total: round2((price * a.nonCitizenMotPct) / 100), parts: [{ from: 0, to: price, pct: a.nonCitizenMotPct, amount: (price * a.nonCitizenMotPct) / 100 }] } : tiered(price, a.motTiers);
  const mot = { stamp: exempt ? 0 : motT.total, parts: motT.parts, exempt, flat };
  const loanStamp = { stamp: exempt || loan <= 0 ? 0 : round2((loan * a.loanStampPct) / 100), exempt };
  const spaLegal = legalFee(price, a);
  const loanLegal = legalFee(loan, a);
  const disbursements = (price > 0 ? a.spaDisbursements : 0) + (loan > 0 ? a.loanDisbursements : 0);
  const entryCosts = round2(mot.stamp + loanStamp.stamp + spaLegal.total + loanLegal.total + disbursements + (i.valuationFee || 0) + (i.otherCosts || 0));
  return {
    downPayment, loan, monthly: round2(monthly), totalRepayment, totalInterest: round2(Math.max(0, totalRepayment - loan)),
    mot, loanStamp, spaLegal, loanLegal, disbursements, valuationFee: i.valuationFee || 0, otherCosts: i.otherCosts || 0,
    entryCosts, cashRequired: round2(downPayment + entryCosts),
  };
}

export interface RentalInput {
  monthlyRent: number;
  maintenanceMonthly: number;
  /** Quit rent and assessment, per year. */
  quitRentAssessmentYearly: number;
  insuranceYearly: number;
  otherMonthly: number;
  /** Months a year the property is expected to be empty. */
  vacancyMonths: number;
}
export interface RentalResult {
  grossYearly: number;
  effectiveYearly: number;
  costsYearly: number;
  netYearly: number;
  grossYieldPct: number;
  netYieldPct: number;
  mortgageYearly: number;
  cashFlowYearly: number;
  cashFlowMonthly: number;
  /** Cash-on-cash return: yearly cash flow after the loan ÷ cash put in at the start. */
  roiPct: number;
}

export function rental(r: RentalInput, price: number, p: PurchaseResult): RentalResult {
  const grossYearly = (r.monthlyRent || 0) * 12;
  const effectiveYearly = (r.monthlyRent || 0) * Math.max(0, 12 - (r.vacancyMonths || 0));
  const costsYearly = (r.maintenanceMonthly || 0) * 12 + (r.quitRentAssessmentYearly || 0) + (r.insuranceYearly || 0) + (r.otherMonthly || 0) * 12;
  const netYearly = effectiveYearly - costsYearly;
  const mortgageYearly = p.monthly * 12;
  const cashFlowYearly = netYearly - mortgageYearly;
  const pct = (x: number, of: number) => (of > 0 ? round2((x / of) * 100) : 0);
  return {
    grossYearly, effectiveYearly, costsYearly: round2(costsYearly), netYearly: round2(netYearly),
    grossYieldPct: pct(grossYearly, price), netYieldPct: pct(netYearly, price),
    mortgageYearly: round2(mortgageYearly), cashFlowYearly: round2(cashFlowYearly), cashFlowMonthly: round2(cashFlowYearly / 12),
    roiPct: pct(cashFlowYearly, p.cashRequired),
  };
}

export interface SaleInput {
  salePrice: number;
  purchasePrice: number;
  /** Stamp duty, legal fees and other costs paid when the property was bought (they reduce the gain). */
  purchaseCosts: number;
  /** Year of disposal counted from the purchase date: 1 = within the first year. */
  holdingYears: number;
  outstandingLoan: number;
  commissionPct: number;
  /** Agent commission is subject to SST when the agency is registered for SST. */
  commissionSst: boolean;
  earlySettlementPenalty: number;
  otherSaleCosts: number;
}
export interface SaleResult {
  commission: number;
  commissionSst: number;
  sellerLegal: ReturnType<typeof legalFee>;
  saleCosts: number;
  gain: number;
  rpgtPct: number;
  exemption: number;
  chargeableGain: number;
  rpgt: number;
  netProceeds: number;
  cashAfterLoan: number;
}

export function sale(s: SaleInput, a: Assumptions = DEFAULT_ASSUMPTIONS): SaleResult {
  const price = Math.max(0, s.salePrice || 0);
  const commission = round2((price * (s.commissionPct || 0)) / 100);
  const commissionSst = s.commissionSst ? round2((commission * a.sstPct) / 100) : 0;
  const sellerLegal = legalFee(price, a);
  const saleCosts = round2(commission + commissionSst + sellerLegal.total + (s.otherSaleCosts || 0));
  const gain = round2(price - (s.purchasePrice || 0) - (s.purchaseCosts || 0) - saleCosts);
  const yi = Math.max(1, Math.floor(s.holdingYears || 1)) - 1;
  const rpgtPct = a.rpgtByYear[Math.min(yi, a.rpgtByYear.length - 1)] ?? 0;
  const exemption = gain > 0 ? round2(Math.max((gain * a.rpgtExemptPct) / 100, a.rpgtExemptMin)) : 0;
  const chargeableGain = round2(Math.max(0, gain - exemption));
  const rpgt = round2((chargeableGain * rpgtPct) / 100);
  const netProceeds = round2(price - saleCosts - rpgt);
  return {
    commission, commissionSst, sellerLegal, saleCosts, gain, rpgtPct, exemption, chargeableGain, rpgt,
    netProceeds, cashAfterLoan: round2(netProceeds - (s.outstandingLoan || 0) - (s.earlySettlementPenalty || 0)),
  };
}

/** Agent commission on a deal, with SST when charged. */
export function agentCommission(value: number, pct: number, withSst: boolean, a: Assumptions = DEFAULT_ASSUMPTIONS) {
  const fee = round2((value * pct) / 100);
  const sst = withSst ? round2((fee * a.sstPct) / 100) : 0;
  return { fee, sst, total: round2(fee + sst) };
}
