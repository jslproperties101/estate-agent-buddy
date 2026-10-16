// Owner, 17 Oct 2026: the location button on a Subsale List card. With a saved map point it opens a small menu:
//  - Share Location: choose a buyer or vendor (searchable list) and send the Google Maps link on WhatsApp, or take a new
//    person from the phone book, send it to them, and save them as a new contact (the contact form opens pre-filled);
//  - Open in Google Maps.
// Without a saved point the card shows "Location Not Set" in a small bubble for 1.5 seconds instead (see SubsaleCard).
// Nothing is sent by the app itself: WhatsApp opens with the message ready and the agent presses send there.
import { useMemo, useState } from 'react';
import { Lang } from '../i18n';
import { useApp } from '../data/useStore';
import { visible } from '../team/access';
import { Go } from '../nav';
import { IconClose } from '../icons';
import { c1017Strings } from '../ui/c1017Strings';
import { PhonebookButton } from '../ui/PhonebookButton';
import type { PickedContact } from '../lib/phonebook';
import type { Contact } from '../data/types';
import { Listing, cardTitle, phoneDigits, usablePhone } from './model';
import { mapsUrl, shareLocationLink } from './change015';

const BUYER_ROLES = ['buyer', 'tenant', 'investor'];
const VENDOR_ROLES = ['vendor', 'landlord'];

/** The buyers and the vendors to offer, each sorted by name; a contact in both groups appears in both. */
export function shareGroups(contacts: readonly Contact[], query: string): { buyers: Contact[]; vendors: Contact[] } {
  const q = query.trim().toLowerCase();
  const qd = q.replace(/\D/g, '');
  const match = (c: Contact) => !q || c.name.toLowerCase().includes(q) || (qd.length >= 3 && (c.phone ?? '').replace(/\D/g, '').includes(qd));
  const live = contacts.filter(c => !(c as { archived?: unknown }).archived && match(c)).sort((a, b) => a.name.localeCompare(b.name));
  return {
    buyers: live.filter(c => c.roles.some(r => BUYER_ROLES.includes(r))),
    vendors: live.filter(c => c.roles.some(r => VENDOR_ROLES.includes(r))),
  };
}

export function LocationMenu({ lang, l, go, onClose }: { lang: Lang; l: Listing; go: Go; onClose: () => void }) {
  const { state } = useApp();
  const t = c1017Strings[lang];
  const [step, setStep] = useState<'menu' | 'share'>('menu');
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<PickedContact | null>(null);
  const point = { lat: l.lat!, lng: l.lng! };
  const name = cardTitle(l);
  const groups = useMemo(() => shareGroups(visible(state, 'contacts', state.contacts), q), [state, q]);

  const row = (c: Contact) => usablePhone(c.phone)
    ? <a key={c.id} className="share-row" href={shareLocationLink(phoneDigits(c.phone), name, point)} target="_blank" rel="noreferrer"
        data-testid="share-contact" data-id={c.id}><strong>{c.name}</strong><small className="muted">{c.phone}</small></a>
    : <span key={c.id} className="share-row off" data-testid="share-contact-nophone" aria-disabled="true"><strong>{c.name}</strong><small className="muted">{t.noPhone}</small></span>;

  return (
    <div className="sheet-scrim" role="presentation" onClick={e => { e.stopPropagation(); if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet loc-menu" role="dialog" aria-modal="true" aria-labelledby="loc-menu-t" data-testid="location-menu">
        <div className="lp-head">
          <h2 id="loc-menu-t">{step === 'menu' ? t.menuTitle : t.shareTitle}</h2>
          <button type="button" className="icon-btn lp-close" onClick={onClose} aria-label={t.close} title={t.close} data-testid="location-menu-close"><IconClose /></button>
        </div>
        {name && <small className="muted">{name}</small>}
        {step === 'menu' ? (
          <div className="stack-sm">
            <button type="button" className="btn primary" data-testid="location-share" onClick={() => setStep('share')}>{t.share}</button>
            <a className="btn secondary" href={mapsUrl(point)} target="_blank" rel="noreferrer" data-testid="location-open-maps">{t.openMaps}</a>
          </div>
        ) : (
          <div className="stack-sm" data-testid="share-step">
            <input type="search" aria-label={t.search} placeholder={t.search} value={q} onChange={e => setQ(e.target.value)} data-testid="share-search" />
            <PhonebookButton lang={lang} testId="share-phonebook" onPicked={c => setPicked(c)} />
            {picked && (
              <div className="sub-card stack-sm" data-testid="share-picked">
                <strong>{t.picked(picked.name || picked.tel || '')}</strong>
                {usablePhone(picked.tel) && <a className="btn primary" href={shareLocationLink(phoneDigits(picked.tel), name, point)} target="_blank" rel="noreferrer" data-testid="share-picked-send">{t.sendWhatsapp}</a>}
                <button type="button" className="btn secondary" data-testid="share-picked-save"
                  onClick={() => go({ name: 'contactForm', prefill: { name: picked.name, phone: picked.tel } })}>{t.saveContact}</button>
              </div>
            )}
            {groups.buyers.length === 0 && groups.vendors.length === 0 && <p className="muted small" data-testid="share-none">{t.noContacts}</p>}
            {groups.buyers.length > 0 && <><div className="card-title">{t.buyers}</div><div className="share-list" data-testid="share-buyers">{groups.buyers.map(row)}</div></>}
            {groups.vendors.length > 0 && <><div className="card-title">{t.vendors}</div><div className="share-list" data-testid="share-vendors">{groups.vendors.map(row)}</div></>}
            <button type="button" className="btn secondary" onClick={() => setStep('menu')}>{t.back}</button>
          </div>
        )}
      </div>
    </div>
  );
}
