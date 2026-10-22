// v1buddychange015 (Batch I): Viewing Rush in the Games list. The game itself is in game.ts.
import type { GameDef, GameProps } from '../types';
import { FullScreenGame } from '../gl3d/Mount';
import { startViewingRush } from './game';
import { vrStrings } from './strings';

function ViewingRush(p: GameProps) { return <FullScreenGame start={startViewingRush} p={p} testId="vr-mount" />; }

export const game: GameDef = {
  key: 'viewingRush',
  title: { en: vrStrings.en.title, bm: vrStrings.bm.title, zh: vrStrings.zh.title },
  blurb: { en: vrStrings.en.blurb, bm: vrStrings.bm.blurb, zh: vrStrings.zh.blurb },
  icon: () => <svg aria-hidden="true" width={28} height={28} viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="8" width="12" height="4" /><rect x="3" y="12" width="18" height="5" /><rect x="5" y="17" width="4" height="3" /><rect x="15" y="17" width="4" height="3" /><rect x="8" y="9" width="3" height="2" fill="#0E0E10" /><rect x="13" y="9" width="3" height="2" fill="#0E0E10" /></svg>,
  Component: ViewingRush,
};
