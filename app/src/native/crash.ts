// Batch L1 (launch essentials): crash reporting with Firebase Crashlytics (JoyChange005 open item: the app had none).
//  - A crash that closes the Android app is reported by Crashlytics itself (native part, @capacitor-firebase/crashlytics),
//    and shows in the Firebase console the next time the app opens.
//  - Errors inside the app's screens that do not close it (js.error / js.rejection, already counted for Admin EAB by the
//    usage logger) are also sent to Crashlytics as "non-fatal" reports, with the screen they happened on, so the cause
//    can be found. The message is cut to 500 characters and phone numbers and email addresses are removed first.
//  - The person is identified only by their account id (no name, email or phone), so a report can be matched to an agent
//    in Admin EAB if needed. Signing out clears it.
// Everything here is best effort and silent: in the browser, on the laptop website and in an older APK without the
// Crashlytics part, nothing happens and nothing fails.
import { isNative, plugin, pluginMissing } from './native';

interface CrashlyticsPlugin {
  recordException(o: { message: string; stacktrace?: { fileName?: string; lineNumber?: number; functionName?: string }[] }): Promise<void>;
  log(o: { message: string }): Promise<void>;
  setUserId(o: { userId: string }): Promise<void>;
  setCustomKey(o: { key: string; value: string | number | boolean; type: 'string' | 'long' | 'double' | 'boolean' | 'int' | 'float' }): Promise<void>;
}

const NAME = 'FirebaseCrashlytics';
const crash = (): CrashlyticsPlugin | undefined => (isNative() && !pluginMissing(NAME) ? plugin<CrashlyticsPlugin>(NAME) : undefined);

/** True when this APK can send crash reports. */
export const crashAvailable = (): boolean => !!crash();

/** Removes things that could identify a client from an error message before it leaves the phone. */
export function scrub(text: string): string {
  return String(text ?? '')
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[email]')
    .replace(/\+?\d[\d\s-]{6,}\d/g, '[number]')
    .slice(0, 500);
}

/** Reads up to 10 frames from a JavaScript stack ("at fn (file:line:col)" or "fn@file:line:col"). */
export function frames(stack: string | undefined): { fileName?: string; lineNumber?: number; functionName?: string }[] {
  if (!stack) return [];
  const out: { fileName?: string; lineNumber?: number; functionName?: string }[] = [];
  for (const line of stack.split('\n')) {
    const m = /at\s+(?:(.+?)\s+\()?(.+?):(\d+):\d+\)?\s*$/.exec(line.trim()) ?? /^(.*?)@(.+?):(\d+):\d+$/.exec(line.trim());
    if (!m) continue;
    out.push({ functionName: m[1] || '(anonymous)', fileName: (m[2] ?? '').split('/').pop(), lineNumber: Number(m[3]) });
    if (out.length >= 10) break;
  }
  return out;
}

/** The signed-in account id ('' when signed out), so reports can be matched to an agent. */
export async function setCrashUser(userId: string | undefined): Promise<void> {
  const c = crash();
  if (!c) return;
  try { await c.setUserId({ userId: userId ?? '' }); } catch { /* not available */ }
}

/** Extra facts on every report: version, language, QA/POS build. */
export async function setCrashKeys(keys: Record<string, string>): Promise<void> {
  const c = crash();
  if (!c) return;
  for (const [key, value] of Object.entries(keys)) {
    try { await c.setCustomKey({ key, value, type: 'string' }); } catch { /* not available */ }
  }
}

let lastAt = 0, sentThisMinute = 0;
/** Sends one non-fatal report. At most 10 a minute, so a broken screen repeating the same error cannot flood it. */
export async function reportError(err: unknown, screen = ''): Promise<void> {
  const c = crash();
  if (!c) return;
  const now = Date.now();
  if (now - lastAt > 60_000) { lastAt = now; sentThisMinute = 0; }
  if (++sentThisMinute > 10) return;
  // A change the person may not make (AccessError) is told to them on screen; it is not a fault in the app.
  if (err instanceof Error && err.message.startsWith('not allowed (')) return;
  const e = err instanceof Error ? err : new Error(typeof err === 'string' ? err : (() => { try { return JSON.stringify(err); } catch { return String(err); } })());
  try {
    if (screen) await c.log({ message: `screen ${screen}` });
    await c.recordException({ message: scrub(`${e.name}: ${e.message}`), stacktrace: frames(e.stack) });
  } catch { /* not available */ }
}

/** Listens for errors the app does not handle and reports them. Returns a function that stops listening. */
export function startCrashReporting(win: Window | undefined = typeof window === 'undefined' ? undefined : window, screen: () => string = () => ''): () => void {
  if (!win || !crash()) return () => {};
  const onErr = (e: ErrorEvent) => { void reportError(e.error ?? e.message, screen()); };
  const onRej = (e: PromiseRejectionEvent) => { void reportError(e.reason, screen()); };
  win.addEventListener('error', onErr);
  win.addEventListener('unhandledrejection', onRej);
  return () => { win.removeEventListener('error', onErr); win.removeEventListener('unhandledrejection', onRej); };
}
