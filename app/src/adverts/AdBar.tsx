// The app's advertising places (Change 011).
//  - BottomAd: ONE fixed advertising area for every normal screen, drawn once by the app shell (App.tsx), not by each
//    screen. It sits at the bottom of the app's own area, directly above the phone's navigation buttons (it never covers
//    them), and the page leaves the same height free at the bottom (--ad-h), so nothing is hidden under it.
//    In the Android app the banner itself is Google AdMob's (adverts/admob.ts); the page area under it stays empty.
//    Everywhere else (a browser, an older APK without AdMob, or if AdMob cannot start) a clearly marked placeholder of the
//    same size is shown. The placeholder does nothing when touched: it never pretends to be an advert click.
//  - useImmersive(): a full-screen view (the PDF preview, the map location picker) hides the bottom area while it is
//    open; it comes back when the view closes.
//  - FeedAd: the medium "in-feed" card that the Subsale List puts after every third property card shown.
// None of this reads the app's records, so saving or syncing never redraws it, and it does nothing in the background.
import { memo, useEffect, useState, useSyncExternalStore } from 'react';
import type { Lang } from '../i18n';
import { c11Strings } from '../ui/c011Strings';
import { BANNER_H, nativeAdsAvailable, setBannerVisible, startBanner, testAdsOnly } from './admob';

// ---------- full-screen views ----------
let immersiveCount = 0;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(fn => fn());
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const isImmersive = () => immersiveCount > 0;

/** Call in a full-screen view: the bottom advert is hidden while the view is open. */
export function useImmersive(on = true) {
  useEffect(() => {
    if (!on) return;
    immersiveCount++; notify();
    return () => { immersiveCount = Math.max(0, immersiveCount - 1); notify(); };
  }, [on]);
}

/** Sets the height kept free at the bottom of every screen (0 while hidden). */
function setReserved(px: number) {
  if (typeof document !== 'undefined') document.documentElement.style.setProperty('--ad-h', `${px}px`);
}

// ---------- the fixed bottom area ----------
/** `cover`: drawn on the start-up screen (Change 42). It shows the same banner but never touches the page's reserved height
 *  (--ad-h), which belongs to the app shell's own BottomAd, so removing the cover cannot reset it. */
export const BottomAd = memo(function BottomAd({ lang, cover }: { lang: Lang; cover?: boolean }) {
  const t = c11Strings[lang].ad;
  const hidden = useSyncExternalStore(subscribe, isImmersive);
  const [native, setNative] = useState<'starting' | 'on' | 'off'>(() => (nativeAdsAvailable() ? 'starting' : 'off'));
  const [height, setHeight] = useState(BANNER_H);

  useEffect(() => {
    if (native !== 'starting') return;
    let alive = true;
    void startBanner(h => { if (alive) setHeight(h); }).then(ok => { if (alive) setNative(ok ? 'on' : 'off'); });
    return () => { alive = false; };
  }, [native]);
  useEffect(() => { if (native === 'on') void setBannerVisible(!hidden); }, [hidden, native]);
  useEffect(() => { if (!cover) setReserved(hidden ? 0 : height); }, [hidden, height, cover]);
  useEffect(() => () => { if (!cover) setReserved(0); }, [cover]);

  if (hidden) return null;
  return (
    <aside className={`ad-bar ${native === 'on' ? 'native' : 'placeholder'}`} aria-label={t.label} data-testid="bottom-ad" data-ad={native === 'on' ? 'admob' : 'placeholder'}
      style={{ height }}>
      {native !== 'on' && (
        <div className="ad-ph" data-testid="bottom-ad-placeholder">
          <strong>{t.placeholder}</strong>
          <small>{t.placeholderNote}{testAdsOnly() ? ` · ${t.test}` : ''}</small>
        </div>
      )}
    </aside>
  );
});

// ---------- in-feed card ----------
/** A medium advert card between property cards: bigger than the banner, smaller than a property card, plainly an advert,
 *  not a button and not tappable (so it can never open a property or look like one). */
export function FeedAd({ lang, n }: { lang: Lang; n: number }) {
  const t = c11Strings[lang].ad;
  return (
    <aside className="feed-ad" aria-label={t.feed} data-testid="feed-ad" data-feed-ad={n}>
      <span className="feed-ad-tag">{t.feed}</span>
      <span className="feed-ad-body">{t.feedNote}</span>
    </aside>
  );
}

/** After every third property shown (3, 6, 9…), counted on the list as it is shown now (after search and filters). */
export const FEED_AD_EVERY = 3;
export function withFeedAds<T>(shown: T[]): ({ kind: 'item'; item: T; index: number } | { kind: 'ad'; n: number })[] {
  const out: ({ kind: 'item'; item: T; index: number } | { kind: 'ad'; n: number })[] = [];
  shown.forEach((item, index) => {
    out.push({ kind: 'item', item, index });
    if ((index + 1) % FEED_AD_EVERY === 0) out.push({ kind: 'ad', n: (index + 1) / FEED_AD_EVERY });
  });
  return out;
}
