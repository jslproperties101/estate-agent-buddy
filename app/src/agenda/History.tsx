// Inquiry History and Viewing History: kept separate. An inquiry can be converted to a viewing; it then leaves
// Inquiry History and appears in Viewing History as a Pending Viewing (Inquiry → Pending Viewing → Viewed).
// Used on the property page, the contact page and the Inquiries & Viewings screen.
import { Lang } from '../i18n';
import { useApp } from '../data/useStore';
import { agendaStrings } from './strings';
import { Go } from '../nav';
import { SectionCard, LeadDot, Empty } from '../ui/common';
import { useToast } from '../ui/toast';
import { convertToViewing, setApptStatus, touchContact } from '../domain/workflow';
import { newId } from '../data/store';
import { fmtDateTime } from '../lib/dates';
import { cardTitle } from '../listing/model';
import type { Appointment, Inquiry } from '../data/types';
import { strings } from '../i18n';

export function InquiryHistory({ lang, go, propertyId, contactId, plain }: { lang: Lang; go: Go; propertyId?: string; contactId?: string; plain?: boolean }) {
  const { state, store } = useApp();
  const a = agendaStrings[lang];
  const toast = useToast();
  const list = state.inquiries
    .filter(i => (!propertyId || i.propertyId === propertyId) && (!contactId || i.contactId === contactId))
    .sort((x, y) => (x.at < y.at ? 1 : -1));

  function convert(i: Inquiry) {
    const appt = convertToViewing(i, { id: newId() });
    store.upsert('appointments', appt);
    store.remove('inquiries', i.id);
    toast(a.inq.converted);
  }

  const body = (
    <>
      {!plain && <small className="muted">{a.inq.help}</small>}
      {list.length === 0 ? <Empty>{a.inq.none}</Empty> : (
        <ul className="act-list" data-testid="inquiry-list">
          {list.map(i => <InquiryItem key={i.id} lang={lang} i={i} go={go} showProperty={!propertyId} onConvert={() => convert(i)} />)}
        </ul>
      )}
      <button className="btn secondary" onClick={() => go({ name: 'inquiryForm', propertyId, contactId })}>{a.inq.add}</button>
    </>
  );
  if (plain) return <div className="stack-sm" data-testid="inquiry-history">{body}</div>;
  return (
    <SectionCard title={a.inq.title} testId="inquiry-history" editLabel={strings[lang].c.edit}
      onEdit={() => go({ name: 'activity', propertyId, contactId, tab: 'inquiries' })}>
      {body}
    </SectionCard>
  );
}

function InquiryItem({ lang, i, go, showProperty, onConvert }: { lang: Lang; i: Inquiry; go: Go; showProperty: boolean; onConvert: () => void }) {
  const { state } = useApp();
  const a = agendaStrings[lang];
  const contact = state.contacts.find(c => c.id === i.contactId);
  const prop = state.properties.find(p => p.id === i.propertyId);
  return (
    <li className="act-item" data-testid="inquiry-item">
      <div className="between">
        <button className="link-btn" onClick={() => go({ name: 'inquiryForm', id: i.id })}><strong>{contact?.name ?? '—'}</strong></button>
        <LeadDot lang={lang} status={contact?.leadStatus} />
      </div>
      <small className="muted">{fmtDateTime(i.at, lang)} · {a.inq.channels[i.channel]}</small>
      {showProperty && prop && <small>{[prop.ref, cardTitle(prop)].filter(Boolean).join(' · ')}</small>}
      {i.message && <small>“{i.message}”</small>}
      <div className="row-wrap">
        <button className="btn small primary" onClick={onConvert}>{a.inq.convert}</button>
        <button className="btn small secondary" onClick={() => go({ name: 'inquiryForm', id: i.id })}>{strings[lang].c.edit}</button>
      </div>
    </li>
  );
}

export function ViewingHistory({ lang, go, propertyId, contactId, plain }: { lang: Lang; go: Go; propertyId?: string; contactId?: string; plain?: boolean }) {
  const { state } = useApp();
  const a = agendaStrings[lang];
  const list = state.appointments
    .filter(x => x.kind === 'viewing' && (!propertyId || x.propertyId === propertyId) && (!contactId || x.contactId === contactId))
    .sort((x, y) => ((x.start ?? '9999') < (y.start ?? '9999') ? 1 : -1));
  const body = (
    <>
      {!plain && <small className="muted">{a.view.flow}</small>}
      {list.length === 0 ? <Empty>{a.view.none}</Empty> : (
        <ul className="act-list" data-testid="viewing-list">
          {list.map(v => <ViewingItem key={v.id} lang={lang} v={v} go={go} showProperty={!propertyId} />)}
        </ul>
      )}
      <button className="btn secondary" onClick={() => go({ name: 'apptForm', kind: 'viewing', propertyId, contactId })}>{a.view.add}</button>
    </>
  );
  if (plain) return <div className="stack-sm" data-testid="viewing-history">{body}</div>;
  return (
    <SectionCard title={a.view.title} testId="viewing-history" editLabel={strings[lang].c.edit}
      onEdit={() => go({ name: 'activity', propertyId, contactId, tab: 'viewings' })}>
      {body}
    </SectionCard>
  );
}

export function ViewingItem({ lang, v, go, showProperty }: { lang: Lang; v: Appointment; go: Go; showProperty: boolean }) {
  const { state, store } = useApp();
  const a = agendaStrings[lang];
  const contact = state.contacts.find(c => c.id === v.contactId);
  const prop = state.properties.find(p => p.id === v.propertyId);
  const open = v.status === 'pending' || v.status === 'scheduled';
  return (
    <li className={`act-item st-${v.status}`} data-testid="viewing-item">
      <div className="between">
        <button className="link-btn" onClick={() => go({ name: 'apptForm', id: v.id })}><strong>{contact?.name ?? '—'}</strong></button>
        <span className={`appt-st appt-${v.status}`} data-testid="viewing-status">{a.view.status[v.status]}</span>
      </div>
      <div className="row-wrap"><LeadDot lang={lang} status={contact?.leadStatus} /><small className="muted">{v.start ? fmtDateTime(v.start, lang) : a.appt.noDate}</small></div>
      {showProperty && prop && <small>{[prop.ref, cardTitle(prop)].filter(Boolean).join(' · ')}</small>}
      {v.fromInquiry && <small className="muted">{a.view.fromInquiry(fmtDateTime(v.fromInquiry.at, lang))}{v.fromInquiry.message ? `: “${v.fromInquiry.message}”` : ''}</small>}
      {v.outcome && <small>{v.outcome}</small>}
      <div className="row-wrap">
        {open && <button className="btn small primary" onClick={() => {
          store.upsert('appointments', setApptStatus(v, 'completed'));
          if (contact) store.upsert('contacts', touchContact(contact));
        }}>{a.view.markViewed}</button>}
        {open && <button className="btn small secondary" onClick={() => store.upsert('appointments', setApptStatus(v, 'cancelled'))}>{a.view.cancelIt}</button>}
        <button className="btn small secondary" onClick={() => go({ name: 'apptForm', id: v.id })}>{strings[lang].c.edit}</button>
      </div>
    </li>
  );
}
