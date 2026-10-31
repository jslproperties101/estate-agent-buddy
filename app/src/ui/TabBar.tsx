// EA AI Buddy reskin, Phase A (owner, 31 Oct 2026): the bottom tab bar (Home, Projects, the round gold AI Buddy button in
// the centre, Inquiries, More) and the More screen it opens. The tab bar is the very last row of the app; the advert sits
// directly above it (owner's choice), see adverts/AdBar.tsx. Tabs only open screens that already exist.
import type { Lang } from '../i18n';
import type { Go, Screen } from '../nav';
import { useApp } from '../data/useStore';
import { IconBell, IconChat, IconGear, IconHome, IconLogo, IconProject, IconRobot, IconUser } from '../icons';
import { StoredImage } from './common';
import { reskinStrings } from './reskinStrings';
import { profileStrings } from '../profile/strings';
import { BUILD } from '../native/updates';

/** Height of the tab bar in CSS px (also the native banner's distance from the bottom). */
export const TAB_H = 64;

export type TabKey = 'home' | 'projects' | 'ai' | 'inquiries' | 'more';
const TAB_SCREEN: Record<TabKey, Screen> = {
  home: { name: 'home' },
  projects: { name: 'projects' },
  ai: { name: 'voice' },
  inquiries: { name: 'activity', tab: 'inquiries' },
  more: { name: 'more' },
};
/** The tab a screen belongs to (lit in the bar), or undefined for every other screen. */
export function tabOf(s: Screen): TabKey | undefined {
  switch (s.name) {
    case 'home': return 'home';
    case 'projects': return 'projects';
    case 'voice': return 'ai';
    case 'activity': return 'inquiries';
    case 'more': return 'more';
    default: return undefined;
  }
}
export const tabScreen = (k: TabKey): Screen => TAB_SCREEN[k];

/** onTab decides how to get there (App.tsx: Home goes back to the main screen; the others open on top). */
export function TabBar({ lang, current, onTab }: { lang: Lang; current: Screen; onTab: (k: TabKey) => void }) {
  const t = reskinStrings[lang].tabs;
  const on = tabOf(current);
  const Tab = ({ k, icon, label }: { k: TabKey; icon: JSX.Element; label: string }) => (
    <button type="button" className={k === 'ai' ? 'tab tab-ai' : 'tab'} data-tab={k} aria-current={on === k ? 'page' : undefined}
      aria-label={label} onClick={() => onTab(k)}>
      <span className="tab-icon">{icon}</span>
      {k !== 'ai' && <span className="tab-label" aria-hidden="true">{label}</span>}
    </button>
  );
  return (
    <nav className="tab-bar" aria-label={t.label} data-testid="tab-bar" style={{ height: TAB_H }}>
      <Tab k="home" icon={<IconHome />} label={t.home} />
      <Tab k="projects" icon={<IconProject />} label={t.projects} />
      <Tab k="ai" icon={<IconRobot size={44} />} label={t.ai} />
      <Tab k="inquiries" icon={<IconChat />} label={t.inquiries} />
      <Tab k="more" icon={<MoreIcon />} label={t.more} />
    </nav>
  );
}

const MoreIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" />
    <rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" />
  </svg>
);

/** The More screen (mockup 12): the agent's card at the top, then the settings-type places that already exist. */
export function MoreScreen({ lang, go }: { lang: Lang; go: Go }) {
  const { state } = useApp();
  const t = reskinStrings[lang].more;
  const p = state.profile;
  const name = p.fullName?.trim() || t.agentFallback;
  const Row = ({ icon, label, to, testId, danger }: { icon: JSX.Element; label: string; to: Screen; testId: string; danger?: boolean }) => (
    <button type="button" className={danger ? 'more-row danger' : 'more-row'} data-testid={testId} onClick={() => go(to)}>
      <span className="more-icon">{icon}</span><span className="more-label">{label}</span><span className="chev" aria-hidden="true">›</span>
    </button>
  );
  return (
    <section className="stack more-screen" data-testid="more">
      <button type="button" className="card more-profile" data-testid="more-profile" onClick={() => go({ name: 'profile' })}>
        <span className="more-avatar">{p.photoFileId ? <StoredImage fileId={p.photoFileId} /> : <IconUser />}</span>
        <span className="more-who">
          <strong>{name}</strong>
          <small className="muted">{p.agency || profileStrings[lang].title}</small>
          <small className="more-view">{t.viewProfile} ›</small>
        </span>
      </button>
      <div className="card more-list">
        <Row icon={<IconGear />} label={t.settings} to={{ name: 'settings' }} testId="more-settings" />
        <Row icon={<IconBell />} label={t.notifications} to={{ name: 'notifications' }} testId="more-notifications" />
        <Row icon={<IconUser />} label={t.team} to={{ name: 'team' }} testId="more-team" />
        <Row icon={<IconChat />} label={t.feedback} to={{ name: 'bugReport', from: 'more' }} testId="more-feedback" />
      </div>
      <div className="more-about" data-testid="more-about">
        <IconLogo size={56} />
        <small className="muted">{t.about} · {BUILD.version ?? ''}</small>
      </div>
    </section>
  );
}
