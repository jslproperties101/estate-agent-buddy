// AI Buddy POS (Phase 1): the accounting suite's screen. One ledger behind every tab: POS sales, invoices, receipts and
// payroll all post journal entries, and the reports read only posted entries. Opened from Agent Financial when the
// feature switch is on (buddy/access.ts).
import { useState, type ReactNode } from 'react';
import type { Lang } from '../i18n';
import { useApp } from '../data/useStore';
import { newId, AccessError, type Store } from '../data/store';
import { config } from '../config';
import { ymd } from '../lib/dates';
import type { Go } from '../nav';
import { Confirm, Empty, Tabs } from '../ui/common';
import { Select } from '../ui/Select';
import { MoneyInput } from '../ui/MoneyInput';
import { useToast } from '../ui/toast';
import { buddyStrings, type BuddyStrings } from './strings';
import type {
  AcctEinvoice, AcctInvoice, AcctJournal, AcctLead, AcctProduct, AcctProfile, AcctStaff, JournalLine, Party, PayMethod, SaleLine,
} from './model';
import {
  ACCOUNTS, BuddyError, balanced, balanceSheet, cleanLines, hoursWorked, insights, makeSale, monthEnd, newJournal, nextStage, payInvoice, payslip,
  postInvoice, postJournal, profitAndLoss, r2, reverseJournal, runPayroll, sumCr, sumDr, totals, trialBalance, SINGLE_EINV_LIMIT, type Insight,
} from './engine';
import { STATE_CODES, buildUBL, canCancel, check, consolidate, einvFromInvoice, einvFromSale, shareUrl } from './einvoice';
import { MyinvoisError, applyAnswer, cancelEinvoice, einvoiceStatus, submitEinvoice } from './myinvoisClient';
import { sampleBooks, DEFAULT_PRODUCTS } from './sample';

export type BuddyTab = 'overview' | 'pos' | 'invoices' | 'customers' | 'people' | 'journal' | 'einvoice' | 'reports' | 'setup';
const TABS: BuddyTab[] = ['overview', 'pos', 'invoices', 'customers', 'people', 'journal', 'einvoice', 'reports', 'setup'];
const ids = { id: newId, now: () => Date.now() };
const money = (n: number) => `RM ${r2(n).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fig = (n: number) => r2(n).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nowHm = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const nowHms = () => `${new Date().toISOString().slice(11, 19)}`;
const emptyParty = (state = '14'): Party => ({ name: '', tin: '', brn: '', addr: '', city: '', state, postcode: '', email: '', phone: '' });
const num = (v: string) => { const x = parseFloat(v.replace(/[^\d.]/g, '')); return Number.isFinite(x) ? x : 0; };

/** Runs a change and turns the ledger's refusals into a toast in the person's language. */
function useRun(s: BuddyStrings) {
  const toast = useToast();
  return (fn: () => string | void) => {
    try { const ok = fn(); if (ok) toast(ok); return true; }
    catch (e) {
      if (e instanceof BuddyError) { toast(s.err[e.code] ?? e.code, 'error'); return false; }
      if (e instanceof AccessError) { toast(s.locked, 'error'); return false; }
      throw e;
    }
  };
}

function Pill({ st, s }: { st: string; s: BuddyStrings }) {
  const cls = ({ posted: 'acc', paid: 'ok', valid: 'ok', ready: 'warn', invalid: 'bad', reversed: 'warn', submitted: 'acc', won: 'ok', lost: '' } as Record<string, string>)[st] ?? '';
  return <span className={`bp-pill ${cls}`} data-status={st}>{s.status[st] ?? s.stage[st] ?? st}</span>;
}

export function BuddyScreen({ lang, go, tab = 'overview' }: { lang: Lang; go: Go; tab?: BuddyTab }) {
  const s = buddyStrings[lang];
  const set = (t: BuddyTab) => go({ name: 'buddy', tab: t }, { replace: true });
  return (
    <section className="stack buddy" data-testid="buddy">
      <Tabs label={s.title} value={tab} onChange={set} options={TABS.map(t => ({ value: t, label: s.tabs[t] }))} />
      {tab === 'overview' && <Overview s={s} set={set} />}
      {tab === 'pos' && <Pos s={s} />}
      {tab === 'invoices' && <Invoices s={s} set={set} lang={lang} />}
      {tab === 'customers' && <Customers s={s} set={set} />}
      {tab === 'people' && <People s={s} />}
      {tab === 'journal' && <Journal s={s} lang={lang} />}
      {tab === 'einvoice' && <Einvoices s={s} />}
      {tab === 'reports' && <Reports s={s} />}
      {tab === 'setup' && <Setup s={s} />}
    </section>
  );
}

// ---------- shared ----------
function Card({ title, children, testId }: { title?: ReactNode; children: ReactNode; testId?: string }) {
  return <div className="card stack-sm" data-testid={testId}>{title && <div className="card-title">{title}</div>}{children}</div>;
}
function PartyFields({ s, value, onChange, prefix }: { s: BuddyStrings; value: Party; onChange: (p: Party) => void; prefix: string }) {
  const f = (k: keyof Party, label: string, extra: { hint?: string } = {}) => (
    <label className="ff">{label}
      <input data-testid={`${prefix}-${k}`} value={value[k] ?? ''} onChange={e => onChange({ ...value, [k]: k === 'tin' ? e.target.value.toUpperCase() : e.target.value })} />
      {extra.hint && <small className="muted">{extra.hint}</small>}
    </label>
  );
  return (
    <div className="stack-sm">
      {f('name', s.p.name)}
      <div className="two">{f('tin', s.p.tin, { hint: s.tinHint })}{f('brn', s.p.brn)}</div>
      {f('addr', s.p.addr)}
      <div className="two">{f('city', s.p.city)}
        <label className="ff">{s.p.state}<Select data-testid={`${prefix}-state`} value={value.state} onChange={e => onChange({ ...value, state: e.target.value })}>{STATE_CODES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</Select></label>
      </div>
      <div className="two">{f('postcode', s.p.postcode)}{f('phone', s.p.phone)}</div>
      {f('email', s.p.email)}
    </div>
  );
}
const useBooks = () => {
  const { state, store } = useApp();
  const books = { journals: state.acctJournals, invoices: state.acctInvoices, sales: state.acctSales, einvoices: state.acctEinvoices, leads: state.acctLeads,
    staff: state.acctStaff, attendance: state.acctAttendance, payruns: state.acctPayruns, products: state.acctProducts, profile: state.acctProfile };
  return { state, store, books, company: state.acctProfile.find(p => p.id === 'company') };
};
const hasSample = (b: ReturnType<typeof useBooks>['books']) => Object.values(b).some(list => (list as { sample?: boolean }[]).some(r => r.sample));

function loadSample(store: Store) {
  const b = sampleBooks(ids, ymd(new Date()));
  b.journals.forEach(r => store.upsert('acctJournals', r)); b.invoices.forEach(r => store.upsert('acctInvoices', r)); b.sales.forEach(r => store.upsert('acctSales', r));
  b.einvoices.forEach(r => store.upsert('acctEinvoices', r)); b.leads.forEach(r => store.upsert('acctLeads', r)); b.staff.forEach(r => store.upsert('acctStaff', r));
  b.attendance.forEach(r => store.upsert('acctAttendance', r)); b.payruns.forEach(r => store.upsert('acctPayruns', r)); b.products.forEach(r => store.upsert('acctProducts', r));
  if (!store.getState().acctProfile.some(p => p.id === 'company')) b.profile.forEach(r => store.upsert('acctProfile', r));
}
function removeSample(store: Store) {
  const st = store.getState();
  for (const c of ['acctJournals', 'acctInvoices', 'acctSales', 'acctEinvoices', 'acctLeads', 'acctStaff', 'acctAttendance', 'acctPayruns', 'acctProducts', 'acctProfile'] as const)
    for (const r of st[c] as { id: string; sample?: boolean }[]) if (r.sample) store.remove(c, r.id);
}

// ---------- overview ----------
function insightText(s: BuddyStrings, i: Insight): string {
  switch (i.key) {
    case 'overdue': return s.ins.overdue(i.count ?? 0, money(i.amount ?? 0));
    case 'receivables': return s.ins.receivables(money(i.amount ?? 0));
    case 'followup': return s.ins.followup((i.names ?? []).join(', '));
    case 'runway': return s.ins.runway(i.months ?? 0);
    case 'payroll': return s.ins.payroll;
    case 'sst': return s.ins.sst(money(i.amount ?? 0));
    case 'einvoice': return s.ins.einvoice(i.count ?? 0);
  }
}
function Overview({ s, set }: { s: BuddyStrings; set: (t: BuddyTab) => void }) {
  const { store, books } = useBooks();
  const run = useRun(s);
  const today = ymd(new Date()), m = today.slice(0, 7);
  const p = profitAndLoss(books.journals, `${m}-01`, monthEnd(m));
  const cash = r2(books.journals.length ? balanceSheet(books.journals).assets.filter(a => a.acc.code === '1000' || a.acc.code === '1010').reduce((x, a) => x + a.amount, 0) : 0);
  const ar = balanceSheet(books.journals).assets.find(a => a.acc.code === '1100')?.amount ?? 0;
  const none = !books.journals.length && !books.invoices.length && !books.sales.length;
  return (
    <>
      {none ? (
        <Card testId="bp-empty">
          <p>{s.empty}</p>
          <div className="two">
            <button className="btn primary" data-testid="bp-load-sample" onClick={() => run(() => { loadSample(store); return s.sampleLoaded; })}>{s.loadSample}</button>
            <button className="btn secondary" onClick={() => set('setup')}>{s.goSetup}</button>
          </div>
        </Card>
      ) : hasSample(books) && (
        <div className="card between" data-testid="bp-sample-on"><small className="muted">{s.sampleOn}</small>
          <button className="btn small secondary" data-testid="bp-remove-sample" onClick={() => run(() => { removeSample(store); return s.sampleRemoved; })}>{s.removeSample}</button></div>
      )}
      <div className="fin-grid">
        <div className="fin-card gold"><span>{s.kpi.net}</span><strong data-testid="bp-net" className={p.net < 0 ? 'neg' : ''}>{money(p.net)}</strong></div>
        <div className="fin-card"><span>{s.kpi.revenue}</span><strong data-testid="bp-revenue">{money(p.totalIncome)}</strong></div>
        <div className="fin-card"><span>{s.kpi.expenses}</span><strong>{money(p.totalExpenses)}</strong></div>
        <div className="fin-card"><span>{s.kpi.receivables}</span><strong data-testid="bp-ar">{money(ar)}</strong></div>
        <div className="fin-card"><span>{s.kpi.cash}</span><strong>{money(cash)}</strong></div>
      </div>
      {!none && (
        <Card title={s.insightsTitle} testId="bp-insights">
          <ul className="bp-list">{insights(books, today).map(i => <li key={i.key} data-insight={i.key}>{insightText(s, i)}</li>)}</ul>
          <small className="muted">{s.insightsHint}</small>
        </Card>
      )}
    </>
  );
}

// ---------- POS ----------
function Pos({ s }: { s: BuddyStrings }) {
  const { store, books } = useBooks();
  const run = useRun(s);
  const [cart, setCart] = useState<{ pid: string; qty: number }[]>([]);
  const [method, setMethod] = useState<PayMethod>('cash');
  const [wants, setWants] = useState(false);
  const [buyer, setBuyer] = useState<Party>(emptyParty('10'));
  const products = books.products.length ? books.products.filter(p => p.active).sort((x, y) => x.name.localeCompare(y.name)) : DEFAULT_PRODUCTS.map((p, i) => ({ ...p, id: `default-${i}`, created: 0, updated: 0 }) as AcctProduct);
  const lines: SaleLine[] = cart.map(c => { const p = products.find(x => x.id === c.pid)!; return { desc: p.name, qty: c.qty, price: p.price, taxPct: p.taxPct, acc: p.acc }; }).filter(l => l.desc);
  const t = totals(lines);
  const over = t.total > SINGLE_EINV_LIMIT, need = wants || over;
  const add = (pid: string) => setCart(c => c.some(x => x.pid === pid) ? c.map(x => (x.pid === pid ? { ...x, qty: x.qty + 1 } : x)) : [...c, { pid, qty: 1 }]);
  const step = (pid: string, d: number) => setCart(c => c.map(x => (x.pid === pid ? { ...x, qty: x.qty + d } : x)).filter(x => x.qty > 0));
  const charge = () => run(() => {
    if (need && !(buyer.name.trim() && buyer.tin.trim())) throw new BuddyError('needs-buyer');
    const r = makeSale(ids, { date: ymd(new Date()), time: nowHms(), lines, method, buyer: need ? { ...buyer, tin: buyer.tin.trim().toUpperCase() } : undefined }, books.sales, books.journals);
    store.upsert('acctJournals', r.journal);
    let sale = r.sale;
    if (sale.buyer) { const e = einvFromSale(ids, sale); store.upsert('acctEinvoices', e); sale = { ...sale, einvId: e.id }; }
    store.upsert('acctSales', sale);
    setCart([]); setWants(false); setBuyer(emptyParty('10'));
    return s.charged(sale.no, money(sale.total));
  });
  const recent = [...books.sales].sort((a, b) => (a.no < b.no ? 1 : -1)).slice(0, 20);
  return (
    <>
      <Card title={s.services}>
        <div className="chip-grid bp-products">{products.map(p => (
          <button key={p.id} type="button" className="chip-btn" data-testid="bp-product" onClick={() => add(p.id)}>
            <span>{p.name}</span><small>{money(p.price)}{p.taxPct ? ` ${s.plusSst}` : ''}</small>
          </button>))}</div>
      </Card>
      <Card title={s.currentSale} testId="bp-cart">
        {!lines.length ? <Empty>{s.tapToAdd}</Empty> : cart.map(c => { const p = products.find(x => x.id === c.pid)!; return (
          <div className="between bp-line" key={c.pid}><span>{p.name}</span>
            <span className="bp-qty"><button className="icon-btn" aria-label={s.less} onClick={() => step(c.pid, -1)}>−</button><b>{c.qty}</b><button className="icon-btn" aria-label={s.more} onClick={() => step(c.pid, 1)}>+</button></span>
            <span className="bp-num">{fig(p.price * c.qty)}</span></div>); })}
        <div className="between"><span>{s.subtotal}</span><span className="bp-num">{fig(t.sub)}</span></div>
        <div className="between"><span>{s.serviceTax}</span><span className="bp-num">{fig(t.tax)}</span></div>
        <div className="between bp-total"><strong>{s.total}</strong><strong className="bp-num" data-testid="bp-cart-total">{money(t.total)}</strong></div>
        <div className="chip-row" role="group">{(['cash', 'card', 'qr'] as PayMethod[]).map(k => <button key={k} type="button" className="chip-btn" aria-pressed={method === k} onClick={() => setMethod(k)}>{s.method[k]}</button>)}</div>
        <label className="check"><input type="checkbox" data-testid="bp-wants-einv" checked={need} disabled={over} onChange={e => setWants(e.target.checked)} /> {s.wantsEinv}{over ? ` · ${s.einvRequired}` : ''}</label>
        {need && <PartyFields s={s} value={buyer} onChange={setBuyer} prefix="bp-buyer" />}
        <button className="btn primary" data-testid="bp-charge" disabled={!lines.length} onClick={charge}>{s.charge(money(t.total))}</button>
      </Card>
      <Card title={s.receipts}>
        {!recent.length ? <Empty>{s.noReceipts}</Empty> : recent.map(x => (
          <div key={x.id} className="between bp-row" data-testid="bp-receipt"><span><b>{x.no}</b> · {x.date} · {s.method[x.method]}<br /><small className="muted">{x.einvId ? s.ownEinv : x.consolidatedIn ? s.consolidated : s.pendingCons}</small></span><span className="bp-num">{fig(x.total)}</span></div>))}
      </Card>
    </>
  );
}

// ---------- invoices ----------
function InvoiceForm({ s, start, onDone }: { s: BuddyStrings; start: AcctInvoice; onDone: () => void }) {
  const { store, books } = useBooks();
  const run = useRun(s);
  const [d, setD] = useState<AcctInvoice>(start);
  const t = totals(d.lines);
  const setLine = (i: number, patch: Partial<SaleLine>) => setD(x => ({ ...x, lines: x.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));
  const save = (post: boolean) => run(() => {
    const inv = { ...d, lines: d.lines.filter(l => l.desc.trim() || l.price) };
    if (!post) { store.upsert('acctInvoices', inv); onDone(); return s.draftSaved; }
    const r = postInvoice(ids, inv, books.invoices, books.journals);
    store.upsert('acctJournals', r.journal); store.upsert('acctInvoices', r.invoice); onDone();
    return s.posted(r.invoice.no!);
  });
  return (
    <Card title={books.invoices.some(i => i.id === start.id) ? s.editInvoice : s.newInvoice} testId="bp-invoice-form">
      <div className="two">
        <label className="ff">{s.invDate}<input type="date" value={d.date} onChange={e => setD(x => ({ ...x, date: e.target.value }))} /></label>
        <label className="ff">{s.due}<input type="date" value={d.due} onChange={e => setD(x => ({ ...x, due: e.target.value }))} /></label>
      </div>
      <div className="card-title">{s.buyer}</div>
      <PartyFields s={s} value={d.buyer} onChange={b => setD(x => ({ ...x, buyer: b }))} prefix="bp-inv-buyer" />
      <div className="card-title">{s.lines}</div>
      {d.lines.map((l, i) => (
        <div className="stack-sm bp-editline" key={i}>
          <label className="ff">{s.desc}<input data-testid="bp-inv-desc" value={l.desc} onChange={e => setLine(i, { desc: e.target.value })} /></label>
          <div className="two">
            <label className="ff">{s.qty}<input inputMode="decimal" value={String(l.qty)} onChange={e => setLine(i, { qty: num(e.target.value) })} /></label>
            <label className="ff">{s.price}<MoneyInput value={l.price} onChange={n => setLine(i, { price: n ?? 0 })} data-field="bp-inv-price" /></label>
          </div>
          <div className="two">
            <label className="ff">{s.tax}<Select value={String(l.taxPct)} onChange={e => setLine(i, { taxPct: +e.target.value })}><option value="8">8%</option><option value="0">{s.taxNa}</option></Select></label>
            <label className="ff">{s.incomeAcc}<Select value={l.acc} onChange={e => setLine(i, { acc: e.target.value })}>{ACCOUNTS.filter(a => a.type === 'income').map(a => <option key={a.code} value={a.code}>{a.code} {s.acc[a.code]}</option>)}</Select></label>
          </div>
          {d.lines.length > 1 && <button className="btn small secondary" onClick={() => setD(x => ({ ...x, lines: x.lines.filter((_, j) => j !== i) }))}>{s.removeLine}</button>}
        </div>
      ))}
      <button className="btn small secondary" onClick={() => setD(x => ({ ...x, lines: [...x.lines, { desc: '', qty: 1, price: 0, taxPct: 8, acc: '4000' }] }))}>{s.addLine}</button>
      <div className="between"><span>{s.subtotal}</span><span className="bp-num">{fig(t.sub)}</span></div>
      <div className="between"><span>{s.serviceTax}</span><span className="bp-num">{fig(t.tax)}</span></div>
      <div className="between bp-total"><strong>{s.total}</strong><strong className="bp-num">{money(t.total)}</strong></div>
      <div className="two">
        <button className="btn secondary" data-testid="bp-inv-save" onClick={() => save(false)}>{s.saveDraft}</button>
        <button className="btn primary" data-testid="bp-inv-post" onClick={() => save(true)}>{s.saveAndPost}</button>
      </div>
    </Card>
  );
}
const newInvoice = (buyer?: Partial<Party>, line?: Partial<SaleLine>, leadId?: string): AcctInvoice => {
  const d = new Date(), due = new Date(d.getTime() + 30 * 86400_000), t = Date.now();
  return { id: newId(), created: t, updated: t, date: ymd(d), due: ymd(due), buyer: { ...emptyParty(), ...buyer }, leadId, status: 'draft', lines: [{ desc: '', qty: 1, price: 0, taxPct: 8, acc: '4000', ...line }] };
};
function Invoices({ s, set, lang }: { s: BuddyStrings; set: (t: BuddyTab) => void; lang: Lang }) {
  const { store, books } = useBooks();
  const run = useRun(s);
  const [form, setForm] = useState<AcctInvoice | null>(null);
  const [del, setDel] = useState<string | null>(null);
  if (form) return <InvoiceForm s={s} start={form} onDone={() => setForm(null)} />;
  const list = [...books.invoices].sort((a, b) => (a.date < b.date ? 1 : -1));
  return (
    <>
      <button className="btn primary" data-testid="bp-new-invoice" onClick={() => setForm(newInvoice())}>{s.newInvoice}</button>
      {!list.length ? <Empty>{s.noInvoices}</Empty> : list.map(i => {
        const e = books.einvoices.find(x => x.id === i.einvId);
        return (
          <div key={i.id} className="card stack-sm" data-testid="bp-invoice">
            <div className="between"><strong>{i.no ?? s.status.draft}</strong><Pill st={i.status} s={s} /></div>
            <div className="between"><span>{i.buyer.name}<br /><small className="muted">{i.date} · {i.buyer.tin}</small></span><span className="bp-num">{money(totals(i.lines).total)}</span></div>
            {e && <small className="muted">e-Invoice: {s.status[e.status]}</small>}
            <div className="chip-row">
              {i.status === 'draft' && <>
                <button className="btn small secondary" onClick={() => setForm(i)}>{s.edit}</button>
                <button className="btn small primary" data-testid="bp-inv-post-row" onClick={() => run(() => { const r = postInvoice(ids, i, books.invoices, books.journals); store.upsert('acctJournals', r.journal); store.upsert('acctInvoices', r.invoice); return s.posted(r.invoice.no!); })}>{s.post}</button>
                <button className="btn small secondary" onClick={() => setDel(i.id)}>{s.delete}</button>
              </>}
              {i.status === 'posted' && <button className="btn small secondary" data-testid="bp-inv-pay" onClick={() => run(() => { const r = payInvoice(ids, i, books.journals, ymd(new Date())); store.upsert('acctJournals', r.journal); store.upsert('acctInvoices', r.invoice); return s.paid(r.journal.no!); })}>{s.recordPayment}</button>}
              {i.status !== 'draft' && !e && <button className="btn small secondary" data-testid="bp-inv-einv" onClick={() => run(() => { const x = einvFromInvoice(ids, i); store.upsert('acctEinvoices', x); store.upsert('acctInvoices', { ...i, einvId: x.id }); set('einvoice'); })}>{s.makeEinv}</button>}
              {e && <button className="btn small secondary" onClick={() => set('einvoice')}>{s.viewEinv}</button>}
            </div>
          </div>
        );
      })}
      {del && <Confirm lang={lang} title={s.confirmDelete} okLabel={s.delete} onOk={() => { run(() => { store.remove('acctInvoices', del); return s.deleted; }); setDel(null); }} onCancel={() => setDel(null)} />}
    </>
  );
}

// ---------- customers (CRM) ----------
function Customers({ s, set }: { s: BuddyStrings; set: (t: BuddyTab) => void }) {
  const { store, books } = useBooks();
  const run = useRun(s);
  const today = ymd(new Date());
  const [lead, setLead] = useState<AcctLead | null>(null);
  const [inv, setInv] = useState<AcctInvoice | null>(null);
  const [fromLead, setFromLead] = useState<string | null>(null);
  if (inv) return <InvoiceForm s={s} start={inv} onDone={() => {
    // The lead is linked only once its invoice was really saved.
    const l = store.getState().acctLeads.find(x => x.id === fromLead);
    if (l && store.getState().acctInvoices.some(x => x.id === inv.id)) store.upsert('acctLeads', { ...l, invoiceId: inv.id });
    setInv(null); setFromLead(null); set('invoices');
  }} />;
  const open = books.leads.filter(l => l.stage !== 'won' && l.stage !== 'lost');
  const cust = new Map<string, { tin: string; billed: number; due: number; n: number }>();
  for (const i of books.invoices.filter(x => x.status !== 'draft')) {
    const c = cust.get(i.buyer.name) ?? { tin: i.buyer.tin, billed: 0, due: 0, n: 0 };
    const t = totals(i.lines).total; c.billed += t; c.n++; if (i.status === 'posted') c.due += t; cust.set(i.buyer.name, c);
  }
  const t0 = Date.now();
  return (
    <>
      <div className="fin-grid">
        <div className="fin-card gold"><span>{s.openPipeline}</span><strong data-testid="bp-pipeline">{money(open.reduce((x, l) => x + l.value, 0))}</strong></div>
        <div className="fin-card"><span>{s.openLeads}</span><strong>{open.length}</strong></div>
        <div className="fin-card"><span>{s.followUps}</span><strong>{open.filter(l => l.next && l.next <= today).length}</strong></div>
      </div>
      {lead ? (
        <Card title={s.newLead} testId="bp-lead-form">
          <label className="ff">{s.leadName}<input data-testid="bp-lead-name" value={lead.name} onChange={e => setLead({ ...lead, name: e.target.value })} /></label>
          <div className="two"><label className="ff">{s.p.phone}<input value={lead.phone ?? ''} onChange={e => setLead({ ...lead, phone: e.target.value })} /></label>
            <label className="ff">{s.expectedFee}<MoneyInput value={lead.value} onChange={n => setLead({ ...lead, value: n ?? 0 })} /></label></div>
          <label className="ff">{s.interest}<input value={lead.interest} onChange={e => setLead({ ...lead, interest: e.target.value })} /></label>
          <label className="ff">{s.followOn}<input type="date" value={lead.next ?? ''} onChange={e => setLead({ ...lead, next: e.target.value || undefined })} /></label>
          <div className="two"><button className="btn secondary" onClick={() => setLead(null)}>{s.hide}</button>
            <button className="btn primary" data-testid="bp-lead-save" disabled={!lead.name.trim()} onClick={() => run(() => { store.upsert('acctLeads', lead); setLead(null); return s.leadSaved; })}>{s.saveLead}</button></div>
        </Card>
      ) : <button className="btn primary" data-testid="bp-new-lead" onClick={() => setLead({ id: newId(), created: t0, updated: t0, name: '', interest: '', stage: 'new', value: 0, next: today })}>{s.newLead}</button>}
      <Card title={s.pipeline}>
        {!books.leads.length ? <Empty>{s.noLeads}</Empty> : [...books.leads].sort((a, b) => ((a.next ?? '9') < (b.next ?? '9') ? -1 : 1)).map(l => (
          <div key={l.id} className="stack-sm bp-row" data-testid="bp-lead">
            <div className="between"><span><b>{l.name}</b><br /><small className="muted">{l.interest}{l.phone ? ` · ${l.phone}` : ''}</small></span><Pill st={l.stage} s={s} /></div>
            <div className="between"><small className={l.next && l.next <= today && open.includes(l) ? 'bp-due' : 'muted'}>{l.next ? `${s.followOn}: ${l.next}` : ''}</small><span className="bp-num">{fig(l.value)}</span></div>
            <div className="chip-row">
              {open.includes(l) && <>
                <button className="btn small secondary" data-testid="bp-lead-next" onClick={() => run(() => { store.upsert('acctLeads', { ...l, stage: nextStage(l) }); })}>{s.moveTo(s.stage[nextStage(l)])}</button>
                <button className="btn small secondary" onClick={() => run(() => { store.upsert('acctLeads', { ...l, stage: 'lost' }); })}>{s.markLost}</button>
              </>}
              {l.stage === 'won' && !l.invoiceId && <button className="btn small primary" data-testid="bp-lead-invoice" onClick={() => {
                const i = newInvoice({ name: l.name, phone: l.phone }, { desc: l.interest, price: l.value }, l.id);
                setFromLead(l.id); setInv(i);
              }}>{s.draftInvoice}</button>}
            </div>
          </div>))}
      </Card>
      <Card title={s.customers}>
        {!cust.size ? <Empty>{s.noCustomers}</Empty> : <div className="bp-table"><table><thead><tr><th>{s.p.name}</th><th className="n">{s.invoicesN}</th><th className="n">{s.billed}</th><th className="n">{s.outstanding}</th></tr></thead>
          <tbody>{[...cust].map(([n, c]) => <tr key={n}><td>{n}<br /><small className="muted">{c.tin}</small></td><td className="n">{c.n}</td><td className="n">{fig(c.billed)}</td><td className="n">{fig(c.due)}</td></tr>)}</tbody></table></div>}
      </Card>
    </>
  );
}

// ---------- people: attendance and payroll ----------
function People({ s }: { s: BuddyStrings }) {
  const { store, books } = useBooks();
  const run = useRun(s);
  const today = ymd(new Date()), month = today.slice(0, 7);
  const [edit, setEdit] = useState<AcctStaff | null>(null);
  const active = books.staff.filter(x => x.active);
  const done = books.payruns.find(p => p.month === month);
  const t0 = Date.now();
  const money0 = (k: keyof AcctStaff, label: string) => edit && <label className="ff">{label}<MoneyInput value={edit[k] as number} onChange={n => setEdit({ ...edit, [k]: n ?? 0 })} /></label>;
  return (
    <>
      <Card title={s.attendance(today)} testId="bp-attendance">
        {!active.length ? <Empty>{s.noStaff}</Empty> : active.map(st => {
          const a = books.attendance.find(x => x.staffId === st.id && x.date === today);
          return (
            <div key={st.id} className="between bp-row" data-testid="bp-staff-row">
              <span><b>{st.name}</b><br /><small className="muted">{st.role} · {s.in} {a?.in ?? '—'} · {s.out} {a?.out ?? '—'}{a?.out ? ` · ${hoursWorked(a)} ${s.hours}` : ''}</small></span>
              {!a ? <button className="btn small primary" data-testid="bp-clock-in" onClick={() => run(() => { store.upsert('acctAttendance', { id: newId(), created: Date.now(), updated: Date.now(), staffId: st.id, date: today, in: nowHm() }); })}>{s.clockIn}</button>
                : !a.out ? <button className="btn small secondary" data-testid="bp-clock-out" onClick={() => run(() => { store.upsert('acctAttendance', { ...a, out: nowHm() }); })}>{s.clockOut}</button>
                  : <span className="bp-pill ok">{s.done}</span>}
            </div>);
        })}
      </Card>
      <Card title={s.staff}>
        {edit ? (
          <div className="stack-sm" data-testid="bp-staff-form">
            <label className="ff">{s.p.name}<input data-testid="bp-staff-name" value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} /></label>
            <label className="ff">{s.role}<input value={edit.role} onChange={e => setEdit({ ...edit, role: e.target.value })} /></label>
            <div className="two">{money0('basic', s.basic)}{money0('allowance', s.allowance)}</div>
            <div className="two">{money0('commission', s.commission)}{money0('pcb', s.pcb)}</div>
            <label className="check"><input type="checkbox" checked={edit.active} onChange={e => setEdit({ ...edit, active: e.target.checked })} /> {s.active}</label>
            <div className="two"><button className="btn secondary" onClick={() => setEdit(null)}>{s.hide}</button>
              <button className="btn primary" data-testid="bp-staff-save" disabled={!edit.name.trim()} onClick={() => run(() => { store.upsert('acctStaff', edit); setEdit(null); return s.saved; })}>{s.saveStaff}</button></div>
          </div>
        ) : <>
          {books.staff.map(st => <button key={st.id} className="btn secondary bp-staff" onClick={() => setEdit(st)}>{st.name} · {money(st.basic)}{st.active ? '' : ` · ${s.status.cancelled}`}</button>)}
          <button className="btn small primary" data-testid="bp-add-staff" onClick={() => setEdit({ id: newId(), created: t0, updated: t0, name: '', role: '', basic: 0, allowance: 0, commission: 0, pcb: 0, active: true })}>{s.addStaff}</button>
        </>}
      </Card>
      <Card title={s.payrollFor(month)} testId="bp-payroll">
        {!active.length ? <Empty>{s.noStaff}</Empty> : <div className="bp-table"><table>
          <thead><tr><th>{s.p.name}</th><th className="n">{s.gross}</th><th className="n">{s.epf}</th><th className="n">{s.socso}</th><th className="n">{s.eis}</th><th className="n">PCB</th><th className="n">{s.net}</th></tr></thead>
          <tbody>{(done ? done.slips : active.map(payslip)).map(p => <tr key={p.staffId}><td>{p.name}</td><td className="n">{fig(p.gross)}</td><td className="n">{fig(p.epfEe)} / {fig(p.epfEr)}</td><td className="n">{fig(p.socsoEe)} / {fig(p.socsoEr)}</td><td className="n">{fig(p.eisEe)} / {fig(p.eisEr)}</td><td className="n">{fig(p.pcb)}</td><td className="n">{fig(p.net)}</td></tr>)}</tbody>
        </table></div>}
        {done ? <span className="bp-pill ok" data-testid="bp-payroll-done">{s.payrollPosted(done.journalNo)}</span>
          : <button className="btn primary" data-testid="bp-post-payroll" disabled={!active.length} onClick={() => run(() => { const r = runPayroll(ids, month, books.staff, books.payruns, books.journals); store.upsert('acctJournals', r.journal); store.upsert('acctPayruns', r.payrun); return s.payrollPosted(r.journal.no!); })}>{s.postPayroll(month)}</button>}
        <small className="muted">{s.payrollNote}</small>
      </Card>
    </>
  );
}

// ---------- journal ----------
function Journal({ s, lang }: { s: BuddyStrings; lang: Lang }) {
  const { store, books } = useBooks();
  const run = useRun(s);
  const [form, setForm] = useState<AcctJournal | null>(null);
  const [rev, setRev] = useState<AcctJournal | null>(null);
  const [del, setDel] = useState<string | null>(null);
  const blank = (): AcctJournal => newJournal(ids, { date: ymd(new Date()), memo: '', lines: [] });
  if (form) {
    const ls = form.lines, ok = balanced(cleanLines(ls));
    const setL = (i: number, p: Partial<JournalLine>) => setForm({ ...form, lines: ls.map((l, j) => (j === i ? { ...l, ...p } : l)) });
    const save = (post: boolean) => run(() => {
      const j = { ...form, memo: form.memo.trim(), lines: cleanLines(ls) };
      const out = post ? postJournal(j, books.journals, Date.now()) : j;
      store.upsert('acctJournals', out); setForm(null);
      return post ? s.posted(out.no!) : s.draftSaved;
    });
    return (
      <Card title={books.journals.some(j => j.id === form.id) ? s.editEntry : s.newEntry} testId="bp-journal-form">
        <div className="two"><label className="ff">{s.date}<input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></label>
          <label className="ff">{s.memo}<input data-testid="bp-j-memo" value={form.memo} onChange={e => setForm({ ...form, memo: e.target.value })} /></label></div>
        {ls.map((l, i) => (
          <div key={i} className="bp-jline">
            <Select aria-label={s.account} data-testid="bp-j-acc" value={l.acc} onChange={e => setL(i, { acc: e.target.value })}><option value="">{s.account}</option>{ACCOUNTS.map(a => <option key={a.code} value={a.code}>{a.code} {s.acc[a.code]}</option>)}</Select>
            <MoneyInput aria-label={s.debit} data-field="bp-j-dr" value={l.dr || undefined} onChange={n => setL(i, { dr: n ?? 0, cr: n ? 0 : l.cr })} />
            <MoneyInput aria-label={s.credit} data-field="bp-j-cr" value={l.cr || undefined} onChange={n => setL(i, { cr: n ?? 0, dr: n ? 0 : l.dr })} />
          </div>))}
        <button className="btn small secondary" onClick={() => setForm({ ...form, lines: [...ls, { acc: '', dr: 0, cr: 0 }] })}>{s.addLine}</button>
        <div className="between"><span className={`bp-pill ${ok ? 'ok' : 'bad'}`} data-testid="bp-j-balanced">{ok ? s.balancedYes : s.balancedNo}</span><span className="bp-num">{s.debit} {fig(sumDr(ls))} · {s.credit} {fig(sumCr(ls))}</span></div>
        <div className="two"><button className="btn secondary" disabled={!form.memo.trim()} onClick={() => save(false)}>{s.saveDraft}</button>
          <button className="btn primary" data-testid="bp-j-post" disabled={!form.memo.trim() || !ok} onClick={() => save(true)}>{s.saveAndPost}</button></div>
      </Card>
    );
  }
  const list = [...books.journals].sort((a, b) => (a.date === b.date ? ((a.no ?? '~') < (b.no ?? '~') ? 1 : -1) : a.date < b.date ? 1 : -1));
  return (
    <>
      <button className="btn primary" data-testid="bp-new-journal" onClick={() => { const j = blank(); setForm({ ...j, lines: [{ acc: '', dr: 0, cr: 0 }, { acc: '', dr: 0, cr: 0 }] }); }}>{s.newEntry}</button>
      <small className="muted">{s.journalHint}</small>
      {!list.length ? <Empty>{s.noEntries}</Empty> : list.map(j => (
        <div key={j.id} className="card stack-sm" data-testid="bp-journal">
          <div className="between"><span><b>{j.no ?? s.status.draft}</b> · {j.date} · <small className="muted">{s.source[j.source]}</small></span><Pill st={j.status} s={s} /></div>
          <span>{j.memo}</span>
          <small className="muted bp-lines">{j.lines.map(l => `${l.acc} ${l.dr ? `${s.debit} ${fig(l.dr)}` : `${s.credit} ${fig(l.cr)}`}`).join(' · ')}</small>
          {j.reversedBy && <small className="muted">{s.reversedBy(j.reversedBy)}</small>}
          <div className="chip-row">
            {j.status === 'draft' && <>
              <button className="btn small secondary" onClick={() => setForm(j)}>{s.edit}</button>
              <button className="btn small primary" data-testid="bp-j-post-row" onClick={() => run(() => { const p = postJournal(j, books.journals, Date.now()); store.upsert('acctJournals', p); return s.posted(p.no!); })}>{s.post}</button>
              <button className="btn small secondary" onClick={() => setDel(j.id)}>{s.delete}</button>
            </>}
            {j.status === 'posted' && j.source !== 'reversal' && <button className="btn small secondary" data-testid="bp-j-reverse" onClick={() => setRev(j)}>{s.reverse}</button>}
          </div>
        </div>))}
      {rev && <Confirm lang={lang} title={s.confirmReverse} body={s.confirmReverseBody} okLabel={s.reverse} onOk={() => {
        run(() => { const r = reverseJournal(ids, rev, books.journals, ymd(new Date())); store.upsert('acctJournals', r.reversal); store.upsert('acctJournals', r.original); return s.reversal(r.reversal.no!); }); setRev(null);
      }} onCancel={() => setRev(null)} />}
      {del && <Confirm lang={lang} title={s.confirmDelete} okLabel={s.delete} onOk={() => { run(() => { store.remove('acctJournals', del); return s.deleted; }); setDel(null); }} onCancel={() => setDel(null)} />}
    </>
  );
}

// ---------- e-Invoice ----------
function EinvCard({ s, e, company }: { s: BuddyStrings; e: AcctEinvoice; company?: AcctProfile }) {
  const { store } = useApp();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const c = check(e, company);
  const cfg = config(store.getState().settings);
  const link = shareUrl(e);
  const fail = (x: unknown) => {
    if (x instanceof MyinvoisError) toast(x.code === 'refused' ? s.mi.refused(x.message) : x.code === 'other' ? s.mi.other(x.message) : s.mi[x.code], 'error');
    else toast(s.mi.other(String(x)), 'error');
  };
  const act = async (what: 'submit' | 'status' | 'cancel') => {
    if (busy) return; setBusy(true);
    try {
      if (what === 'submit') { const a = await submitEinvoice(store, cfg, e, company!); const n = applyAnswer(e, a, Date.now()); store.upsert('acctEinvoices', n); toast(n.status === 'valid' ? s.nowValid : n.status === 'invalid' ? s.nowInvalid : s.submittedOk); }
      if (what === 'status') { const a = await einvoiceStatus(store, cfg, e); const n = applyAnswer(e, a, Date.now()); store.upsert('acctEinvoices', n); toast(n.status === 'valid' ? s.nowValid : n.status === 'invalid' ? s.nowInvalid : s.submittedOk); }
      if (what === 'cancel') { await cancelEinvoice(store, cfg, e, reason.trim()); store.upsert('acctEinvoices', { ...e, status: 'cancelled', cancelledAt: Date.now() }); toast(s.cancelledOk); }
    } catch (x) { fail(x); }
    finally { setBusy(false); }
  };
  const copy = (text: string) => { void navigator.clipboard?.writeText(text).then(() => toast(s.copied), () => undefined); };
  return (
    <div className="card stack-sm" data-testid="bp-einv">
      <div className="between"><span><b>{e.refNo}</b> · {s.kind[e.kind]}<br /><small className="muted">{e.buyer.name} · {e.buyer.tin}</small></span><Pill st={e.status} s={s} /></div>
      <div className="between"><small className="muted">{e.date}</small><span className="bp-num">{money(totals(e.lines).total)}</span></div>
      {(e.status === 'ready' || e.status === 'invalid') && c.errors.length > 0 && <div><small><b>{s.willFail}</b></small><ul className="bp-list bad" data-testid="bp-einv-errors">{c.errors.map(x => <li key={x}>{s.chk[x]}</li>)}</ul></div>}
      {e.status === 'invalid' && (e.errors ?? []).length > 0 && <ul className="bp-list bad">{e.errors!.map((x, i) => <li key={i}>{x}</li>)}</ul>}
      <div className="chip-row">
        {(e.status === 'ready' || e.status === 'invalid') && <button className="btn small primary" data-testid="bp-einv-submit" disabled={busy || c.errors.length > 0 || !company} onClick={() => void act('submit')}>{s.submit}</button>}
        {e.status === 'submitted' && <button className="btn small secondary" disabled={busy} onClick={() => void act('status')}>{s.refresh}</button>}
        <button className="btn small secondary" onClick={() => setOpen(o => !o)}>{open ? s.hide : s.details}</button>
      </div>
      {open && <div className="stack-sm">
        {c.dueBy && <small>{s.dueBy(c.dueBy)}</small>}
        {c.warnings.length > 0 && <ul className="bp-list">{c.warnings.map(x => <li key={x}>{s.chk[x]}</li>)}</ul>}
        {link && <div className="stack-sm"><small className="muted">{s.link}</small><code className="bp-code">{link}</code><button className="btn small secondary" onClick={() => copy(link)}>{s.copy}</button></div>}
        {canCancel(e, Date.now()) && <div className="stack-sm">
          <label className="ff">{s.cancelReason}<input value={reason} onChange={x => setReason(x.target.value)} /></label>
          <button className="btn small secondary" disabled={busy || !reason.trim()} onClick={() => void act('cancel')}>{s.cancel}</button>
        </div>}
        {e.status === 'valid' && !canCancel(e, Date.now()) && <small className="muted">{s.pastCancel}</small>}
        {company && <><small className="muted">{s.payload}</small><pre className="bp-json" data-testid="bp-einv-json">{JSON.stringify(buildUBL(e, company), null, 2)}</pre></>}
      </div>}
    </div>
  );
}
function Einvoices({ s }: { s: BuddyStrings }) {
  const { store, books, company } = useBooks();
  const run = useRun(s);
  const months = [...new Set(books.sales.filter(x => !x.einvId && !x.consolidatedIn && x.total <= SINGLE_EINV_LIMIT).map(x => x.date.slice(0, 7)))].sort().reverse();
  return (
    <>
      <small className="muted">{s.einvHint}</small>
      {months.length > 0 && <div className="chip-row">{months.map(m => <button key={m} className="btn small secondary" data-testid="bp-consolidate" onClick={() => run(() => {
        const r = consolidate(ids, m, books.sales, ymd(new Date()), nowHms());
        if (!r) throw new BuddyError('nothing-to-consolidate');
        store.upsert('acctEinvoices', r.einv); r.sales.forEach(x => store.upsert('acctSales', x));
        return s.consolidatedMade(r.sales.length);
      })}>{s.consolidate(m)}</button>)}</div>}
      {!books.einvoices.length ? <Empty>{s.noEinv}</Empty> : [...books.einvoices].sort((a, b) => (a.created < b.created ? 1 : -1)).map(e => <EinvCard key={e.id} s={s} e={e} company={company} />)}
    </>
  );
}

// ---------- reports ----------
function Reports({ s }: { s: BuddyStrings }) {
  const { books } = useBooks();
  const [per, setPer] = useState<'month' | 'last' | 'year' | 'all'>('month');
  const today = ymd(new Date()), m = today.slice(0, 7);
  const lm = (() => { const d = new Date(`${m}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7); })();
  const [from, to] = per === 'month' ? [`${m}-01`, monthEnd(m)] : per === 'last' ? [`${lm}-01`, monthEnd(lm)] : per === 'year' ? [`${m.slice(0, 4)}-01-01`, `${m.slice(0, 4)}-12-31`] : [undefined, undefined];
  const p = profitAndLoss(books.journals, from, to);
  const asAt = to && to < today ? to : today;
  const bs = balanceSheet(books.journals, asAt), tb = trialBalance(books.journals, asAt);
  const rows = (xs: { acc: { code: string }; amount: number }[]) => xs.map(x => <tr key={x.acc.code}><td><span className="muted">{x.acc.code}</span> {s.acc[x.acc.code]}</td><td className="n">{fig(x.amount)}</td></tr>);
  return (
    <>
      <div className="chip-row">{(['month', 'last', 'year', 'all'] as const).map(k => <button key={k} className="chip-btn" aria-pressed={per === k} onClick={() => setPer(k)}>{s.period[k]}</button>)}</div>
      <small className="muted">{s.reportsHint}</small>
      <Card title={s.pnl} testId="bp-pnl"><div className="bp-table"><table><tbody>
        <tr className="sect"><td colSpan={2}>{s.revenue}</td></tr>{rows(p.income)}<tr className="tot"><td>{s.totalRevenue}</td><td className="n">{fig(p.totalIncome)}</td></tr>
        <tr className="sect"><td colSpan={2}>{s.expenses}</td></tr>{rows(p.expenses)}<tr className="tot"><td>{s.totalExpenses}</td><td className="n">{fig(p.totalExpenses)}</td></tr>
        <tr className="tot"><td>{p.net >= 0 ? s.netProfit : s.netLoss}</td><td className="n" data-testid="bp-pnl-net">{fig(p.net)}</td></tr>
      </tbody></table></div></Card>
      <Card title={s.bs(asAt)} testId="bp-bs"><div className="bp-table"><table><tbody>
        <tr className="sect"><td colSpan={2}>{s.assets}</td></tr>{rows(bs.assets)}<tr className="tot"><td>{s.totalAssets}</td><td className="n">{fig(bs.totalAssets)}</td></tr>
        <tr className="sect"><td colSpan={2}>{s.liabilities}</td></tr>{rows(bs.liabilities)}<tr className="tot"><td>{s.totalLiabilities}</td><td className="n">{fig(bs.totalLiabilities)}</td></tr>
        <tr className="sect"><td colSpan={2}>{s.equity}</td></tr>{rows(bs.equity)}<tr><td>{s.currentProfit}</td><td className="n">{fig(bs.profit)}</td></tr><tr className="tot"><td>{s.totalEquity}</td><td className="n">{fig(bs.totalEquity)}</td></tr>
      </tbody></table></div><span className={`bp-pill ${bs.balanced ? 'ok' : 'bad'}`} data-testid="bp-bs-balanced">{bs.balanced ? s.bsOk : s.bsBad}</span></Card>
      <Card title={s.tb(asAt)}><div className="bp-table"><table>
        <thead><tr><th>{s.account}</th><th className="n">{s.debit}</th><th className="n">{s.credit}</th></tr></thead>
        <tbody>{tb.rows.map(r => <tr key={r.acc.code}><td><span className="muted">{r.acc.code}</span> {s.acc[r.acc.code]}</td><td className="n">{r.dr ? fig(r.dr) : ''}</td><td className="n">{r.cr ? fig(r.cr) : ''}</td></tr>)}
          <tr className="tot"><td>{s.totals}</td><td className="n" data-testid="bp-tb-dr">{fig(tb.dr)}</td><td className="n" data-testid="bp-tb-cr">{fig(tb.cr)}</td></tr></tbody>
      </table></div></Card>
    </>
  );
}

// ---------- setup ----------
function Setup({ s }: { s: BuddyStrings }) {
  const { store, books, company } = useBooks();
  const run = useRun(s);
  const t0 = Date.now();
  const [co, setCo] = useState<AcctProfile>(company ?? { id: 'company', created: t0, updated: t0, party: emptyParty(), msic: '', msicDesc: '' });
  const [svc, setSvc] = useState<AcctProduct | null>(null);
  return (
    <>
      <Card title={s.company} testId="bp-company">
        <PartyFields s={s} value={co.party} onChange={p => setCo({ ...co, party: p })} prefix="bp-co" />
        <label className="ff">{s.p.sst}<input data-testid="bp-co-sst" value={co.party.sst ?? ''} onChange={e => setCo({ ...co, party: { ...co.party, sst: e.target.value } })} /></label>
        <div className="two"><label className="ff">{s.msic}<input data-testid="bp-co-msic" inputMode="numeric" value={co.msic} onChange={e => setCo({ ...co, msic: e.target.value.replace(/\D/g, '').slice(0, 5) })} /></label>
          <label className="ff">{s.msicDesc}<input value={co.msicDesc} onChange={e => setCo({ ...co, msicDesc: e.target.value })} /></label></div>
        <small className="muted">{s.msicHint}</small>
        <button className="btn primary" data-testid="bp-co-save" onClick={() => run(() => { store.upsert('acctProfile', { ...co, sample: undefined }); return s.saved; })}>{s.saveCompany}</button>
      </Card>
      <Card title={s.servicesTitle}>
        {svc ? <div className="stack-sm">
          <label className="ff">{s.serviceName}<input value={svc.name} onChange={e => setSvc({ ...svc, name: e.target.value })} /></label>
          <div className="two"><label className="ff">{s.price}<MoneyInput value={svc.price} onChange={n => setSvc({ ...svc, price: n ?? 0 })} /></label>
            <label className="ff">{s.tax}<Select value={String(svc.taxPct)} onChange={e => setSvc({ ...svc, taxPct: +e.target.value })}><option value="8">8%</option><option value="0">{s.taxNa}</option></Select></label></div>
          <div className="two"><button className="btn secondary" onClick={() => setSvc(null)}>{s.hide}</button>
            <button className="btn primary" disabled={!svc.name.trim()} onClick={() => run(() => { store.upsert('acctProducts', svc); setSvc(null); return s.saved; })}>{s.saveService}</button></div>
        </div> : <>
          {[...books.products].sort((x, y) => x.name.localeCompare(y.name)).map(p => <div key={p.id} className="between bp-row"><button className="btn secondary bp-staff" onClick={() => setSvc(p)}>{p.name} · {money(p.price)}{p.taxPct ? ` ${s.plusSst}` : ''}</button>
            <button className="btn small secondary" onClick={() => run(() => { store.upsert('acctProducts', { ...p, active: !p.active }); })}>{p.active ? s.hideService : s.showService}</button></div>)}
          <button className="btn small primary" onClick={() => {
            if (!books.products.length) DEFAULT_PRODUCTS.forEach(p => store.upsert('acctProducts', { ...p, id: newId(), created: Date.now(), updated: Date.now() }));
            setSvc({ id: newId(), created: Date.now(), updated: Date.now(), name: '', price: 0, taxPct: 8, acc: '4100', active: true });
          }}>{s.addService}</button>
        </>}
      </Card>
      <Card title={s.sandboxTitle} testId="bp-sandbox"><ol className="bp-list">{s.sandboxSteps.map((x, i) => <li key={i}>{x}</li>)}</ol><small className="muted">{s.einvHint}</small></Card>
      <Card title={s.sampleTitle}>
        <div className="two">
          <button className="btn secondary" onClick={() => run(() => { loadSample(store); return s.sampleLoaded; })}>{s.loadSample}</button>
          <button className="btn secondary" disabled={!hasSample(books)} onClick={() => run(() => { removeSample(store); return s.sampleRemoved; })}>{s.removeSample}</button>
        </div>
      </Card>
    </>
  );
}
