// Dropdown with built-in values, remembered custom values and "Others…".
//  - Choosing Others lets the agent type a new value; it is saved to the remembered list and chosen.
//  - Custom values show first (most recently used on top) and can be removed with ✕.
//  - Built-in values cannot be removed. Others is always available.
// JoyChange003 Change 82: the list opens as a pop-up card in the middle of the screen (the same card every dialog uses), so
// long words in any language wrap instead of being cut. Change 51: tapping the field opens the list at once; the pencil and the X
// live only inside the list (on remembered entries); "Not Set" in the list empties the field; the last entry is "+ Add New".
// Change 009: a longer list opens with a search box: typing filters the list at once (letters anywhere in the value), and
// a value that is not in the list can be added straight from the search ("Add …"), then it is remembered with an ✕.
// ClaudeChanges001 (owner, 17 Oct 2026): every list has the search box (change 9), and a remembered value shows only its
// ✕, without "Saved by you" (change 6).
// JoyChange002 Change 36: every remembered entry has a pencil (rename in place) and an X (delete), the pencil first, each in
// its own small bordered square. Deleting asks first; an address entry with entries saved under it, or used by saved
// properties, explains what would go with it (listing/optionEdit.ts) and offers Edit / Rename instead.
// Change 51 (JoyChange003) removed the field lock of Change 36: the field always opens with one tap, and a value chosen in
// this visit is emptied with "Not Set" in the list.
import { useId, useState } from 'react';
import { useApp } from '../data/useStore';
import { strings, Lang } from '../i18n';
import { ChoiceDialog, Confirm } from './common';
import { c036Strings } from './c036Strings';
import { IconPencil, IconClose } from '../icons';
import { useToast } from './toast';
import { isForeign } from '../team/access';
import { countBelow, propertiesUsing, optionsAfterDelete, optionsAfterRename, renamedIn, clearedIn } from '../listing/optionEdit';

export interface Choice { value: string; label?: string }

export function OptionSelect({ lang, label, listKey, builtIns, value, onChange, allowEmpty = true, emptyLabel, testId, hint, normalise, validate }: {
  lang: Lang; label: string; listKey: string; builtIns: Choice[]; value?: string; onChange: (v: string | undefined) => void;
  allowEmpty?: boolean; emptyLabel?: string; testId?: string; hint?: string;
  /** A Field Help "?" shown after the label. */
  /** Applied to a typed value before it is checked and saved (for example upper case for prefixes). */
  normalise?: (v: string) => string;
  /** Returns an error message for a typed value that cannot be used. */
  validate?: (v: string) => string | null;
  /** Kept so existing callers still compile; Change 51 removed the lock, so it is ignored. */
  savedValue?: string;
}) {
  const { state, store } = useApp();
  const c = strings[lang].c;
  const id = useId();
  const [open, setOpen] = useState(false);
  const [typing, setTyping] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const x36 = c036Strings[lang];
  const toast = useToast();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [renameErr, setRenameErr] = useState<string | null>(null);
  const [ask, setAsk] = useState<null | { kind: 'simple' | 'below' | 'props'; value: string; n: number }>(null);
  const customs = [...(state.options[listKey] ?? [])].sort((a, b) => b.used - a.used)
    .filter(o => !builtIns.some(b => b.value.toLowerCase() === o.value.toLowerCase()));
  const searchable = true;   // ClaudeChanges001 change 9: every list can be searched
  const norm = (x: string) => x.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  const match = (x: string) => !q.trim() || norm(x).includes(norm(q.trim()));
  const shownCustoms = customs.filter(o => match(o.value));
  const shownBuiltIns = builtIns.filter(b => match(b.value) || match(b.label ?? ''));
  const exact = [...builtIns.map(b => b.value), ...customs.map(o => o.value)].some(x => norm(x) === norm(q.trim()));
  const labelOf = (v?: string) => (v === undefined || v === '' ? emptyLabel ?? c.notSet : builtIns.find(b => b.value === v)?.label ?? v);

  function close() { setOpen(false); setTyping(null); setErr(null); setQ(''); setRenaming(null); setRenameErr(null); }
  function pick(v: string | undefined) {
    onChange(v);
    if (v && customs.some(o => o.value === v)) store.touchOption(listKey, v);
    setOpen(false); setTyping(null); setErr(null); setQ('');
  }
  // ---------- Change 36 ----------
  const affected = (v: string) => propertiesUsing(store.getState().properties, listKey, v).filter(p => !isForeign(store.getState(), 'properties', p.id));
  function startRename(v: string) { setAsk(null); setRenaming(v); setRenameText(v); setRenameErr(null); }
  function doRename(from: string) {
    const to = (normalise ? normalise(renameText) : renameText).trim();
    if (!to) { setRenameErr(x36.emptyName); return; }
    if (to === from) { setRenaming(null); return; }
    const problem = validate?.(to);
    if (problem) { setRenameErr(problem); return; }
    if (builtIns.some(b => b.value.toLowerCase() === to.toLowerCase())) { setRenameErr(x36.taken); return; }
    const props = affected(from);
    store.setSingleton('options', optionsAfterRename(store.getState().options, listKey, from, to));
    for (const p of props) store.upsert('properties', renamedIn(p, listKey, to));
    if (value === from) onChange(to);
    setRenaming(null);
    toast(x36.renamed(props.length));
  }
  function askDelete(v: string) {
    const below = countBelow(store.getState().options, listKey, v);
    const n = affected(v).length;
    setAsk(below ? { kind: 'below', value: v, n: below } : n ? { kind: 'props', value: v, n } : { kind: 'simple', value: v, n: 0 });
  }
  function doDelete(v: string) {
    const props = affected(v);
    store.setSingleton('options', optionsAfterDelete(store.getState().options, listKey, v));
    for (const p of props) store.upsert('properties', clearedIn(p, listKey));
    if (value === v) onChange(undefined);
    setAsk(null);
  }
  function addTyped(text = typing ?? '') {
    const v = (normalise ? normalise(text) : text).trim();
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
      <span><span id={`${id}-l`}>{label}</span></span>
      <div className="opt-field">
        <button type="button" className="opt-btn" aria-haspopup="listbox" aria-expanded={open} aria-labelledby={`${id}-l ${id}-v`} onClick={() => setOpen(o => !o)}>
          <span id={`${id}-v`} className={value ? '' : 'muted'}>{labelOf(value)}</span><span aria-hidden="true" className="opt-caret">▾</span>
        </button>
      </div>
      {hint && <small className="muted">{hint}</small>}
      {open && (
        <div className="scrim opt-scrim" role="presentation" data-testid="opt-popup" onClick={e => { if (e.target === e.currentTarget) close(); }}
          onKeyDown={e => { if (e.key === 'Escape') close(); }}>
        <div className="dialog opt-pop" role="dialog" aria-modal="true" aria-labelledby={`${id}-l`}>
        <div className="opt-pop-head"><strong>{label}</strong>
          <button type="button" className="fx-btn opt-pop-close" data-testid="opt-popup-close" aria-label={c.cancel} title={c.cancel} onClick={close}><IconClose size={15} /></button>
        </div>
        <div className="opt-list" role="listbox" aria-labelledby={`${id}-l`}>
          {searchable && (
            <div className="opt-search">
              <input type="search" aria-label={`${c.search}: ${label}`} placeholder={c.search} value={q} data-testid={testId ? `${testId}-search` : undefined}
                onChange={e => { setQ(e.target.value); setErr(null); }}
                onKeyDown={e => {
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  const only = [...shownCustoms.map(o => o.value), ...shownBuiltIns.map(b => b.value)];
                  if (only.length === 1) pick(only[0]); else if (q.trim() && !exact) addTyped(q);
                }} />
              {q.trim() && !exact && <button type="button" className="btn small primary" data-testid={testId ? `${testId}-add` : undefined} onClick={() => addTyped(q)}>{c.addValue}: “{q.trim()}”</button>}
              {err && <p className="error" role="alert">{err}</p>}
            </div>
          )}
          {allowEmpty && !q.trim() && <button type="button" role="option" aria-selected={!value} className="opt-item" onClick={() => pick(undefined)}>{emptyLabel ?? c.notSet}</button>}
          {shownCustoms.map(o => renaming === o.value ? (
            <div key={`c-${o.value}`} className="opt-rename" data-testid="opt-rename">
              <input autoFocus aria-label={x36.renameLabel} value={renameText} aria-invalid={!!renameErr}
                onChange={e => { setRenameText(e.target.value); setRenameErr(null); }}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); doRename(o.value); } if (e.key === 'Escape') setRenaming(null); }} />
              <button type="button" className="btn small primary" data-testid="opt-rename-save" onClick={() => doRename(o.value)}>{x36.save}</button>
              <button type="button" className="btn small ghost" onClick={() => setRenaming(null)}>{x36.cancel}</button>
              {renameErr && <p className="error" role="alert">{renameErr}</p>}
            </div>
          ) : (
            <div key={`c-${o.value}`} className="opt-row">
              <button type="button" role="option" aria-selected={value === o.value} className="opt-item custom" onClick={() => pick(o.value)}>
                {o.value}
              </button>
              <button type="button" className="fx-btn fx-edit opt-edit" data-testid="opt-edit" aria-label={x36.edit(o.value)} title={x36.edit(o.value)}
                onClick={() => startRename(o.value)}><IconPencil size={15} /></button>
              <button type="button" className="fx-btn fx-x opt-x" data-testid="opt-x" aria-label={c.removeValue(o.value)} title={c.removeValue(o.value)}
                onClick={() => askDelete(o.value)}><IconClose size={15} /></button>
            </div>
          ))}
          {shownBuiltIns.map(b => (
            <button key={`b-${b.value}`} type="button" role="option" aria-selected={value === b.value} className="opt-item" onClick={() => pick(b.value)}>{b.label ?? b.value}</button>
          ))}
          {searchable && q.trim() && !shownCustoms.length && !shownBuiltIns.length && <small className="muted opt-none">{c.noMatch}</small>}
          {searchable && q.trim() ? null : typing === null
            ? <button type="button" className="opt-item others" onClick={() => setTyping('')}>{c.others}</button>
            : (
              <div className="opt-new">
                <input autoFocus aria-invalid={!!err} aria-label={c.othersHint} placeholder={c.othersHint} value={typing}
                  onChange={e => { setTyping(e.target.value); setErr(null); }} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTyped(); } }} />
                <button type="button" className="btn small primary" disabled={!typing.trim()} onClick={() => addTyped()}>{c.addValue}</button>
                {err && <p className="error" role="alert">{err}</p>}
              </div>
            )}
        </div>
        </div>
        </div>
      )}
      {ask?.kind === 'simple' && <Confirm lang={lang} title={x36.simpleQ(ask.value)} body={x36.simpleBody} okLabel={x36.del}
        onCancel={() => setAsk(null)} onOk={() => doDelete(ask.value)} />}
      {ask?.kind === 'below' && (
        <ChoiceDialog lang={lang} title={x36.belowQ(ask.value)} body={x36.belowBody(ask.n)} testId="opt-ask-below" cancelLabel={x36.cancel} onCancel={() => setAsk(null)} choices={[
          { label: x36.del, danger: true, testId: 'opt-below-delete', onPick: () => { const n = affected(ask.value).length; if (n) setAsk({ kind: 'props', value: ask.value, n }); else doDelete(ask.value); } },
          { label: x36.editInstead, testId: 'opt-below-edit', onPick: () => startRename(ask.value) },
        ]} />
      )}
      {ask?.kind === 'props' && (
        <ChoiceDialog lang={lang} title={x36.propsQ(ask.n)} body={x36.propsBody(ask.n)} testId="opt-ask-props" cancelLabel={x36.cancel} onCancel={() => setAsk(null)} choices={[
          { label: x36.continueDel, danger: true, testId: 'opt-props-delete', onPick: () => doDelete(ask.value) },
          { label: x36.rename, testId: 'opt-props-rename', onPick: () => startRename(ask.value) },
        ]} />
      )}
    </div>
  );
}
