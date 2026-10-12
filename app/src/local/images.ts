// Browser only: shrink a photo before keeping it (saves storage), turning it the right way up
// from the camera's orientation tag. OCR of photos is not in this prototype.
export interface Compressed { blob: Blob; width: number; height: number; before: number; after: number }

export async function compressImage(file: Blob, maxSide = 1600, quality = 0.75): Promise<Compressed> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const blob: Blob = await new Promise((res, rej) => canvas.toBlob(b => (b ? res(b) : rej(new Error('encode'))), 'image/jpeg', quality));
  // Keep the original if compression would not make it smaller.
  if (blob.size >= file.size) return { blob: file, width: w, height: h, before: file.size, after: file.size };
  return { blob, width: w, height: h, before: file.size, after: blob.size };
}
