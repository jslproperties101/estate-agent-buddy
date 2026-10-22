// v1buddychange013: the Games tile. Every game plugs in through this one contract, so games can be added or removed
// without touching the rest of the app. A game is a React component plus its own words in EN / BM / ZH.
import type { Lang } from '../i18n';

// v1buddychange015 (Batch I): + buddyStreets, viewingRush, openHouse, matchBuyer.
export type GameKey = 'buddyWalk' | 'priceItRight' | 'propertyRules' | 'buddyStreets' | 'viewingRush' | 'openHouse' | 'matchBuyer';
export const GAME_KEYS: readonly GameKey[] = ['buddyWalk', 'priceItRight', 'propertyRules', 'buddyStreets', 'viewingRush', 'openHouse', 'matchBuyer'];

/** What a game reports when a round ends. score is 0..maxScore; higher is better. */
export interface GameResult { score: number; maxScore: number }

export interface GameProps {
  lang: Lang;
  /** Called once when a round ends; the hub saves the best score and the streak. */
  onFinish: (r: GameResult) => void;
  /** Leave the game and go back to the Games list. */
  onExit: () => void;
}

export interface GameDef {
  key: GameKey;
  title: Record<Lang, string>;
  blurb: Record<Lang, string>;
  /** A small emoji-free pixel icon drawn as an inline SVG. */
  icon: () => JSX.Element;
  Component: (p: GameProps) => JSX.Element;
}
