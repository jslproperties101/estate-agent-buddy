// Which records point at which stored files. A file belongs to the record that lists it (a property's photos, documents
// and advert screenshots, a banner's picture). Sample records never count: they use built-in pictures and never reach the
// cloud.
//
// Confidential documents (title, owner correspondence, rental/sales and transaction papers — CONFIDENTIAL_DOCS) are
// marked `confidential`. JoyChange010-05 (Joe, 21 Oct 2026; replaces the owner decision of 16 Oct 2026):
//  - they go to the cloud like every other file, so the agent has them on every phone and the laptop website, and they
//    stay in the owner's own backups (backup file, Google Drive folders and restore points);
//  - the DATABASE decides who may download them (supabase/migrations/20261021220000_confidential_cloud_files.sql): the
//    owner (and the agent it is assigned to, and the workspace owner / admin) always; a Team Workspace partner only when
//    the owner switched on "Include confidential documents" for that share. Off by default.
import type { AppState, CollectionName } from './types';
import { CONFIDENTIAL_DOCS } from '../listing/model';

export interface FileRef {
  fileId: string;
  collection: CollectionName;
  recordId: string;
  kind: 'photo' | 'document' | 'banner' | 'advert';
  name?: string;
  mime?: string;
  /** Document category, for documents. */
  category?: string;
  /** True for confidential documents: in the cloud, but a partner may download them only when the owner allowed it. */
  confidential?: boolean;
}

export function fileRefs(state: Pick<AppState, 'properties' | 'banners'>): FileRef[] {
  const out: FileRef[] = [];
  for (const p of state.properties) {
    if (p.sample) continue;
    for (const ph of p.photos ?? []) if (ph.fileId) out.push({ fileId: ph.fileId, collection: 'properties', recordId: p.id, kind: 'photo', name: ph.name });
    for (const d of p.documents ?? []) if (d.fileId) out.push({ fileId: d.fileId, collection: 'properties', recordId: p.id, kind: 'document', name: d.name, mime: d.mime, category: d.category, ...(CONFIDENTIAL_DOCS.includes(d.category) ? { confidential: true } : {}) });
    // Advert screenshots were missing here before the Change 006 integration, so they were in no backup and never synced.
    for (const a of p.marketing?.ads ?? []) if (a.screenshotFileId) out.push({ fileId: a.screenshotFileId, collection: 'properties', recordId: p.id, kind: 'advert', name: `advert-${(a.platform || 'screenshot').replace(/[^A-Za-z0-9]+/g, '-').slice(0, 40)}.jpg` });
  }
  for (const b of state.banners) {
    if (b.sample) continue;
    if (b.photoFileId) out.push({ fileId: b.photoFileId, collection: 'banners', recordId: b.id, kind: 'banner' });
  }
  return out;
}

/** Files that go to the cloud file bucket: all of them (JoyChange010-05). Who may read a confidential one is decided by
 *  the database. Kept as its own name so the sync code reads the same. */
export const cloudFileRefs = (state: Pick<AppState, 'properties' | 'banners'>): FileRef[] => fileRefs(state);
