// Change 13: invitation alerts. The app looks for invitations when it opens, when it comes back to the front and now and
// then while it is open (one small call to the cloud: eab_team_status, already used by the Team Workspace screen).
// JoyChange002 Change 24: while the app is open it looks every 30 seconds, and at once when a push message arrives.
// Change 25: when the app is closed, a push message (native/push.ts) brings the invitation to the phone.
//  - An invitation for me: a pop-up (Accept / Decline / Later), an entry in Notifications, a number on the bell and one
//    phone notification. "Later" hides the pop-up until the app is opened again; it comes back every time the app is
//    opened until I answer it, the sender cancels it or it expires (7 days).
//  - An invitation I sent that was answered: a note in Notifications and one phone notification.
import type { Store } from '../data/store';
import type { SyncConfig } from '../data/sync';
import type { AppState, TeamAnswer, TeamInvite } from '../data/types';
import { idFor, notifyNow } from '../lib/notify';
import { refreshTeam } from './api';
import { personLabel } from './access';

type FetchFn = typeof fetch;
/** Looks again after this long while the app stays open. */
export const CHECK_EVERY_MS = 30_000;
/** Coming back to the front looks again only if the last look was at least this long ago. */
export const RESUME_GAP_MS = 2 * 60_000;

/** Invitations for me that can still be answered (the cloud lists none that expired; this also drops one that expired since). */
export const openInvites = (s: AppState, now = Date.now()): TeamInvite[] => (s.meta.team?.invitesForMe ?? []).filter(i => Date.parse(i.expiresAt) > now);
/** Answers to my invitations that I have not read yet. */
export const unseenAnswers = (s: AppState): TeamAnswer[] => {
  const seen = new Set(s.meta.inviteAlerts?.seenAnswers ?? []);
  return (s.meta.team?.invitesAnswered ?? []).filter(a => !seen.has(a.id));
};
/** The number on the bell and on the Notifications entry. */
export const inviteAlertCount = (s: AppState, now = Date.now()) => openInvites(s, now).length + unseenAnswers(s).length;

export function markAnswersSeen(store: Store, ids: string[]) {
  const cur = store.getState().meta.inviteAlerts ?? { notified: [], seenAnswers: [] };
  store.setSingleton('meta', { inviteAlerts: { notified: cur.notified, seenAnswers: [...new Set([...cur.seenAnswers, ...ids])].slice(-100) } });
  void store.flush();                 // written to the phone now, so closing the app straight away cannot bring the note back
}

export interface PhoneText { inviteTitle: string; inviteBody: (who: string) => string; acceptedTitle: string; declinedTitle: string; answerBody: (who: string) => string }

/** Reads the cloud, then tells the phone about every invitation or answer not announced before (once each).
 *  Returns false when the cloud could not be reached (the last known invitations stay as they are). */
export async function checkInvitations(store: Store, cfg: SyncConfig, text: PhoneText, fetchFn: FetchFn = fetch, now = Date.now(), notify: (id: number, title: string, body: string) => Promise<boolean> = notifyNow): Promise<boolean> {
  try { await refreshTeam(store, cfg, fetchFn); } catch { return false; }
  const st = store.getState();
  const cur = st.meta.inviteAlerts ?? { notified: [], seenAnswers: [] };
  const open = openInvites(st, now);
  const answers = st.meta.team?.invitesAnswered ?? [];
  const known = new Set(cur.notified);
  const fresh: { key: string; title: string; body: string }[] = [];
  for (const i of open) if (!known.has(`i:${i.id}`)) fresh.push({ key: `i:${i.id}`, title: text.inviteTitle, body: text.inviteBody(personLabel(i.fromName, i.fromEmail)) });
  for (const a of answers) if (!known.has(`a:${a.id}`) && !(cur.seenAnswers ?? []).includes(a.id)) {
    fresh.push({ key: `a:${a.id}`, title: a.status === 'accepted' ? text.acceptedTitle : text.declinedTitle, body: text.answerBody(personLabel(a.name, a.email)) });
  }
  if (fresh.length) {
    // remembered first, so a second look a moment later never announces the same thing twice
    const keep = new Set([...open.map(i => `i:${i.id}`), ...answers.map(a => `a:${a.id}`)]);
    store.setSingleton('meta', { inviteAlerts: { notified: [...[...known].filter(k => keep.has(k)), ...fresh.map(f => f.key)], seenAnswers: cur.seenAnswers ?? [] } });
    void store.flush();
    for (const f of fresh) void notify(idFor(f.key), f.title, f.body);
  }
  return true;
}
