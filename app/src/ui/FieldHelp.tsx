// The small "?" next to a field label. Tapping it opens a short explanation right below (inside the page, so long
// words in any language wrap); tapping again or "Close" hides it. Texts live in help.ts.
import { useId, useState } from 'react';
import { Lang } from '../i18n';
import { HELP, HELP_LABELS } from './help';

export function FieldHelp({ lang, topic, label }: { lang: Lang; topic: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const h = HELP[topic]?.[lang];
  if (!h) return null;
  const L = HELP_LABELS[lang];
  // Inside a <label>, a tap would also move focus to the input: stop that so only the help opens.
  const toggle = (e: { preventDefault(): void; stopPropagation(): void }) => { e.preventDefault(); e.stopPropagation(); setOpen(o => !o); };
  return (
    <>
      <button type="button" className="help-q" aria-expanded={open} aria-controls={id} aria-label={L.open(label ?? topic)} onClick={toggle} data-help={topic}>?</button>
      {open && (
        <span id={id} className="help-pop" role="note" data-testid={`help-${topic}`} onClick={toggle}>
          <span className="help-what">{h.what}</span>
          <span><b>{L.enter}:</b> {h.enter}</span>
          {h.eg && <span><b>{L.eg}:</b> {h.eg}</span>}
          {h.why && <span><b>{L.why}:</b> {h.why}</span>}
          <span className="help-close">{L.close} ✕</span>
        </span>
      )}
    </>
  );
}
