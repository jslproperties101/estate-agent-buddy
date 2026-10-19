// JoyChange002 — the Project screens: the list of new developments, one project's page (unit types, prices, bookings)
// and its form. Bookings are added and changed on the project page; nothing is saved until Save.
import { useMemo, useState } from 'react';
import type { Lang } from '../i18n';
import { strings } from '../i18n';
import { useApp } from '../data/useStore';
import { newId } from '../data/store';
import { Go } from '../nav';
import { Confirm } from '../ui/common';
import { MoneyInput } from '../ui/MoneyInput';
import { ContactPick } from '../ui/ContactPick';
import { useToast } from '../ui/toast';
import { rm } from '../lib/money';
import { ymd } from '../lib/dates';
import { TYPES } from '../listing/model';
import { listingStrings, typeLabel } from '../listing/strings';
import { BUYER_ROLES } from '../data/types';
import { useRemembered } from '../ui/screenMemory';
import { MY_STATES } from '../domain/places';
import {
  Project, ProjectBooking, UnitType, PROJECT_STATUSES, BOOKING_STATUSES, priceRange, unitCounts, unitTaken, bookingCommission, placeOf,
} from './model';
import { projectStrings } from './strings';
import { Select } from '../ui/Select';

const num = (s: string) => { const t = s.replace(/[, ]/g, ''); if (!t) return undefined; const n = Number(t); return Number.isFinite(n) ? n : undefined; };
const priceText = (p: Project, t: ReturnType<typeof strings2>) => {
  const r = priceRange(p);
  return r.from === undefined ? t.noPrice : t.priceRange(rm(r.from), r.to !== undefined ? rm(r.to) : undefined);
};
const strings2 = (lang: Lang) => projectStrings[lang];

// ---------- the list ----------
export function ProjectList({ lang, go }: { lang: Lang; go: Go }) {
  const { state } = useApp();
  const t = projectStrings[lang];
  const [q, setQ] = useRemembered('q', '');
  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    return state.projects
      .filter(p => !n || [p.name, p.developer, p.township, p.city, p.state].some(v => (v ?? '').toLowerCase().includes(n)))
      .sort((a, b) => b.updated - a.updated);
  }, [state.projects, q]);
  return (
    <section className="stack" data-testid="projects">
      <button className="btn primary add-property" data-testid="project-add" onClick={() => go({ name: 'projectForm' })}><span aria-hidden="true">＋</span> {t.add}</button>
      {state.projects.length > 0 && <input aria-label={t.search} placeholder={t.search} value={q} onChange={e => setQ(e.target.value)} data-testid="project-search" />}
      {state.projects.length === 0 && <p className="muted empty" data-testid="projects-empty">{t.empty}</p>}
      {state.projects.length > 0 && list.length === 0 && <p className="muted">{t.none}</p>}
      <ul className="project-list">
        {list.map(p => {
          const c = unitCounts(p);
          return (
            <li key={p.id}>
              <button type="button" className="card project-card" data-testid="project-card" data-id={p.id} onClick={() => go({ name: 'projectDetail', id: p.id })}>
                <span className="between"><strong className="pc-name">{p.name}</strong><span className={`badge pj-st pj-${p.status}`} data-testid="project-status">{t.status[p.status]}</span></span>
                {(p.developer || placeOf(p)) && <small className="muted">{[p.developer, placeOf(p)].filter(Boolean).join(' · ')}</small>}
                <span className="pc-price">{priceText(p, t)}</span>
                <small data-testid="project-counts">{t.counts(c.booked, c.total)}{c.left !== undefined ? ` · ${t.left(c.left)}` : ''}</small>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---------- one project ----------
export function ProjectDetail({ lang, id, go }: { lang: Lang; id: string; go: Go }) {
  const { state, store } = useApp();
  const t = projectStrings[lang];
  const ls = listingStrings[lang];
  const toast = useToast();
  const p = state.projects.find(x => x.id === id);
  const [editing, setEditing] = useState<ProjectBooking | null>(null);
  const [askDelete, setAskDelete] = useState(false);
  if (!p) return <p className="muted">{t.none}</p>;
  const c = unitCounts(p);
  const typeName = (uid?: string) => p.unitTypes.find(u => u.id === uid)?.name;
  const saveBooking = (b: ProjectBooking) => {
    const has = p.bookings.some(x => x.id === b.id);
    store.upsert('projects', { ...p, bookings: has ? p.bookings.map(x => (x.id === b.id ? b : x)) : [...p.bookings, b] });
    setEditing(null); toast(strings[lang].c.saved);
  };
  const removeBooking = (bid: string) => { store.upsert('projects', { ...p, bookings: p.bookings.filter(x => x.id !== bid) }); setEditing(null); };
  const row = (k: string, v?: string | number) => (v === undefined || v === '' ? null : <div className="dl-row"><dt>{k}</dt><dd>{v}</dd></div>);
  return (
    <section className="stack" data-testid="project-detail">
      <div className="card stack-sm">
        <div className="between"><h2 className="pd-name">{p.name}</h2><span className={`badge pj-st pj-${p.status}`}>{t.status[p.status]}</span></div>
        <strong className="lc-price">{priceText(p, t)}</strong>
        <small data-testid="project-counts">{t.counts(c.booked, c.total)}{c.left !== undefined ? ` · ${t.left(c.left)}` : ''}</small>
        <dl className="dl">
          {row(t.f.developer, p.developer)}{row(t.f.developerContact, p.developerContact)}{row(t.f.developerPhone, p.developerPhone)}
          {row(t.f.address, [p.address, placeOf(p)].filter(Boolean).join(', '))}{row(t.f.tenure, p.tenure && t.tenure[p.tenure])}
          {row(t.f.commissionPct, p.commissionPct !== undefined ? `${p.commissionPct}%` : undefined)}
        </dl>
        <div className="two">
          <button className="btn primary" data-testid="project-edit" onClick={() => go({ name: 'projectForm', id: p.id })}>{ls.edit}</button>
          <button className="btn danger" data-testid="project-delete" onClick={() => setAskDelete(true)}>🗑 {t.delete}</button>
        </div>
      </div>

      {(p.launchDate || p.completionDate || p.launchNotes) && (
        <div className="card stack-sm" data-testid="project-launch">
          <div className="card-title">{t.sec.launch}</div>
          <dl className="dl">{row(t.f.launchDate, p.launchDate)}{row(t.f.completionDate, p.completionDate)}</dl>
          {p.launchNotes && <p className="pre small">{p.launchNotes}</p>}
        </div>
      )}

      <div className="card stack-sm" data-testid="project-units">
        <div className="card-title">{t.sec.units}</div>
        {p.unitTypes.length === 0 && <small className="muted">{ls.notSet}</small>}
        {p.unitTypes.map(u => {
          const k = c.byType[u.id];
          return (
            <div key={u.id} className="unit-type" data-testid="unit-type">
              <div className="between"><strong>{u.name}</strong><span className="small">{u.priceFrom !== undefined || u.priceTo !== undefined ? t.priceRange(rm(u.priceFrom ?? u.priceTo), u.priceTo !== undefined ? rm(u.priceTo) : undefined) : t.noPrice}</span></div>
              <small className="muted">{[u.layout && typeLabel(ls, u.layout), u.builtUpSqft !== undefined && `${t.u.builtUp}: ${u.builtUpSqft.toLocaleString('en-MY')}`,
                u.landSqft !== undefined && `${t.u.land}: ${u.landSqft.toLocaleString('en-MY')}`, u.bedrooms !== undefined && `${u.bedrooms} ${t.u.beds}`, u.bathrooms !== undefined && `${u.bathrooms} ${t.u.baths}`].filter(Boolean).join(' · ')}</small>
              <small data-testid="unit-type-counts">{t.counts(k?.booked ?? 0, u.units)}{k?.left !== undefined ? ` · ${t.left(k.left)}` : ''}</small>
            </div>
          );
        })}
      </div>

      <div className="card stack-sm" data-testid="project-bookings">
        <div className="between"><div className="card-title">{t.sec.bookings}</div>
          <button className="btn small primary" data-testid="booking-add" onClick={() => setEditing({ id: newId(), unitNo: '', status: 'booked', bookedOn: ymd(new Date()) })}>＋ {t.b.add}</button></div>
        {p.bookings.length === 0 && <small className="muted">{t.b.none}</small>}
        {p.bookings.map(b => {
          const buyer = b.buyerId ? state.contacts.find(x => x.id === b.buyerId)?.name : b.buyerName;
          const com = bookingCommission(p, b);
          return (
            <button key={b.id} type="button" className={`link-row booking-row bk-${b.status}`} data-testid="booking-row" onClick={() => setEditing(b)}>
              <strong>{b.unitNo}{typeName(b.unitTypeId) ? ` · ${typeName(b.unitTypeId)}` : ''}</strong>
              <span className={`badge bk-st bk-${b.status}`} data-testid="booking-status">{t.booking[b.status]}</span>
              <small className="muted">{[buyer, b.bookedOn, b.price !== undefined && rm(b.price)].filter(Boolean).join(' · ')}</small>
              {com !== undefined && <small className="ok-text">{t.commission(rm(com))}</small>}
            </button>
          );
        })}
      </div>

      {p.notes && <div className="card stack-sm"><div className="card-title">{t.f.notes}</div><p className="pre small">{p.notes}</p></div>}

      {editing && <BookingEditor lang={lang} p={p} b={editing} onCancel={() => setEditing(null)} onSave={saveBooking}
        onDelete={p.bookings.some(x => x.id === editing.id) ? () => removeBooking(editing.id) : undefined} />}
      {askDelete && <Confirm lang={lang} title={t.deleteQ} body={`${p.name} — ${t.deleteBody}`} okLabel={t.delete}
        onCancel={() => setAskDelete(false)} onOk={() => { store.remove('projects', p.id); setAskDelete(false); go({ name: 'projects' }, { replace: true }); }} />}
    </section>
  );
}

function BookingEditor({ lang, p, b, onCancel, onSave, onDelete }: { lang: Lang; p: Project; b: ProjectBooking; onCancel: () => void; onSave: (b: ProjectBooking) => void; onDelete?: () => void }) {
  const { state } = useApp();
  const t = projectStrings[lang];
  const c = strings[lang].c;
  const [d, setD] = useState<ProjectBooking>(b);
  const [err, setErr] = useState<string | null>(null);
  const [askDel, setAskDel] = useState(false);
  const set = (x: Partial<ProjectBooking>) => { setD(v => ({ ...v, ...x })); setErr(null); };
  const buyers = state.contacts.filter(x => x.roles.some(r => BUYER_ROLES.includes(r)));
  function save() {
    const unitNo = d.unitNo.trim();
    if (!unitNo) { setErr(t.b.unitRequired); return; }
    if (d.status !== 'cancelled' && unitTaken(p, unitNo, d.id)) { setErr(t.b.taken); return; }
    onSave({ ...d, unitNo, buyerName: d.buyerId ? undefined : d.buyerName?.trim() || undefined, buyerPhone: d.buyerId ? undefined : d.buyerPhone?.trim() || undefined, note: d.note?.trim() || undefined });
  }
  return (
    <div className="scrim" role="presentation">
      <div className="sheet stack-sm" role="dialog" aria-modal="true" aria-labelledby="bk-t" data-testid="booking-editor">
        <h2 id="bk-t">{onDelete ? t.b.edit : t.b.add}</h2>
        <label className="ff">{t.b.unitType}
          <Select data-field="unitTypeId" value={d.unitTypeId ?? ''} onChange={e => set({ unitTypeId: e.target.value || undefined })}>
            <option value="">{t.b.anyType}</option>{p.unitTypes.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
        </label>
        <label className="ff">{t.b.unitNo}<input data-field="unitNo" value={d.unitNo} aria-invalid={!!err} onChange={e => set({ unitNo: e.target.value })} /></label>
        <label className="ff">{t.b.status}
          <Select data-field="bookingStatus" value={d.status} onChange={e => set({ status: e.target.value as ProjectBooking['status'] })}>
            {BOOKING_STATUSES.map(s => <option key={s} value={s}>{t.booking[s]}</option>)}
          </Select>
        </label>
        <ContactPick lang={lang} label={t.b.buyer} contacts={buyers} value={d.buyerId} onChange={v => set({ buyerId: v })} noneLabel={t.b.buyerNone} testId="booking-buyer" />
        {!d.buyerId && <div className="two">
          <label className="ff">{t.b.buyerName}<input data-field="buyerName" value={d.buyerName ?? ''} onChange={e => set({ buyerName: e.target.value })} /></label>
          <label className="ff">{t.b.buyerPhone}<input data-field="buyerPhone" type="tel" inputMode="tel" value={d.buyerPhone ?? ''} onChange={e => set({ buyerPhone: e.target.value })} /></label>
        </div>}
        <label className="ff">{t.b.bookedOn}<input data-field="bookedOn" type="date" value={d.bookedOn ?? ''} onChange={e => set({ bookedOn: e.target.value || undefined })} /></label>
        <div className="two">
          <label className="ff">{t.b.price}<MoneyInput data-field="bookingPrice" value={d.price} onChange={n => set({ price: n })} /></label>
          <label className="ff">{t.b.fee}<MoneyInput data-field="bookingFee" value={d.bookingFee} onChange={n => set({ bookingFee: n })} /></label>
        </div>
        <label className="ff">{t.b.note}<textarea rows={2} value={d.note ?? ''} onChange={e => set({ note: e.target.value })} /></label>
        {err && <p className="error" role="alert" data-testid="booking-error">{err}</p>}
        <div className="sheet-actions stack-sm">
          {onDelete && <button className="btn ghost danger-text" data-testid="booking-delete" onClick={() => setAskDel(true)}>{t.b.delete}</button>}
          <div className="two">
            <button className="btn secondary" onClick={onCancel}>{c.cancel}</button>
            <button className="btn primary" data-testid="booking-save" onClick={save}>{c.save}</button>
          </div>
        </div>
        {askDel && onDelete && <Confirm lang={lang} title={t.b.deleteQ} okLabel={t.b.delete} onCancel={() => setAskDel(false)} onOk={() => { setAskDel(false); onDelete(); }} />}
      </div>
    </div>
  );
}

// ---------- the form ----------
const blank = (): Project => ({ id: newId(), created: Date.now(), updated: Date.now(), name: '', status: 'upcoming', state: 'Negeri Sembilan', unitTypes: [], bookings: [] });

export function ProjectForm({ lang, id, go, back }: { lang: Lang; id?: string; go: Go; back: () => void }) {
  const { state, store } = useApp();
  const t = projectStrings[lang];
  const ls = listingStrings[lang];
  const c = strings[lang].c;
  const toast = useToast();
  const existing = id ? state.projects.find(x => x.id === id) : undefined;
  const [d, setD] = useState<Project>(() => existing ?? blank());
  const [err, setErr] = useState(false);
  const set = (x: Partial<Project>) => setD(v => ({ ...v, ...x }));
  const setUnit = (uid: string, x: Partial<UnitType>) => setD(v => ({ ...v, unitTypes: v.unitTypes.map(u => (u.id === uid ? { ...u, ...x } : u)) }));
  const text = (k: keyof Project, label: string, extra: Record<string, unknown> = {}) => (
    <label className="ff">{label}<input data-field={k} value={(d[k] as string | undefined) ?? ''} onChange={e => set({ [k]: e.target.value || undefined } as Partial<Project>)} {...extra} /></label>
  );
  function save() {
    const name = d.name.trim();
    if (!name) { setErr(true); return; }
    const clean: Project = { ...d, name, unitTypes: d.unitTypes.map(u => ({ ...u, name: u.name.trim() || `${t.u.name} ${d.unitTypes.indexOf(u) + 1}` })) };
    store.upsert('projects', clean);
    toast(t.saved);
    if (existing) back(); else go({ name: 'projectDetail', id: clean.id }, { replace: true });
  }
  return (
    <section className="stack" data-testid="project-form">
      <div className="card stack-sm">
        <div className="card-title">{t.sec.about}</div>
        <label className="ff">{t.f.name} *<input data-field="projectName" value={d.name} aria-invalid={err} onChange={e => { set({ name: e.target.value }); setErr(false); }} /></label>
        {err && <p className="error" role="alert" data-testid="project-name-error">{t.nameRequired}</p>}
        {text('developer', t.f.developer)}
        <div className="two">{text('developerContact', t.f.developerContact)}{text('developerPhone', t.f.developerPhone, { type: 'tel', inputMode: 'tel' })}</div>
        <label className="ff">{t.f.state}
          <Select data-field="state" value={d.state ?? ''} onChange={e => set({ state: e.target.value || undefined })}>
            <option value="">{ls.notSet}</option>{MY_STATES.map(s => <option key={s} value={s}>{s}</option>)}
          </Select>
        </label>
        <div className="two">{text('city', t.f.city)}{text('township', t.f.township)}</div>
        {text('address', t.f.address)}
        <div className="two">
          <label className="ff">{t.f.tenure}
            <Select data-field="tenure" value={d.tenure ?? ''} onChange={e => set({ tenure: (e.target.value || undefined) as Project['tenure'] })}>
              <option value="">{ls.notSet}</option>{(['freehold', 'leasehold'] as const).map(x => <option key={x} value={x}>{t.tenure[x]}</option>)}
            </Select>
          </label>
          <label className="ff">{t.f.status}
            <Select data-field="projectStatus" value={d.status} onChange={e => set({ status: e.target.value as Project['status'] })}>
              {PROJECT_STATUSES.map(x => <option key={x} value={x}>{t.status[x]}</option>)}
            </Select>
          </label>
        </div>
      </div>

      <div className="card stack-sm">
        <div className="card-title">{t.sec.launch}</div>
        <div className="two">
          <label className="ff">{t.f.launchDate}<input data-field="launchDate" type="month" value={d.launchDate ?? ''} onChange={e => set({ launchDate: e.target.value || undefined })} /></label>
          <label className="ff">{t.f.completionDate}<input data-field="completionDate" type="month" value={d.completionDate ?? ''} onChange={e => set({ completionDate: e.target.value || undefined })} /></label>
        </div>
        <label className="ff">{t.f.launchNotes}<textarea data-field="launchNotes" rows={3} value={d.launchNotes ?? ''} onChange={e => set({ launchNotes: e.target.value || undefined })} /></label>
        <label className="ff">{t.f.commissionPct}<input data-field="commissionPct" inputMode="decimal" value={d.commissionPct ?? ''} onChange={e => set({ commissionPct: num(e.target.value) })} /></label>
      </div>

      <div className="card stack-sm">
        <div className="card-title">{t.sec.units}</div>
        {d.unitTypes.map((u, i) => (
          <div key={u.id} className="unit-edit stack-sm" data-testid="unit-edit">
            <div className="between"><strong>{i + 1}.</strong>
              <button type="button" className="btn small ghost danger-text" onClick={() => setD(v => ({ ...v, unitTypes: v.unitTypes.filter(x => x.id !== u.id) }))}>{t.u.remove}</button></div>
            <label className="ff">{t.u.name}<input data-field="unitName" placeholder={t.u.namePh} value={u.name} onChange={e => setUnit(u.id, { name: e.target.value })} /></label>
            <label className="ff">{t.u.layout}
              <Select data-field="unitLayout" value={u.layout ?? ''} onChange={e => setUnit(u.id, { layout: e.target.value || undefined })}>
                <option value="">{ls.notSet}</option>{TYPES.map(x => <option key={x} value={x}>{typeLabel(ls, x)}</option>)}
              </Select>
            </label>
            <div className="two">
              <label className="ff">{t.u.builtUp}<input data-field="unitBuiltUp" inputMode="decimal" value={u.builtUpSqft ?? ''} onChange={e => setUnit(u.id, { builtUpSqft: num(e.target.value) })} /></label>
              <label className="ff">{t.u.land}<input data-field="unitLand" inputMode="decimal" value={u.landSqft ?? ''} onChange={e => setUnit(u.id, { landSqft: num(e.target.value) })} /></label>
            </div>
            <div className="two">
              <label className="ff">{t.u.beds}<input data-field="unitBeds" inputMode="numeric" value={u.bedrooms ?? ''} onChange={e => setUnit(u.id, { bedrooms: num(e.target.value) })} /></label>
              <label className="ff">{t.u.baths}<input data-field="unitBaths" inputMode="numeric" value={u.bathrooms ?? ''} onChange={e => setUnit(u.id, { bathrooms: num(e.target.value) })} /></label>
            </div>
            <div className="two">
              <label className="ff">{t.u.priceFrom}<MoneyInput data-field="unitPriceFrom" value={u.priceFrom} onChange={n => setUnit(u.id, { priceFrom: n })} /></label>
              <label className="ff">{t.u.priceTo}<MoneyInput data-field="unitPriceTo" value={u.priceTo} onChange={n => setUnit(u.id, { priceTo: n })} /></label>
            </div>
            <label className="ff">{t.u.units}<input data-field="unitCount" inputMode="numeric" value={u.units ?? ''} onChange={e => setUnit(u.id, { units: num(e.target.value) })} /></label>
          </div>
        ))}
        <button type="button" className="btn secondary" data-testid="unit-add" onClick={() => setD(v => ({ ...v, unitTypes: [...v.unitTypes, { id: newId(), name: '' }] }))}>＋ {t.u.add}</button>
      </div>

      <div className="card stack-sm">
        <label className="ff">{t.f.notes}<textarea rows={3} value={d.notes ?? ''} onChange={e => set({ notes: e.target.value || undefined })} /></label>
      </div>

      <div className="save-bar"><div className="two">
        <button className="btn secondary" onClick={back}>{c.cancel}</button>
        <button className="btn primary" data-testid="project-save" onClick={save}>{c.save}</button>
      </div></div>
    </section>
  );
}
