// Malaysian property calculator: worked examples checked by hand.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tiered, monthlyInstalment, legalFee, purchase, rental, sale, agentCommission, DEFAULT_ASSUMPTIONS as A } from '../src/domain/calculator';

const near = (a: number, b: number, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, `${a} ≠ ${b}`);

test('K1 MOT stamp duty tiers: RM500,000 → RM9,000; RM1.2m → RM32,000', () => {
  assert.equal(tiered(500_000, A.motTiers).total, 1000 + 8000);
  assert.equal(tiered(1_200_000, A.motTiers).total, 1000 + 8000 + 15000 + 8000);
  assert.equal(tiered(80_000, A.motTiers).total, 800);
});

test('K2 legal fees (SRO 2023): minimum RM500, 1.25% then 1%, plus SST', () => {
  assert.equal(legalFee(30_000, A).fee, 500);
  assert.equal(legalFee(500_000, A).fee, 6250);
  assert.equal(legalFee(1_000_000, A).fee, 6250 + 5000);
  assert.equal(legalFee(1_000_000, A).sst, 900);
});

test('K3 instalment: RM450,000 at 4.2% for 35 years', () => {
  near(monthlyInstalment(450_000, 4.2, 35), 2046.83, 0.01);
  assert.equal(monthlyInstalment(120_000, 0, 10), 1000);
});

test('K4 purchase: full breakdown and cash required; first-home exemption; foreign buyers', () => {
  const p = purchase({ price: 500_000, downPct: 10, tenureYears: 35, ratePct: 4.2, buyer: 'citizen', firstHome: false, valuationFee: 0, otherCosts: 0 });
  assert.equal(p.downPayment, 50_000); assert.equal(p.loan, 450_000);
  assert.equal(p.mot.stamp, 9000); assert.equal(p.loanStamp.stamp, 2250);
  assert.equal(p.spaLegal.total, 6750); assert.equal(p.loanLegal.total, 6075);
  assert.equal(p.disbursements, 2000);
  assert.equal(p.cashRequired, 50_000 + 9000 + 2250 + 6750 + 6075 + 2000);
  near(p.totalInterest, p.totalRepayment - 450_000);
  const first = purchase({ price: 500_000, downPct: 10, tenureYears: 35, ratePct: 4.2, buyer: 'citizen', firstHome: true, valuationFee: 0, otherCosts: 0 });
  assert.equal(first.mot.stamp, 0); assert.equal(first.loanStamp.stamp, 0); assert.ok(first.mot.exempt);
  const over = purchase({ price: 600_000, downPct: 10, tenureYears: 35, ratePct: 4.2, buyer: 'citizen', firstHome: true, valuationFee: 0, otherCosts: 0 });
  assert.equal(over.mot.exempt, false, 'above the RM500,000 cap there is no exemption');
  const foreign = purchase({ price: 1_000_000, downPct: 30, tenureYears: 30, ratePct: 4.5, buyer: 'non_citizen', firstHome: true, valuationFee: 0, otherCosts: 0 });
  assert.equal(foreign.mot.stamp, 80_000);
});

test('K5 rental yield and ROI', () => {
  const p = purchase({ price: 500_000, downPct: 10, tenureYears: 35, ratePct: 4.2, buyer: 'citizen', firstHome: false, valuationFee: 0, otherCosts: 0 });
  const r = rental({ monthlyRent: 2000, maintenanceMonthly: 300, quitRentAssessmentYearly: 600, insuranceYearly: 400, otherMonthly: 0, vacancyMonths: 1 }, 500_000, p);
  assert.equal(r.grossYieldPct, 4.8);
  assert.equal(r.netYearly, 22000 - 3600 - 1000);
  assert.equal(r.netYieldPct, 3.48);
  near(r.cashFlowYearly, 17400 - p.monthly * 12, 0.05);
  near(r.roiPct, Math.round((r.cashFlowYearly / p.cashRequired) * 10000) / 100);
});

test('K6 sale: commission with SST, RPGT by year with exemption, net proceeds', () => {
  const s = sale({ salePrice: 800_000, purchasePrice: 500_000, purchaseCosts: 20_000, holdingYears: 3, outstandingLoan: 300_000, commissionPct: 2, commissionSst: true, earlySettlementPenalty: 0, otherSaleCosts: 0 });
  assert.equal(s.commission, 16000); assert.equal(s.commissionSst, 1280);
  const legal = 6250 + 3000;
  assert.equal(s.sellerLegal.fee, legal);
  const gain = 800_000 - 500_000 - 20_000 - (16000 + 1280 + legal * 1.08);
  near(s.gain, gain);
  assert.equal(s.rpgtPct, 30);
  near(s.exemption, Math.max(gain * 0.1, 10000));
  near(s.rpgt, (gain - s.exemption) * 0.3);
  near(s.cashAfterLoan, s.netProceeds - 300_000);
  assert.equal(sale({ salePrice: 800_000, purchasePrice: 500_000, purchaseCosts: 0, holdingYears: 6, outstandingLoan: 0, commissionPct: 2, commissionSst: false, earlySettlementPenalty: 0, otherSaleCosts: 0 }).rpgt, 0, 'no RPGT from year 6');
  assert.deepEqual(agentCommission(1_000_000, 2, true), { fee: 20000, sst: 1600, total: 21600 });
});
