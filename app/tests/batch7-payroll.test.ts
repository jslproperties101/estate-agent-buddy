// Batch 7b (9 Nov 2026): AI Buddy POS payroll by the official rules (src/buddy/payroll.ts). Figures come from LHDN's own
// worked example (Spesifikasi Kaedah Pengiraan Berkomputer PCB 2026), the EPF Third Schedule, and published PERKESO rows.
// The SOCSO / EIS rule is worked out from published rows and must still be checked against the official PERKESO table.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { epf, epfWageCents, socso, eis, socsoStep, skbbk, skbbkPct, pcb, payslipFor, type PcbIn } from '../src/buddy/payroll';
import { runPayroll, balanced } from '../src/buddy/engine';
import type { AcctStaff } from '../src/buddy/model';

let k = 0;
const ids = { id: () => `id-${++k}`, now: () => 1_790_000_000_000 };
const staff = (o: Partial<AcctStaff> = {}): AcctStaff => ({ id: 's1', created: 0, updated: 0, name: 'Siti', role: 'Clerk', basic: 5500, allowance: 0, commission: 0, pcb: 0, active: true, ...o });
const zero: PcbIn = { month: 1, cat: 1, children: 0, disabled: false, spouseDisabled: false, y1: 0, k1: 0, lp1: 0, zakat: 0, prevY: 0, prevK: 0, prevLp: 0, prevX: 0, prevZ: 0 };

test('EPF Third Schedule: RM20 steps to RM5,000, RM100 steps to RM20,000, rounded up to the ringgit', () => {
  assert.deepEqual(epf(3800), { ee: 418, er: 494 }, 'RM3,800: 11% / 13%');
  assert.deepEqual(epf(3781), { ee: 418, er: 494 }, 'RM3,780.01-3,800 uses RM3,800');
  assert.deepEqual(epf(5000), { ee: 550, er: 650 });
  assert.deepEqual(epf(5000.01), { ee: 561, er: 612 }, 'above RM5,000: the RM5,100 step, employer 12%');
  assert.deepEqual(epf(5500), { ee: 605, er: 660 });
  assert.equal(epfWageCents(10), 0, 'RM10 and below: nothing'); assert.equal(epfWageCents(10.01), 2000);
  assert.deepEqual(epf(25_000.5), { ee: 2751, er: 3001 }, 'above RM20,000: exact percentage, rounded up');
  assert.deepEqual(epf(3800, true), { ee: 0, er: 152 }, 'aged 60 and above: 0% / 4%');
  assert.deepEqual(epf(3800, false, true), { ee: 76, er: 76 }, 'foreign worker: 2% / 2%');
});

test('SOCSO and EIS (worked-out rule): published rows and the RM6,000 ceiling', () => {
  assert.deepEqual(socsoStep(1050), { mid: 105000, ruled: true });
  assert.deepEqual(socso(1050, 1), { ee: 5.25, er: 18.35, ruled: true }, 'RM1,000.01-1,100');
  assert.deepEqual(eis(1050), { ee: 2.1, er: 2.1, ruled: true });
  assert.deepEqual(socso(3400, 1), { ee: 16.75, er: 58.65, ruled: true }, 'RM3,300.01-3,400: total 2.25% × 3,350 = 75.375 → 75.40');
  assert.deepEqual(socso(9000, 1), { ee: 29.75, er: 104.15, ruled: true }, 'ceiling');
  assert.deepEqual(eis(9000), { ee: 11.9, er: 11.9, ruled: true });
  assert.deepEqual(socso(9000, 2), { ee: 0, er: 74.4, ruled: true }, 'category 2 ceiling');
  assert.equal(socso(800, 1).ruled, false, 'RM1,000 and below: not covered by the rule, the slip is marked');
});

test('SKBBK (Lindung 24 Jam): 0.75% from June 2026 wages, RM6,000 ceiling; later rates marked to check', () => {
  assert.equal(skbbkPct('2026-05').pct, 0);
  assert.deepEqual(skbbkPct('2026-06'), { pct: 0.75, confirmed: true });
  assert.deepEqual(skbbkPct('2028-05'), { pct: 0.75, confirmed: true });
  assert.equal(skbbkPct('2028-06').confirmed, false);
  assert.deepEqual(skbbk(3400, '2026-10'), { ee: 25.5, confirmed: true });
  assert.deepEqual(skbbk(8000, '2026-10'), { ee: 45, confirmed: true });
});

test('PCB: LHDN worked example — January, category 3, 3 children, RM5,500, EPF RM605 → RM110.00', () => {
  const r = pcb({ ...zero, month: 1, cat: 3, children: 3, y1: 5500, k1: 605 });
  assert.equal(r.k2, 308.63); assert.equal(r.p, 47000.07); assert.equal(r.mtd, 110);
  assert.equal(pcb({ ...zero, month: 1, cat: 3, children: 3, y1: 5500, k1: 605, zakat: 50 }).net, 60, 'zakat through payroll comes off');
});

test('PCB: below the first band and below RM10 nothing is deducted; category 2 reliefs', () => {
  assert.equal(pcb({ ...zero, y1: 3000, k1: 330 }).mtd, 0);
  const small = pcb({ ...zero, y1: 3500, k1: 385 });
  assert.equal(small.p, 29000.07); assert.equal(small.mtd, 0, 'about RM1.67 a month: under RM10');
  assert.equal(pcb({ ...zero, y1: 4000, k1: 440 }).mtd, 50, 'category 1, RM4,000');
  assert.equal(pcb({ ...zero, cat: 2, y1: 4000, k1: 440 }).mtd, 0, 'category 2 adds spouse relief and a bigger rebate');
  assert.equal(pcb({ ...zero, cat: 1, children: 3, y1: 5500, k1: 605 }).p, pcb({ ...zero, cat: 1, y1: 5500, k1: 605 }).p, 'category 1 has no child relief');
});

test('PCB follows the year: February uses January as posted, and the EPF relief stops at RM4,000', () => {
  const s = staff({ taxCat: 3, children: 3 });
  const jan = runPayroll(ids, '2026-01', [s], [], []);
  assert.equal(jan.payrun.slips[0].pcb, 110);
  const feb = payslipFor(s, '2026-02', [jan.payrun]);
  assert.equal(feb.pcb, 110, 'the same pay all year gives the same PCB');
  // a payrun of another year is not counted
  const lastYear = { ...jan.payrun, month: '2025-12' };
  assert.equal(payslipFor(s, '2026-01', [lastYear]).pcb, 110);
  // EPF relief: K for the year never passes RM4,000
  const runs = [jan.payrun];
  for (let m = 2; m <= 12; m++) {
    const mm = `2026-${String(m).padStart(2, '0')}`;
    runs.push(runPayroll(ids, mm, [s], runs, []).payrun);
  }
  const k = runs.reduce((a, r) => a + (r.slips[0].pcbK ?? 0), 0);
  assert.ok(k <= 4000, `EPF relief ${k}`);
  const total = runs.reduce((a, r) => a + r.slips[0].pcb, 0);
  assert.ok(Math.abs(total - 1320) <= 1, `PCB for the year ${total} ≈ the year's tax RM1,320`);
});

test('a slip: foreign worker, aged 60+, SKBBK opt-out, hand-entered PCB kept for older staff records', () => {
  const f = payslipFor(staff({ basic: 3400, foreign: true }), '2026-10');
  assert.deepEqual([f.epfEe, f.epfEr, f.socsoEe, f.socsoEr, f.eisEe, f.eisEr, f.skbbk], [68, 68, 0, 41.9, 0, 0, 0]);
  const o = payslipFor(staff({ basic: 3400, over60: true }), '2026-10');
  assert.deepEqual([o.epfEe, o.epfEr, o.socsoEe, o.socsoEr, o.eisEe, o.skbbk], [0, 136, 0, 41.9, 0, 25.5]);
  assert.equal(payslipFor(staff({ basic: 3400, skbbkOptOut: true }), '2026-10').skbbk, 0);
  const old = payslipFor(staff({ basic: 3400, pcb: 45 }), '2026-10');
  assert.equal(old.pcb, 45); assert.equal(old.pcbAuto, false);
  assert.ok(old.checks!.includes('socso-table'));
  assert.ok(payslipFor(staff({ basic: 900 }), '2026-10').checks!.includes('socso-low-wage'));
});

test('payroll journal: SKBBK goes to SOCSO payable, zakat to its own account, and it balances', () => {
  const s = staff({ basic: 5500, taxCat: 3, children: 3, zakat: 50 });
  const { journal, payrun } = runPayroll(ids, '2026-10', [s, staff({ id: 's2', name: 'Ali', basic: 3400 })], [], []);
  assert.ok(balanced(journal.lines));
  const line = (acc: string) => journal.lines.find(l => l.acc === acc);
  assert.equal(line('2340')?.cr, 50);
  const [a, b] = payrun.slips;
  assert.equal(line('2310')?.cr, Math.round((a.socsoEe + a.socsoEr + a.skbbk! + b.socsoEe + b.socsoEr + b.skbbk!) * 100) / 100);
  assert.equal(a.net, Math.round((a.gross - a.epfEe - a.socsoEe - a.eisEe - a.skbbk! - a.pcb - 50) * 100) / 100);
});
