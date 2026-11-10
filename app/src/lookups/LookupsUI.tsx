// Batch C: Property Lookups (Oneharta), paid with Ai Buddy Tokens. Opened from the token card in Settings and from Market
// News and Intelligence, only while the billing switch is on. Every paid lookup first shows the most it can cost and the
// agent's balance, and runs only after Confirm. Results are kept in this screen's memory only: never saved, never synced.
import { useEffect, useState, type ReactNode } from 'react';
import type { Lang } from '../i18n';
import { useApp } from '../data/useStore';
import { config } from '../config';
import { fmtDateTime } from '../lib/dates';
import { Select } from '../ui/Select';
import { refreshTokens, tokenBalance } from '../billing/tokens';
import { billingStrings } from '../billing/strings';
import {
  LookupError, MAX_TOKENS, companyStatus, freeList, myLookups, paidLookup, reopenLandTax, type LookupRow, type PaidAnswer, type PaidKind,
} from './api';
import { lookupStrings, type LookupStrings } from './strings';

type Tab = 'ct' | 'company' | 'sale' | 'rental' | 'info' | 'history';
type J = Record<string, any>;   // eslint-disable-line @typescript-eslint/no-explicit-any
type Msg = { text: string; tone: 'ok' | 'error' | 'info' } | null;
const SALE_REGIONS = ['Kuala Lumpur', 'Selangor', 'Ipoh', 'Seremban', 'Johor', 'Melaka', 'Kulim', 'Penang'];
const RENTAL_STATES = ['Selangor', 'Kuala Lumpur', 'Johor', 'Penang', 'Negeri Sembilan', 'Perak', 'Melaka', 'Putrajaya'];
const TITLE_TYPES = ['GRN', 'HSD', 'HSM', 'GM', 'PM', 'PN'];
const SHOW_MAX = 50;

/** Runs paid lookups behind a Confirm step, and turns every answer and error into one message line. */
function usePaid(lang: Lang) {
  const { state, store } = useApp();
  const cfg = config(state.settings);
  const t = lookupStrings[lang];
  const [ask, setAsk] = useState<{ kind: PaidKind; fields: J; then: (a: PaidAnswer<J>) => void; key: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const failText = (e: unknown): Msg => {
    if (e instanceof LookupError) {
      if (e.code === 'not-enough-tokens') return { text: t.err['not-enough-tokens'](Number(e.detail.needed ?? 0), Number(e.detail.balance ?? 0)), tone: 'error' };
      if (e.code === 'refused') return { text: `${e.message} ${t.charged(Number(e.detail.tokensCharged ?? 0), e.detail.balance as number | undefined)}`, tone: 'error' };
      const m = t.err[e.code as keyof typeof t.err];
      return { text: typeof m === 'string' ? m : t.err.other, tone: 'error' };
    }
    return { text: t.err.other, tone: 'error' };
  };
  const run = async (kind: PaidKind, fields: J, then: (a: PaidAnswer<J>) => void) => {
    setAsk(null); setBusy(true); setMsg({ text: t.busy, tone: 'info' });
    try {
      const a = await paidLookup<J>(store, cfg, kind, fields);
      then(a);
      setMsg({ text: `${t.charged(a.tokensCharged, a.balance)}${a.costChecked ? '' : ` ${t.notChecked}`}`, tone: a.tokensCharged > 0 ? 'ok' : 'info' });
    } catch (e) { setMsg(failText(e)); }
    setBusy(false);
    void refreshTokens(store, cfg);
  };
  const request = (kind: PaidKind, fields: J, then: (a: PaidAnswer<J>) => void, key: string = kind) => { setMsg(null); setAsk({ kind, fields, then, key }); };
  const confirmBox = (key: string) => ask && ask.key === key ? (
    <div className="card stack-sm" data-testid="lookup-confirm" role="alertdialog">
      <span>{t.confirm(MAX_TOKENS[ask.kind], tokenBalance(store))}</span>
      <div className="btn-row">
        <button type="button" className="btn small primary" data-testid="lookup-confirm-go" onClick={() => void run(ask.kind, ask.fields, ask.then)}>{t.confirmGo}</button>
        <button type="button" className="btn small secondary" data-testid="lookup-confirm-cancel" onClick={() => setAsk(null)}>{t.cancel}</button>
      </div>
    </div>
  ) : null;
  const msgLine = msg && <p className={`small ${msg.tone === 'ok' ? 'ok-text' : msg.tone === 'error' ? 'error' : 'muted'}`} role="status" data-testid="lookup-msg">{msg.text}</p>;
  return { store, cfg, t, busy, request, confirmBox, msgLine, setMsg, failText };
}

const Row = ({ k, v }: { k: string; v: unknown }) => (v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0) ? null : (
  <div className="between small"><span className="muted">{k}</span><strong className="right">{Array.isArray(v) ? v.join(', ') : String(v)}</strong></div>
));
const Field = ({ label, children }: { label: string; children: ReactNode }) => <label className="ff">{label}{children}</label>;

export function LookupsScreen({ lang }: { lang: Lang }) {
  const { state, store } = useApp();
  const cfg = config(state.settings);
  const t = lookupStrings[lang];
  const [tab, setTab] = useState<Tab>('ct');
  const me = state.meta.syncSession?.userId;
  useEffect(() => { if (me) void refreshTokens(store, cfg); }, [me]);   // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <section className="stack" data-testid="lookups">
      <div className="card stack-sm">
        <small className="muted" data-testid="lookup-banner">{t.banner}</small>
        <strong data-testid="lookup-balance">{t.balance(tokenBalance(store))}</strong>
        <small className="muted" data-testid="lookup-pdpa">{t.pdpa}</small>
      </div>
      {!me ? <p className="muted" data-testid="lookup-signin">{t.err['not-signed-in']}</p> : (
        <>
          <div className="chip-row filter-chips" role="tablist" data-testid="lookup-tabs">
            {(['ct', 'company', 'sale', 'rental', 'info', 'history'] as Tab[]).map(k => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} className={`chip-btn ${tab === k ? 'on' : ''}`} data-testid={`lookup-tab-${k}`} onClick={() => setTab(k)}>{t.tabs[k]}</button>
            ))}
          </div>
          {tab === 'ct' && <LandTax lang={lang} />}
          {tab === 'company' && <Company lang={lang} />}
          {tab === 'sale' && <Transactions lang={lang} kind="sale" />}
          {tab === 'rental' && <Transactions lang={lang} kind="rental" />}
          {tab === 'info' && <InfoSearch lang={lang} />}
          {tab === 'history' && <History lang={lang} />}
        </>
      )}
    </section>
  );
}

// ── land tax ────────────────────────────────────────────────────────────────────────────────────────────────────────
function Titles({ titles, t }: { titles: J[]; t: LookupStrings }) {
  return (
    <div className="stack-sm" data-testid="ct-titles">
      {titles.map((x, i) => (
        <div className="card stack-sm" key={i} data-testid="ct-title">
          <strong>{[x.titleType, x.titleNo].filter(Boolean).join(' ')} · {x.lotNo}</strong>
          <Row k={t.owner} v={x.ownerName} /><Row k={t.ic} v={x.ownerIdentityNo} /><Row k={t.area} v={x.landArea} />
          <Row k={t.address} v={x.address} /><Row k={t.phones} v={x.contact?.phones} /><Row k={t.emails} v={x.contact?.emails} />
        </div>
      ))}
    </div>
  );
}

function LandTax({ lang }: { lang: Lang }) {
  const p = usePaid(lang); const { t, store, cfg } = p;
  const [lists, setLists] = useState<{ states: string[]; districts: string[]; mukims: string[]; sections: string[] }>({ states: [], districts: [], mukims: [], sections: [] });
  const [f, setF] = useState({ state: '', district: '', mukim: '', section: '', searchBy: 'lotNo', titleType: 'GRN', number: '' });
  const [res, setRes] = useState<J | null>(null);
  const load = async (kind: 'ct_states' | 'ct_districts' | 'ct_mukims' | 'ct_sections', fields: J, key: keyof typeof lists) => {
    try { const r = await freeList<J>(store, cfg, kind, fields); setLists(l => ({ ...l, [key]: Array.isArray(r?.[key]) ? r[key] : [] })); }
    catch (e) { p.setMsg(p.failText(e)); }
  };
  useEffect(() => { void load('ct_states', {}, 'states'); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: keyof typeof f, v: string) => {
    const next = { ...f, [k]: v };
    if (k === 'state') { next.district = ''; next.mukim = ''; next.section = ''; setLists(l => ({ ...l, districts: [], mukims: [], sections: [] })); if (v) void load('ct_districts', { state: v }, 'districts'); }
    if (k === 'district') { next.mukim = ''; next.section = ''; setLists(l => ({ ...l, mukims: [], sections: [] })); if (v) void load('ct_mukims', { state: next.state, district: v }, 'mukims'); }
    if (k === 'mukim') { next.section = ''; if (v) void load('ct_sections', { state: next.state, district: next.district, mukim: v }, 'sections'); }
    setF(next);
  };
  const opts = (xs: string[]) => [<option key="" value="">{t.choose}</option>, ...xs.map(x => <option key={x} value={x}>{x}</option>)];
  const ready = f.state && f.district && f.mukim && f.number.trim();
  const search = (choiceId?: string) => p.request('ct_search', { ...f, ...(choiceId ? { choiceId } : {}) }, a => setRes(a.result), choiceId ? `ct-${choiceId}` : 'ct');
  return (
    <div className="card stack-sm" data-testid="lookup-ct">
      <Field label={t.state}><Select data-testid="ct-state" value={f.state} onChange={e => set('state', e.target.value)}>{opts(lists.states)}</Select></Field>
      <Field label={t.district}><Select data-testid="ct-district" value={f.district} disabled={!f.state} onChange={e => set('district', e.target.value)}>{opts(lists.districts)}</Select></Field>
      <Field label={t.mukim}><Select data-testid="ct-mukim" value={f.mukim} disabled={!f.district} onChange={e => set('mukim', e.target.value)}>{opts(lists.mukims)}</Select></Field>
      {lists.sections.length > 0 && <Field label={t.section}><Select data-testid="ct-section" value={f.section} onChange={e => set('section', e.target.value)}>{opts(lists.sections)}</Select></Field>}
      <Field label={t.by}><Select data-testid="ct-by" value={f.searchBy} onChange={e => set('searchBy', e.target.value)}><option value="lotNo">{t.lotNo}</option><option value="titleNo">{t.titleNo}</option></Select></Field>
      {f.searchBy === 'titleNo' && <Field label={t.titleType}><Select data-testid="ct-title-type" value={f.titleType} onChange={e => set('titleType', e.target.value)}>{TITLE_TYPES.map(x => <option key={x} value={x}>{x}</option>)}</Select></Field>}
      <Field label={t.number}><input data-testid="ct-number" inputMode="numeric" value={f.number} onChange={e => set('number', e.target.value)} /></Field>
      <button type="button" className="btn primary" data-testid="ct-search" disabled={p.busy || !ready} onClick={() => search()}>{t.upTo(MAX_TOKENS.ct_search)}</button>
      {p.confirmBox('ct')}
      {p.msgLine}
      {res?.selectionRequired && Array.isArray(res.choices) && (
        <div className="stack-sm" data-testid="ct-choices">
          <small>{t.chooseTitle}</small>
          {res.choices.map((c: J) => (
            <div key={String(c.choiceId)} className="stack-sm">
              <div className="between"><span>{[c.titleType, c.titleNo, c.lotNo].filter(Boolean).join(' · ') || String(c.choiceId)}</span>
                <button type="button" className="btn small secondary" data-testid="ct-choose" disabled={p.busy} onClick={() => search(String(c.choiceId))}>{t.pick}</button></div>
              {p.confirmBox(`ct-${c.choiceId}`)}
            </div>
          ))}
        </div>
      )}
      {res && !res.selectionRequired && (res.record ? <Titles titles={res.record.titles ?? []} t={t} /> : <p className="muted" data-testid="ct-nothing">{t.nothing}</p>)}
    </div>
  );
}

// ── company ─────────────────────────────────────────────────────────────────────────────────────────────────────────
function CompanyDetail({ d, t }: { d: J; t: LookupStrings }) {
  const c = d.company ?? {}; const acc = Array.isArray(d.accounts) ? d.accounts[0] : null;
  return (
    <div className="card stack-sm" data-testid="company-detail">
      <strong>{c.name}</strong>
      <Row k={t.regNo} v={c.registrationNo} /><Row k={t.activity} v={c.businessActivity} /><Row k={t.address} v={c.address} />
      {d.assessment?.rating && <Row k={t.rating} v={d.assessment.rating} />}
      {acc && <><small className="muted">{t.accounts} · {acc.yearEnded}</small><Row k={t.turnover} v={acc.turnover} /><Row k={t.profit} v={acc.netProfit} /></>}
      {Array.isArray(d.people) && d.people.length > 0 && <small className="muted">{t.people}</small>}
      {(d.people ?? []).map((x: J, i: number) => (
        <div key={i} className="stack-sm" data-testid="company-person"><strong className="small">{x.name} · {x.role}</strong><Row k={t.ic} v={x.identityNo} /><Row k={t.phones} v={x.phones} /></div>
      ))}
    </div>
  );
}

function Company({ lang }: { lang: Lang }) {
  const p = usePaid(lang); const { t, store, cfg } = p;
  const [reg, setReg] = useState('');
  const [id, setId] = useState<string | null>(null);
  const [detail, setDetail] = useState<J | null>(null);
  const check = async (lookupId: string) => {
    try {
      const s = await companyStatus(store, cfg, lookupId);
      if (s.status === 'ready') { setDetail(s.result); p.setMsg(null); }
      else if (s.status === 'no-data') { p.setMsg({ text: t.noData(s.refunded), tone: 'info' }); void refreshTokens(store, cfg); }
      else p.setMsg({ text: t.stillPending, tone: 'info' });
    } catch (e) { p.setMsg(p.failText(e)); }
  };
  const digits = reg.replace(/[\s-]/g, '');
  return (
    <div className="card stack-sm" data-testid="lookup-company">
      <Field label={t.regNo}><input data-testid="company-reg" inputMode="numeric" placeholder={t.regPh} value={reg} onChange={e => setReg(e.target.value)} /></Field>
      <button type="button" className="btn primary" data-testid="company-search" disabled={p.busy || !/^\d{12}$/.test(digits)}
        onClick={() => p.request('company', { registrationNo: digits }, a => { setId(a.lookupId); setDetail(null); })}>{t.upTo(MAX_TOKENS.company)}</button>
      {p.confirmBox('company')}
      {p.msgLine}
      {id && !detail && <div className="stack-sm"><small data-testid="company-submitted">{t.submitted}</small>
        <button type="button" className="btn small secondary" data-testid="company-check" onClick={() => void check(id)}>{t.checkNow}</button></div>}
      {detail && <CompanyDetail d={detail} t={t} />}
    </div>
  );
}

// ── sales and rentals ───────────────────────────────────────────────────────────────────────────────────────────────
function Transactions({ lang, kind }: { lang: Lang; kind: 'sale' | 'rental' }) {
  const p = usePaid(lang); const { t } = p;
  const sale = kind === 'sale';
  const [f, setF] = useState({ where: sale ? 'Selangor' : '', address: '', project: '', lotNo: '' });
  const [res, setRes] = useState<{ results: J[]; total: number } | null>(null);
  const [names, setNames] = useState<Record<string, J>>({});
  const ready = !!(f.address.trim() || f.project.trim() || (sale && f.lotNo.trim()));
  const fields = sale ? { region: f.where, address: f.address, project: f.project, lotNo: f.lotNo } : { state: f.where, address: f.address, project: f.project };
  const search = () => p.request(sale ? 'sale_search' : 'rental_search', fields, a => { setNames({}); setRes({ results: Array.isArray(a.result.results) ? a.result.results : [], total: Number(a.result.total ?? 0) }); });
  const unlock = (id: number) => p.request(sale ? 'sale_unlock' : 'rental_unlock', { id }, a => setNames(n => ({ ...n, [id]: a.result })), `u-${id}`);
  const shown = (res?.results ?? []).slice(0, SHOW_MAX);
  return (
    <div className="card stack-sm" data-testid={`lookup-${kind}`}>
      <Field label={sale ? t.region : t.rentalState}>
        <Select data-testid={`${kind}-where`} value={f.where} onChange={e => setF({ ...f, where: e.target.value })}>
          {!sale && <option value="">{t.allStates}</option>}
          {(sale ? SALE_REGIONS : RENTAL_STATES).map(x => <option key={x} value={x}>{x}</option>)}
        </Select>
      </Field>
      <Field label={t.addr}><input data-testid={`${kind}-address`} value={f.address} onChange={e => setF({ ...f, address: e.target.value })} /></Field>
      <Field label={t.project}><input data-testid={`${kind}-project`} value={f.project} onChange={e => setF({ ...f, project: e.target.value })} /></Field>
      {sale && <Field label={t.lotOpt}><input data-testid="sale-lot" value={f.lotNo} onChange={e => setF({ ...f, lotNo: e.target.value })} /></Field>}
      <button type="button" className="btn primary" data-testid={`${kind}-search`} disabled={p.busy || !ready} onClick={search}>{t.upTo(MAX_TOKENS[sale ? 'sale_search' : 'rental_search'])}</button>
      {p.confirmBox(sale ? 'sale_search' : 'rental_search')}
      {p.msgLine}
      {res && res.results.length === 0 && <p className="muted" data-testid={`${kind}-nothing`}>{t.nothing}</p>}
      {res && res.results.length > SHOW_MAX && <small className="muted">{t.showing(SHOW_MAX, res.total || res.results.length)}</small>}
      {shown.map(r => {
        const n = names[r.id] ?? (sale ? (r.vendor || r.purchaser ? r : null) : (r.owner || r.tenant ? r : null));
        const canUnlock = sale ? r.hasVendor || r.hasPurchaser : r.hasOwner || r.hasTenant;
        return (
          <div key={r.id} className="card stack-sm" data-testid={`${kind}-row`}>
            <strong>{r.project || r.buildingName || r.address}</strong>
            <Row k={t.address} v={r.address} />
            {sale ? <><Row k={t.date} v={r.date} /><Row k={t.price} v={r.price} /><Row k={t.type} v={r.propertyType} /><Row k={t.tenure} v={r.tenure} /><Row k={t.builtUp} v={r.builtUpArea} /></>
              : <><Row k={t.rent} v={r.rent} /><Row k={t.period} v={r.rentStart ? `${r.rentStart} – ${r.rentEnd ?? ''}` : null} /><Row k={t.size} v={r.sizeSqft} /><Row k={t.furnished} v={r.furnished} />{r.masked && <small className="muted">{t.masked}</small>}</>}
            {n ? <>{sale ? <><Row k={t.vendor} v={n.vendor} /><Row k={t.purchaser} v={n.purchaser} /></> : <><Row k={t.landlord} v={n.owner} /><Row k={t.tenant} v={n.tenant} /></>}</>
              : canUnlock && <button type="button" className="btn small secondary" data-testid={`${kind}-unlock`} disabled={p.busy} onClick={() => unlock(r.id)}>{t.unlockUpTo(MAX_TOKENS.sale_unlock)}</button>}
            {p.confirmBox(`u-${r.id}`)}
          </div>
        );
      })}
    </div>
  );
}

// ── InfoSearch ──────────────────────────────────────────────────────────────────────────────────────────────────────
function InfoSearch({ lang }: { lang: Lang }) {
  const p = usePaid(lang); const { t } = p;
  const [f, setF] = useState({ name: '', identityNo: '', phone: '', address: '' });
  const [res, setRes] = useState<{ results: J[]; total: number } | null>(null);
  const ready = Object.values(f).some(v => v.trim());
  const shown = (res?.results ?? []).slice(0, SHOW_MAX);
  return (
    <div className="card stack-sm" data-testid="lookup-info">
      <small className="muted">{t.infoHint}</small>
      <Field label={t.infoName}><input data-testid="info-name" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
      <Field label={t.infoIc}><input data-testid="info-ic" inputMode="numeric" value={f.identityNo} onChange={e => setF({ ...f, identityNo: e.target.value })} /></Field>
      <Field label={t.infoPhone}><input data-testid="info-phone" inputMode="tel" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} /></Field>
      <Field label={t.infoAddr}><input data-testid="info-address" value={f.address} onChange={e => setF({ ...f, address: e.target.value })} /></Field>
      <button type="button" className="btn primary" data-testid="info-search" disabled={p.busy || !ready}
        onClick={() => p.request('infosearch', f, a => setRes({ results: Array.isArray(a.result.results) ? a.result.results : [], total: Number(a.result.total ?? 0) }))}>{t.upTo(MAX_TOKENS.infosearch)}</button>
      {p.confirmBox('infosearch')}
      {p.msgLine}
      {res && res.results.length === 0 && <p className="muted" data-testid="info-nothing">{t.nothing}</p>}
      {res && res.results.length > SHOW_MAX && <small className="muted">{t.showing(SHOW_MAX, res.total || res.results.length)}</small>}
      {shown.map((r, i) => (
        <div key={i} className="card stack-sm" data-testid="info-row">
          <strong>{r.name}</strong><Row k={t.ic} v={r.identityNo} /><Row k={t.infoPhone} v={r.phone} /><Row k={t.email} v={r.email} /><Row k={t.address} v={r.address} />
        </div>
      ))}
    </div>
  );
}

// ── history ─────────────────────────────────────────────────────────────────────────────────────────────────────────
function History({ lang }: { lang: Lang }) {
  const p = usePaid(lang); const { t, store, cfg } = p;
  const [rows, setRows] = useState<LookupRow[] | null>(null);
  const [open, setOpen] = useState<{ id: string; kind: string; data: J } | null>(null);
  const load = async () => { try { setRows(await myLookups(store, cfg)); } catch (e) { setRows([]); p.setMsg(p.failText(e)); } };
  useEffect(() => { void load(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  const reopen = async (r: LookupRow) => {
    try {
      if (r.kind === 'ct_search') setOpen({ id: r.id, kind: r.kind, data: await reopenLandTax(store, cfg, r.id) });
      else {
        const s = await companyStatus(store, cfg, r.id);
        if (s.status === 'ready') setOpen({ id: r.id, kind: r.kind, data: s.result });
        else if (s.status === 'no-data') { p.setMsg({ text: t.noData(s.refunded), tone: 'info' }); void load(); void refreshTokens(store, cfg); }
        else p.setMsg({ text: t.stillPending, tone: 'info' });
      }
    } catch (e) { p.setMsg(p.failText(e)); }
  };
  return (
    <div className="card stack-sm" data-testid="lookup-history">
      <small className="muted">{t.historyNote}</small>
      <button type="button" className="btn small secondary" data-testid="history-refresh" onClick={() => void load()}>{t.refresh}</button>
      {p.msgLine}
      {rows && rows.length === 0 && <p className="muted" data-testid="history-empty">{t.noHistory}</p>}
      {(rows ?? []).map(r => (
        <div key={r.id} className="stack-sm" data-testid="history-row">
          <div className="between small"><strong>{t.kinds[r.kind] ?? r.kind}</strong><span>{r.tokens} · {t.status[r.status] ?? r.status}</span></div>
          <small className="muted">{r.summary} · {fmtDateTime(r.created_at, lang)}</small>
          {r.reopen && r.status !== 'refunded' && <button type="button" className="btn small secondary" data-testid="history-reopen" onClick={() => void reopen(r)}>{t.reopen}</button>}
          {open?.id === r.id && (open.kind === 'ct_search' ? <Titles titles={open.data.titles ?? []} t={t} /> : <CompanyDetail d={open.data} t={t} />)}
        </div>
      ))}
    </div>
  );
}

/** The way in: a button for the token card in Settings and for Market News (shown only while billing is switched on). */
export function LookupsEntry({ lang, onOpen }: { lang: Lang; onOpen: () => void }) {
  const t = lookupStrings[lang];
  return (
    <button type="button" className="btn secondary" data-testid="open-lookups" onClick={onOpen} title={t.openHint}>
      {t.open} <small className="muted">· {billingStrings[lang].tokens.title.replace(/\s*\(.*\)$/, '')}</small>
    </button>
  );
}
