// A saved-contact dropdown with a search box (ClaudeChanges001 change 9): the agent finds a person by name or by phone
// number (digits anywhere in the number). Used for the property's Linked Vendor. The list opens inside the page, like
// OptionSelect, so long names wrap instead of being cut.
import { ReactNode, useId, useState } from 'react';
import type { Lang } from '../i18n';
import { strings } from '../i18n';
import type { Contact } from '../data/types';
import { cc001Strings } from './cc001Strings';

const digits = (x?: string) => (x ?? '').replace(/\D/g, '');
const norm = (x: string) => x.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');

/** Contacts whose name, number or WhatsApp username matches the search (all of them for an empty search). */
export function searchContacts(list: Contact[], q: string): Contact[] {
  const t = q.trim();
  if (!t) return list;
  const n = norm(t); const d = digits(t);
  return list.filter(c => norm(c.name ?? '').includes(n) || (d.length >= 2 && digits(c.phone).includes(d)) || norm(c.whatsapp ?? '').includes(n));
}

export function ContactPick({ lang, label, help, contacts, value, onChange, noneLabel, testId, field }: {
  lang: Lang; label: string; help?: ReactNode; contacts: Contact[]; value?: string; onChange: (id: string | undefined) => void;
  noneLabel: string; testId?: string; field?: string;
}) {
  const c = strings[lang].c;
  const x = cc001Strings[lang];
  const id = useId();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const cur = contacts.find(k => k.id === value);
  const shown = searchContacts(contacts, q);
  const pick = (v?: string) => { onChange(v); setOpen(false); setQ(''); };
  return (
    <div className="ff opt" data-testid={testId} data-field={field} data-value={value ?? ''}>
      <span><span id={`${id}-l`}>{label}</span>{help}</span>
      <button type="button" className="opt-btn" aria-haspopup="listbox" aria-expanded={open} aria-labelledby={`${id}-l ${id}-v`} onClick={() => setOpen(o => !o)}>
        <span id={`${id}-v`} className={cur ? '' : 'muted'}>{cur ? cur.name : noneLabel}</span><span aria-hidden="true" className="opt-caret">▾</span>
      </button>
      {open && (
        <div className="opt-list" role="listbox" aria-labelledby={`${id}-l`}>
          <div className="opt-search">
            <input type="search" inputMode="search" aria-label={`${c.search}: ${label}`} placeholder={x.vendorSearch} value={q}
              data-testid={testId ? `${testId}-search` : undefined} onChange={e => setQ(e.target.value)} />
          </div>
          {!q.trim() && <button type="button" role="option" aria-selected={!value} className="opt-item" onClick={() => pick(undefined)}>{noneLabel}</button>}
          {shown.map(k => (
            <button key={k.id} type="button" role="option" aria-selected={value === k.id} className="opt-item" data-contact={k.id} onClick={() => pick(k.id)}>
              {k.name}{k.phone ? <small className="muted"> · {k.phone}</small> : null}
            </button>
          ))}
          {q.trim() && !shown.length && <small className="muted opt-none">{x.vendorNoMatch}</small>}
        </div>
      )}
    </div>
  );
}
