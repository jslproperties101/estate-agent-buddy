// Change 14 (owner, 17 Oct 2026): "Team Sharing" sits at the top of Opportunities and holds both team systems, each with
// a one-line description: the Team Workspace (Change 010: sharing chosen records with one other agent) and the older
// "Team and access" (agency workspace roles in the cloud, owners and admins only). Neither is in Settings any more.
// Audit History and Export Management stay in Settings ("History and exports"): they cover the agent's own records too.
import { useState } from 'react';
import type { Lang } from '../i18n';
import type { Go } from '../nav';
import { useApp } from '../data/useStore';
import { config } from '../config';
import { configured } from '../data/sync';
import { IconGear } from '../icons';
import { teamStrings } from './strings';
import { partnerOf, personLabel } from './access';
import { openInvites } from './invitations';
import { auditStrings } from '../audit/strings';
import { exportStrings } from '../exports/strings';
import { TeamCard } from '../auth/AccountUI';

/** New invitations for me: the number on the Opportunities card and on its Team Sharing card. */
export const teamBadgeCount = (state: Parameters<typeof openInvites>[0]) => openInvites(state).length;

export function TeamSharingCard({ lang, go }: { lang: Lang; go: Go }) {
  const { state } = useApp();
  const t = teamStrings[lang];
  const partner = partnerOf(state);
  const s = state.meta.syncSession;
  const roles = !!s && (s.role === 'owner' || s.role === 'admin') && configured(config(state.settings));
  const [openAccess, setOpenAccess] = useState(false);
  const n = teamBadgeCount(state);
  return (
    <div className="card stack-sm" data-testid="team-sharing">
      <div className="between"><div className="card-title">{t.sharingTitle}</div>{n > 0 && <span className="count-badge" data-testid="team-sharing-badge" aria-label={t.newInvites(n)}>{n}</span>}</div>
      {n > 0 && <small className="warn-text" data-testid="team-sharing-new">{t.newInvites(n)}</small>}
      <small className="muted" data-testid="team-ws-line">{t.wsLine}</small>
      {partner && <small className="muted">{`${t.members}: ${personLabel(partner.name, partner.email)}`}</small>}
      <button className="btn primary" data-testid="open-team" onClick={() => go({ name: 'team' })}>{t.teamTitle}</button>
      {partner && <button className="btn secondary" onClick={() => go({ name: 'manageSharing' })}><span className="row-gap"><IconGear /> {t.manageSharing}</span></button>}
      {roles && s && (
        <div className="sub-card stack-sm" data-testid="team-access-section">
          <small className="muted" data-testid="team-access-line">{t.accessLine}</small>
          <button className="btn secondary" data-testid="open-team-access" aria-expanded={openAccess} onClick={() => setOpenAccess(o => !o)}>{openAccess ? t.closeAccess : t.openAccess}</button>
          {openAccess && <TeamCard lang={lang} session={s} />}
        </div>
      )}
    </div>
  );
}

/** Settings: Audit History and Export Management (they were on the old Team Workspace card). */
export function HistoryExportsCard({ lang, go }: { lang: Lang; go: Go }) {
  const t = teamStrings[lang];
  return (
    <div className="card stack-sm" data-testid="history-exports">
      <div className="card-title">{t.historyTitle}</div>
      <small className="muted">{t.historyLine}</small>
      <div className="two">
        <button className="btn secondary" data-testid="open-audit-search" onClick={() => go({ name: 'auditSearch' })}>{auditStrings[lang].searchTitle}</button>
        <button className="btn secondary" data-testid="open-exports" onClick={() => go({ name: 'exports' })}>{exportStrings[lang].manageTitle}</button>
      </div>
    </div>
  );
}
