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
import { checkInvitations, openInvites, CHECK_EVERY_MS, RESUME_GAP_MS } from './invitations';
import { teamStrings } from './strings';
import { startPush } from '../native/push';

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
    const look = () => {
      last.current = Date.now();
      void checkInvitations(store, cfgRef.current, { inviteTitle: textRef.current.invPhoneTitle, inviteBody: textRef.current.invPhoneBody, acceptedTitle: textRef.current.invAcceptedTitle, declinedTitle: textRef.current.invDeclinedTitle, answerBody: textRef.current.invAnswerBody });
    };
    look();
    // Change 24 / 25: a push message (or a tap on one) makes the app look straight away.
    void startPush(store, cfgRef.current, () => store.getState().settings.lang ?? 'en', look);
    const every = setInterval(() => { if (document.visibilityState === 'visible') look(); }, CHECK_EVERY_MS);
    const onVis = () => { if (document.visibilityState === 'visible' && Date.now() - last.current >= RESUME_GAP_MS) look(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(every); document.removeEventListener('visibilitychange', onVis); };
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
