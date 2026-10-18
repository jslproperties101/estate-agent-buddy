// JoyChange002 Change 27: returning to a screen (Back, or coming back from any screen opened from it) brings it back as it
// was left: the scroll position, the search text, the filters, the open tab or section. Each place in the app's Back
// history has its own small memory. It lives only while the app is open: if Android closes the app, it starts fresh
// from the main screen. (The Grid / Large Cards choice is a saved setting instead, Change 28.)
import { createContext, useContext, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

const memory = new Map<number, Map<string, unknown>>();
const scrolls = new Map<number, number>();
let nextId = 1;

/** A new place in the Back history. */
export const newEntryId = () => nextId++;
/** The place's memory is no longer needed (it left the Back history). */
export function forgetEntry(id: number) { memory.delete(id); scrolls.delete(id); }
export function saveScroll(id: number, y: number) { scrolls.set(id, y); }
export const savedScroll = (id: number) => scrolls.get(id);

/** Which place in the Back history is drawing (set by the app shell). */
export const ScreenEntry = createContext(0);

/** Like useState, but the value is kept for this place in the Back history and comes back when the screen is shown again. */
export function useRemembered<T>(key: string, initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
  const id = useContext(ScreenEntry);
  const [v, setV] = useState<T>(() => {
    const m = memory.get(id);
    if (m && m.has(key)) return m.get(key) as T;
    return typeof initial === 'function' ? (initial as () => T)() : initial;
  });
  const set: Dispatch<SetStateAction<T>> = next => setV(prev => {
    const val = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
    let m = memory.get(id);
    if (!m) { m = new Map(); memory.set(id, m); }
    m.set(key, val);
    return val;
  });
  return [v, set];
}
