// v1buddychange013: Property Rules Quiz - pure, seedable round logic (no React, no clock).
import { BANK, type Question } from './bank';

export const ROUND_SIZE = 10;

/** One question of a round. order[i] is the original option index shown at screen position i. */
export interface RoundQ { q: Question; order: number[] }

/** Small seedable random generator (mulberry32); the same seed always gives the same sequence. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffled<T>(items: readonly T[], rand: () => number): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Pick `size` different questions at random and shuffle each one's options. */
export function makeRound(seed: number, bank: readonly Question[] = BANK, size = ROUND_SIZE): RoundQ[] {
  const rand = rng(seed);
  const picked = shuffled(bank, rand).slice(0, Math.min(size, bank.length));
  return picked.map(q => ({ q, order: shuffled(q.options.map((_, i) => i), rand) }));
}

/** Is the option at screen position `shown` the right answer? */
export function isCorrect(r: RoundQ, shown: number): boolean {
  return r.order[shown] === r.q.correct;
}

/** Screen position of the right answer. */
export function correctPosition(r: RoundQ): number {
  return r.order.indexOf(r.q.correct);
}

/** 1 point per right answer. picks[i] is the screen position chosen for question i (null/undefined = unanswered). */
export function scoreRound(round: readonly RoundQ[], picks: readonly (number | null | undefined)[]): number {
  return round.reduce((s, r, i) => s + (typeof picks[i] === 'number' && isCorrect(r, picks[i] as number) ? 1 : 0), 0);
}
