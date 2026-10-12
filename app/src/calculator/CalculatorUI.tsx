// Button 9 — Property Calculator (Malaysia, RM): purchase and loan, entry costs, rental yield and ROI, sale with RPGT,
// and agent commission. Every result shows its full breakdown. Rates are editable under Assumptions.
import { useMemo, useState } from 'react';
import { Lang } from '../i18n';
import { useApp } from '../data/useStore';
import { calcStrings } from './strings';
import { Tabs } from '../ui/common';
import {
  Assumptions, DEFAULT_ASSUMPTIONS, purchase, rental, sale, agentCommission, PurchaseInput, RentalInput, SaleInput, TierPart,
} from '../domain/calculator';
import { rm, rm2, cardTitle } from '../listing/model';

type Tab = 'purchase' | 'rental' | 'sale' | 'commission' | 'assumptions';

/** Rates are kept on the phone as plain numbers. */
function toFlat(a: Assumptions): Record<string, number> {
  const f: Record<string, number> = {
    nonCitizen: a.nonCitizenMotPct, loanStamp: a.loanStampPct, legalMin: a.legalMin, sst: a.sstPct, spaDisb: a.spaDisbursements,
    loanDisb: a.loanDisbursements, firstHomeCap: a.firstHomeCap, rpgtExemptPct: a.rpgtExemptPct, rpgtExemptMin: a.rpgtExemptMin,
  };
  a.motTiers.forEach((t, i) => { f[`mot${i}`] = t.pct; });
  a.legalTiers.forEach((t, i) => { f[`legal${i}`] = t.pct; });
  a.rpgtByYear.forEach((p, i) => { f[`rpgt${i}`] = p; });
  return f;
}
function fromFlat(f: Record<string, number> | undefined): Assumptions {
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

const numOf = (v: string) => { const x = parseFloat(v.replace(/[^\d.-]/g, '')); return Number.isFinite(x) ? x : 0; };

/** A number box that keeps what the agent types (e.g. "4." or "") while giving the calculation a number. */
function Num({ label, value, onChange, testId }: { label: string; value: number; onChange: (n: number) => void; testId?: string }) {
  const [text, setText] = useState(String(value));
  const shown = numOf(text) === value ? text : String(value);
  return <label className="ff">{label}<input inputMode="decimal" data-field={testId} value={shown} onChange={e => { setText(e.target.value); onChange(numOf(e.target.value)); }} /></label>;
}

function Row({ k, v, strong, sub, testId }: { k: string; v: string; strong?: boolean; sub?: boolean; testId?: string }) {
  return <div className={`calc-row ${strong ? 'strong' : ''} ${sub ? 'sub' : ''}`}><span>{k}</span><span data-testid={testId}>{v}</span></div>;
}

export function CalculatorScreen({ lang, propertyId }: { lang: Lang; propertyId?: string }) {
  const { state, store } = useApp();
  const t = calcStrings[lang];
  const prop = state.properties.find(p => p.id === propertyId);
  const a = useMemo(() => fromFlat(state.settings.calc), [state.settings.calc]);
  const [tab, setTab] = useState<Tab>(prop?.purpose === 'rent' ? 'rental' : 'purchase');
  const price0 = prop?.askingPrice ?? 0;
  const [p, setP] = useState<PurchaseInput>({ price: price0, downPct: 10, tenureYears: 35, ratePct: 4.2, buyer: 'citizen', firstHome: false, valuationFee: 0, otherCosts: 0 });
  const [r, setR] = useState<RentalInput>({ monthlyRent: prop?.monthlyRent ?? 0, maintenanceMonthly: prop?.maintenanceFee ?? 0, quitRentAssessmentYearly: 0, insuranceYearly: 0, otherMonthly: 0, vacancyMonths: 1 });
  const [s, setS] = useState<SaleInput>({ salePrice: price0, purchasePrice: 0, purchaseCosts: 0, holdingYears: 6, outstandingLoan: 0, commissionPct: prop?.commissionPct ?? 2, commissionSst: true, earlySettlementPenalty: 0, otherSaleCosts: 0 });
  const [cv, setCv] = useState({ value: prop?.askingPrice ?? prop?.monthlyRent ?? 0, pct: prop?.commissionPct ?? 2, sst: true });
  const pr = purchase(p, a);
  const rr = rental(r, p.price, pr);
  const sr = sale(s, a);
  const cr = agentCommission(cv.value, cv.pct, cv.sst, a);
  const tiers = (parts: TierPart[]) => parts.map((x, i) => <Row key={i} sub k={t.out.tier(rm(x.from), rm(x.to), x.pct)} v={rm2(x.amount)} />);
  const setA = (patch: Record<string, number>) => store.setSingleton('settings', { calc: { ...toFlat(a), ...patch } });
  const flat = toFlat(a);

  return (
    <section className="stack calc" data-testid="calculator">
      {prop && <p className="small muted" data-testid="calc-from">{t.fromProperty([prop.ref, cardTitle(prop)].filter(Boolean).join(' · '))}</p>}
      <p className="notice">{t.estimateNote}</p>
      <Tabs label={t.title} value={tab} onChange={setTab} options={(['purchase', 'rental', 'sale', 'commission', 'assumptions'] as Tab[]).map(x => ({ value: x, label: t.tabs[x] }))} />

      {(tab === 'purchase' || tab === 'rental') && (
        <div className="card stack-sm">
          <Num label={t.in.price} value={p.price} onChange={n => setP(x => ({ ...x, price: n }))} testId="price" />
          <div className="two">
            <Num label={t.in.downPct} value={p.downPct} onChange={n => setP(x => ({ ...x, downPct: n }))} testId="downPct" />
            <Num label={t.in.tenure} value={p.tenureYears} onChange={n => setP(x => ({ ...x, tenureYears: n }))} testId="tenure" />
          </div>
          <Num label={t.in.rate} value={p.ratePct} onChange={n => setP(x => ({ ...x, ratePct: n }))} testId="rate" />
          {tab === 'purchase' && <>
            <label className="ff">{t.in.buyer}
              <select value={p.buyer} onChange={e => setP(x => ({ ...x, buyer: e.target.value as PurchaseInput['buyer'] }))}>
                <option value="citizen">{t.in.citizen}</option><option value="non_citizen">{t.in.nonCitizen}</option>
              </select>
            </label>
            {p.buyer === 'citizen' && <label className="check"><input type="checkbox" checked={p.firstHome} onChange={e => setP(x => ({ ...x, firstHome: e.target.checked }))} /> {t.in.firstHome} (≤ {rm(a.firstHomeCap)})</label>}
            <div className="two">
              <Num label={t.in.valuation} value={p.valuationFee} onChange={n => setP(x => ({ ...x, valuationFee: n }))} />
              <Num label={t.in.other} value={p.otherCosts} onChange={n => setP(x => ({ ...x, otherCosts: n }))} />
            </div>
          </>}
        </div>
      )}

      {tab === 'purchase' && (
        <div className="card stack-sm calc-out" data-testid="purchase-result">
          <Row k={t.out.downPayment} v={rm2(pr.downPayment)} testId="out-down" />
          <Row k={t.out.loan} v={rm2(pr.loan)} testId="out-loan" />
          <Row k={t.out.monthly} v={rm2(pr.monthly)} strong testId="out-monthly" />
          <Row k={t.out.totalInterest} v={rm2(pr.totalInterest)} testId="out-interest" />
          <Row k={t.out.totalRepayment} v={rm2(pr.totalRepayment)} testId="out-repay" />
          <hr />
          <Row k={t.out.mot} v={rm2(pr.mot.stamp)} testId="out-mot" />
          {pr.mot.exempt ? <Row sub k={t.out.motExempt} v="RM 0.00" /> : pr.mot.flat ? <Row sub k={t.out.motFlat(a.nonCitizenMotPct)} v={rm2(pr.mot.stamp)} /> : tiers(pr.mot.parts)}
          <Row k={`${t.out.loanStamp} (${a.loanStampPct}%)`} v={rm2(pr.loanStamp.stamp)} testId="out-loanstamp" />
          {pr.loanStamp.exempt && <Row sub k={t.out.motExempt} v="RM 0.00" />}
          <Row k={t.out.spaLegal} v={rm2(pr.spaLegal.total)} testId="out-spa-legal" />
          {tiers(pr.spaLegal.parts)}<Row sub k={t.out.sst(a.sstPct)} v={rm2(pr.spaLegal.sst)} />
          <Row k={t.out.loanLegal} v={rm2(pr.loanLegal.total)} testId="out-loan-legal" />
          {tiers(pr.loanLegal.parts)}<Row sub k={t.out.sst(a.sstPct)} v={rm2(pr.loanLegal.sst)} />
          <Row k={t.out.disb} v={rm2(pr.disbursements)} />
          {pr.valuationFee > 0 && <Row k={t.out.valuation} v={rm2(pr.valuationFee)} />}
          {pr.otherCosts > 0 && <Row k={t.out.other} v={rm2(pr.otherCosts)} />}
          <Row k={t.out.entry} v={rm2(pr.entryCosts)} />
          <Row k={t.out.cash} v={rm2(pr.cashRequired)} strong testId="out-cash" />
          <small className="muted">{t.estimateNote}</small>
        </div>
      )}

      {tab === 'rental' && (
        <>
          <div className="card stack-sm">
            <Num label={t.in.rent} value={r.monthlyRent} onChange={n => setR(x => ({ ...x, monthlyRent: n }))} testId="rent" />
            <div className="two">
              <Num label={t.in.maint} value={r.maintenanceMonthly} onChange={n => setR(x => ({ ...x, maintenanceMonthly: n }))} />
              <Num label={t.in.vacancy} value={r.vacancyMonths} onChange={n => setR(x => ({ ...x, vacancyMonths: n }))} />
            </div>
            <div className="two">
              <Num label={t.in.quit} value={r.quitRentAssessmentYearly} onChange={n => setR(x => ({ ...x, quitRentAssessmentYearly: n }))} />
              <Num label={t.in.insurance} value={r.insuranceYearly} onChange={n => setR(x => ({ ...x, insuranceYearly: n }))} />
            </div>
            <Num label={t.in.otherMonthly} value={r.otherMonthly} onChange={n => setR(x => ({ ...x, otherMonthly: n }))} />
          </div>
          <div className="card stack-sm calc-out" data-testid="rental-result">
            <Row k={t.out.grossYearly} v={rm2(rr.grossYearly)} />
            <Row k={t.out.effective} v={rm2(rr.effectiveYearly)} />
            <Row k={t.out.costs} v={rm2(rr.costsYearly)} />
            <Row k={t.out.netYearly} v={rm2(rr.netYearly)} />
            <Row k={t.out.grossYield} v={`${rr.grossYieldPct.toFixed(2)}%`} strong testId="out-gross-yield" />
            <Row k={t.out.netYield} v={`${rr.netYieldPct.toFixed(2)}%`} strong testId="out-net-yield" />
            <hr />
            <Row k={`${t.out.monthly} (${t.out.loan} ${rm(pr.loan)})`} v={rm2(pr.monthly)} />
            <Row k={t.out.mortgageYearly} v={rm2(rr.mortgageYearly)} />
            <Row k={`${t.out.cashFlow} · ${t.out.perYear}`} v={rm2(rr.cashFlowYearly)} />
            <Row k={`${t.out.cashFlow} · ${t.out.perMonth}`} v={rm2(rr.cashFlowMonthly)} />
            <Row k={t.out.cash} v={rm2(pr.cashRequired)} />
            <Row k={t.out.roi} v={`${rr.roiPct.toFixed(2)}%`} strong testId="out-roi" />
            <small className="muted">{t.out.roiHelp}</small>
          </div>
        </>
      )}

      {tab === 'sale' && (
        <>
          <div className="card stack-sm">
            <Num label={t.in.salePrice} value={s.salePrice} onChange={n => setS(x => ({ ...x, salePrice: n }))} testId="salePrice" />
            <div className="two">
              <Num label={t.in.purchasePrice} value={s.purchasePrice} onChange={n => setS(x => ({ ...x, purchasePrice: n }))} testId="purchasePrice" />
              <Num label={t.in.purchaseCosts} value={s.purchaseCosts} onChange={n => setS(x => ({ ...x, purchaseCosts: n }))} />
            </div>
            <div className="two">
              <Num label={t.in.years} value={s.holdingYears} onChange={n => setS(x => ({ ...x, holdingYears: n }))} testId="years" />
              <Num label={t.in.commPct} value={s.commissionPct} onChange={n => setS(x => ({ ...x, commissionPct: n }))} />
            </div>
            <label className="check"><input type="checkbox" checked={s.commissionSst} onChange={e => setS(x => ({ ...x, commissionSst: e.target.checked }))} /> {t.in.commSst}</label>
            <div className="two">
              <Num label={t.in.loanLeft} value={s.outstandingLoan} onChange={n => setS(x => ({ ...x, outstandingLoan: n }))} />
              <Num label={t.in.penalty} value={s.earlySettlementPenalty} onChange={n => setS(x => ({ ...x, earlySettlementPenalty: n }))} />
            </div>
            <Num label={t.in.otherSale} value={s.otherSaleCosts} onChange={n => setS(x => ({ ...x, otherSaleCosts: n }))} />
          </div>
          <div className="card stack-sm calc-out" data-testid="sale-result">
            <Row k={`${t.out.commission} (${s.commissionPct}%)`} v={rm2(sr.commission)} />
            {s.commissionSst && <Row sub k={t.out.commissionSst} v={rm2(sr.commissionSst)} />}
            <Row k={t.out.sellerLegal} v={rm2(sr.sellerLegal.total)} />
            {s.otherSaleCosts > 0 && <Row k={t.out.other} v={rm2(s.otherSaleCosts)} />}
            <Row k={t.out.saleCosts} v={rm2(sr.saleCosts)} />
            <hr />
            <Row k={t.out.gain} v={rm2(sr.gain)} testId="out-gain" />
            <Row k={t.out.exemption} v={rm2(sr.exemption)} />
            <Row k={t.out.chargeable} v={rm2(sr.chargeableGain)} />
            <Row k={t.out.rpgtRate} v={`${sr.rpgtPct}%`} />
            <Row k={t.out.rpgt} v={rm2(sr.rpgt)} testId="out-rpgt" />
            <hr />
            <Row k={t.out.net} v={rm2(sr.netProceeds)} strong testId="out-net" />
            <Row k={t.out.afterLoan} v={rm2(sr.cashAfterLoan)} strong testId="out-after-loan" />
          </div>
        </>
      )}

      {tab === 'commission' && (
        <>
          <div className="card stack-sm">
            <Num label={t.in.dealValue} value={cv.value} onChange={n => setCv(x => ({ ...x, value: n }))} testId="dealValue" />
            <Num label={t.in.commPct} value={cv.pct} onChange={n => setCv(x => ({ ...x, pct: n }))} testId="commPct" />
            <label className="check"><input type="checkbox" checked={cv.sst} onChange={e => setCv(x => ({ ...x, sst: e.target.checked }))} /> {t.in.commSst}</label>
          </div>
          <div className="card stack-sm calc-out" data-testid="commission-result">
            <Row k={`${t.out.fee} (${cv.pct}%)`} v={rm2(cr.fee)} />
            {cv.sst && <Row sub k={t.out.sst(a.sstPct)} v={rm2(cr.sst)} />}
            <Row k={t.out.total} v={rm2(cr.total)} strong testId="out-comm-total" />
          </div>
        </>
      )}

      {tab === 'assumptions' && (
        <div className="card stack-sm" data-testid="assumptions">
          <strong>{t.as.mot}</strong>
          {a.motTiers.map((_, i) => <Num key={`m${i}`} label={t.as.motTier(i)} value={flat[`mot${i}`]} onChange={n => setA({ [`mot${i}`]: n })} />)}
          <Num label={t.as.nonCitizen} value={flat.nonCitizen} onChange={n => setA({ nonCitizen: n })} />
          <Num label={t.as.loanStamp} value={flat.loanStamp} onChange={n => setA({ loanStamp: n })} />
          <Num label={t.as.firstHomeCap} value={flat.firstHomeCap} onChange={n => setA({ firstHomeCap: n })} />
          <strong>{t.as.legal}</strong>
          {a.legalTiers.map((_, i) => <Num key={`l${i}`} label={t.as.legalTier(i)} value={flat[`legal${i}`]} onChange={n => setA({ [`legal${i}`]: n })} />)}
          <Num label={t.as.legalMin} value={flat.legalMin} onChange={n => setA({ legalMin: n })} />
          <Num label={t.as.sst} value={flat.sst} onChange={n => setA({ sst: n })} />
          <div className="two">
            <Num label={t.as.spaDisb} value={flat.spaDisb} onChange={n => setA({ spaDisb: n })} />
            <Num label={t.as.loanDisb} value={flat.loanDisb} onChange={n => setA({ loanDisb: n })} />
          </div>
          <strong>{t.as.rpgt}</strong>
          {a.rpgtByYear.map((_, i) => <Num key={`r${i}`} label={t.as.rpgtYear(i)} value={flat[`rpgt${i}`]} onChange={n => setA({ [`rpgt${i}`]: n })} />)}
          <div className="two">
            <Num label={t.as.rpgtExemptPct} value={flat.rpgtExemptPct} onChange={n => setA({ rpgtExemptPct: n })} />
            <Num label={t.as.rpgtExemptMin} value={flat.rpgtExemptMin} onChange={n => setA({ rpgtExemptMin: n })} />
          </div>
          <small className="muted">{t.as.saved}</small>
          <small className="muted">{t.as.sources}</small>
          <button className="btn secondary" onClick={() => store.setSingleton('settings', { calc: undefined })}>{t.as.reset}</button>
        </div>
      )}
    </section>
  );
}
