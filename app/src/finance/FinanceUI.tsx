// Button 8 — Agent Financial: income, commissions (estimated, confirmed, received), expenses, targets, outstanding
// commissions, completed deals and summaries for a month or a year. All records are saved on the phone.
import { useState } from 'react';
import { useDraft } from '../ui/useDraft';
import { DraftBanner } from '../ui/DraftBanner';
import { Lang, strings } from '../i18n';
import { useApp } from '../data/useStore';
import { newId } from '../data/store';
import { Go } from '../nav';
import { financeStrings } from './strings';
import { DEAL_STATUSES, Deal, Expense, Income } from '../data/types';
import { summarise, monthlyIncome, myCommission, commissionFrom, EXPENSE_CATEGORIES, INCOME_SOURCES, Period } from '../domain/finance';
import { rm, cardTitle, Listing, rentCommissionRm } from '../listing/model';

/** A new deal's starting value and commission from its property. A rent-only property's commission is months of rent
 *  (Change 009): the amount is rent × months and no percentage is set, so months are never read as a percentage. */
export function dealStart(p?: Listing): Pick<Deal, 'value' | 'commissionPct' | 'commission'> {
  if (p?.purpose === 'rent') return { value: p.monthlyRent ?? 0, commissionPct: undefined, commission: rentCommissionRm(p) ?? 0 };
  return { value: p?.askingPrice ?? p?.monthlyRent ?? 0, commissionPct: p?.commissionPct, commission: 0 };
}
import { ym, ymd, fmtDate, localeOf } from '../lib/dates';
import { ContactSelect, PropertySelect, Empty, Confirm, Tabs, SampleTag } from '../ui/common';
import { OptionSelect } from '../ui/OptionSelect';
import { useToast } from '../ui/toast';
import { MoneyInput } from '../ui/MoneyInput';

const num = (v: string) => { const x = parseFloat(v.replace(/[^\d.]/g, '')); return Number.isFinite(x) ? x : undefined; };

export function FinanceScreen({ lang, go }: { lang: Lang; go: Go }) {
  const { state, store } = useApp();
  const f = financeStrings[lang];
  const [kind, setKind] = useState<'month' | 'year'>('month');
  const [anchor, setAnchor] = useState(new Date());
  const [editTarget, setEditTarget] = useState<{ amount: number | undefined } | null>(null);
  const p: Period = kind === 'month' ? { kind, key: ym(anchor) } : { kind, key: String(anchor.getFullYear()) };
  const s = summarise(p, state.deals, state.incomes, state.expenses, state.targets);
  const label = kind === 'month' ? anchor.toLocaleDateString(localeOf(lang), { month: 'long', year: 'numeric' }) : String(anchor.getFullYear());
  const shift = (n: number) => setAnchor(d => (kind === 'month' ? new Date(d.getFullYear(), d.getMonth() + n, 1) : new Date(d.getFullYear() + n, 0, 1)));
  const months = monthlyIncome(String(anchor.getFullYear()), state.deals, state.incomes);
  const maxM = Math.max(1, ...months);
  const exp = state.expenses.filter(e => e.date.startsWith(p.key)).sort((a, b) => (a.date < b.date ? 1 : -1));
  const inc = state.incomes.filter(e => e.date.startsWith(p.key)).sort((a, b) => (a.date < b.date ? 1 : -1));
  const deals = [...state.deals].sort((a, b) => (a.date < b.date ? 1 : -1));
  const target = state.targets.find(t => t.period === p.kind && t.key === p.key);

  return (
    <section className="stack" data-testid="finance">
      <Tabs label={f.title} value={kind} onChange={setKind} options={[{ value: 'month', label: f.month }, { value: 'year', label: f.year }]} />
      <div className="between cal-head">
        <button className="icon-btn" aria-label={f.prev} onClick={() => shift(-1)}>‹</button>
        <strong data-testid="fin-period">{label}</strong>
        <button className="icon-btn" aria-label={f.next} onClick={() => shift(1)}>›</button>
      </div>
      <div className="fin-grid">
        <div className="fin-card gold"><span>{f.received}</span><strong data-testid="fin-received">{rm(s.received)}</strong><small>{f.commission}: {rm(s.commissionReceived)} · {f.otherIncome}: {rm(s.otherIncome)}</small></div>
        <div className="fin-card"><span>{f.expenses}</span><strong data-testid="fin-expenses">{rm(s.expenses)}</strong></div>
        <div className="fin-card"><span>{f.net}</span><strong data-testid="fin-net" className={s.net < 0 ? 'neg' : ''}>{rm(s.net)}</strong></div>
        <div className="fin-card"><span>{f.outstanding}</span><strong data-testid="fin-outstanding">{rm(s.outstanding)}</strong><small>{f.outstandingConfirmed(rm(s.outstandingConfirmed))}</small></div>
        <div className="fin-card"><span>{f.completed}</span><strong data-testid="fin-completed">{s.completedDeals}</strong><small>{f.dealValue(rm(s.dealValue))}</small></div>
        <div className="fin-card">
          <span>{f.target}</span>
          {s.target ? <><strong>{rm(s.target)}</strong><div className="bar"><i style={{ width: `${Math.min(100, Math.round((s.targetProgress ?? 0) * 100))}%` }} /></div><small>{f.progress(Math.round((s.targetProgress ?? 0) * 100))}</small></> : <small className="muted">{f.noTarget}</small>}
          {editTarget === null
            ? <button className="btn small secondary" onClick={() => setEditTarget({ amount: target?.amount })}>{f.setTarget}</button>
            : <div className="stack-sm">
              <label className="ff">{f.targetFor(label)}<MoneyInput autoFocus value={editTarget.amount} onChange={n => setEditTarget({ amount: n })} /></label>
              <div className="two">
                <button className="btn small secondary" onClick={() => setEditTarget(null)}>{strings[lang].c.cancel}</button>
                <button className="btn small primary" onClick={() => {
                  const amt = editTarget.amount;
                  if (amt) store.upsert('targets', { id: target?.id ?? newId(), created: target?.created ?? Date.now(), updated: Date.now(), period: p.kind, key: p.key, amount: amt });
                  else if (target) store.remove('targets', target.id);
                  setEditTarget(null);
                }}>{strings[lang].c.save}</button>
              </div>
            </div>}
        </div>
      </div>

      <div className="card stack-sm">
        <div className="card-title">{f.monthly} · {anchor.getFullYear()}</div>
        <div className="bars" role="img" aria-label={f.monthly}>
          {months.map((v, i) => (
            <div key={i} className="bar-col" title={`${new Date(2026, i, 1).toLocaleDateString(localeOf(lang), { month: 'short' })}: ${rm(v)}`}>
              <i style={{ height: `${Math.round((v / maxM) * 100)}%` }} /><small>{new Date(2026, i, 1).toLocaleDateString(localeOf(lang), { month: 'narrow' })}</small>
            </div>
          ))}
        </div>
      </div>

      {s.expensesByCategory.length > 0 && (
        <div className="card stack-sm"><div className="card-title">{f.byCategory}</div>
          {s.expensesByCategory.map(x => <div key={x.category} className="between small"><span>{f.expenseCats[x.category] ?? x.category}</span><strong>{rm(x.amount)}</strong></div>)}
        </div>
      )}

      <div className="card stack-sm" data-testid="deal-list">
        <div className="between"><div className="card-title">{f.deals}</div><button className="btn small primary" onClick={() => go({ name: 'dealForm' })}>{f.addDeal}</button></div>
        {deals.length === 0 ? <Empty>{f.noDeals}</Empty> : deals.map(d => {
          const prop = state.properties.find(x => x.id === d.propertyId);
          return (
            <button key={d.id} className="link-row deal-row" onClick={() => go({ name: 'dealForm', id: d.id })}>
              <span className="between"><strong>{d.title || (prop && cardTitle(prop)) || f.side[d.side]}</strong>{d.sample && <SampleTag lang={lang} />}<span className={`deal-st deal-${d.status}`}>{f.dealStatus[d.status]}</span></span>
              <small className="muted">{fmtDate(d.date, lang)} · {f.side[d.side]} · {rm(d.value)} · {f.f.mine(rm(myCommission(d)))}</small>
            </button>
          );
        })}
      </div>

      <div className="card stack-sm" data-testid="expense-list">
        <div className="between"><div className="card-title">{f.expenseList}</div><button className="btn small primary" onClick={() => go({ name: 'expenseForm' })}>{f.addExpense}</button></div>
        {exp.length === 0 ? <Empty>{f.noExpenses}</Empty> : exp.map(e => (
          <button key={e.id} className="link-row" onClick={() => go({ name: 'expenseForm', id: e.id })}>
            <span className="between"><span>{f.expenseCats[e.category] ?? e.category}{e.note ? ` · ${e.note}` : ''}{e.sample && <> <SampleTag lang={lang} /></>}</span><strong>{rm(e.amount)}</strong></span>
            <small className="muted">{fmtDate(e.date, lang)}</small>
          </button>
        ))}
      </div>

      <div className="card stack-sm" data-testid="income-list">
        <div className="between"><div className="card-title">{f.incomeList}</div><button className="btn small primary" onClick={() => go({ name: 'incomeForm' })}>{f.addIncome}</button></div>
        {inc.length === 0 ? <Empty>{f.noIncome}</Empty> : inc.map(e => (
          <button key={e.id} className="link-row" onClick={() => go({ name: 'incomeForm', id: e.id })}>
            <span className="between"><span>{f.incomeSources[e.source] ?? e.source}{e.note ? ` · ${e.note}` : ''}{e.sample && <> <SampleTag lang={lang} /></>}</span><strong>{rm(e.amount)}</strong></span>
            <small className="muted">{fmtDate(e.date, lang)}</small>
          </button>
        ))}
      </div>
    </section>
  );
}

export function DealForm({ lang, back, id, propertyId }: { lang: Lang; back: () => void; id?: string; propertyId?: string }) {
  const { state, store } = useApp();
  const f = financeStrings[lang];
  const c = strings[lang].c;
  const toast = useToast();
  const existing = id ? state.deals.find(x => x.id === id) : undefined;
  const prop0 = state.properties.find(x => x.id === propertyId);
  const [d, setD] = useState<Deal>(() => existing ?? {
    id: newId(), created: Date.now(), updated: Date.now(), propertyId, side: prop0?.purpose === 'rent' ? 'rent' : 'sale', date: ymd(new Date()),
    ...dealStart(prop0), sharePct: 100, status: 'estimated',
  });
  const [raw, setRaw] = useState<Record<string, string>>({});
  const [del, setDel] = useState(false);
  const draft = useDraft<Deal>({ collection: 'deals', existing, value: d, apply: setD, variant: { propertyId } });
  const update = (k: 'value' | 'commissionPct' | 'commission' | 'sharePct' | 'receivedAmount', v: number | undefined) => setD(x => {
    const next = { ...x, [k]: v } as Deal;
    if ((k === 'value' || k === 'commissionPct') && next.value && next.commissionPct !== undefined) { next.commission = commissionFrom(next.value, next.commissionPct); setRaw(r => { const y = { ...r }; delete y.commission; return y; }); }
    return next;
  });
  const field = (k: 'value' | 'commissionPct' | 'commission' | 'sharePct' | 'receivedAmount', label: string) => (
    <label className="ff">{label}
      {k === 'value' || k === 'commission' || k === 'receivedAmount'
        ? <MoneyInput data-field={k} value={d[k]} onChange={v => update(k, v)} />
        : <input inputMode="decimal" data-field={k} value={raw[k] ?? (d[k] ?? '')} onChange={e => { setRaw(r => ({ ...r, [k]: e.target.value })); update(k, num(e.target.value)); }} />}
    </label>
  );
  return (
    <section className="stack" data-testid="deal-form">
      <DraftBanner lang={lang} draft={draft} />
      <div className="card stack-sm">
        <label className="ff">{f.f.title}<input value={d.title ?? ''} onChange={e => setD(x => ({ ...x, title: e.target.value || undefined }))} /></label>
        <PropertySelect lang={lang} label={f.f.property} value={d.propertyId} onChange={v => {
          const p = state.properties.find(x => x.id === v);
          setD(x => { const st = dealStart(p); return { ...x, propertyId: v, value: x.value || st.value, commissionPct: x.commissionPct ?? st.commissionPct, commission: x.commission || st.commission }; });
        }} />
        <ContactSelect lang={lang} label={f.f.contact} roles={['buyer']} value={d.contactId} onChange={v => setD(x => ({ ...x, contactId: v }))} />
        <label className="ff">{f.f.side}
          <select value={d.side} onChange={e => setD(x => ({ ...x, side: e.target.value as Deal['side'] }))}>{(['sale', 'rent'] as const).map(x => <option key={x} value={x}>{f.side[x]}</option>)}</select>
        </label>
        <label className="ff">{f.f.date}<input type="date" value={d.date} onChange={e => setD(x => ({ ...x, date: e.target.value || x.date }))} /></label>
        {field('value', f.f.value)}
        <div className="two">{field('commissionPct', f.f.pct)}{field('sharePct', f.f.share)}</div>
        <small className="muted">{f.calcHint}</small>
        {field('commission', f.f.commission)}
        <strong className="small" data-testid="my-commission">{f.f.mine(rm(myCommission(d)))}</strong>
        <label className="ff">{f.f.status}
          <select data-field="status" value={d.status} onChange={e => setD(x => ({ ...x, status: e.target.value as Deal['status'], receivedDate: e.target.value === 'received' ? x.receivedDate ?? ymd(new Date()) : x.receivedDate }))}>
            {DEAL_STATUSES.map(x => <option key={x} value={x}>{f.dealStatus[x]}</option>)}
          </select>
        </label>
        {d.status === 'received' && <>
          <label className="ff">{f.f.receivedDate}<input type="date" value={d.receivedDate ?? ''} onChange={e => setD(x => ({ ...x, receivedDate: e.target.value || undefined }))} /></label>
          {field('receivedAmount', f.f.receivedAmount)}
        </>}
        <label className="ff">{f.f.notes}<textarea rows={2} value={d.notes ?? ''} onChange={e => setD(x => ({ ...x, notes: e.target.value || undefined }))} /></label>
      </div>
      {existing && <button className="btn ghost danger-text" onClick={() => setDel(true)}>{c.delete}</button>}
      <div className="save-bar"><div className="two">
        <button className="btn secondary" onClick={back}>{c.cancel}</button>
        <button className="btn primary" data-testid="save-deal" onClick={() => { store.upsert('deals', { ...d, value: d.value || 0, commission: d.commission || 0, sharePct: d.sharePct ?? 100 }); draft.clear(); toast(c.saved); back(); }}>{c.save}</button>
      </div></div>
      {del && existing && <Confirm lang={lang} title={c.deleteQ} body={c.deleteBody} onCancel={() => setDel(false)} onOk={() => { store.remove('deals', existing.id); back(); }} />}
    </section>
  );
}

export function MoneyForm({ lang, back, id, kind }: { lang: Lang; back: () => void; id?: string; kind: 'expense' | 'income' }) {
  const { state, store } = useApp();
  const f = financeStrings[lang];
  const c = strings[lang].c;
  const toast = useToast();
  const coll = kind === 'expense' ? 'expenses' : 'incomes';
  const existing = id ? (state[coll] as (Expense | Income)[]).find(x => x.id === id) : undefined;
  const [date, setDate] = useState(existing?.date ?? ymd(new Date()));
  const [cat, setCat] = useState<string | undefined>(existing ? ('category' in existing ? existing.category : existing.source) : undefined);
  const [amount, setAmount] = useState<number | undefined>(existing?.amount);
  const [note, setNote] = useState(existing?.note ?? '');
  const [propertyId, setPropertyId] = useState(existing && 'propertyId' in existing ? existing.propertyId : undefined);
  const [err, setErr] = useState(false);
  const [del, setDel] = useState(false);
  const builtIns = kind === 'expense' ? EXPENSE_CATEGORIES.map(v => ({ value: v, label: f.expenseCats[v] })) : INCOME_SOURCES.map(v => ({ value: v, label: f.incomeSources[v] }));
  return (
    <section className="stack" data-testid={`${kind}-form`}>
      <div className="card stack-sm">
        <label className="ff">{strings[lang].c.date}<input type="date" value={date} onChange={e => setDate(e.target.value || date)} /></label>
        <OptionSelect lang={lang} label={kind === 'expense' ? f.f.category : f.f.source} listKey={kind === 'expense' ? 'expenseCategory' : 'incomeSource'} builtIns={builtIns} value={cat} onChange={setCat} />
        <label className="ff">{f.f.amount}<MoneyInput data-field="amount" aria-invalid={err} value={amount} onChange={n => { setAmount(n); setErr(false); }} /></label>
        {err && <p className="error" role="alert">{f.required}</p>}
        <label className="ff">{f.f.note}<input value={note} onChange={e => setNote(e.target.value)} /></label>
        {kind === 'expense' && <PropertySelect lang={lang} value={propertyId} onChange={setPropertyId} />}
      </div>
      {existing && <button className="btn ghost danger-text" onClick={() => setDel(true)}>{c.delete}</button>}
      <div className="save-bar"><div className="two">
        <button className="btn secondary" onClick={back}>{c.cancel}</button>
        <button className="btn primary" data-testid={`save-${kind}`} onClick={() => {
          const amt = amount;
          if (!amt) { setErr(true); return; }
          const base = { id: existing?.id ?? newId(), created: existing?.created ?? Date.now(), updated: Date.now(), date, amount: amt, note: note.trim() || undefined };
          if (kind === 'expense') store.upsert('expenses', { ...base, category: cat ?? EXPENSE_CATEGORIES[0], propertyId });
          else store.upsert('incomes', { ...base, source: cat ?? INCOME_SOURCES[0] });
          toast(c.saved); back();
        }}>{c.save}</button>
      </div></div>
      {del && existing && <Confirm lang={lang} title={c.deleteQ} body={c.deleteBody} onCancel={() => setDel(false)} onOk={() => { store.remove(coll, existing.id); back(); }} />}
    </section>
  );
}
