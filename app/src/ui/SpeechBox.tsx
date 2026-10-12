// Speak or type: the words appear in an editable box before anything is used. Shared by every voice feature.
import { memo, useEffect, useRef, useState } from 'react';
import { strings, Lang } from '../i18n';
import { VOICE_LANGS, VoiceError, listen, Listening, speechSupported } from '../voice/recognizer';

// The notice about the speech service is shown once each time the app is opened.
let acceptedThisSession = false;

/** Memoised: typing elsewhere in a big form (which redraws the form) does not redraw the speech box. */
export const SpeechBox = memo(function SpeechBox({ lang, value, onChange, label, rows = 3, testId }: {
  lang: Lang; value: string; onChange: (text: string) => void; label: string; rows?: number; testId?: string;
}) {
  const v = strings[lang].voice;
  const [voiceLang, setVoiceLang] = useState(lang === 'bm' ? 'ms-MY' : lang === 'zh' ? 'zh-CN' : 'en-MY');
  const [listening, setListening] = useState(false);
  // After End recording, until the phone's speech service has returned the words (or said it could not).
  const [processing, setProcessing] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<VoiceError | null>(null);
  const [asking, setAsking] = useState(false);
  const live = useRef<Listening | null>(null);
  const textRef = useRef(value);
  textRef.current = value;
  useEffect(() => () => live.current?.abort(), []);

  function start(force = false) {
    setError(null);
    if (!speechSupported()) { setError('unsupported'); return; }
    if (!acceptedThisSession && !force) { setAsking(true); return; }
    setListening(true);
    setProcessing(false);
    live.current = listen(voiceLang, {
      interim: x => setInterim(x),
      final: x => onChange((textRef.current ? textRef.current + ' ' : '') + x),
      error: code => { if (code !== 'aborted') setError(code); },
      end: () => { setListening(false); setProcessing(false); setInterim(''); live.current = null; },
    });
    if (!live.current) setListening(false);
  }
  function stop() {
    setProcessing(true);
    live.current?.stop();
  }

  return (
    <div className="stack-sm speech" data-testid={testId}>
      <div className="chip-row" role="group" aria-label={strings[lang].langSwitch}>
        {VOICE_LANGS.map(l => (
          <button key={l.code} type="button" className="chip-btn" aria-pressed={voiceLang === l.code} onClick={() => setVoiceLang(l.code)}>{l.label}</button>
        ))}
      </div>
      {voiceLang === 'zh-CN' && <small className="muted">{v.zhNote}</small>}
      {asking && (
        <div className="ask" role="dialog" aria-labelledby="sp-t">
          <strong id="sp-t">{v.noticeTitle}</strong>
          <p>{v.notice}</p>
          <small className="sens">{v.safety}</small>
          <div className="two">
            <button type="button" className="btn secondary" onClick={() => setAsking(false)}>{v.noticeNo}</button>
            <button type="button" className="btn primary" onClick={() => { acceptedThisSession = true; setAsking(false); start(true); }}>{v.noticeOk}</button>
          </div>
        </div>
      )}
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
