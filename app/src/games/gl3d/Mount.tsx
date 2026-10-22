// v1buddychange015 (Batch I): runs a full-screen game (plain DOM + WebGL) inside the app's Games frame.
// The game draws itself over the whole screen; leaving the route (Back) removes it and frees the 3D memory.
import { useEffect, useRef } from 'react';
import type { GameProps, GameResult } from '../types';
import type { Lang } from '../../i18n';
import { useImmersive } from '../../adverts/AdBar';

export interface StartOpts { lang: Lang; onFinish: (r: GameResult) => void; onExit: () => void }
/** Starts the game in `mount` and returns a function that stops it and cleans up everything. */
export type StartFn = (mount: HTMLElement, o: StartOpts) => () => void;

export function FullScreenGame({ start, p, testId }: { start: StartFn; p: GameProps; testId: string }) {
  // Full-screen: the bottom advert is hidden while the game is open (it comes back on leaving).
  useImmersive(true);
  const ref = useRef<HTMLDivElement | null>(null);
  const latest = useRef(p);
  latest.current = p;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let done = false;
    const stop = start(el, {
      lang: latest.current.lang,
      onFinish: r => { if (!done) { done = true; latest.current.onFinish(r); } },
      onExit: () => latest.current.onExit(),
    });
    return stop;
  }, []);
  return <div ref={ref} data-testid={testId} />;
}
