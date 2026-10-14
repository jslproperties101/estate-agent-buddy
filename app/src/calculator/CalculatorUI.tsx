// Button 9 — Property Calculator (Malaysia, RM): purchase and loan, entry costs, rental yield and ROI, sale with RPGT,
// and agent commission. Every result shows its full breakdown. Rates are editable under Assumptions.
import { useMemo, useState } from 'react';
import { Lang } from '../i18n';
import { useApp } from '../data/useStore';
import { newId } from '../data/store';
import { calcStrings } from './strings';
import { Confirm, Tabs } from '../ui/common';
import {
  purchase, rental, sale, agentCommission, PurchaseInput, RentalInput, SaleInput, TierPart,
} from '../domain/calculator';
import { rm, rm2, cardTitle, Listing, rentCommissionRm } from '../listing/model';
import { MoneyInput } from '../ui/MoneyInput';
import type { CalcKind, Calculation } from '../data/types';
import { applyPropertyUpdates, buildCalculation, fromFlat, headline, proposeUpdates, PropertyUpdate, searchProperties, toFlat } from './saved';
import { PdfPreview } from '../ui/PdfPreview';
import { buildCalculationDoc } from './pdfDoc';
import { fmtDate } from '../lib/dates';

type Tab = CalcKind | 'assumptions' | 'history';

const numOf = (v: string) => { const x = parseFloat(v.replace(/[^\d.-]/g, '')); return Number.isFinite(x) ? x : 0; };

/** A number box that keeps what the agent types (e.g. "4." or "") while giving the calculation a number. */
function Num({ label, value, onChange, testId, money }: { label: string; value: number; onChange: (n: number) => void; testId?: string; money?: boolean }) {
  if (money) return <label className="ff">{label}<MoneyInput data-field={testId} value={value} onChange={n => onChange(n ?? 0)} /></label>;
  return <PlainNum label={label} value={value} onChange={onChange} testId={testId} />;
}
function PlainNum({ label, value, onChange, testId }: { label: string; value: number; onChange: (n: number) => void; testId?: string }) {
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
  const cx = t.x;
  const [propId, setPropId] = useState<string | undefined>(propertyId);
  const [contactId, setContactId] = useState<string | undefined>(undefined);
  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [name, setName] = useState('');
  const [savedMsg, setSavedMsg] = useState('');
  const [query, setQuery] = useState('');
  const [picking, setPicking] = useState(false);
  const [updFor, setUpdFor] = useState<Calculation | null>(null);
  const [pdfFor, setPdfFor] = useState<Calculation | null>(null);
  const [delId, setDelId] = useState<string | null>(null);
  const [histFilter, setHistFilter] = useState<'all' | 'property'>('all');
  const prop = state.properties.find(pp => pp.id === propId);
  /** Rates saved with a calculation that was opened from History; until the agent chooses today's rates. */
  const [override, setOverride] = useState<Record<string, number> | undefined>(undefined);
  const phoneA = useMemo(() => fromFlat(state.settings.calc), [state.settings.calc]);
  const a = useMemo(() => (override ? fromFlat(override) : phoneA), [override, phoneA]);
  const [tab, setTab] = useState<Tab>(prop?.purpose === 'rent' ? 'rental' : 'purchase');
  const price0 = prop?.askingPrice ?? 0;
  const [p, setP] = useState<PurchaseInput>({ price: price0, downPct: 10, tenureYears: 35, ratePct: 4.2, buyer: 'citizen', firstHome: false, valuationFee: 0, otherCosts: 0 });
  const [r, setR] = useState<RentalInput>({ monthlyRent: prop?.monthlyRent ?? 0, maintenanceMonthly: prop?.maintenanceFee ?? 0, quitRentAssessmentYearly: 0, insuranceYearly: 0, otherMonthly: 0, vacancyMonths: 1 });
  const [s, setS] = useState<SaleInput>({ salePrice: price0, purchasePrice: 0, purchaseCosts: 0, holdingYears: 6, outstandingLoan: 0, commissionPct: prop?.commissionPct ?? 2, commissionSst: true, earlySettlementPenalty: 0, otherSaleCosts: 0 });
  // Commission tab: a sale uses price × %; a rent-only property's commission is months of rent (Change 009), so the
  // amount starts as rent × months at 100% instead of treating the months as a percentage.
  const rentBase = (l?: Listing) => (l?.purpose === 'rent' && l.rentCommissionMonths !== undefined ? rentCommissionRm(l) : undefined);
  const [cv, setCv] = useState(() => { const rb = rentBase(prop); return rb !== undefined ? { value: rb, pct: 100, sst: true } : { value: prop?.askingPrice ?? prop?.monthlyRent ?? 0, pct: prop?.commissionPct ?? 2, sst: true }; });
  /** Choosing a property fills the price, rent, maintenance fee and commission from it (the agent can still edit them). */
  function chooseProperty(l: Listing | undefined) {
    setPropId(l?.id); setPicking(false); setQuery('');
    if (!l) return;
    setP(v => ({ ...v, price: l.askingPrice ?? v.price }));
    setR(v => ({ ...v, monthlyRent: l.monthlyRent ?? v.monthlyRent, maintenanceMonthly: l.maintenanceFee ?? v.maintenanceMonthly }));
    setS(v => ({ ...v, salePrice: l.askingPrice ?? v.salePrice, commissionPct: l.commissionPct ?? v.commissionPct }));
    setCv(v => { const rb = rentBase(l); return rb !== undefined ? { value: rb, pct: 100, sst: v.sst } : { value: l.askingPrice ?? l.monthlyRent ?? v.value, pct: l.commissionPct ?? v.pct, sst: v.sst }; });
    if (l.purpose === 'rent') setTab(tb => (tb === 'purchase' ? 'rental' : tb));
  }
  const kindOfTab = (tb: Tab): CalcKind => (tb === 'rental' || tb === 'sale' || tb === 'commission' ? tb : 'purchase');
  function save(asNew: boolean) {
    const now = Date.now();
    const inputs = { purchase: p, rental: r, sale: s, commission: cv };
    const rates = toFlat(a);
    const old = !asNew && editingId ? state.calculations.find(c => c.id === editingId) : undefined;
    const rec = old
      ? { ...buildCalculation(old.id, old.created, kindOfTab(tab), inputs, rates, { propertyId: propId, contactId, title: name }), updated: now }
      : buildCalculation(newId(), now, kindOfTab(tab), inputs, rates, { propertyId: propId, contactId, title: name });
    store.upsert('calculations', rec);
    setEditingId(rec.id); setSavedMsg(old ? cx.save.updated : cx.save.saved);
  }
  function openSaved(c: Calculation) {
    setP(c.purchase); setR(c.rental); setS(c.sale); setCv(c.commission);
    setPropId(c.propertyId); setContactId(c.contactId); setName(c.title ?? ''); setEditingId(c.id); setSavedMsg(''); setOverride(c.rates);
    // The rates saved with it are used on this screen only; the phone's own Assumptions are not changed.
    setTab(c.kind);
  }
  function startNew() { setEditingId(undefined); setName(''); setSavedMsg(''); setOverride(undefined); }
  const pr = purchase(p, a);
  const rr = rental(r, p.price, pr);
  const sr = sale(s, a);
  const cr = agentCommission(cv.value, cv.pct, cv.sst, a);
  const tiers = (parts: TierPart[]) => parts.map((tp, i) => <Row key={i} sub k={t.out.tier(rm(tp.from), rm(tp.to), tp.pct)} v={rm2(tp.amount)} />);
  const setA = (patch: Record<string, number>) => store.setSingleton('settings', { calc: { ...toFlat(phoneA), ...patch } });
  const flat = toFlat(phoneA);

  const history = [...state.calculations]
    .filter(c => histFilter === 'all' || !propId || c.propertyId === propId)
    .sort((c1, c2) => c2.updated - c1.updated);
  function currentCalc(): Calculation {
    return buildCalculation(editingId ?? 'preview', Date.now(), kindOfTab(tab), { purchase: p, rental: r, sale: s, commission: cv }, toFlat(a), { propertyId: propId, contactId, title: name });
  }

  return (
    <section className="stack calc" data-testid="calculator">
      <p className="notice">{t.estimateNote}</p>
      <div className="card stack-sm" data-testid="calc-link">
        <strong>{cx.prop.label}</strong>
        {prop ? (
          <div className="stack-sm">
            <p className="small" data-testid="calc-from">{cx.prop.chosen([prop.ref, cardTitle(prop)].filter(Boolean).join(' · '))}</p>
            <small className="muted">{cx.prop.filled}</small>
            <div className="two">
              <button type="button" className="btn small secondary" onClick={() => setPicking(true)} data-testid="calc-change-property">{cx.prop.pick}</button>
              <button type="button" className="btn small ghost" onClick={() => { setPropId(undefined); }} data-testid="calc-clear-property">{cx.prop.clear}</button>
            </div>
          </div>
        ) : <button type="button" className="btn small secondary" onClick={() => setPicking(true)} data-testid="calc-pick-property">{cx.prop.none} · {cx.prop.pick}</button>}
        {picking && (
          <div className="stack-sm" data-testid="calc-picker">
            <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder={cx.prop.search} aria-label={cx.prop.search} data-testid="calc-search" autoFocus />
            <div className="pick-list" role="listbox" aria-label={cx.prop.label}>
              {searchProperties(state.properties, query).map(l => (
                <button key={l.id} type="button" role="option" aria-selected={l.id === propId} className="pick-item" onClick={() => chooseProperty(l)} data-testid="calc-pick-item">
                  <strong>{[l.ref, cardTitle(l)].filter(Boolean).join(' · ')}</strong>
                  <small className="muted">{[l.askingPrice ? rm(l.askingPrice) : '', l.monthlyRent ? `${rm(l.monthlyRent)}/m` : ''].filter(Boolean).join(' · ')}</small>
                </button>
              ))}
              {!searchProperties(state.properties, query).length && <small className="muted" data-testid="calc-no-match">{cx.prop.noMatch}</small>}
            </div>
            <button type="button" className="btn small ghost" onClick={() => { setPicking(false); setQuery(''); }}>{t.x.upd.cancel}</button>
          </div>
        )}
        <label className="ff">{cx.client.label}
          <select value={contactId ?? ''} onChange={e => setContactId(e.target.value || undefined)} data-testid="calc-client">
            <option value="">{cx.client.none}</option>
            {[...state.contacts].sort((c1, c2) => c1.name.localeCompare(c2.name)).map(c => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</option>)}
          </select>
        </label>
      </div>
      {override && (
        <p className="notice" role="status" data-testid="calc-rates-saved">
          {cx.hist.rates} <button type="button" className="btn small ghost" onClick={() => setOverride(undefined)} data-testid="calc-use-today">{cx.hist.useToday}</button>
        </p>
      )}
      <Tabs label={t.title} value={tab} onChange={setTab} options={(['purchase', 'rental', 'sale', 'commission', 'history', 'assumptions'] as Tab[]).map(k => ({ value: k, label: k === 'history' ? cx.tab : t.tabs[k], ...(k === 'history' ? { count: state.calculations.length } : {}) }))} />

      {(tab === 'purchase' || tab === 'rental') && (
        <div className="card stack-sm">
          <Num money label={t.in.price} value={p.price} onChange={n => setP(x => ({ ...x, price: n }))} testId="price" />
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
              <Num money label={t.in.valuation} value={p.valuationFee} onChange={n => setP(x => ({ ...x, valuationFee: n }))} />
              <Num money label={t.in.other} value={p.otherCosts} onChange={n => setP(x => ({ ...x, otherCosts: n }))} />
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
            <Num money label={t.in.rent} value={r.monthlyRent} onChange={n => setR(x => ({ ...x, monthlyRent: n }))} testId="rent" />
            <div className="two">
              <Num money label={t.in.maint} value={r.maintenanceMonthly} onChange={n => setR(x => ({ ...x, maintenanceMonthly: n }))} />
              <Num label={t.in.vacancy} value={r.vacancyMonths} onChange={n => setR(x => ({ ...x, vacancyMonths: n }))} />
            </div>
            <div className="two">
              <Num money label={t.in.quit} value={r.quitRentAssessmentYearly} onChange={n => setR(x => ({ ...x, quitRentAssessmentYearly: n }))} />
              <Num money label={t.in.insurance} value={r.insuranceYearly} onChange={n => setR(x => ({ ...x, insuranceYearly: n }))} />
            </div>
            <Num money label={t.in.otherMonthly} value={r.otherMonthly} onChange={n => setR(x => ({ ...x, otherMonthly: n }))} />
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
            <Num money label={t.in.salePrice} value={s.salePrice} onChange={n => setS(x => ({ ...x, salePrice: n }))} testId="salePrice" />
            <div className="two">
              <Num money label={t.in.purchasePrice} value={s.purchasePrice} onChange={n => setS(x => ({ ...x, purchasePrice: n }))} testId="purchasePrice" />
              <Num money label={t.in.purchaseCosts} value={s.purchaseCosts} onChange={n => setS(x => ({ ...x, purchaseCosts: n }))} />
            </div>
            <div className="two">
              <Num label={t.in.years} value={s.holdingYears} onChange={n => setS(x => ({ ...x, holdingYears: n }))} testId="years" />
              <Num label={t.in.commPct} value={s.commissionPct} onChange={n => setS(x => ({ ...x, commissionPct: n }))} />
            </div>
            <label className="check"><input type="checkbox" checked={s.commissionSst} onChange={e => setS(x => ({ ...x, commissionSst: e.target.checked }))} /> {t.in.commSst}</label>
            <div className="two">
              <Num money label={t.in.loanLeft} value={s.outstandingLoan} onChange={n => setS(x => ({ ...x, outstandingLoan: n }))} />
              <Num money label={t.in.penalty} value={s.earlySettlementPenalty} onChange={n => setS(x => ({ ...x, earlySettlementPenalty: n }))} />
            </div>
            <Num money label={t.in.otherSale} value={s.otherSaleCosts} onChange={n => setS(x => ({ ...x, otherSaleCosts: n }))} />
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
            <Num money label={t.in.dealValue} value={cv.value} onChange={n => setCv(x => ({ ...x, value: n }))} testId="dealValue" />
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

      {kindOfTab(tab) === tab && (
        <div className="card stack-sm" data-testid="calc-save-bar">
          {editingId && <small className="muted" data-testid="calc-editing">{cx.save.editing(state.calculations.find(c => c.id === editingId)?.title || cx.hist.kind[tab])}</small>}
          <label className="ff">{cx.save.name}<input value={name} onChange={e => setName(e.target.value)} data-testid="calc-name" /></label>
          <div className="two">
            <button className="btn primary" onClick={() => save(false)} data-testid="calc-save">{editingId ? cx.save.update : cx.save.button}</button>
            {editingId ? <button className="btn secondary" onClick={() => save(true)} data-testid="calc-save-new">{cx.save.again}</button> : <button className="btn secondary" onClick={() => setPdfFor(currentCalc())} data-testid="calc-pdf">{cx.pdf.button}</button>}
          </div>
          {editingId && (
            <div className="two">
              <button className="btn secondary" onClick={() => setPdfFor(currentCalc())} data-testid="calc-pdf">{cx.pdf.button}</button>
              <button className="btn secondary" onClick={startNew} data-testid="calc-new">{cx.save.newCalc}</button>
            </div>
          )}
          {editingId && propId && <button className="btn secondary" onClick={() => { const c = state.calculations.find(z => z.id === editingId); if (c) setUpdFor(c); }} data-testid="calc-update-property">{cx.upd.button}</button>}
          {savedMsg && <p className="voice-msg" role="status" data-testid="calc-saved">{savedMsg}</p>}
        </div>
      )}

      {tab === 'history' && (
        <div className="stack" data-testid="calc-history">
          <strong>{cx.hist.title}</strong>
          {propId && (
            <Tabs label={cx.hist.filter} value={histFilter} onChange={setHistFilter} options={[{ value: 'all', label: cx.hist.all }, { value: 'property', label: cx.hist.thisProperty }]} />
          )}
          {!history.length && <p className="muted" data-testid="calc-history-empty">{cx.hist.empty}</p>}
          {history.map(c => {
            const hp = state.properties.find(z => z.id === c.propertyId);
            const hc = state.contacts.find(z => z.id === c.contactId);
            const h = headline(c, t);
            return (
              <div key={c.id} className="card hist-item" data-testid="calc-history-item">
                <strong>{c.title || `${cx.hist.untitled} · ${cx.hist.kind[c.kind]}`}</strong>
                <small className="muted">{cx.hist.kind[c.kind]} · {cx.hist.savedOn(fmtDate(c.updated, lang))}</small>
                <small>{h.label}: <strong>{h.value}</strong></small>
                <small className="muted">{hp ? cx.hist.forProp([hp.ref, cardTitle(hp)].filter(Boolean).join(' · ')) : cx.hist.noProp}</small>
                {hc && <small className="muted">{cx.hist.forClient(hc.name)}</small>}
                <div className="two">
                  <button className="btn small secondary" onClick={() => openSaved(c)} data-testid="calc-open">{cx.hist.open}</button>
                  <button className="btn small secondary" onClick={() => setPdfFor(c)} data-testid="calc-history-pdf">{cx.hist.pdf}</button>
                </div>
                <div className="two">
                  {hp ? <button className="btn small secondary" onClick={() => setUpdFor(c)} data-testid="calc-history-update">{cx.upd.button}</button> : <span />}
                  <button className="btn small ghost danger" onClick={() => setDelId(c.id)} data-testid="calc-delete">{cx.hist.del}</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'assumptions' && (
        <div className="card stack-sm" data-testid="assumptions">
          <strong>{t.as.mot}</strong>
          {a.motTiers.map((_, i) => <Num key={`m${i}`} label={t.as.motTier(i)} value={flat[`mot${i}`]} onChange={n => setA({ [`mot${i}`]: n })} />)}
          <Num label={t.as.nonCitizen} value={flat.nonCitizen} onChange={n => setA({ nonCitizen: n })} />
          <Num label={t.as.loanStamp} value={flat.loanStamp} onChange={n => setA({ loanStamp: n })} />
          <Num money label={t.as.firstHomeCap} value={flat.firstHomeCap} onChange={n => setA({ firstHomeCap: n })} />
          <strong>{t.as.legal}</strong>
          {a.legalTiers.map((_, i) => <Num key={`l${i}`} label={t.as.legalTier(i)} value={flat[`legal${i}`]} onChange={n => setA({ [`legal${i}`]: n })} />)}
          <Num money label={t.as.legalMin} value={flat.legalMin} onChange={n => setA({ legalMin: n })} />
          <Num label={t.as.sst} value={flat.sst} onChange={n => setA({ sst: n })} />
          <div className="two">
            <Num money label={t.as.spaDisb} value={flat.spaDisb} onChange={n => setA({ spaDisb: n })} />
            <Num money label={t.as.loanDisb} value={flat.loanDisb} onChange={n => setA({ loanDisb: n })} />
          </div>
          <strong>{t.as.rpgt}</strong>
          {a.rpgtByYear.map((_, i) => <Num key={`r${i}`} label={t.as.rpgtYear(i)} value={flat[`rpgt${i}`]} onChange={n => setA({ [`rpgt${i}`]: n })} />)}
          <div className="two">
            <Num label={t.as.rpgtExemptPct} value={flat.rpgtExemptPct} onChange={n => setA({ rpgtExemptPct: n })} />
            <Num money label={t.as.rpgtExemptMin} value={flat.rpgtExemptMin} onChange={n => setA({ rpgtExemptMin: n })} />
          </div>
          <small className="muted">{t.as.saved}</small>
          <small className="muted">{t.as.sources}</small>
          <button className="btn secondary" onClick={() => store.setSingleton('settings', { calc: undefined })}>{t.as.reset}</button>
        </div>
      )}
      {updFor && <UpdateSheet lang={lang} calc={updFor} onClose={() => setUpdFor(null)} />}
      {pdfFor && (
        <PdfPreview lang={lang} title={pdfFor.title || `${cx.pdf.title} – ${cx.hist.kind[pdfFor.kind]}`} onClose={() => setPdfFor(null)}
          build={async () => buildCalculationDoc(pdfFor, { lang, property: state.properties.find(z => z.id === pdfFor.propertyId), contact: state.contacts.find(z => z.id === pdfFor.contactId), agent: state.profile, now: Date.now() })} />
      )}
      {delId && (
        <Confirm lang={lang} title={cx.hist.delTitle} body={cx.hist.delBody} okLabel={cx.hist.del}
          onOk={() => { store.remove('calculations', delId); if (delId === editingId) startNew(); setDelId(null); }} onCancel={() => setDelId(null)} />
      )}
    </section>
  );
}

/** Reviewable update of the property record: shows now → new for each value, nothing changes until the agent confirms. */
function UpdateSheet({ lang, calc, onClose }: { lang: Lang; calc: Calculation; onClose: () => void }) {
  const { state, store } = useApp();
  const u = calcStrings[lang].x.upd;
  const prop = state.properties.find(z => z.id === calc.propertyId);
  const updates = useMemo(() => (prop ? proposeUpdates(calc, prop) : []), [calc, prop]);
  const [on, setOn] = useState<Record<string, boolean>>(() => Object.fromEntries(updates.map(z => [z.key, true])));
  const label = (k: PropertyUpdate['key']) => (k === 'askingPrice' ? u.price : k === 'monthlyRent' ? u.rent : k === 'maintenanceFee' ? u.maint : u.comm);
  const show = (k: PropertyUpdate['key'], v: number | undefined) => (v === undefined ? '—' : k === 'commissionPct' ? `${v}%` : rm2(v));
  const chosen = updates.filter(z => on[z.key]);
  return (
    <div className="scrim" role="presentation">
      <div className="dialog" role="dialog" aria-modal="true" aria-label={u.title} data-testid="calc-update-sheet">
        <h2>{u.title}</h2>
        {!prop && <p className="warn-text" data-testid="calc-update-gone">{u.gone}</p>}
        {prop && <small className="muted">{[prop.ref, cardTitle(prop)].filter(Boolean).join(' · ')}</small>}
        {prop && !updates.length && <p data-testid="calc-update-nothing">{u.nothing}</p>}
        {prop && updates.length > 0 && (
          <>
            <p>{u.intro}</p>
            <ul className="prop-list">
              {updates.map(z => (
                <li key={z.key} className={on[z.key] ? 'on' : ''}>
                  <label className="upd-row">
                    <input type="checkbox" checked={!!on[z.key]} onChange={e => setOn(v => ({ ...v, [z.key]: e.target.checked }))} aria-label={label(z.key)} data-testid={`upd-${z.key}`} />
                    <span className="prop-main">
                      <span className="prop-label">{label(z.key)}</span>
                      <span className="prop-before">{u.now}: {show(z.key, z.current)}</span>
                      <span className="prop-after">{u.next}: {show(z.key, z.proposed)}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="two">
          <button className="btn secondary" onClick={onClose} data-testid="calc-update-cancel">{u.cancel}</button>
          <button className="btn primary" disabled={!prop || !chosen.length} data-testid="calc-update-apply"
            onClick={() => { if (!prop) return; store.upsert('properties', applyPropertyUpdates(prop, chosen, Date.now(), `${u.summary}: ${chosen.map(z => label(z.key)).join(', ')}`)); onClose(); }}>{u.apply}</button>
        </div>
      </div>
    </div>
  );
}

