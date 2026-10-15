// Change 006 Layer 2 (readable folders) and the Drive half of Layer 1 (Recovery folders): writes tree.ts's plan into the
// person's Google Drive and keeps it up to date.
//
//  - Idempotent: the phone remembers, per item, the Drive file id, the content fingerprint and Drive's version number it
//    last wrote ("drivetree:index"). A rerun sends only what changed, so there is no loop and no duplicate.
//  - An edited text file: the previous Drive copy is first copied into a Recovery/ folder beside it
//    ("2026-10-15T09-42-07+0800 edited Property Details.txt"); only then is the file rewritten.
//  - A deleted item: moved (not deleted) into the Recovery/ folder at its parent level, named
//    "… deleted <name>". A whole property, contact or To-Do goes as one folder or file.
//  - A renamed or moved record (new township, new owner name…): the same Drive files are moved, so links keep working.
//  - Edited outside the app: when Drive's version of a file differs from the one the app wrote, the person's version is
//    copied to Recovery/ as "… edited outside the app <name>" and listed in Export Status.txt; the app's version is
//    written back. Nothing is ever imported from Drive by itself.
//  - A file the person put in the bin: written again ("recreated").
//  - Not known to this phone but already in Drive under the same name ("Rebuild Drive folders", a reinstalled app, a
//    second phone of the same account): the same content is adopted; different content is kept in Recovery as
//    "… replaced <name>" first. So a rebuild never makes duplicate files.
//  - Recovery copies older than 90 days go to the Drive bin (recoverable for another 30 days by Google).
//  - Honest status: Export Status.txt and the app say "complete" only when every item of the run was written and
//    size-checked; otherwise "partial", with what is waiting for sync and what failed.
//  - One-way: only the app's own items are touched (drive.file permission). Restore points (Disaster Recovery) and the
//    older backup-file folder are never touched here.
import type { Store } from '../data/store';
import { sha256Hex } from '../data/hash';
import { BUILD } from '../native/updates';
import { buildTree, csv, TreeEntry, waitingKeys } from './tree';
import { DriveClient, DriveError, DriveItem, FOLDER_MIME, mytIso, mytStamp, stampTime } from './driveApi';
import { ROOT_NAME, DR_NAME } from './restorePoints';

export const RECOVERY = 'Recovery';
export const RECOVERY_KEEP_MS = 90 * 24 * 3600_000;
const INDEX_KEY = 'drivetree:index';
const SYSTEM = ['README.txt', 'Export Status.txt', 'Index.csv'];

interface FileRec { id: string; path: string[]; name: string; hash: string; version?: string; sha256: string; group: string; groupRoot?: string[]; bytes: number }
interface TreeIndex { rootId?: string; folders: Record<string, string>; files: Record<string, FileRec>; system: Record<string, string> }

export interface TreeRun {
  ok: boolean;
  /** complete = everything in the plan is in Drive and checked; partial = something is waiting or failed. */
  status: 'complete' | 'partial';
  written: number; unchanged: number; moved: number; toRecovery: number; recreated: number; binned: number;
  editedOutside: string[]; waiting: string[]; failed: string[];
}

const enc = new TextEncoder();
const pk = (p: string[]) => p.join('/');
const shaText = (s: string) => sha256Hex(enc.encode(s).buffer as ArrayBuffer);

async function loadIndex(store: Store): Promise<TreeIndex> {
  const r = (await store.listLocal('drivetree:')).find(x => x.key === INDEX_KEY)?.value as TreeIndex | undefined;
  return r ?? { folders: {}, files: {}, system: {} };
}

const README = `Estate Agent AI Buddy - your readable data folders

These folders are a readable copy of your workspace, made by the app from records the cloud has confirmed.
Open the text files, CSV files, photos and documents as you would any other file.

- Property Listing: Country > State > Town > Township > Unit/Lot and street > Owner.
- Each item's file starts with its Record ID. Index.csv lists every Record ID, where it is and its SHA-256.
- Recovery folders hold earlier versions of edited files and items that were deleted (kept 90 days).
- Export Status.txt says whether the last update was complete, and what is waiting.

This is a view, not a backup format. Changes you make here are NOT read back into the app: an edited file is moved to
Recovery as "edited outside the app" and the app's version is written again.
To restore the app, use the restore points in "${DR_NAME}" (Agent Profile > Settings > Backup and restore).

Included: your confidential documents too (title deeds, owner correspondence, agreements), because this is your own
Drive. Not included on purpose: records other agents share with you, sample data, and any keys, tokens or passwords.
`;

export async function exportTree(store: Store, d: DriveClient, now = Date.now()): Promise<TreeRun> {
  const st = store.getState();
  const waiting = waitingKeys(st);
  const plan = buildTree(st, { waiting });
  const idx = await loadIndex(store);
  const run: TreeRun = { ok: false, status: 'partial', written: 0, unchanged: 0, moved: 0, toRecovery: 0, recreated: 0, binned: 0, editedOutside: [], waiting: [], failed: [] };
  const stamp = mytStamp(now);

  // the root folder; if the person removed it, everything is written again from scratch
  const rootId = await d.folder('root', ROOT_NAME);
  if (idx.rootId !== rootId) { idx.rootId = rootId; idx.folders = {}; idx.files = {}; idx.system = {}; }
  // what Drive holds now (only the app's own items are visible with drive.file)
  const live = new Map<string, DriveItem>();
  for (const it of await d.list('trashed=false', 'id,name,mimeType,parents,version,size')) live.set(it.id, it);
  for (const [k, id] of Object.entries(idx.folders)) if (!live.has(id)) delete idx.folders[k];

  const folder = async (path: string[]): Promise<string> => {
    if (!path.length) return rootId;
    const k = pk(path);
    if (idx.folders[k]) return idx.folders[k];
    const parent = await folder(path.slice(0, -1));
    const id = await d.folder(parent, path[path.length - 1]);
    idx.folders[k] = id;
    return id;
  };
  const recoveryOf = (path: string[]) => folder([...path, RECOVERY]);
  const parentsOf = (id: string) => live.get(id)?.parents ?? [];
  const bytesOf = async (e: TreeEntry): Promise<Uint8Array | undefined> => {
    if (e.text !== undefined) return enc.encode(e.text);
    const b = e.fileId ? await store.getFile(e.fileId) : undefined;
    return b ? new Uint8Array(await b.arrayBuffer()) : undefined;
  };

  const planned = new Map(plan.map(e => [e.key, e]));
  const save = async () => { await store.putLocalNow(INDEX_KEY, idx); };

  // 1. write what is new or changed
  for (const e of plan) {
    const prev = idx.files[e.key];
    if (e.waiting) { run.waiting.push(`${pk(e.path)}/${e.name}`); continue; }   // the previous Drive copy stays as it is
    try {
      const there = prev ? live.get(prev.id) : undefined;
      const parent = await folder(e.path);
      if (prev && there) {
        // edited outside the app: keep the person's version in Recovery, then write the app's
        if (prev.version && there.version && there.version !== prev.version) {
          const rec = await recoveryOf(prev.path);
          await d.copy(prev.id, rec, `${stamp} edited outside the app ${prev.name}`);
          run.editedOutside.push(`${pk(prev.path)}/${prev.name}`); run.toRecovery++;
          prev.hash = '';                                                      // force the rewrite below
        }
        if (pk(prev.path) !== pk(e.path) || prev.name !== e.name) {             // renamed or moved: same Drive file
          const moved = await d.move(prev.id, parent, parentsOf(prev.id), e.name);
          live.set(prev.id, { ...there, ...moved, parents: [parent] });
          prev.path = e.path; prev.name = e.name; prev.version = moved.version ?? prev.version; run.moved++;
        }
        if (prev.hash === e.hash) { run.unchanged++; continue; }
        const data = await bytesOf(e);
        if (!data) { run.failed.push(`${pk(e.path)}/${e.name}`); continue; }
        if (e.text !== undefined && prev.hash) {                               // the earlier version goes to Recovery first
          const rec = await recoveryOf(e.path);
          await d.copy(prev.id, rec, `${stamp} edited ${prev.name}`); run.toRecovery++;
        }
        const it = await d.update(prev.id, e.mime, data);
        Object.assign(prev, { hash: e.hash, version: it.version, sha256: await sha256Hex(data.slice().buffer as ArrayBuffer), bytes: data.length, group: e.group, groupRoot: e.groupRoot });
        live.set(prev.id, { ...there, ...it });
        run.written++;
      } else {
        const data = await bytesOf(e);
        if (!data) { run.failed.push(`${pk(e.path)}/${e.name}`); continue; }
        const sha = await sha256Hex(data.slice().buffer as ArrayBuffer);
        // Not known to this phone, but a file of that name is already there (a rebuild, a reinstalled app, a new phone):
        // the same content is adopted as it is; different content is kept in Recovery first, then replaced.
        const same = !prev ? [...live.values()].find(x => x.name === e.name && x.mimeType !== FOLDER_MIME && (x.parents ?? []).includes(parent)) : undefined;
        if (same) {
          const theirs = e.text !== undefined || Number(same.size) === data.length ? await d.download(same.id) : undefined;
          const equal = !!theirs && await sha256Hex(theirs.slice().buffer as ArrayBuffer) === sha;
          let it: DriveItem = same;
          if (!equal) {
            const rec = await recoveryOf(e.path);
            // written by another phone or an earlier install, or changed by hand: which one cannot be known, so it is
            // kept as "replaced" (not counted as edited outside the app)
            await d.copy(same.id, rec, `${stamp} replaced ${e.name}`); run.toRecovery++;
            it = await d.update(same.id, e.mime, data); run.written++;
          } else run.unchanged++;
          idx.files[e.key] = { id: same.id, path: e.path, name: e.name, hash: e.hash, version: it.version ?? same.version, sha256: sha, group: e.group, groupRoot: e.groupRoot, bytes: data.length };
          continue;
        }
        const it = await d.create(parent, e.name, e.mime, data);
        if (prev) run.recreated++;
        idx.files[e.key] = { id: it.id, path: e.path, name: e.name, hash: e.hash, version: it.version, sha256: sha, group: e.group, groupRoot: e.groupRoot, bytes: data.length };
        live.set(it.id, { ...it, parents: [parent] });
        run.written++;
      }
    } catch (err) {
      if (err instanceof DriveError && (err.code === 'auth' || err.code === 'network' || err.code === 'quota')) { await save(); throw err; }
      run.failed.push(`${pk(e.path)}/${e.name}`);
    }
  }

  // 2. items that are gone: to Recovery (never deleted). A whole record goes as one folder when it had one.
  const gone = Object.entries(idx.files).filter(([k]) => !planned.has(k));
  const groupsLeft = new Set(plan.map(e => e.group));
  const movedRoots = new Set<string>();
  for (const [k, f] of gone) {
    if (waiting.has(f.group)) continue;                                        // its deletion has not reached the cloud yet
    try {
      if (f.groupRoot && !groupsLeft.has(f.group)) {
        const rk = pk(f.groupRoot);
        if (!movedRoots.has(rk) && idx.folders[rk]) {
          const fid = idx.folders[rk];
          const rec = await recoveryOf(f.groupRoot.slice(0, -1));
          await d.move(fid, rec, parentsOf(fid), `${stamp} deleted ${f.groupRoot[f.groupRoot.length - 1]}`);
          for (const key of Object.keys(idx.folders)) if (key === rk || key.startsWith(`${rk}/`)) delete idx.folders[key];
          run.toRecovery++;
        }
        movedRoots.add(rk);
      } else if (live.has(f.id)) {
        const rec = await recoveryOf(f.path);
        await d.move(f.id, rec, parentsOf(f.id), `${stamp} deleted ${f.name}`);
        run.toRecovery++;
      }
      delete idx.files[k];
    } catch (err) {
      if (err instanceof DriveError && (err.code === 'auth' || err.code === 'network')) { await save(); throw err; }
      run.failed.push(`${pk(f.path)}/${f.name}`);
    }
  }

  // 3. empty folders the app made and no longer uses go to the bin (Recovery folders and their parents stay)
  const usedPaths = new Set<string>();
  for (const f of Object.values(idx.files)) for (let i = 1; i <= f.path.length; i++) usedPaths.add(pk(f.path.slice(0, i)));
  const byDepth = Object.keys(idx.folders).sort((a, b) => b.split('/').length - a.split('/').length);
  for (const k of byDepth) {
    if (usedPaths.has(k) || k.split('/').includes(RECOVERY) || k === DR_NAME || k.startsWith(`${DR_NAME}/`)) continue;
    const id = idx.folders[k];
    try {
      const kids = (await d.children(id));
      if (kids.length) continue;
      await d.trash(id); delete idx.folders[k]; run.binned++;
    } catch { /* next time */ }
  }

  // 4. Recovery copies older than 90 days go to the Drive bin
  for (const it of live.values()) {
    const t = stampTime(it.name);
    if (t === undefined || now - t <= RECOVERY_KEEP_MS) continue;
    const inRecovery = (it.parents ?? []).some(p => Object.entries(idx.folders).some(([k, id]) => id === p && k.split('/').pop() === RECOVERY));
    if (!inRecovery) continue;
    try { await d.trash(it.id); run.binned++; } catch { /* next time */ }
  }

  // 5. README, Index.csv and Export Status.txt, written last
  run.status = run.waiting.length || run.failed.length ? 'partial' : 'complete';
  const indexRows = await Promise.all(Object.entries(idx.files).sort(([a], [b]) => (a < b ? -1 : 1)).map(async ([k, f]) => [k, f.group, `${pk(f.path)}/${f.name}`, f.sha256, f.bytes]));
  const total = Object.keys(idx.files).length;
  const status = [
    'Estate Agent AI Buddy - export status', '',
    `Status: ${run.status === 'complete' ? 'complete (every item was written and its size checked)' : 'partial'}`,
    `Last run: ${mytIso(now)}`,
    `App version: ${BUILD.version}${BUILD.release ? ` (release ${BUILD.release})` : ''} (${BUILD.sha})`,
    `Items in these folders: ${total}`,
    `This run: ${run.written} written, ${run.unchanged} unchanged, ${run.moved} moved or renamed, ${run.toRecovery} kept in Recovery, ${run.recreated} written again after being removed in Drive`,
    ...(run.waiting.length ? ['', `Waiting for sync (${run.waiting.length}): the change is saved on the phone but not yet confirmed by the cloud, so the earlier copy stays here:`, ...run.waiting.map(x => `- ${x}`)] : []),
    ...(run.failed.length ? ['', `Not written this time (${run.failed.length}); they are tried again on the next run:`, ...run.failed.map(x => `- ${x}`)] : []),
    ...(run.editedOutside.length ? ['', `Edited outside the app (${run.editedOutside.length}); your version was kept in Recovery and the app's version written again:`, ...run.editedOutside.map(x => `- ${x}`)] : []),
  ].join('\n') + '\n';
  const system: Record<string, string> = { 'README.txt': README, 'Index.csv': csv(['key', 'record', 'path', 'sha256', 'bytes'], indexRows), 'Export Status.txt': status };
  try {
    for (const name of SYSTEM) {
      const data = enc.encode(system[name]);
      const id = idx.system[name];
      const sha = await shaText(system[name]);
      const mime = name.endsWith('.csv') ? 'text/csv' : 'text/plain';
      const existing = id && live.has(id) ? id : [...live.values()].find(x => x.name === name && (x.parents ?? []).includes(rootId))?.id;
      if (existing) { idx.system[name] = existing; if (idx.system[`${name}#sha`] === sha) continue; await d.update(existing, mime, data); }
      else idx.system[name] = (await d.create(rootId, name, mime, data)).id;
      idx.system[`${name}#sha`] = sha;
    }
  } catch (err) { await save(); throw err; }
  await save();
  run.ok = true;
  return run;
}

/** Forgets what was written, so the next run writes every folder again ("Rebuild Drive Folders"). Files in Drive
 *  are not deleted: anything the person changed by hand is found and kept in Recovery by the next run. */
export async function forgetTree(store: Store) { await store.putLocalNow(INDEX_KEY, { folders: {}, files: {}, system: {} }); }

export const TREE_SYSTEM_FILES = SYSTEM;
export type { TreeEntry };
export const isFolder = (it: DriveItem) => it.mimeType === FOLDER_MIME;
