// ClaudeChanges001 changes 11 and 12 (owner, 17 Oct 2026): the Booking, Sale, Rental and Sold-by-Others pages of a
// property, the buttons that open them from the property page, and Track My Sales.
// The pages are drawn from the agreed field lists (deals/model.ts). Every field is optional. People have the same
// name / phone / WhatsApp username box as the property's owner (phone book on the name and phone rows) and are kept as
// contacts. Files become the property's confidential "transaction" documents. Dated reminders go into the Calendar.
import { useMemo, useState } from 'react';
import type { Lang } from '../i18n';
import { useApp } from '../data/useStore';
import { newId } from '../data/store';
import type { Go, DealKind } from '../nav';
import { Listing, Doc, cardTitle, rm, normalisePhone } from '../listing/model';
import { listingStrings } from '../listing/strings';
import { cc001Strings } from '../ui/cc001Strings';
import { MoneyInput } from '../ui/MoneyInput';
import { ContactBox } from '../ui/ContactBox';
import { OptionSelect } from '../ui/OptionSelect';
import { useToast } from '../ui/toast';
import { can } from '../team/access';
import { teamStrings } from '../team/strings';
import type { ContactRole } from '../data/types';
import {
  SPEC, DealSection, DealValue, DealPerson, DealRow, FieldSpec, Deal, personVal, stageOf, totals, upcoming, daysUntil, commissionOf, STAGES, Stage,
} from './model';
import { saveTypedContact } from './contacts';
import { syncDealReminders } from './reminders';
import { fmtDate } from '../lib/dates';

/** Which role a person on a deal page gets as a contact. */
const PERSON_ROLE: Record<string, ContactRole> = {
  buyer: 'buyer', buyer2: 'buyer', tenant: 'tenant', buyerCobroke: 'other', tenantCobroke: 'other',
  panelLawyer: 'professional', buyerLawyer: 'professional', sellerLawyer: 'professional',
};
const COMPANY_OF: Record<string, string> = { buyerCobroke: 'buyerCobrokeAgency', tenantCobroke: 'tenantCobrokeAgency', panelLawyer: 'panelLawyerFirm', buyerLawyer: 'buyerLawyerFirm', sellerLawyer: 'sellerLawyerFirm' };
const toMonth = (d?: DealValue) => (typeof d === 'string' && /^\d{4}-\d{2}/.test(d) ? d.slice(0, 7) : undefined);

export function DealScreen({ lang, propertyId, kind, go, back }: { lang: Lang; propertyId: string; kind: DealKind; go: Go; back: () => void }) {
  const { state, store } = useApp();
  const x = cc001Strings[lang].deal;
  const ls = listingStrings[lang];
  const toast = useToast();
  const l = state.properties.find(p => p.id === propertyId);
  const sec = kind as DealSection;
  const [vals, setVals] = useState<Record<string, DealValue>>(() => ({ ...(l?.deal?.[sec] ?? {}) }));
  const [custom, setCustom] = useState<Record<string, string>>(() => ({ ...(l?.deal?.custom ?? {}) }));
  const [docs, setDocs] = useState<Doc[]>(() => [...(l?.documents ?? [])]);
  const [newField, setNewField] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fieldDefs = (state.options['dealFields'] ?? []).map(o => o.value);
  if (!l) return <p className="muted">{x.notFound}</p>;
  const canEdit = can(state, 'edit', 'properties', l.id) && !l.archived;
  const set = (k: string, v: DealValue | undefined) => setVals(prev => { const n = { ...prev }; if (v === undefined || v === '' || (Array.isArray(v) && !v.length)) delete n[k]; else n[k] = v; return n; });
  const visible = (f: FieldSpec) => !f.when || f.when.is.includes(String(vals[f.when.key] ?? ''));

  async function addFiles(key: string, files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    const added: Doc[] = [];
    try {
      for (const f of [...files]) {
        const fileId = await store.putFile(f);
        added.push({ id: newId(), category: 'transaction', name: f.name, fileId, bytes: f.size, mime: f.type, added: Date.now(), dealKey: `${sec}.${key}` });
      }
      setDocs(prev => [...prev, ...added]);
    } finally { setBusy(false); }
  }

  function save() {
    const cur = store.getState().properties.find(p => p.id === propertyId);
    if (!cur || !can(store.getState(), 'edit', 'properties', cur.id)) { toast(teamStrings[lang].notAllowed, 'error'); return; }
    const own: Record<string, DealValue> = { ...vals };
    // People become contacts (once per person) and remember which contact they are.
    for (const [k, role] of Object.entries(PERSON_ROLE)) {
      const p = personVal(own[k]);
      if (!p?.name) continue;
      const company = typeof own[COMPANY_OF[k]] === 'string' ? own[COMPANY_OF[k]] as string : undefined;
      const cid = saveTypedContact(store, p, role, company);
      own[k] = { ...p, phone: normalisePhone(p.phone), contactId: cid };
    }
    const deal: Deal = { ...(cur.deal ?? {}), [sec]: Object.keys(own).length ? own : undefined };
    if (sec === 'booking') deal.custom = Object.keys(custom).length ? custom : undefined;
    if (sec === 'others') deal.soldBy = 'others';
    if (sec === 'sale') deal.soldBy = 'me';
    let next: Listing = { ...cur, deal, documents: docs.length ? docs : undefined };
    // A rental fills the property's Tenancy section too, so both always say the same.
    if (sec === 'rental') {
      const t = personVal(own.tenant);
      const ten = { ...(cur.tenancy ?? {}) };
      if (t?.name) ten.tenant = t.name;
      if (t?.phone) ten.tenantPhone = t.phone;
      if (t?.whatsapp) ten.tenantWhatsapp = t.whatsapp;
      const st = toMonth(own.start); const en = toMonth(own.end);
      if (st) ten.start = st;
      if (en) ten.end = en;
      if (typeof own.rent === 'number') ten.rent = own.rent;
      next = { ...next, tenancy: Object.keys(ten).length ? ten : undefined };
    }
    // Files removed on this page leave the phone with the save.
    const keep = new Set(docs.map(d => d.id));
    for (const d of cur.documents ?? []) if (!keep.has(d.id) && d.fileId) store.removeFile(d.fileId);
    store.upsert('properties', next);
    syncDealReminders(store, next, lang);
    toast(x.saved);
    back();
  }

  const title = kind === 'booking' ? x.titleBooking : kind === 'sale' ? x.titleSale : kind === 'rental' ? x.titleRental : x.titleOthers;
  return (
    <section className="stack deal" data-testid={`deal-${kind}`}>
      <div className="card stack-sm">
        <strong data-testid="deal-title">{title}</strong>
        <small className="muted">{cardTitle(l) || l.ref}</small>
        <small className="muted">{x.reminderNote}</small>
      </div>
      {SPEC[sec].map(g => (
        <div key={g.id} className="card stack-sm" data-testid={`deal-group-${g.id}`}>
          <div className="card-title">{g.title[lang]}</div>
          {g.fields.filter(visible).map(f => (
            <DealField key={f.key} lang={lang} sec={sec} f={f} value={vals[f.key]} onChange={v => set(f.key, v)} docs={docs}
              onAddFiles={files => void addFiles(f.key, files)} onRemoveDoc={id => setDocs(prev => prev.filter(d => d.id !== id))} busy={busy} />
          ))}
        </div>
      ))}
      {sec === 'booking' && (
        <div className="card stack-sm" data-testid="deal-custom">
          <div className="card-title">{x.customTitle}</div>
          {fieldDefs.length === 0 && <small className="muted">{x.customNone}</small>}
          {fieldDefs.map(fd => (
            <label key={fd} className="ff">{fd}
              <input data-field={`deal.custom.${fd}`} value={custom[fd] ?? ''} onChange={e => setCustom(c => { const n = { ...c }; if (e.target.value) n[fd] = e.target.value; else delete n[fd]; return n; })} />
            </label>
          ))}
          {newField !== null ? (
            <div className="stack-sm">
              <label className="ff">{x.fieldName}<input autoFocus data-testid="deal-field-name" value={newField} onChange={e => setNewField(e.target.value)} /></label>
              <div className="two">
                <button className="btn secondary" onClick={() => setNewField(null)}>{x.cancel}</button>
                <button className="btn primary" data-testid="deal-field-add" disabled={!newField.trim()} onClick={() => { store.addOption('dealFields', newField.trim()); setNewField(null); }}>{x.createField}</button>
              </div>
            </div>
          ) : <button className="btn ghost" data-testid="deal-add-field" onClick={() => setNewField('')}>+ {x.addField}</button>}
        </div>
      )}
      <div className="save-bar floating">
        <div className="two">
          <button className="btn secondary" onClick={back}>{x.cancel}</button>
          <button className="btn primary" data-testid="deal-save" disabled={busy || !canEdit} onClick={save}>{x.save}</button>
        </div>
      </div>
      {!canEdit && <p className="warn-text small">{teamStrings[lang].notAllowed}</p>}
      <small className="muted">{ls.allOptional}</small>
      {/* Back to the property for anything else on it. */}
      <button className="btn ghost" onClick={() => go({ name: 'listingDetail', id: l.id })}>{cardTitle(l) || l.ref} →</button>
    </section>
  );
}

function DealField({ lang, sec, f, value, onChange, docs, onAddFiles, onRemoveDoc, busy }: {
  lang: Lang; sec: DealSection; f: FieldSpec; value: DealValue | undefined; onChange: (v: DealValue | undefined) => void;
  docs: Doc[]; onAddFiles: (files: FileList | null) => void; onRemoveDoc: (id: string) => void; busy: boolean;
}) {
  const { state, store } = useApp();
  const x = cc001Strings[lang];
  const ls = listingStrings[lang];
  const label = `${f.label[lang]}${f.reminder ? ' 🔔' : ''}`;
  const field = `deal.${sec}.${f.key}`;
  switch (f.type) {
    case 'text': return <label className="ff">{label}<input data-field={field} value={typeof value === 'string' ? value : ''} onChange={e => onChange(e.target.value || undefined)} /></label>;
    case 'textarea': return <label className="ff">{label}<textarea data-field={field} rows={3} value={typeof value === 'string' ? value : ''} onChange={e => onChange(e.target.value || undefined)} /></label>;
    case 'number': return <label className="ff">{label}<input data-field={field} inputMode="decimal" value={typeof value === 'number' ? String(value) : ''} onChange={e => { const n = parseFloat(e.target.value.replace(/[^\d.]/g, '')); onChange(Number.isFinite(n) ? n : undefined); }} /></label>;
    case 'money': return <label className="ff">{label}<MoneyInput data-field={field} value={typeof value === 'number' ? value : undefined} onChange={n => onChange(n)} /></label>;
    case 'date': return <label className="ff">{label}<input data-field={field} type="date" value={typeof value === 'string' ? value : ''} onChange={e => onChange(e.target.value || undefined)} /></label>;
    case 'yesno': return (
      <label className="ff">{label}
        <select data-field={field} value={value === true ? 'yes' : value === false ? 'no' : ''} onChange={e => onChange(e.target.value === 'yes' ? true : e.target.value === 'no' ? false : undefined)}>
          <option value="">{x.deal.notSet}</option><option value="yes">{x.deal.yes}</option><option value="no">{x.deal.no}</option>
        </select>
      </label>
    );
    case 'select': return (
      <OptionSelect lang={lang} label={label} listKey={`deal.${sec}.${f.key}`} testId={`deal-opt-${f.key}`}
        builtIns={(f.options ?? []).map(o => ({ value: o.value, label: o.label[lang] }))} value={typeof value === 'string' ? value : undefined} onChange={v => onChange(v)} />
    );
    case 'person': {
      const p = personVal(value) ?? {};
      const patch = (q: Partial<DealPerson>) => { const n = { ...p, ...q }; onChange(n.name || n.phone || n.whatsapp ? n : undefined); };
      return (
        <div className="sub-card stack-sm" data-testid={`deal-person-${f.key}`}>
          <strong className="small">{label}</strong>
          <ContactBox lang={lang} idPrefix={`deal-${f.key}`} contacts={state.contacts} fields={{ name: `${field}.name`, phone: `${field}.phone`, whatsapp: `${field}.whatsapp` }}
            labels={{ name: x.personName, phone: x.personPhone, whatsapp: x.whatsappUser }}
            value={p} onChange={q => patch(q)} onPicked={c => patch({ name: c.name || p.name, phone: normalisePhone(c.tel) ?? p.phone, contactId: undefined })}
            onSuggest={c => onChange({ name: c.name, phone: c.phone, whatsapp: c.whatsapp, contactId: c.id })}
            pickLabel={x.pickPhone} suggestLabel={ls.n9.fromContacts} useLabel={ls.n9.suggestionUse} phonePh={ls.n9.phonePh} whatsappPh={ls.n9.whatsappPh} />
        </div>
      );
    }
    case 'rows': {
      const rows = Array.isArray(value) ? value as DealRow[] : [];
      const setRow = (i: number, k: string, v: string | number | undefined) => onChange(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
      return (
        <div className="sub-card stack-sm" data-testid={`deal-rows-${f.key}`}>
          <strong className="small">{label}</strong>
          {rows.map((r, i) => (
            <div key={i} className="stack-sm deal-row" data-testid="deal-row">
              {(f.columns ?? []).map(col => {
                const name = `${field}.${i}.${col.key}`;
                if (col.type === 'money') return <label key={col.key} className="ff">{col.label[lang]}<MoneyInput data-field={name} value={typeof r[col.key] === 'number' ? r[col.key] as number : undefined} onChange={n => setRow(i, col.key, n)} /></label>;
                if (col.type === 'select') return (
                  <label key={col.key} className="ff">{col.label[lang]}
                    <select data-field={name} value={String(r[col.key] ?? '')} onChange={e => setRow(i, col.key, e.target.value || undefined)}>
                      <option value="">{x.deal.notSet}</option>{(col.options ?? []).map(o => <option key={o.value} value={o.value}>{o.label[lang]}</option>)}
                    </select>
                  </label>
                );
                return <label key={col.key} className="ff">{col.label[lang]}<input data-field={name} type={col.type === 'date' ? 'date' : undefined} value={String(r[col.key] ?? '')} onChange={e => setRow(i, col.key, e.target.value || undefined)} /></label>;
              })}
              <button type="button" className="btn small secondary danger-text" onClick={() => onChange(rows.filter((_, j) => j !== i))}>{x.deal.removeRow}</button>
            </div>
          ))}
          <button type="button" className="btn small secondary" data-testid={`deal-add-${f.key}`} onClick={() => onChange([...rows, {}])}>+ {x.deal.addRow}</button>
        </div>
      );
    }
    case 'files': {
      const mine = docs.filter(d => d.dealKey === `${sec}.${f.key}`);
      return (
        <div className="sub-card stack-sm" data-testid={`deal-files-${f.key}`}>
          <div className="between"><strong className="small">{label} 🔒</strong><span className="count">{mine.length}</span></div>
          {!mine.length && <small className="muted">{x.deal.noFiles}</small>}
          {mine.map(d => (
            <div key={d.id} className="doc-row"><span>{d.name}</span>
              {d.fileId && <button className="btn small secondary" onClick={() => void store.fileUrl(d.fileId!).then(u => { if (u) window.open(u, '_blank'); })}>{x.deal.open}</button>}
              <button className="btn small secondary danger-text" onClick={() => onRemoveDoc(d.id)}>{x.deal.removeRow}</button>
            </div>
          ))}
          <label className={`btn small secondary ${busy ? 'disabled' : ''}`}>+ {x.deal.addFiles}
            <input data-testid={`deal-file-input-${f.key}`} className="file-input" type="file" multiple accept="image/*,application/pdf,.doc,.docx" disabled={busy}
              onChange={e => { onAddFiles(e.target.files); e.currentTarget.value = ''; }} />
          </label>
        </div>
      );
    }
  }
}

/** The deal buttons on the property page, by what the property's Availability says. */
export function DealLinks({ lang, l, go }: { lang: Lang; l: Listing; go: Go }) {
  const x = cc001Strings[lang].deal;
  const open = (kind: DealKind) => () => go({ name: 'deal', propertyId: l.id, kind });
  const btn = (kind: DealKind, label: string) => <button key={kind} className="btn secondary" data-testid={`open-deal-${kind}`} onClick={open(kind)}>📝 {label}</button>;
  const out: JSX.Element[] = [];
  if (l.status === 'in_progress' || l.deal?.booking) out.push(btn('booking', x.openBooking));
  if (l.status === 'sold') {
    if (l.deal?.soldBy !== 'others') out.push(btn('sale', x.openSale));
    if (l.deal?.soldBy !== 'me') out.push(btn('others', x.openOthers));
  }
  if (l.status === 'rented' || l.deal?.rental) out.push(btn('rental', x.openRental));
  if (!out.length) return null;
  return <div className="card stack-sm" data-testid="deal-links"><div className="two-wrap">{out}</div></div>;
}

// ---------- Track My Sales ----------
export function TrackSalesScreen({ lang, go }: { lang: Lang; go: Go }) {
  const { state } = useApp();
  const t = cc001Strings[lang].sales;
  const ls = listingStrings[lang];
  const today = new Date();
  const props = useMemo(() => state.properties.filter(p => !p.archived && !p.sample), [state.properties]);
  const withStage = props.map(p => ({ p, stage: stageOf(p) })).filter((x): x is { p: Listing; stage: Stage } => !!x.stage);
  const sum = totals(props, today);
  const due = upcoming(props, 60, today);
  const byId = new Map(props.map(p => [p.id, p]));
  const kindFor = (st: Stage): DealKind => (st === 'rented' ? 'rental' : st === 'others' ? 'others' : st === 'booked' || st === 'cancelled' ? 'booking' : 'sale');
  return (
    <section className="stack" data-testid="track-sales">
      <div className="card stack-sm" data-testid="sales-totals">
        <div className="card-title">{t.totals}</div>
        <div className="kpi-grid">
          <div className="kpi" data-testid="sales-received"><small className="muted">{t.earned}</small><strong>{rm(sum.received)}</strong></div>
          <div className="kpi" data-testid="sales-pending"><small className="muted">{t.pending}</small><strong>{rm(sum.pending)}</strong></div>
          <div className="kpi" data-testid="sales-month"><small className="muted">{t.month}</small><strong>{rm(sum.month)}</strong></div>
          <div className="kpi" data-testid="sales-year"><small className="muted">{t.year}</small><strong>{rm(sum.year)}</strong></div>
        </div>
      </div>
      <div className="card stack-sm" data-testid="sales-deadlines">
        <div className="card-title">{t.deadlines}</div>
        {!due.length && <small className="muted">{t.noDeadlines}</small>}
        {due.map(d => {
          const p = byId.get(d.propertyId);
          if (!p) return null;
          const st = stageOf(p) ?? 'booked';
          return (
            <button key={`${d.propertyId}-${d.key}`} className="link-row" data-testid="sales-deadline" onClick={() => go({ name: 'deal', propertyId: p.id, kind: kindFor(st) })}>
              <strong>{t.due[d.what]} · {fmtDate(d.date, lang)} ({t.inDays(daysUntil(d.date, today))})</strong>
              <small className="muted">{cardTitle(p) || p.ref}</small>
            </button>
          );
        })}
      </div>
      <div className="card stack-sm" data-testid="sales-deals">
        <div className="card-title">{t.deals}</div>
        {!withStage.length && <small className="muted">{t.none}</small>}
        {STAGES.map(st => {
          const list = withStage.filter(x => x.stage === st);
          if (!list.length) return null;
          return (
            <div key={st} className="stack-sm" data-testid={`sales-stage-${st}`}>
              <strong className="small">{t.stage[st]} ({list.length})</strong>
              {list.map(({ p }) => {
                const c = commissionOf(p, st);
                const money = c.received !== undefined ? `${t.earned}: ${rm(c.received)}` : c.pending !== undefined ? `${t.pending}: ${rm(c.pending)}` : '';
                return (
                  <button key={p.id} className="link-row" data-testid="sales-deal" data-id={p.id} onClick={() => go({ name: 'deal', propertyId: p.id, kind: kindFor(st) })}>
                    <strong>{cardTitle(p) || p.ref || ls.untitled}</strong>
                    <small className="muted">{[cardTitle(p) ? p.ref : undefined, money].filter(Boolean).join(' · ')}</small>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </section>
  );
}
