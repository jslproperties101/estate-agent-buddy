// MainForAdmin-E: the company's feature switches from Admin EAB (AdminBatch006, table eab_feature_flags).
//  - The database decides which switches are on for the signed-in agent (eab_my_flags: everyone or chosen audience
//    groups). The phone only reads the answer and keeps the last one, so it also works offline.
//  - Two kinds of key mean something to this app (Joe, 22 Oct 2026):
//      tile.<key>   a home tile. Switched OFF = the tile is hidden for these agents. No such flag = the tile shows as before.
//      beta.<name>  a test feature. Switched ON = the feature is shown to these agents. No flag or OFF = hidden.
//    Any other key is kept but changes nothing in this app.
//  - A database without eab_my_flags (an older project) or a phone that never heard an answer: nothing is hidden and
//    no test feature is shown — the app behaves exactly as before this change.
import type { Store } from '../data/store';
import { configured, type SyncConfig } from '../data/sync';
import { rpc, TeamError } from '../team/api';

export interface FlagCache { userId: string; flags: Record<string, boolean>; at: number }

/** Same rule as the database's key check (eab_feature_flags.key). */
export const FLAG_KEY = /^[a-z0-9][a-z0-9_.-]{1,59}$/;

/** Only well-formed keys with true / false answers are kept; anything else from the server is ignored. */
export function cleanFlags(x: unknown): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  if (!x || typeof x !== 'object' || Array.isArray(x)) return out;
  for (const [k, v] of Object.entries(x as Record<string, unknown>)) if (FLAG_KEY.test(k) && typeof v === 'boolean') out[k] = v;
  return out;
}

/** The switches last heard for the person signed in now (another account's are never used). */
export function myFlags(store: Store): Record<string, boolean> {
  const st = store.getState(); const f = st.meta.flags; const me = st.meta.syncSession?.userId;
  return f && me && f.userId === me ? f.flags : {};
}

/** A home tile is hidden only when Admin made a tile.<key> switch and it is OFF for this agent. */
export const tileHidden = (flags: Record<string, boolean>, tileKey: string) => flags[`tile.${tileKey}`] === false;
/** A test feature is shown only when Admin made a beta.<name> switch and it is ON for this agent. */
export const betaOn = (flags: Record<string, boolean>, name: string) => flags[`beta.${name}`] === true;

/** Asks the database which switches are on for this agent. Returns false when nothing could be read (the last answer is kept). */
export async function refreshFlags(store: Store, cfg: SyncConfig, fetchFn?: typeof fetch): Promise<boolean> {
  const s = store.getState().meta.syncSession;
  if (!s || !configured(cfg)) return false;
  try {
    const j = await rpc<unknown>(store, cfg, 'eab_my_flags', {}, fetchFn);
    if (store.getState().meta.syncSession?.userId !== s.userId) return false;   // signed out or switched meanwhile
    store.setSingleton('meta', { flags: { userId: s.userId, flags: cleanFlags(j), at: Date.now() } });
    return true;
  } catch (e) {
    // The function is not on this database: no switches (the app as before). Offline or refused: keep the last answer.
    if (e instanceof TeamError && e.code === 'unavailable') store.setSingleton('meta', { flags: { userId: s.userId, flags: {}, at: Date.now() } });
    return false;
  }
}
