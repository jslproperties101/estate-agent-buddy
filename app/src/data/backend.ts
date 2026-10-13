// Storage backends. IndexedDB keeps records and files on the phone permanently (it survives closing the app and
// restarting the phone; inside the Android app it lives in the app's own storage). The memory backend is used only
// when the browser refuses storage (for example some private windows) and in the Node tests; the app then warns
// that nothing will be kept.

export interface StoredRecord { key: string; value: unknown }

export interface Backend {
  readonly persistent: boolean;
  loadAll(): Promise<StoredRecord[]>;
  put(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
  putFile(id: string, blob: Blob): Promise<void>;
  getFile(id: string): Promise<Blob | undefined>;
  removeFile(id: string): Promise<void>;
  /** A second key-value area for things that are not records: revision history, drafts, the copy last seen in the
   *  cloud, file sync bookkeeping. Kept apart from records so opening the app never has to read it. */
  getLocal(key: string): Promise<unknown>;
  putLocal(key: string, value: unknown): Promise<void>;
  removeLocal(key: string): Promise<void>;
  listLocal(prefix: string): Promise<StoredRecord[]>;
}

export class MemoryBackend implements Backend {
  readonly persistent = false;
  private records = new Map<string, unknown>();
  private files = new Map<string, Blob>();
  private local = new Map<string, unknown>();
  async getLocal(key: string) { return this.local.has(key) ? structuredClone(this.local.get(key)) : undefined; }
  async putLocal(key: string, value: unknown) { this.local.set(key, structuredClone(value)); }
  async removeLocal(key: string) { this.local.delete(key); }
  async listLocal(prefix: string) { return [...this.local].filter(([k]) => k.startsWith(prefix)).sort(([a], [b]) => (a < b ? -1 : 1)).map(([key, value]) => ({ key, value: structuredClone(value) })); }
  async loadAll() { return [...this.records].map(([key, value]) => ({ key, value: structuredClone(value) })); }
  async put(key: string, value: unknown) { this.records.set(key, structuredClone(value)); }
  async remove(key: string) { this.records.delete(key); }
  async putFile(id: string, blob: Blob) { this.files.set(id, blob); }
  async getFile(id: string) { return this.files.get(id); }
  async removeFile(id: string) { this.files.delete(id); }
}

const DB_NAME = 'estate-agent-buddy';
const DB_VERSION = 2;   // 2 adds the 'local' store (history, drafts, sync bookkeeping); records and files are untouched

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
}

export class IndexedDbBackend implements Backend {
  readonly persistent = true;
  private constructor(private db: IDBDatabase) {}

  static async open(): Promise<IndexedDbBackend> {
    if (typeof indexedDB === 'undefined') throw new Error('no-indexeddb');
    const open = indexedDB.open(DB_NAME, DB_VERSION);
    open.onupgradeneeded = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains('records')) db.createObjectStore('records');
      if (!db.objectStoreNames.contains('files')) db.createObjectStore('files');
      if (!db.objectStoreNames.contains('local')) db.createObjectStore('local');
    };
    const db = await req(open);
    // Ask the browser not to clear this data when space runs low (granted automatically for installed apps).
    try { await navigator.storage?.persist?.(); } catch { /* not supported */ }
    return new IndexedDbBackend(db);
  }

  private store(name: 'records' | 'files', mode: IDBTransactionMode) {
    return this.db.transaction(name, mode).objectStore(name);
  }

  async loadAll(): Promise<StoredRecord[]> {
    const s = this.store('records', 'readonly');
    const [keys, values] = await Promise.all([req(s.getAllKeys()), req(s.getAll())]);
    return keys.map((k, i) => ({ key: String(k), value: values[i] }));
  }
  async put(key: string, value: unknown) { await req(this.store('records', 'readwrite').put(value, key)); }
  async remove(key: string) { await req(this.store('records', 'readwrite').delete(key)); }
  async putFile(id: string, blob: Blob) { await req(this.store('files', 'readwrite').put(blob, id)); }
  async getFile(id: string) { return (await req(this.store('files', 'readonly').get(id))) as Blob | undefined; }
  async removeFile(id: string) { await req(this.store('files', 'readwrite').delete(id)); }
  private localStore(mode: IDBTransactionMode) { return this.db.transaction('local', mode).objectStore('local'); }
  async getLocal(key: string) { return req(this.localStore('readonly').get(key)); }
  async putLocal(key: string, value: unknown) { await req(this.localStore('readwrite').put(value, key)); }
  async removeLocal(key: string) { await req(this.localStore('readwrite').delete(key)); }
  async listLocal(prefix: string): Promise<StoredRecord[]> {
    const s = this.localStore('readonly');
    const range = IDBKeyRange.bound(prefix, `${prefix}\uffff`);
    const [keys, values] = await Promise.all([req(s.getAllKeys(range)), req(s.getAll(range))]);
    return keys.map((k, i) => ({ key: String(k), value: values[i] }));
  }
}

/** IndexedDB when the browser allows it, otherwise memory (with persistent = false so the app can warn). */
export async function openBackend(): Promise<Backend> {
  try { return await IndexedDbBackend.open(); } catch { return new MemoryBackend(); }
}
