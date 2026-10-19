// JoyChange003 Change 64: "WhatsApp this buyer and remind our appointment" opens a list of suggested messages, filled in from
// the saved records (name, property, appointment date and time, price). The agent's own texts are kept in the same list:
// "+ Add New" adds one, and the pencil and X inside the list edit or remove it (as in Change 51). Picking a message shows it
// to change if needed; "Open WhatsApp" opens WhatsApp to that person with the text typed in. The app never sends it.
import { useState } from 'react';
import type { Lang } from '../i18n';
import type { Contact } from '../data/types';
import type { Listing } from '../listing/model';
import { useApp } from '../data/useStore';
import { c056Strings } from './c056Strings';
import { waDataFor, orderTemplates, fillCustom, waLink, waDigits, isVendor, type WaTopic } from './assistant';

export const WA_LIST = 'waTexts';

export function WhatsAppPicker({ lang, contact, property, topic }: { lang: Lang; contact: Contact; property?: Listing; topic?: WaTopic }) {
  const { state, store } = useApp();
  const t = c056Strings[lang];
  const data = waDataFor(contact, property, state);
  const built = orderTemplates(topic, isVendor(contact)).map(x => ({ id: x.id, text: x.text(data, lang) }));
  const own = (state.options[WA_LIST] ?? []).map(o => o.value);
  const [text, setText] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ old?: string; draft: string } | null>(null);
  const phone = contact.phone;
  const usable = waDigits(phone).length >= 9;

  function saveOwn() {
    if (!editing) return;
    const v = editing.draft.trim();
    if (editing.old && editing.old !== v) store.removeOption(WA_LIST, editing.old);
    if (v) store.addOption(WA_LIST, v);
    setEditing(null);
  }

  return (
    <div className="stack-sm wa-picker" data-testid="wa-picker">
      <strong>{t.waTitle} · {contact.name}</strong>
      {!usable && <p className="warn-text" data-testid="wa-no-phone">{t.noPhone}</p>}
      {text === null && !editing && (
        <div className="wa-list" role="listbox" aria-label={t.waPick} data-testid="wa-list">
          {built.map(b => (
            <button key={b.id} type="button" role="option" aria-selected={false} className="wa-opt" data-testid="wa-option" data-id={b.id} onClick={() => setText(b.text)}>{b.text}</button>
          ))}
          {own.length > 0 && <small className="muted wa-sub">{t.waYours}</small>}
          {own.map(o => (
            <div key={o} className="wa-opt-row" data-testid="wa-own">
              <button type="button" role="option" aria-selected={false} className="wa-opt" onClick={() => setText(fillCustom(o, data, lang))}>{fillCustom(o, data, lang)}</button>
              <button type="button" className="opt-icon" aria-label={t.waEditOne} title={t.waEditOne} data-testid="wa-own-edit" onClick={() => setEditing({ old: o, draft: o })}>✎</button>
              <button type="button" className="opt-icon" aria-label={t.waRemove} title={t.waRemove} data-testid="wa-own-remove" onClick={() => store.removeOption(WA_LIST, o)}>✕</button>
            </div>
          ))}
          <button type="button" className="wa-opt wa-add" data-testid="wa-add" onClick={() => setEditing({ draft: '' })}>{t.waAdd}</button>
        </div>
      )}
      {editing && (
        <div className="stack-sm" data-testid="wa-own-form">
          <label className="ff">{t.waNew}
            <textarea rows={3} value={editing.draft} onChange={e => setEditing({ ...editing, draft: e.target.value })} data-testid="wa-own-text" />
          </label>
          <small className="muted">{t.waHint}</small>
          <div className="two">
            <button type="button" className="btn secondary" onClick={() => setEditing(null)}>{t.cancel}</button>
            <button type="button" className="btn primary" disabled={!editing.draft.trim()} onClick={saveOwn} data-testid="wa-own-save">{t.waSave}</button>
          </div>
        </div>
      )}
      {text !== null && (
        <div className="stack-sm" data-testid="wa-chosen">
          <label className="ff">{t.waEdit}
            <textarea rows={4} value={text} onChange={e => setText(e.target.value)} data-testid="wa-text" />
          </label>
          <div className="two">
            <button type="button" className="btn secondary" onClick={() => setText(null)} data-testid="wa-back">{t.waPick}</button>
            {usable
              ? <a className="btn primary" href={waLink(phone, text)} target="_blank" rel="noreferrer" data-testid="wa-open">{t.waOpen}</a>
              : <button type="button" className="btn primary" disabled data-testid="wa-open">{t.waOpen}</button>}
          </div>
          <small className="muted">{t.waNote}</small>
        </div>
      )}
    </div>
  );
}
