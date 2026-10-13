// Estate Agent AI Buddy: the app shell. Opens the phone's storage, draws the header and the current screen, keeps the
// Back history (including the Android back button), shows short messages and runs the reminder checks.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Lang, LANGS, strings, htmlLang } from './i18n';
import { openBackend } from './data/backend';
import { Store } from './data/store';
import { StoreContext, useApp, useSaveState } from './data/useStore';
import { Screen, Go } from './nav';
import { ToastContext, ToastKind, TOAST_OK_MS, TOAST_ERROR_MS } from './ui/toast';
import { SaveStatus } from './ui/SaveStatus';
import { saveStrings } from './ui/savestrings';
import { beginStartup, startupLang, StartupPhase } from './startup/startup';
import { startupStrings } from './startup/strings';
import { dueReminders, upcomingReminders, todayCounts, DueReminder } from './domain/workflow';
import { permission } from './lib/notify';
import { showNow, scheduleNative, idFor } from './lib/notify';
import { fmtDateTime } from './lib/dates';
import { cardTitle, mainPhoto, placeName } from './listing/model';
import { listingStrings } from './listing/strings';
import { agendaStrings } from './agenda/strings';
import { contactStrings } from './contacts/strings';
import { gpsStrings } from './gps/strings';
import { financeStrings } from './finance/strings';
import { calcStrings } from './calculator/strings';
import { profileStrings } from './profile/strings';
import { expertStrings } from './expert/strings';
import { PropertyListing, ListingDetails, PriceLine } from './listing/ListingUI';
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
import { StoredImage } from './ui/common';
import { StartChoice, needsStartChoice } from './ui/StartChoice';
import {
  IconBack, IconTodo, IconCalendar, IconTrend, IconHome, IconGps, IconExpert, IconBell, IconContacts, IconChat,
  IconMic, IconLogo, IconMoney, IconCalc, IconCard, IconProject, IconCobroke, IconSubsale, IconMarket,
} from './icons';
import { nativeLook, hideSplash } from './native/native';
import { UpdateBanner } from './native/UpdateUI';
import { BUILD } from './native/updates';
import { LoginScreen } from './auth/LoginScreen';
import { config } from './config';
import { configured, holdsOtherWorkspaceData, ownerUnknownWithData } from './data/sync';
import { runSync } from './data/syncRunner';
import { syncStrings } from './sync/strings';
import { SyncReviewScreen, HistoryScreen, RecentlyDeletedScreen, DraftsList, OtherWorkspaceScreen, OwnerUnknownScreen } from './sync/SyncUI';
import { pendingFileCount } from './data/savestate';
import { convertInactive, inactiveContacts, reviewContacts } from './data/leadReview';
import { backupDue, driveUsable, runDriveBackup } from './backup/drive';
import { backupStrings } from './backup/strings';
import { STALE_MS } from './backup/BackupUI';
import { leadReviewStrings } from './data/leadReviewStrings';

/** The 15 home buttons, in the order approved on 13 Oct 2026 (3 columns × 5 rows on a phone). Settings is no longer a
 *  card: it lives inside Agent Profile. News is no longer a card: News / Announcements is a section of Notifications.
 *  Subsale, Project and Market Intelligence are honest Coming Soon screens (`soon`): nothing on them pretends to work.
 *  Co-broke Opportunities (Coming Soon) and Notifications stay in the top bar. */
export const TILES: { key: string; icon: () => JSX.Element; target: Screen; soon?: boolean }[] = [
  { key: 'todo', icon: () => <IconTodo />, target: { name: 'todo' } },
  { key: 'calendar', icon: () => <IconCalendar />, target: { name: 'calendar' } },
  { key: 'opportunities', icon: () => <IconTrend />, target: { name: 'opportunities' } },
  { key: 'property', icon: () => <IconHome />, target: { name: 'listing' } },
  { key: 'contacts', icon: () => <IconContacts />, target: { name: 'contactsHome' } },
  { key: 'activity', icon: () => <IconChat />, target: { name: 'activity' } },
  { key: 'gps', icon: () => <IconGps />, target: { name: 'gps' } },
  { key: 'finance', icon: () => <IconMoney />, target: { name: 'finance' } },
  { key: 'calculator', icon: () => <IconCalc />, target: { name: 'calculator' } },
  { key: 'profile', icon: () => <IconCard />, target: { name: 'profile' } },
  { key: 'expert', icon: () => <IconExpert />, target: { name: 'expert' } },
  { key: 'subsale', icon: () => <IconSubsale />, target: { name: 'comingSoon', key: 'subsale' }, soon: true },
  { key: 'project', icon: () => <IconProject />, target: { name: 'comingSoon', key: 'project' }, soon: true },
  { key: 'market', icon: () => <IconMarket />, target: { name: 'comingSoon', key: 'market' }, soon: true },
  { key: 'voice', icon: () => <IconMic />, target: { name: 'voice' } },
];

/** Startup is driven by readiness, not by a timer: the dashboard appears the moment the phone's storage is open, however
 *  early that is. Only if opening takes longer than about five seconds does the screen say so; if it fails, the screen
 *  says that and offers "Try again". Nothing here waits for the internet. */
export default function App() {
  const [store, setStore] = useState<Store | null>(null);
  const [phase, setPhase] = useState<StartupPhase>('opening');
  const [attempt, setAttempt] = useState(0);
  const [gone, setGone] = useState(false);
  const lang = startupLang(typeof navigator === 'undefined' ? undefined : navigator.languages);
  useEffect(() => beginStartup(() => openBackend().then(Store.open), (p, value) => {
    setPhase(p);
    if (p === 'ready' && value) setStore(value);
  }), [attempt]);
  // The Android splash (a still logo) is hidden as soon as the app can draw, so the spinning logo follows straight on.
  useEffect(() => { void hideSplash(); }, []);
  useEffect(() => { if (store) void nativeLook(); }, [store]);
  // After the short fade-out the cover is removed from the page altogether.
  useEffect(() => { if (phase !== 'ready') return; const x = setTimeout(() => setGone(true), FADE_MS); return () => clearTimeout(x); }, [phase]);
  return (
    <>
      {store && <StoreContext.Provider value={store}><Gate /></StoreContext.Provider>}
      {!gone && <StartupLogo phase={phase} lang={store?.getState().settings.lang ?? lang} onRetry={() => setAttempt(n => n + 1)} />}
    </>
  );
}

/** The cover fades away over this long once the app is ready (only a visual fade; it never holds the dashboard back). */
export const FADE_MS = 120;

/** Startup cover: the logo and one truthful line about what is happening. The spin is decoration only. People who ask
 *  the phone for reduced motion get a short fade instead of the spin. */
function StartupLogo({ phase, lang, onRetry }: { phase: StartupPhase; lang: Lang; onRetry: () => void }) {
  const s = startupStrings[lang];
  const text = phase === 'failed' ? s.failed : phase === 'slow' ? s.slow : s.opening;
  return (
    <div className={`intro${phase === 'ready' ? ' leaving' : ''}`} data-testid="startup-logo" data-phase={phase}>
      <div className="intro-stage" aria-hidden="true"><IconLogo size={168} big splash /></div>
      {phase !== 'ready' && <p className={`intro-msg ${phase}`} role={phase === 'failed' ? 'alert' : 'status'} data-testid="startup-msg">{text}</p>}
      {(phase === 'slow' || phase === 'failed') && <button className="btn secondary" data-testid="startup-retry" onClick={onRetry}>{s.retry}</button>}
    </div>
  );
}

/** Sign-in first when Google sign-in is set up and nobody is signed in on this phone; otherwise the app. */
function Gate() {
  const { state } = useApp();
  const lang: Lang = state.settings.lang ?? 'en';
  if (configured(config(state.settings)) && !state.meta.syncSession) return <LoginScreen lang={lang} />;
  // Signed in to a different team than the one whose records are on this phone: show none of them, send none of them.
  if (holdsOtherWorkspaceData(state, state.meta.syncSession?.workspaceId)) return <OtherWorkspaceScreen lang={lang} />;
  if (ownerUnknownWithData(state, state.meta.syncSession?.workspaceId)) return <OwnerUnknownScreen lang={lang} />;
  return <Shell />;
}

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
      try { await runSync(store, cfg); }
      finally { busy.current = false; }
    };
    void run(true);
    const t = setInterval(() => void run(), 60_000);
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
  const [toast, setToast] = useState<{ text: string; kind: ToastKind } | null>(null);
  const [alerts, setAlerts] = useState<DueReminder[]>([]);
  useAutoSync();
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
    if (!opts?.replace) { stack.current.push(screen); window.history.pushState({ eab: stack.current.length }, ''); }
    setScreen(next);
    window.scrollTo(0, 0);
  }, [screen]);
  const back = useCallback(() => {
    if (stack.current.length) window.history.back(); else setScreen({ name: 'home' });
  }, []);
  // The Android back button and the browser's Back both arrive here.
  useEffect(() => {
    const onPop = () => { const prev = stack.current.pop(); setScreen(prev ?? { name: 'home' }); window.scrollTo(0, 0); };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

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
    const ads = adReminders(state.properties, Date.now()).map(r => {
      const p = state.properties.find(z => z.id === r.propertyId); const a = p?.marketing?.ads.find(z => z.id === r.adId);
      return { id: idFor(r.key), at: r.at, title: adStrings[lang].reminderTitle, body: adStrings[lang].reminderBody(p ? (p.ref ?? cardTitle(p)) : '', a?.platform ?? '', r.days) };
    });
    void scheduleNative([...list, ...ads]);
  }, [state.tasks, state.appointments, state.properties, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  const title = screenTitle(screen, lang, state);
  // Bell badge: reminders due today that are not yet done.
  const notifCount = alerts.length + todayCounts(state.tasks, state.appointments, new Date()).tasksDue;

  return (
    <ToastContext.Provider value={showToast}>
      <div className="shell">
        <header className={screen.name === 'home' ? 'topbar home' : 'topbar'}>
          {screen.name !== 'home' && <button className="icon-btn" onClick={back} aria-label={t.back}><IconBack /></button>}
          {screen.name === 'home'
            ? <h1 className="brand" aria-label={t.appName}><IconLogo size={46} /><span className="wordmark"><span>{t.appNameA}</span><em>{t.appNameB}</em></span></h1>
            : <h1>{title}</h1>}
          {screen.name === 'home' && <>
            <button className="icon-btn top-btn cobroke-btn" onClick={() => go({ name: 'cobroke' })} aria-label={`${t.cobrokeTop} (${t.comingSoon})`} title={`${t.cobrokeTop} · ${t.comingSoon}`} data-testid="top-cobroke">
              <IconCobroke /><span className="top-soon" aria-hidden="true">{t.soonShort}</span>
            </button>
            <button className="icon-btn top-btn notif-btn" onClick={() => go({ name: 'notifications' })} aria-label={t.notifications} title={t.notifications} data-testid="top-notifications">
              <IconBell />{notifCount > 0 && <span className="top-badge" aria-hidden="true">{notifCount > 9 ? '9+' : notifCount}</span>}
            </button>
          </>}
          <div className="lang" role="group" aria-label={t.langSwitch}>
            {LANGS.map(l => <button key={l.code} aria-pressed={lang === l.code} aria-label={l.label} onClick={() => store.setSingleton('settings', { lang: l.code })}>{l.short}</button>)}
          </div>
        </header>
        {!store.persistent && <div className="proto-bar" role="alert">{t.storage.notPersistent}</div>}
        {BUILD.qa && <div className="proto-bar qa-bar" role="status" data-testid="qa-bar">QA · {BUILD.sha} · {t.update.qaOff(BUILD.sha)}</div>}
        <UpdateBanner lang={lang} />
        <SaveStatus lang={lang} />

        {alerts.length > 0 && (
          <div className="alerts" role="status" data-testid="reminder-alerts">
            {alerts.map(a => {
              const r = reminderText(a, state, lang);
              return (
                <div key={a.key} className="alert">
                  <span>🔔 <strong>{r.title}</strong> · {r.body}</span>
                  <div className="row-wrap">
                    <button className="btn small primary" onClick={() => { setAlerts(x => x.filter(y => y.key !== a.key)); go(a.kind === 'task' ? { name: 'taskForm', id: a.id } : { name: 'apptForm', id: a.id }); }}>{t.reminders.openItem}</button>
                    <button className="btn small secondary" onClick={() => setAlerts(x => x.filter(y => y.key !== a.key))}>{t.reminders.dismiss}</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <main className="content">
          <ScreenView screen={screen} lang={lang} go={go} back={back} />
        </main>

        {needsStartChoice(state) && <StartChoice lang={lang} />}

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
  }
}

function ScreenView({ screen: s, lang, go, back }: { screen: Screen; lang: Lang; go: Go; back: () => void }) {
  const t = strings[lang];
  switch (s.name) {
    case 'home': return <Home lang={lang} go={go} />;
    case 'notifications': return <Notifications lang={lang} go={go} />;
    case 'contactsHome': return <ContactsHome lang={lang} go={go} />;
    case 'opportunities': return <section className="card stack-sm" data-testid="opportunities"><h2>{t.notBuilt}</h2><p>{t.opportunitiesBody}</p></section>;
    case 'listing': return <PropertyListing key={JSON.stringify(s.filters ?? {})} lang={lang} go={go} initial={s.filters} />;
    case 'listingDetail': return <ListingDetails key={s.id} lang={lang} id={s.id} go={go} />;
    case 'listingForm': return <ListingForm key={`${s.id ?? 'new'}-${s.section ?? ''}`} lang={lang} id={s.id} prefill={s.prefill} section={s.section} back={back}
      go={(next, o) => go(next, { replace: true, ...o })} />;
    case 'contacts': return <ContactsList key={s.role} lang={lang} go={go} role={s.role} />;
    case 'contactDetail': return <ContactDetail key={s.id} lang={lang} go={go} id={s.id} />;
    case 'contactForm': return <ContactForm key={s.id ?? 'new'} lang={lang} go={(next, o) => go(next, { replace: next.name === 'contactDetail', ...o })} back={back} id={s.id} role={s.role} prefill={s.prefill} />;
    case 'activity': return <ActivityScreen lang={lang} go={go} propertyId={s.propertyId} contactId={s.contactId} tab={s.tab} />;
    case 'inquiryForm': return <InquiryForm key={s.id ?? 'new'} lang={lang} back={back} id={s.id} propertyId={s.propertyId} contactId={s.contactId} />;
    case 'apptForm': return <ApptForm key={s.id ?? 'new'} lang={lang} back={back} id={s.id} kind={s.kind} propertyId={s.propertyId} contactId={s.contactId} date={s.date} time={s.time} title={s.title} />;
    case 'todo': return <TodoScreen lang={lang} go={go} />;
    case 'taskForm': return <TaskForm key={s.id ?? 'new'} lang={lang} back={back} id={s.id} prefill={s.prefill} />;
    case 'calendar': return <CalendarScreen key={s.date ?? ''} lang={lang} go={go} date={s.date} />;
    case 'gps': return <GpsHome lang={lang} go={go} />;
    case 'houseShopping': return <HouseShopping lang={lang} go={(next, o) => go(next, { replace: next.name === 'journey', ...o })} />;
    case 'journey': return <JourneyDetail key={s.id} lang={lang} go={go} id={s.id} />;
    case 'propertyMap': return <PropertyMap key={s.id ?? ''} lang={lang} go={go} id={s.id} />;
    case 'banners': return <BannerScreen key={s.propertyId ?? ''} lang={lang} go={go} propertyId={s.propertyId} />;
    case 'finance': return <FinanceScreen lang={lang} go={go} />;
    case 'dealForm': return <DealForm key={s.id ?? 'new'} lang={lang} back={back} id={s.id} propertyId={s.propertyId} />;
    case 'expenseForm': return <MoneyForm key={s.id ?? 'new-e'} lang={lang} back={back} id={s.id} kind="expense" />;
    case 'incomeForm': return <MoneyForm key={s.id ?? 'new-i'} lang={lang} back={back} id={s.id} kind="income" />;
    case 'calculator': return <CalculatorScreen key={s.propertyId ?? ''} lang={lang} propertyId={s.propertyId} />;
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
  }
}

function Home({ lang, go }: { lang: Lang; go: Go }) {
  const { state } = useApp();
  const t = strings[lang];
  const ls = listingStrings[lang];
  const today = todayCounts(state.tasks, state.appointments, new Date());
  const recent = [...state.properties].sort((a, b) => b.updated - a.updated).slice(0, 3);
  return (
    <section className="stack home">
      <nav className="grid" aria-label={t.home}>
        {TILES.map((tile, i) => (
          <button key={tile.key} className={`tile ${tile.key === 'voice' ? 'voice-tile' : ''} ${tile.soon ? 'soon' : ''}`} data-tile={i + 1} onClick={() => go(tile.target)}
            aria-label={tile.soon ? `${t.tiles[tile.key]} (${t.comingSoon})` : t.tiles[tile.key]}>
            <span className="tile-icon">{tile.icon()}</span><span className="tile-label">{t.tiles[tile.key]}</span>
            {tile.soon && <span className="tile-soon" aria-hidden="true">{t.comingSoon}</span>}
          </button>
        ))}
      </nav>

      <div className="card today-card" data-testid="today">
        <div className="card-title">{t.today.title}</div>
        {today.tasksDue + today.apptsToday + today.pendingViewings === 0 ? <small className="muted">{t.today.clear}</small> : (
          <div className="row-wrap">
            {today.tasksDue > 0 && <button className="chip-btn" onClick={() => go({ name: 'todo' })}>{t.today.tasks(today.tasksDue)}</button>}
            {today.apptsToday > 0 && <button className="chip-btn" onClick={() => go({ name: 'calendar' })}>{t.today.appts(today.apptsToday)}</button>}
            {today.pendingViewings > 0 && <button className="chip-btn" onClick={() => go({ name: 'activity', tab: 'viewings' })}>{t.today.pending(today.pendingViewings)}</button>}
          </div>
        )}
      </div>

      {recent.length > 0 && <>
        <h2>{t.recentProperties}</h2>
        <div className="photo-cards">
          {recent.map(l => {
            const p = mainPhoto(l)!;
            return (
              <button key={l.id} className="photo-card" onClick={() => go({ name: 'listingDetail', id: l.id })} aria-label={`${ls.open}: ${cardTitle(l) || ls.untitled}`}>
                <span className="photo"><StoredImage fileId={p.fileId} url={p.url} /></span>
                <strong>{cardTitle(l) || ls.untitled}</strong><small>{placeName(l) || '—'}</small><span><PriceLine l={l} s={ls} short /></span>
              </button>
            );
          })}
        </div>
      </>}
    </section>
  );
}

/** Notifications, in two clear sections. System Notifications: reminders and the cloud-sync status. News / Announcements:
 *  messages published by the owner. Publishing is not built yet, so that section is empty for now; the earlier sample
 *  News cards are kept under a clearly marked "sample, not live" preview rather than deleted. Push notifications to the
 *  phone are not claimed to work: that needs a backend and native delivery that are not set up or tested yet. */
function Notifications({ lang, go }: { lang: Lang; go: Go }) {
  const { state, store } = useApp();
  const t = strings[lang];
  const ss = saveStrings[lang];
  const sync = useSaveState();
  const now = Date.now();
  const soon = upcomingReminders(state.tasks, state.appointments, now).filter(r => r.at - now <= 7 * 86_400_000).sort((a, b) => a.at - b.at).slice(0, 30);
  const adAttn = attention(state.properties, ymd(new Date()));
  const perm = permission();
  const waiting = state.meta.dirty.length;
  const signedIn = !!state.meta.syncSession;
  const conflictCount0 = (state.meta.conflicts ?? []).length;
  const syncLine = sync === 'failed-phone' ? ss.failedPhone
    : !signedIn ? null
      : sync === 'failed-sync' ? t.notif.syncFailed
        : sync === 'conflict' ? ss.conflict(conflictCount0)
        : sync === 'syncing' ? ss.syncing
          : waiting > 0 ? t.notif.syncWaiting(waiting)
            : state.meta.lastSync ? t.notif.syncOk(fmtDateTime(state.meta.lastSync, lang)) : null;
  const review = state.meta.leadReview && !state.meta.leadReview.reviewed ? reviewContacts(state.contacts, state.meta.leadReview.ids).length : 0;   // only buyers that still exist
  const conflictCount = (state.meta.conflicts ?? []).length + Object.keys(state.meta.recErrors ?? {}).length;
  const draftCount = store.allDrafts().length;
  const driveStale = !!state.meta.driveLast && (!state.meta.driveLastOkAt || Date.now() - state.meta.driveLastOkAt > STALE_MS);
  const systemEmpty = soon.length === 0 && adAttn.length === 0 && !syncLine && review === 0 && conflictCount === 0 && draftCount === 0 && !driveStale;
  const n = t.newsPage;
  return (
    <section className="stack" data-testid="notifications">
      <div className="card stack-sm" data-testid="notif-system">
        <div className="card-title">{t.notif.system}</div>
        {review > 0 && (
          <button className="link-row" data-testid="notif-lead-review" onClick={() => go({ name: 'contactsHome' })}>
            <strong>{leadReviewStrings[lang].review}</strong><small className="muted">{leadReviewStrings[lang].notice(review)}</small>
          </button>
        )}
        {conflictCount > 0 && (
          <button className="link-row" data-testid="notif-conflicts" onClick={() => go({ name: 'syncReview' })}>
            <strong>{syncStrings[lang].review}</strong><small className="muted">{syncStrings[lang].reviewHint(conflictCount)}</small>
          </button>
        )}
        {draftCount > 0 && (
          <div className="stack-sm" data-testid="notif-drafts"><strong>{syncStrings[lang].drafts}</strong><small className="muted">{syncStrings[lang].draftsHint(draftCount)}</small><DraftsList lang={lang} go={go} /></div>
        )}
        {adAttn.length > 0 && (
          <button className="link-row" data-testid="notif-adverts" onClick={() => go({ name: 'adSummary' })}>
            <strong>📣 {adStrings[lang].attention} ({adAttn.length})</strong><small className="muted">{adStrings[lang].summaryTitle}</small>
          </button>
        )}
        {driveStale && (
          <button className="link-row" data-testid="notif-drive" onClick={() => go({ name: 'settings' })}>
            <strong>{backupStrings[lang].driveTitle}</strong>
            <small className="muted">{state.meta.driveLastOkAt ? backupStrings[lang].driveStale(fmtDateTime(state.meta.driveLastOkAt, lang)) : backupStrings[lang].driveNever}</small>
          </button>
        )}
        {systemEmpty && <small className="muted" data-testid="notif-empty-system">{t.notif.empty}</small>}
        {syncLine && <div className={`notif-sync ${sync}`} data-testid="notif-sync" data-state={sync}><strong>{t.notif.syncTitle}</strong><small className="muted">{syncLine}</small></div>}
        {soon.length > 0 && (
          <ul className="notif-list">
            {soon.map(r => {
              const x = reminderText(r, state, lang);
              return (
                <li key={r.key}>
                  <button className="link-row" onClick={() => go(r.kind === 'task' ? { name: 'taskForm', id: r.id } : { name: 'apptForm', id: r.id })}>
                    <strong>🔔 {x.title}</strong><small className="muted">{fmtDateTime(r.at, lang)} · {x.body}</small>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
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
