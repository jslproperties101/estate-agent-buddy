// AI Buddy POS, Batch 7 (Joe, 9 Nov 2026): journal (JV), invoice (INV) and POS receipt (POS) numbers that never repeat in
// a business, whichever phone posts. The business chooses one of three ways on the server (owner or admin):
//   device  this phone's own letter, given once by the server: INV-A-0001, POS-A-0001 ... (works offline afterwards)
//   blocks  the server hands this phone 50 numbers of the business's one series at a time (INV-0001 ...); works offline
//           while numbers are left; topped up when fewer than 10 remain
//   server  one number at a time from the server, when posting (needs internet)
// A phone that is not signed in to a business keeps counting on its own (as before Batch 7), and so does a business whose
// database does not have the numbering functions yet ("local", remembered so it also works offline). A phone in a
// business that has never reached the server cannot post: it does not know which way the business numbers.
// Server side: supabase/proposed/20261109200000_buddy_pos_numbering.sql. What the server last said, and the numbers this
// phone holds, are kept in this phone's meta (never synced).
import type { Store } from '../data/store';
import type { SyncConfig } from '../data/sync';
import { configured } from '../data/sync';
import { rpc, TeamError } from '../team/api';
import { deviceId } from '../security/loginLog';
import { BuddyError, nextNo, type Numberer, type Series } from './engine';

export type NumMode = 'device' | 'blocks' | 'server';
export const SERIES: Series[] = ['JV', 'INV', 'POS'];
export const BLOCK = 50;
export const LOW = 10;
type Range = [number, number];
export interface NumState { workspaceId: string; userId: string; mode: NumMode | 'local'; letter?: string; pools: Partial<Record<Series, Range[]>>; at: number }
type FetchFn = typeof fetch;

/** The numbering this phone holds for the business it is signed in to now, or undefined (counting on its own). */
export function numState(store: Store): NumState | undefined {
  const st = store.getState(); const s = st.meta.syncSession; const n = st.meta.acctNumbering;
  if (!s?.workspaceId || !n || n.workspaceId !== s.workspaceId || n.userId !== s.userId) return undefined;
  return n;
}
export const left = (pool: Range[] | undefined) => (pool ?? []).reduce((x, [a, b]) => x + (b - a + 1), 0);
/** Highest number of a series in the one-series format (INV-0012 → 12) among the numbers given, so the server never goes back. */
export function highest(series: Series, used: (string | undefined)[]): number {
  let m = 0;
  for (const u of used) { const x = u && new RegExp(`^${series}-(\\d+)$`).exec(u); if (x) m = Math.max(m, +x[1]); }
  return m;
}
const fmt = (series: Series, n: number) => `${series}-${String(n).padStart(4, '0')}`;

/**
 * A number giver for one posting, and commit() to keep the numbers it used. Taking numbers changes nothing on the phone
 * until commit(), so an entry that fails to post leaves this phone's numbers as they were.
 */
export function numberer(store: Store): { num?: Numberer; commit: () => void } {
  const n = numState(store);
  if (!n || n.mode === 'local') return { num: undefined, commit: () => {} };
  if (n.mode === 'device') {
    if (!n.letter) return { num: () => { throw new BuddyError('needs-numbers'); }, commit: () => {} };
    return { num: (series, used) => nextNo(`${series}-${n.letter}`, used), commit: () => {} };
  }
  const pools: Partial<Record<Series, Range[]>> = Object.fromEntries(SERIES.map(s => [s, (n.pools[s] ?? []).map(r => [...r] as Range)]));
  let used = false;
  const num: Numberer = series => {
    const p = pools[series]!;
    while (p.length && p[0][0] > p[0][1]) p.shift();
    if (!p.length) throw new BuddyError('needs-numbers');
    used = true;
    return fmt(series, p[0][0]++);
  };
  return { num, commit: () => { if (used) store.setSingleton('meta', { acctNumbering: { ...n, pools: Object.fromEntries(SERIES.map(s => [s, pools[s]!.filter(([a, b]) => a <= b)])) } }); } };
}

/**
 * Before posting: ask the server how this business numbers and make sure this phone holds the numbers the posting needs
 * (need: how many of each series). Online it refreshes; offline it goes on with what the phone already holds. Throws
 * BuddyError('needs-numbers') when the phone cannot post without the server (server mode, or no letter / numbers left).
 * used: the numbers this phone's books already hold, per series (only to start a new server series above them).
 */
export async function prepareNumbers(store: Store, cfg: SyncConfig, need: Partial<Record<Series, number>>, used: Partial<Record<Series, (string | undefined)[]>>, fetchFn: FetchFn = fetch): Promise<void> {
  const st = store.getState(); const s = st.meta.syncSession;
  if (!s?.workspaceId || !configured(cfg)) return;                     // not in a business: the phone counts on its own
  const ws = s.workspaceId; const dev = deviceId();
  if (dev === 'unknown') throw new BuddyError('needs-numbers');        // storage blocked: no lasting phone name, so no safe letter
  let n: NumState | undefined = numState(store);
  try {
    const g = await rpc<{ mode: NumMode; letter?: string | null }>(store, cfg, 'eab_acct_numbering_get', { ws, p_device: dev }, fetchFn);
    const pools = n && n.mode === g.mode ? n.pools : {};                 // numbers of another way are not used any more
    n = { workspaceId: ws, userId: s.userId, mode: g.mode, letter: g.letter ?? undefined, pools, at: Date.now() };
    if (n.mode !== 'device') {
      for (const series of SERIES) {
        const want = need[series] ?? 0;
        if (!want) continue;                                             // only for a posting, which knows this phone's numbers (p_min)
        const have = left(n.pools[series]);
        const take: number = n.mode === 'server' ? Math.max(0, want - have) : (have < want || have - want < LOW ? Math.max(BLOCK, want) : 0);
        if (!take) continue;
        const r: { from: number; to: number } = await rpc<{ from: number; to: number }>(store, cfg, 'eab_acct_take', { ws, p_series: series, p_count: Math.min(100, take), p_device: dev, p_min: highest(series, used[series] ?? []) }, fetchFn);
        n = { ...n, pools: { ...n.pools, [series]: [...(n.pools[series] ?? []), [r.from, r.to] as Range] } };
      }
    }
    if (store.getState().meta.syncSession?.workspaceId !== ws) return;   // signed out or switched meanwhile
    store.setSingleton('meta', { acctNumbering: n });
  } catch (e) {
    // A database without the Batch 7 functions: the phone counts on its own, as before.
    if (e instanceof TeamError && e.code === 'unavailable') {
      if (store.getState().meta.syncSession?.workspaceId === ws) store.setSingleton('meta', { acctNumbering: { workspaceId: ws, userId: s.userId, mode: 'local', pools: {}, at: Date.now() } });
      return;
    }
    if (!(e instanceof TeamError) || e.code !== 'network') throw e;
  }
  const h = numState(store);
  if (!h) throw new BuddyError('needs-numbers');                        // never reached the server: the way is not known
  if (h.mode === 'local') return;
  if (h.mode === 'device' ? !h.letter : SERIES.some(x => left(h.pools[x]) < (need[x] ?? 0))) throw new BuddyError('needs-numbers');
}

/** Owner or admin: change the business's way of numbering (applies to entries posted from now on). */
export async function setNumberingMode(store: Store, cfg: SyncConfig, mode: NumMode, fetchFn: FetchFn = fetch): Promise<void> {
  const ws = store.getState().meta.syncSession?.workspaceId;
  if (!ws) throw new BuddyError('needs-numbers');
  await rpc(store, cfg, 'eab_acct_numbering_set', { ws, p_mode: mode }, fetchFn);
  await prepareNumbers(store, cfg, {}, {}, fetchFn);
}
