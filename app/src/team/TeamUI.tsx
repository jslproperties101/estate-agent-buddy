// Change 010 screens: Team Workspace (invitations, members, ending it, deletion requests), Manage Sharing (gear icon),
// the Personal / Team Workspace switch, and the small sharing labels on records. Every action is decided by the cloud
// (functions in supabase/proposed/20261016000000_change010_*.sql) and re-checked with the access policy at the moment
// it is pressed; these screens never assume a permission still holds.
import { useEffect, useMemo, useState } from 'react';
import type { Lang } from '../i18n';
import { useApp } from '../data/useStore';
import type { Go } from '../nav';
import { config } from '../config';
import { configured } from '../data/sync';
import { Confirm } from '../ui/common';
import { useToast } from '../ui/toast';
import { BusyLine } from '../ui/BusyLine';
import { IconGear } from '../icons';
import { fmtDateTime } from '../lib/dates';
import { recordTitle } from '../sync/SyncUI';
import type { CollectionName, ShareLevel, ShareScope, AppState } from '../data/types';
import { SHARE_SCOPES } from '../data/types';
import {
  refreshTeam, sendInvite, cancelInvite, acceptInvite, declineInvite, leaveTeam, removeMember, setShares, setShareAll,
  decideDelete, inviteLink, tokenFrom, teamErrorOf, TeamError,
} from './api';
import { partnerOf, myId, personLabel, isTeamOwner, inTeam, myShareOf, creatorNames, otherCreators, creatorLabel, creatorKeyOf, scopesOf, sharedInfo, creatorOf, levelOf, labelForUser, can } from './access';
import { teamStrings, EXACT } from './strings';
import { Select } from '../ui/Select';

const INVITE_KEY = 'eab-team-invite';
/** Reads ?team-invite=… from the address the app was opened with (then removes it from the address bar). */
export function captureInviteFromUrl(): void {
  try {
    const tok = tokenFrom(window.location.href);
    if (!tok) return;
    sessionStorage.setItem(INVITE_KEY, tok);
    const u = new URL(window.location.href); u.searchParams.delete('team-invite');
    window.history.replaceState(window.history.state, '', u.toString());
  } catch { /* storage blocked: the person can still paste the link */ }
}
export const pendingInviteToken = (): string | undefined => { try { return sessionStorage.getItem(INVITE_KEY) ?? undefined; } catch { return undefined; } };
const clearInviteToken = () => { try { sessionStorage.removeItem(INVITE_KEY); } catch { /* ignore */ } };

const levelText = (lang: Lang, lv: ShareLevel | 'owner' | null | undefined) => {
  const t = teamStrings[lang];
  return lv === 'edit' ? t.viewEdit : lv === 'view' ? t.viewOnly : lv === 'owner' ? '' : t.notShared;
};

// ---------- Change 15: "Created by" on every card, and the filter on every shareable list ----------
// (Change 16 removed the Personal / Team Workspace switch: own and shared records are in one list.)
const filterMemory = new Map<string, string>();   // the choice per list, kept while the app is open

/** The "Created by: All / You / <name>" filter for one list. Shown only when someone else's records can be on this phone. */
export function useCreatorFilter(listKey: string): [string, (v: string) => void] {
  const [v, setV] = useState(filterMemory.get(listKey) ?? 'all');
  return [v, (x: string) => { filterMemory.set(listKey, x); setV(x); }];
}
export function CreatorFilter({ lang, value, onChange, testId = 'created-by-filter' }: { lang: Lang; value: string; onChange: (v: string) => void; testId?: string }) {
  const { state } = useApp();
  const t = teamStrings[lang];
  const names = creatorNames(state);
  const others = otherCreators(state);
  // a person who is no longer on this phone (team ended) cannot stay selected
  useEffect(() => { if (value !== 'all' && value !== 'me' && !others.some(o => o.id === value)) onChange('all'); }, [value, others.length]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!others.length) return null;
  const opts = [{ v: 'all', label: t.byAll }, { v: 'me', label: t.byYou }, ...others.map(o => ({ v: o.id, label: names.get(o.id) ?? '—' }))];
  return (
    <div className="chip-row created-by" role="radiogroup" aria-label={t.createdByLabel} data-testid={testId}>
      <span className="small muted">{t.createdByLabel}:</span>
      {opts.map(o => <button key={o.v} type="button" role="radio" aria-checked={value === o.v} className={`chip-btn ${value === o.v ? 'on' : ''}`} data-by={o.v} onClick={() => onChange(o.v)}>{o.label}</button>)}
    </div>
  );
}
/** The bottom line of a card: "Click to Open" at the left, who created it at the right (Change 15). */
export function CardFoot({ lang, collection, id, onOpen }: { lang: Lang; collection: CollectionName; id: string; onOpen?: () => void }) {
  const { state } = useApp();
  const t = teamStrings[lang];
  const who = creatorLabel(state, collection, id, t.byYou);
  const mine = creatorKeyOf(state, collection, id) === 'me';
  return (
    <span className="card-foot" data-testid="card-foot">
      {onOpen
        ? <button type="button" className="cf-open link-btn" data-testid="card-click-to-open" onClick={e => { e.stopPropagation(); onOpen(); }}>{t.clickToOpen}</button>
        : <span className="cf-open" data-testid="card-click-to-open" aria-hidden="true">{t.clickToOpen}</span>}
      <span className={`cf-by ${mine ? 'mine' : 'theirs'}`} data-testid="card-creator" data-mine={mine ? 'yes' : 'no'} title={who}>{who}</span>
    </span>
  );
}

// ---------- labels on records ----------
/** Creator name (email fallback) in a distinctive colour, for the bottom-right of a shared property card. */
export function CreatorTag({ state, collection, id }: { state: AppState; collection: CollectionName; id: string }) {
  const rec = (state[collection] as unknown as { id: string }[]).find(r => r.id === id);
  const shared = sharedInfo(state, collection, id) || (rec && myShareOf(state, collection, rec));
  if (!shared) return null;
  const c = creatorOf(state, collection, id);
  return <span className="creator-tag" data-testid="creator-tag">{personLabel(c.name, c.email)}</span>;
}

/** On a detail screen: who created the record, who it is shared with or by, my access, and the gear for Manage Sharing. */
export function SharingLine({ lang, collection, id, go }: { lang: Lang; collection: CollectionName; id: string; go?: Go }) {
  const { state } = useApp();
  const t = teamStrings[lang];
  const rec = (state[collection] as unknown as { id: string; sample?: boolean }[]).find(r => r.id === id);
  if (!rec || rec.sample) return null;
  const info = sharedInfo(state, collection, id);
  const c = creatorOf(state, collection, id);
  const mine = myShareOf(state, collection, rec);
  const partner = partnerOf(state);
  if (!info && !inTeam(state)) return null;
  return (
    <div className="card stack-sm sharing-line" data-testid="sharing-line">
      <div className="between">
        <small data-testid="created-by">{t.createdBy(personLabel(c.name, c.email))}</small>
        {go && can(state, 'share', collection, id) && (
          <button className="icon-btn small gear-btn" aria-label={t.manageSharing} title={t.manageSharing} data-testid="open-manage-sharing" onClick={() => go({ name: 'manageSharing', focus: `${collection}:${id}` })}><IconGear /></button>
        )}
      </div>
      {info && <small className="muted" data-testid="shared-by">{t.sharedBy(personLabel(info.ownerName, info.ownerEmail))} · {t.yourAccess(levelText(lang, info.level))}</small>}
      {info?.level === 'view' && <small className="muted" data-testid="read-only-note">{t.readOnlyNote}</small>}
      {!info && mine && partner && <small className="muted" data-testid="shared-with">{t.sharedWith(personLabel(partner.name, partner.email), levelText(lang, mine.level))}{mine.via.includes('all') ? ` (${mine.via.includes('selected') ? t.alsoAll : t.viaAll})` : ''}</small>}
    </div>
  );
}

// ---------- Team Workspace screen ----------
export function TeamScreen({ lang, go }: { lang: Lang; go: Go }) {
  const { state, store } = useApp();
  const t = teamStrings[lang];
  const toast = useToast();
  const cfg = config(state.settings);
  const team = state.meta.team;
  const me = myId(state);
  const partner = partnerOf(state);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [unavailable, setUnavailable] = useState(false);
  const [email, setEmail] = useState('');
  const [link, setLink] = useState<string | null>(null);
  const [paste, setPaste] = useState(pendingInviteToken() ?? '');
  const [askEnd, setAskEnd] = useState<null | 'leave' | 'remove'>(null);
  const signedIn = configured(cfg) && !!state.meta.syncSession;

  const run = async (f: () => Promise<unknown>, ok?: string) => {
    setBusy(true); setMsg('');
    try { await f(); if (ok) { setMsg(ok); toast(ok); } setUnavailable(false); }
    catch (e) { const te = teamErrorOf(e); if (te.code === 'unavailable') setUnavailable(true); setMsg(t.err[te.code] ?? t.err.other); }
    setBusy(false);
  };
  useEffect(() => { if (signedIn) void run(() => refreshTeam(store, cfg)); }, [signedIn]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!signedIn) return <section className="stack" data-testid="team-screen"><div className="card"><p>{t.signInFirst}</p></div></section>;
  const fromLink = tokenFrom(paste);
  const sent = team?.invitesSent ?? [];
  const forMe = team?.invitesForMe ?? [];
  const requests = team?.deleteRequests ?? [];
  const title = (c: CollectionName, id: string) => recordTitle(lang, c, (state[c] as unknown as Record<string, unknown>[]).find(r => r.id === id));

  return (
    <section className="stack" data-testid="team-screen">
      <div className="card stack-sm">
        <p className="small">{t.intro}</p>
        {busy && <BusyLine text={t.working} testId="team-busy" />}
        {unavailable && <p className="warn-text small" role="status" data-testid="team-unavailable">{t.unavailable}</p>}
        <button className="btn secondary small fit" disabled={busy} onClick={() => void run(() => refreshTeam(store, cfg))}>{t.refresh}</button>
      </div>

      {forMe.length > 0 && (
        <div className="card stack-sm" data-testid="invites-for-me">
          <div className="card-title">{t.invitesForMe}</div>
          {forMe.map(i => (
            <div key={i.id} className="stack-sm">
              <strong>{t.from(personLabel(i.fromName, i.fromEmail))}</strong>
              <small className="muted">{t.expires(fmtDateTime(Date.parse(i.expiresAt), lang))}</small>
              <div className="two">
                <button className="btn secondary" disabled={busy} onClick={() => void run(() => declineInvite(store, cfg, { inviteId: i.id }), t.declined)}>{t.decline}</button>
                <button className="btn primary" disabled={busy} data-testid="accept-invite" onClick={() => void run(() => acceptInvite(store, cfg, { inviteId: i.id }), t.accepted)}>{t.accept}</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!partner && (
        <div className="card stack-sm" data-testid="join-link">
          <div className="card-title">{t.joinLink}</div>
          {pendingInviteToken() && <small className="ok-text">{t.linkFound}</small>}
          <label className="ff">{t.pasteLink}<input value={paste} onChange={e => setPaste(e.target.value)} data-field="inviteLink" /></label>
          <div className="two">
            <button className="btn secondary" disabled={busy || !fromLink} onClick={() => void run(async () => { await declineInvite(store, cfg, { token: fromLink }); clearInviteToken(); setPaste(''); }, t.declined)}>{t.decline}</button>
            <button className="btn primary" disabled={busy || !fromLink} data-testid="accept-link" onClick={() => void run(async () => { await acceptInvite(store, cfg, { token: fromLink }); clearInviteToken(); setPaste(''); }, t.accepted)}>{t.accept}</button>
          </div>
        </div>
      )}

      {team?.id && (
        <div className="card stack-sm" data-testid="team-members">
          <div className="card-title">{t.members}</div>
          {team.members.map(m => (
            <div key={m.userId} className="between" data-testid="team-member">
              <span><strong>{personLabel(m.name, m.email)}</strong>{m.userId === me ? ` (${t.you})` : ''}{m.name ? <small className="muted"> · {m.email}</small> : null}</span>
              {team.createdBy === m.userId && <span className="badge fit">{t.teamOwner}</span>}
            </div>
          ))}
          {!partner && <small className="muted">{t.alone}</small>}
          {partner && <button className="btn primary" data-testid="open-manage-sharing" onClick={() => go({ name: 'manageSharing' })}><span className="row-gap"><IconGear /> {t.manageSharing}</span></button>}
          {partner && (
            <div className="two">
              <button className="btn secondary danger-text" data-testid="end-team" disabled={busy} onClick={() => setAskEnd('leave')}>{t.endTeam}</button>
              {isTeamOwner(state) && <button className="btn secondary danger-text" data-testid="remove-member" disabled={busy} onClick={() => setAskEnd('remove')}>{t.removeMember}</button>}
            </div>
          )}
        </div>
      )}
      {!team?.id && <div className="card"><small className="muted" data-testid="no-team">{t.noTeam}</small></div>}

      {!partner && (
        <div className="card stack-sm" data-testid="invite-card">
          <div className="card-title">{t.inviteTitle}</div>
          <small className="muted">{t.inviteHelp}</small>
          {sent.map(i => (
            <div key={i.id} className="sub-card stack-sm" data-testid="invite-waiting">
              <strong>{t.waitingInvite}: {i.email ?? t.linkInvite}</strong>
              <small className="muted">{t.expires(fmtDateTime(Date.parse(i.expiresAt), lang))}</small>
              <button className="btn small secondary" disabled={busy} data-testid="cancel-invite" onClick={() => void run(async () => { await cancelInvite(store, cfg, i.id); setLink(null); }, t.cancelled)}>{t.cancelInvite}</button>
            </div>
          ))}
          {link && (
            <div className="sub-card stack-sm" data-testid="invite-link">
              <small>{t.linkHelp}</small>
              <code className="wrap-anywhere">{link}</code>
              <div className="two">
                <button className="btn small secondary" onClick={() => { void navigator.clipboard?.writeText(link).then(() => toast(t.copied), () => undefined); }}>{t.copy}</button>
                {typeof navigator !== 'undefined' && 'share' in navigator && <button className="btn small secondary" onClick={() => { void navigator.share({ text: link }).catch(() => undefined); }}>{t.share}</button>}
              </div>
            </div>
          )}
          {sent.length === 0 && <>
            <label className="ff">{t.email}<input type="email" value={email} onChange={e => setEmail(e.target.value)} data-field="teamInviteEmail" /></label>
            <button className="btn primary" disabled={busy || !/^\S+@\S+\.\S+$/.test(email.trim())} data-testid="send-invite"
              onClick={() => void run(async () => { await sendInvite(store, cfg, email.trim()); setEmail(''); }, t.waitingInvite)}>{t.sendInvite}</button>
            <button className="btn secondary" disabled={busy} data-testid="make-link" onClick={() => void run(async () => { const r = await sendInvite(store, cfg, null); setLink(inviteLink(r.token)); })}>{t.makeLink}</button>
          </>}
        </div>
      )}

      {requests.length > 0 && (
        <div className="card stack-sm" data-testid="delete-requests">
          <div className="card-title">{t.deleteRequests}</div>
          {requests.map(r => {
            const ownerSide = r.ownerId === me;
            const here = (state[r.collection] as unknown as { id: string }[]).some(x => x.id === r.recordId);
            return (
              <div key={r.id} className="sub-card stack-sm" data-testid="delete-request">
                <strong>{here ? title(r.collection, r.recordId) : t.recordGone}</strong>
                <small className="muted">{t.requestFrom(labelForUser(state, r.requesterId))}</small>
                {ownerSide ? (
                  <div className="two">
                    <button className="btn secondary" disabled={busy} onClick={() => void run(() => decideDelete(store, cfg, r.id, false), t.rejected)}>{t.reject}</button>
                    <button className="btn danger" disabled={busy || !here} data-testid="approve-delete" onClick={() => void run(async () => {
                      // Recheck at the moment of approval, then archive (recoverable) and record the decision.
                      if (levelOf(store.getState(), r.collection, r.recordId) !== 'owner') throw new TeamError('not-allowed');
                      const rec = store.getState().properties.find(x => x.id === r.recordId);
                      if (rec && !rec.archived) store.upsert('properties', { ...rec, archived: { at: Date.now(), by: me } });
                      await decideDelete(store, cfg, r.id, true);
                    }, t.approved)}>{t.approve}</button>
                  </div>
                ) : <small className="muted">{t.waitingOwner}</small>}
              </div>
            );
          })}
        </div>
      )}

      {msg && <p className="small" role="status" data-testid="team-msg">{msg}</p>}
      {askEnd && partner && (
        <Confirm lang={lang} title={EXACT[lang].endTeamQ} okLabel={askEnd === 'remove' ? t.removeMember : t.endOk}
          onCancel={() => setAskEnd(null)}
          onOk={() => { const how = askEnd; setAskEnd(null); void run(() => (how === 'remove' ? removeMember(store, cfg, partner.userId) : leaveTeam(store, cfg)), t.ended); }} />
      )}
    </section>
  );
}

// ---------- Manage Sharing ----------
interface Row { collection: CollectionName; id: string; title: string; scopes: ShareScope[]; selected: ShareLevel | null; viaAll: ShareLevel | null }
const SHAREABLE_LISTS: { collection: CollectionName; scope?: ShareScope }[] = [
  { collection: 'properties' }, { collection: 'contacts' }, { collection: 'tasks' }, { collection: 'appointments' },
];

export function ManageSharingScreen({ lang, focus }: { lang: Lang; focus?: string }) {
  const { state, store } = useApp();
  const t = teamStrings[lang];
  const toast = useToast();
  const cfg = config(state.settings);
  const partner = partnerOf(state);
  const team = state.meta.team;
  const [q, setQ] = useState(() => {
    if (!focus) return '';
    const i = focus.indexOf(':');
    const c = focus.slice(0, i) as CollectionName, id = focus.slice(i + 1);
    return recordTitle(lang, c, (state[c] as unknown as Record<string, unknown>[]).find(r => r.id === id));
  });
  const [who, setWho] = useState('');
  const [sharedOnly, setSharedOnly] = useState(false);
  const [changes, setChanges] = useState<Record<string, ShareLevel | null>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [askAll, setAskAll] = useState<{ scope: ShareScope; level: ShareLevel } | null>(null);

  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    for (const { collection } of SHAREABLE_LISTS) {
      for (const r of state[collection] as unknown as (Record<string, unknown> & { id: string; sample?: boolean; archived?: unknown })[]) {
        if (r.sample || sharedInfo(state, collection, r.id)) continue;               // only my own, real records
        const scopes = scopesOf(collection, r);
        if (!scopes.length) continue;
        const sel = team?.sharesGiven.find(s => s.collection === collection && s.recordId === r.id)?.level ?? null;
        const all = team?.shareAllGiven.filter(a => scopes.includes(a.scope)).map(a => a.level) ?? [];
        out.push({ collection, id: r.id, title: recordTitle(lang, collection, r), scopes, selected: sel, viaAll: all.includes('edit') ? 'edit' : all.length ? 'view' : null });
      }
    }
    return out;
  }, [state, team, lang]);

  if (!partner || !team?.id) return <section className="stack" data-testid="manage-sharing"><div className="card"><p>{t.err['no-partner']}</p></div></section>;
  const partnerName = personLabel(partner.name, partner.email);
  const recipientMatches = !who.trim() || `${partner.name ?? ''} ${partner.email}`.toLowerCase().includes(who.trim().toLowerCase());
  const needle = q.trim().toLowerCase();
  const level = (r: Row) => (`${r.collection}:${r.id}` in changes ? changes[`${r.collection}:${r.id}`] : r.selected);
  const shown = rows.filter(r => (!needle || r.title.toLowerCase().includes(needle) || t.scope[r.scopes[0]].toLowerCase().includes(needle))
    && (!sharedOnly || level(r) || r.viaAll));
  const pending = Object.entries(changes).filter(([k, v]) => (rows.find(r => `${r.collection}:${r.id}` === k)?.selected ?? null) !== v);
  const allLevel = (scope: ShareScope) => team.shareAllGiven.find(a => a.scope === scope)?.level ?? null;

  const saveAll = async () => {
    if (!pending.length) { setMsg(t.noChanges); return; }
    setBusy(true); setMsg('');
    try {
      // Recheck at the moment of saving: only records that are still mine are sent.
      const items = pending.map(([k, lv]) => { const i = k.indexOf(':'); return { collection: k.slice(0, i) as CollectionName, id: k.slice(i + 1), level: lv }; })
        .filter(x => levelOf(store.getState(), x.collection, x.id) === 'owner');
      const res = await setShares(store, cfg, items);
      const ok = res.filter(r => r.status === 'ok').length;
      const bad = res.length - ok + (pending.length - items.length);
      const text = bad ? t.partial(ok, bad) : t.savedN(ok);
      setMsg(text); toast(text, bad ? 'error' : 'ok');
      setChanges({});
    } catch (e) { setMsg(t.err[teamErrorOf(e).code] ?? t.err.other); }
    setBusy(false);
  };
  const applyAll = async (scope: ShareScope, lv: ShareLevel | null) => {
    setBusy(true); setMsg('');
    try { await setShareAll(store, cfg, scope, lv); setMsg(t.savedN(1)); toast(t.savedN(1)); }
    catch (e) { setMsg(t.err[teamErrorOf(e).code] ?? t.err.other); }
    setBusy(false);
  };

  return (
    <section className="stack" data-testid="manage-sharing">
      <div className="card stack-sm">
        <div className="row-gap"><IconGear /><strong>{t.manageSharing}</strong></div>
        <p className="small">{t.sharingIntro(partnerName)}</p>
        <label className="ff">{t.findRecipient}<input value={who} onChange={e => setWho(e.target.value)} data-field="findRecipient" /></label>
        {recipientMatches
          ? <div className="sub-card" data-testid="recipient"><small className="muted">{t.recipient}</small><br /><strong>{partnerName}</strong>{partner.name ? <small className="muted"> · {partner.email}</small> : null}</div>
          : <small className="muted">{t.noMatch}</small>}
      </div>

      {recipientMatches && <>
        <div className="card stack-sm" data-testid="share-all">
          <div className="card-title">{t.shareAll}</div>
          <small className="muted">{t.shareAllHelp}</small>
          {SHARE_SCOPES.map(scope => (
            <label key={scope} className="between share-row" data-scope={scope}>
              <span>{t.scope[scope]}</span>
              <Select aria-label={`${t.shareAll}: ${t.scope[scope]}`} value={allLevel(scope) ?? ''} disabled={busy} data-testid={`share-all-${scope}`}
                onChange={e => { const v = (e.target.value || null) as ShareLevel | null; if (v && !allLevel(scope)) setAskAll({ scope, level: v }); else void applyAll(scope, v); }}>
                <option value="">{t.notShared}</option><option value="view">{t.viewOnly}</option><option value="edit">{t.viewEdit}</option>
              </Select>
            </label>
          ))}
          <small className="muted">{t.calculatorPrivate}</small>
        </div>

        <div className="card stack-sm" data-testid="share-records">
          <div className="card-title">{t.whatTheyCanSee(partnerName)}</div>
          <label className="ff">{t.findRecord}<input value={q} onChange={e => setQ(e.target.value)} data-field="findRecord" /></label>
          <label className="check"><input type="checkbox" checked={sharedOnly} onChange={e => setSharedOnly(e.target.checked)} /> {t.sharedOnly}</label>
          {shown.length === 0 ? <small className="muted">{sharedOnly ? t.nothingShared : t.noMatch}</small> : (
            <ul className="share-list">
              {shown.slice(0, 200).map(r => {
                const k = `${r.collection}:${r.id}`;
                return (
                  <li key={k} className="share-row" data-testid="share-row" data-key={k}>
                    <span className="stack-sm"><strong>{r.title}</strong><small className="muted">{t.scope[r.scopes[0]]}{r.viaAll ? ` · ${t.viaAll}: ${levelText(lang, r.viaAll)}` : ''}</small></span>
                    <Select aria-label={`${r.title}: ${t.recipient}`} value={level(r) ?? ''} onChange={e => setChanges(c => ({ ...c, [k]: (e.target.value || null) as ShareLevel | null }))}>
                      <option value="">{t.notShared}</option><option value="view">{t.viewOnly}</option><option value="edit">{t.viewEdit}</option>
                    </Select>
                  </li>
                );
              })}
            </ul>
          )}
          <button className="btn primary" disabled={busy} data-testid="save-sharing" onClick={() => void saveAll()}>{busy ? t.saving : t.save}{pending.length ? ` (${pending.length})` : ''}</button>
          <small className="muted">{t.noOnward}</small>
        </div>
      </>}
      {msg && <p className="small" role="status" data-testid="sharing-msg">{msg}</p>}
      {askAll && <Confirm lang={lang} danger={false} title={t.shareAllQ(t.scope[askAll.scope].toLowerCase(), partnerName)} body={t.shareAllBody} okLabel={t.shareAllOn}
        onCancel={() => setAskAll(null)} onOk={() => { const a = askAll; setAskAll(null); void applyAll(a.scope, a.level); }} />}
    </section>
  );
}
