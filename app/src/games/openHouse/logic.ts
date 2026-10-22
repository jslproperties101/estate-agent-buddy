// v1buddychange015 (Batch I): Open House Tour rules, kept apart from the drawing so they can be tested.
// The show unit is 16 m x 12 m: living room and kitchen at the front (z 0..7), two bedrooms at the back (z 7..12).
import { BUYER_NAMES, pick, type Rand } from '../sample';
import type { V3 } from '../gl3d/math';

export type FeatureId = 'balcony' | 'kitchen' | 'wardrobe' | 'windows' | 'lock' | 'aircon' | 'study' | 'bedroom';
/** Where each feature is (its tap area is a ball of radius r around p). */
export const FEATURES: { id: FeatureId; p: V3; r: number }[] = [
  { id: 'balcony', p: [5, 1.3, 0.25], r: 1.3 },
  { id: 'kitchen', p: [12.4, 1.1, 3.8], r: 1.4 },
  { id: 'wardrobe', p: [0.55, 1.4, 9.6], r: 1.2 },
  { id: 'windows', p: [12.5, 1.6, 11.8], r: 1.4 },
  { id: 'lock', p: [0.22, 1.15, 5.22], r: 0.6 },
  { id: 'aircon', p: [6.8, 2.45, 6.72], r: 0.7 },
  { id: 'study', p: [15.2, 1, 8.4], r: 1.3 },
  { id: 'bedroom', p: [4.5, 0.7, 10.7], r: 1.3 },
];

export const ROUND_SECONDS = 90;
export const WRONG_PENALTY = 5;
export const HAPPY_BONUS_SECONDS = 15;
export const MAX_SCORE = 3000;

export interface TourBuyer { name: string; want: FeatureId[]; found: Set<FeatureId>; shown: Set<FeatureId>; start: number }

export function newTourBuyer(r: Rand, now: number, notName?: string): TourBuyer {
  const ids = FEATURES.map(f => f.id);
  for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
  let name: string = pick(r, BUYER_NAMES);
  if (name === notName) name = BUYER_NAMES[(BUYER_NAMES.indexOf(name as typeof BUYER_NAMES[number]) + 1) % BUYER_NAMES.length];
  return { name, want: ids.slice(0, 3), found: new Set(), shown: new Set(), start: now };
}

export type TapOutcome =
  | { k: 'already' }
  | { k: 'wrong'; seconds: number }
  | { k: 'right'; points: number }
  | { k: 'happy'; points: number; bonus: number; seconds: number };

/** What happens when the agent shows feature `id` to buyer `b` at time `now` (seconds into the round). Updates b. */
export function showFeature(b: TourBuyer, id: FeatureId, now: number): TapOutcome {
  if (b.shown.has(id)) return { k: 'already' };
  b.shown.add(id);
  if (!b.want.includes(id)) return { k: 'wrong', seconds: WRONG_PENALTY };
  b.found.add(id);
  if (b.found.size < b.want.length) return { k: 'right', points: 100 };
  const bonus = Math.max(0, Math.round((40 - (now - b.start)) * 5));
  return { k: 'happy', points: 100, bonus, seconds: HAPPY_BONUS_SECONDS };
}
