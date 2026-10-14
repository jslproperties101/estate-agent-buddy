// Startup screen text, in three languages. Only steps that really happen are described here: there is no "encrypting",
// "security check" or "AI update" message because the app does none of those at startup.
import type { Lang } from '../i18n';
import { titled3 } from '../lib/titleCase';

const en = {
  opening: 'Opening your data on this phone…',
  slow: 'Opening is taking longer than usual. Your saved data has not been changed.',
  failed: 'Your saved data could not be opened. Nothing was changed or deleted.',
  retry: 'Try again',
  appName: 'Estate Agent AI Buddy',
};
export type StartupStrings = typeof en;

const bm: StartupStrings = {
  opening: 'Membuka data anda dalam telefon ini…',
  slow: 'Pembukaan mengambil masa lebih lama daripada biasa. Data tersimpan anda tidak berubah.',
  failed: 'Data tersimpan anda tidak dapat dibuka. Tiada apa yang diubah atau dipadam.',
  retry: 'Cuba lagi',
  appName: 'Estate Agent AI Buddy',
};

const zh: StartupStrings = {
  opening: '正在打开本手机上的数据…',
  slow: '打开的时间比平常长。已保存的数据没有改动。',
  failed: '无法打开已保存的数据。没有任何内容被更改或删除。',
  retry: '重试',
  appName: 'Estate Agent AI Buddy',
};

export const startupStrings: Record<Lang, StartupStrings> = titled3({ en, bm, zh });
