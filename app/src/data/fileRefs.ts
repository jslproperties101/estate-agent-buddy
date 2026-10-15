// Which records point at which stored files. A file belongs to the record that lists it (a property's photos, documents
// and advert screenshots, a banner's picture). Sample records never count: they use built-in pictures and never reach the
// cloud.
//
// Confidential documents (title, owner correspondence, transaction papers — CONFIDENTIAL_DOCS) are marked
// `confidential`. The form promises they are "kept on this phone only": cloud file sync never sends them (so no team
// member can download them either) and the readable Google Drive folders never contain them. Only the person's own
// backups (the backup file they make, and their own Drive restore points) carry them, so losing the phone does not
// lose them. (Change 006 integration, Oct 2026.)
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
  /** True for confidential documents: never sent to the cloud or into the readable Drive folders. */
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

/** Files that may be kept in the cloud (everything except confidential documents). */
export const cloudFileRefs = (state: Pick<AppState, 'properties' | 'banners'>): FileRef[] => fileRefs(state).filter(r => !r.confidential);
