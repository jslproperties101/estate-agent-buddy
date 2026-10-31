// Google AdMob banner for the Android app (Change 011, owner 16 Oct 2026: "Edbmob" in the change records is AdMob).
//
// The app ID and the banner ad unit ID below are the owner's own AdMob IDs. They are public by design (every app that
// shows AdMob ads carries them inside its APK); they are not passwords or keys.
//
// Safety for testing: the QA app (EAB QA) and every build that is not the Android app never ask Google for real ads.
// The QA app shows Google's test banners through the owner's unit (isTesting), so tapping one during testing can never
// count as an invalid click on the owner's account. Real ads are requested only by the normal (production) Android build.
//
// The banner is drawn by Android itself, at the bottom of the app's own screen area, above the phone's back / home /
// recent buttons. The web page leaves the same height free at the bottom (CSS variable --ad-h, see AdBar.tsx), so the
// banner never covers a button, a field or the last line of a list.
import { IS_POS, IS_QA, isNative, platform, plugin, pluginMissing } from '../native/native';

export const ADMOB_APP_ID = 'ca-app-pub-5995234129917229~3821658996';
export const ADMOB_BANNER_UNIT = 'ca-app-pub-5995234129917229/3681049037';
/** Standard AdMob phone banner (320 × 50 dp); the adaptive banner the app asks for is about this tall on a phone. */
export const BANNER_W = 320;
export const BANNER_H = 50;

type AdMobPlugin = {
  initialize(o: { initializeForTesting?: boolean }): Promise<void>;
  showBanner(o: { adId: string; adSize?: string; position?: string; margin?: number; isTesting?: boolean }): Promise<void>;
  hideBanner(): Promise<void>;
  resumeBanner(): Promise<void>;
  removeBanner(): Promise<void>;
  addListener(event: string, fn: (info: { height?: number; width?: number }) => void): Promise<{ remove: () => void }>;
};

/** True when this build may show a native AdMob banner (the Android app with the AdMob plugin inside). */
export const nativeAdsAvailable = (): boolean => isNative() && platform() === 'android' && !pluginMissing('AdMob') && !!plugin('AdMob');
/** The QA app only ever shows Google's test ads. */
export const testAdsOnly = (): boolean => IS_QA || IS_POS;

let started: Promise<boolean> | null = null;
let shown = false;
let everShown = false;
let wantShown = true;
let heightListener: ((h: number) => void) | null = null;
/** EA AI Buddy reskin: distance of the banner from the bottom (dp = CSS px), so it sits directly above the tab bar. */
let margin = 0;

/** Starts AdMob once and shows the bottom banner. Resolves false (and the page shows its placeholder) if anything fails. */
export function startBanner(onHeight: (h: number) => void): Promise<boolean> {
  heightListener = onHeight;
  if (started) return started;
  started = (async () => {
    const ad = plugin<AdMobPlugin>('AdMob');
    if (!ad || !nativeAdsAvailable()) return false;
    try {
      await ad.initialize({ initializeForTesting: testAdsOnly() });
      await ad.addListener('bannerAdSizeChanged', info => {
        // The plugin reports the banner size; values far above a banner's height in dp are treated as screen pixels.
        let h = Number(info?.height) || 0;
        if (h > 150 && typeof window !== 'undefined' && window.devicePixelRatio > 1) h = h / window.devicePixelRatio;
        if (h > 0) heightListener?.(Math.round(h));
      });
      await ad.addListener('bannerAdFailedToLoad', () => heightListener?.(BANNER_H));
      if (wantShown) {
        await ad.showBanner({ adId: ADMOB_BANNER_UNIT, adSize: 'ADAPTIVE_BANNER', position: 'BOTTOM_CENTER', margin, isTesting: testAdsOnly() });
        shown = true; everShown = true;
      }
      return true;
    } catch { return false; }
  })();
  return started;
}

/** Hides the native banner for a full-screen view (document preview, map picker) and brings it back afterwards. */
export async function setBannerVisible(visible: boolean): Promise<void> {
  wantShown = visible;
  const ad = plugin<AdMobPlugin>('AdMob');
  if (!ad || !started || !(await started)) return;
  try {
    if (visible && !shown) {
      if (everShown) await ad.resumeBanner();
      else await ad.showBanner({ adId: ADMOB_BANNER_UNIT, adSize: 'ADAPTIVE_BANNER', position: 'BOTTOM_CENTER', margin, isTesting: testAdsOnly() });
      shown = true; everShown = true;
    }
    else if (!visible && shown) { await ad.hideBanner(); shown = false; }
  } catch { /* the banner stays as it was; the page layout is unaffected */ }
}

/** EA AI Buddy reskin: lifts the banner by `px` (the tab bar's height). The plugin only takes the margin when a banner is
 *  shown, so a banner already on screen is removed and shown again at the new height. */
export async function setBannerMargin(px: number): Promise<void> {
  if (px === margin) return;
  margin = px;
  const ad = plugin<AdMobPlugin>('AdMob');
  if (!ad || !started || !(await started) || !shown) return;
  try {
    await ad.removeBanner();
    everShown = false;
    await ad.showBanner({ adId: ADMOB_BANNER_UNIT, adSize: 'ADAPTIVE_BANNER', position: 'BOTTOM_CENTER', margin, isTesting: testAdsOnly() });
    everShown = true;
  } catch { /* the banner stays where it was */ }
}
