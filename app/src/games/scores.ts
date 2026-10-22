// v1buddychange013: best scores, play counts, daily streak and badges for the Games tile.
// Kept on this phone only (browser storage, per viewer). Nothing here is synced or sent anywhere.
import type { GameKey, GameResult } from './types';

export interface GameStat { best: number; bestMax: number; plays: number; lastDay?: string }
export interface GamesState { v: 1; games: Partial<Record<GameKey, GameStat>>; streak: number; lastDay?: string; badges: string[] }

export const EMPTY: GamesState = { v: 1, games: {}, streak: 0, badges: [] };
const KEY = 'eab.games.v1';

/** Malaysia day (UTC+8) as YYYY-MM-DD, so a streak follows the agent's calendar day. */
export function myDay(now: number): string {
  return new Date(now + 8 * 3600_000).toISOString().slice(0, 10);
}
function dayBefore(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
}

export const BADGES = ['first', 'streak3', 'streak7', 'perfect', 'allGames', 'plays25'] as const;
export type Badge = typeof BADGES[number];

/** Pure: the new state after one finished round. Score is clamped to 0..maxScore. */
export function recordResult(prev: GamesState, key: GameKey, r: GameResult, now: number): GamesState {
  const max = Math.max(1, Math.round(r.maxScore));
  const score = Math.min(max, Math.max(0, Math.round(r.score)));
  const day = myDay(now);
  const old = prev.games[key] ?? { best: 0, bestMax: max, plays: 0 };
  const better = score / max > old.best / Math.max(1, old.bestMax) || old.plays === 0;
  const stat: GameStat = { best: better ? score : old.best, bestMax: better ? max : old.bestMax, plays: old.plays + 1, lastDay: day };
  const streak = prev.lastDay === day ? Math.max(1, prev.streak) : prev.lastDay === dayBefore(day) ? prev.streak + 1 : 1;
  const games = { ...prev.games, [key]: stat };
  const badges = new Set(prev.badges);
  badges.add('first');
  if (streak >= 3) badges.add('streak3');
  if (streak >= 7) badges.add('streak7');
  if (score === max) badges.add('perfect');
  const total = Object.values(games).reduce((n, g) => n + (g?.plays ?? 0), 0);
  if (total >= 25) badges.add('plays25');
  if ((['buddyWalk', 'priceItRight', 'propertyRules'] as GameKey[]).every(k => (games[k]?.plays ?? 0) > 0)) badges.add('allGames');
  return { v: 1, games, streak, lastDay: day, badges: BADGES.filter(b => badges.has(b)) };
}

/** Streak shown today: it lapses if the last play was before yesterday. */
export function liveStreak(s: GamesState, now: number): number {
  const day = myDay(now);
  return s.lastDay === day || s.lastDay === dayBefore(day) ? s.streak : 0;
}

export function loadGames(): GamesState {
  try {
    const raw = localStorage.getItem(KEY);
    const v = raw ? JSON.parse(raw) : null;
    return v && v.v === 1 && typeof v.games === 'object' ? { ...EMPTY, ...v, badges: Array.isArray(v.badges) ? v.badges : [] } : EMPTY;
  } catch { return EMPTY; }
}
export function saveGames(s: GamesState): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage blocked: scores just aren't kept */ }
}
