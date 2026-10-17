// Starts a sync and puts its outcome on the store the same way the automatic sync does, so a button anywhere in the app
// ("Try again", "Check again") behaves exactly like the background sync: a refused or switched-off account returns to
// sign-in, any other failure is remembered as the last sync problem (the changes themselves stay on the phone).
import type { Store } from './store';
import { configured, syncNow, SyncConfig, SyncError, SyncResult } from './sync';
import { usage } from '../usage/logger';

export async function runSync(store: Store, cfg: SyncConfig, fetchFn: typeof fetch = fetch): Promise<{ ok: true; result: SyncResult } | { ok: false; code: string }> {
  if (!configured(cfg) || !store.getState().meta.syncSession) return { ok: false, code: 'not-signed-in' };
  try { const result = await syncNow(store, cfg, fetchFn); usage.sync('sync.run', true, result.pushed + result.pulled); return { ok: true, result }; }
  catch (e) {
    const code = e instanceof SyncError ? e.code : 'network';
    usage.sync('sync.run', false);
    if (code === 'auth' || code === 'no-access') store.setSingleton('meta', { syncSession: undefined, syncError: code === 'auth' ? 'expired' : code });
    else store.setSingleton('meta', { syncError: code });
    return { ok: false, code };
  }
}

// ClaudeChanges001 change 2: when the next automatic sync will run (the app tries every 60 seconds while signed in), so
// the main page banner can say "Retrying in 42s" truthfully.
let nextAt = 0;
export function setNextAutoSync(at: number) { nextAt = at; }
export const nextAutoSync = () => nextAt;
