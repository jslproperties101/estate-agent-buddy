// JoyChange010-04: words for the Shared Documents tray and moving documents between folders. English, Bahasa Malaysia, 中文.
import type { Lang } from '../i18n';

export interface ShareStrings {
  title: string; open: string; empty: string; how: string;
  moveToProperty: string; property: string; folder: string; move: string; cancel: string;
  del: string; delQ: string; delBody: (name: string) => string; deleted: string;
  moved: (folder: string, property: string) => string; noProperty: string; notAllowed: string; gone: string;
  arrived: (n: number) => string; tooBig: (names: string) => string; full: (n: number) => string; unreadable: (n: number) => string;
  added: (when: string) => string; moveToFolder: string; folderChanged: (folder: string) => string; trayNote: string;
  /** JoyChange010-05 */
  notSharedConfidential: string; includeConfidential: string; includeConfidentialHelp: string; includeConfidentialAll: string; confidentialSaved: (on: boolean) => string;
}

const en: ShareStrings = {
  title: 'Shared Documents', open: 'Open',
  empty: 'Nothing here yet.',
  how: 'In WhatsApp (or any app), tap Share on a document or photo and choose “Estate Agent AI Buddy Document Upload”. It arrives here; then move it to the right property and folder.',
  moveToProperty: 'Move to property', property: 'Property', folder: 'Folder', move: 'Move', cancel: 'Cancel',
  del: 'Delete', delQ: 'Delete this file?', delBody: n => `“${n}” will be removed from this phone. It is not in any property.`, deleted: 'File deleted.',
  moved: (f, p) => `Moved to ${p} · ${f}.`, noProperty: 'Choose a property first.', notAllowed: 'You cannot add files to this property.', gone: 'This file is no longer here.',
  arrived: n => (n === 1 ? '1 file arrived in Shared Documents.' : `${n} files arrived in Shared Documents.`),
  tooBig: names => `Too big to add (over 50 MB): ${names}.`, full: n => `Shared Documents is full (200 files). ${n} not added: move or delete some first.`,
  unreadable: n => (n === 1 ? '1 file could not be read.' : `${n} files could not be read.`),
  added: w => `Added ${w}`, moveToFolder: 'Move to folder', folderChanged: f => `Moved to ${f}.`,
  trayNote: 'Files here are on this phone only until you move them into a property.',
  notSharedConfidential: 'Confidential — not shared with you',
  includeConfidential: 'Include confidential documents 🔒',
  includeConfidentialHelp: 'Title documents, owner correspondence and rental or sales documents. Off: they see the property, photos and other documents only.',
  includeConfidentialAll: 'Include confidential documents of every property shared through Share All 🔒',
  confidentialSaved: on => (on ? 'Confidential documents now shared.' : 'Confidential documents no longer shared.'),
};

const bm: ShareStrings = {
  title: 'Dokumen Dikongsi', open: 'Buka',
  empty: 'Belum ada apa-apa di sini.',
  how: 'Dalam WhatsApp (atau aplikasi lain), tekan Kongsi pada dokumen atau foto dan pilih “Muat Naik Dokumen Estate Agent AI Buddy”. Ia akan sampai di sini; kemudian pindahkan ke hartanah dan folder yang betul.',
  moveToProperty: 'Pindah ke hartanah', property: 'Hartanah', folder: 'Folder', move: 'Pindah', cancel: 'Batal',
  del: 'Padam', delQ: 'Padam fail ini?', delBody: n => `“${n}” akan dibuang dari telefon ini. Ia tidak berada dalam mana-mana hartanah.`, deleted: 'Fail dipadam.',
  moved: (f, p) => `Dipindah ke ${p} · ${f}.`, noProperty: 'Pilih hartanah dahulu.', notAllowed: 'Anda tidak boleh menambah fail pada hartanah ini.', gone: 'Fail ini sudah tiada di sini.',
  arrived: n => `${n} fail sampai di Dokumen Dikongsi.`,
  tooBig: names => `Terlalu besar untuk ditambah (melebihi 50 MB): ${names}.`, full: n => `Dokumen Dikongsi sudah penuh (200 fail). ${n} tidak ditambah: pindah atau padam sebahagian dahulu.`,
  unreadable: n => `${n} fail tidak dapat dibaca.`,
  added: w => `Ditambah ${w}`, moveToFolder: 'Pindah ke folder', folderChanged: f => `Dipindah ke ${f}.`,
  trayNote: 'Fail di sini hanya berada di telefon ini sehingga anda memindahkannya ke dalam hartanah.',
  notSharedConfidential: 'Sulit — tidak dikongsi dengan anda',
  includeConfidential: 'Sertakan dokumen sulit 🔒',
  includeConfidentialHelp: 'Dokumen hakmilik, surat-menyurat pemilik dan dokumen sewa atau jual. Tutup: mereka hanya melihat hartanah, foto dan dokumen lain.',
  includeConfidentialAll: 'Sertakan dokumen sulit setiap hartanah yang dikongsi melalui Kongsi Semua 🔒',
  confidentialSaved: on => (on ? 'Dokumen sulit kini dikongsi.' : 'Dokumen sulit tidak lagi dikongsi.'),
};

const zh: ShareStrings = {
  title: '共享文件', open: '打开',
  empty: '这里还没有文件。',
  how: '在 WhatsApp（或任何应用）中，对文件或照片点“分享”，然后选择“Estate Agent AI Buddy 文件上传”。文件会出现在这里，再把它移到正确的房产和文件夹。',
  moveToProperty: '移到房产', property: '房产', folder: '文件夹', move: '移动', cancel: '取消',
  del: '删除', delQ: '删除此文件？', delBody: n => `“${n}”将从这部手机上删除。它不属于任何房产。`, deleted: '文件已删除。',
  moved: (f, p) => `已移到 ${p} · ${f}。`, noProperty: '请先选择房产。', notAllowed: '您不能为此房产添加文件。', gone: '此文件已不在这里。',
  arrived: n => `${n} 个文件已到达共享文件。`,
  tooBig: names => `文件太大，无法添加（超过 50 MB）：${names}。`, full: n => `共享文件已满（200 个）。${n} 个未添加：请先移动或删除一些。`,
  unreadable: n => `${n} 个文件无法读取。`,
  added: w => `添加于 ${w}`, moveToFolder: '移到文件夹', folderChanged: f => `已移到 ${f}。`,
  trayNote: '这里的文件只保存在这部手机上，直到您把它们移入房产。',
  notSharedConfidential: '机密 — 未与您共享',
  includeConfidential: '包括机密文件 🔒',
  includeConfidentialHelp: '地契文件、屋主往来信息和租赁或买卖文件。关闭时：对方只能看到房产、照片和其他文件。',
  includeConfidentialAll: '包括通过“全部共享”共享的每个房产的机密文件 🔒',
  confidentialSaved: on => (on ? '机密文件现已共享。' : '机密文件已不再共享。'),
};

export const shareStrings: Record<Lang, ShareStrings> = { en, bm, zh };
