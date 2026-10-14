// "Connection settings" on the sign-in screen: the way back in when a Supabase URL or key typed in Settings stops
// sign-in from working (Settings itself is only reachable after signing in). It can remove the typed URL and key, so
// the app's built-in project is used again, or correct them. It changes only those two settings: records, files,
// drafts and the remembered team on this phone are left exactly as they are. The key is never shown.
import { useState } from 'react';
import { Lang } from '../i18n';
import { useApp } from '../data/useStore';
import { config, builtInSupabase, projectHost, supabaseInputProblem } from '../config';
import { Confirm } from '../ui/common';
import { authStrings } from './strings';
import { profileStrings } from '../profile/strings';

export function ConnectionRecovery({ lang, startOpen = false }: { lang: Lang; startOpen?: boolean }) {
  const { state, store } = useApp();
  const r = authStrings[lang].rec;
  const s = state.settings;
  const cfg = config(s);
  const typed = cfg.source.supabaseUrl === 'phone' || cfg.source.supabaseAnonKey === 'phone';
  const [open, setOpen] = useState(startOpen);
  const [editing, setEditing] = useState(false);
  const [ask, setAsk] = useState(false);
  const [form, setForm] = useState({ url: s.supabaseUrl ?? '', key: s.supabaseAnonKey ?? '' });
  const [problem, setProblem] = useState<'url' | 'pair' | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  if (!open) {
    return (
      <button className="btn secondary" data-testid="login-connection" onClick={() => setOpen(true)}>{r.open}</button>
    );
  }

  function reset() {
    setAsk(false);
    store.setSingleton('settings', { supabaseUrl: undefined, supabaseAnonKey: undefined });
    store.setSingleton('meta', { syncError: undefined });
    setForm({ url: '', key: '' }); setEditing(false); setProblem(null); setMsg(r.resetDone);
  }

  function save() {
    const p = supabaseInputProblem(form.url, form.key);
    setProblem(p);
    if (p) return;
    store.setSingleton('settings', { supabaseUrl: form.url.trim() || undefined, supabaseAnonKey: form.key.trim() || undefined });
    store.setSingleton('meta', { syncError: undefined });
    setEditing(false); setMsg(r.saved);
  }

  return (
    <div className="card stack-sm" data-testid="connection-recovery" data-source={typed ? 'phone' : cfg.supabaseUrl ? 'build' : 'none'}>
      <div className="card-title">{r.open}</div>
      <small className="muted">{r.help}</small>
      {cfg.supabaseUrl && (
        <p data-testid="connection-project">{typed ? r.usingPhone(projectHost(cfg.supabaseUrl)) : r.usingBuild(projectHost(cfg.supabaseUrl))}</p>
      )}
      {typed && (
        <button className="btn primary" data-testid="reset-connection" onClick={() => setAsk(true)}>{builtInSupabase() ? r.reset : r.resetNoBuild}</button>
      )}
      {!editing ? (
        <button className="btn secondary" data-testid="edit-connection" onClick={() => { setEditing(true); setMsg(null); }}>{r.edit}</button>
      ) : (
        <div className="stack-sm">
          <label className="ff">{profileStrings[lang].sbUrl}<input data-testid="connection-url" type="url" autoComplete="off" value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} /></label>
          <label className="ff">{profileStrings[lang].sbKey}<input data-testid="connection-key" type="password" autoComplete="off" value={form.key} onChange={e => setForm(f => ({ ...f, key: e.target.value }))} /></label>
          {problem && <p className="error" role="alert" data-testid="connection-problem">{problem === 'url' ? r.badUrl : r.badPair}</p>}
          <div className="two">
            <button className="btn secondary" onClick={() => { setEditing(false); setProblem(null); }}>{r.close}</button>
            <button className="btn primary" data-testid="save-connection" onClick={save}>{r.save}</button>
          </div>
        </div>
      )}
      {msg && <p className="ok-text" role="status" data-testid="connection-msg">{msg}</p>}
      {ask && <Confirm lang={lang} title={r.resetQ} body={r.resetBody} okLabel={r.resetOk} danger={false} onOk={reset} onCancel={() => setAsk(false)} />}
    </div>
  );
}

