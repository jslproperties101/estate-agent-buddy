// JoyChange010-04: files shared INTO the app from WhatsApp (or any app), and moving documents between folders.
//  - Android lists the app in its share sheet as "EA AI Buddy Document Upload" (scripts/android-setup.mjs,
//    EabSharePlugin). What arrives is kept in the phone's file storage and listed in the Shared Documents tray
//    (meta.sharedInbox, this phone only, not synced: it is a tray, not a record).
//  - From the tray the agent moves a file to one of their properties, into one of its document folders. It then becomes
//    an ordinary document of that property (synced, backed up, kept in the record's history like any other).
//  - Inside a property, a document can be moved to another folder (Floor plans → Title documents → Other documents ...).
// Confidential folders (title, owner correspondence, rental or sales documents): the database decides from the folder
// who may download a file (JoyChange010-05), so moving a document between folders changes who can read it at once.
import type { Store } from '../data/store';
import type { AppState } from '../data/types';
import { DOC_CATEGORIES, type Doc, type DocCategory, type Listing } from '../listing/model';
import { can } from '../team/access';

export interface SharedFile { id: string; fileId: string; name: string; mime?: string; bytes: number; added: number }
/** Largest single file accepted (a WhatsApp document can be up to 2 GB; a phone's storage and backups cannot). */
export const MAX_SHARED_BYTES = 50 * 1024 * 1024;
/** Most files kept in the tray at once. */
export const MAX_TRAY = 200;

const rid = () => `sh_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const did = () => `d_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export const sharedTray = (st: Pick<AppState, 'meta'>): SharedFile[] => st.meta.sharedInbox ?? [];

/** A safe file name: no folders, no control characters, at most 120 letters, never empty. */
export function cleanFileName(name: string | undefined, mime?: string): string {
  // eslint-disable-next-line no-control-regex
  let n = String(name ?? '').split(/[\\/]/).pop()!.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!n) {
    const ext = mime === 'application/pdf' ? '.pdf' : mime?.startsWith('image/') ? `.${mime.slice(6).replace('jpeg', 'jpg').replace(/[^a-z0-9]/g, '') || 'jpg'}` : '';
    n = `Shared file${ext}`;
  }
  if (n.length > 120) { const dot = n.lastIndexOf('.'); const ext = dot > 0 && n.length - dot <= 10 ? n.slice(dot) : ''; n = n.slice(0, 120 - ext.length) + ext; }
  return n;
}

export interface Incoming { name?: string; mime?: string; blob: Blob }
export interface AddResult { added: number; tooBig: string[]; full: number }

/** Puts shared files into the tray. Too-big files are refused by name; a full tray refuses the rest. */
export async function addShared(store: Store, files: Incoming[], now = Date.now()): Promise<AddResult> {
  const out: AddResult = { added: 0, tooBig: [], full: 0 };
  const fresh: SharedFile[] = [];
  for (const f of files) {
    const name = cleanFileName(f.name, f.mime || f.blob.type);
    if (f.blob.size > MAX_SHARED_BYTES) { out.tooBig.push(name); continue; }
    if (sharedTray(store.getState()).length + fresh.length >= MAX_TRAY) { out.full++; continue; }
    if (f.blob.size === 0) continue;
    const fileId = await store.putFile(f.blob);
    fresh.push({ id: rid(), fileId, name, mime: f.mime || f.blob.type || undefined, bytes: f.blob.size, added: now });
  }
  if (fresh.length) store.setSingleton('meta', { sharedInbox: [...fresh, ...sharedTray(store.getState())] });
  out.added = fresh.length;
  return out;
}

/** Deletes a file from the tray (and from the phone: nothing else uses it). */
export function removeShared(store: Store, id: string): boolean {
  const tray = sharedTray(store.getState());
  const f = tray.find(x => x.id === id);
  if (!f) return false;
  store.setSingleton('meta', { sharedInbox: tray.filter(x => x.id !== id) });
  store.discardFile(f.fileId);
  return true;
}

/** Properties a tray file may be moved to: the agent's own and shared ones they may edit; not archived, not samples. */
export const movableTargets = (st: AppState): Listing[] =>
  st.properties.filter(p => !p.archived && !p.sample && can(st, 'edit', 'properties', p.id));

export type MoveResult = 'moved' | 'no-file' | 'no-property' | 'not-allowed' | 'bad-folder';

/** Moves a tray file into a property's folder. Re-checks permission at the moment of moving. */
export async function moveSharedToProperty(store: Store, id: string, propertyId: string, category: DocCategory, now = Date.now()): Promise<MoveResult> {
  if (!DOC_CATEGORIES.includes(category)) return 'bad-folder';
  const st = store.getState();
  const f = sharedTray(st).find(x => x.id === id);
  if (!f) return 'no-file';
  const p = st.properties.find(x => x.id === propertyId);
  if (!p || p.archived) return 'no-property';
  if (!can(st, 'edit', 'properties', p.id)) return 'not-allowed';
  const doc: Doc = { id: did(), category, name: f.name, fileId: f.fileId, bytes: f.bytes, mime: f.mime, added: now };
  // the tray entry goes first, so the file is never in two places
  store.setSingleton('meta', { sharedInbox: sharedTray(store.getState()).filter(x => x.id !== id) });
  store.upsert('properties', { ...p, documents: [...(p.documents ?? []), doc] });
  return 'moved';
}

/** Moves one document of a form (or a saved property) to another folder. The file itself stays the same: since
 *  JoyChange010-05 confidential documents go to the cloud too, and the database decides who may read them by folder.
 *  `onFiles` is kept for callers that track added / removed files (nothing is added or removed now). */
export async function moveDocToFolder(_store: Store, docs: Doc[], docId: string, to: DocCategory,
  _onFiles: (added: string | undefined, removed: string | undefined) => void = () => undefined): Promise<Doc[]> {
  const d = docs.find(x => x.id === docId);
  if (!d || d.category === to || !DOC_CATEGORIES.includes(to)) return docs;
  // moved to the end of the new folder, keeping its name, file and the date it was added
  return [...docs.filter(x => x.id !== docId), { ...d, category: to }];
}
