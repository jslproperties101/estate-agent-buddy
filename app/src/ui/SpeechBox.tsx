// Speak or type: the words appear in an editable box before anything is used. Shared by every voice feature.
import { memo, useEffect, useRef, useState } from 'react';
import { strings, Lang } from '../i18n';
import { VOICE_LANGS, VoiceError, listen, Listening, speechSupported, prepareVoice } from '../voice/recognizer';
import { c048Strings } from '../voice/c048Strings';
import { IconMic } from '../icons';
import type { ReactNode } from 'react';

// The notice about the speech service is shown once each time the app is opened.
let acceptedThisSession = false;

/** Memoised: typing elsewhere in a big form (which redraws the form) does not redraw the speech box. */
export const SpeechBox = memo(function SpeechBox({ lang, value, onChange, label, rows = 3, testId, compact, action, transform, between, after, stopSignal, warmUp }: {
  lang: Lang; value: string; onChange: (text: string) => void; label: string; rows?: number; testId?: string;
  /** JoyChange003 Changes 56 / 59: buttons in the centred row under the full-width box: mic, `between` (Clear), `after` (AI Process). */
  between?: ReactNode; after?: ReactNode;
  /** Change 59: a new number stops any recording at once (Clear). */
  stopSignal?: number;
  /** Change 55: get the phone's recogniser ready when the screen opens, so the first tap listens at once. */
  warmUp?: boolean;
  /** JoyChange002 Change 48: just the typing box (with `action` beside it, e.g. a send arrow) and a round voice button
   *  below it. The speech language follows the app language; while listening the button pulses red with no text. */
  compact?: boolean; action?: ReactNode;
  /** Change 49: applied to what the phone heard before it goes into the box (property-word corrections). */
  transform?: (heard: string) => string;
}) {
  const v = strings[lang].voice;
  const [voiceLang, setVoiceLang] = useState(lang === 'bm' ? 'ms-MY' : lang === 'zh' ? 'zh-CN' : 'en-MY');
  const [listening, setListening] = useState(false);
  // Change 55: between the tap and the moment the phone really listens ("Getting ready…"); "Listening…" only after that.
  const [ready, setReady] = useState(false);
  // After End recording, until the phone's speech service has returned the words (or said it could not).
  const [processing, setProcessing] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<VoiceError | null>(null);
  const [asking, setAsking] = useState(false);
  const live = useRef<Listening | null>(null);
  const textRef = useRef(value);
  textRef.current = value;
  useEffect(() => () => live.current?.abort(), []);
  useEffect(() => { if (warmUp) void prepareVoice(); }, [warmUp]);
  useEffect(() => { if (stopSignal) { live.current?.abort(); live.current = null; setListening(false); setProcessing(false); setReady(false); setInterim(''); setError(null); } }, [stopSignal]);

  function start(force = false) {
    setError(null);
    if (!speechSupported()) { setError('unsupported'); return; }
    if (!acceptedThisSession && !force) { setAsking(true); return; }
    setListening(true);
    setProcessing(false);
    setReady(false);
    live.current = listen(voiceLang, {
      ready: () => setReady(true),
      interim: x => { if (x) setReady(true); setInterim(x); },
      final: x => onChange((textRef.current ? textRef.current + ' ' : '') + (transform ? transform(x) : x)),
      error: code => { if (code !== 'aborted') setError(code); },
      end: () => { setListening(false); setProcessing(false); setReady(false); setInterim(''); live.current = null; },
    });
    if (!live.current) setListening(false);
  }
  function stop() {
    setProcessing(true);
    live.current?.stop();
  }

  const notice = asking && (
    <div className="ask" role="dialog" aria-labelledby="sp-t">
      <strong id="sp-t">{v.noticeTitle}</strong>
      <p>{v.notice}</p>
      <small className="sens">{v.safety}</small>
      <div className="two">
        <button type="button" className="btn secondary" onClick={() => setAsking(false)}>{v.noticeNo}</button>
        <button type="button" className="btn primary" onClick={() => { acceptedThisSession = true; setAsking(false); start(true); }}>{v.noticeOk}</button>
      </div>
    </div>
  );
  if (compact) {
    const k = c048Strings[lang];
    const row = between !== undefined || after !== undefined;
    const mic = !asking && (
      <button type="button" className={`mic-round ${listening ? 'on' : ''} ${listening && !ready ? 'starting' : ''} ${processing ? 'busy' : ''}`} disabled={processing} aria-busy={processing || undefined}
        aria-label={processing ? k.working : listening ? (ready ? k.listening : k.gettingReady) : k.speak} title={processing ? k.working : listening ? (ready ? k.listening : k.gettingReady) : k.speak}
        data-testid={processing ? 'voice-processing' : listening ? 'voice-stop' : 'voice-start'} data-ready={listening ? String(ready) : undefined} onClick={() => (listening ? stop() : start())}>
        {processing ? <span className="spinner" aria-hidden="true" /> : <IconMic size={30} />}
      </button>
    );
    return (
      <div className="stack-sm speech compact" data-testid={testId}>
        <div className={row ? 'cmd-input full' : 'cmd-input'}>
          <textarea aria-label={label} rows={rows} value={value + (interim ? (value ? ' ' : '') + interim : '')} onChange={e => { onChange(e.target.value); setInterim(''); }} />
          {!row && action}
        </div>
        {notice}
        {row ? <div className="cmd-row" data-testid="cmd-row">{mic || null}{between}{after}</div> : mic}
        {(listening || processing) && (
          <p className={`voice-status ${listening && ready ? 'live' : ''}`} role="status" data-testid="voice-status" data-state={processing ? 'working' : ready ? 'listening' : 'starting'}>
            {processing ? k.working : ready ? k.listening : k.gettingReady}
          </p>
        )}
        {typeof navigator !== 'undefined' && navigator.onLine === false && <small className="warn-text">{v.offline}</small>}
        {error && <p className="error" role="alert" data-testid="voice-error">{v.errors[error]}</p>}
      </div>
    );
  }
  return (
    <div className="stack-sm speech" data-testid={testId}>
      <div className="chip-row" role="group" aria-label={strings[lang].langSwitch}>
        {VOICE_LANGS.map(l => (
          <button key={l.code} type="button" className="chip-btn" aria-pressed={voiceLang === l.code} onClick={() => setVoiceLang(l.code)}>{l.label}</button>
        ))}
      </div>
      {voiceLang === 'zh-CN' && <small className="muted">{v.zhNote}</small>}
      {notice}
      {!asking && (processing
        ? <button type="button" className="mic busy" disabled aria-busy="true" data-testid="voice-processing"><span className="spinner" aria-hidden="true" /> {v.processing}</button>
        : listening
          ? <button type="button" className="mic on" onClick={stop} data-testid="voice-stop"><span className="dot" aria-hidden="true" /> {v.stop}</button>
          : <button type="button" className="mic" onClick={() => start()} data-testid="voice-start">🎙 {v.mic}</button>)}
      {typeof navigator !== 'undefined' && navigator.onLine === false && <small className="warn-text">{v.offline}</small>}
      {error && <p className="error" role="alert" data-testid="voice-error">{v.errors[error]}</p>}
      <label className="ff">{label}
        <textarea rows={rows} value={value + (interim ? (value ? ' ' : '') + interim : '')} onChange={e => { onChange(e.target.value); setInterim(''); }} />
      </label>
    </div>
  );
});
