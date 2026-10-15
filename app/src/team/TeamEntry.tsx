// Change 010: the way into the Team Workspace, Manage Sharing, Audit History and Export Management from Settings.
import type { Lang } from '../i18n';
import type { Go } from '../nav';
import { useApp } from '../data/useStore';
import { IconGear } from '../icons';
import { teamStrings } from './strings';
import { partnerOf, personLabel } from './access';

export function TeamEntryCard({ lang, go }: { lang: Lang; go: Go }) {
  const { state } = useApp();
  const t = teamStrings[lang];
  const partner = partnerOf(state);
  return (
    <div className="card stack-sm" data-testid="team-entry">
      <div className="card-title">{t.teamTitle}</div>
      <small className="muted">{partner ? `${t.members}: ${personLabel(partner.name, partner.email)}` : t.intro}</small>
      <button className="btn primary" data-testid="open-team" onClick={() => go({ name: 'team' })}>{t.teamTitle}</button>
      {partner && <button className="btn secondary" onClick={() => go({ name: 'manageSharing' })}><span className="row-gap"><IconGear /> {t.manageSharing}</span></button>}
    </div>
  );
}
