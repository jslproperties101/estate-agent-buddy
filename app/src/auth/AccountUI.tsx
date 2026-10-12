// Agent Profile → Settings: the signed-in Google account, cloud sync status, and — for the owner and admins — the
// team: members with their roles, invitations, switching access off and on, and recent access changes.
// The database decides what each role may do (supabase/migrations/…_workspaces_roles.sql); these screens only ask it.
import { useEffect, useState } from 'react';
import { Lang } from '../i18n';
import { useApp } from '../data/useStore';
import { config } from '../config';
import { configured, fresh, syncNow, SyncError, supabaseCall, supabaseHeaders, Role, Session } from '../data/sync';
import { startGoogleSignIn, signOutRemote, canSignInHere } from '../data/auth';
import { fmtDateTime } from '../lib/dates';
import { Confirm } from '../ui/common';
import { authStrings } from './strings';
import { useGoogleReturn } from './LoginScreen';

const ROLES: Role[] = ['owner', 'admin', 'team_leader', 'agent', 'limited'];

export function AccountCard({ lang }: { lang: Lang }) {
  const { state, store } = useApp();
  const a = authStrings[lang];
  const cfg = config(state.settings);
  const s = state.meta.syncSession;
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [ask, setAsk] = useState(false);
  useGoogleReturn(e => setMsg(e ? (a.err[e] ?? a.err.other) : ''));

  const errText = (e: unknown) => a.err[e instanceof SyncError ? e.code : 'other'] ?? String(e);
  return (
    <div className="card stack-sm" data-testid="account">
      <div className="card-title">{a.account}</div>
      {!configured(cfg) ? (
        <small className="muted" data-testid="account-not-set-up">{a.notSetUpTitle}. {a.notSetUp}</small>
      ) : s ? (
        <>
          <strong data-testid="signed-in-as">{a.signedInAs(s.name ? `${s.name} (${s.email})` : s.email)}</strong>
          {s.workspaceName && s.role && <small className="muted" data-testid="workspace-role">{a.workspace(s.workspaceName, a.roles[s.role])}</small>}
          <small className="muted">{a.sync.auto} {state.meta.lastSync ? a.sync.last(fmtDateTime(state.meta.lastSync, lang)) : a.sync.never} · {a.sync.pending(state.meta.dirty.length)}</small>
          {s.role === 'limited' && <small className="warn-text">{a.sync.readOnly}</small>}
          {state.meta.syncError && <small className="warn-text" role="status">{a.sync.error(a.err[state.meta.syncError] ?? state.meta.syncError)}</small>}
          <div className="two">
            <button className="btn primary" disabled={busy} data-testid="sync-now" onClick={async () => {
              setBusy(true); setMsg('');
              try { const r = await syncNow(store, cfg); setMsg(a.sync.done(r.pushed, r.pulled + r.removed)); } catch (e) { setMsg(errText(e)); }
              setBusy(false);
            }}>{busy ? a.sync.running : a.sync.now}</button>
            <button className="btn secondary" onClick={() => setAsk(true)} data-testid="sign-out">{a.signOut}</button>
          </div>
        </>
      ) : (
        <>
          <small className="muted">{a.notSignedIn}</small>
          {canSignInHere()
            ? <button className="btn primary" disabled={busy} onClick={async () => { setBusy(true); try { await startGoogleSignIn(cfg); } catch (e) { setMsg(errText(e)); } setBusy(false); }}>{a.signIn}</button>
            : <small className="warn-text">{a.fileMode}</small>}
        </>
      )}
      {msg && <p className="small" role="status" data-testid="account-msg">{msg}</p>}
      {ask && s && <Confirm lang={lang} title={a.signOutQ} body={a.signOutBody} okLabel={a.signOut} danger={false} onCancel={() => setAsk(false)}
        onOk={() => { setAsk(false); void signOutRemote(cfg, s); store.setSingleton('meta', { syncSession: undefined, syncError: undefined }); }} />}
      {s && (s.role === 'owner' || s.role === 'admin') && configured(cfg) && <TeamCard lang={lang} session={s} />}
    </div>
  );
}

interface Member { user_id: string; email: string; role: Role; active: boolean; created_at: string }
interface Invite { email: string; role: Role; created_at: string }
interface Audit { action: string; target: string | null; detail: Record<string, unknown> | null; at: string }

function TeamCard({ lang, session }: { lang: Lang; session: Session }) {
  const { state, store } = useApp();
  const a = authStrings[lang];
  const t = a.team;
  const cfg = config(state.settings);
  const ws = session.workspaceId!;
  const [members, setMembers] = useState<Member[] | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [audit, setAudit] = useState<Audit[]>([]);
  const [failed, setFailed] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('agent');
  const [msg, setMsg] = useState('');
  const [tick, setTick] = useState(0);

  async function api(path: string, init: RequestInit = {}) {
    const s = await fresh(cfg, store.getState().meta.syncSession ?? session);
    if (s !== store.getState().meta.syncSession) store.setSingleton('meta', { syncSession: s });
    const r = await supabaseCall(fetch, `${cfg.supabaseUrl}/rest/v1/${path}`, { ...init, headers: supabaseHeaders(cfg, s.accessToken) });
    const text = await r.text();
    return text ? JSON.parse(text) : null;
  }
  useEffect(() => {
    let live = true;
    setFailed(false);
    Promise.all([
      api(`eab_members?select=user_id,email,role,active,created_at&workspace_id=eq.${ws}&order=created_at`),
      api(`eab_invites?select=email,role,created_at&workspace_id=eq.${ws}&order=created_at`),
      api(`eab_audit?select=action,target,detail,at&workspace_id=eq.${ws}&order=at.desc&limit=15`),
    ]).then(([m, i, au]) => { if (live) { setMembers(m); setInvites(i); setAudit(au); } }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const rpc = async (fn: string, body: Record<string, unknown>) => {
    setMsg('');
    try { await api(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(body) }); setMsg(t.saved); setTick(x => x + 1); }
    catch (e) { setMsg(t.failed(e instanceof Error ? e.message.replace(/^\d+\s*/, '').slice(0, 160) : String(e))); }
  };
  const canChange = (m: Member) => m.user_id !== session.userId && m.role !== 'owner' && (session.role === 'owner' || m.role !== 'admin');
  const roleChoices = ROLES.filter(r => r !== 'owner' && (session.role === 'owner' || r !== 'admin'));

  return (
    <div className="sub-card stack-sm" data-testid="team">
      <strong>{t.title}</strong>
      <small className="muted">{t.help}</small>
      {failed ? <small className="warn-text">{t.loadFailed}</small> : !members ? <small className="muted">{t.loading}</small> : (
        <>
          <div className="small muted">{t.members}</div>
          <ul className="team-list">
            {members.map(m => (
              <li key={m.user_id} data-testid="member">
                <span className="stack-sm team-who"><strong>{m.email}{m.user_id === session.userId ? ` (${t.you})` : ''}</strong>
                  <small className={m.active ? 'ok-text' : 'warn-text'}>{a.roles[m.role]} · {m.active ? t.active : t.inactive}</small></span>
                {canChange(m) && (
                  <span className="row-wrap">
                    <select aria-label={`${t.changeRole}: ${m.email}`} value={m.role} onChange={e => void rpc('eab_set_member', { ws, p_user: m.user_id, p_role: e.target.value, p_active: m.active })}>
                      {roleChoices.map(r => <option key={r} value={r}>{a.roles[r]}</option>)}
                    </select>
                    <button className="btn small secondary" onClick={() => void rpc('eab_set_member', { ws, p_user: m.user_id, p_role: m.role, p_active: !m.active })}>{m.active ? t.deactivate : t.reactivate}</button>
                  </span>
                )}
              </li>
            ))}
          </ul>
          <div className="small muted">{t.invites}</div>
          {invites.length === 0 ? <small className="muted">{t.none}</small> : invites.map(i => (
            <div key={i.email} className="between"><span>{i.email} · {a.roles[i.role]}</span>
              <button className="btn small secondary" onClick={() => void rpc('eab_cancel_invite', { ws, p_email: i.email })}>{t.cancelInvite}</button></div>
          ))}
          <label className="ff">{t.email}<input type="email" value={email} onChange={e => setEmail(e.target.value)} data-field="inviteEmail" /></label>
          <label className="ff">{t.role}
            <select value={role} onChange={e => setRole(e.target.value as Role)} data-field="inviteRole">
              {roleChoices.map(r => <option key={r} value={r}>{a.roles[r]}</option>)}
            </select>
          </label>
          {session.role !== 'owner' && <small className="muted">{t.ownerOnly}</small>}
          <small className="muted">{t.inviteHelp}</small>
          <button className="btn secondary" disabled={!/^\S+@\S+\.\S+$/.test(email.trim())} onClick={() => { void rpc('eab_invite', { ws, p_email: email.trim().toLowerCase(), p_role: role }); setEmail(''); }}>{t.send}</button>
          {audit.length > 0 && (
            <details>
              <summary className="small">{t.audit}</summary>
              {audit.map((x, i) => <small key={i} className="muted" style={{ display: 'block' }}>{fmtDateTime(Date.parse(x.at), lang)} · {x.action}{x.target ? ` · ${x.target}` : ''}{x.detail?.role ? ` · ${a.roles[String(x.detail.role)] ?? x.detail.role}` : ''}</small>)}
            </details>
          )}
        </>
      )}
      {msg && <small role="status">{msg}</small>}
    </div>
  );
}
