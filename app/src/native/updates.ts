// Automatic updates without reinstalling the APK.
//  - Every build publishes the app's screens and logic (the web bundle) on GitHub Pages, with updates/latest.json
//    describing it. The installed Android app downloads a newer bundle in the background and switches to it the next
//    time it starts (or straight away with "Restart now"). It keeps running from https://localhost, so all data saved on
//    the phone stays exactly where it is. If a new bundle fails to start, the updater goes back to the previous one.
//  - Some changes need the Android app itself to change (new phone permissions or native plugins). Each build says
//    which "native version" it needs; when the installed APK is older, the app offers the new APK instead of an update
//    it could not run.
//  - The web version simply offers to reload when a newer version is published.
// Updater: @capgo/capacitor-updater in self-hosted manual mode (no Capgo account, no statistics sent).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { isNative, plugin, platform } from './native';

export interface BuildInfo { sha: string; version: string; nativeVersion: number; builtAt: string; /** Release label (e.g. "2.0.010", the integrated Changes 001–010 milestone). Display only: never compared for updates. */ release?: string; qa?: boolean }
declare const __EAB_BUILD__: BuildInfo | undefined;
export const BUILD: BuildInfo = (typeof __EAB_BUILD__ !== 'undefined' && __EAB_BUILD__) || { sha: 'dev', version: '0.0.0', nativeVersion: 1, builtAt: '' };

export const UPDATE_MANIFEST = 'https://jslproperties101.github.io/estate-agent-buddy/updates/latest.json';

export interface Latest { sha: string; version: string; nativeVersion: number; bundle: string; apk: string; builtAt: string; branch?: string }

export type UpdateState =
  | { kind: 'none' }
  | { kind: 'web-reload'; latest: Latest }
  | { kind: 'bundle-ready'; latest: Latest; id: string }
  | { kind: 'apk-needed'; latest: Latest }
  | { kind: 'error'; message: string };

/** What to do with a published version (pure: also used by the tests). */
export function decide(latest: Latest | null, current: BuildInfo, installedNative: number, native: boolean):
  'none' | 'web-reload' | 'download' | 'apk-needed' {
  if (!latest?.sha || latest.sha === current.sha) return 'none';
  if (!native) return 'web-reload';
  if ((latest.nativeVersion ?? 1) > installedNative) return 'apk-needed';
  return 'download';
}

/** The native version of the installed APK, from its version name ("2.0.0-n2"). Older APKs without it are 1. */
export function nativeVersionOf(versionName: string | undefined): number {
  const m = /-n(\d+)$/.exec(versionName ?? '');
  return m ? Number(m[1]) : 1;
}

/** A different update address (tests); none in normal use. */
function override(): string | null {
  try { return localStorage.getItem('eab-update-manifest'); } catch { return null; }
}
const manifestUrl = () => override() || UPDATE_MANIFEST;

/** Tells the updater this version started properly (otherwise it rolls back to the previous version). */
export async function appReady(): Promise<void> {
  if (!isNative()) return;
  try { await plugin('CapacitorUpdater')?.notifyAppReady(); } catch { /* updater not in this APK */ }
}

export async function installedNativeVersion(): Promise<number> {
  if (!isNative()) return BUILD.nativeVersion;
  try { return nativeVersionOf((await plugin('App')?.getInfo())?.version); } catch { return 1; }
}

/** Checks GitHub Pages for a newer version and, in the Android app, downloads it ready for the next start. */
export async function checkForUpdate(fetchFn: typeof fetch = fetch): Promise<UpdateState> {
  // The isolated QA build never looks for, downloads or switches to another bundle (it must keep running the commit it was built from).
  if (BUILD.qa) return { kind: 'none' };
  // The single-file copy opened from the phone's storage cannot update itself.
  // On the web, only the published site checks (not a copy opened from the phone's storage or a local test server).
  if (!isNative() && !override() && !(typeof window !== 'undefined' && window.location.hostname.endsWith('github.io'))) return { kind: 'none' };
  let latest: Latest;
  try {
    const r = await fetchFn(`${manifestUrl()}?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return { kind: 'error', message: `HTTP ${r.status}` };
    latest = await r.json();
  } catch (e) { return { kind: 'error', message: String((e as Error)?.message ?? e).slice(0, 120) }; }
  const native = isNative() && platform() !== 'web';
  const what = decide(latest, BUILD, await installedNativeVersion(), native);
  if (what === 'none') return { kind: 'none' };
  if (what === 'web-reload') return { kind: 'web-reload', latest };
  if (what === 'apk-needed') return { kind: 'apk-needed', latest };
  const up = plugin('CapacitorUpdater');
  if (!up) return { kind: 'apk-needed', latest }; // an APK from before automatic updates: it needs the new APK once
  try {
    const have = ((await up.list())?.bundles ?? []).find((b: any) => b.version === latest.sha && b.status === 'success');
    const bundle = have ?? await up.download({ url: latest.bundle, version: latest.sha });
    await up.next({ id: bundle.id }); // used from the next start; "Restart now" switches immediately
    return { kind: 'bundle-ready', latest, id: bundle.id };
  } catch (e) { return { kind: 'error', message: String((e as Error)?.message ?? e).slice(0, 120) }; }
}

/** Switches to the downloaded version now (the app reloads, data stays). */
export async function restartIntoUpdate(id: string): Promise<void> {
  const up = plugin('CapacitorUpdater');
  if (up) await up.set({ id });
}
