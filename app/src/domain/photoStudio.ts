// Saving a Photo Studio result into the property record. The original is never touched by "save as new"; replacing is a
// separate, explicit action. Pure functions; the screen stores the picture file and then saves what these return.
import type { Listing, Photo } from '../listing/model';
import type { EditKind } from '../lib/photoOps';

/** A copy's name carries what was done, so it can never be mistaken for the untouched original. */
export function copyName(original: string, kind: EditKind, words: { enhanced: string; masked: string; both: string }): string {
  const base = original.replace(/\s*\((?:enhanced|privacy-masked|enhanced \+ masked)[^)]*\)\s*$/i, '');
  return `${base} (${words[kind]})`;
}

/** Adds the edited picture as a new photo right after the original. The original photo, the main photo and every other photo stay as they were. */
export function addEditedCopy(l: Listing, sourceId: string, copy: { id: string; fileId: string; name: string; bytes?: number; kind: EditKind }, now: number): Listing {
  const at = l.photos.findIndex(p => p.id === sourceId);
  const photo: Photo = { id: copy.id, fileId: copy.fileId, name: copy.name, bytes: copy.bytes, edit: copy.kind, editedFrom: sourceId };
  const photos = at < 0 ? [...l.photos, photo] : [...l.photos.slice(0, at + 1), photo, ...l.photos.slice(at + 1)];
  return { ...l, updated: now, photos, history: [{ at: now, source: 'form', summary: `Photo saved as a ${copy.kind} copy: ${copy.name}` }, ...(l.history ?? [])] };
}

/** Replaces a stored photo's picture with the edited one (explicit action). Returns the old file id so the caller can delete it; a built-in sample picture has no file and cannot be replaced. */
export function replaceOriginal(l: Listing, photoId: string, fileId: string, kind: EditKind, bytes: number | undefined, now: number): { listing: Listing; oldFileId: string } | undefined {
  const p = l.photos.find(x => x.id === photoId);
  if (!p || !p.fileId) return undefined;
  const photos = l.photos.map(x => (x.id === photoId ? { ...x, fileId, url: undefined, bytes, edit: kind } : x));
  return { listing: { ...l, updated: now, photos, history: [{ at: now, source: 'form', summary: `Photo replaced by its ${kind} version: ${p.name}` }, ...(l.history ?? [])] }, oldFileId: p.fileId };
}
