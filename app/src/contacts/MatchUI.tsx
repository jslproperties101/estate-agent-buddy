// "What this buyer wants" (several requirements per buyer) and the buyer ↔ property matches built from them.
import { useMemo } from 'react';
import type { Lang } from '../i18n';
import { useApp } from '../data/useStore';
import { newId } from '../data/store';
import { BuyerRequirement, Contact, FINANCING_STATES, FinancingState } from '../data/types';
import { TYPES, Listing, cardTitle, rmShort, phoneDigits, usablePhone } from '../listing/model';
import { listingStrings } from '../listing/strings';
import { matchStrings } from './matchStrings';
import { MoneyInput } from '../ui/MoneyInput';
import { Criterion, isEmptyRequirement, matchesForBuyer, matchesForProperty, Level } from '../domain/matching';
import { Go } from '../nav';
import { SectionCard, Empty } from '../ui/common';

const numOrUndef = (v: string) => { const n = Number(v.replace(/[^\d.]/g, '')); return v.trim() && Number.isFinite(n) ? n : undefined; };

/** The editor used inside the contact form. */
export function RequirementsEditor({ lang, value, onChange }: { lang: Lang; value: BuyerRequirement[]; onChange: (v: BuyerRequirement[]) => void }) {
  const m = matchStrings[lang]; const ls = listingStrings[lang];
  const { state } = useApp();
  const known = useMemo(() => [...new Set(state.properties.flatMap(p => [p.township, p.city]).filter((x): x is string => !!x))].sort(), [state.properties]);
  const set = (id: string, patch: Partial<BuyerRequirement>) => onChange(value.map(r => (r.id === id ? { ...r, ...patch } : r)));
  return (
    <div className="stack-sm" data-testid="requirements-editor">
      <div className="card-title">{m.title}</div>
      <small className="muted">{m.hint}</small>
      {value.map((r, i) => (
        <div key={r.id} className="card stack-sm" data-testid="requirement" data-index={i}>
          <label className="ff">{m.f.label}<input data-field={`req-label-${i}`} value={r.label ?? ''} onChange={e => set(r.id, { label: e.target.value || undefined })} /></label>
          <label className="ff">{m.f.purpose}
            <select data-field={`req-purpose-${i}`} value={r.purpose ?? ''} onChange={e => set(r.id, { purpose: (e.target.value || undefined) as BuyerRequirement['purpose'] })}>
              <option value="">{m.any}</option>{Object.entries(m.purposes).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <fieldset className="ff"><legend>{m.f.types}</legend>
            <div className="chip-row">{TYPES.map(t => { const on = !!r.types?.includes(t); return (
              <button key={t} type="button" className={`chip-btn ${on ? 'on' : ''}`} aria-pressed={on} data-type={t}
                onClick={() => set(r.id, { types: on ? (r.types ?? []).filter(x => x !== t) : [...(r.types ?? []), t] })}>{ls.types[t] ?? t}</button>
            ); })}</div>
          </fieldset>
          <label className="ff">{m.f.areas}
            <input data-field={`req-areas-${i}`} list={`req-areas-list-${i}`} value={(r.areas ?? []).join(', ')} onChange={e => set(r.id, { areas: e.target.value.split(',').map(x => x.trim()).filter(Boolean) })} />
            <datalist id={`req-areas-list-${i}`}>{known.map(a => <option key={a} value={a} />)}</datalist>
          </label>
          <div className="two">
            <label className="ff">{m.f.budgetMin}<MoneyInput data-field={`req-bmin-${i}`} value={r.budgetMin} onChange={v => set(r.id, { budgetMin: v })} /></label>
            <label className="ff">{m.f.budgetMax}<MoneyInput data-field={`req-bmax-${i}`} value={r.budgetMax} onChange={v => set(r.id, { budgetMax: v })} /></label>
          </div>
          <div className="two">
            <label className="ff">{m.f.bedrooms}<input data-field={`req-beds-${i}`} inputMode="numeric" value={r.bedroomsMin ?? ''} onChange={e => set(r.id, { bedroomsMin: numOrUndef(e.target.value) })} /></label>
            <label className="ff">{m.f.adjoining}<input data-field={`req-adj-${i}`} inputMode="numeric" value={r.adjoiningUnits ?? ''} onChange={e => set(r.id, { adjoiningUnits: numOrUndef(e.target.value) })} /></label>
          </div>
          <div className="two">
            <label className="ff">{m.f.land}<input data-field={`req-land-${i}`} inputMode="numeric" value={r.landMinSqft ?? ''} onChange={e => set(r.id, { landMinSqft: numOrUndef(e.target.value) })} /></label>
            <label className="ff">{m.f.builtUp}<input data-field={`req-built-${i}`} inputMode="numeric" value={r.builtUpMinSqft ?? ''} onChange={e => set(r.id, { builtUpMinSqft: numOrUndef(e.target.value) })} /></label>
          </div>
          <div className="two">
            <label className="ff">{m.f.tenure}
              <select data-field={`req-tenure-${i}`} value={r.tenure ?? ''} onChange={e => set(r.id, { tenure: (e.target.value || undefined) as BuyerRequirement['tenure'] })}>
                <option value="">{m.any}</option>{Object.entries(m.tenures).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="ff">{m.f.financing}
              <select data-field={`req-fin-${i}`} value={r.financing ?? ''} onChange={e => set(r.id, { financing: (e.target.value || undefined) as FinancingState | undefined })}>
                <option value="">{m.any}</option>{FINANCING_STATES.map(k => <option key={k} value={k}>{m.financing[k]}</option>)}
              </select>
            </label>
          </div>
          <label className="ff">{m.f.notes}<textarea rows={2} value={r.notes ?? ''} onChange={e => set(r.id, { notes: e.target.value || undefined })} /></label>
          <button type="button" className="btn ghost danger-text" data-testid="requirement-remove" onClick={() => onChange(value.filter(x => x.id !== r.id))}>{m.remove}</button>
        </div>
      ))}
      <button type="button" className="btn secondary" data-testid="requirement-add" onClick={() => onChange([...value, { id: newId() }])}>{value.length ? m.addAnother : m.add}</button>
    </div>
  );
}

/** One line of the explanation: what fits, what does not, what could not be checked. */
function CriterionLine({ lang, c }: { lang: Lang; c: Criterion }) {
  const m = matchStrings[lang];
  const mark = c.verdict === 'fits' ? '✓' : c.verdict === 'fails' ? '✗' : '?';
  const text = c.key === 'adjoining' ? m.adjoiningNote(Number(c.wants)) : `${m.crit[c.key]}: ${c.has !== undefined ? c.has : m.verdict.unknown}${c.wants !== undefined && c.verdict !== 'unknown' ? ` (${m.wants(c.wants)})` : ''}`;
  return <li className={`crit ${c.verdict}`} data-verdict={c.verdict}><span aria-hidden="true">{mark}</span> <span className="sr-only">{m.verdict[c.verdict]}: </span>{text}</li>;
}
const LEVEL_CLASS: Record<Level, string> = { exact: 'ok-text', partial: 'warn-text', near: 'muted', none: '' };

/** On the contact page: what the buyer wants, then the properties that fit. */
export function BuyerRequirementsCard({ lang, c, go }: { lang: Lang; c: Contact; go: Go }) {
  const { state } = useApp();
  const m = matchStrings[lang]; const ls = listingStrings[lang];
  const reqs = (c.requirements ?? []).filter(r => !isEmptyRequirement(r));
  const matches = useMemo(() => matchesForBuyer(c, state.properties.filter(p => !p.archived)).slice(0, 20), [c, state.properties]);
  return (
    <>
      <SectionCard title={m.title} onEdit={() => go({ name: 'contactForm', id: c.id })} editLabel="✎" testId="buyer-requirements">
        {reqs.length === 0 ? <Empty>{m.empty}</Empty> : reqs.map(r => (
          <div key={r.id} className="stack-sm" data-testid="requirement-summary">
            {r.label && <strong>{r.label}</strong>}
            <small>{[
              r.purpose && m.purposes[r.purpose],
              r.types?.length && r.types.map(t => ls.types[t] ?? t).join(' / '),
              r.areas?.length && r.areas.join(', '),
              (r.budgetMin !== undefined || r.budgetMax !== undefined) && `${r.budgetMin !== undefined ? rmShort(r.budgetMin) : ''}${r.budgetMin !== undefined && r.budgetMax !== undefined ? ' – ' : r.budgetMax !== undefined ? '≤ ' : '≥ '}${r.budgetMax !== undefined ? rmShort(r.budgetMax) : ''}`,
              r.bedroomsMin !== undefined && `${r.bedroomsMin}+ ${ls.beds}`,
              r.landMinSqft !== undefined && `${r.landMinSqft.toLocaleString('en-US')}+ sq ft ${ls.land}`,
              r.builtUpMinSqft !== undefined && `${r.builtUpMinSqft.toLocaleString('en-US')}+ sq ft ${ls.builtUp}`,
              r.tenure && m.tenures[r.tenure],
              r.adjoiningUnits && m.adjoiningNote(r.adjoiningUnits),
              r.financing && m.financing[r.financing],
            ].filter(Boolean).join(' · ')}</small>
            {r.notes && <small className="muted">{r.notes}</small>}
          </div>
        ))}
      </SectionCard>
      {reqs.length > 0 && (
        <section className="card stack-sm" data-testid="buyer-matches"><div className="card-title">{m.matchesTitle}</div>
          {matches.length === 0 ? <Empty>{m.matchesNone}</Empty> : matches.map(x => (
            <div key={x.property.id} className="stack-sm match-row" data-testid="match-row" data-level={x.level}>
              <button className="link-row" onClick={() => go({ name: 'listingDetail', id: x.property.id })}>
                <strong>{[x.property.ref, cardTitle(x.property)].filter(Boolean).join(' · ')}</strong>
                <small className={LEVEL_CLASS[x.level]}>{m.levels[x.level]}</small>
              </button>
              <ul className="crit-list">{x.criteria.map((cr, i) => <CriterionLine key={i} lang={lang} c={cr} />)}</ul>
              {usablePhone(c.phone) && (
                <a className="btn small secondary" target="_blank" rel="noreferrer"
                  href={`https://wa.me/${phoneDigits(c.phone)}?text=${encodeURIComponent(m.wa(c.name, [x.property.ref, cardTitle(x.property), x.property.askingPrice ? rmShort(x.property.askingPrice) : ''].filter(Boolean).join(', ')))}`}>{m.whatsapp}</a>
              )}
            </div>
          ))}
          <small className="muted">{m.note}</small>
        </section>
      )}
    </>
  );
}

/** On the property page: active buyers whose requirements fit this property. */
export function PropertyBuyersCard({ lang, p, go }: { lang: Lang; p: Listing; go: Go }) {
  const { state } = useApp();
  const m = matchStrings[lang];
  const matches = useMemo(() => matchesForProperty(p, state.contacts).slice(0, 20), [p, state.contacts]);
  return (
    <section className="card stack-sm" data-testid="property-buyers"><div className="card-title">{m.buyersTitle}</div>
      {matches.length === 0 ? <Empty>{m.buyersNone}</Empty> : matches.map(x => (
        <div key={x.contact.id} className="stack-sm match-row" data-testid="match-row" data-level={x.level}>
          <button className="link-row" onClick={() => go({ name: 'contactDetail', id: x.contact.id })}>
            <strong>{x.contact.name}</strong>
            <small className={LEVEL_CLASS[x.level]}>{m.levels[x.level]}{x.requirement.label ? ` · ${x.requirement.label}` : ''}</small>
          </button>
          <ul className="crit-list">{x.criteria.map((cr, i) => <CriterionLine key={i} lang={lang} c={cr} />)}</ul>
          {usablePhone(x.contact.phone) && (
            <a className="btn small secondary" target="_blank" rel="noreferrer"
              href={`https://wa.me/${phoneDigits(x.contact.phone)}?text=${encodeURIComponent(m.wa(x.contact.name, [p.ref, cardTitle(p), p.askingPrice ? rmShort(p.askingPrice) : ''].filter(Boolean).join(', ')))}`}>{m.whatsapp}</a>
          )}
        </div>
      ))}
      <small className="muted">{m.note}</small>
    </section>
  );
}
