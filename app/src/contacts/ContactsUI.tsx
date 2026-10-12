// Vendor List and Buyer List (one contact list, two views), contact page and contact form.
// Lead colours: Blue = Cold, Yellow = Warm, Red = Hot, Green = Dropped, Gray = Inactive.
import { useMemo, useState } from 'react';
import { Lang, strings } from '../i18n';
import { useApp } from '../data/useStore';
import { newId } from '../data/store';
import { contactStrings } from './strings';
import { Go } from '../nav';
import { BUYER_ROLES, CONTACT_ROLES, Contact, ContactRole, EXPERTS, ExpertKey, LEAD_COLOURS, LEAD_STATUSES, LeadStatus, VENDOR_ROLES } from '../data/types';
import { LeadDot, LeadPicker, SectionCard, Empty, Confirm } from '../ui/common';
import { OptionSelect } from '../ui/OptionSelect';
import { InquiryHistory, ViewingHistory } from '../agenda/History';
import { TaskRow } from '../agenda/AgendaUI';
import { completeTask, sortTasks } from '../domain/workflow';
import { cardTitle, normalisePhone, phoneDigits } from '../listing/model';
import { fmtDate } from '../lib/dates';
import { pickPhoneContacts, phonebookSupported } from '../lib/phonebook';
import { useToast } from '../ui/toast';

const inRole = (c: Contact, role: 'vendor' | 'buyer') => c.roles.some(r => (role === 'vendor' ? VENDOR_ROLES : BUYER_ROLES).includes(r));

export function ContactsList({ lang, go, role }: { lang: Lang; go: Go; role: 'vendor' | 'buyer' }) {
  const { state, store } = useApp();
  const s = contactStrings[lang];
  const t = strings[lang];
  const toast = useToast();
  const [q, setQ] = useState('');
  const [lead, setLead] = useState<LeadStatus | 'all'>('all');
  const all = useMemo(() => state.contacts.filter(c => inRole(c, role)), [state.contacts, role]);
  const shown = all
    .filter(c => lead === 'all' || c.leadStatus === lead)
    .filter(c => !q.trim() || [c.name, c.phone, c.company, c.email].some(v => (v ?? '').toLowerCase().includes(q.trim().toLowerCase()) || (q.replace(/\D/g, '').length > 3 && phoneDigits(v).includes(q.replace(/\D/g, '')))))
    .sort((a, b) => a.name.localeCompare(b.name));

  async function importPhone() {
    const picked = await pickPhoneContacts(true);
    if (picked === null) { toast(s.importUnsupported); return; }
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
      <div className="chip-row" role="radiogroup" aria-label={t.leadLabel}>
        <button type="button" role="radio" aria-checked={lead === 'all'} className={`chip-btn ${lead === 'all' ? 'on' : ''}`} onClick={() => setLead('all')}>{s.allLeads} <span className="count">{all.length}</span></button>
        {LEAD_STATUSES.map(l => (
          <button key={l} type="button" role="radio" aria-checked={lead === l} className={`chip-btn ${lead === l ? 'on' : ''}`} onClick={() => setLead(l)}>
            <span className="lead-dot" style={{ background: LEAD_COLOURS[l] }} aria-hidden="true" /> {t.lead[l]} <span className="count">{all.filter(c => c.leadStatus === l).length}</span>
          </button>
        ))}
      </div>
      {all.length === 0 ? <Empty>{s.none}</Empty> : shown.length === 0 ? <Empty>{s.noneMatch}</Empty> : (
        <ul className="contact-list">
          {shown.map(c => {
            const props = state.properties.filter(p => p.vendorId === c.id).length;
            return (
              <li key={c.id} className="contact-row" data-testid="contact-row" data-lead={c.leadStatus ?? ''} style={c.leadStatus ? { borderLeftColor: LEAD_COLOURS[c.leadStatus] } : undefined}>
                <button className="row-main" onClick={() => go({ name: 'contactDetail', id: c.id })}>
                  <strong>{c.name}</strong>
                  <small className="muted">{[c.phone, c.company, props ? `${s.properties}: ${props}` : ''].filter(Boolean).join(' · ') || s.phoneMissing}</small>
                  <span className="row-wrap small">{c.roles.map(r => <span key={r} className="chip-tag">{s.roles[r]}</span>)}<LeadDot lang={lang} status={c.leadStatus} /></span>
                </button>
                {c.phone && <a className="btn small secondary" href={`tel:+${phoneDigits(c.phone)}`} aria-label={`${t.c.call}: ${c.name}`}>{t.c.call}</a>}
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
  return (
    <section className="stack" data-testid="contact-detail">
      <div className="card stack-sm" style={c.leadStatus ? { borderLeft: `6px solid ${LEAD_COLOURS[c.leadStatus]}` } : undefined}>
        <h2 className="contact-name">{c.name}</h2>
        <div className="row-wrap">{c.roles.map(r => <span key={r} className="chip-tag">{s.roles[r]}</span>)}{c.profession && <span className="chip-tag">{s.experts[c.profession]}</span>}</div>
        <dl className="dl">
          {c.phone && <div className="dl-row"><dt>{s.f.phone}</dt><dd>{c.phone}</dd></div>}
          {c.email && <div className="dl-row"><dt>{s.f.email}</dt><dd>{c.email}</dd></div>}
          {c.company && <div className="dl-row"><dt>{s.f.company}</dt><dd>{c.company}</dd></div>}
          {c.source && <div className="dl-row"><dt>{s.f.source}</dt><dd>{c.source}</dd></div>}
        </dl>
        {c.notes && <p className="pre small">{c.notes}</p>}
        <small className="muted">{c.lastInteraction ? s.lastInteraction(fmtDate(c.lastInteraction, lang)) : s.never}</small>
        <div className="rec-actions">
          <button className="btn primary" onClick={() => go({ name: 'contactForm', id: c.id })}>{t.c.edit}</button>
          {c.phone && <a className="btn secondary" href={`tel:+${phoneDigits(c.phone)}`}>{t.c.call}</a>}
          {c.phone && <a className="btn secondary" href={`https://wa.me/${phoneDigits(c.phone)}`} target="_blank" rel="noreferrer">{t.c.whatsapp}</a>}
        </div>
      </div>
      <div className="card stack-sm"><LeadPicker lang={lang} value={c.leadStatus} onChange={v => store.upsert('contacts', { ...c, leadStatus: v })} /></div>
      <SectionCard title={s.properties}>
        {props.length === 0 ? <Empty>{s.noProperties}</Empty> : props.map(p => (
          <button key={p.id} className="link-row" onClick={() => go({ name: 'listingDetail', id: p.id })}>{[p.ref, cardTitle(p)].filter(Boolean).join(' · ')}</button>
        ))}
      </SectionCard>
      <InquiryHistory lang={lang} go={go} contactId={c.id} />
      <ViewingHistory lang={lang} go={go} contactId={c.id} />
      <SectionCard title={s.todos} onEdit={() => go({ name: 'taskForm', prefill: { contactId: c.id } })} editLabel={t.c.add}>
        {tasks.length === 0 ? <Empty>{s.noTodos}</Empty> : <ul className="task-list">{tasks.map(x => <TaskRow key={x.id} lang={lang} t={x} go={go} onToggle={() => store.upsert('tasks', completeTask(x, !x.done))} />)}</ul>}
      </SectionCard>
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
  });
  const [err, setErr] = useState(false);
  const [del, setDel] = useState(false);
  const dup = d.phone && phoneDigits(d.phone).length >= 8 ? state.contacts.find(x => x.id !== d.id && x.phone && phoneDigits(x.phone) === phoneDigits(d.phone)) : undefined;
  const toggleRole = (r: ContactRole) => setD(x => ({ ...x, roles: x.roles.includes(r) ? x.roles.filter(y => y !== r) : [...x.roles, r] }));
  return (
    <section className="stack" data-testid="contact-form">
      <div className="card stack-sm">
        <label className="ff">{s.f.name}<input data-field="name" aria-invalid={err} value={d.name} onChange={e => { setD(x => ({ ...x, name: e.target.value })); setErr(false); }} /></label>
        {err && <p className="error" role="alert">{t.c.nameRequired}</p>}
        <label className="ff">{s.f.phone}<input data-field="phone" type="tel" inputMode="tel" value={d.phone ?? ''} onChange={e => setD(x => ({ ...x, phone: e.target.value || undefined }))} onBlur={() => setD(x => ({ ...x, phone: normalisePhone(x.phone) }))} /></label>
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
        <LeadPicker lang={lang} value={d.leadStatus} onChange={v => setD(x => ({ ...x, leadStatus: v }))} />
        <OptionSelect lang={lang} label={s.f.source} listKey="leadSource" builtIns={s.sources.map(v => ({ value: v }))} value={d.source} onChange={v => setD(x => ({ ...x, source: v }))} />
        <label className="ff">{s.f.notes}<textarea rows={3} value={d.notes ?? ''} onChange={e => setD(x => ({ ...x, notes: e.target.value || undefined }))} /></label>
      </div>
      {existing && <button className="btn ghost danger-text" onClick={() => setDel(true)}>{t.c.delete}</button>}
      <div className="save-bar"><div className="two">
        <button className="btn secondary" onClick={back}>{t.c.cancel}</button>
        <button className="btn primary" data-testid="save-contact" onClick={() => {
          if (!d.name.trim()) { setErr(true); return; }
          const saved = store.upsert('contacts', { ...d, name: d.name.trim(), phone: normalisePhone(d.phone), roles: d.roles.length ? d.roles : ['other'] });
          toast(t.c.saved);
          if (existing) back(); else go({ name: 'contactDetail', id: saved.id });
        }}>{t.c.save}</button>
      </div></div>
      {del && existing && <Confirm lang={lang} title={t.c.deleteQ} body={s.deleteBody} onCancel={() => setDel(false)} onOk={() => { store.remove('contacts', existing.id); go({ name: 'home' }); }} />}
    </section>
  );
}
