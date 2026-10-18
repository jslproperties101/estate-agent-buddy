// JoyChange002 Change 50: the property and contact choosers in the review area. The best match is pre-selected and
// the next best follow in order; "Create new" is always the first row and is the default when nothing matches.
// Every property row shows the photo first, then the address and the ID (the Change 012 picture rows).
import { useState } from 'react';
import type { Lang } from '../i18n';
import type { Listing } from '../listing/model';
import { cardTitle } from '../listing/model';
import type { Contact } from '../data/types';
import { PropertyThumb } from '../ui/PropertyPicker';
import type { Ranked } from './match';
import { c048Strings } from './c048Strings';

export const NEW = 'new';

function PropRow({ l, lang, best }: { l: Listing; lang: Lang; best?: boolean }) {
  const t = c048Strings[lang];
  return (
    <span className="pp-row-inner">
      <PropertyThumb l={l} />
      <span className="pp-text">
        <span className="pp-addr" data-testid="mp-addr">{cardTitle(l) || '—'}</span>
        <strong className="pp-ref" data-testid="mp-ref">{l.ref || t.noId}{best ? <span className="mp-best"> · {t.best}</span> : null}</strong>
      </span>
    </span>
  );
}
function NewRow({ text }: { text: string }) {
  return <span className="pp-row-inner"><span className="pp-thumb pp-none mp-new-icon" aria-hidden="true">＋</span><span className="pp-text"><strong>{text}</strong></span></span>;
}

export function PropertyMatchPicker({ lang, ranked, value, onChange }: { lang: Lang; ranked: Ranked<Listing>[]; value: string; onChange: (v: string) => void }) {
  const t = c048Strings[lang];
  const [open, setOpen] = useState(false);
  const chosen = ranked.find(r => r.item.id === value)?.item;
  const top = ranked[0]?.score ? ranked[0].item.id : undefined;
  const pick = (v: string) => { onChange(v); setOpen(false); };
  return (
    <div className="ff pp mp" data-testid="match-property">
      <span>{t.property}</span>
      <button type="button" className="pp-current" aria-haspopup="listbox" aria-expanded={open} data-value={value} data-testid="match-property-current" onClick={() => setOpen(o => !o)}>
        {chosen ? <PropRow l={chosen} lang={lang} best={chosen.id === top} /> : <NewRow text={t.newProperty} />}
        <span className="pp-caret" aria-hidden="true">▾</span>
      </button>
      <small className="muted">{chosen ? t.chooseProperty : t.noMatchProperty}</small>
      {open && (
        <div className="pp-list" role="listbox" aria-label={t.property} data-testid="match-property-list">
          <button type="button" role="option" aria-selected={value === NEW} className="pp-opt" data-testid="mp-new" onClick={() => pick(NEW)}><NewRow text={t.newProperty} /></button>
          {ranked.map(r => (
            <button key={r.item.id} type="button" role="option" aria-selected={r.item.id === value} className="pp-opt" data-id={r.item.id} data-score={Math.round(r.score)}
              data-testid="mp-option" onClick={() => pick(r.item.id)}>
              <PropRow l={r.item} lang={lang} best={r.item.id === top} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ContactMatchPicker({ lang, ranked, all, value, onChange }: { lang: Lang; ranked: Ranked<Contact>[]; all: Contact[]; value: string; onChange: (v: string) => void }) {
  const t = c048Strings[lang];
  const [open, setOpen] = useState(false);
  // Matches first (best first), then every other buyer and vendor, so any saved contact can be chosen.
  const ids = new Set(ranked.map(r => r.item.id));
  const list = [...ranked.map(r => r.item), ...all.filter(c => !ids.has(c.id)).sort((a, b) => a.name.localeCompare(b.name))];
  const chosen = list.find(c => c.id === value);
  const pick = (v: string) => { onChange(v); setOpen(false); };
  const row = (c: Contact) => (
    <span className="pp-row-inner"><span className="pp-text">
      <strong>{c.name}{c.id === ranked[0]?.item.id ? <span className="mp-best"> · {t.best}</span> : null}</strong>
      <small className="muted">{[c.phone, c.roles.includes('vendor') || c.roles.includes('landlord') ? t.vendor : c.roles.length ? t.buyer : ''].filter(Boolean).join(' · ')}</small>
    </span></span>
  );
  return (
    <div className="ff pp mp" data-testid="match-contact">
      <span>{t.contact}</span>
      <button type="button" className="pp-current" aria-haspopup="listbox" aria-expanded={open} data-value={value} data-testid="match-contact-current" onClick={() => setOpen(o => !o)}>
        {chosen ? row(chosen) : <NewRow text={t.newContact} />}
        <span className="pp-caret" aria-hidden="true">▾</span>
      </button>
      <small className="muted">{chosen ? t.chooseContact : t.noMatchContact}</small>
      {open && (
        <div className="pp-list" role="listbox" aria-label={t.contact} data-testid="match-contact-list">
          <button type="button" role="option" aria-selected={value === NEW} className="pp-opt" data-testid="mc-new" onClick={() => pick(NEW)}><NewRow text={t.newContact} /></button>
          {list.map(c => <button key={c.id} type="button" role="option" aria-selected={c.id === value} className="pp-opt" data-id={c.id} data-testid="mc-option" onClick={() => pick(c.id)}>{row(c)}</button>)}
        </div>
      )}
    </div>
  );
}
