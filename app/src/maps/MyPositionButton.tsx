// "Show my position" for the map screens, with what happened (finding, refused, no GPS).
import { Lang } from '../i18n';
import { mapStrings } from './strings';
import type { MyPosition, PositionState } from './position';

/** "Show my position" button with what happened (finding, refused, no GPS). */
export function MyPositionButton({ lang, mine }: { lang: Lang; mine: { pos: MyPosition | null; state: PositionState; locate: () => void } }) {
  const m = mapStrings[lang];
  return (
    <div className="stack-sm">
      <button className="btn secondary" onClick={mine.locate} disabled={mine.state === 'locating'} data-testid="my-position">📍 {mine.state === 'locating' ? m.locatingMe : m.myPosition}</button>
      {mine.pos && <small className="muted" data-testid="my-position-text">{m.check.here}: {mine.pos.lat.toFixed(5)}, {mine.pos.lng.toFixed(5)} ±{mine.pos.acc} m</small>}
      {mine.state === 'denied' && <small className="warn-text" role="alert">{m.meDenied}</small>}
      {mine.state === 'off' && <small className="warn-text" role="alert">{m.check.gpsOff}</small>}
    </div>
  );
}

