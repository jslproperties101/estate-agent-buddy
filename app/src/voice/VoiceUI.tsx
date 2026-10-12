// Voice screens (Version 1J prototype): speak → editable text → review, and voice notes with attach-to.
import { useEffect, useRef, useState } from 'react';
import { strings } from '../i18n';
import { VOICE_LANGS, VoiceError, listen, Listening, speechSupported } from './recognizer';
import { decideAttachment, Attach, Fix, Place } from './attach';

type T = typeof strings.en;

export function VoicePanel({ t, onReview, onSaveNote }: { t: T; onReview: (text: string, lang: string) => void; onSaveNote: (text: string) => void }) {
  const v = t.voice;
  const [lang, setLang] = useState(VOICE_LANGS[0].code);
  const [text, setText] = useState('');
  const [interim, setInterim] = useState('');
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<VoiceError | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [asking, setAsking] = useState(false);
  const live = useRef<Listening | null>(null);
  const supported = speechSupported();

  useEffect(() => () => live.current?.abort(), []);

  function start(justAccepted = false) {
    setError(null);
    if (!supported) { setError('unsupported'); return; }
    if (!accepted && !justAccepted) { setAsking(true); return; }
    setListening(true);
    live.current = listen(lang, {
      interim: s => setInterim(s),
      final: s => setText(prev => (prev ? prev + ' ' : '') + s),
      error: code => { if (code !== 'aborted') setError(code); },
      end: () => { setListening(false); setInterim(''); live.current = null; },
    });
    if (!live.current) setListening(false);
  }
  function stop() { live.current?.stop(); }

  return (
    <div className="card stack-sm voice" data-testid="voice-panel">
      <div className="card-title">{v.title}</div>
      <small className="muted">{v.sub}</small>
      <small className="sens">{v.safety}</small>
      <div className="lang-row" role="group" aria-label={t.langSwitch}>
        {VOICE_LANGS.map(l => (
          <button key={l.code} className="chip-btn" aria-pressed={lang === l.code} onClick={() => setLang(l.code)}>{l.label}</button>
        ))}
      </div>
      <small className="muted">{v.langNote}</small>
      {typeof navigator !== 'undefined' && navigator.onLine === false && <small className="warn-text">{v.offline}</small>}

      {asking && (
        <div className="ask" role="dialog" aria-labelledby="vn-t">
          <strong id="vn-t">{v.noticeTitle}</strong>
          <p>{v.notice}</p>
          <div className="two">
            <button className="btn secondary" onClick={() => setAsking(false)}>{v.noticeNo}</button>
            <button className="btn primary" onClick={() => { setAccepted(true); setAsking(false); start(true); }}>{v.noticeOk}</button>
          </div>
        </div>
      )}

      {!asking && (
        listening
          ? <button className="mic on" onClick={stop} aria-live="polite"><span className="dot" aria-hidden="true" /> {v.stop}</button>
          : <button className="mic" onClick={() => start()}>{v.mic}</button>
      )}
      {error && <p className="error" role="alert" data-testid="voice-error">{v.errors[error]}</p>}

      <label htmlFor="voice-text" className="small muted">{v.textLabel}</label>
      <textarea id="voice-text" rows={4} value={text + (interim ? (text ? ' ' : '') + interim : '')}
        onChange={e => { setText(e.target.value); setInterim(''); }} />
      <small className="muted">{v.keyboardTip}</small>
      <div className="two">
        <button className="btn secondary" disabled={listening || !text} onClick={() => { setText(''); setError(null); }}>{v.clear}</button>
        <button className="btn secondary" disabled={listening} onClick={() => { setText(''); setError(null); start(); }}>{v.retry}</button>
      </div>
      <div className="two">
        <button className="btn secondary" disabled={listening || !text.trim()} onClick={() => onSaveNote(text.trim())}>{v.saveNote}</button>
        <button className="btn primary" disabled={listening || !text.trim()} onClick={() => onReview(text.trim(), lang)}>{v.review}</button>
      </div>
    </div>
  );
}

export interface VoiceNote { id: string; text: string; attachedTo: string | null; at?: Fix; created: number }

export function VoiceNoteAttach({ t, text: initial, places, onSave }: {
  t: T; text: string; places: Place[]; onSave: (n: { text: string; attachedTo: string | null; at?: Fix }) => void;
}) {
  const v = t.voice;
  const [text, setText] = useState(initial);
  const [fix, setFix] = useState<Fix | null>(null);
  const [locating, setLocating] = useState(false);
  const [geoErr, setGeoErr] = useState<string | null>(null);
  const [decision, setDecision] = useState<Attach>(decideAttachment(null, places));
  const [choice, setChoice] = useState<string | null>(null);   // place id, 'here', 'none'

  function locate() {
    setGeoErr(null);
    if (!('geolocation' in navigator)) { setGeoErr('unsupported'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      p => {
        const f = { lat: p.coords.latitude, lon: p.coords.longitude, accuracy: Math.round(p.coords.accuracy) };
        setFix(f); setLocating(false);
        const d = decideAttachment(f, places);
        setDecision(d);
        setChoice(d.kind === 'property' ? d.place.id : null);
      },
      e => { setLocating(false); setGeoErr(e.code === 1 ? 'denied' : e.code === 3 ? 'timeout' : 'unavailable'); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
    );
  }

  const label = (id: string | null) => id === 'here' && fix ? v.atLocation(fix.lat.toFixed(5), fix.lon.toFixed(5), fix.accuracy)
    : id === 'none' || !id ? v.unattached : places.find(p => p.id === id)?.name ?? '';

  return (
    <section className="stack">
      <div className="card stack-sm">
        <label htmlFor="vn-text" className="card-title">{v.noteTitle}</label>
        <textarea id="vn-text" rows={4} value={text} onChange={e => setText(e.target.value)} />
      </div>
      <div className="card stack-sm" data-testid="attach">
        <div className="card-title">{v.attachTitle}</div>
        <button className="btn secondary" onClick={locate} disabled={locating}>{locating ? v.locating : v.useLocation}</button>
        {geoErr && <p className="error" role="alert">{v.geoErrors[geoErr]}</p>}
        {decision.kind === 'property' && (
          <p className="ok-text" data-testid="auto-attach">{v.near(decision.place.name, decision.distance)}</p>
        )}
        {decision.kind === 'ask' && fix && <p className="warn-text" data-testid="attach-reason">{v.reasons[decision.reason]}</p>}
        <div className="stack-sm" role="radiogroup" aria-label={v.attachTitle}>
          {places.map(p => {
            const near = decision.kind === 'ask' ? decision.near.find(n => n.place.id === p.id) : decision.kind === 'property' && decision.place.id === p.id ? { distance: decision.distance } : undefined;
            return (
              <button key={p.id} role="radio" aria-checked={choice === p.id} className={`cand ${choice === p.id ? 'picked' : ''}`} onClick={() => setChoice(p.id)}>
                <strong>{p.name}</strong>{near && <small>{near.distance} m</small>}
              </button>
            );
          })}
          {fix && <button role="radio" aria-checked={choice === 'here'} className={`cand ${choice === 'here' ? 'picked' : ''}`} onClick={() => setChoice('here')}>{v.atLocation(fix.lat.toFixed(5), fix.lon.toFixed(5), fix.accuracy)}</button>}
          <button role="radio" aria-checked={choice === 'none'} className={`cand ${choice === 'none' ? 'picked' : ''}`} onClick={() => setChoice('none')}>{v.noPlace}</button>
        </div>
      </div>
      <div className="save-bar">
        <p className="small">{choice ? v.attachedTo(label(choice)) : v.reasons['no-fix']}</p>
        <button className="btn primary" disabled={!choice || !text.trim()}
          onClick={() => onSave({ text: text.trim(), attachedTo: choice === 'none' ? null : label(choice), at: choice === 'here' && fix ? fix : undefined })}>
          {v.saveAttached}
        </button>
      </div>
    </section>
  );
}
