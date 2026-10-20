// Startup screen text, in three languages. `opening`, `slow` and `failed` describe what really happens; `steps` are the
// owner's purely visual start-up lines (JoyChange006 Part 2 Change E) shown with animated dots (startup.ts splashDots), so
// they carry no trailing "..." here. BM/ZH wording for `steps` is Claude's suggestion (flagged in JoyChange006_BATCH_3.md);
// Joe has not yet confirmed it.
import type { Lang } from '../i18n';
import { titled3 } from '../lib/titleCase';

const en = {
  opening: 'Opening your data on this phone…',
  slow: 'Opening is taking longer than usual. Your saved data has not been changed.',
  failed: 'Your saved data could not be opened. Nothing was changed or deleted.',
  retry: 'Try again',
  appName: 'Estate Agent AI Buddy',
  // JoyChange006 Part 2 Change E: five lines, spaced out over the full 10 seconds (startup.ts SPLASH_BREAKS).
  steps: ['Starting up', 'Encrypting data', 'Securing your connection', 'Loading users', 'Ready'],
};
export type StartupStrings = typeof en;

const bm: StartupStrings = {
  opening: 'Membuka data anda dalam telefon ini…',
  slow: 'Pembukaan mengambil masa lebih lama daripada biasa. Data tersimpan anda tidak berubah.',
  failed: 'Data tersimpan anda tidak dapat dibuka. Tiada apa yang diubah atau dipadam.',
  retry: 'Cuba lagi',
  appName: 'Estate Agent AI Buddy',
  steps: ['Memulakan', 'Menyulitkan data', 'Menjamin sambungan anda', 'Memuatkan pengguna', 'Sedia'],
};

const zh: StartupStrings = {
  opening: '正在打开本手机上的数据…',
  slow: '打开的时间比平常长。已保存的数据没有改动。',
  failed: '无法打开已保存的数据。没有任何内容被更改或删除。',
  retry: '重试',
  appName: 'Estate Agent AI Buddy',
  steps: ['正在启动', '正在加密数据', '正在保护您的连接', '正在加载用户', '准备就绪'],
};

export const startupStrings: Record<Lang, StartupStrings> = titled3({ en, bm, zh });
