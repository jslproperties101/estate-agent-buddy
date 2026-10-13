// Text for the save-status line and the messages about saving and syncing, in three languages.
// "Saved on this phone" and "Synced" are different statements: the first is true after every save, the second only
// after the cloud has answered.
import type { Lang } from '../i18n';

const en = {
  label: 'Save status',
  phone: 'Saved on this phone',
  phoneWaiting: (n: number) => `Saved on this phone · ${n} waiting to sync`,
  syncing: 'Syncing…',
  synced: 'Synced',
  failedPhone: 'Not saved: the phone’s storage failed',
  failedSync: 'Saved on this phone · sync failed',
  syncFailedToast: 'Your changes are saved on this phone, but syncing to the cloud failed. It will try again.',
};
export type SaveStrings = typeof en;

const bm: SaveStrings = {
  label: 'Status simpanan',
  phone: 'Disimpan dalam telefon ini',
  phoneWaiting: (n: number) => `Disimpan dalam telefon ini · ${n} menunggu segerak`,
  syncing: 'Menyegerak…',
  synced: 'Telah disegerakkan',
  failedPhone: 'Tidak disimpan: storan telefon gagal',
  failedSync: 'Disimpan dalam telefon ini · penyegerakan gagal',
  syncFailedToast: 'Perubahan anda disimpan dalam telefon ini, tetapi penyegerakan ke awan gagal. Ia akan dicuba lagi.',
};

const zh: SaveStrings = {
  label: '保存状态',
  phone: '已保存在本手机',
  phoneWaiting: (n: number) => `已保存在本手机 · ${n} 项等待同步`,
  syncing: '正在同步…',
  synced: '已同步',
  failedPhone: '未保存：手机存储失败',
  failedSync: '已保存在本手机 · 同步失败',
  syncFailedToast: '您的更改已保存在本手机，但同步到云端失败。稍后会再试。',
};

export const saveStrings: Record<Lang, SaveStrings> = { en, bm, zh };
