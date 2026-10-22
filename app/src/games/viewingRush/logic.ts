// v1buddychange015 (Batch I): Viewing Rush rules, kept apart from the drawing so they can be tested.
import { pick, AREA_NAMES, BUYER_NAMES, PTYPES, type Rand, type PType } from '../sample';

export const START_SECONDS = 60;
export const ADD_SECONDS = 10;
export const MAX_SCORE = 3000;
export const BLOCK = 36;
export const ROAD = 9;

export interface Viewing { x: number; z: number; name: string; type: PType; area: string; par: number }

/** A viewing 2 to 6 blocks away, always on a road, with a "par" time a fast driver can beat for bonus points. */
export function nextViewing(r: Rand, carX: number, carZ: number): Viewing {
  const pcx = Math.floor(carX / BLOCK), pcz = Math.floor(carZ / BLOCK);
  let dx = 0, dz = 0;
  while (Math.abs(dx) + Math.abs(dz) < 2) { dx = Math.round((r() * 2 - 1) * 3); dz = Math.round((r() * 2 - 1) * 3); }
  const cx = pcx + dx, cz = pcz + dz;
  let x: number, z: number;
  if (r() < 0.5) { x = cx * BLOCK + ROAD / 2; z = cz * BLOCK + ROAD + 3 + r() * (BLOCK - ROAD - 6); }
  else { z = cz * BLOCK + ROAD / 2; x = cx * BLOCK + ROAD + 3 + r() * (BLOCK - ROAD - 6); }
  return { x, z, name: pick(r, BUYER_NAMES), type: pick(r, PTYPES), area: pick(r, AREA_NAMES), par: Math.hypot(x - carX, z - carZ) / 11 + 4 };
}

/** Points for reaching a viewing after `took` seconds: 100, plus 10 for every second under par. */
export function viewingPoints(par: number, took: number): { base: number; bonus: number } {
  return { base: 100, bonus: Math.max(0, Math.round((par - took) * 10)) };
}
