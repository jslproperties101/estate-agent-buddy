// Estate Agent AI Buddy: the app shell. Opens the phone's storage, draws the header and the current screen, keeps the
// Back history (including the Android back button), shows short messages and runs the reminder checks.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ProjectList, ProjectDetail, ProjectForm } from './projects/ProjectUI';
import { projectStrings } from './projects/strings';
import { ScreenEntry, newEntryId, forgetEntry, saveScroll, savedScroll } from './ui/screenMemory';
import { Lang, LANGS, strings, htmlLang } from './i18n';
import { openBackend } from './data/backend';
import { Store, AccessError } from './data/store';
import { StoreContext, useApp, useSaveState } from './data/useStore';
import { Screen, Go } from './nav';
import { ToastContext, ToastKind, TOAST_OK_MS, TOAST_ERROR_MS } from './ui/toast';
import { SyncBanner } from './ui/SyncBanner';
import { DealScreen, TrackSalesScreen } from './deals/DealUI';
import { cc001Strings } from './ui/cc001Strings';
import { ChoiceDialog } from './ui/common';
import { saveStrings } from './ui/savestrings';
import { beginStartup, startupLang, StartupPhase, SPLASH_MS, FORCE_OPEN_MS, splashStep, splashDots } from './startup/startup';
import { checkAccount } from './security/account';
import { refreshFeed, maintenanceActive, updateVerdict } from './feed/feed';
import { MarketNewsScreen, AnnouncementBanners, AnnouncementPopup, BlockingNotice, SoftUpdateBanner, usePublicSettings, useUnreadNews } from './feed/FeedUI';
import { feedStrings } from './feed/strings';
import { BUILD as BUILD_INFO } from './native/updates';
import { logLogin } from './security/loginLog';
import { startupStrings } from './startup/strings';
import { dueReminders, upcomingReminders, DueReminder } from './domain/workflow';
import { permission } from './lib/notify';
import { isShown, dismissMarks, snoozeMarks, restoreMarks, historyList, snoozeUntil, SNOOZE_CHOICES } from './lib/notifState';
import { showNow, scheduleNative, idFor } from './lib/notify';
import { fmtDateTime } from './lib/dates';
import { cardTitle } from './listing/model';
import { listingStrings } from './listing/strings';
import { agendaStrings } from './agenda/strings';
import { contactStrings } from './contacts/strings';
import { gpsStrings } from './gps/strings';
import { financeStrings } from './finance/strings';
import { calcStrings } from './calculator/strings';
import { profileStrings } from './profile/strings';
import { expertStrings } from './expert/strings';
import { PropertyListing, ListingDetails } from './listing/ListingUI';
import { ListingForm } from './listing/ListingForm';
import { ContactsList, ContactDetail, ContactForm, ContactsHome } from './contacts/ContactsUI';
import { ActivityScreen, InquiryForm, ApptForm, TodoScreen, TaskForm, CalendarScreen } from './agenda/AgendaUI';
import { GpsHome, HouseShopping, JourneyDetail, PropertyMap } from './gps/GpsUI';
import { BannerScreen } from './gps/BannersUI';
import { FinanceScreen, DealForm, MoneyForm } from './finance/FinanceUI';
import { CalculatorScreen } from './calculator/CalculatorUI';
import { BuyerPdfScreen } from './listing/BuyerPdfUI';
import { buyerStrings } from './listing/buyerPdf';
import { AdTrackerScreen, AdSummaryScreen } from './adverts/AdTrackerUI';
import { adStrings } from './adverts/strings';
import { PhotoStudioScreen } from './photos/PhotoStudioUI';
import { photoStrings } from './photos/strings';
import { MarketingStudioScreen } from './marketing/MarketingStudioUI';
import { marketingStrings } from './marketing/strings';
import { ymd } from './lib/dates';
import { attention, adReminders } from './domain/adverts';
import { ProfileScreen, ProfileEdit, NameCardSend, SettingsScreen } from './profile/ProfileUI';
import { ExpertHome, ExpertAsk, ExpertThreadScreen } from './expert/ExpertUI';
import { VoiceCommand } from './voice/VoiceCommandUI';
import { VoiceDiagnostics } from './voice/VoiceDiagUI';
import { diagStrings } from './voice/diagStrings';
import { BugReportScreen } from './bugreport/BugReportUI';
import { bugStrings } from './bugreport/strings';
import { StartChoice, needsStartChoice } from './ui/StartChoice';
import { CountryChoice, useCountryChoice, useTermsChoice } from './ui/CountryChoice';
import {
  IconBack, IconAgenda, IconSales, IconTrend, IconHome, IconGps, IconExpert, IconBell, IconContacts, IconChat,
  IconRobot, IconLogo, IconMoney, IconCalc, IconUser, IconProject, IconMegaphone, IconCreative, IconMatch,
} from './icons';
import { BottomAd } from './adverts/AdBar';
import { c11Strings } from './ui/c011Strings';
import { BuyerHistoryScreen } from './agenda/BuyerHistoryUI';
import { BuyerMatchingScreen, BuyerMatchesScreen } from './contacts/BuyerMatchingUI';
import { CreativeMediaScreen } from './marketing/CreativeMediaUI';
import { nativeLook, hideSplash } from './native/native';
import { platformOf } from './security/loginLog';
import { BUILD } from './native/updates';
import { usage, detectDevice, asUsagePlatform } from './usage/logger';
import { DevDashboard } from './usage/DevDashboard';
import { UpdateBanner } from './native/UpdateUI';
import { LoginScreen } from './auth/LoginScreen';
import { config } from './config';
import { configured, holdsOtherWorkspaceData, ownerUnknownWithData } from './data/sync';
import { runSync, setNextAutoSync } from './data/syncRunner';
import { syncStrings } from './sync/strings';
import { SyncReviewScreen, HistoryScreen, RecentlyDeletedScreen, DraftsList, OtherWorkspaceScreen, OwnerUnknownScreen } from './sync/SyncUI';
import { pendingFileCount } from './data/savestate';
import { convertInactive, inactiveContacts, reviewContacts } from './data/leadReview';
import { backupDue, driveUsable, runDriveBackup } from './backup/drive';
import { backupStrings } from './backup/strings';
import { STALE_MS } from './backup/BackupUI';
import { leadReviewStrings } from './data/leadReviewStrings';
import { followStrings } from './contacts/followStrings';
import { followUpDue, DEFAULT_FOLLOW_UP_DAYS } from './domain/followup';
import { InvitePopup } from './team/InvitePopup';
import { TeamSharingCard, teamBadgeCount } from './team/TeamEntry';
import { markAnswersSeen, openInvites, unseenAnswers } from './team/invitations';
import { personLabel } from './team/access';
import { TeamScreen, ManageSharingScreen, captureInviteFromUrl, pendingInviteToken } from './team/TeamUI';
import { teamStrings } from './team/strings';
import { AuditSearchScreen } from './audit/AuditUI';
import { auditStrings } from './audit/strings';
import { ExportManagementScreen, AuditExportScreen } from './exports/ExportsUI';
import { exportStrings } from './exports/strings';

/** Change 015: the page content is the one scrolling region (main.content); a new screen starts at its top. */
/** How far the screen is scrolled (the content area scrolls; the window on older layouts). */
function contentScroll(): number {
  try { return document.querySelector('main.content')?.scrollTop || window.scrollY || 0; } catch { return 0; }
}
/** Change 27: scrolls back to where the screen was left. Lists and photos may still be drawing, so it tries a few times. */
function restoreScroll(y: number) {
  const apply = () => { try { const el = document.querySelector('main.content'); if (el) el.scrollTop = y; window.scrollTo(0, y); } catch { /* old browser */ } };
  apply();
  for (const ms of [30, 120, 300, 600]) setTimeout(apply, ms);
}
function scrollTop() {
  try { document.querySelector('main.content')?.scrollTo(0, 0); } catch { /* old browser */ }
  window.scrollTo(0, 0);
}

// Change 010: a Team Workspace invitation link the app was opened with is kept until the person deals with it.
if (typeof window !== 'undefined') captureInviteFromUrl();

/** The 15 home buttons (3 columns × 5 rows on a phone). Order approved 13 Oct 2026, changed by Change 011 / 013 and the
 *  owner's answers of 16 Oct 2026: 4 Creative Media (where the property list was), 10 Buyer Matching (Agent Profile moved to
 *  the top bar, beside the language button), 12 Market Intelligence, 14 Subsale List (the property list, bottom centre).
 *  No card carries a Coming Soon label any more; Project and Market Intelligence still open honest "not built yet" screens. */
/** Change 43: the three bottom-row tiles carry the full gold fill. */
const GOLD_TILES = new Set(['agenda', 'property', 'voice']);
export const TILES: { key: string; icon: () => JSX.Element; target: Screen }[] = [
  // ClaudeChanges001 change 12: Calendar and To-do in one tile (it asks which), and Track My Sales in the Calendar's place.
  // JoyChange002 Change 43: Project moves to the top-left; Calendar & To-Do takes its old place, bottom-left of the gold row
  // (Calendar & To-Do | Subsale | AI Assisted Command). Nothing else moves.
  { key: 'project', icon: () => <IconProject />, target: { name: 'projects' } },   // JoyChange002: the Project feature
  { key: 'sales', icon: () => <IconSales />, target: { name: 'trackSales' } },
  { key: 'opportunities', icon: () => <IconTrend />, target: { name: 'opportunities' } },
  { key: 'creative', icon: () => <IconCreative />, target: { name: 'creativeMedia' } },
  { key: 'contacts', icon: () => <IconContacts />, target: { name: 'contactsHome' } },
  { key: 'activity', icon: () => <IconChat />, target: { name: 'activity' } },
  { key: 'gps', icon: () => <IconGps />, target: { name: 'gps' } },
  { key: 'finance', icon: () => <IconMoney />, target: { name: 'finance' } },
  { key: 'calculator', icon: () => <IconCalc />, target: { name: 'calculator' } },
  { key: 'matching', icon: () => <IconMatch />, target: { name: 'buyerMatching' } },
  { key: 'expert', icon: () => <IconExpert />, target: { name: 'expert' } },
  { key: 'market', icon: () => <IconMegaphone />, target: { name: 'marketNews' } },   // MainForAdmin-D: Market News and Intelligence
  { key: 'agenda', icon: () => <IconAgenda />, target: { name: 'calendar' } },
  { key: 'property', icon: () => <IconHome />, target: { name: 'listing' } },
  { key: 'voice', icon: () => <IconRobot size={56} />, target: { name: 'voice' } },
];

/** Startup is driven by readiness, not by a timer: the dashboard appears the moment the phone's storage is open, however
 *  early that is. Only if opening takes longer than about five seconds does the screen say so; if it fails, the screen
 *  says that and offers "Try again". Nothing here waits for the internet. */
export default function App() {
  const [store, setStore] = useState<Store | null>(null);
  const [phase, setPhase] = useState<StartupPhase>('opening');
  const [attempt, setAttempt] = useState(0);
  const [gone, setGone] = useState(false);
  // Change 42: the start-up screen stays for the full SPLASH_MS every time, even when the storage opens sooner.
  // (Automated browser tests, which report navigator.webdriver, skip the wait unless the address has ?splash=full; a phone never does.)
  const [minDone, setMinDone] = useState(() => typeof navigator !== 'undefined' && (navigator as { webdriver?: boolean }).webdriver === true && !/splash=full/.test(typeof location === 'undefined' ? '' : location.search));
  useEffect(() => { if (minDone) return; const x = setTimeout(() => setMinDone(true), SPLASH_MS); return () => clearTimeout(x); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // JoyChange006 Change E (Joe's choice): if the app is still not ready FORCE_OPEN_MS after start-up began, the cover is
  // removed anyway rather than waiting indefinitely. This runs on the real clock, never skipped by the webdriver bypass above,
  // so a genuinely stuck phone is never left behind a cover with no way out.
  const [forceOpen, setForceOpen] = useState(false);
  useEffect(() => { const x = setTimeout(() => setForceOpen(true), FORCE_OPEN_MS); return () => clearTimeout(x); }, []);
  const lang = startupLang(typeof navigator === 'undefined' ? undefined : navigator.languages);
  useEffect(() => beginStartup(() => openBackend().then(Store.open), (p, value) => {
    setPhase(p);
    if (p === 'ready' && value) setStore(value);
  }), [attempt]);
  // The Android splash (a still logo) is hidden as soon as the app can draw, so the spinning logo follows straight on.
  useEffect(() => { void hideSplash(); }, []);
  useEffect(() => { if (store) void nativeLook(); }, [store]);
  const readyToLeave = (phase === 'ready' && minDone) || (forceOpen && phase !== 'ready');
  // After the short fade-out the cover is removed from the page altogether.
  useEffect(() => { if (!readyToLeave) return; const x = setTimeout(() => setGone(true), FADE_MS); return () => clearTimeout(x); }, [readyToLeave]);
  const stillOpening = gone && !store;
  return (
    <>
      {store && <StoreContext.Provider value={store}><Gate /></StoreContext.Provider>}
      {stillOpening && <StillOpeningScreen phase={phase} lang={lang} onRetry={() => setAttempt(n => n + 1)} />}
      {!gone && <StartupLogo phase={phase} done={minDone} lang={store?.getState().settings.lang ?? lang} onRetry={() => setAttempt(n => n + 1)} />}
    </>
  );
}

/** JoyChange006 Change E: shown only in the rare case where the cover was removed at FORCE_OPEN_MS before the phone's
 *  storage actually opened (a very slow phone or network). Plain words and Try again; no logo or bar (those belong to the
 *  10-second cover, which has already finished its job). */
function StillOpeningScreen({ phase, lang, onRetry }: { phase: StartupPhase; lang: Lang; onRetry: () => void }) {
  const s = startupStrings[lang];
  const text = phase === 'failed' ? s.failed : s.slow;
  return (
    <div className="content stack" data-testid="still-opening" style={{ justifyContent: 'center', alignItems: 'center', minHeight: '100dvh', textAlign: 'center' }}>
      <p className="muted" role={phase === 'failed' ? 'alert' : 'status'}>{text}</p>
      <button type="button" className="btn primary" data-testid="still-opening-retry" onClick={onRetry}>{s.retry}</button>
    </div>
  );
}

/** The cover fades away over this long once the app is ready (only a visual fade; it never holds the dashboard back). */
export const FADE_MS = 120;

/** Startup cover: the logo and one truthful line about what is happening. The spin is decoration only. People who ask
 *  the phone for reduced motion get a short fade instead of the spin. */
function StartupLogo({ phase, done, lang, onRetry }: { phase: StartupPhase; done: boolean; lang: Lang; onRetry: () => void }) {
  const s = startupStrings[lang];
  const t = strings[lang];
  // JoyChange006 Part 2 Change E: five visual lines over the full 10 seconds, each with its own animated "...".
  // A real problem (slow or failed storage) still replaces them with a truthful message (unchanged from JoyChange002 Change 42).
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t0 = Date.now();
    const x = setInterval(() => setElapsed(Date.now() - t0), 100);
    return () => clearInterval(x);
  }, []);
  const step = splashStep(elapsed);
  const real = phase === 'failed' ? s.failed : phase === 'slow' ? s.slow : undefined;
  const text = real ?? `${s.steps[step] ?? s.opening}${'.'.repeat(splashDots(elapsed))}`;
  const leaving = phase === 'ready' && done;
  return (
    <div className={`intro${leaving ? ' leaving' : ''}`} data-testid="startup-logo" data-phase={phase} data-step={step}>
      {/* JoyChange006 Change E: "Estate Agent" / "AI Buddy", centred, words only (the rotating icon below carries the mark). */}
      <div className="intro-brand" aria-hidden="true"><span>{t.appNameA}</span><em>{t.appNameB}</em></div>
      <div className="intro-stage" aria-hidden="true"><IconLogo size={168} big splash /></div>
      <div className="intro-bar" aria-hidden="true" data-testid="startup-bar"><span /></div>
      {!leaving && <p className={`intro-msg ${phase}`} role={phase === 'failed' ? 'alert' : 'status'} data-testid="startup-msg">{text}</p>}
      {(phase === 'slow' || phase === 'failed') && <button className="btn secondary" data-testid="startup-retry" onClick={onRetry}>{s.retry}</button>}
      {/* The same bottom advert as every other screen, from the first moment. */}
      <div className="intro-ad"><BottomAd lang={lang} cover /></div>
    </div>
  );
}

/** Sign-in first when Google sign-in is set up and nobody is signed in on this phone; otherwise the app. */
function Gate() {
  const { state } = useApp();
  const lang: Lang = state.settings.lang ?? 'en';
  // MainForAdmin-D: maintenance mode and a required update stop the app, signed in or not (the data on the phone is kept).
  usePublicSettings();
  const ps = state.meta.publicSettings;
  if (ps && (maintenanceActive(ps) || updateVerdict(ps, BUILD_INFO.version) === 'hard')) return <BlockingNotice lang={lang} />;
  if (configured(config(state.settings)) && !state.meta.syncSession) return <LoginScreen lang={lang} />;
  // Signed in to a different team than the one whose records are on this phone: show none of them, send none of them.
  if (holdsOtherWorkspaceData(state, state.meta.syncSession?.workspaceId)) return <OtherWorkspaceScreen lang={lang} />;
  if (ownerUnknownWithData(state, state.meta.syncSession?.workspaceId)) return <OwnerUnknownScreen lang={lang} />;
  return <Shell />;
}

let openedLogged = false;
/** Keeps the cloud copy up to date while signed in: on opening, every minute when something changed, and when the
 *  connection comes back. Problems are shown in Settings; a refused or switched-off account goes back to sign-in. */
function useAutoSync() {
  const { state, store } = useApp();
  const busy = useRef(false);
  const signedIn = !!state.meta.syncSession;
  useEffect(() => {
    if (!signedIn) return;
    const run = async (force = false) => {
      const s = store.getState();
      const cfg = config(s.settings);
      if (busy.current || !configured(cfg) || !s.meta.syncSession) return;
      if (!force && !s.meta.dirty.length && pendingFileCount(store) === 0 && s.meta.lastSync && Date.now() - s.meta.lastSync < 5 * 60_000) return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      busy.current = true;
      try {
        await runSync(store, cfg);
        // MainForAdmin-B: after every sync, the company's word on this account (suspended / forced sign-out), and the
        // licence, Terms answers and sign-in log that are waiting.
        if (store.getState().meta.syncSession) await checkAccount(store, cfg);
        // MainForAdmin-D: news, pushed projects and announcements for this agent, in the app's language.
        if (store.getState().meta.syncSession) await refreshFeed(store, cfg, store.getState().settings.lang ?? 'en');
      }
      finally { busy.current = false; }
    };
    // MainForAdmin-B: every app opening while signed in is noted (with GPS only if location was allowed before).
    if (!openedLogged) { openedLogged = true; if (Date.now() - (store.getState().meta.syncSession?.signedInAt ?? 0) > 60_000) void logLogin('app_open'); }
    void run(true);
    setNextAutoSync(Date.now() + 60_000);
    const t = setInterval(() => { setNextAutoSync(Date.now() + 60_000); void run(); }, 60_000);
    const online = () => void run(true);
    window.addEventListener('online', online);
    return () => { clearInterval(t); window.removeEventListener('online', online); };
  }, [signedIn, store]);
}

function Shell() {
  const { state, store } = useApp();
  const lang: Lang = state.settings.lang ?? 'en';
  const t = strings[lang];
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const stack = useRef<Screen[]>([]);
  // Change 27: each place in the Back history has an id, so its scroll position and screen state come back with it.
  const [entry, setEntry] = useState(() => newEntryId());
  const entryRef = useRef(entry);
  const ids = useRef<number[]>([]);
  const restoreTo = useRef<number | undefined>(undefined);
  const [toast, setToast] = useState<{ text: string; kind: ToastKind } | null>(null);
  const [alerts, setAlerts] = useState<DueReminder[]>([]);
  useAutoSync();
  // Changes 19 and 20: the usage log (what it records, and what it never does, is written at the top of usage/logger.ts).
  const userId = state.meta.syncSession?.userId;
  useEffect(() => {
    const base = { appVersion: BUILD.version, platform: asUsagePlatform(platformOf(typeof navigator === 'undefined' ? '' : navigator.userAgent)) };
    usage.attach(store, base);
    void detectDevice().then(device => usage.attach(store, { ...base, device }));
    store.onCreate = c => usage.feature(`${c}.create`);
    store.onFileAdded = () => usage.feature('file.add');
    store.onEdit = c => usage.feature(`${c}.edit`);
    store.onDelete = c => usage.feature(`${c}.delete`);
    const stop = usage.start();
    return () => { stop(); store.onCreate = undefined; store.onFileAdded = undefined; store.onEdit = undefined; store.onDelete = undefined; };
  }, [store, userId]);
  // Old deleted records, their removed pictures and forgotten drafts are cleared after 30 days.
  useEffect(() => { void store.purgeOld(); }, [store]);

  // A success message ("Saved on this phone.") is shown only after the phone's storage has really finished writing,
  // and never if that write failed (the failure message is shown instead). It stays two seconds; an error stays six.
  const showToast = useCallback((text: string, kind: ToastKind = 'ok') => {
    if (kind === 'error') { setToast({ text, kind }); return; }
    const failedBefore = store.writeErrors;
    void store.flush().then(() => { if (store.writeErrors === failedBefore && !store.writeFailed) setToast({ text, kind: 'ok' }); });
  }, [store]);
  useEffect(() => { if (!toast) return; const x = setTimeout(() => setToast(null), toast.kind === 'error' ? TOAST_ERROR_MS : TOAST_OK_MS); return () => clearTimeout(x); }, [toast]);
  useEffect(() => { store.onWriteError = () => setToast({ text: t.storage.writeError, kind: 'error' }); }, [store, t]);
  // Change 010: the store refuses changes this person may not make (see data/store.ts AccessError). Whatever screen or
  // command tried, the person is told plainly instead of the change silently going nowhere.
  useEffect(() => {
    const onErr = (e: ErrorEvent | PromiseRejectionEvent) => {
      const err = 'reason' in e ? e.reason : e.error;
      if (err instanceof AccessError) { e.preventDefault(); setToast({ text: teamStrings[lang].notAllowed, kind: 'error' }); }
    };
    window.addEventListener('error', onErr);
    window.addEventListener('unhandledrejection', onErr);
    return () => { window.removeEventListener('error', onErr); window.removeEventListener('unhandledrejection', onErr); };
  }, [lang]);
  // When syncing to the cloud starts failing, say so once (the changes themselves are still saved on this phone).
  // Buyers still marked with the retired status "Inactive" (from an older version, or from another phone) become Dropped,
  // with a report. Runs on opening and again whenever a sync brings such a record in; it does nothing otherwise.
  useEffect(() => { if (inactiveContacts(state.contacts).length) convertInactive(store); }, [state.contacts, store]);
  // A Google Drive backup once a day at app start, but only while Google's short-lived Drive token is still valid (see backup/drive.ts).
  useEffect(() => {
    const m = store.getState().meta;
    if (m.syncSession && driveUsable(m.drive) && backupDue(m.driveLastOkAt)) void runDriveBackup(store);
  }, [store]);
  const saveState = useSaveState();
  const lastSaveState = useRef(saveState);
  useEffect(() => {
    if (saveState === 'failed-sync' && lastSaveState.current !== 'failed-sync') setToast({ text: saveStrings[lang].syncFailedToast, kind: 'error' });
    lastSaveState.current = saveState;
  }, [saveState, lang]);
  useEffect(() => { document.documentElement.lang = htmlLang(lang); }, [lang]);

  const go: Go = useCallback((next, opts) => {
    const cur = entryRef.current;
    if (!opts?.replace) {
      saveScroll(cur, contentScroll());
      stack.current.push(screen); ids.current.push(cur);
      window.history.pushState({ eab: stack.current.length }, '');
    } else forgetEntry(cur);
    const id = newEntryId();
    entryRef.current = id; setEntry(id);
    restoreTo.current = undefined;
    setScreen(next);
    scrollTop();
  }, [screen]);
  const back = useCallback(() => {
    if (stack.current.length) window.history.back(); else setScreen({ name: 'home' });
  }, []);
  // The Android back button and the browser's Back both arrive here.
  useEffect(() => {
    const onPop = () => {
      const prev = stack.current.pop();
      forgetEntry(entryRef.current);
      const id = ids.current.pop() ?? newEntryId();
      entryRef.current = id; setEntry(id);
      // Change 27: back where it was left (except the main screen, which always opens at the top).
      restoreTo.current = prev && prev.name !== 'home' ? savedScroll(id) : undefined;
      setScreen(prev ?? { name: 'home' });
      scrollTop();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  useEffect(() => { const y = restoreTo.current; restoreTo.current = undefined; if (y) restoreScroll(y); }, [entry]);

  // Reminders: checked every 30 seconds while the app is open; in the Android app they are also scheduled on the phone.
  useEffect(() => {
    const check = () => {
      const s = store.getState();
      const due = dueReminders(s.tasks, s.appointments, s.meta.fired, Date.now());
      if (!due.length) return;
      setAlerts(a => [...a, ...due.filter(d => !a.some(x => x.key === d.key))]);
      for (const d of due) { const { title, body } = reminderText(d, s, lang); void showNow(title, body); }
      store.setSingleton('meta', { fired: [...s.meta.fired, ...due.flatMap(d => [d.key, ...(d.covers ?? [])])].slice(-500) });
    };
    check();
    const x = setInterval(check, 30_000);
    return () => clearInterval(x);
  }, [store, lang]);
  useEffect(() => {
    const list = upcomingReminders(state.tasks, state.appointments, Date.now()).map(r => ({ id: idFor(r.key), at: r.at, ...reminderText(r, state, lang) }));
    // Advert expiry reminders (real adverts only; test and sample adverts never remind).
    const ads = adReminders(state.properties.filter(p => !p.archived), Date.now()).map(r => {
      const p = state.properties.find(z => z.id === r.propertyId); const a = p?.marketing?.ads.find(z => z.id === r.adId);
      return { id: idFor(r.key), at: r.at, title: adStrings[lang].reminderTitle, body: adStrings[lang].reminderBody(p ? (p.ref ?? cardTitle(p)) : '', a?.platform ?? '', r.days) };
    });
    void scheduleNative([...list, ...ads]);
  }, [state.tasks, state.appointments, state.properties, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  const country = useCountryChoice();
  const terms = useTermsChoice();
  useEffect(() => { usage.screen(screen.name); }, [screen.name]);
  // Stage C: the language in use, and how long a screen took to appear (only slow ones are noted).
  useEffect(() => { usage.language(lang); }, [lang, userId]);
  useEffect(() => {
    if (typeof requestAnimationFrame === 'undefined' || typeof performance === 'undefined') return;
    const t0 = performance.now(); let r2 = 0;
    const r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => usage.slowScreen(screen.name, performance.now() - t0)); });
    return () => { cancelAnimationFrame(r1); if (r2) cancelAnimationFrame(r2); };
  }, [screen.name]);
  const title = screenTitle(screen, lang, state);
  // Bell badge: reminders due today that are not yet done.
  // Change 72: the red number counts only notifications that need attention now and were not dismissed or snoozed
  // (reminders that are due, follow-ups, reviews, invitations, a failed sync…); reminders coming up later do not count.
  const bellNow = Date.now();
  const syncFailed = saveState === 'failed-phone' || (!!state.meta.syncSession && saveState === 'failed-sync');
  const notifCount = notifData(state, store.allDrafts().length, bellNow).attentionKeys.filter(k => isShown(state.meta, k, bellNow)).length + (syncFailed ? 1 : 0);
  void alerts;

  return (
    <ToastContext.Provider value={showToast}>
      <InvitePopup lang={lang} suppress={screen.name === 'team'} />
      <div className="shell">
        <header className={screen.name === 'home' ? 'topbar home' : 'topbar'}>
          {screen.name !== 'home' && <button className="icon-btn" onClick={back} aria-label={t.back}><IconBack /></button>}
          {/* ClaudeChanges001 change 2: no "Saved on This Phone" line under the title; a problem shows as a banner on the main page. */}
          <div className="title-col">
            {screen.name === 'home'
              ? <h1 className="brand" aria-label={t.appName}><IconLogo size={66} big /><span className="wordmark"><span>{t.appNameA}</span><em>{t.appNameB}</em></span></h1>
              : <h1>{title}</h1>}
          </div>
          {screen.name === 'home' && <>
            <button className="icon-btn top-btn notif-btn" onClick={() => go({ name: 'notifications' })} aria-label={t.notifications} title={t.notifications} data-testid="top-notifications">
              <IconBell />{notifCount > 0 && <span className="top-badge" aria-hidden="true">{notifCount > 9 ? '9+' : notifCount}</span>}
            </button>
          </>}
          {/* Change 29: bell, language, profile (language and profile swapped). The profile icon is a plain user. */}
          <LangMenu lang={lang} onPick={l => store.setSingleton('settings', { lang: l })} />
          {screen.name === 'home' && (
            <button className="icon-btn top-btn" onClick={() => go({ name: 'profile' })} aria-label={c11Strings[lang].top.profile} title={c11Strings[lang].top.profile} data-testid="top-profile">
              <IconUser />
            </button>
          )}
        </header>
        {!store.persistent && <div className="proto-bar" role="alert">{t.storage.notPersistent}</div>}
        <UpdateBanner lang={lang} />
        <SoftUpdateBanner lang={lang} />

        <main className="content" data-screen={screen.name}>
          <ScreenEntry.Provider value={entry}><ScreenView key={entry} screen={screen} lang={lang} go={go} back={back} /></ScreenEntry.Provider>
        </main>

        {/* JoyChange002 Change 46: the country is asked first, once; then the sample-data choice. */}
        {/* Change 010-01: whenever this consent screen appears, the country box is shown too (the saved country, or Malaysia, chosen). */}
        {/* MainForAdmin-B: the same first-login screen also asks for the Terms (and the optional news tick) when this account
            has not accepted the current version yet. */}
        {country.ask || terms.ask
          ? <CountryChoice lang={lang} onChoose={c => { if (country.ask || c !== state.settings.country) country.choose(c); }} askCountry={country.ask || terms.ask} askTerms={terms.ask} onAccept={m => void terms.accept(m)} initial={state.settings.country} />
          : needsStartChoice(state) ? <StartChoice lang={lang} /> : <AnnouncementPopup lang={lang} />}

        {/* Change 011: the one advertising area for every normal screen, fixed above the phone's navigation buttons. */}
        <BottomAd lang={lang} />

        {toast && (
          <div className={toast.kind === 'error' ? 'toast error' : 'toast'} role={toast.kind === 'error' ? 'alert' : 'status'} data-testid="toast" data-kind={toast.kind}>
            <span>{toast.text}</span>
            <button aria-label={t.c.close} onClick={() => setToast(null)}>✕</button>
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

function reminderText(r: DueReminder, s: ReturnType<Store['getState']>, lang: Lang): { title: string; body: string } {
  const t = strings[lang];
  const a = agendaStrings[lang];
  if (r.kind === 'task') {
    const task = s.tasks.find(x => x.id === r.id);
    return { title: task?.title ?? t.reminders.due, body: [task?.due && fmtDateTime(task.due, lang), r.minutesBefore ? t.reminders.before(r.minutesBefore) : t.reminders.atTime].filter(Boolean).join(' · ') };
  }
  const ap = s.appointments.find(x => x.id === r.id);
  const contact = s.contacts.find(c => c.id === ap?.contactId);
  const prop = s.properties.find(p => p.id === ap?.propertyId);
  return {
    title: [ap?.title || (ap && a.appt.kinds[ap.kind]), contact?.name].filter(Boolean).join(' · ') || t.reminders.due,
    body: [ap?.start && fmtDateTime(ap.start, lang), prop && cardTitle(prop)].filter(Boolean).join(' · '),
  };
}

function screenTitle(s: Screen, lang: Lang, state: ReturnType<Store['getState']>): string {
  const t = strings[lang];
  const ls = listingStrings[lang], ag = agendaStrings[lang], cs = contactStrings[lang], gs = gpsStrings[lang];
  switch (s.name) {
    case 'home': return t.appName;
    case 'notifications': return t.notifications;
    case 'contactsHome': return cs.contacts;
    case 'opportunities': return t.tiles.opportunities;
    case 'listing': return ls.title;
    case 'listingDetail': { const l = state.properties.find(x => x.id === s.id); return (l && cardTitle(l)) || ls.untitled; }
    case 'listingForm': return s.id ? ls.editTitle : ls.newTitle;
    case 'contacts': return s.role === 'vendor' ? cs.vendors : cs.buyers;
    case 'contactDetail': return state.contacts.find(x => x.id === s.id)?.name ?? cs.vendors;
    case 'contactForm': return s.id ? cs.editTitle : cs.newTitle;
    case 'activity': return ag.activity.title;
    case 'inquiryForm': return s.id ? ag.inq.editTitle : ag.inq.newTitle;
    case 'apptForm': return s.id ? ag.appt.editTitle : ag.appt.newTitle;
    case 'todo': return ag.todo.title;
    case 'taskForm': return s.id ? ag.todo.editTitle : ag.todo.newTitle;
    case 'calendar': return ag.cal.title;
    case 'gps': return t.tiles.gps;
    case 'houseShopping': return gs.houseShopping;
    case 'journey': return state.journeys.find(x => x.id === s.id)?.title || gs.houseShopping;
    case 'propertyMap': return gs.map;
    case 'banners': return gs.banners;
    case 'finance': return financeStrings[lang].title;
    case 'projects': return projectStrings[lang].title;
    case 'marketNews': return feedStrings[lang].marketTitle;
    case 'projectDetail': return projectStrings[lang].title;
    case 'projectForm': return s.id ? projectStrings[lang].editTitle : projectStrings[lang].newTitle;
    case 'dealForm': return s.id ? financeStrings[lang].editDeal : financeStrings[lang].newDeal;
    case 'expenseForm': return s.id ? financeStrings[lang].editExpense : financeStrings[lang].newExpense;
    case 'incomeForm': return s.id ? financeStrings[lang].editIncome : financeStrings[lang].newIncome;
    case 'calculator': return calcStrings[lang].title;
    case 'buyerPdf': return buyerStrings[lang].title;
    case 'adTracker': return adStrings[lang].title;
    case 'adSummary': return adStrings[lang].summaryTitle;
    case 'photoStudio': return photoStrings[lang].title;
    case 'marketingStudio': return marketingStrings[lang].title;
    case 'profile': return profileStrings[lang].title;
    case 'profileEdit': return profileStrings[lang].edit;
    case 'nameCard': return profileStrings[lang].sendTitle;
    case 'settings': return profileStrings[lang].setTitle;
    case 'bugReport': return bugStrings[lang].title;
    case 'devDashboard': return 'Developer dashboard';
    case 'syncReview': return syncStrings[lang].review;
    case 'history': return syncStrings[lang].history;
    case 'recentlyDeleted': return syncStrings[lang].recent;
    case 'expert': return expertStrings[lang].title;
    case 'expertAsk': return expertStrings[lang].experts[s.expert];
    case 'expertThread': { const th = state.expertThreads.find(x => x.id === s.id); return th ? expertStrings[lang].experts[th.expert] : expertStrings[lang].title; }
    case 'voice': return t.tiles.voice;
    case 'voiceDiag': return diagStrings[lang].title;
    case 'comingSoon': return s.key === 'cobrokeMap' ? gs.cobrokeMap : t.tiles[s.key];
    case 'cobroke': return t.cobrokeTop;
    case 'creativeMedia': return t.tiles.creative;
    case 'buyerHistory': return c11Strings[lang].history.button;
    case 'buyerMatching': return t.tiles.matching;
    case 'buyerMatches': return c11Strings[lang].match.open;
    case 'team': return teamStrings[lang].teamTitle;
    case 'manageSharing': return teamStrings[lang].manageSharing;
    case 'auditSearch': return auditStrings[lang].searchTitle;
    case 'exports': return exportStrings[lang].manageTitle;
    case 'auditExport': return exportStrings[lang].exportTitle;
    case 'deal': { const d = cc001Strings[lang].deal; return s.kind === 'booking' ? d.titleBooking : s.kind === 'sale' ? d.titleSale : s.kind === 'rental' ? d.titleRental : d.titleOthers; }
    case 'trackSales': return cc001Strings[lang].sales.title;
  }
}

function ScreenView({ screen: s, lang, go, back }: { screen: Screen; lang: Lang; go: Go; back: () => void }) {
  const t = strings[lang];
  switch (s.name) {
    case 'home': return <Home lang={lang} go={go} />;
    case 'notifications': return <Notifications lang={lang} go={go} />;
    case 'contactsHome': return <ContactsHome lang={lang} go={go} />;
    case 'opportunities': return (
      <section className="stack" data-testid="opportunities">
        {/* Change 14 (owner, 17 Oct 2026): Team Sharing at the top of Opportunities. */}
        <TeamSharingCard lang={lang} go={go} />
        {/* Change 003 follow-up (owner, 15 Oct): Co-broke Opportunities lives here now that the top-bar item is gone. */}
        <button className="card big-card link-card" data-testid="open-cobroke" onClick={() => go({ name: 'cobroke' })}>
          <strong>{t.cobrokeTop}</strong><small className="muted">{t.cobrokePage.intro}</small>
          <span className="badge soon-badge fit">{t.comingSoon}</span>
        </button>
        <div className="card stack-sm"><h2>{t.notBuilt}</h2><p>{t.opportunitiesBody}</p></div>
      </section>
    );
    case 'listing': return <PropertyListing key={JSON.stringify(s.filters ?? {})} lang={lang} go={go} initial={s.filters} />;
    case 'listingDetail': return <ListingDetails key={s.id} lang={lang} id={s.id} go={go} />;
    case 'listingForm': return <ListingForm key={`${s.id ?? 'new'}-${s.section ?? ''}`} lang={lang} id={s.id} prefill={s.prefill} section={s.section} back={back}
      go={(next, o) => go(next, { replace: true, ...o })} />;
    case 'contacts': return <ContactsList key={s.role} lang={lang} go={go} role={s.role} />;
    case 'contactDetail': return <ContactDetail key={s.id} lang={lang} go={go} id={s.id} />;
    case 'contactForm': return <ContactForm key={s.id ?? 'new'} lang={lang} go={(next, o) => go(next, { replace: next.name === 'contactDetail', ...o })} back={back} id={s.id} role={s.role} prefill={s.prefill} />;
    case 'activity': return <ActivityScreen lang={lang} go={go} propertyId={s.propertyId} contactId={s.contactId} tab={s.tab} />;
    case 'inquiryForm': return <InquiryForm key={s.id ?? 'new'} lang={lang} back={back} id={s.id} propertyId={s.propertyId} contactId={s.contactId} />;
    case 'apptForm': return <ApptForm key={s.id ?? 'new'} lang={lang} back={back} id={s.id} kind={s.kind} propertyId={s.propertyId} contactId={s.contactId} date={s.date} time={s.time} title={s.title} go={go} />;
    case 'todo': return <TodoScreen lang={lang} go={go} />;
    case 'taskForm': return <TaskForm key={s.id ?? 'new'} lang={lang} back={back} id={s.id} prefill={s.prefill} go={go} />;
    case 'calendar': return <CalendarScreen key={s.date ?? ''} lang={lang} go={go} date={s.date} />;
    case 'gps': return <GpsHome lang={lang} go={go} />;
    case 'houseShopping': return <HouseShopping lang={lang} go={(next, o) => go(next, { replace: next.name === 'journey', ...o })} />;
    case 'journey': return <JourneyDetail key={s.id} lang={lang} go={go} id={s.id} />;
    case 'propertyMap': return <PropertyMap key={s.id ?? ''} lang={lang} go={go} id={s.id} />;
    case 'banners': return <BannerScreen key={s.propertyId ?? ''} lang={lang} go={go} propertyId={s.propertyId} />;
    case 'finance': return <FinanceScreen lang={lang} go={go} />;
    case 'projects': return <ProjectList lang={lang} go={go} />;
    case 'marketNews': return <MarketNewsScreen lang={lang} />;
    case 'projectDetail': return <ProjectDetail lang={lang} id={s.id} go={go} />;
    case 'projectForm': return <ProjectForm lang={lang} id={s.id} go={go} back={back} />;
    case 'dealForm': return <DealForm key={s.id ?? 'new'} lang={lang} back={back} id={s.id} propertyId={s.propertyId} />;
    case 'expenseForm': return <MoneyForm key={s.id ?? 'new-e'} lang={lang} back={back} id={s.id} kind="expense" />;
    case 'incomeForm': return <MoneyForm key={s.id ?? 'new-i'} lang={lang} back={back} id={s.id} kind="income" />;
    case 'calculator': return <CalculatorScreen key={s.propertyId ?? ''} lang={lang} propertyId={s.propertyId} go={go} />;
    case 'buyerPdf': return <BuyerPdfScreen key={s.propertyId} lang={lang} propertyId={s.propertyId} />;
    case 'adTracker': return <AdTrackerScreen key={s.propertyId} lang={lang} go={go} propertyId={s.propertyId} />;
    case 'adSummary': return <AdSummaryScreen lang={lang} go={go} />;
    case 'marketingStudio': return <MarketingStudioScreen key={s.propertyId} lang={lang} propertyId={s.propertyId} />;
    case 'photoStudio': return <PhotoStudioScreen key={s.propertyId} lang={lang} propertyId={s.propertyId} photoId={s.photoId} />;
    case 'profile': return <ProfileScreen lang={lang} go={go} />;
    case 'profileEdit': return <ProfileEdit lang={lang} back={back} />;
    case 'nameCard': return <NameCardSend lang={lang} />;
    case 'settings': return <SettingsScreen lang={lang} go={go} />;
    case 'bugReport': return <BugReportScreen lang={lang} from={s.from ?? 'settings'} />;
    case 'devDashboard': return <DevDashboard />;
    case 'syncReview': return <SyncReviewScreen lang={lang} go={go} />;
    case 'history': return <HistoryScreen key={`${s.collection}:${s.id}`} lang={lang} collection={s.collection} id={s.id} go={go} />;
    case 'recentlyDeleted': return <RecentlyDeletedScreen lang={lang} go={go} />;
    case 'expert': return <ExpertHome lang={lang} go={go} />;
    case 'expertAsk': return <ExpertAsk lang={lang} go={(next, o) => go(next, { replace: true, ...o })} expert={s.expert} propertyId={s.propertyId} />;
    case 'expertThread': return <ExpertThreadScreen key={s.id} lang={lang} go={go} id={s.id} />;
    case 'voice': return <VoiceCommand lang={lang} go={go} />;
    case 'voiceDiag': return <VoiceDiagnostics lang={lang} go={go} />;
    case 'comingSoon': return (
      <section className="card stack-sm coming-soon" data-testid={`soon-${s.key}`}>
        <span className="badge soon-badge fit">{t.comingSoon}</span>
        <p>{t.soon[s.key]}</p>
        <small className="muted">{t.soon.note}</small>
      </section>
    );
    case 'cobroke': return <Cobroke lang={lang} go={go} />;
    case 'creativeMedia': return <CreativeMediaScreen key={s.propertyId ?? ''} lang={lang} go={go} propertyId={s.propertyId} />;
    case 'buyerHistory': return <BuyerHistoryScreen key={s.propertyId} lang={lang} go={go} propertyId={s.propertyId} />;
    case 'buyerMatching': return <BuyerMatchingScreen lang={lang} go={go} />;
    case 'buyerMatches': return <BuyerMatchesScreen key={s.contactId} lang={lang} go={go} contactId={s.contactId} />;
    case 'team': return <TeamScreen lang={lang} go={go} />;
    case 'manageSharing': return <ManageSharingScreen key={s.focus ?? ''} lang={lang} focus={s.focus} />;
    case 'auditSearch': return <AuditSearchScreen key={`${s.collection ?? ''}:${s.id ?? ''}`} lang={lang} go={go} collection={s.collection} id={s.id} />;
    case 'exports': return <ExportManagementScreen lang={lang} go={go} section={s.section} />;
    case 'auditExport': return <AuditExportScreen key={s.keys.join(',')} lang={lang} go={go} keys={s.keys} person={s.person} actions={s.actions} />;
    case 'deal': return <DealScreen key={`${s.propertyId}-${s.kind}`} lang={lang} propertyId={s.propertyId} kind={s.kind} go={go} back={back} />;
    case 'trackSales': return <TrackSalesScreen lang={lang} go={go} />;
  }
}

/** Home (Change 011): the 15 cards and nothing else; the Today and Recent Properties sections were removed. The fixed
 *  advert below the cards is drawn by the shell. */
function Home({ lang, go }: { lang: Lang; go: Go }) {
  const { state } = useApp();
  const t = strings[lang];
  const invite = pendingInviteToken() && !state.meta.team?.members.some(m => m.userId !== state.meta.syncSession?.userId);
  const x1 = cc001Strings[lang];
  const [askAgenda, setAskAgenda] = useState(false);
  const tileLabel = (key: string) => t.tiles[key];
  const unreadNews = useUnreadNews();
  return (
    <section className="stack home">
      {/* ClaudeChanges001 change 2: below the header line, above the cards, only when something did not sync. */}
      <SyncBanner lang={lang} onReview={() => go({ name: 'syncReview' })} />
      <AnnouncementBanners lang={lang} />
      {invite && <button className="card link-card" data-testid="invite-banner" onClick={() => go({ name: 'team' })}><strong>{teamStrings[lang].linkFound}</strong></button>}
      <nav className="grid" aria-label={t.home}>
        {TILES.map((tile, i) => (
          <button key={tile.key} className={`tile ${GOLD_TILES.has(tile.key) ? 'voice-tile gold-tile' : ''} ${tile.key === 'voice' ? 'robot-tile' : ''}`} data-tile={i + 1} data-key={tile.key} onClick={() => (tile.key === 'agenda' ? setAskAgenda(true) : go(tile.target))}
            aria-label={tile.key === 'opportunities' && teamBadgeCount(state) > 0 ? `${tileLabel(tile.key)} · ${teamStrings[lang].newInvites(teamBadgeCount(state))}` : tileLabel(tile.key)}>
            <span className="tile-icon">{tile.icon()}</span><span className="tile-label">{tileLabel(tile.key)}</span>
            {tile.key === 'market' && unreadNews > 0 && <span className="tile-badge" data-testid="market-badge" aria-label={feedStrings[lang].unread(unreadNews)}>{unreadNews > 99 ? '99+' : unreadNews}</span>}
            {tile.key === 'opportunities' && teamBadgeCount(state) > 0 && <span className="tile-badge" data-testid="opportunities-badge" aria-label={teamStrings[lang].newInvites(teamBadgeCount(state))}>{teamBadgeCount(state)}</span>}
          </button>
        ))}
      </nav>
      {askAgenda && (
        <ChoiceDialog lang={lang} title={x1.agendaQ} testId="agenda-ask" onCancel={() => setAskAgenda(false)} choices={[
          { label: x1.calendar, primary: true, testId: 'agenda-calendar', onPick: () => { setAskAgenda(false); go({ name: 'calendar' }); } },
          { label: x1.todo, primary: true, testId: 'agenda-todo', onPick: () => { setAskAgenda(false); go({ name: 'todo' }); } },
        ]} />
      )}
    </section>
  );
}

/** One language button (a globe with the current language); tapping it opens the list of languages (owner, 16 Oct 2026). */
function LangMenu({ lang, onPick }: { lang: Lang; onPick: (l: Lang) => void }) {
  const [open, setOpen] = useState(false);
  const label = c11Strings[lang].top.language;
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('keydown', esc); };
  }, [open]);
  const cur = LANGS.find(l => l.code === lang) ?? LANGS[0];
  return (
    <div className="lang">
      <button type="button" className="icon-btn top-btn lang-btn" aria-haspopup="menu" aria-expanded={open} aria-label={`${label}: ${cur.label}`} title={label} data-testid="lang-btn" onClick={() => setOpen(o => !o)}>
        <span className="lang-text">{cur.short}</span>
      </button>
      {/* Change 29: the list of languages is a centred pop-up (Change 26), not a drop-down under the button. */}
      {open && createPortal(
        <div className="scrim" role="presentation" data-testid="lang-scrim" onPointerDown={(e: EabEvent<Element>) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="dialog lang-menu" role="menu" aria-label={label} data-testid="lang-menu">
            <h2>{label}</h2>
            {LANGS.map(l => (
              <button key={l.code} type="button" role="menuitemradio" aria-checked={lang === l.code} aria-pressed={lang === l.code} aria-label={l.label} data-lang={l.code}
                onClick={() => { setOpen(false); onPick(l.code); }}>
                <span className="lang-short">{l.short}</span> <span>{l.label}</span>
              </button>
            ))}
          </div>
        </div>, document.body)}
    </div>
  );
}

/** JoyChange003 Change 72: one notification in its own box, with a clear Dismiss and "Remind me later" (pick when). */
function NotifBox({ k, title, lang, children, actions = true }: { k: string; title: string; lang: Lang; children: ReactNode; actions?: boolean }) {
  const { store } = useApp();
  const n = strings[lang].notif;
  const [pick, setPick] = useState(false);
  const meta = () => store.getState().meta;
  return (
    <div className="notif-box" data-testid="notif-box" data-key={k}>
      {children}
      {actions && (
        <div className="notif-actions">
          <button type="button" className="btn small secondary" data-testid="notif-dismiss" onClick={() => store.setSingleton('meta', { notifs: dismissMarks(meta(), k, title, Date.now()) })}>{n.dismiss}</button>
          <button type="button" className="btn small secondary" data-testid="notif-later" aria-expanded={pick} onClick={() => setPick(v => !v)}>{n.remindLater}</button>
        </div>
      )}
      {actions && pick && (
        <div className="notif-snooze" role="group" aria-label={n.snoozeTitle} data-testid="notif-snooze">
          {SNOOZE_CHOICES.map(c => (
            <button key={c} type="button" className="btn small" data-testid={`notif-snooze-${c}`} onClick={() => store.setSingleton('meta', { notifs: snoozeMarks(meta(), k, snoozeUntil(c, Date.now())) })}>{n.snooze[c]}</button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Notifications, in two clear sections. System Notifications: reminders and the cloud-sync status. News / Announcements:
 *  messages published by the owner. Publishing is not built yet, so that section is empty for now; the earlier sample
 *  News cards are kept under a clearly marked "sample, not live" preview rather than deleted. Push notifications to the
 *  phone are not claimed to work: that needs a backend and native delivery that are not set up or tested yet.
 *  JoyChange003 Change 72: every notification is its own box with a gap between boxes, can be dismissed (kept in History) or
 *  snoozed. Cloud-sync messages are in Settings only; only a FAILED sync shows here, a good sync never does. */
/** Change 72: everything that can appear in System Notifications, with the key each box is dismissed or snoozed by.
 *  `attention` lists the keys that need attention now (they count on the bell); reminders coming up later do not. */
function notifData(state: ReturnType<Store['getState']>, draftCount: number, now: number) {
  const soon = upcomingReminders(state.tasks, state.appointments, now).filter(r => r.at - now <= 7 * 86_400_000).sort((a, b) => a.at - b.at).slice(0, 30);
  // Change 004: the main screen no longer pops up due reminders; the ones from the last 24 hours (to-dos not done,
  // appointments still scheduled) are listed here instead, so none is missed.
  const recent = upcomingReminders(state.tasks, state.appointments, now - 86_400_000).filter(r => r.at <= now).sort((a, b) => b.at - a.at).slice(0, 30);
  const adAttn = attention(state.properties.filter(p => !p.archived), ymd(new Date(now)));
  const review = state.meta.leadReview && !state.meta.leadReview.reviewed ? reviewContacts(state.contacts, state.meta.leadReview.ids).length : 0;   // only buyers that still exist
  const conflictCount = (state.meta.conflicts ?? []).length + Object.keys(state.meta.recErrors ?? {}).length;
  const driveStale = !!state.meta.driveLast && (!state.meta.driveLastOkAt || now - state.meta.driveLastOkAt > STALE_MS);
  const followDays = state.settings.followUpDays ?? DEFAULT_FOLLOW_UP_DAYS;
  const follow = followUpDue(state.contacts, now, followDays);
  const k = {
    review: `review:${state.meta.leadReview?.at ?? 0}`, conflicts: `conflicts:${conflictCount}`, drafts: `drafts:${draftCount}`, adverts: `adverts:${adAttn.length}`,
    follow: `follow:${follow.map(x => x.contact.id).join(',')}`, drive: `drive:${state.meta.driveLastOkAt ?? 0}`,
  };
  const invites = openInvites(state, now);
  const answers = unseenAnswers(state);
  const attentionKeys = [
    ...(review > 0 ? [k.review] : []), ...(conflictCount > 0 ? [k.conflicts] : []), ...(draftCount > 0 ? [k.drafts] : []), ...(adAttn.length ? [k.adverts] : []),
    ...(follow.length ? [k.follow] : []), ...(driveStale ? [k.drive] : []), ...invites.map(i => `invite:${i.id}`), ...answers.map(a => `answer:${a.id}`),
    ...recent.map(r => `rem:${r.key}`),
  ];
  return { soon, recent, adAttn, review, conflictCount, driveStale, followDays, follow, k, invites, answers, attentionKeys };
}

/** Notifications, in two clear sections. System Notifications: reminders and the cloud-sync status. News / Announcements:
 *  messages published by the owner. Publishing is not built yet, so that section is empty for now; the earlier sample
 *  News cards are kept under a clearly marked "sample, not live" preview rather than deleted. Push notifications to the
 *  phone are not claimed to work: that needs a backend and native delivery that are not set up or tested yet.
 *  JoyChange003 Change 72: every notification is its own box with a gap between boxes, can be dismissed (kept in History, at
 *  the bottom of the screen) or snoozed. Cloud-sync messages are in Settings only; only a FAILED sync shows here. */
function Notifications({ lang, go }: { lang: Lang; go: Go }) {
  const { state, store } = useApp();
  const t = strings[lang];
  const ss = saveStrings[lang];
  const sync = useSaveState();
  const now = Date.now();
  const show = (key: string) => isShown(state.meta, key, now);
  const draftCount = store.allDrafts().length;
  const nd = notifData(state, draftCount, now);
  const { adAttn, review, conflictCount, driveStale, followDays, follow } = nd;
  const soon = nd.soon.filter(r => show(`rem:${r.key}`));
  const recent = nd.recent.filter(r => show(`rem:${r.key}`));
  const perm = permission();
  const signedIn = !!state.meta.syncSession;
  const syncLine = sync === 'failed-phone' ? ss.failedPhone : signedIn && sync === 'failed-sync' ? t.notif.syncFailed : null;
  const { review: kReview, conflicts: kConf, drafts: kDraft, adverts: kAd, follow: kFollow, drive: kDrive } = nd.k;
  const showReview = review > 0 && show(kReview), showConf = conflictCount > 0 && show(kConf), showDraft = draftCount > 0 && show(kDraft);
  const showAd = adAttn.length > 0 && show(kAd), showFollow = follow.length > 0 && show(kFollow), showDrive = driveStale && show(kDrive);
  const invites = nd.invites.filter(i => show(`invite:${i.id}`));
  const answers = nd.answers;
  const history = historyList(state.meta);
  const systemEmpty = !showFollow && soon.length === 0 && recent.length === 0 && !showAd && !syncLine && !showReview && !showConf && !showDraft && !showDrive && invites.length === 0 && answers.length === 0;
  const n = t.newsPage;
  const remRow = (r: DueReminder) => {
    const x = reminderText(r, state, lang);
    return (
      <NotifBox key={r.key} k={`rem:${r.key}`} title={x.title} lang={lang}>
        <button className="link-row" onClick={() => go(r.kind === 'task' ? { name: 'taskForm', id: r.id } : { name: 'apptForm', id: r.id })}>
          <strong>🔔 {x.title}</strong><small className="muted">{fmtDateTime(r.at, lang)} · {x.body}</small>
        </button>
      </NotifBox>
    );
  };
  return (
    <section className="stack" data-testid="notifications">
      <div className="card stack-sm" data-testid="notif-system">
        <div className="card-title">{t.notif.system}</div>
        {syncLine && <NotifBox k="syncfail" title={t.notif.syncTitle} lang={lang} actions={false}><div className={`notif-sync ${sync}`} data-testid="notif-sync" data-state={sync}><strong>{t.notif.syncTitle}</strong><small className="muted">{syncLine}</small></div></NotifBox>}
        {showReview && (
          <NotifBox k={kReview} title={leadReviewStrings[lang].review} lang={lang}>
            <button className="link-row" data-testid="notif-lead-review" onClick={() => go({ name: 'contactsHome' })}>
              <strong>{leadReviewStrings[lang].review}</strong><small className="muted">{leadReviewStrings[lang].notice(review)}</small>
            </button>
          </NotifBox>
        )}
        {showConf && (
          <NotifBox k={kConf} title={syncStrings[lang].review} lang={lang}>
            <button className="link-row" data-testid="notif-conflicts" onClick={() => go({ name: 'syncReview' })}>
              <strong>{syncStrings[lang].review}</strong><small className="muted">{syncStrings[lang].reviewHint(conflictCount)}</small>
            </button>
          </NotifBox>
        )}
        {showDraft && (
          <NotifBox k={kDraft} title={syncStrings[lang].drafts} lang={lang}>
            <div className="stack-sm" data-testid="notif-drafts"><strong>{syncStrings[lang].drafts}</strong><small className="muted">{syncStrings[lang].draftsHint(draftCount)}</small><DraftsList lang={lang} go={go} /></div>
          </NotifBox>
        )}
        {showAd && (
          <NotifBox k={kAd} title={adStrings[lang].attention} lang={lang}>
            <button className="link-row" data-testid="notif-adverts" onClick={() => go({ name: 'adSummary' })}>
              <strong>📣 {adStrings[lang].attention} ({adAttn.length})</strong><small className="muted">{adStrings[lang].summaryTitle}</small>
            </button>
          </NotifBox>
        )}
        {showFollow && (
          <NotifBox k={kFollow} title={followStrings[lang].title} lang={lang}>
            <div className="stack-sm" data-testid="notif-followup">
              <strong>{followStrings[lang].title}</strong>
              <small className="muted">{followStrings[lang].notice(follow.length, followDays)}</small>
              {follow.slice(0, 5).map(x => (
                <button key={x.contact.id} className="link-row" data-testid="followup-row" onClick={() => go({ name: 'contactDetail', id: x.contact.id })}>
                  <strong>{x.contact.name}</strong><small className="muted">{x.contact.lastInteraction ? followStrings[lang].quiet(x.quietDays) : followStrings[lang].never}</small>
                </button>
              ))}
            </div>
          </NotifBox>
        )}
        {invites.map(i => (
          <NotifBox key={i.id} k={`invite:${i.id}`} title={teamStrings[lang].invNotifFrom(personLabel(i.fromName, i.fromEmail))} lang={lang}>
            <button className="link-row" data-testid="notif-invite" onClick={() => go({ name: 'team' })}>
              <strong>{teamStrings[lang].invNotifFrom(personLabel(i.fromName, i.fromEmail))}</strong>
              <small className="muted">{teamStrings[lang].invNotifHint}</small>
            </button>
          </NotifBox>
        ))}
        {answers.map(a => (
          <NotifBox key={a.id} k={`answer:${a.id}`} title="" lang={lang} actions={false}>
            <div className="link-row" data-testid="notif-invite-answer">
              <strong>{(a.status === 'accepted' ? teamStrings[lang].invAnsAccepted : teamStrings[lang].invAnsDeclined)(personLabel(a.name, a.email))}</strong>
              <button className="btn small secondary" data-testid="notif-invite-answer-ok" onClick={() => markAnswersSeen(store, [a.id])}>{teamStrings[lang].invGotIt}</button>
            </div>
          </NotifBox>
        ))}
        {showDrive && (
          <NotifBox k={kDrive} title={backupStrings[lang].driveTitle} lang={lang}>
            <button className="link-row" data-testid="notif-drive" onClick={() => go({ name: 'settings' })}>
              <strong>{backupStrings[lang].driveTitle}</strong>
              <small className="muted">{state.meta.driveLastOkAt ? backupStrings[lang].driveStale(fmtDateTime(state.meta.driveLastOkAt, lang)) : backupStrings[lang].driveNever}</small>
            </button>
          </NotifBox>
        )}
        {systemEmpty && <small className="muted" data-testid="notif-empty-system">{t.notif.empty}</small>}
        {recent.length > 0 && <>
          <strong>{t.notif.recent}</strong>
          <div className="notif-stack" data-testid="notif-recent">{recent.map(remRow)}</div>
        </>}
        {soon.length > 0 && <div className="notif-stack" data-testid="notif-soon">{soon.map(remRow)}</div>}
      </div>
      <div className="card stack-sm" data-testid="notif-news">
        <div className="card-title">{t.notif.newsTitle}</div>
        <small className="muted" data-testid="notif-empty-news">{t.notif.empty}</small>
        <details className="news-sample">
          <summary>{t.notif.previewTitle}</summary>
          <div className="stack-sm">
            <p className="small">{n.banner}</p>
            {n.cards.map(([cat, head]) => (
              <article key={cat} className="stack-sm">
                <span className="eyebrow">{cat}</span>
                <strong>{head}</strong>
                <small className="muted">{n.sampleOnly}</small>
              </article>
            ))}
            <p className="notice">{n.rule}</p>
          </div>
        </details>
      </div>
      <div className="card stack-sm coming-soon">
        <div className="between"><div className="card-title">{t.notif.push}</div><span className="badge soon-badge fit">{t.comingSoon}</span></div>
        <small className="muted">{t.notif.pushBody}</small>
      </div>
      <div className="card stack-sm">
        <div className="card-title">{t.notif.settings}</div>
        <small className="muted">{t.reminders.note}</small>
        {perm === 'granted' ? <small className="ok-text">{t.reminders.allowed}</small> : perm === 'denied' ? <small className="warn-text">{t.reminders.blocked}</small> : null}
      </div>
      {/* Change 72: History, at the bottom of the screen. */}
      <div className="card stack-sm notif-history-card">
          <details className="notif-history" data-testid="notif-history">
          <summary>{t.notif.history} ({history.length})</summary>
          {history.length === 0 ? <small className="muted" data-testid="notif-history-empty">{t.notif.historyEmpty}</small> : (
            <div className="notif-stack">
              <small className="muted">{t.notif.historyHint}</small>
              {history.map(h => (
                <div key={h.key} className="notif-box notif-hist-row" data-testid="notif-history-row">
                  <strong>{h.title}</strong><small className="muted">{fmtDateTime(h.at, lang)}</small>
                  <div className="notif-actions"><button type="button" className="btn small secondary" data-testid="notif-restore" onClick={() => store.setSingleton('meta', { notifs: restoreMarks(store.getState().meta, h.key) })}>{t.notif.restore}</button></div>
                </div>
              ))}
            </div>
          )}
        </details>
      </div>
    </section>
  );
}

function Cobroke({ lang, go }: { lang: Lang; go: Go }) {
  const { state } = useApp();
  const t = strings[lang].cobrokePage;
  const n = state.properties.filter(p => p.arrangement === 'cobroke').length;
  return (
    <section className="stack" data-testid="cobroke">
      <div className="card stack-sm coming-soon" data-testid="cobroke-soon">
        <span className="badge soon-badge fit">{strings[lang].comingSoon}</span>
        <p>{t.soonBody}</p>
        <small className="muted">{strings[lang].soon.note}</small>
      </div>
      <div className="card stack-sm">
        <p>{t.intro}</p>
        <strong data-testid="cobroke-count">{t.count(n)}</strong>
        {n > 0
          ? <button className="btn primary" onClick={() => go({ name: 'listing', filters: { arrangement: 'cobroke' } })}>{t.show}</button>
          : <small className="muted">{t.none}</small>}
      </div>
    </section>
  );
}
