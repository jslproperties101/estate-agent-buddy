// Startup: the app opens as soon as the phone's storage is ready. Nothing waits for a timer, and nothing waits for the
// internet (cloud sync starts afterwards, in the background). Only two things can make startup slow or fail, and both
// are reported truthfully: the storage is slow to open, or it cannot be read.
import type { Lang } from '../i18n';

export type StartupPhase = 'opening' | 'slow' | 'failed' | 'ready';

/** After this long without the storage being ready, the screen says so (about five seconds, as agreed). It keeps
 *  waiting after that: the storage may still finish, and the person can press "Try again". */
export const SLOW_MS = 5000;

/** JoyChange002 Change 42, timing redone by JoyChange006 Part 2 Change E: the start-up screen is always shown for this long,
 *  every time the app opens (no skipping). It is visual only: the app itself is ready as soon as the storage opens, and the
 *  screen simply stays until the time is up. JoyChange006 Change E (Joe, 20 Oct 2026): if the app genuinely is not ready by
 *  then (a very slow phone or network), the cover is removed anyway at FORCE_OPEN_MS rather than waiting indefinitely. */
export const SPLASH_MS = 10000;
/** If the app is still not ready this long after start-up began, the cover is removed anyway (Joe's choice: open the app
 *  rather than keep it covered). Equal to SPLASH_MS: the cover never outlasts its own 10 seconds. */
export const FORCE_OPEN_MS = SPLASH_MS;
/** The five start-up lines, and the time (ms from the start of the splash) at which each one ends. Change E's own table:
 *  Starting up 0-1.5s, Encrypting data 1.5-5.5s (the longest, on purpose), Securing your connection 5.5-7.5s,
 *  Loading users 7.5-9s, Ready 9-10s. */
export const SPLASH_BREAKS = [1500, 5500, 7500, 9000, 10000] as const;
/** Which of the five lines (0-4) is showing after `elapsedMs` of the start-up screen. */
export const splashStep = (elapsedMs: number) => {
  const e = Math.max(0, elapsedMs);
  const i = SPLASH_BREAKS.findIndex(end => e < end);
  return i === -1 ? SPLASH_BREAKS.length - 1 : i;
};
/** How many dots (1, 2 or 3) the animated "..." shows after `elapsedMs`, each held for `stepMs` before moving to the next. */
export function splashDots(elapsedMs: number, stepMs = 400): number {
  return (Math.floor(Math.max(0, elapsedMs) / stepMs) % 3) + 1;
}

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
