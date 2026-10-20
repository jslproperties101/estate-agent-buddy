// JoyChange003 Change 82 (Batch G): every pick list opens as the app's own gold list in the middle of the screen, never the
// phone's grey picker with teal radio buttons.
// A drop-in for <select>: the real <select> stays in the page (it shows the chosen value with the app's field style, screen
// readers and the keyboard use it, and so do the tests), and a clear tap area lies over it. A tap opens the gold pop-up
// with the same options; choosing one sets the <select> exactly as the phone's picker would (a normal "change"), so every
// screen's own onChange keeps working unchanged. Enter, Space or Alt+Down on the focused field open the pop-up too.
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconClose } from '../icons';
import { strings, type Lang } from '../i18n';
import { PickSearch, NoResults, matchesText } from './pickSearch';

/** The app's language from the page (set by App), for the close button's words. */
const pageLang = (): Lang => { const l = (typeof document !== 'undefined' ? document.documentElement.lang : '').toLowerCase(); return l.startsWith('ms') ? 'bm' : l.startsWith('zh') ? 'zh' : 'en'; };

interface Opt { value: string; label: string; disabled: boolean; i: number }

/** Sets a <select> the way a person choosing in it would, so React and any listener see a normal change. */
export function chooseIn(el: HTMLSelectElement, value: string) {
  if (el.value === value) return;
  const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
  if (set) set.call(el, value); else el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

/** The field's name for the pop-up title: its aria-label, its <label>, or the label it sits in. */
function titleOf(el: HTMLSelectElement): string {
  const own = el.getAttribute('aria-label');
  if (own) return own;
  const byId = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null;
  const wrap = byId ?? el.closest('label');
  if (!wrap) return '';
  // Only the label's own words, not the options of the list inside it.
  let text = '';
  wrap.childNodes.forEach(n => { if (n.nodeType === Node.TEXT_NODE) text += n.textContent ?? ''; else if (n instanceof HTMLElement && !n.matches('select, .sel-wrap') && !n.querySelector('select')) text += n.textContent ?? ''; });
  return text.replace(/\s+/g, ' ').trim();
}

/** The same attributes as a <select> (value, onChange, disabled, aria-label, data-testid …) and its <option> children. */
export type SelectProps = EabProps & { children?: unknown };

export function Select({ className, style, ...props }: SelectProps) {
  const ref = useRef<HTMLSelectElement | null>(null);
  const [open, setOpen] = useState<{ title: string; opts: Opt[]; value: string } | null>(null);
  // JoyChange006 Change C: every pick list has a search bar; typing narrows the list at once.
  const [q, setQ] = useState('');
  const id = useId();
  const setRef = (el: HTMLSelectElement | null) => { ref.current = el; };
  const show = () => {
    const el = ref.current;
    if (!el || el.disabled || props.multiple) return;
    const opts = [...el.options].map((o, i) => ({ value: o.value, label: o.label || o.text, disabled: o.disabled, i }));
    setQ('');
    setOpen({ title: titleOf(el), opts, value: el.value });
  };
  const close = () => { setOpen(null); setQ(''); ref.current?.focus({ preventScroll: true }); };
  const pick = (v: string) => { const el = ref.current; setOpen(null); setQ(''); if (el) { chooseIn(el, v); el.focus({ preventScroll: true }); } };
  const onKeyDown = (e: EabEvent<EabFormEl> & { altKey?: boolean; defaultPrevented?: boolean }) => {
    props.onKeyDown?.(e);
    if (e.defaultPrevented) return;
    if (e.key === 'Enter' || e.key === ' ' || (e.altKey && e.key === 'ArrowDown') || e.key === 'F4') { e.preventDefault(); show(); }
  };
  // The chosen entry is in view when the list opens.
  const list = useRef<HTMLDivElement | null>(null);
  // Focus goes to the chosen entry once, when the list opens (not on every keystroke in the search box).
  const isOpen = open !== null;
  useEffect(() => {
    if (!isOpen) return;
    const cur = list.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    cur?.focus({ preventScroll: true });
    cur?.scrollIntoView({ block: 'nearest' });
  }, [isOpen]);
  const lang = pageLang();
  const shown = open ? open.opts.filter(o => matchesText(o.label, q)) : [];
  // JoyChange006 Part 2 Change G: the Check status pop-up (data-verify on the field) colours each option word the same
  // as the field already shows for that status (styles.css .vp-* / .vc-*); text colour only, no dot or side bar.
  const verifyPop = 'data-verify' in props;

  return (
    <span className={`sel-wrap${props.disabled ? ' disabled' : ''}`} style={style}>
      <select {...props} ref={setRef} className={className} onKeyDown={onKeyDown} />
      {!props.multiple && (
        <button type="button" className="sel-tap" tabIndex={-1} aria-hidden="true" disabled={props.disabled} data-testid={props['data-testid'] ? `${props['data-testid']}-tap` : undefined}
          onClick={(e: EabEvent<HTMLElement>) => { e.preventDefault(); e.stopPropagation(); show(); }} />
      )}
      {open && createPortal(
        <div className="scrim opt-scrim sel-scrim" role="presentation" data-testid="pick-popup" onClick={(e: EabEvent<HTMLElement>) => { if (e.target === e.currentTarget) close(); }}
          onKeyDown={(e: EabEvent<HTMLElement>) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } }}>
          <div className="dialog opt-pop" role="dialog" aria-modal="true" aria-labelledby={`${id}-t`}>
            <div className="opt-pop-head">
              <strong id={`${id}-t`}>{open.title}</strong>
              <button type="button" className="fx-btn opt-pop-close" data-testid="pick-popup-close" aria-label={strings[pageLang()].c.close} title={strings[pageLang()].c.close} onClick={close}><IconClose size={15} /></button>
            </div>
            <PickSearch lang={lang} value={q} onChange={setQ} label={open.title || undefined} testId="pick-search" />
            <div className={`opt-list${verifyPop ? ' verify-colors' : ''}`} role="listbox" aria-labelledby={`${id}-t`} ref={list}>
              {shown.map(o => (
                <button key={`${o.i}-${o.value}`} type="button" role="option" aria-selected={o.value === open.value} disabled={o.disabled} className="opt-item"
                  data-testid="pick-option" data-value={o.value} onClick={() => pick(o.value)}>{o.label}</button>
              ))}
              {!shown.length && <NoResults lang={lang} testId="pick-none" />}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </span>
  );
}
