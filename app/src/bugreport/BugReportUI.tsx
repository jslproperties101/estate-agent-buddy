// Easy Bug Report screen: 1 Screenshot, 2 Brief description, 3 Send. The result is shown plainly: "sent" only after the
// service accepted the report; any failure keeps the description and screenshot on screen so nothing has to be retyped.
import { useEffect, useRef, useState } from 'react';
import type { Lang } from '../i18n';
import { useApp } from '../data/useStore';
import { config } from '../config';
import { BUILD } from '../native/updates';
import { platform } from '../native/native';
import { bugStrings } from './strings';
import { BugFailure, MAX_DESCRIPTION, prepareScreenshot, sendBugReport } from './report';

export function BugReportScreen({ lang, from }: { lang: Lang; from: string }) {
  const { state } = useApp();
  const t = bugStrings[lang];
  const [desc, setDesc] = useState('');
  const [shot, setShot] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [fail, setFail] = useState<BugFailure | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!shot) { setPreview(null); return; }
    const url = URL.createObjectURL(shot);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [shot]);

  const choose = async (file?: File) => {
    if (!file) return;
    setFail(null);
    try { setShot(await prepareScreenshot(file)); } catch { setFail('badImage'); }
    if (input.current) input.current.value = '';
  };
  const send = async () => {
    setFail(null); setStatus('sending');
    const r = await sendBugReport(
      { description: desc, screenshot: shot ?? undefined, screen: from, language: lang, appVersion: BUILD.version, platform: platform() },
      config(state.settings), state.meta.syncSession,
    );
    if (r.ok) { setStatus('sent'); setDesc(''); setShot(null); } else { setStatus('idle'); setFail(r.reason); }
  };

  if (status === 'sent') {
    return (
      <section className="stack" data-testid="bug-report">
        <div className="card stack-sm" data-testid="bug-sent" role="status">
          <strong>{t.sent}</strong>
          <button className="btn secondary" onClick={() => setStatus('idle')}>{t.sentAgain}</button>
        </div>
      </section>
    );
  }
  return (
    <section className="stack" data-testid="bug-report">
      <div className="card stack-sm" data-testid="bug-intro">
        <p><strong>{t.intro}</strong></p>
        <ol className="bug-steps">{t.steps.map(x => <li key={x}>{x}</li>)}</ol>
        <p>{t.outro}</p>
      </div>
      <div className="card stack-sm">
        <div className="card-title">1 · {t.stepShot}</div>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden data-testid="bug-file" onChange={e => void choose(e.target.files?.[0])} />
        {shot && preview && <img className="bug-preview" src={preview} alt={t.shotAlt} data-testid="bug-preview" />}
        <div className="two">
          <button className="btn secondary" data-testid="bug-choose" onClick={() => input.current?.click()}>{shot ? t.changeShot : t.chooseShot}</button>
          {shot && <button className="btn secondary danger-text" data-testid="bug-remove" onClick={() => setShot(null)}>{t.removeShot}</button>}
        </div>
        <small className="muted">{t.shotPrivacy}</small>
      </div>
      <div className="card stack-sm">
        <div className="card-title">2 · {t.stepDesc}</div>
        <textarea data-testid="bug-desc" rows={5} maxLength={MAX_DESCRIPTION} value={desc} placeholder={t.descPlaceholder} aria-label={t.stepDesc} onChange={e => setDesc(e.target.value)} />
        <small className="muted">{t.left(MAX_DESCRIPTION - desc.length)}</small>
      </div>
      <div className="card stack-sm">
        <div className="card-title">3 · {t.stepSend}</div>
        <button className="btn primary" data-testid="bug-send" disabled={status === 'sending'} onClick={() => void send()}>{status === 'sending' ? t.sending : t.send}</button>
        {fail && <p className="warn-text" role="alert" data-testid="bug-fail" data-reason={fail}>{t.fail[fail]}</p>}
        <small className="muted">{t.shareNote}</small>
      </div>
    </section>
  );
}
