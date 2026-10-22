// v1buddychange015 (Batch I): Open House Tour in the Games list. The game itself is in game.ts.
import type { GameDef, GameProps } from '../types';
import { FullScreenGame } from '../gl3d/Mount';
import { startOpenHouse } from './game';
import { ohStrings } from './strings';

function OpenHouse(p: GameProps) { return <FullScreenGame start={startOpenHouse} p={p} testId="oh-mount" />; }

export const game: GameDef = {
  key: 'openHouse',
  title: { en: ohStrings.en.title, bm: ohStrings.bm.title, zh: ohStrings.zh.title },
  blurb: { en: ohStrings.en.blurb, bm: ohStrings.bm.blurb, zh: ohStrings.zh.blurb },
  icon: () => <svg aria-hidden="true" width={28} height={28} viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="10" width="18" height="11" /><rect x="5" y="8" width="14" height="2" /><rect x="7" y="6" width="10" height="2" /><rect x="10" y="4" width="4" height="2" /><rect x="10" y="14" width="4" height="7" fill="#0E0E10" /><rect x="15" y="12" width="3" height="3" fill="#0E0E10" /></svg>,
  Component: OpenHouse,
};
