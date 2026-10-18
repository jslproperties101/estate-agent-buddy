// Startup: the app opens as soon as the phone's storage is ready. Nothing waits for a timer, and nothing waits for the
// internet (cloud sync starts afterwards, in the background). Only two things can make startup slow or fail, and both
// are reported truthfully: the storage is slow to open, or it cannot be read.
import type { Lang } from '../i18n';

export type StartupPhase = 'opening' | 'slow' | 'failed' | 'ready';

/** After this long without the storage being ready, the screen says so (about five seconds, as agreed). It keeps
 *  waiting after that: the storage may still finish, and the person can press "Try again". */
export const SLOW_MS = 5000;

/** JoyChange002 Change 42: the start-up screen is always shown for this long, every time the app opens (no skipping). It is
 *  visual only: the app itself is ready as soon as the storage opens, and the screen simply stays until the time is up. */
export const SPLASH_MS = 5000;
/** The six start-up lines are spread evenly over SPLASH_MS (about 0.83 s each). */
export const SPLASH_STEPS = 6;
export const SPLASH_STEP_MS = SPLASH_MS / SPLASH_STEPS;
/** Which of the six lines (0-5) is showing after `elapsedMs` of the start-up screen. */
export const splashStep = (elapsedMs: number) => Math.max(0, Math.min(SPLASH_STEPS - 1, Math.floor(elapsedMs / SPLASH_STEP_MS)));

/** Runs `open` once. `on` is told 'opening' first, 'slow' if it takes longer than slowMs, and finally 'ready' (with the
 *  result) or 'failed'. There is no minimum time: if `open` finishes at once, 'ready' follows at once.
 *  Returns a function that stops all further reports (used when the screen goes away or the person retries). */
export function beginStartup<T>(
  open: () => Promise<T>,
  on: (phase: StartupPhase, value?: T, error?: unknown) => void,
  slowMs = SLOW_MS,
): () => void {
  let live = true;
  let finished = false;
  on('opening');
  const slow = setTimeout(() => { if (live && !finished) on('slow'); }, slowMs);
  open().then(
    value => { finished = true; clearTimeout(slow); if (live) on('ready', value); },
    error => { finished = true; clearTimeout(slow); if (live) on('failed', undefined, error); },
  );
  return () => { live = false; clearTimeout(slow); };
}

/** The language to use before the stored settings are loaded: the phone's own language, else English. */
export function startupLang(languages: readonly string[] | undefined): Lang {
  for (const l of languages ?? []) {
    const code = l.toLowerCase();
    if (code.startsWith('ms') || code.startsWith('id')) return 'bm';
    if (code.startsWith('zh')) return 'zh';
    if (code.startsWith('en')) return 'en';
  }
  return 'en';
}
