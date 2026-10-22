// v1buddychange015 (Batch I): Buddy Walk: Streets in the Games list. The game itself is in game.ts.
import type { GameDef, GameProps } from '../types';
import { FullScreenGame } from '../gl3d/Mount';
import { startStreets } from './game';
import { bsStrings } from './strings';

function BuddyStreets(p: GameProps) { return <FullScreenGame start={startStreets} p={p} testId="bs-mount" />; }

export const game: GameDef = {
  key: 'buddyStreets',
  title: { en: bsStrings.en.title, bm: bsStrings.bm.title, zh: bsStrings.zh.title },
  blurb: { en: bsStrings.en.blurb, bm: bsStrings.bm.blurb, zh: bsStrings.zh.blurb },
  icon: () => <svg aria-hidden="true" width={28} height={28} viewBox="0 0 24 24" fill="currentColor"><rect x="2" y="20" width="20" height="2" /><rect x="3" y="11" width="7" height="9" /><rect x="2" y="9" width="9" height="2" /><rect x="14" y="5" width="7" height="15" /><rect x="11" y="13" width="2" height="7" /><rect x="10" y="12" width="4" height="2" /></svg>,
  Component: BuddyStreets,
};
