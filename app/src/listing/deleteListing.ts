// Deleting a property: its pictures and documents, its banners and the record itself. Inquiries, viewings and to-dos that
// pointed to it stay, without the link. Used by the property form and by the card preview, so both do exactly the same.
import type { AppState } from '../data/types';
import type { Store } from '../data/store';
import type { Listing } from './model';

export function deleteListing(store: Store, state: AppState, l: Listing): void {
  for (const p of l.photos) if (p.fileId) store.removeFile(p.fileId);
  for (const x of l.documents ?? []) if (x.fileId) store.removeFile(x.fileId);
  for (const b of state.banners.filter(x => x.propertyId === l.id)) { if (b.photoFileId) store.removeFile(b.photoFileId); store.remove('banners', b.id); }
  store.remove('properties', l.id);
}
