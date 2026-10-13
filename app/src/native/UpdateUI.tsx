// The update notice at the top of the app and the About card in Settings (see native/updates.ts).
import { useCallback, useEffect, useState } from 'react';
import { Lang, strings } from '../i18n';
import { BUILD, UpdateState, checkForUpdate, restartIntoUpdate, appReady, installedNativeVersion } from './updates';
import { isNative, openInBrowser, plugin } from './native';

const SIX_HOURS = 6 * 3600_000;

/** Checks a few seconds after start, when the app comes back to the front, and every six hours. */
export function UpdateBanner({ lang }: { lang: Lang }) {
  const u = strings[lang].update;
  const [st, setSt] = useState<UpdateState>({ kind: 'none' });
  const [hidden, setHidden] = useState(false);
  const run = useCallback(async () => { const r = await checkForUpdate(); if (r.kind !== 'error') setSt(r); }, []);
  useEffect(() => {
    void appReady(); // this version started properly: no rollback
    const first = setTimeout(() => void run(), 4000);
    const every = setInterval(() => void run(), SIX_HOURS);
    let l: { remove: () => unknown } | null = null;
    void Promise.resolve(plugin('App')?.addListener('resume', () => void run())).then(x => { l = x ?? null; }).catch(() => {});
    return () => { clearTimeout(first); clearInterval(every); void l?.remove(); };
  }, [run]);
  if (hidden || st.kind === 'none' || st.kind === 'error') return null;
  return (
    <div className="update-bar" role="status" data-testid="update-bar" data-kind={st.kind}>
      <span>{st.kind === 'bundle-ready' ? u.ready : st.kind === 'web-reload' ? u.web : u.apk}</span>
      <div className="row-wrap">
        {st.kind === 'bundle-ready' && <button className="btn small primary" onClick={() => void restartIntoUpdate(st.id)}>{u.restart}</button>}
        {st.kind === 'web-reload' && <button className="btn small primary" onClick={() => window.location.reload()}>{u.reload}</button>}
        {st.kind === 'apk-needed' && <button className="btn small primary" onClick={() => void openInBrowser(st.latest.apk)}>{u.download}</button>}
        <button className="btn small secondary" onClick={() => setHidden(true)}>{u.later}</button>
      </div>
    </div>
  );
}

export function AboutCard({ lang }: { lang: Lang }) {
  const u = strings[lang].update;
  const [native, setNative] = useState(BUILD.nativeVersion);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [st, setSt] = useState<UpdateState>({ kind: 'none' });
  useEffect(() => { void installedNativeVersion().then(setNative); }, []);
  return (
    <div className="card stack-sm" data-testid="about">
      <div className="card-title">{u.about}</div>
      <small className="muted" data-testid="about-version">{u.version(BUILD.version, BUILD.sha, isNative() ? native : BUILD.nativeVersion)}{BUILD.qa ? ' · QA' : ''}</small>
      {BUILD.qa && <small role="status" data-testid="about-qa">{u.qaOff(BUILD.sha)}</small>}
      <button className="btn secondary" disabled={busy || !!BUILD.qa} data-testid="check-update" onClick={async () => {
        setBusy(true); setMsg('');
        const r = await checkForUpdate();
        setSt(r);
        setMsg(r.kind === 'none' ? u.upToDate : r.kind === 'error' ? u.failed(r.message) : r.kind === 'bundle-ready' ? u.ready : r.kind === 'web-reload' ? u.web : u.apk);
        setBusy(false);
      }}>{busy ? u.checking : u.check}</button>
      {msg && <small role="status" data-testid="update-msg">{msg}</small>}
      {st.kind === 'bundle-ready' && <button className="btn primary" onClick={() => void restartIntoUpdate(st.id)}>{u.restart}</button>}
      {st.kind === 'apk-needed' && <button className="btn primary" onClick={() => void openInBrowser(st.latest.apk)}>{u.download}</button>}
      {st.kind === 'web-reload' && <button className="btn primary" onClick={() => window.location.reload()}>{u.reload}</button>}
      <details><summary className="small">{u.howTitle}</summary><small className="muted">{u.how}</small></details>
    </div>
  );
}
