// React access to the data store. Screens read with useApp() and change data only through store methods.
import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import type { Store } from './store';
import type { AppState } from './types';
import { SaveState, saveStateFromStore } from './savestate';

export const StoreContext = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(StoreContext);
  if (!s) throw new Error('StoreContext missing');
  return s;
}

export function useApp(): { state: AppState; store: Store } {
  const store = useStore();
  const state = useSyncExternalStore(store.subscribe, store.getState);
  return { state, store };
}

/** Object URL for a stored file (photo, document, name card), or undefined while loading or when missing. */
export function useFileUrl(fileId?: string): string | undefined {
  const store = useStore();
  const [url, setUrl] = useState<string | undefined>(undefined);
  useEffect(() => {
    let live = true;
    setUrl(undefined);
    if (fileId) void store.fileUrl(fileId).then(u => { if (live) setUrl(u); });
    return () => { live = false; };
  }, [fileId, store]);
  return url;
}

/** The status-line state (see savestate.ts). A plain word, so a screen redraws only when it really changes. */
export function useSaveState(): SaveState {
  const store = useStore();
  return useSyncExternalStore(store.subscribe, () => saveStateFromStore(store));
}
