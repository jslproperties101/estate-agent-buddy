// The one place that talks to the phone's own features when the app runs as the Android (or iOS) app built with
// Capacitor. In a browser every function here reports "not native" and the screens use their browser path, so the
// same code runs on the web, on Android and later on iOS.
//
// Plugins are reached with registerPlugin(name): the native side of each plugin is installed by the Android build
// (see scripts/android-setup.mjs), so the web bundle does not need each plugin's JavaScript package.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Capacitor, registerPlugin } from '@capacitor/core';

export const isNative = (): boolean => { try { return Capacitor.isNativePlatform(); } catch { return false; } };
export const platform = (): 'android' | 'ios' | 'web' => { try { return Capacitor.getPlatform() as 'android' | 'ios' | 'web'; } catch { return 'web'; } };

/** Android package / iOS bundle id, also the URL scheme Google sign-in returns to. */
export const APP_ID = 'com.jslproperties.estateagentbuddy';
export const AUTH_CALLBACK = `${APP_ID}://auth-callback`;

const cache = new Map<string, any>();
/** A native plugin, or undefined in the browser. */
export function plugin<T = any>(name: string): T | undefined {
  if (!isNative()) return undefined;
  if (!cache.has(name)) cache.set(name, registerPlugin<T>(name));
  return cache.get(name) as T;
}

/** True in the installed app when this APK does not contain the plugin's native part (an older APK, or a build
 *  where the plugin was not bundled). The screens then say that a new APK is needed instead of failing silently. */
export function pluginMissing(name: string): boolean {
  if (!isNative()) return false;
  try { return !Capacitor.isPluginAvailable(name); } catch { return false; }
}

/** Opens a web page in the phone's own browser tab (Custom Tabs on Android), or a new tab on the web. */
export async function openInBrowser(url: string): Promise<boolean> {
  const b = plugin('Browser');
  if (b) { try { await b.open({ url, presentationStyle: 'popover' }); return true; } catch { return false; } }
  window.location.assign(url);
  return true;
}
export async function closeBrowser(): Promise<void> {
  try { await plugin('Browser')?.close(); } catch { /* already closed */ }
}

export interface Listener { remove: () => Promise<void> | void }
/** Calls fn when the app is opened through a link (Google sign-in returning to com.jslproperties.estateagentbuddy://…). */
export async function onAppUrlOpen(fn: (url: string) => void): Promise<Listener | null> {
  const app = plugin('App');
  if (!app) return null;
  try { return await app.addListener('appUrlOpen', (e: { url: string }) => fn(e.url)); } catch { return null; }
}
/** Calls fn when the in-app browser tab is closed by the person (used to notice a cancelled sign-in). */
export async function onBrowserClosed(fn: () => void): Promise<Listener | null> {
  const b = plugin('Browser');
  if (!b) return null;
  try { return await b.addListener('browserFinished', fn); } catch { return null; }
}

/** Status bar in the app's black and gold look. */
export async function nativeLook(): Promise<void> {
  if (!isNative()) return;
  try { await plugin('StatusBar')?.setStyle({ style: 'DARK' }); } catch { /* not available */ }
  try { await plugin('StatusBar')?.setBackgroundColor({ color: '#08080A' }); } catch { /* iOS has no colour */ }
}

/** Hides Android's still splash screen as soon as the app draws its own (spinning) startup logo. */
export async function hideSplash(): Promise<void> {
  if (!isNative()) return;
  try { await plugin('SplashScreen')?.hide({ fadeOutDuration: 120 }); } catch { /* already hidden */ }
}
