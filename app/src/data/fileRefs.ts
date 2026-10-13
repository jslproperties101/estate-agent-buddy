// Which records point at which stored files. A file belongs to the record that lists it (a property's photos and
// documents, a banner's picture). Sample records never count: they use built-in pictures and never reach the cloud.
import type { AppState, CollectionName } from './types';

export interface FileRef {
  fileId: string;
  collection: CollectionName;
  recordId: string;
  kind: 'photo' | 'document' | 'banner';
  name?: string;
  mime?: string;
}

export function fileRefs(state: Pick<AppState, 'properties' | 'banners'>): FileRef[] {
  const out: FileRef[] = [];
  for (const p of state.properties) {
    if (p.sample) continue;
    for (const ph of p.photos ?? []) if (ph.fileId) out.push({ fileId: ph.fileId, collection: 'properties', recordId: p.id, kind: 'photo', name: ph.name });
    for (const d of p.documents ?? []) if (d.fileId) out.push({ fileId: d.fileId, collection: 'properties', recordId: p.id, kind: 'document', name: d.name, mime: d.mime });
  }
  for (const b of state.banners) {
    if (b.sample) continue;
    if (b.photoFileId) out.push({ fileId: b.photoFileId, collection: 'banners', recordId: b.id, kind: 'banner' });
  }
  return out;
}
