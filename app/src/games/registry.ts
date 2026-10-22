// v1buddychange013: the games shown in the Games tile, in this order.
// v1buddychange015 (Batch I): + Buddy Walk: Streets, Viewing Rush, Open House Tour (3D) and Match the Buyer.
import type { GameDef, GameKey } from './types';
import { game as buddyWalk } from './buddyWalk';
import { game as priceItRight } from './priceItRight';
import { game as propertyRules } from './propertyRules';
import { game as buddyStreets } from './buddyStreets';
import { game as viewingRush } from './viewingRush';
import { game as openHouse } from './openHouse';
import { game as matchBuyer } from './matchBuyer';

export const GAMES: GameDef[] = [buddyWalk, priceItRight, propertyRules, buddyStreets, viewingRush, openHouse, matchBuyer];
export const gameByKey = (k: string): GameDef | undefined => GAMES.find(g => g.key === (k as GameKey));
