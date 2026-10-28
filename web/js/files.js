// Photos of documents, kept on the phone in IndexedDB (too large for localStorage).

const DB = 'mwab-files', STORE = 'files';

function open() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(new Error('Storage for photos is not available on this device.'));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(r?.result);
    t.onerror = () => reject(t.error);
  });
}

export const putFile = (id, dataUrl) => tx('readwrite', s => s.put(dataUrl, id));
export const getFile = id => tx('readonly', s => s.get(id));
export const deleteFile = id => tx('readwrite', s => s.delete(id));
export const clearFiles = () => tx('readwrite', s => s.clear());

/** Read an image file, shrink it to at most maxSide pixels, return a JPEG data URL. */
export function imageToDataUrl(file, maxSide = 1600) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the photo.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('This file is not a photo the app can read.'));
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.82));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
