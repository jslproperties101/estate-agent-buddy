// The app's data store: one place that holds every record, saves each change to the phone's storage straight away,
// and tells the screens to redraw. Screens never write to storage directly (see useStore.ts).
import { Backend } from './backend';
import {
  AppState, CollectionName, Collections, COLLECTIONS, SingletonName, Singletons, CustomOption,
} from './types';
import { recordHash } from './hash';
import { fileRefs } from './fileRefs';

export const newId = () =>
  (globalThis.crypto && 'randomUUID' in globalThis.crypto) ? globalThis.crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export function emptyState(): AppState {
  return {
    properties: [], contacts: [], inquiries: [], appointments: [], tasks: [], journeys: [],
    deals: [], expenses: [], incomes: [], targets: [], expertThreads: [], banners: [],
    profile: {},
    settings: { lang: 'en', layout: 'grid' },
    options: {},
    meta: { fired: [], dirty: [], tombstones: [] },
  };
}

const recKey = (c: CollectionName, id: string) => `c:${c}:${id}`;
const singleKey = (s: SingletonName) => `s:${s}`;

// ---------- history, cloud copy, drafts and file bookkeeping (kept in the phone's second storage area) ----------
export type RevisionSource = 'edit' | 'cloud' | 'merge' | 'delete' | 'restore' | 'conflict' | 'migration' | 'undo';
/** An earlier version of a record, kept before it was replaced. Holds the record's own fields only, never sign-in data. */
export interface Revision { at: number; source: RevisionSource; hash: string; data: Record<string, unknown>; note?: string }
/** What the cloud last accepted or sent for a record (its version number and content). The base of every later join. */
export interface CloudBase { rev: number; hash: string; deleted: boolean; data: Record<string, unknown> | null }
export interface Draft { form: string; recordKey?: string; baseHash?: string; savedAt: number; data: unknown; extra?: unknown; /** what a new record's form was pre-filled with, so the draft can be reopened the same way */ variant?: unknown }
export type FileStatus = 'local' | 'pending' | 'uploaded' | 'failed' | 'missing' | 'denied';
export interface FileEntry {
  id: string; status: FileStatus; bytes: number; mime?: string; sha256?: string; addedAt: number;
  tries?: number; nextTry?: number; lastError?: string; removedAt?: number; uploadedAt?: number; cloudDeleted?: boolean;
}

/** Newest first; at most this many earlier versions are kept for each record. */
export const MAX_REVISIONS = 25;
/** Plain edits made within this time of the last saved version are one step of history (keeps storage small). */
const COALESCE_MS = 120_000;
/** How long a deleted record and its removed files stay recoverable on this phone. */
export const RECENTLY_DELETED_MS = 30 * 24 * 3600_000;

type Listener = () => void;

export class Store {
  private state: AppState;
  private listeners = new Set<Listener>();
  private queue: Promise<void> = Promise.resolve();
  private fileUrls = new Map<string, string>();
  /** Called when a write to storage fails, so the screen can say so. */
  onWriteError: (e: unknown) => void = () => {};
  /** How many writes to the phone's storage have failed since the app opened. A screen that wants to say "Saved" waits
   *  for flush() and checks that this number did not go up, so a failed save is never reported as saved. */
  writeErrors = 0;
  /** True from a failed write until the next write succeeds (shown as "not saved" in the status line). */
  writeFailed = false;
  private cloudBusy = false;
  private bases = new Map<string, CloudBase>();
  private drafts = new Map<string, Draft>();
  private fileEntries = new Map<string, FileEntry>();
  /** Records being sent to the cloud right now (screens show them as "Syncing"). */
  private inflight = new Set<string>();
  /** Goes up whenever a file arrives from the cloud or its state changes, so pictures redraw. */
  fileEpoch = 0;

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
    const store = new Store(backend, state);
    for (const { key, value } of await backend.listLocal('base:')) store.bases.set(key.slice(5), value as CloudBase);
    for (const { key, value } of await backend.listLocal('draft:')) store.drafts.set(key.slice(6), value as Draft);
    for (const { key, value } of await backend.listLocal('file:')) store.fileEntries.set(key.slice(5), value as FileEntry);
    return store;
  }

  getState = (): AppState => this.state;
  subscribe = (fn: Listener) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };

  private emit() { for (const l of this.listeners) l(); }
  private write(op: () => Promise<void>) {
    this.queue = this.queue.then(op).then(
      () => { if (this.writeFailed) { this.writeFailed = false; this.emit(); } },
      e => { this.writeErrors++; this.writeFailed = true; this.emit(); this.onWriteError(e); },
    );
  }

  /** True while a cloud sync is running. Only the sync code sets it. */
  get syncing() { return this.cloudBusy; }
  setSyncing(busy: boolean) { if (this.cloudBusy !== busy) { this.cloudBusy = busy; this.emit(); } }
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

  /** Adds or replaces a record. `updated` is set to now unless `keepTime` is true (used when syncing).
   *  The version being replaced is kept in the record's history first (`source` says why it was replaced). */
  upsert<K extends CollectionName>(c: K, item: Collections[K], keepTime = false, source: RevisionSource = 'edit', note?: string): Collections[K] {
    const next = (keepTime ? item : { ...item, updated: Date.now() }) as Collections[K];
    const list = this.state[c] as Collections[K][];
    const i = list.findIndex(x => x.id === next.id);
    const key = `${c}:${next.id}`;
    if (i >= 0 && !next.sample) this.keepRevision(key, list[i] as unknown as Record<string, unknown>, source, note);
    const updated = i >= 0 ? list.map((x, j) => (j === i ? next : x)) : [next, ...list];
    this.state = { ...this.state, [c]: updated };
    this.write(() => this.backend.put(recKey(c, next.id), next));
    if (i < 0) this.write(() => this.backend.removeLocal(`del:${key}`));
    if (!keepTime) this.markDirty(key);
    this.emit();
    return next;
  }

  /** Removes a record. The record is kept in its history (Recently deleted) so it can be brought back. */
  remove(c: CollectionName, id: string, fromSync = false, source: RevisionSource = 'delete') {
    const list = this.state[c] as { id: string; sample?: boolean }[];
    const old = list.find(x => x.id === id);
    if (!old) return;
    const key = `${c}:${id}`;
    if (!old.sample) {
      this.keepRevision(key, old as unknown as Record<string, unknown>, source, undefined, true);
      const at = Date.now();
      this.write(() => this.backend.putLocal(`del:${key}`, { at }));
    }
    this.state = { ...this.state, [c]: list.filter(x => x.id !== id) };
    this.write(() => this.backend.remove(recKey(c, id)));
    if (!fromSync) this.markDirty(key, true);
    this.emit();
  }

  // ---------- history ----------
  /** Puts `data` (the version about to be replaced) at the front of the record's history. Queued with the other writes. */
  private keepRevision(key: string, data: Record<string, unknown>, source: RevisionSource, note?: string, always = false) {
    const snapshot = structuredClone(data);
    const hash = recordHash(snapshot);
    const at = Date.now();
    this.write(async () => {
      const list = ((await this.backend.getLocal(`rev:${key}`)) as Revision[] | undefined) ?? [];
      const top = list[0];
      if (top && top.hash === hash && !always) return;                       // nothing new to keep
      if (!always && source === 'edit' && top?.source === 'edit' && at - top.at < COALESCE_MS) return;   // same editing burst
      await this.backend.putLocal(`rev:${key}`, [{ at, source, hash, data: snapshot, ...(note ? { note } : {}) }, ...list].slice(0, MAX_REVISIONS));
    });
  }
  /** Keeps a copy of a version that is not about to be replaced locally (e.g. the cloud's copy in a conflict). */
  saveRevision(key: string, data: Record<string, unknown>, source: RevisionSource, note?: string) { this.keepRevision(key, data, source, note, true); }
  async revisions(key: string): Promise<Revision[]> {
    await this.flush();
    return ((await this.backend.getLocal(`rev:${key}`)) as Revision[] | undefined) ?? [];
  }
  /** Brings an earlier version back as a new edit. The version it replaces goes into the history first. */
  async restoreRevision(c: CollectionName, id: string, at: number): Promise<boolean> {
    const rev = (await this.revisions(`${c}:${id}`)).find(r => r.at === at);
    if (!rev) return false;
    const restored = { ...structuredClone(rev.data), id };
    this.upsert(c, restored as never, false, 'restore', `restored ${new Date(at).toISOString()}`);
    for (const r of fileRefs(this.state)) if (r.recordId === id) this.keepFile(r.fileId);   // its pictures stay with it
    return true;
  }
  /** Records deleted on this phone in the last 30 days, newest first. */
  async recentlyDeleted(now = Date.now()): Promise<{ key: string; collection: CollectionName; id: string; at: number; data: Record<string, unknown> }[]> {
    await this.flush();
    const out = [];
    for (const { key, value } of await this.backend.listLocal('del:')) {
      const rk = key.slice(4);
      const [c, ...rest] = rk.split(':');
      const id = rest.join(':');
      const at = (value as { at: number }).at;
      if (now - at > RECENTLY_DELETED_MS || !(COLLECTIONS as string[]).includes(c)) continue;
      if ((this.state[c as CollectionName] as { id: string }[]).some(x => x.id === id)) continue;
      const top = ((await this.backend.getLocal(`rev:${rk}`)) as Revision[] | undefined)?.[0];
      if (top) out.push({ key: rk, collection: c as CollectionName, id, at, data: top.data });
    }
    return out.sort((a, b) => b.at - a.at);
  }
  /** Forgets history of records deleted more than 30 days ago and files nobody uses (run when the app opens). */
  async purgeOld(now = Date.now()) {
    await this.flush();
    for (const { key, value } of await this.backend.listLocal('del:')) {
      if (now - (value as { at: number }).at > RECENTLY_DELETED_MS) {
        const rk = key.slice(4);
        const { collection, id } = { collection: rk.split(':')[0], id: rk.split(':').slice(1).join(':') };
        if ((this.state[collection as CollectionName] as { id: string }[] | undefined)?.some(x => x.id === id)) { await this.backend.removeLocal(key); continue; }
        // Keep the history while the deletion is still waiting to reach the cloud.
        if (this.state.meta.tombstones.includes(rk)) continue;
        await this.backend.removeLocal(`rev:${rk}`);
        await this.backend.removeLocal(key);
        this.write(() => this.backend.removeLocal(`base:${rk}`));
        this.bases.delete(rk);
      }
    }
    // A draft nobody came back to for 30 days goes too, with the pictures only it used.
    for (const [k, d] of [...this.drafts]) {
      if (now - d.savedAt <= RECENTLY_DELETED_MS) continue;
      const ids: string[] = [];
      const walk = (v: unknown) => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') for (const [kk, x] of Object.entries(v)) { if ((kk === 'fileId' || kk === 'photoFileId') && typeof x === 'string') ids.push(x); else walk(x); } };
      walk(d.data);
      this.discardDraft(k);
      for (const id of ids) this.discardFile(id);
    }
    const used = new Set(fileRefs(this.state).map(r => r.fileId));
    for (const e of [...this.fileEntries.values()]) {
      if (!e.removedAt || used.has(e.id) || now - e.removedAt < RECENTLY_DELETED_MS) continue;
      this.fileEntries.delete(e.id);
      await this.backend.removeFile(e.id);
      await this.backend.removeLocal(`file:${e.id}`);
    }
    await this.flush();
  }

  // ---------- the cloud's copy (what was last accepted or received) ----------
  getBase(key: string): CloudBase | undefined { return this.bases.get(key); }
  setBase(key: string, base: CloudBase | undefined) {
    if (base) { this.bases.set(key, base); this.write(() => this.backend.putLocal(`base:${key}`, base)); }
    else { this.bases.delete(key); this.write(() => this.backend.removeLocal(`base:${key}`)); }
  }
  baseKeys(): string[] { return [...this.bases.keys()]; }

  /** Writes a record that came from the cloud: no "waiting to sync" mark, and the version it replaces goes to history. */
  applyRemote(c: CollectionName, id: string, data: Record<string, unknown> | null, source: RevisionSource = 'cloud') {
    if (data === null) { this.remove(c, id, true, source === 'cloud' ? 'delete' : source); return; }
    this.upsert(c, data as never, true, source);
  }

  // ---------- who is sending what right now ----------
  setInflight(keys: Iterable<string>, on: boolean) {
    for (const k of keys) { if (on) this.inflight.add(k); else this.inflight.delete(k); }
    this.emit();
  }
  isInflight(key: string) { return this.inflight.has(key); }

  // ---------- drafts (see data/drafts.ts) ----------
  getDraft(key: string): Draft | undefined { return this.drafts.get(key); }
  allDrafts(): { key: string; draft: Draft }[] { return [...this.drafts].map(([key, draft]) => ({ key, draft })).sort((a, b) => b.draft.savedAt - a.draft.savedAt); }
  saveDraft(key: string, draft: Draft) {
    this.drafts.set(key, draft);
    this.write(() => this.backend.putLocal(`draft:${key}`, draft));
    this.emit();
  }
  discardDraft(key: string) {
    if (!this.drafts.delete(key)) return;
    this.write(() => this.backend.removeLocal(`draft:${key}`));
    this.emit();
  }

  // ---------- generic second-area access (used by file sync and tests) ----------
  getLocal(key: string) { return this.backend.getLocal(key); }
  async listLocal(prefix: string) { await this.flush(); return this.backend.listLocal(prefix); }

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
    await this.putFileAs(id, blob, 'local');
    return id;
  }
  /** Keeps a file under a known id (a file taken down from the cloud keeps the id its record already points to). */
  async putFileAs(id: string, blob: Blob, status: FileStatus = 'local', extra: Partial<FileEntry> = {}) {
    await this.backend.putFile(id, blob);
    const old = this.fileEntries.get(id);
    this.setFileEntry({ id, status, bytes: blob.size, mime: blob.type || undefined, addedAt: old?.addedAt ?? Date.now(), ...extra });
    this.old_url(id);
  }
  private old_url(id: string) { const u = this.fileUrls.get(id); if (u) { URL.revokeObjectURL(u); this.fileUrls.delete(id); } }
  fileEntry(id: string): FileEntry | undefined { return this.fileEntries.get(id); }
  allFileEntries(): FileEntry[] { return [...this.fileEntries.values()]; }
  setFileEntry(e: FileEntry) {
    this.fileEntries.set(e.id, e);
    this.write(() => this.backend.putLocal(`file:${e.id}`, e));
    this.fileEpoch++;
    this.emit();
  }
  patchFileEntry(id: string, patch: Partial<FileEntry>) {
    const cur = this.fileEntries.get(id);
    if (cur) this.setFileEntry({ ...cur, ...patch });
  }
  hasFile(id: string) { return this.backend.getFile(id).then(b => !!b); }
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
  /** A record no longer lists this file. The file itself stays on the phone for 30 days (so a deleted record can be
   *  brought back, and a failed upload never loses the only copy); purgeOld() deletes it after that. */
  removeFile(id: string) {
    const cur = this.fileEntries.get(id) ?? { id, status: 'local' as FileStatus, bytes: 0, addedAt: Date.now() };
    this.setFileEntry({ ...cur, removedAt: Date.now() });
  }
  /** Brings a removed file back (when a deleted record is restored). */
  keepFile(id: string) {
    const cur = this.fileEntries.get(id);
    if (cur?.removedAt) { const { removedAt: _gone, ...rest } = cur; void _gone; this.setFileEntry(rest); }
  }
  /** Throws away a file that was only just added in a form that was then cancelled, if no record uses it. */
  discardFile(id: string) {
    if (fileRefs(this.state).some(r => r.fileId === id)) return;
    this.old_url(id);
    this.fileEntries.delete(id);
    this.write(async () => { await this.backend.removeFile(id); await this.backend.removeLocal(`file:${id}`); });
    this.fileEpoch++;
    this.emit();
  }
}
