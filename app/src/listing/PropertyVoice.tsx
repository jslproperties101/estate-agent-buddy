// Voice / text commands for properties (Version 1L). Speech → editable text → proposed changes → review → save.
// Understanding runs on the phone with simple rules (commands.ts). Nothing is saved until the agent reviews it.
import { useEffect, useRef, useState } from 'react';
import { Lang, strings } from '../i18n';
import { VOICE_LANGS, VoiceError, listen, Listening, speechSupported } from '../voice/recognizer';
import { listingStrings, ListingStrings } from './strings';
import { parseCommand, Change, ChangeKey, Command, currentValue } from './commands';
import { Listing, rm, landText, sqft } from './model';

export type VoiceMode = 'list' | 'record' | 'central';

export const SAMPLE_COMMANDS: Record<VoiceMode, string[]> = {
  list: [
    'Create a new semi-detached factory in Salak Tinggi, land area 20,000 square feet, built-up 12,000 square feet, asking price RM3.2 million, leasehold.',
    'Create a new terrace house in Nilai for rent, rental RM1,800 per month, three bedrooms, two bathrooms.',
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
  ],
};

export const monthText = (ym?: string) => {
  if (!ym) return '';
  const [y, m] = ym.split('-').map(Number);
  return m ? new Date(y, m - 1, 1).toLocaleString('en-GB', { month: 'short', year: 'numeric' }) : ym;
};

const LABEL_KEY: Partial<Record<ChangeKey, string>> = { 'tenancy.tenant': 'tenant', 'tenancy.rent': 'tRent', 'tenancy.start': 'tStart', 'tenancy.end': 'tEnd' };
export const changeLabel = (s: ListingStrings, k: ChangeKey) => s.l[LABEL_KEY[k] ?? k] ?? k;

export function showValue(s: ListingStrings, k: ChangeKey, v: unknown): string {
  if (v === undefined || v === null || v === '') return '—';
  switch (k) {
    case 'askingPrice': case 'monthlyRent': case 'tenancy.rent': return rm(Number(v));
    case 'landSqft': return landText(Number(v));
    case 'builtUpSqft': return sqft(Number(v));
    case 'tenure': return s.tenure[String(v)] ?? String(v);
    case 'purpose': return s.purpose[String(v)] ?? String(v);
    case 'status': return s.status[String(v)] ?? String(v);
    case 'tenancy.start': case 'tenancy.end': return monthText(String(v));
    default: return String(v);
  }
}

/** Fields an agent usually states for a new property; the ones not said are listed so nothing looks invented. */
const CREATE_EXPECTED: ChangeKey[] = ['type', 'area', 'landSqft', 'builtUpSqft', 'askingPrice', 'tenure'];

export function PropertyVoice({ lang, mode, listing, onCreate, onFind, onApply, laterStage }: {
  lang: Lang; mode: VoiceMode; listing?: Listing;
  onCreate?: (changes: Change[]) => void;
  onFind?: (c: Extract<Command, { kind: 'find' }>) => number;
  onApply?: (changes: Change[]) => void;
  laterStage?: (text: string) => string | null;
}) {
  const s = listingStrings[lang];
  const v = s.voice;
  const tv = strings[lang].voice;
  const [text, setText] = useState('');
  const [interim, setInterim] = useState('');
  const [voiceLang, setVoiceLang] = useState(VOICE_LANGS[0].code);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<VoiceError | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [asking, setAsking] = useState(false);
  const [result, setResult] = useState<Command | null>(null);
  const [message, setMessage] = useState('');
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [noteText, setNoteText] = useState('');
  const live = useRef<Listening | null>(null);
  useEffect(() => () => live.current?.abort(), []);

  function start(justAccepted = false) {
    setError(null);
    if (!speechSupported()) { setError('unsupported'); return; }
    if (!accepted && !justAccepted) { setAsking(true); return; }
    setListening(true);
    live.current = listen(voiceLang, {
      interim: x => setInterim(x),
      final: x => setText(prev => (prev ? prev + ' ' : '') + x),
      error: code => { if (code !== 'aborted') setError(code); },
      end: () => { setListening(false); setInterim(''); live.current = null; },
    });
    if (!live.current) setListening(false);
  }

  function interpret(cmdText = text) {
    setMessage(''); setResult(null);
    const later = laterStage?.(cmdText);
    if (later) { setMessage(later); return; }
    const r = parseCommand(cmdText, mode === 'record' ? listing : undefined);
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
    setResult(r);
  }

  const chosen = (r: Command) => (r.kind === 'create' || r.kind === 'update' ? r.changes.filter(c => picked[c.key]) : []);

  return (
    <div className="card stack-sm voice-cmd" data-testid="voice-cmd">
      <div className="card-title">{v.title}</div>
      <small className="muted">{mode === 'record' ? v.recordHint : v.listHint}</small>
      <small className="engine-note">{v.engine}</small>
      <div className="lang-row" role="group" aria-label={strings[lang].langSwitch}>
        {VOICE_LANGS.map(l => (
          <button key={l.code} className="chip-btn" aria-pressed={voiceLang === l.code} onClick={() => setVoiceLang(l.code)}>{l.label}</button>
        ))}
      </div>
      {asking && (
        <div className="ask" role="dialog" aria-labelledby="pv-t">
          <strong id="pv-t">{tv.noticeTitle}</strong>
          <p>{tv.notice}</p>
          <div className="two">
            <button className="btn secondary" onClick={() => setAsking(false)}>{tv.noticeNo}</button>
            <button className="btn primary" onClick={() => { setAccepted(true); setAsking(false); start(true); }}>{tv.noticeOk}</button>
          </div>
        </div>
      )}
      {!asking && (listening
        ? <button className="mic on" onClick={() => live.current?.stop()}><span className="dot" aria-hidden="true" /> {tv.stop}</button>
        : <button className="mic" onClick={() => start()}>{tv.mic}</button>)}
      {error && <p className="error" role="alert">{tv.errors[error]}</p>}

      <label className="ff">{v.textLabel}
        <textarea aria-label={v.textLabel} rows={3} value={text + (interim ? (text ? ' ' : '') + interim : '')}
          onChange={e => { setText(e.target.value); setInterim(''); setResult(null); setMessage(''); }} />
      </label>
      <button className="btn primary" disabled={listening || !text.trim()} onClick={() => interpret()}>{v.interpret}</button>

      <details className="examples">
        <summary>{v.examples}</summary>
        <div className="stack-sm">
          {SAMPLE_COMMANDS[mode].map(c => (
            <button key={c} className="example" onClick={() => { setText(c); interpret(c); }}>
              <span className="badge sample-badge">{v.simulated}</span> “{c}”
            </button>
          ))}
        </div>
      </details>

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
                    {result.kind === 'update' && c.key !== 'notes' && <span className="prop-before">{v.before}: {showValue(s, c.key, currentValue(listing, c.key))}</span>}
                    <span className="prop-after">{result.kind === 'update' && c.key !== 'notes' ? `${v.after}: ` : ''}{showValue(s, c.key, c.value)}</span>
                    {c.note && <small className="warn-text">{v[c.note]}</small>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {result.kind === 'create' && (() => {
            const missing = CREATE_EXPECTED.filter(k => !result.changes.some(c => c.key === k)).map(k => changeLabel(s, k));
            return <>
              {missing.length > 0 && <small className="muted">{v.notMentioned(missing.join(', '))}</small>}
              {result.unclear.includes('factory') && <small className="warn-text">{v.unclearFactory}</small>}
            </>;
          })()}
          <div className="two">
            <button className="btn secondary" onClick={() => setResult(null)}>{s.cancel}</button>
            <button className="btn primary" disabled={!chosen(result).length}
              onClick={() => {
                const sel = chosen(result);
                if (result.kind === 'create') onCreate?.(sel);
                else { onApply?.(sel); setResult(null); setText(''); setMessage(v.applied(sel.length)); }
              }}>{result.kind === 'create' ? v.toForm : v.apply}</button>
          </div>
        </div>
      )}
    </div>
  );
}
