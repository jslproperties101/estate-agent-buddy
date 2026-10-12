// Dropdown with built-in values, remembered custom values and "Others…".
//  - Choosing Others lets the agent type a new value; it is saved to the remembered list and chosen.
//  - Custom values show first (most recently used on top) and can be removed with ✕.
//  - Built-in values cannot be removed. Others is always available.
// The list opens inside the page (not a floating pop-up), so long words in any language wrap instead of being cut.
import { ReactNode, useId, useState } from 'react';
import { useApp } from '../data/useStore';
import { strings, Lang } from '../i18n';

export interface Choice { value: string; label?: string }

export function OptionSelect({ lang, label, listKey, builtIns, value, onChange, allowEmpty = true, emptyLabel, testId, hint, normalise, validate, help }: {
  lang: Lang; label: string; listKey: string; builtIns: Choice[]; value?: string; onChange: (v: string | undefined) => void;
  allowEmpty?: boolean; emptyLabel?: string; testId?: string; hint?: string;
  /** A Field Help "?" shown after the label. */
  help?: ReactNode;
  /** Applied to a typed value before it is checked and saved (for example upper case for prefixes). */
  normalise?: (v: string) => string;
  /** Returns an error message for a typed value that cannot be used. */
  validate?: (v: string) => string | null;
}) {
  const { state, store } = useApp();
  const c = strings[lang].c;
  const id = useId();
  const [open, setOpen] = useState(false);
  const [typing, setTyping] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const customs = [...(state.options[listKey] ?? [])].sort((a, b) => b.used - a.used)
    .filter(o => !builtIns.some(b => b.value.toLowerCase() === o.value.toLowerCase()));
  const labelOf = (v?: string) => (v === undefined || v === '' ? emptyLabel ?? c.notSet : builtIns.find(b => b.value === v)?.label ?? v);

  function pick(v: string | undefined) {
    onChange(v);
    if (v && customs.some(o => o.value === v)) store.touchOption(listKey, v);
    setOpen(false); setTyping(null); setErr(null);
  }
  function addTyped() {
    const v = (normalise ? normalise(typing ?? '') : typing ?? '').trim();
    if (!v) return;
    const problem = validate?.(v);
    if (problem) { setErr(problem); return; }
    const existing = [...builtIns.map(b => b.value), ...customs.map(o => o.value)].find(x => x.toLowerCase() === v.toLowerCase());
    if (existing) { pick(existing); return; }
    store.addOption(listKey, v);
    pick(v);
  }

  return (
    <div className="ff opt" data-testid={testId}>
      <span><span id={`${id}-l`}>{label}</span>{help}</span>
      <button type="button" className="opt-btn" aria-haspopup="listbox" aria-expanded={open} aria-labelledby={`${id}-l ${id}-v`} onClick={() => setOpen(o => !o)}>
        <span id={`${id}-v`} className={value ? '' : 'muted'}>{labelOf(value)}</span><span aria-hidden="true" className="opt-caret">▾</span>
      </button>
      {hint && <small className="muted">{hint}</small>}
      {open && (
        <div className="opt-list" role="listbox" aria-labelledby={`${id}-l`}>
          {allowEmpty && <button type="button" role="option" aria-selected={!value} className="opt-item" onClick={() => pick(undefined)}>{emptyLabel ?? c.notSet}</button>}
          {customs.map(o => (
            <div key={`c-${o.value}`} className="opt-row">
              <button type="button" role="option" aria-selected={value === o.value} className="opt-item custom" onClick={() => pick(o.value)}>
                {o.value}<small className="muted"> · {c.savedByYou}</small>
              </button>
              <button type="button" className="opt-x" aria-label={c.removeValue(o.value)} title={c.removeValue(o.value)}
                onClick={() => { store.removeOption(listKey, o.value); }}>✕</button>
            </div>
          ))}
          {builtIns.map(b => (
            <button key={`b-${b.value}`} type="button" role="option" aria-selected={value === b.value} className="opt-item" onClick={() => pick(b.value)}>{b.label ?? b.value}</button>
          ))}
          {typing === null
            ? <button type="button" className="opt-item others" onClick={() => setTyping('')}>{c.others}</button>
            : (
              <div className="opt-new">
                <input autoFocus aria-invalid={!!err} aria-label={c.othersHint} placeholder={c.othersHint} value={typing}
                  onChange={e => { setTyping(e.target.value); setErr(null); }} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTyped(); } }} />
                <button type="button" className="btn small primary" disabled={!typing.trim()} onClick={addTyped}>{c.addValue}</button>
                {err && <p className="error" role="alert">{err}</p>}
              </div>
            )}
        </div>
      )}
    </div>
  );
}
