// Name + phone number + WhatsApp alias, the same way everywhere a property captures a person (owner, tenant), Change 009.
//  - The phone-book icon sits at the end of the NAME row and of the PHONE row (ClaudeChanges001): tap it, Android asks for Contacts permission (the system prompt,
//    not a "go to Settings" message), then its contact picker opens; name and number land in the normal boxes and stay
//    editable. A refused permission, a closed picker or a browser without a phone book each say so under the row.
//  - The phone box shows a ready "+"; the WhatsApp box a ready "@". They are display prefixes: what is stored is the number
//    in +60 format (normalisePhone) and the alias with one "@", never "++" or "@@".
//  - Typing a name, number or alias offers matching saved contacts; choosing one fills all three (or, for an owner, links
//    the existing vendor record), so the same person is not saved twice.
import { useMemo } from 'react';
import { Lang } from '../i18n';
import { usePhonebook } from './PhonebookButton';
import { isWebsite } from '../native/native';
import type { PickedContact } from '../lib/phonebook';
import type { Contact } from '../data/types';
import { normalisePhone } from '../listing/model';

export interface ContactValue { name?: string; phone?: string; whatsapp?: string }

/** The alias as stored: one leading "@", no spaces. Empty stays empty. */
export const aliasValue = (raw?: string) => { const v = (raw ?? '').trim().replace(/^@+/, '').replace(/\s+/g, ''); return v ? `@${v}` : undefined; };
/** The phone as stored while typing: one leading "+" in front of what was typed (normalised to +60 … when the box is left). */
export const phoneTyped = (raw?: string) => { const v = (raw ?? '').replace(/^\s*\+*/, ''); return v.trim() ? `+${v}` : undefined; };
const digits = (x?: string) => (x ?? '').replace(/\D/g, '');

const PhonebookIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 3h12a1 1 0 011 1v16a1 1 0 01-1 1H6a1 1 0 01-1-1V4a1 1 0 011-1zM3 7h2M3 12h2M3 17h2" /><circle cx="12" cy="10" r="2.5" /><path d="M8.5 16a3.5 3.5 0 017 0" /></svg>
);

export function ContactBox({ lang, idPrefix, labels, value, onChange, onPicked, onSuggest, contacts, pickLabel, suggestLabel, useLabel, phonePh, whatsappPh, fields }: {
  lang: Lang; idPrefix: string;
  /** data-field names of the three boxes (what voice fill and the tests address). */
  fields?: { name: string; phone: string; whatsapp: string };
  labels: { name: string; phone: string; whatsapp: string };
  value: ContactValue;
  onChange: (patch: ContactValue) => void;
  /** A contact chosen from the phone's address book (the screen may ask before replacing typed details). */
  onPicked: (c: PickedContact) => void;
  /** A saved contact chosen from the suggestions. */
  onSuggest: (c: Contact) => void;
  contacts: Contact[];
  pickLabel: string; suggestLabel: string; useLabel: string; phonePh?: string; whatsappPh?: string;
}) {
  const { busy, msg, pick } = usePhonebook(lang, onPicked);
  const book = !isWebsite();   // JoyChange002 Change 47: no phone book on the laptop website
  const f = fields ?? { name: `${idPrefix}.name`, phone: `${idPrefix}.phone`, whatsapp: `${idPrefix}.whatsapp` };
  const q = { name: (value.name ?? '').trim().toLowerCase(), phone: digits(value.phone), wa: (value.whatsapp ?? '').replace(/^@/, '').toLowerCase() };
  const suggestions = useMemo(() => {
    if (q.name.length < 2 && q.phone.length < 3 && q.wa.length < 2) return [];
    return contacts.filter(c => {
      if (c.sample) return false;
      const same = (c.name ?? '').toLowerCase() === q.name && (!q.phone || digits(c.phone) === q.phone);
      if (same) return false;          // already exactly what is typed
      return (q.name.length >= 2 && (c.name ?? '').toLowerCase().includes(q.name))
        || (q.phone.length >= 3 && digits(c.phone).includes(q.phone))
        || (q.wa.length >= 2 && (c.whatsapp ?? '').replace(/^@/, '').toLowerCase().includes(q.wa));
    }).slice(0, 4);
  }, [contacts, q.name, q.phone, q.wa]);

  return (
    <div className="contact-box stack-sm" data-testid={`${idPrefix}-box`}>
      <div className="ff">
        <label htmlFor={`${idPrefix}-name`}>{labels.name}</label>
        <div className="combo">
          <input id={`${idPrefix}-name`} data-field={f.name} autoComplete="off" value={value.name ?? ''} onChange={e => onChange({ name: e.target.value || undefined })} />
          {book && <button type="button" className="combo-btn" onClick={() => void pick()} aria-label={pickLabel} title={pickLabel} aria-busy={busy} data-testid={`${idPrefix}-pick`}><PhonebookIcon /></button>}
        </div>
        {msg && <p className={msg.error ? 'error pb-msg' : 'muted small pb-msg'} role={msg.error ? 'alert' : 'status'} data-testid={`${idPrefix}-pick-msg`}>{msg.text}</p>}
      </div>
      {/* ClaudeChanges001 change 9: the phone and the WhatsApp username each have their own full line; the phone book
          icon is on the phone row too (either one fills both name and number); the "@" sits inside the typing box. */}
      <div className="ff">
        <label htmlFor={`${idPrefix}-phone`}>{labels.phone}</label>
        <div className="combo">
          <div className="prefixed grow"><span className="prefix" aria-hidden="true">+</span>
            <input id={`${idPrefix}-phone`} data-field={f.phone} type="tel" inputMode="tel" autoComplete="off" placeholder={phonePh}
              value={(value.phone ?? '').replace(/^\+/, '')} onChange={e => onChange({ phone: phoneTyped(e.target.value) })}
              onBlur={() => onChange({ phone: normalisePhone(value.phone) })} />
          </div>
          {book && <button type="button" className="combo-btn" onClick={() => void pick()} aria-label={pickLabel} title={pickLabel} aria-busy={busy} data-testid={`${idPrefix}-pick-phone`}><PhonebookIcon /></button>}
        </div>
      </div>
      <div className="ff">
        <label htmlFor={`${idPrefix}-wa`}>{labels.whatsapp}</label>
        <div className="prefixed inside"><span className="prefix" aria-hidden="true">@</span>
          <input id={`${idPrefix}-wa`} data-field={f.whatsapp} autoComplete="off" autoCapitalize="none" placeholder={whatsappPh}
            value={(value.whatsapp ?? '').replace(/^@+/, '')} onChange={e => onChange({ whatsapp: aliasValue(e.target.value) })} />
        </div>
      </div>
      {suggestions.length > 0 && (
        <div className="suggest" data-testid={`${idPrefix}-suggest`}>
          <small className="muted">{suggestLabel}</small>
          {suggestions.map(c => (
            <button key={c.id} type="button" className="suggest-item" onClick={() => onSuggest(c)}>
              <span>{c.name}{c.phone ? ` · ${c.phone}` : ''}{c.whatsapp ? ` · ${c.whatsapp}` : ''}</span><strong>{useLabel}</strong>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
