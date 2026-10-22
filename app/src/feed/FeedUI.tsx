// MainForAdmin-D screens: Market News and Intelligence, Admin-pushed Projects with invitation codes, announcements
// (banner / pop-up), force update and maintenance mode. Everything shown comes from the company's database (feed.ts).
import { useEffect, useRef, useState } from 'react';
import type { Lang } from '../i18n';
import { useApp } from '../data/useStore';
import { config } from '../config';
import { configured } from '../data/sync';
import { openInBrowser } from '../native/native';
import { BUILD } from '../native/updates';
import { fmtDateTime } from '../lib/dates';
import { rm } from '../lib/money';
import { feedStrings } from './strings';
import {
  FeedItem, markFeed, maintenanceActive, maintenanceText, myFeed, ofKind, openBanners, openPopups, redeemCode,
  refreshPublicSettings, safeUrl, unreadNews, updateVerdict, type RedeemResult,
} from './feed';

function useFeed() {
  const { state, store } = useApp();
  void state;   // re-render when the store changes
  return { store, items: myFeed(store), cfg: config(store.getState().settings) };
}

/** The unread count for the megaphone badge. */
export function useUnreadNews(): number { return unreadNews(useFeed().items); }

const open = (u?: string) => { if (u) void openInBrowser(u); };

/** MainForAdmin-E: a post opened from a tapped push alert starts open, is marked read once, and is scrolled into view. */
function useTappedPost(openId: string | undefined, items: FeedItem[], setOpenId: (id: string) => void) {
  const { store, cfg } = useFeed();
  const done = useRef(false);
  const item = openId ? items.find(i => i.id === openId) : undefined;
  useEffect(() => {
    if (done.current || !item) return;
    done.current = true;
    setOpenId(item.id);
    if (!item.opened_at) void markFeed(store, cfg, item.id, 'opened');
    const el = typeof document !== 'undefined' ? document.querySelector(`[data-id="${item.id}"]`) : null;
    (el as HTMLElement | null)?.scrollIntoView?.({ block: 'start' });
  }, [item, store, cfg, setOpenId]);
}

function Links({ item, lang }: { item: FeedItem; lang: Lang }) {
  const t = feedStrings[lang];
  const link = safeUrl(item.link_url); const pdf = safeUrl(item.pdf_url);
  if (!link && !pdf) return null;
  return (
    <div className="btn-row">
      {link && <button type="button" className="btn small secondary" onClick={() => open(link)} data-testid="feed-link">{t.openLink}</button>}
      {pdf && <button type="button" className="btn small secondary" onClick={() => open(pdf)} data-testid="feed-pdf">{t.openPdf}</button>}
    </div>
  );
}

// ---------- Market News and Intelligence ----------
export function MarketNewsScreen({ lang, openId: tapped }: { lang: Lang; openId?: string }) {
  const { store, items, cfg } = useFeed();
  const t = feedStrings[lang];
  const news = ofKind(items, 'news');
  const [openId, setOpenId] = useState<string | null>(null);
  useTappedPost(tapped, news, setOpenId);
  const at = store.getState().meta.feed?.at;
  const stale = !at || Date.now() - at > 30 * 60_000;
  const unread = unreadNews(items);
  function toggle(i: FeedItem) {
    const next = openId === i.id ? null : i.id;
    setOpenId(next);
    if (next && !i.opened_at) void markFeed(store, cfg, i.id, 'opened');
  }
  return (
    <section className="stack" data-testid="market-news">
      {unread > 0 && <p className="small muted" data-testid="news-unread">{t.unread(unread)}</p>}
      {news.length === 0 && <p className="muted empty" data-testid="news-empty">{t.noNews}</p>}
      {news.length > 0 && stale && typeof navigator !== 'undefined' && navigator.onLine === false && <p className="small muted">{t.offlineNote}</p>}
      <ul className="feed-list">
        {news.map(i => {
          const img = safeUrl(i.image_url); const isOpen = openId === i.id;
          return (
            <li key={i.id} className={`card feed-card ${i.opened_at ? '' : 'unread'}`} data-testid="news-card" data-id={i.id}>
              <button type="button" className="feed-head" onClick={() => toggle(i)} aria-expanded={isOpen} data-testid="news-open">
                <span className="between"><strong>{i.title}</strong>{!i.opened_at && <span className="badge new-badge fit" data-testid="news-new">{t.newBadge}</span>}</span>
                {i.published_at && <small className="muted">{fmtDateTime(i.published_at, lang)}</small>}
              </button>
              {img && <img className="feed-img" src={img} alt="" loading="lazy" referrerPolicy="no-referrer" />}
              {i.body && <p className={isOpen ? 'feed-body' : 'feed-body clamp'} data-testid="news-body">{i.body}</p>}
              {isOpen && <Links item={i} lang={lang} />}
              {(i.body || i.link_url || i.pdf_url) && <button type="button" className="link-btn small" onClick={() => toggle(i)}>{isOpen ? t.showLess : t.readMore}</button>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---------- Projects pushed from Admin EAB (shown under "Add New Project") ----------
export function PushedProjects({ lang, openId: tapped }: { lang: Lang; openId?: string }) {
  const { store, items, cfg } = useFeed();
  const t = feedStrings[lang];
  const list = ofKind(items, 'project');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<RedeemResult | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  useTappedPost(tapped, list, setOpenId);
  const signedIn = !!store.getState().meta.syncSession && configured(cfg);
  async function add() {
    if (busy) return;
    setBusy(true); setRes(null);
    try { const r = await redeemCode(store, cfg, code, store.getState().settings.lang ?? 'en'); setRes(r); if (r.ok) setCode(''); }
    finally { setBusy(false); }
  }
  return (
    <section className="stack-sm" data-testid="pushed-projects">
      <h2 className="section-title">{t.pushedTitle}</h2>
      {signedIn && <>
        <p className="small muted">{t.codeHint}</p>
        <label className="ff">{t.codeLabel}
          <span className="row-input">
            <input value={code} onChange={e => { setCode(e.target.value.toUpperCase()); setRes(null); }} placeholder={t.codePh} autoCapitalize="characters" autoComplete="off"
              spellCheck={false} maxLength={30} data-testid="code-input" onKeyDown={e => { if (e.key === 'Enter') void add(); }} />
            <button type="button" className="btn primary" onClick={() => void add()} disabled={busy} data-testid="code-add">{busy ? t.codeBusy : t.codeGo}</button>
          </span>
        </label>
        {res && (res.ok
          ? <p className="ok-text" role="status" data-testid="code-ok">{t.codeAdded(res.added)}</p>
          : <p className="error" role="alert" data-testid="code-error">{t.codeErr[res.reason] ?? t.codeErr.other}</p>)}
      </>}
      {list.length === 0 && <p className="muted" data-testid="pushed-empty">{t.noPushed}</p>}
      {list.length > 0 && <small className="muted">{t.pushedNote}</small>}
      <ul className="project-list">
        {list.map(i => {
          const p = i.project ?? {}; const img = safeUrl(i.image_url); const isOpen = openId === i.id;
          const price = typeof p.price_from === 'number' ? (typeof p.price_to === 'number' && p.price_to !== p.price_from ? `${rm(p.price_from)} – ${rm(p.price_to)}` : t.priceFrom(rm(p.price_from))) : '';
          return (
            <li key={i.id}>
              <div className="card project-card pushed" data-testid="pushed-card" data-id={i.id}>
                <button type="button" className="feed-head" aria-expanded={isOpen} onClick={() => { setOpenId(isOpen ? null : i.id); if (!isOpen && !i.opened_at) void markFeed(store, cfg, i.id, 'opened'); }}>
                  <strong className="pc-name">{i.title}</strong>
                  {(p.developer || p.location) && <small className="muted">{[p.developer, p.location].filter(Boolean).join(' · ')}</small>}
                  {price && <span className="pc-price">{price}</span>}
                  {i.from_code && <small className="muted" data-testid="pushed-from-code">{t.fromCode}</small>}
                </button>
                {img && <img className="feed-img" src={img} alt="" loading="lazy" referrerPolicy="no-referrer" />}
                {isOpen && i.body && <p className="feed-body">{i.body}</p>}
                {isOpen && <Links item={i} lang={lang} />}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---------- announcements ----------
/** Banners at the top of the home screen; each can be closed. */
export function AnnouncementBanners({ lang }: { lang: Lang }) {
  const { store, items, cfg } = useFeed();
  const t = feedStrings[lang];
  const list = openBanners(items);
  if (!list.length) return null;
  return (
    <div className="stack-sm" data-testid="announcement-banners">
      {list.map(i => (
        <div key={i.id} className="notice announce" role="status" data-testid="announcement-banner" data-id={i.id}>
          <div className="between"><strong>{i.title}</strong>
            <button type="button" className="icon-btn small" aria-label={t.close} onClick={() => void markFeed(store, cfg, i.id, 'dismissed')} data-testid="announcement-close">✕</button></div>
          {i.body && <p className="small">{i.body}</p>}
          <Links item={i} lang={lang} />
        </div>
      ))}
    </div>
  );
}

/** One pop-up at a time, in Admin's order; it stays until the agent taps OK.
 *  MainForAdmin-E: showId = an announcement whose push alert was tapped; it is shown here even if it is a banner or was
 *  answered before. OK on a tapped banner only closes it (the banner's own ✕ still decides whether it stays on Home). */
export function AnnouncementPopup({ lang, showId, onDone }: { lang: Lang; showId?: string | null; onDone?: () => void }) {
  const { store, items, cfg } = useFeed();
  const t = feedStrings[lang];
  const tapped = showId ? items.find(x => x.id === showId && x.kind === 'announcement') : undefined;
  useEffect(() => {
    if (showId && !tapped) onDone?.();   // gone meanwhile: nothing to show
    else if (tapped && !tapped.opened_at) void markFeed(store, cfg, tapped.id, 'opened');
  }, [showId, tapped, store, cfg, onDone]);
  const i = tapped ?? openPopups(items)[0];
  if (!i) return null;
  const img = safeUrl(i.image_url);
  const ok = () => {
    if (i.display === 'popup' || !tapped) void markFeed(store, cfg, i.id, 'acknowledged');
    if (tapped) onDone?.();
  };
  return (
    <div className="sheet-scrim announce-scrim" role="presentation">
      <div className="sheet" role="alertdialog" aria-modal="true" aria-labelledby="ann-t" data-testid="announcement-popup" data-id={i.id}>
        <small className="muted">{t.announcement}</small>
        <h2 id="ann-t">{i.title}</h2>
        {img && <img className="feed-img" src={img} alt="" loading="lazy" referrerPolicy="no-referrer" />}
        {i.body && <p className="feed-body">{i.body}</p>}
        <Links item={i} lang={lang} />
        <button type="button" className="btn primary big" onClick={ok} data-testid="announcement-ok">{t.ok}</button>
      </div>
    </div>
  );
}

// ---------- force update and maintenance ----------
/** Reads the company-wide switches at opening and every 5 minutes, signed in or not. */
export function usePublicSettings() {
  const { state, store } = useApp();
  const url = state.settings.supabaseUrl; const key = state.settings.supabaseAnonKey;
  useEffect(() => {
    const cfg = config(store.getState().settings);
    if (!configured(cfg)) return;
    void refreshPublicSettings(store, cfg);
    const x = setInterval(() => { void refreshPublicSettings(store, config(store.getState().settings)); }, 5 * 60_000);
    return () => clearInterval(x);
  }, [store, url, key]);
}

/** A full-screen block for maintenance or a required update; null when the app may be used. */
export function BlockingNotice({ lang }: { lang: Lang }) {
  const { state, store } = useApp();
  const t = feedStrings[lang];
  const s = state.meta.publicSettings;
  const [checking, setChecking] = useState(false);
  if (!s) return null;
  async function again() {
    setChecking(true);
    try { await refreshPublicSettings(store, config(store.getState().settings)); } finally { setChecking(false); }
  }
  if (maintenanceActive(s)) {
    return (
      <div className="block-screen" role="alert" data-testid="maintenance">
        <h1>{t.maintTitle}</h1>
        <p>{maintenanceText(s, lang) ?? t.maintDefault}</p>
        {s.maintenance_back_at && <p className="muted">{t.maintBack(fmtDateTime(s.maintenance_back_at, lang))}</p>}
        <small className="muted">{t.maintNote}</small>
        <button type="button" className="btn secondary" disabled={checking} onClick={() => void again()} data-testid="maintenance-retry">{t.maintRetry}</button>
      </div>
    );
  }
  if (updateVerdict(s, BUILD.version) === 'hard') {
    const u = safeUrl(s.update_url);
    return (
      <div className="block-screen" role="alert" data-testid="update-required">
        <h1>{t.updateTitle}</h1>
        <p>{t.updateHard}</p>
        <small className="muted">{t.yourVersion(BUILD.version, s.min_version ?? '')}</small>
        {u ? <button type="button" className="btn primary big" onClick={() => open(u)} data-testid="update-now">{t.updateBtn}</button> : <p className="small">{t.noUpdateLink}</p>}
        <button type="button" className="btn secondary" disabled={checking} onClick={() => void again()}>{t.maintRetry}</button>
      </div>
    );
  }
  return null;
}

/** The soft "please update" line, closable until Admin raises the minimum version again. */
export function SoftUpdateBanner({ lang }: { lang: Lang }) {
  const { state, store } = useApp();
  const t = feedStrings[lang];
  const s = state.meta.publicSettings;
  if (!s || updateVerdict(s, BUILD.version) !== 'soft' || state.meta.softUpdateClosed === s.min_version) return null;
  const u = safeUrl(s.update_url);
  return (
    <div className="notice warn soft-update" role="status" data-testid="update-soft">
      <span>{t.updateSoft}</span>
      <div className="btn-row">
        {u && <button type="button" className="btn small primary" onClick={() => open(u)} data-testid="update-soft-go">{t.updateBtn}</button>}
        <button type="button" className="btn small secondary" onClick={() => store.setSingleton('meta', { softUpdateClosed: s.min_version ?? undefined })} data-testid="update-soft-later">{t.later}</button>
      </div>
    </div>
  );
}
