// Draft autosave for a form (see data/drafts.ts for the rules). Usage in a form:
//   const draft = useDraft({ collection: 'contacts', existing, value: d, apply: setD });
//   ... <DraftBanner lang={lang} draft={draft} /> at the top, and draft.clear() right after a successful Save.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '../data/useStore';
import { CollectionName } from '../data/types';
import { decideDraft, draftKeyFor, saveDraftIfChanged } from '../data/drafts';
import { recordHash } from '../data/hash';

export const DRAFT_DEBOUNCE_MS = 700;

export interface DraftHandle {
  /** What the banner should say (null = nothing to say). */
  notice: null | { kind: 'restored' | 'stale' | 'changed-underneath'; savedAt?: number };
  /** True once something typed here is stored as a draft on this phone. */
  saved: boolean;
  /** Throw the draft away and put the form back to how it started. */
  discard: () => void;
  /** Use the older draft anyway (when the saved record changed since it was written). */
  useDraft: () => void;
  /** Call after a successful Save: the draft is no longer needed. */
  clear: () => void;
  /** Writes the draft right now (no waiting for the pause); true when a draft is stored for this form afterwards. */
  flush: () => boolean;
}

export function useDraft<T extends { id: string }>(o: {
  collection: CollectionName; existing?: T; value: T; apply: (v: T) => void;
  /** Anything else on the screen that belongs to the draft (e.g. text typed into a number box). */
  extra?: unknown; applyExtra?: (e: unknown) => void;
  /** What a NEW record was pre-filled with (so a draft is only restored into the same kind of new form). */
  variant?: unknown;
  /** Called when a draft is discarded, with the draft's form data (so files added only for it can be dropped). */
  onDiscard?: (draftValue: T) => void;
}): DraftHandle {
  const store = useStore();
  const key = draftKeyFor(o.collection, o.existing?.id, o.variant);
  const initial = useRef({ hash: recordHash(o.value), value: o.value, committedHash: o.existing ? recordHash(o.existing) : undefined });
  const live = useRef(o);
  live.current = o;
  const [notice, setNotice] = useState<DraftHandle['notice']>(null);
  const [saved, setSaved] = useState(() => !!store.getDraft(key));
  const done = useRef(false);
  const paused = useRef(false);
  const ready = useRef(false);

  const writeNow = useCallback(() => {
    if (done.current || paused.current || !ready.current) return;
    const c = live.current;
    if (saveDraftIfChanged(store, key, c.collection, c.existing, initial.current.hash, c.value, c.extra, Date.now(), c.variant)) setSaved(true);
  }, [store, key]);

  // On opening: bring back a draft written from the same starting point; ask about one that is out of date.
  useEffect(() => {
    const d = decideDraft(store, key, o.existing);
    if (d.kind === 'restore') {
      const v = d.draft.data as T;
      o.apply(v);
      if (d.draft.extra !== undefined) o.applyExtra?.(d.draft.extra);
      setNotice({ kind: 'restored', savedAt: d.draft.savedAt });
    } else if (d.kind === 'stale') {
      paused.current = true;
      setNotice({ kind: 'stale', savedAt: d.draft.savedAt });
    }
    ready.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // While the saved record changes under the open form (a sync brought a newer copy) say so, once.
  useEffect(() => {
    if (!o.existing || initial.current.committedHash === undefined) return;
    if (recordHash(o.existing) !== initial.current.committedHash) setNotice(n => n ?? { kind: 'changed-underneath' });
  }, [o.existing]);

  // Debounced autosave.
  useEffect(() => {
    const t = setTimeout(writeNow, DRAFT_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [o.value, o.extra, writeNow]);

  // Closing the screen or the app: write immediately, do not wait for the pause.
  useEffect(() => {
    const flush = () => writeNow();
    const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    return () => { document.removeEventListener('visibilitychange', onHide); window.removeEventListener('pagehide', flush); flush(); };
  }, [writeNow]);

  const clear = useCallback(() => { done.current = true; store.discardDraft(key); setSaved(false); setNotice(null); }, [store, key]);
  const discard = useCallback(() => {
    const was = store.getDraft(key);
    store.discardDraft(key);
    paused.current = false; done.current = false; setSaved(false); setNotice(null);
    if (was) live.current.onDiscard?.(was.data as T);
    live.current.apply(initial.current.value);
    live.current.applyExtra?.(undefined);
  }, [store, key]);
  const useIt = useCallback(() => {
    const was = store.getDraft(key);
    if (!was) return;
    live.current.apply(was.data as T);
    if (was.extra !== undefined) live.current.applyExtra?.(was.extra);
    paused.current = false; setNotice({ kind: 'restored', savedAt: was.savedAt });
  }, [store, key]);

  const flush = useCallback(() => { writeNow(); return !done.current && !!store.getDraft(key); }, [writeNow, store, key]);
  return { notice, saved, discard, useDraft: useIt, clear, flush };
}
