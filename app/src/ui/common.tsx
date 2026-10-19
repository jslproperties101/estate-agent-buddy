// Small shared screen pieces.
import { ReactNode, useEffect, useRef, useState } from 'react';
import { useApp, useFileStatus, useFileUrl, useStore } from '../data/useStore';
import { strings, Lang } from '../i18n';
import { leadReviewStrings } from '../data/leadReviewStrings';
import { LEAD_COLOURS, LEAD_STATUSES, LeadStatus, Contact, ContactRole, VENDOR_COLOURS, VENDOR_STATUSES, VendorStatus } from '../data/types';
import { REMINDER_CHOICES } from '../domain/workflow';
import { cardTitle, normalisePhone } from '../listing/model';
import { newId } from '../data/store';
import { PropertyPicker } from './PropertyPicker';

/** A record section with its own small Edit button at the bottom right. */
export function SectionCard({ title, onEdit, editLabel, children, testId, className = '' }: {
  title: ReactNode; onEdit?: () => void; editLabel?: string; children: ReactNode; testId?: string; className?: string;
}) {
  return (
    <section className={`card stack-sm sec-card ${className}`} data-testid={testId}>
      <div className="card-title">{title}</div>
      {children}
      {onEdit && (
        <div className="sec-foot">
          <button type="button" className="edit-mini" onClick={onEdit} aria-label={typeof title === 'string' ? `${editLabel ?? 'Edit'}: ${title}` : editLabel}>
            <span aria-hidden="true">✎</span> {editLabel ?? 'Edit'}
          </button>
        </div>
      )}
    </section>
  );
}

export function LeadDot({ status, lang, withText = true }: { status?: LeadStatus | 'inactive'; lang: Lang; withText?: boolean }) {
  if (!status) return null;
  // "inactive" only appears after the owner used Undo in the status review (a retired value, kept visible and unmistakable).
  const label = status === 'inactive' ? leadReviewStrings[lang].legacy : strings[lang].lead[status];
  return (
    <span className={`lead lead-${status}`} title={label} data-lead={status}>
      <span className="lead-dot" style={{ background: LEAD_COLOURS[status as LeadStatus] ?? '#9CA3AF' }} aria-hidden="true" />
      {withText ? <span>{label}</span> : <span className="sr-only">{label}</span>}
    </span>
  );
}

export function VendorDot({ status, lang }: { status?: VendorStatus; lang: Lang }) {
  if (!status) return null;
  const label = strings[lang].vendorStatus[status];
  return (
    <span className={`lead vstat vstat-${status}`} title={label} data-vstat={status}>
      <span className="lead-dot" style={{ background: VENDOR_COLOURS[status] }} aria-hidden="true" /><span>{label}</span>
    </span>
  );
}

export function VendorStatusPicker({ lang, value, onChange }: { lang: Lang; value?: VendorStatus; onChange: (v: VendorStatus | undefined) => void }) {
  const t = strings[lang];
  return (
    <div className="ff" data-testid="vendor-status-picker">
      <span>{t.vendorStatusLabel}</span>
      <div className="chip-row" role="radiogroup" aria-label={t.vendorStatusLabel}>
        {VENDOR_STATUSES.map(s => (
          <button key={s} type="button" role="radio" aria-checked={value === s} className={`chip-btn lead-chip ${value === s ? 'on' : ''}`} data-vstat={s}
            onClick={() => onChange(value === s ? undefined : s)}>
            <span className="lead-dot" style={{ background: VENDOR_COLOURS[s] }} aria-hidden="true" /> {t.vendorStatus[s]}
          </button>
        ))}
      </div>
    </div>
  );
}

export function LeadPicker({ lang, value, onChange }: { lang: Lang; value?: LeadStatus; onChange: (v: LeadStatus | undefined) => void }) {
  const t = strings[lang];
  return (
    <div className="ff">
      <span>{t.leadLabel}</span>
      <div className="chip-row" role="radiogroup" aria-label={t.leadLabel}>
        {LEAD_STATUSES.map(s => (
          <button key={s} type="button" role="radio" aria-checked={value === s} className={`chip-btn lead-chip ${value === s ? 'on' : ''}`}
            onClick={() => onChange(value === s ? undefined : s)}>
            <span className="lead-dot" style={{ background: LEAD_COLOURS[s] }} aria-hidden="true" /> {t.lead[s]}
          </button>
        ))}
      </div>
    </div>
  );
}

export function StoredImage({ fileId, url, alt = '', className }: { fileId?: string; url?: string; alt?: string; className?: string }) {
  const store = useStore();
  const stored = useFileUrl(fileId);
  const status = useFileStatus(fileId);
  // Change 54: a picture that fails to draw (its address was cancelled, or the phone dropped the decoded image) is asked for
  // once more with a fresh address, instead of staying an empty box.
  const [fresh, setFresh] = useState<string | undefined>(undefined);
  const tried = useRef(false);
  useEffect(() => { tried.current = false; setFresh(undefined); }, [fileId, stored]);
  const src = url ?? fresh ?? stored;
  const onError = () => {
    if (!fileId || url || tried.current) return;
    tried.current = true;
    void store.refreshFileUrl(fileId).then(u => setFresh(u));
  };
  if (src) return <img src={src} alt={alt} className={className} onError={onError} />;
  // Not on this phone: still loading, or waiting for the cloud copy, or it is gone / not allowed. The record stays usable.
  const gone = status === 'missing' || status === 'denied';
  return <span className={`img-wait ${gone ? 'img-missing' : ''} ${className ?? ''}`} data-testid={gone ? 'img-missing' : undefined} data-state={status} aria-hidden={gone ? undefined : 'true'} role={gone ? 'img' : undefined} aria-label={gone ? alt || 'Picture not available' : undefined} />;
}

/** The "Sample" mark on example records, so they can never be mistaken for real ones. */
export function SampleTag({ lang }: { lang: Lang }) {
  return <span className="chip-tag sample-tag" data-testid="sample-tag">{strings[lang].sampleTag}</span>;
}

export function Confirm({ lang, title, body, okLabel, danger = true, onOk, onCancel }: {
  lang: Lang; title: string; body?: string; okLabel?: string; danger?: boolean; onOk: () => void; onCancel: () => void;
}) {
  const c = strings[lang].c;
  return (
    <div className="scrim" role="presentation">
      <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="cf-t">
        <h2 id="cf-t">{title}</h2>
        {body && <p>{body}</p>}
        <div className="two">
          <button className="btn secondary" onClick={onCancel}>{c.cancel}</button>
          <button className={`btn ${danger ? 'danger' : 'primary'}`} onClick={onOk}>{okLabel ?? c.delete}</button>
        </div>
      </div>
    </div>
  );
}

/** A question with two or more answers (ClaudeChanges001: "Sold by you or by others?"). Cancel closes it. */
export function ChoiceDialog({ lang, title, body, choices, onCancel, testId, cancelLabel }: {
  lang: Lang; title: string; body?: string; choices: { label: string; onPick: () => void; primary?: boolean; danger?: boolean; testId?: string }[]; onCancel: () => void; testId?: string; cancelLabel?: string;
}) {
  const c = strings[lang].c;
  return (
    <div className="scrim" role="presentation">
      <div className="dialog stack-sm" role="alertdialog" aria-modal="true" aria-labelledby="cd-t" data-testid={testId}>
        <h2 id="cd-t">{title}</h2>
        {body && <p>{body}</p>}
        {choices.map(ch => <button key={ch.label} type="button" className={`btn ${ch.danger ? 'danger' : ch.primary ? 'primary' : 'secondary'}`} data-testid={ch.testId} onClick={ch.onPick}>{ch.label}</button>)}
        <button type="button" className="btn ghost" data-testid={testId ? `${testId}-cancel` : undefined} onClick={onCancel}>{cancelLabel ?? c.cancel}</button>
      </div>
    </div>
  );
}

/** Reminder choices: 15 min to 7 days before, at the time, or any other period. */
export function ReminderPicker({ lang, value, onChange }: { lang: Lang; value: number[]; onChange: (v: number[]) => void }) {
  const r = strings[lang].reminders;
  const [n, setN] = useState('');
  const [unit, setUnit] = useState<'min' | 'hour' | 'day'>('day');
  const toggle = (m: number) => onChange(value.includes(m) ? value.filter(x => x !== m) : [...value, m].sort((a, b) => a - b));
  const extra = value.filter(m => !(REMINDER_CHOICES as readonly number[]).includes(m));
  const label = (m: number) => (m === 0 ? r.atTime : r.before(m));
  return (
    <div className="ff" data-testid="reminders">
      <span>{r.title}</span>
      <div className="chip-row">
        {[...REMINDER_CHOICES, ...extra].map(m => (
          <button key={m} type="button" className={`chip-btn ${value.includes(m) ? 'on' : ''}`} aria-pressed={value.includes(m)} onClick={() => toggle(m)}>{label(m)}</button>
        ))}
      </div>
      <div className="row-wrap">
        <span className="small muted">{r.custom}</span>
        <input aria-label={r.custom} className="num-sm" inputMode="numeric" value={n} onChange={e => setN(e.target.value.replace(/\D/g, ''))} />
        <select aria-label={r.custom} value={unit} onChange={e => setUnit(e.target.value as 'min' | 'hour' | 'day')}>
          {(['min', 'hour', 'day'] as const).map(u => <option key={u} value={u}>{r.unit[u]}</option>)}
        </select>
        <button type="button" className="btn small secondary" disabled={!Number(n)} onClick={() => {
          const m = Number(n) * (unit === 'day' ? 1440 : unit === 'hour' ? 60 : 1);
          if (m > 0 && !value.includes(m)) onChange([...value, m].sort((a, b) => a - b));
          setN('');
        }}>{r.add}</button>
      </div>
    </div>
  );
}

/** Change 012: the property chooser shows the main photo, listing ID and address on each row (ui/PropertyPicker.tsx). */
export function PropertySelect({ lang, value, onChange, label }: { lang: Lang; value?: string; onChange: (id: string | undefined) => void; label?: string }) {
  const { state } = useApp();
  const c = strings[lang].c;
  const list = state.properties.filter(p => !p.archived || p.id === value).sort((a, b) => (cardTitle(a) || '').localeCompare(cardTitle(b) || ''));
  return <PropertyPicker lang={lang} list={list} value={value} onChange={onChange} label={label ?? c.property} />;
}

/** Choose a contact, or add one on the spot (name and phone; the rest can be filled later). */
export function ContactSelect({ lang, value, onChange, label, roles, filter, required, invalid }: {
  lang: Lang; value?: string; onChange: (id: string | undefined) => void; label?: string; roles: ContactRole[]; filter?: (c: Contact) => boolean; required?: boolean; invalid?: boolean;
}) {
  const { state, store } = useApp();
  const c = strings[lang].c;
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const list = state.contacts.filter(x => !filter || filter(x) || x.id === value).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="ff">
      <label className="ff">{label ?? c.contact}
        <select data-field="contactId" aria-invalid={invalid || undefined} value={value ?? ''} onChange={e => onChange(e.target.value || undefined)}>
          <option value="">{required ? c.choose : c.noContact}</option>
          {list.map(x => <option key={x.id} value={x.id}>{x.name}{x.phone ? ` · ${x.phone}` : ''}</option>)}
        </select>
      </label>
      {!adding ? <button type="button" className="btn small ghost" onClick={() => setAdding(true)}>{c.newContact}</button> : (
        <div className="sub-card stack-sm">
          <label className="ff">{c.name}<input value={name} onChange={e => setName(e.target.value)} /></label>
          <label className="ff">{c.phone}<input type="tel" inputMode="tel" placeholder="+60" value={phone} onChange={e => setPhone(e.target.value)} /></label>
          <div className="two">
            <button type="button" className="btn small secondary" onClick={() => { setAdding(false); setName(''); setPhone(''); }}>{c.cancel}</button>
            <button type="button" className="btn small primary" disabled={!name.trim()} onClick={() => {
              const now = Date.now();
              const rec = store.upsert('contacts', { id: newId(), created: now, updated: now, name: name.trim(), phone: normalisePhone(phone), roles });
              onChange(rec.id); setAdding(false); setName(''); setPhone('');
            }}>{c.save}</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function Tabs<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string; count?: number }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {options.map(o => (
        <button key={o.value} role="tab" type="button" aria-selected={value === o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}{o.count !== undefined ? <span className="count">{o.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="muted empty">{children}</p>;
}
