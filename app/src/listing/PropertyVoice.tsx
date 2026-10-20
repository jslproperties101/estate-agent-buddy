// Voice / text for properties: speech → editable text → proposed details → review → save.
// This is how property information is captured. Understanding runs on the phone with simple rules (commands.ts);
// nothing is saved until the agent ticks and confirms each value.
import { useEffect, useState } from 'react';
import { Lang } from '../i18n';
import { listingStrings, ListingStrings, typeLabel } from './strings';
import { parseCommand, Change, ChangeKey, Command, currentValue } from './commands';
import { Listing, rm, landText, sqft } from './model';
import { SpeechBox } from '../ui/SpeechBox';
import { useApp } from '../data/useStore';
import { correctTerms, vocabularyFrom } from '../voice/correct';
import { rankProperties, rankContacts, preselect, Ranked } from '../voice/match';
import { PropertyMatchPicker, ContactMatchPicker, NEW } from '../voice/MatchPickers';
import { c048Strings } from '../voice/c048Strings';
import { VENDOR_ROLES, BUYER_ROLES, type Contact } from '../data/types';
import { can } from '../team/access';
import { monthText } from '../lib/dates';
import { usage } from '../usage/logger';

export type VoiceMode = 'list' | 'record' | 'central';

export const SAMPLE_COMMANDS: Record<VoiceMode, string[]> = {
  list: [
    'Create a new semi-detached factory in Salak Tinggi, land area 20,000 square feet, built-up 12,000 square feet, asking price RM3.2 million, leasehold.',
    'Create a new terrace house in Putra Nilai for rent, rental RM1,800 per month, three bedrooms, two bathrooms, owner Encik Ahmad 012 345 6789.',
    'Find the factory in Salak Tinggi',
  ],
  record: [
    'Change the asking price to RM3 million',
    'Add three parking bays',
    'Update the tenancy information',
    "Add a note about the owner's instructions",
  ],
  central: [
    'Find the factory in Salak Tinggi',
    'Create a new semi-detached factory in Salak Tinggi, land area 20,000 square feet, built-up 12,000 square feet, asking price RM3.2 million, leasehold.',
    'Show condos for rent in Putra Nilai',
    'Change the status of P1001 to Sold',
    'Find buyers looking for a factory in Salak Tinggi',
  ],
};

const LABEL_KEY: Partial<Record<ChangeKey, string>> = { 'tenancy.tenant': 'tenant', 'tenancy.rent': 'tRent', 'tenancy.start': 'tStart', 'tenancy.end': 'tEnd' };
export const changeLabel = (s: ListingStrings, k: ChangeKey) => s.l[LABEL_KEY[k] ?? k] ?? k;

export function showValue(s: ListingStrings, k: ChangeKey, v: unknown, lang: Lang = 'en'): string {
  if (v === undefined || v === null || v === '') return '—';
  switch (k) {
    case 'askingPrice': case 'monthlyRent': case 'tenancy.rent': return rm(Number(v));
    case 'landSqft': return landText(Number(v));
    case 'builtUpSqft': return sqft(Number(v));
    case 'tenure': return s.tenure[String(v)] ?? String(v);
    case 'purpose': return s.purpose[String(v)] ?? String(v);
    case 'status': return s.status[String(v)] ?? String(v);
    case 'type': return typeLabel(s, String(v));
    case 'tenancy.start': case 'tenancy.end': return monthText(String(v), lang);
    default: return String(v);
  }
}

/** Details an agent usually states for a new property; the ones not said are listed, so nothing looks invented. */
const CREATE_EXPECTED: ChangeKey[] = ['type', 'township', 'street', 'landSqft', 'builtUpSqft', 'askingPrice', 'tenure'];

export function PropertyVoice({ lang, mode, listing, onCreate, onFind, onApply, otherCommand, minimal, fill }: {
  lang: Lang; mode: VoiceMode; listing?: Listing;
  /** Change 50: `target` is the existing property and / or saved contact the agent chose in the review area. */
  onCreate?: (changes: Change[], target?: { propertyId?: string; contactId?: string }) => void;
  /** Change 48: the minimal AI Assisted Command layout (typing box, send arrow, voice button; nothing else). */
  minimal?: boolean;
  /** Change 48: an example tapped in "How to use" is put in the box (it waits there until send). */
  fill?: { text: string; n: number };
  onFind?: (c: Extract<Command, { kind: 'find' }>) => number;
  onApply?: (changes: Change[]) => void;
  /** Central Voice Command: a chance to handle a to-do, calendar or contact command first. */
  otherCommand?: (text: string) => boolean;
}) {
  const { state } = useApp();
  const s = listingStrings[lang];
  const v = s.voice;
  const [text, setText] = useState('');
  const [result, setResult] = useState<Command | null>(null);
  const [message, setMessage] = useState('');
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [noteText, setNoteText] = useState('');
  const [keepWords, setKeepWords] = useState(false);
  const places = [...(state.options.township ?? []), ...(state.options.city ?? [])].map(o => o.value);
  // Change 49: the agent's own saved places, so local names heard slightly wrong are corrected.
  const vocab = vocabularyFrom(state.options, state.properties);
  const fix = (heard: string) => correctTerms(heard, vocab);
  // Change 50: which existing property / saved contact a "create" command may really be about.
  const [ranked, setRanked] = useState<{ props: Ranked<Listing>[]; contacts: Ranked<Contact>[] | null }>({ props: [], contacts: null });
  const [propSel, setPropSel] = useState(NEW);
  const [contactSel, setContactSel] = useState(NEW);
  const k = c048Strings[lang];
  const people = state.contacts.filter(c => c.roles.some(r => VENDOR_ROLES.includes(r) || BUYER_ROLES.includes(r)));
  function findTargets(cmdText: string, r: Command) {
    if (mode !== 'central' || r.kind !== 'create') return;
    const props = rankProperties(cmdText, state.properties.filter(p => !p.archived && can(state, 'edit', 'properties', p.id)), state.contacts, { inquiries: state.inquiries, appointments: state.appointments });
    const named = r.changes.some(c => c.key === 'ownerName' || c.key === 'ownerPhone');
    const cs = rankContacts(cmdText, people);
    setRanked({ props, contacts: named || cs.length ? cs : null });
    setPropSel(preselect(props)?.id ?? NEW);
    setContactSel(preselect(cs)?.id ?? NEW);
  }

  function interpret(cmdText = text) {
    setMessage(''); setResult(null);
    if (otherCommand?.(cmdText)) return;
    const r = parseCommand(cmdText, mode === 'record' ? listing : undefined, places);
    usage.command(mode === 'record' ? 'command.listing' : 'command.list', r.kind !== 'unknown');   // Stage C: understood or not, never the words
    if (r.kind === 'find') {
      if (!onFind) { setMessage(v.unknown); return; }
      setMessage(v.found(onFind(r)));
      return;
    }
    if (r.kind === 'create' && mode === 'record') { setMessage(v.unknown); return; }
    if (r.kind === 'unknown') { setMessage(mode === 'record' ? v.unknown : v.unknownList); return; }
    if (r.kind === 'ask' && r.topic === 'note') setNoteText(r.prefix ?? '');
    if ((r.kind === 'create' || r.kind === 'update') && !r.changes.length) { setMessage(v.unknown); return; }
    if (r.kind === 'create' || r.kind === 'update') setPicked(Object.fromEntries(r.changes.map(c => [c.key, true])));
    findTargets(cmdText, r);
    setResult(r);
  }

  const chosen = (r: Command) => (r.kind === 'create' || r.kind === 'update' ? r.changes.filter(c => picked[c.key]) : []);

  const onText = (x: string) => { setText(x); setResult(null); setMessage(''); };
  useEffect(() => { if (fill) onText(fill.text); }, [fill?.n]);   // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={minimal ? 'stack-sm voice-cmd minimal' : 'card stack-sm voice-cmd'} data-testid="voice-cmd">
      {minimal ? (
        // Change 48: the box, a send arrow beside it, the voice button below. What was heard waits in the box until send.
        <SpeechBox lang={lang} value={text} onChange={onText} label={v.textLabel} compact transform={fix} testId="cmd-speech"
          action={<button type="button" className="send-btn" aria-label={k.send} title={k.send} disabled={!text.trim()} data-testid="cmd-send" onClick={() => interpret()}>
            <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </button>} />
      ) : <>
        <div className="card-title">🎙 {v.title}</div>
        <small className="muted">{mode === 'record' ? v.recordHint : v.listHint}</small>
        <small className="engine-note">{v.engine}</small>
        <SpeechBox lang={lang} value={text} onChange={onText} label={v.textLabel} transform={fix} />
        <button className="btn primary" disabled={!text.trim()} onClick={() => interpret()}>{v.interpret}</button>
      </>}

      {!minimal && <details className="examples">
        <summary>{v.examples}</summary>
        <div className="stack-sm">
          {SAMPLE_COMMANDS[mode].map(c => (
            <button key={c} className="example" onClick={() => { setText(c); interpret(c); }}>
              <span className="badge sample-badge">{v.example}</span> “{c}”
            </button>
          ))}
        </div>
      </details>}

      {message && <p className="voice-msg" role="status" data-testid="voice-msg">{message}</p>}

      {result?.kind === 'ask' && result.topic === 'tenancy' && <p className="voice-msg" role="status" data-testid="voice-msg">{v.askTenancy}</p>}
      {result?.kind === 'ask' && result.topic === 'note' && (
        <div className="stack-sm">
          <p className="voice-msg" role="status">{v.askNote}</p>
          <label className="ff">{v.noteLabel}<textarea rows={2} value={noteText} onChange={e => setNoteText(e.target.value)} /></label>
          <button className="btn secondary" disabled={!noteText.replace(/^[^:]*:\s*$/, '').trim()}
            onClick={() => { const c: Change = { key: 'notes', value: noteText.trim(), note: 'appended' }; setPicked({ notes: true }); setResult({ kind: 'update', changes: [c], unclear: [] }); }}>{v.addNote}</button>
        </div>
      )}

      {(result?.kind === 'create' || result?.kind === 'update') && (
        <div className="proposal stack-sm" data-testid="proposal">
          <strong>{result.kind === 'create' ? v.proposedNew : v.proposed}</strong>
          <ul className="prop-list">
            {result.changes.map(c => (
              <li key={c.key} className={picked[c.key] ? 'on' : ''}>
                <label className="prop-row">
                  <input type="checkbox" checked={!!picked[c.key]} onChange={e => setPicked(p => ({ ...p, [c.key]: e.target.checked }))} aria-label={`${v.use}: ${changeLabel(s, c.key)}`} />
                  <span className="prop-main">
                    <span className="prop-label">{changeLabel(s, c.key)}</span>
                    {result.kind === 'update' && c.key !== 'notes' && <span className="prop-before">{v.before}: {showValue(s, c.key, currentValue(listing, c.key), lang)}</span>}
                    <span className="prop-after">{result.kind === 'update' && c.key !== 'notes' ? `${v.after}: ` : ''}{showValue(s, c.key, c.value, lang)}</span>
                    {c.note && <small className="warn-text">{v[c.note]}</small>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {result.kind === 'create' && mode === 'central' && (
            <div className="stack-sm match-pickers">
              <PropertyMatchPicker lang={lang} ranked={ranked.props} value={propSel} onChange={setPropSel} />
              {ranked.contacts && <ContactMatchPicker lang={lang} ranked={ranked.contacts} all={people} value={contactSel} onChange={setContactSel} />}
            </div>
          )}
          {result.kind === 'create' && (() => {
            const said = new Set(result.changes.map(c => c.key));
            const missing = CREATE_EXPECTED.filter(k => !said.has(k) && !(k === 'township' && said.has('city'))).map(k => changeLabel(s, k));
            return <>
              {missing.length > 0 && <small className="muted">{v.notMentioned(missing.join(', '))}</small>}
              {result.unclear.includes('factory') && <small className="warn-text">{v.unclearFactory}</small>}
              <label className="check"><input type="checkbox" checked={keepWords} onChange={e => setKeepWords(e.target.checked)} /> {v.keepWords}</label>
            </>;
          })()}
          <div className="two">
            <button className="btn secondary" onClick={() => setResult(null)}>{s.cancel}</button>
            <button className="btn primary" disabled={!chosen(result).length}
              onClick={() => {
                const sel = chosen(result);
                if (result.kind === 'create') onCreate?.(keepWords ? [...sel, { key: 'notes', value: text.trim() }] : sel,
                  mode === 'central' ? { propertyId: propSel === NEW ? undefined : propSel, contactId: contactSel === NEW ? undefined : contactSel } : undefined);
                else { onApply?.(sel); setResult(null); setText(''); setMessage(v.applied(sel.length)); }
              }}>{result.kind === 'create' ? (mode === 'central' && propSel !== NEW ? k.openExisting : v.toForm) : v.apply}</button>
          </div>
        </div>
      )}
    </div>
  );
}
