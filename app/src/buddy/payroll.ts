// AI Buddy POS, Batch 7b (Joe, 9 Nov 2026: "All"): Malaysian payroll deductions by the official rules.
//
//  EPF (KWSP, Third Schedule)  wages in RM20 steps up to RM5,000, then RM100 steps up to RM20,000; the contribution is the
//      rate times the top of the step, rounded up to the next ringgit; above RM20,000 the exact percentage, rounded up.
//      Under 60: employee 11%, employer 13% (wages up to RM5,000) or 12%. Aged 60 and above: employee 0%, employer 4%.
//      Foreign workers (from October 2025 wages): 2% and 2%.
//  SOCSO (PERKESO) and EIS (SIP)  wage steps of RM100 up to the RM6,000 ceiling. RULE WORKED OUT FROM PUBLISHED ROWS, TO BE
//      CHECKED AGAINST THE OFFICIAL TABLE: the assumed wage is the middle of the step (RM1,000.01-1,100 → RM1,050; above
//      RM5,900 → RM5,950).
//      Category 1 (under 60): employee 0.5% of it; employer = 2.25% of it rounded to 5 sen (ties to even) minus the employee
//      share (max RM29.75 / RM104.15). Category 2 (60 and above) and foreign workers: employer only, 1.25% rounded the
//      same way (max RM74.40). EIS: 0.2% each (max RM11.90), not for foreign workers or anyone 60 and above.
//      Wages of RM1,000 and below are not covered by the worked-out rule: the slip is marked to be checked.
//  SKBBK (Lindung 24 Jam, P.U. (B) 196/2026)  from June 2026 wages, employee only, Malaysians and permanent residents:
//      0.75% until May 2028, on wages up to RM6,000 (max RM45). Later rates (1.00%, then 1.25%) are marked to be checked.
//  PCB (MTD, LHDN computerised calculation)  normal monthly pay only:
//      P = [Σ(Y−K) + (Y1−K1) + (Y2−K2)n] − (D + S + DU + SU + QC + ΣLP + LP1)
//      MTD = [((P − M) × R + B) − (Z + X)] / (n + 1), cut to sen, rounded up to 5 sen; below RM10 nothing is deducted;
//      zakat paid through payroll this month comes off the MTD.
//      K (EPF relief) is at most RM4,000 a year; K2 = min(K1, (4000 − (K + K1)) / n).
//      Reliefs: self D 9,000; spouse with no income S 4,000 (category 2); child 2,000 each; disabled self DU 7,000;
//      disabled spouse SU 6,000 (category 2); other reliefs claimed on form TP1 as LP (per month, entered by hand).
// Not covered (say so on the slip): bonus and other additional pay, pay from a previous employer this year, BIK / VOLA.
import type { AcctPayrun, AcctStaff, Payslip } from './model';

const cents = (x: number) => Math.round(x * 100);
const rm = (c: number) => c / 100;
/** Rounds cents to 5 sen, an exact half going to the even 5 sen (as PERKESO's published rows do). */
function to5Even(c2: number): number {        // c2: twice the amount in cents, so halves stay whole numbers
  const q = c2 / 10;                           // in 5-sen units
  const f = Math.floor(q), d = q - f;
  const n = d > 0.5 ? f + 1 : d < 0.5 ? f : (f % 2 === 0 ? f : f + 1);
  return n * 5;
}

// ---------- EPF ----------
export type EpfRates = { ee: number; er: number };
export function epfRates(wage: number, over60: boolean, foreign: boolean): EpfRates {
  if (foreign) return { ee: 2, er: 2 };
  if (over60) return { ee: 0, er: 4 };
  return { ee: 11, er: wage <= 5000 ? 13 : 12 };
}
/** The wage the Third Schedule uses (the top of the step), in cents. */
export function epfWageCents(wage: number): number {
  const c = cents(wage);
  if (c <= 1000) return 0;                                   // RM10 and below: nothing
  if (c <= 500000) return Math.ceil(c / 2000) * 2000;        // RM20 steps
  if (c <= 2000000) return Math.ceil(c / 10000) * 10000;     // RM100 steps
  return c;                                                  // above RM20,000: the wage itself
}
/** Contribution in whole ringgit, rounded up. */
export const epfAmount = (wage: number, pct: number) => Math.ceil(epfWageCents(wage) * pct / 10000);
export function epf(wage: number, over60 = false, foreign = false) {
  const r = epfRates(wage, over60, foreign);
  return { ee: epfAmount(wage, r.ee), er: epfAmount(wage, r.er) };
}

// ---------- SOCSO and EIS ----------
/** The assumed wage of the step (cents) and whether the worked-out rule covers it. */
export function socsoStep(wage: number): { mid: number; ruled: boolean } {
  const c = Math.min(cents(wage), 600000);
  if (c <= 0) return { mid: 0, ruled: true };
  if (c > 590000) return { mid: 595000, ruled: true };
  const top = Math.ceil(c / 10000) * 10000;
  return { mid: top - 5000, ruled: c > 100000 };
}
export function socso(wage: number, cat: 1 | 2) {
  const { mid, ruled } = socsoStep(wage);
  if (!mid) return { ee: 0, er: 0, ruled };
  if (cat === 2) return { ee: 0, er: rm(to5Even(mid * 2 * 125 / 10000)), ruled };
  const ee = Math.round(mid * 50 / 10000);                     // 0.5%: whole cents on every step middle
  const total = to5Even(mid * 2 * 225 / 10000);
  return { ee: rm(ee), er: rm(total - ee), ruled };
}
export function eis(wage: number) {
  const { mid, ruled } = socsoStep(wage);
  const each = rm(Math.round(mid * 20 / 10000));
  return { ee: each, er: each, ruled };
}

// ---------- SKBBK (Lindung 24 Jam) ----------
export function skbbkPct(month: string): { pct: number; confirmed: boolean } {
  if (month < '2026-06') return { pct: 0, confirmed: true };
  if (month <= '2028-05') return { pct: 0.75, confirmed: true };
  return { pct: 1, confirmed: false };
}
export function skbbk(wage: number, month: string) {
  const { pct, confirmed } = skbbkPct(month);
  return { ee: rm(Math.round(Math.min(cents(wage), 600000) * pct / 100)), confirmed };
}

// ---------- PCB ----------
export type TaxCat = 1 | 2 | 3;
const BANDS: [number, number, number, number, number][] = [   // [from P, M, R %, B for category 1 & 3, B for category 2]
  [2000000, 2000000, 30, 528400, 528400], [600000, 600000, 28, 136400, 136400], [400000, 400000, 26, 84400, 84400],
  [100000, 100000, 25, 9400, 9400], [70000, 70000, 19, 3700, 3700], [50000, 50000, 11, 1500, 1500], [35000, 35000, 6, 600, 600],
  [20000, 20000, 3, -250, -650], [5000, 5000, 1, -400, -800],
];
export interface PcbIn {
  month: number;          // 1..12
  cat: TaxCat; children: number; disabled: boolean; spouseDisabled: boolean;
  y1: number; k1: number; lp1: number; zakat: number;
  /** This year, earlier months, from the posted payroll: pay, EPF relief used, TP1 reliefs, PCB and zakat deducted. */
  prevY: number; prevK: number; prevLp: number; prevX: number; prevZ: number;
}
export interface PcbOut { mtd: number; net: number; p: number; k1: number; k2: number }
const cut2 = (x: number) => Math.floor(x * 100 + 1e-7) / 100;
export function pcb(i: PcbIn): PcbOut {
  const n = 12 - i.month;
  const k1 = Math.max(0, Math.min(i.k1, 4000 - i.prevK));
  const k2 = n > 0 ? cut2(Math.max(0, Math.min(k1, (4000 - (i.prevK + k1)) / n))) : 0;
  const y2 = i.y1;
  const reliefs = 9000 + (i.cat === 2 ? 4000 : 0) + (i.disabled ? 7000 : 0) + (i.cat === 2 && i.spouseDisabled ? 6000 : 0)
    + (i.cat === 1 ? 0 : 2000 * Math.max(0, Math.floor(i.children))) + i.prevLp + i.lp1;
  const p = cut2((i.prevY - i.prevK) + (i.y1 - k1) + (y2 - k2) * n - reliefs);
  const band = BANDS.find(b => p > b[0]);
  let mtd = 0;
  if (band) {
    const [, m, r, b1, b2] = band;
    const tax = (p - m) * r / 100 + (i.cat === 2 ? b2 : b1);
    const x = (tax - (i.prevZ + i.prevX)) / (n + 1);
    const c = Math.floor(x * 100 + 1e-7);
    mtd = c <= 0 ? 0 : Math.ceil(c / 5) * 5 / 100;
    if (mtd < 10) mtd = 0;
  }
  return { mtd, net: Math.max(0, Math.round((mtd - i.zakat) * 100) / 100), p, k1, k2 };
}

// ---------- one person's slip ----------
const r2 = (n: number) => Math.round(n * 100) / 100;
/** This year's earlier slips for one person (from the posted payroll of this book). */
function before(payruns: AcctPayrun[], staffId: string, month: string) {
  const y = month.slice(0, 4);
  return payruns.filter(p => p.month.slice(0, 4) === y && p.month < month).flatMap(p => p.slips.filter(s => s.staffId === staffId));
}
export function payslipFor(s: AcctStaff, month: string, payruns: AcctPayrun[] = []): Payslip {
  const gross = r2(s.basic + s.allowance + s.commission);
  const over60 = !!s.over60, foreign = !!s.foreign;
  const e = epf(gross, over60, foreign);
  const so = socso(gross, over60 || foreign ? 2 : 1);
  const ei = over60 || foreign ? { ee: 0, er: 0, ruled: true } : eis(gross);
  const sk = foreign || s.skbbkOptOut ? { ee: 0, confirmed: true } : skbbk(gross, month);
  const zakat = r2(Math.max(0, s.zakat ?? 0));
  const lp = r2(Math.max(0, s.tp1 ?? 0));
  const checks: string[] = [];
  if (!so.ruled || !ei.ruled) checks.push('socso-low-wage');
  if (!sk.confirmed) checks.push('skbbk-rate');
  checks.push('socso-table');
  let tax: number, pcbK: number | undefined, auto = false;
  if (s.taxCat) {
    auto = true;
    const prev = before(payruns, s.id, month);
    const sum = (k: keyof Payslip) => prev.reduce((a, x) => a + ((x[k] as number | undefined) ?? 0), 0);
    const out = pcb({
      month: +month.slice(5, 7), cat: s.taxCat, children: s.children ?? 0, disabled: !!s.disabled, spouseDisabled: !!s.spouseDisabled,
      y1: gross, k1: e.ee, lp1: lp, zakat,
      prevY: sum('gross'), prevK: prev.reduce((a, x) => a + (x.pcbK ?? x.epfEe), 0), prevLp: sum('lp'), prevX: sum('pcb'), prevZ: sum('zakat'),
    });
    tax = out.net; pcbK = out.k1;
  } else tax = r2(s.pcb || 0);
  const net = r2(gross - e.ee - so.ee - ei.ee - sk.ee - tax - (auto ? zakat : 0));
  return {
    staffId: s.id, name: s.name, gross, epfEe: e.ee, epfEr: e.er, socsoEe: so.ee, socsoEr: so.er, eisEe: ei.ee, eisEr: ei.er,
    skbbk: sk.ee, pcb: tax, net, rules: 2, pcbAuto: auto, pcbK, zakat: auto ? zakat : 0, lp: auto ? lp : 0, checks,
  };
}
