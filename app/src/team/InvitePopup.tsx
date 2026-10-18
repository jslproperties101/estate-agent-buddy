// Change 13: the invitation pop-up (Accept / Decline / Later) and the watcher that looks for invitations while the app is
// open. "Later" only hides it for this opening of the app: the pop-up returns each time the app is opened, until the
// invitation is answered, cancelled by the sender or expired. See invitations.ts.
import { useEffect, useRef, useState } from 'react';
import type { Lang } from '../i18n';
import { useApp } from '../data/useStore';
import { config } from '../config';
import { configured } from '../data/sync';
import { ChoiceDialog } from '../ui/common';
import { useToast } from '../ui/toast';
import { acceptInvite, declineInvite, teamErrorOf } from './api';
import { personLabel } from './access';
import { checkInvitations, openInvites, CHECK_EVERY_MS, RESUME_GAP_MS, LIVE_LOST_CHECK_MS } from './invitations';
import { LiveInvites } from './live';
import { fresh } from '../data/sync';
import { notifyNow } from '../lib/notify';
import { pushActive, registerKnownToken, startPush } from '../native/push';
import { teamStrings } from './strings';

/** `suppress`: true on the Team Workspace screen, which already shows the invitation with its own Accept / Decline buttons. */
export function InvitePopup({ lang, suppress = false }: { lang: Lang; suppress?: boolean }) {
  const { state, store } = useApp();
  const t = teamStrings[lang];
  const toast = useToast();
  const cfg = config(state.settings);
  const signedIn = configured(cfg) && !!state.meta.syncSession;
  const [later, setLater] = useState<Set<string>>(() => new Set());     // answered "Later" in this opening of the app
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const last = useRef(0);
  const cfgRef = useRef(cfg); cfgRef.current = cfg;
  const textRef = useRef(t); textRef.current = t;

  useEffect(() => {
    if (!signedIn) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const look = () => {
      last.current = Date.now();
      // Change 25: when this phone gets invitation alerts by push, the app does not announce them a second time
      const notify = (id: number, title: string, body: string) => (pushActive(store) ? Promise.resolve(false) : notifyNow(id, title, body));
      void checkInvitations(store, cfgRef.current, { inviteTitle: textRef.current.invPhoneTitle, inviteBody: textRef.current.invPhoneBody, acceptedTitle: textRef.current.invAcceptedTitle, declinedTitle: textRef.current.invDeclinedTitle, answerBody: textRef.current.invAnswerBody }, fetch, Date.now(), notify);
    };
    // several changes at once (an answer also cancels other invitations) cause one look, not several
    const soon = () => { if (timer) clearTimeout(timer); timer = setTimeout(look, 400); };
    // Change 24: a live connection while the app is on screen; the pop-up appears within a second or two
    const live = new LiveInvites({
      url: cfgRef.current.supabaseUrl, anonKey: cfgRef.current.supabaseAnonKey,
      token: async () => {
        const s0 = store.getState().meta.syncSession;
        if (!s0) throw new Error('signed out');
        const s1 = await fresh(cfgRef.current, s0);
        if (s1 !== s0) store.setSingleton('meta', { syncSession: s1 });
        return s1.accessToken;
      },
      onChange: soon,
    });
    if (typeof WebSocket !== 'undefined' && document.visibilityState === 'visible') live.start();
    // Change 25: phone notifications while the app is closed (only in an APK built with the Firebase settings)
    const hooks = { current: () => (store.getState().meta.syncSession ? { cfg: cfgRef.current, lang: store.getState().settings.lang } : undefined), onInvite: soon };
    void startPush(store, hooks).then(() => registerKnownToken(store, hooks));
    look();
    // Change 13 checks stay as the safety net; while the live connection is down they run every minute
    const every = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - last.current >= (live.connected ? CHECK_EVERY_MS : LIVE_LOST_CHECK_MS)) look();
    }, LIVE_LOST_CHECK_MS);
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        if (typeof WebSocket !== 'undefined') live.start();
        if (Date.now() - last.current >= RESUME_GAP_MS) look();
      } else live.stop();                                       // no connection in the background (battery)
    };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(every); if (timer) clearTimeout(timer); live.stop(); document.removeEventListener('visibilitychange', onVis); };
  }, [signedIn, store, state.meta.syncSession?.userId]);

  const invite = signedIn && !suppress ? openInvites(state).find(i => !later.has(i.id)) : undefined;
  if (!invite) return null;
  const who = personLabel(invite.fromName, invite.fromEmail);
  const answer = async (accept: boolean) => {
    setBusy(true); setErr('');
    try {
      await (accept ? acceptInvite(store, cfg, { inviteId: invite.id }) : declineInvite(store, cfg, { inviteId: invite.id }));
      toast(accept ? t.accepted : t.declined);
    } catch (e) { setErr(t.err[teamErrorOf(e).code] ?? t.err.other); }
    setBusy(false);
  };
  return (
    <ChoiceDialog lang={lang} testId="invite-popup" title={t.invPopupTitle} body={`${t.invPopupBody(who)}${err ? ` ${err}` : ''}`}
      choices={busy ? [] : [
        { label: t.accept, primary: true, testId: 'invite-popup-accept', onPick: () => void answer(true) },
        { label: t.decline, testId: 'invite-popup-decline', onPick: () => void answer(false) },
      ]}
      cancelLabel={t.invLater} onCancel={() => setLater(s => new Set(s).add(invite.id))} />
  );
}
