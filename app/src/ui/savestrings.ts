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
  conflict: (n: number) => `Saved on this phone · ${n} need${n === 1 ? 's' : ''} review`,
  // One record (shown on its detail screen)
  rec: {
    draft: 'Draft saved on this phone', phone: 'Saved on this phone', waiting: 'Waiting to sync', syncing: 'Syncing…', synced: 'Synced',
    conflict: 'Conflict needs review', failed: 'Sync failed · kept on this phone',
    retry: 'Try again', review: 'Review', denied: 'You can view this record but not change it in the cloud.',
  },
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
  conflict: (n: number) => `Disimpan dalam telefon ini · ${n} perlu disemak`,
  rec: {
    draft: 'Draf disimpan dalam telefon ini', phone: 'Disimpan dalam telefon ini', waiting: 'Menunggu segerak', syncing: 'Menyegerak…', synced: 'Telah disegerakkan',
    conflict: 'Percanggahan perlu disemak', failed: 'Segerak gagal · disimpan dalam telefon ini',
    retry: 'Cuba lagi', review: 'Semak', denied: 'Anda boleh melihat rekod ini tetapi tidak boleh mengubahnya di awan.',
  },
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
  conflict: (n: number) => `已保存在本手机 · ${n} 项需要检查`,
  rec: {
    draft: '草稿已保存在本手机', phone: '已保存在本手机', waiting: '等待同步', syncing: '正在同步…', synced: '已同步',
    conflict: '冲突需要检查', failed: '同步失败 · 仍保存在本手机',
    retry: '重试', review: '检查', denied: '您可以查看此记录，但不能在云端修改。',
  },
};

export const saveStrings: Record<Lang, SaveStrings> = { en, bm, zh };
