// The app's data store: one place that holds every record, saves each change to the phone's storage straight away,
// and tells the screens to redraw. Screens never write to storage directly (see useStore.ts).
import { Backend } from './backend';
import {
  AppState, CollectionName, Collections, COLLECTIONS, SingletonName, Singletons, CustomOption,
} from './types';

export const newId = () =>
  (globalThis.crypto && 'randomUUID' in globalThis.crypto) ? globalThis.crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export function emptyState(): AppState {
  return {
    properties: [], contacts: [], inquiries: [], appointments: [], tasks: [], journeys: [],
    deals: [], expenses: [], incomes: [], targets: [], expertThreads: [],
    profile: {},
    settings: { lang: 'en', layout: 'grid' },
    options: {},
    meta: { fired: [], dirty: [], tombstones: [] },
  };
}

const recKey = (c: CollectionName, id: string) => `c:${c}:${id}`;
const singleKey = (s: SingletonName) => `s:${s}`;

type Listener = () => void;

export class Store {
  private state: AppState;
  private listeners = new Set<Listener>();
  private queue: Promise<void> = Promise.resolve();
  private fileUrls = new Map<string, string>();
  /** Called when a write to storage fails, so the screen can say so. */
  onWriteError: (e: unknown) => void = () => {};

  private constructor(private backend: Backend, state: AppState) { this.state = state; }

  get persistent() { return this.backend.persistent; }

  static async open(backend: Backend): Promise<Store> {
    const state = emptyState();
    for (const { key, value } of await backend.loadAll()) {
      const [kind, name, ...rest] = key.split(':');
      if (kind === 'c' && (COLLECTIONS as string[]).includes(name) && rest.length) {
        (state[name as CollectionName] as unknown[]).push(value);
      } else if (kind === 's' && name in state) {
        (state as unknown as Record<string, unknown>)[name] = { ...(state as unknown as Record<string, object>)[name], ...(value as object) };
      }
    }
    for (const c of COLLECTIONS) (state[c] as { created: number }[]).sort((a, b) => b.created - a.created);
    return new Store(backend, state);
  }

  getState = (): AppState => this.state;
  subscribe = (fn: Listener) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };

  private emit() { for (const l of this.listeners) l(); }
  private write(op: () => Promise<void>) {
    this.queue = this.queue.then(op).catch(e => this.onWriteError(e));
  }
  /** Resolves when every change so far has been written (used by tests and before a sync). */
  flush() { return this.queue; }

  private markDirty(key: string, deleted = false) {
    const m = this.state.meta;
    const dirty = m.dirty.includes(key) ? m.dirty : [...m.dirty, key];
    const tombstones = deleted ? (m.tombstones.includes(key) ? m.tombstones : [...m.tombstones, key]) : m.tombstones.filter(k => k !== key);
    this.state = { ...this.state, meta: { ...m, dirty, tombstones } };
    const meta = this.state.meta;
    this.write(() => this.backend.put(singleKey('meta'), meta));
  }

  /** Adds or replaces a record. `updated` is set to now unless `keepTime` is true (used when syncing). */
  upsert<K extends CollectionName>(c: K, item: Collections[K], keepTime = false): Collections[K] {
    const next = (keepTime ? item : { ...item, updated: Date.now() }) as Collections[K];
    const list = this.state[c] as Collections[K][];
    const i = list.findIndex(x => x.id === next.id);
    const updated = i >= 0 ? list.map((x, j) => (j === i ? next : x)) : [next, ...list];
    this.state = { ...this.state, [c]: updated };
    this.write(() => this.backend.put(recKey(c, next.id), next));
    if (!keepTime) this.markDirty(`${c}:${next.id}`);
    this.emit();
    return next;
  }

  remove(c: CollectionName, id: string, fromSync = false) {
    const list = this.state[c] as { id: string }[];
    if (!list.some(x => x.id === id)) return;
    this.state = { ...this.state, [c]: list.filter(x => x.id !== id) };
    this.write(() => this.backend.remove(recKey(c, id)));
    if (!fromSync) this.markDirty(`${c}:${id}`, true);
    this.emit();
  }

  setSingleton<S extends SingletonName>(s: S, patch: Partial<Singletons[S]>) {
    const value = { ...this.state[s], ...patch } as Singletons[S];
    this.state = { ...this.state, [s]: value };
    this.write(() => this.backend.put(singleKey(s), value));
    this.emit();
  }

  // ---------- remembered custom dropdown values ----------
  addOption(list: string, value: string) {
    const v = value.trim();
    if (!v) return;
    const now = Date.now();
    const cur = this.state.options[list] ?? [];
    const found = cur.find(o => o.value.toLowerCase() === v.toLowerCase());
    const next: CustomOption[] = found
      ? cur.map(o => (o === found ? { ...o, used: now } : o))
      : [...cur, { value: v, added: now, used: now }];
    this.setSingleton('options', { [list]: next });
  }
  touchOption(list: string, value: string) {
    const cur = this.state.options[list];
    if (!cur?.some(o => o.value === value)) return;
    this.setSingleton('options', { [list]: cur.map(o => (o.value === value ? { ...o, used: Date.now() } : o)) });
  }
  removeOption(list: string, value: string) {
    const cur = this.state.options[list] ?? [];
    this.setSingleton('options', { [list]: cur.filter(o => o.value !== value) });
  }

  // ---------- files (photos, documents, name cards) ----------
  async putFile(blob: Blob): Promise<string> {
    const id = newId();
    await this.backend.putFile(id, blob);
    return id;
  }
  async fileUrl(id: string): Promise<string | undefined> {
    const known = this.fileUrls.get(id);
    if (known) return known;
    const blob = await this.backend.getFile(id);
    if (!blob) return undefined;
    const url = URL.createObjectURL(blob);
    this.fileUrls.set(id, url);
    return url;
  }
  getFile(id: string) { return this.backend.getFile(id); }
  removeFile(id: string) {
    const url = this.fileUrls.get(id);
    if (url) { URL.revokeObjectURL(url); this.fileUrls.delete(id); }
    this.write(() => this.backend.removeFile(id));
  }
}
