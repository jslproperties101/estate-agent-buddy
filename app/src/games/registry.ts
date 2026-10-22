// v1buddychange013: the games shown in the Games tile, in this order.
import type { GameDef, GameKey } from './types';
import { game as buddyWalk } from './buddyWalk';
import { game as priceItRight } from './priceItRight';
import { game as propertyRules } from './propertyRules';

export const GAMES: GameDef[] = [buddyWalk, priceItRight, propertyRules];
export const gameByKey = (k: string): GameDef | undefined => GAMES.find(g => g.key === (k as GameKey));
