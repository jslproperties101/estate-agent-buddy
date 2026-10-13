// Voice diagnostics screen: why voice recognition may be unavailable or failing on this phone, with what to do about it,
// a "Test recognition" button that really listens, and a details text to send with a bug report.
import { useEffect, useRef, useState } from 'react';
import type { Lang } from '../i18n';
import type { Go } from '../nav';
import { diagnose, probeVoice, reportText, VoiceProbe } from './diagnostics';
import { diagMessage, diagStrings } from './diagStrings';
import { listen, Listening, VOICE_LANGS, VoiceError } from './recognizer';
import { strings } from '../i18n';
import { isNative } from '../native/native';

const ICON: Record<string, string> = { ok: '✓', warn: '!', bad: '✕', info: '?' };

export function VoiceDiagnostics({ lang, go }: { lang: Lang; go: Go }) {
  const t = diagStrings[lang];
  const [probe, setProbe] = useState<VoiceProbe | null>(null);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState('');
  const [testErr, setTestErr] = useState<VoiceError | null>(null);
  const [tested, setTested] = useState<'none' | 'heard' | 'silent'>('none');
  const [copied, setCopied] = useState('');
  const [voiceLang, setVoiceLang] = useState(lang === 'bm' ? 'ms-MY' : lang === 'zh' ? 'zh-CN' : 'en-MY');
  const live = useRef<Listening | null>(null);
  const got = useRef(false);

  const run = () => { void probeVoice().then(setProbe); };
  useEffect(() => { run(); return () => live.current?.abort(); }, []);

  function test() {
    setHeard(''); setTestErr(null); setTested('none'); got.current = false;
    setListening(true);
    live.current = listen(voiceLang, {
      interim: x => { if (x) setHeard(x); },
      final: x => { got.current = true; setHeard(x); },
      error: code => { if (code !== 'aborted') setTestErr(code); },
      end: () => { setListening(false); live.current = null; setTested(got.current ? 'heard' : 'silent'); run(); },
    }, 8000);
    if (!live.current) { setListening(false); setTimeout(run, 0); }
  }

  const d = probe ? diagnose(probe) : null;
  const report = probe && d ? reportText(probe, d) : '';
  async function copy() {
    try { await navigator.clipboard.writeText(report); setCopied(t.copied); } catch { setCopied(t.copyFail); }
  }

  return (
    <section className="stack" data-testid="voice-diag">
      <p className="notice">{t.intro}</p>
      {!isNative() && <small className="muted" data-testid="voice-diag-sim">{t.sim}</small>}
      {!d && <p role="status">…</p>}
      {d && (
        <>
          <div className="card stack-sm" data-testid="voice-diag-verdict" data-verdict={d.verdict}>
            <strong>{t.verdict[d.verdict]}</strong>
            <small className="muted">{t.verdictNote[d.verdict]}</small>
          </div>
          <div className="card stack-sm" data-testid="voice-diag-checks">
            {d.checks.map(c => {
              const m = diagMessage(lang, c);
              return (
                <div key={`${c.id}-${c.code}`} className="diag-row" data-testid={`diag-${c.id}`} data-status={c.status} data-code={c.code}>
                  <span className={`diag-${c.status === 'ok' ? 'ok' : c.status === 'bad' ? 'bad' : 'warn'}`} aria-label={t.status[c.status]}>{ICON[c.status]}</span>
                  <span><strong>{m.t}</strong>{m.fix && <><br /><small className="muted">{m.fix}</small></>}</span>
                </div>
              );
            })}
          </div>
        </>
      )}

      <div className="card stack-sm" data-testid="voice-diag-test">
        <div className="chip-row" role="group" aria-label={strings[lang].langSwitch}>
          {VOICE_LANGS.map(l => <button key={l.code} type="button" className="chip-btn" aria-pressed={voiceLang === l.code} onClick={() => setVoiceLang(l.code)}>{l.label}</button>)}
        </div>
        <small className="muted">{t.testHelp}</small>
        {listening
          ? <button type="button" className="mic on" onClick={() => live.current?.stop()} data-testid="voice-diag-stop"><span className="dot" aria-hidden="true" /> {t.testing} · {t.stop}</button>
          : <button type="button" className="mic" onClick={test} data-testid="voice-diag-start">🎙 {t.test}</button>}
        {(heard || tested !== 'none') && <p data-testid="voice-diag-heard">{t.heard}: {heard ? `“${heard}”` : '—'}</p>}
        {tested === 'heard' && <p className="ok-text" role="status" data-testid="voice-diag-ok">{t.testOk}</p>}
        {tested === 'silent' && !testErr && <p className="warn-text" role="status" data-testid="voice-diag-silent">{t.testNone}</p>}
        {testErr && <p className="error" role="alert" data-testid="voice-diag-error">{diagMessage(lang, { id: 'last', status: 'bad', code: `err_${testErr}` }).t} {diagMessage(lang, { id: 'last', status: 'bad', code: `err_${testErr}` }).fix ?? ''}</p>}
      </div>

      <div className="card stack-sm">
        <strong>{t.next}</strong>
        <ol className="small">{t.steps.map(x => <li key={x}>{x}</li>)}</ol>
        <small className="muted">{t.typed}</small>
      </div>

      {report && (
        <details className="card">
          <summary>{t.details}</summary>
          <pre className="small wrap" data-testid="voice-diag-report" style={{ whiteSpace: 'pre-wrap' }}>{report}</pre>
          <button type="button" className="btn small secondary" onClick={() => void copy()} data-testid="voice-diag-copy">{t.copy}</button>
          {copied && <small role="status"> {copied}</small>}
        </details>
      )}
      <div className="two">
        <button type="button" className="btn secondary" onClick={run} data-testid="voice-diag-again">{t.again}</button>
        <button type="button" className="btn secondary" onClick={() => go({ name: 'voice' }, { replace: true })}>{t.back}</button>
      </div>
    </section>
  );
}
