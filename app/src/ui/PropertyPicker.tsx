// Choosing a property (Change 012): every property list the agent picks from shows one compact row per property, the main
// photo on the left and the listing ID with the address on the right. A property without a photo (or whose photo cannot
// be shown) gets a plain placeholder; its ID and address stay readable and selectable. Rows are chosen by the property's
// own id, so two properties at the same address can never be mixed up. Not used for buyers or vendors.
import { useState } from 'react';
import type { Lang } from '../i18n';
import { useFileUrl } from '../data/useStore';
import { Listing, cardTitle, orderedPhotos } from '../listing/model';
import { c11Strings } from './c011Strings';
import { searchProperties } from '../calculator/saved';
import { PickSearch, NoResults } from './pickSearch';

/** The main photo as a small square, reusing the stored picture (no extra copy is made); a neutral box without one. */
export function PropertyThumb({ l, size = 48 }: { l: Listing; size?: number }) {
  const p = orderedPhotos(l)[0];
  const stored = useFileUrl(p?.fileId);
  const [failed, setFailed] = useState(false);
  const src = p ? (p.url ?? stored) : undefined;
  const box = { width: size, height: size };
  if (!src || failed) return <span className="pp-thumb pp-none" style={box} data-testid="pp-thumb-none" aria-hidden="true" />;
  return <img className="pp-thumb" style={box} src={src} alt="" loading="lazy" onError={() => setFailed(true)} data-testid="pp-thumb" />;
}

/** One property row: photo left, listing ID and address right. */
export function PropertyRow({ l, lang, extra }: { l: Listing; lang: Lang; extra?: string }) {
  const t = c11Strings[lang].picker;
  return (
    <span className="pp-row-inner">
      <PropertyThumb l={l} />
      <span className="pp-text">
        <strong className="pp-ref" data-testid="pp-ref">{l.ref || t.noRef}</strong>
        <span className="pp-addr" data-testid="pp-addr">{cardTitle(l) || '—'}</span>
        {extra && <small className="muted">{extra}</small>}
      </span>
    </span>
  );
}

/** A property chooser: the chosen property (or "No property") as a button; tapping it opens the scrollable list. */
export function PropertyPicker({ lang, list, value, onChange, label, allowNone = true, testId = 'propertyId' }: {
  lang: Lang; list: Listing[]; value?: string; onChange: (id: string | undefined) => void; label: string; allowNone?: boolean; testId?: string;
}) {
  const t = c11Strings[lang].picker;
  const [open, setOpen] = useState(false);
  // JoyChange006 Change C: a search bar at the top of the list (listing ID, address, type, place, owner).
  const [q, setQ] = useState('');
  const chosen = list.find(p => p.id === value);
  const pick = (id: string | undefined) => { onChange(id); setOpen(false); setQ(''); };
  const shown = q.trim() ? searchProperties(list, q, Infinity) : list;
  return (
    <div className="ff pp" data-testid="property-picker">
      <span>{label}</span>
      <button type="button" className="pp-current" aria-haspopup="listbox" aria-expanded={open} data-field={testId} data-value={value ?? ''} onClick={() => { setOpen(o => !o); setQ(''); }}>
        {chosen ? <PropertyRow l={chosen} lang={lang} /> : <span className="pp-row-inner"><span className="pp-thumb pp-none" aria-hidden="true" /><span className="pp-text muted">{t.choose}</span></span>}
        <span className="pp-caret" aria-hidden="true">▾</span>
      </button>
      {open && <PickSearch lang={lang} value={q} onChange={setQ} label={t.listLabel} placeholder={t.search} testId="pp-search" />}
      {open && (
        <div className="pp-list" role="listbox" aria-label={t.listLabel} data-testid="property-picker-list">
          {allowNone && !q.trim() && <button type="button" role="option" aria-selected={!value} className="pp-opt" onClick={() => pick(undefined)} data-testid="pp-none">
            <span className="pp-row-inner"><span className="pp-thumb pp-none" aria-hidden="true" /><span className="pp-text muted">{t.none}</span></span>
          </button>}
          {shown.map(p => (
            <button key={p.id} type="button" role="option" aria-selected={p.id === value} className="pp-opt" data-id={p.id} onClick={() => pick(p.id)} data-testid="pp-option">
              <PropertyRow l={p} lang={lang} />
            </button>
          ))}
          {!shown.length && <NoResults lang={lang} testId="pp-none-found" />}
        </div>
      )}
    </div>
  );
}
