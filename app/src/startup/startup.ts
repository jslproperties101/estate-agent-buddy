// Startup: the app opens as soon as the phone's storage is ready. Nothing waits for a timer, and nothing waits for the
// internet (cloud sync starts afterwards, in the background). Only two things can make startup slow or fail, and both
// are reported truthfully: the storage is slow to open, or it cannot be read.
import type { Lang } from '../i18n';

export type StartupPhase = 'opening' | 'slow' | 'failed' | 'ready';

/** After this long without the storage being ready, the screen says so (about five seconds, as agreed). It keeps
 *  waiting after that: the storage may still finish, and the person can press "Try again". */
export const SLOW_MS = 5000;

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
