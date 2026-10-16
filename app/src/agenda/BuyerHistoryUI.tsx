// Buyer's History screen (Change 012), opened from the full-width button on a property's detail page. One scrolling
// screen: every buyer linked to this property, each shown once and already expanded, with their current status and a
// dated history oldest first. Tapping a buyer's name opens that buyer's existing record. Below it the property's Inquiry
// History and Viewing History (renamed in the property's own view, Change 012) keep their Add / Convert / Viewed tools.
import type { Lang } from '../i18n';
import { useApp } from '../data/useStore';
import { Go } from '../nav';
import { buyerHistoryFor, HistoryEvent } from '../domain/buyerHistory';
import { c11Strings } from '../ui/c011Strings';
import { agendaStrings } from './strings';
import { fmtDate, fmtDateTime } from '../lib/dates';
import { LeadDot, Empty } from '../ui/common';
import { InquiryHistory, ViewingHistory } from './History';
import { cardTitle } from '../listing/model';
import { visible } from '../team/access';

function whenText(e: HistoryEvent, lang: Lang, none: string): string {
  if (e.when === undefined || e.when === '') return none;
  if (typeof e.when === 'number') return fmtDateTime(e.when, lang);
  return e.when.length === 10 ? fmtDate(e.when, lang) : fmtDateTime(e.when, lang);
}

export function BuyerHistoryScreen({ lang, propertyId, go }: { lang: Lang; propertyId: string; go: Go }) {
  const { state } = useApp();
  const t = c11Strings[lang].history;
  const a = agendaStrings[lang];
  const p = state.properties.find(x => x.id === propertyId);
  const list = buyerHistoryFor(propertyId, {
    inquiries: visible(state, 'inquiries', state.inquiries),
    appointments: visible(state, 'appointments', state.appointments),
    deals: visible(state, 'deals', state.deals),
    contacts: visible(state, 'contacts', state.contacts),
  });
  return (
    <section className="stack" data-testid="buyer-history">
      {p && <p className="small muted" data-testid="buyer-history-property">{[p.ref, cardTitle(p)].filter(Boolean).join(' · ')}</p>}
      <p className="notice">{t.intro}</p>
      {list.length === 0 ? <Empty>{t.none}</Empty> : (
        <ul className="bh-list" data-testid="buyer-history-list">
          {list.map(b => (
            <li key={b.contactId} className="card stack-sm bh-buyer" data-testid="bh-buyer" data-contact={b.contactId}>
              <div className="between">
                {b.contact
                  ? <button type="button" className="link-btn bh-name" onClick={() => go({ name: 'contactDetail', id: b.contactId })} aria-label={t.openBuyer(b.contact.name)} data-testid="bh-open-buyer"><strong>{b.contact.name}</strong></button>
                  : <strong className="muted">{t.unknownBuyer}</strong>}
                <LeadDot lang={lang} status={b.contact?.leadStatus} />
              </div>
              {b.latest && <small data-testid="bh-current"><span className="muted">{t.current}:</span> <strong>{t.kinds[b.latest.kind]}</strong> · {whenText(b.latest, lang, t.noDate)}</small>}
              <ol className="bh-events" data-testid="bh-events">
                {b.events.map(e => (
                  <li key={`${e.source}:${e.id}`} className={`bh-event k-${e.kind}`} data-testid="bh-event" data-kind={e.kind}>
                    <span className="bh-when">{whenText(e, lang, t.noDate)}</span>
                    <span className="bh-what"><strong>{t.kinds[e.kind]}</strong>{e.channel ? ` · ${t.via(a.inq.channels[e.channel] ?? e.channel)}` : ''}</span>
                    {e.note && <small className="muted bh-note">{e.note}</small>}
                  </li>
                ))}
              </ol>
            </li>
          ))}
        </ul>
      )}
      <h2 className="bh-records">{t.records}</h2>
      <InquiryHistory lang={lang} go={go} propertyId={propertyId} />
      <ViewingHistory lang={lang} go={go} propertyId={propertyId} />
    </section>
  );
}
