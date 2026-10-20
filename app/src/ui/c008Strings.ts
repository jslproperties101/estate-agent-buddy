// JoyChange008 (location lists): text for the locked lower levels, the "changing this clears the places below" question,
// the delete warning for places the agent added, and the data credits. English, Bahasa Malaysia and Chinese; the BM and ZH
// wording of the delete warning is the one written in JoyChange008-Main.txt (a suggestion Joe accepted on 21 Oct 2026).
import type { Lang } from '../i18n';

export interface C008Strings {
  /** Shown under a level that cannot be chosen yet. */
  locked: (parent: string) => string;
  clearQ: (level: string) => string;
  clearBody: (below: string) => string;
  clearOk: string;
  deleteQ: (place: string) => string;
  deleteBody: string;
  deleteOk: string;
  renameInstead: string;
  cancel: string;
  creditsTitle: string;
  credits: (source: string) => string;
}

const en: C008Strings = {
  locked: parent => `Choose ${parent} first.`,
  clearQ: level => `Change ${level}?`,
  clearBody: below => `${below} below it will be cleared, because they belong to the old choice.`,
  clearOk: 'Change',
  deleteQ: place => `Delete “${place}”?`,
  deleteBody: 'Deleting this place also removes the places you added under it. Properties you already saved keep their place names. Delete?',
  deleteOk: 'Delete',
  renameInstead: 'Rename instead',
  cancel: 'Cancel',
  creditsTitle: 'Place lists',
  credits: source => `Malaysia states and cities / towns: ${source}. Places you add yourself are kept with your own data.`,
};

const bm: C008Strings = {
  locked: parent => `Pilih ${parent} dahulu.`,
  clearQ: level => `Tukar ${level}?`,
  clearBody: below => `${below} di bawahnya akan dikosongkan, kerana ia milik pilihan lama.`,
  clearOk: 'Tukar',
  deleteQ: place => `Padam “${place}”?`,
  deleteBody: 'Memadam tempat ini juga akan memadam tempat yang anda tambah di bawahnya. Hartanah yang telah disimpan kekal dengan nama tempat asal. Padam?',
  deleteOk: 'Padam',
  renameInstead: 'Tukar nama',
  cancel: 'Batal',
  creditsTitle: 'Senarai tempat',
  credits: source => `Negeri dan bandar / pekan Malaysia: ${source}. Tempat yang anda tambah sendiri disimpan bersama data anda.`,
};

const zh: C008Strings = {
  locked: parent => `请先选择${parent}。`,
  clearQ: level => `更改${level}？`,
  clearBody: below => `其下的${below}将被清空，因为它们属于原来的选择。`,
  clearOk: '更改',
  deleteQ: place => `删除“${place}”？`,
  deleteBody: '删除此地点也会删除您在其下添加的地点。已保存的房产将保留原有地点名称。确定删除？',
  deleteOk: '删除',
  renameInstead: '改名',
  cancel: '取消',
  creditsTitle: '地点列表',
  credits: source => `马来西亚州属及城市/城镇：${source}。您自己添加的地点与您的数据一起保存。`,
};

export const c008Strings: Record<Lang, C008Strings> = { en, bm, zh };
