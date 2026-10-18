// Contacts (one dashboard card) → Buyers or Vendors (one contact list, two views), contact page and contact form.
// Buyers keep the lead colours: Blue = Cold, Yellow = Warm, Red = Hot, Gray = Dropped, Green = Booked / Bought.
// Vendors have their own status system (Pending Property Info, Pending Follow-up, Listed, …), kept separate.
import { useMemo, useState } from 'react';
import { Lang, strings } from '../i18n';
import { useApp } from '../data/useStore';
import { newId } from '../data/store';
import { contactStrings } from './strings';
import { Go } from '../nav';
import { BUYER_ROLES, CONTACT_ROLES, Contact, ContactRole, EXPERTS, ExpertKey, LEAD_COLOURS, LEAD_STATUSES, LeadStatus, VENDOR_ROLES, VENDOR_COLOURS, VENDOR_STATUSES, VendorStatus } from '../data/types';
import { LeadDot, LeadPicker, VendorDot, VendorStatusPicker, SectionCard, Empty, Confirm } from '../ui/common';
import { FieldHelp } from '../ui/FieldHelp';
import { IconBuyer, IconVendor } from '../icons';
import { OptionSelect } from '../ui/OptionSelect';
import { InquiryHistory, ViewingHistory } from '../agenda/History';
import { visible, can, byCreator } from '../team/access';
import { SharingLine, CreatorFilter, CardFoot, useCreatorFilter } from '../team/TeamUI';
import { ViewHistory } from '../audit/AuditUI';
import { teamStrings } from '../team/strings';
import { TaskRow } from '../agenda/AgendaUI';
import { completeTask, sortTasks } from '../domain/workflow';
import { cardTitle, normalisePhone, phoneDigits, usablePhone } from '../listing/model';
import { fmtDate } from '../lib/dates';
import { pickPhoneContacts, phonebookSupported, phonebookProblem, PickedContact } from '../lib/phonebook';
import { useToast } from '../ui/toast';
import { PhoneInput } from '../ui/PhonebookButton';
import { listingStrings } from '../listing/strings';
import { leadReviewStrings } from '../data/leadReviewStrings';
import { RecordStatus } from '../sync/SyncUI';
import { useDraft } from '../ui/useDraft';
import { DraftBanner } from '../ui/DraftBanner';
import { reviewContacts, undoInactiveConversion, UndoResult } from '../data/leadReview';
import { BuyerRequirementsCard, RequirementsEditor } from './MatchUI';
import { c11Strings } from '../ui/c011Strings';

export const inRole = (c: Contact, role: 'vendor' | 'buyer') => c.roles.some(r => (role === 'vendor' ? VENDOR_ROLES : BUYER_ROLES).includes(r));

/** The Contacts dashboard card: Buyers and Vendors. */
export function ContactsHome({ lang, go }: { lang: Lang; go: Go }) {
  const { state, store } = useApp();
  const s = contactStrings[lang];
  const buyers = state.contacts.filter(c => inRole(c, 'buyer'));
  const vendors = state.contacts.filter(c => inRole(c, 'vendor'));
  const hot = buyers.filter(c => c.leadStatus === 'hot').length;
  const [undoMsg, setUndoMsg] = useState('');
  const undoText = (r: UndoResult) => `${r.restored.length ? leadReviewStrings[lang].undone(r.restored.length) : ''} ${r.skipped.length ? leadReviewStrings[lang].skipped(r.skipped.length) : ''}`.trim();
  const review = state.meta.leadReview && !state.meta.leadReview.reviewed ? reviewContacts(state.contacts, state.meta.leadReview.ids) : [];
  const waiting = vendors.filter(c => c.vendorStatus === 'pending_info' || c.vendorStatus === 'pending_follow_up').length;
  return (
    <section className="stack" data-testid="contacts-home">
      <div className="hub">
        <button className="hub-card" data-testid="hub-buyers" onClick={() => go({ name: 'contacts', role: 'buyer' })}>
          <span className="hub-icon"><IconBuyer /></span>
          <strong>{s.buyers}</strong>
          <small className="muted">{s.countPeople(buyers.length)}{hot ? ` · ${s.hotCount(hot)}` : ''}</small>
        </button>
        <button className="hub-card" data-testid="hub-vendors" onClick={() => go({ name: 'contacts', role: 'vendor' })}>
          <span className="hub-icon"><IconVendor /></span>
          <strong>{s.vendors}</strong>
          <small className="muted">{s.countPeople(vendors.length)}{waiting ? ` · ${s.waitingCount(waiting)}` : ''}</small>
        </button>
      </div>
      {review.length > 0 && (
        <div className="card stack-sm" data-testid="lead-review">
          <div className="card-title">{leadReviewStrings[lang].title}</div>
          <p className="small">{leadReviewStrings[lang].body(review.length)}</p>
          <ul className="notif-list">
            {review.map(c => (
              <li key={c.id} className="between">
                <button className="link-row" data-testid="lead-review-item" onClick={() => go({ name: 'contactDetail', id: c.id })}><strong>{c.name}</strong>{c.inactiveKept && <small className="muted"> · {leadReviewStrings[lang].legacy}</small>}</button>
                {c.leadStatus === 'dropped' && c.previousLeadStatus === 'inactive' && (
                  <button className="btn small ghost" data-testid="lead-review-undo-one" onClick={() => setUndoMsg(undoText(undoInactiveConversion(store, [c.id])))}>{leadReviewStrings[lang].undo}</button>
                )}
              </li>
            ))}
          </ul>
          {undoMsg && <small role="status" className="ok-text" data-testid="lead-review-msg">{undoMsg}</small>}
          {review.some(c => c.leadStatus === 'dropped' && c.previousLeadStatus === 'inactive') && (
            <button className="btn secondary" data-testid="lead-review-undo-all" onClick={() => setUndoMsg(undoText(undoInactiveConversion(store)))}>{leadReviewStrings[lang].undoAll}</button>
          )}
          <button className="btn secondary" data-testid="lead-review-done" onClick={() => store.setSingleton('meta', { leadReview: { ...state.meta.leadReview!, reviewed: true } })}>{leadReviewStrings[lang].reviewed}</button>
        </div>
      )}
      <small className="muted">{s.hubNote}</small>
    </section>
  );
}

export function ContactsList({ lang, go, role }: { lang: Lang; go: Go; role: 'vendor' | 'buyer' }) {
  const { state, store } = useApp();
  const s = contactStrings[lang];
  const t = strings[lang];
  const toast = useToast();
  const [q, setQ] = useState('');
  const [lead, setLead] = useState<LeadStatus | VendorStatus | 'all'>('all');
  // Change 16: my own and shared contacts in one list; Change 15: "Created by" filter.
  const [by, setBy] = useCreatorFilter(`contacts-${role}`);
  const all = useMemo(() => byCreator(state, 'contacts', visible(state, 'contacts', state.contacts), by).filter(c => inRole(c, role)), [state, role, by]);
  const statusOf = (c: Contact) => (role === 'vendor' ? c.vendorStatus : c.leadStatus);
  const shown = all
    .filter(c => lead === 'all' || statusOf(c) === lead)
    .filter(c => !q.trim() || [c.name, c.phone, c.whatsapp, c.company, c.email].some(v => (v ?? '').toLowerCase().includes(q.trim().toLowerCase()) || (q.replace(/\D/g, '').length > 3 && phoneDigits(v).includes(q.replace(/\D/g, '')))))
    .sort((a, b) => a.name.localeCompare(b.name));
  const statuses: (LeadStatus | VendorStatus)[] = role === 'vendor' ? VENDOR_STATUSES : LEAD_STATUSES;
  const colour = (x: LeadStatus | VendorStatus) => (role === 'vendor' ? VENDOR_COLOURS[x as VendorStatus] : LEAD_COLOURS[x as LeadStatus]);
  const label = (x: LeadStatus | VendorStatus) => (role === 'vendor' ? t.vendorStatus[x] : t.lead[x]);

  async function importPhone() {
    let picked: PickedContact[] | null;
    try { picked = await pickPhoneContacts(true); } catch (e) { const pr = phonebookProblem(e); toast(pr === 'denied' ? s.pickDenied : pr === 'plugin-missing' ? s.pluginMissing : s.importUnsupported, 'error'); return; }
    if (picked === null) { toast(s.importUnsupported, 'error'); return; }
    let added = 0, skipped = 0;
    for (const p of picked) {
      const tel = normalisePhone(p.tel);
      const exists = tel && state.contacts.some(c => c.phone && phoneDigits(c.phone) === phoneDigits(tel));
      if (exists || !p.name) { skipped++; continue; }
      store.upsert('contacts', { id: newId(), created: Date.now(), updated: Date.now(), name: p.name, phone: tel, email: p.email, roles: [role === 'vendor' ? 'vendor' : 'buyer'] });
      added++;
    }
    if (picked.length) toast(s.importDone(added, skipped));
  }

  return (
    <section className="stack" data-testid={`contacts-${role}`}>
      <button className="btn primary" onClick={() => go({ name: 'contactForm', role })}>{role === 'vendor' ? s.addVendor : s.addBuyer}</button>
      <button className="btn secondary" onClick={() => void importPhone()} aria-disabled={!phonebookSupported()}>{s.importPhone}</button>
      <input aria-label={s.search} placeholder={s.search} value={q} onChange={e => setQ(e.target.value)} />
      <CreatorFilter lang={lang} value={by} onChange={setBy} />
      <div className="chip-row" role="radiogroup" aria-label={role === 'vendor' ? t.vendorStatusLabel : t.leadLabel} data-testid="status-filter">
        <button type="button" role="radio" aria-checked={lead === 'all'} className={`chip-btn ${lead === 'all' ? 'on' : ''}`} onClick={() => setLead('all')}>{s.allLeads} <span className="count">{all.length}</span></button>
        {statuses.map(l => (
          <button key={l} type="button" role="radio" aria-checked={lead === l} className={`chip-btn ${lead === l ? 'on' : ''}`} onClick={() => setLead(l)} data-status={l}>
            <span className="lead-dot" style={{ background: colour(l) }} aria-hidden="true" /> {label(l)} <span className="count">{all.filter(c => statusOf(c) === l).length}</span>
          </button>
        ))}
      </div>
      {all.length === 0 ? <Empty>{s.none}</Empty> : shown.length === 0 ? <Empty>{s.noneMatch}</Empty> : (
        <ul className="contact-list">
          {shown.map(c => {
            const props = state.properties.filter(p => p.vendorId === c.id).length;
            return (
              <li key={c.id} className="contact-row" data-testid="contact-row" data-lead={role === 'buyer' ? c.leadStatus ?? '' : ''} data-vstat={role === 'vendor' ? c.vendorStatus ?? '' : ''}
                style={statusOf(c) ? { borderLeftColor: colour(statusOf(c)!) } : undefined}>
                <button className="row-main" onClick={() => go({ name: 'contactDetail', id: c.id })}>
                  <strong>{c.name}</strong>
                  <small className="muted">{[c.phone, c.company, props ? `${s.properties}: ${props}` : ''].filter(Boolean).join(' · ') || s.phoneMissing}</small>
                  <span className="row-wrap small">{c.roles.map(r => <span key={r} className="chip-tag">{s.roles[r]}</span>)}{role === 'vendor' ? <VendorDot lang={lang} status={c.vendorStatus} /> : <LeadDot lang={lang} status={c.leadStatus} />}{c.sample && <span className="chip-tag sample-tag">{t.sampleTag}</span>}</span>
                  <CardFoot lang={lang} collection="contacts" id={c.id} />
                </button>
                {usablePhone(c.phone) && <a className="btn small secondary" href={`tel:+${phoneDigits(c.phone)}`} aria-label={`${t.c.call}: ${c.name}`}>{t.c.call}</a>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function ContactDetail({ lang, go, id }: { lang: Lang; go: Go; id: string }) {
  const { state, store } = useApp();
  const s = contactStrings[lang];
  const t = strings[lang];
  const c = state.contacts.find(x => x.id === id);
  if (!c) return <Empty>{s.none}</Empty>;
  const props = state.properties.filter(p => p.vendorId === c.id);
  const tasks = sortTasks(state.tasks.filter(x => x.contactId === c.id));
  const isVendor = inRole(c, 'vendor');
  const isBuyer = inRole(c, 'buyer') || !isVendor;
  const canEdit = can(state, 'edit', 'contacts', c.id);
  const setStatus = (patch: Partial<typeof c>) => { if (can(store.getState(), 'edit', 'contacts', c.id)) store.upsert('contacts', { ...c, ...patch }); };
  return (
    <section className="stack" data-testid="contact-detail">
      {!c.sample && <RecordStatus lang={lang} collection="contacts" id={c.id} go={go} />}
      <SharingLine lang={lang} collection="contacts" id={c.id} go={go} />
      {c.sample && <p className="notice sample-note" data-testid="sample-note">{t.sampleNote}</p>}
      <div className="card stack-sm" style={isBuyer && c.leadStatus ? { borderLeft: `6px solid ${LEAD_COLOURS[c.leadStatus] ?? '#9CA3AF'}` } : isVendor && c.vendorStatus ? { borderLeft: `6px solid ${VENDOR_COLOURS[c.vendorStatus]}` } : undefined}>
        <h2 className="contact-name">{c.name}</h2>
        <div className="row-wrap">{c.roles.map(r => <span key={r} className="chip-tag">{s.roles[r]}</span>)}{c.profession && <span className="chip-tag">{s.experts[c.profession]}</span>}</div>
        <dl className="dl">
          {c.phone && <div className="dl-row"><dt>{s.f.phone}</dt><dd>{c.phone}</dd></div>}
          {c.whatsapp && <div className="dl-row"><dt>{s.whatsapp}</dt><dd data-testid="contact-whatsapp">{c.whatsapp}</dd></div>}
          {c.email && <div className="dl-row"><dt>{s.f.email}</dt><dd>{c.email}</dd></div>}
          {c.company && <div className="dl-row"><dt>{s.f.company}</dt><dd>{c.company}</dd></div>}
          {c.source && <div className="dl-row"><dt>{s.f.source}</dt><dd>{c.source}</dd></div>}
        </dl>
        {c.notes && <p className="pre small">{c.notes}</p>}
        <small className="muted">{c.lastInteraction ? s.lastInteraction(fmtDate(c.lastInteraction, lang)) : s.never}</small>
        <div className="rec-actions">
          {canEdit && <button className="btn primary" onClick={() => go({ name: 'contactForm', id: c.id })}>{t.c.edit}</button>}
          {usablePhone(c.phone) && <a className="btn secondary" href={`tel:+${phoneDigits(c.phone)}`}>{t.c.call}</a>}
          {usablePhone(c.phone) && <a className="btn secondary" href={`https://wa.me/${phoneDigits(c.phone)}`} target="_blank" rel="noreferrer">{t.c.whatsapp}</a>}
        </div>
        {c.phone && !usablePhone(c.phone) && <small className="warn-text" role="status" data-testid="phone-invalid">{listingStrings[lang].phoneInvalid}</small>}
        {!c.phone && c.whatsapp && <small className="muted">{s.aliasOnly(c.whatsapp)}</small>}
      </div>
      <div className="card stack-sm">
        {canEdit && isVendor && <VendorStatusPicker lang={lang} value={c.vendorStatus} onChange={v => setStatus({ vendorStatus: v })} />}
        {canEdit && isBuyer && <LeadPicker lang={lang} value={c.leadStatus} onChange={v => setStatus({ leadStatus: v })} />}
      </div>
      {c.roles.some(r => BUYER_ROLES.includes(r)) && (
        <button className="btn primary full" data-testid="open-buyer-matches" onClick={() => go({ name: 'buyerMatches', contactId: c.id })}>
          🔗 {c11Strings[lang].match.open}{(c.savedMatches ?? []).length ? ` · ${c11Strings[lang].match.buyerMatches((c.savedMatches ?? []).length)}` : ''}
        </button>
      )}
      {c.roles.some(r => BUYER_ROLES.includes(r)) && <BuyerRequirementsCard lang={lang} c={c} go={go} />}
      <SectionCard title={s.properties}>
        {props.length === 0 ? <Empty>{s.noProperties}</Empty> : props.map(p => (
          <button key={p.id} className="link-row" onClick={() => go({ name: 'listingDetail', id: p.id })}>{[p.ref, cardTitle(p)].filter(Boolean).join(' · ')}</button>
        ))}
      </SectionCard>
      <InquiryHistory lang={lang} go={go} contactId={c.id} />
      <ViewingHistory lang={lang} go={go} contactId={c.id} />
      <SectionCard title={s.todos} onEdit={() => go({ name: 'taskForm', prefill: { contactId: c.id } })} editLabel={t.c.add}>
        {tasks.length === 0 ? <Empty>{s.noTodos}</Empty> : <ul className="task-list">{tasks.map(x => <TaskRow key={x.id} lang={lang} t={x} go={go} onToggle={() => { if (can(store.getState(), 'edit', 'tasks', x.id)) store.upsert('tasks', completeTask(x, !x.done)); }} />)}</ul>}
      </SectionCard>
      {!c.sample && <ViewHistory lang={lang} collection="contacts" id={c.id} go={go} />}
    </section>
  );
}

export function ContactForm({ lang, go, back, id, role, prefill }: { lang: Lang; go: Go; back: () => void; id?: string; role?: 'vendor' | 'buyer' | 'professional'; prefill?: { name?: string; phone?: string } }) {
  const { state, store } = useApp();
  const s = contactStrings[lang];
  const t = strings[lang];
  const toast = useToast();
  const existing = id ? state.contacts.find(x => x.id === id) : undefined;
  const [d, setD] = useState<Contact>(() => existing ?? {
    id: newId(), created: Date.now(), updated: Date.now(), name: prefill?.name ?? '', phone: prefill?.phone, roles: [role ?? 'buyer'],
    leadStatus: role === 'buyer' ? 'warm' : undefined,
    vendorStatus: role === 'vendor' ? 'pending_info' : undefined,
  });
  const [err, setErr] = useState(false);
  const [del, setDel] = useState(false);
  const draft = useDraft<Contact>({ collection: 'contacts', existing, value: d, apply: setD, variant: { role, prefill } });
  const dup = d.phone && phoneDigits(d.phone).length >= 8 ? state.contacts.find(x => x.id !== d.id && x.phone && phoneDigits(x.phone) === phoneDigits(d.phone)) : undefined;
  const [replace, setReplace] = useState<PickedContact | null>(null);
  const apply = (p: PickedContact) => setD(x => ({ ...x, name: p.name || x.name, phone: normalisePhone(p.tel) ?? x.phone, email: x.email || p.email }));
  function picked(p: PickedContact) {
    // Something different already typed: ask before replacing it.
    const differs = (d.name.trim() && p.name && d.name.trim() !== p.name) || (d.phone && p.tel && phoneDigits(d.phone) !== phoneDigits(p.tel));
    if (differs) setReplace(p); else apply(p);
  }
  const formVendor = d.roles.some(r => VENDOR_ROLES.includes(r));
  const formBuyer = d.roles.some(r => BUYER_ROLES.includes(r)) || !formVendor;
  const toggleRole = (r: ContactRole) => setD(x => ({ ...x, roles: x.roles.includes(r) ? x.roles.filter(y => y !== r) : [...x.roles, r] }));
  return (
    <section className="stack" data-testid="contact-form">
      <DraftBanner lang={lang} draft={draft} />
      <div className="card stack-sm">
        <label className="ff">{s.f.name}<input data-field="name" aria-invalid={err} value={d.name} onChange={e => { setD(x => ({ ...x, name: e.target.value })); setErr(false); }} /></label>
        {err && <p className="error" role="alert">{t.c.nameRequired}</p>}
        <PhoneInput lang={lang} id="contact-phone" dataField="phone" label={<label htmlFor="contact-phone">{s.f.phone}</label>} value={d.phone ?? ''}
          onChange={v => setD(x => ({ ...x, phone: v || undefined }))} onBlur={() => setD(x => ({ ...x, phone: normalisePhone(x.phone) }))} onPicked={picked} />
        <label className="ff"><span>{s.whatsapp}<FieldHelp lang={lang} topic="whatsapp" label={s.whatsapp} /></span><input data-field="whatsapp" autoComplete="off" autoCapitalize="none" placeholder="@" value={d.whatsapp ?? ''} onChange={e => setD(x => ({ ...x, whatsapp: e.target.value || undefined }))} />
          <small className="muted">{s.whatsappHint}</small></label>
        {dup && <p className="warn-text" role="status">{s.duplicate(dup.name)} <button className="link-btn" onClick={() => go({ name: 'contactDetail', id: dup.id })}>{s.openExisting}</button></p>}
        <label className="ff">{s.f.email}<input type="email" value={d.email ?? ''} onChange={e => setD(x => ({ ...x, email: e.target.value || undefined }))} /></label>
        <label className="ff">{s.f.company}<input value={d.company ?? ''} onChange={e => setD(x => ({ ...x, company: e.target.value || undefined }))} /></label>
        <fieldset className="ff"><legend>{s.f.roles}</legend>
          <div className="chip-row">{CONTACT_ROLES.map(r => <button key={r} type="button" className={`chip-btn ${d.roles.includes(r) ? 'on' : ''}`} aria-pressed={d.roles.includes(r)} onClick={() => toggleRole(r)}>{s.roles[r]}</button>)}</div>
        </fieldset>
        {d.roles.includes('professional') && (
          <label className="ff">{s.f.profession}
            <select value={d.profession ?? ''} onChange={e => setD(x => ({ ...x, profession: (e.target.value || undefined) as ExpertKey | undefined }))}>
              <option value="">{t.c.notSet}</option>{EXPERTS.filter(x => x !== 'agent_ai').map(x => <option key={x} value={x}>{s.experts[x]}</option>)}
            </select>
          </label>
        )}
        {formVendor && <VendorStatusPicker lang={lang} value={d.vendorStatus} onChange={v => setD(x => ({ ...x, vendorStatus: v }))} />}
        {formBuyer && <LeadPicker lang={lang} value={d.leadStatus} onChange={v => setD(x => ({ ...x, leadStatus: v }))} />}
        <OptionSelect lang={lang} label={s.f.source} listKey="leadSource" builtIns={s.sources.map(v => ({ value: v }))} value={d.source} onChange={v => setD(x => ({ ...x, source: v }))} />
        <label className="ff">{s.f.notes}<textarea rows={3} value={d.notes ?? ''} onChange={e => setD(x => ({ ...x, notes: e.target.value || undefined }))} /></label>
      </div>
      {d.roles.some(r => BUYER_ROLES.includes(r)) && <div className="card stack-sm"><RequirementsEditor lang={lang} value={d.requirements ?? []} onChange={v => setD(x => ({ ...x, requirements: v.length ? v : undefined }))} /></div>}
      {existing && can(state, 'delete', 'contacts', existing.id) && <button className="btn ghost danger-text" onClick={() => setDel(true)}>{t.c.delete}</button>}
      <div className="save-bar"><div className="two">
        <button className="btn secondary" onClick={back}>{t.c.cancel}</button>
        <button className="btn primary" data-testid="save-contact" onClick={() => {
          if (!d.name.trim()) { setErr(true); return; }
          if (existing && !can(store.getState(), 'edit', 'contacts', existing.id)) { toast(teamStrings[lang].notAllowed, 'error'); return; }
          const saved = store.upsert('contacts', { ...d, name: d.name.trim(), phone: normalisePhone(d.phone), whatsapp: d.whatsapp?.trim() || undefined, roles: d.roles.length ? d.roles : ['other'],
            vendorStatus: formVendor ? d.vendorStatus : undefined });
          draft.clear();
          toast(t.c.saved);
          if (existing) back(); else go({ name: 'contactDetail', id: saved.id });
        }}>{t.c.save}</button>
      </div></div>
      {replace && <Confirm lang={lang} title={s.replaceQ} danger={false} okLabel={s.replaceOk}
        body={s.replaceBody([d.name, d.phone].filter(Boolean).join(' · '), [replace.name, replace.tel].filter(Boolean).join(' · '))}
        onCancel={() => setReplace(null)} onOk={() => { apply(replace); setReplace(null); }} />}
      {del && existing && <Confirm lang={lang} title={t.c.deleteQ} body={s.deleteBody} onCancel={() => setDel(false)} onOk={() => { if (can(store.getState(), 'delete', 'contacts', existing.id)) store.remove('contacts', existing.id); go({ name: 'home' }); }} />}
    </section>
  );
}
