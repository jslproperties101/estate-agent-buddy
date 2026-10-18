// Startup screen text, in three languages. `opening`, `slow` and `failed` describe what really happens. Since JoyChange002
// Change 42 the `steps` are the owner's purely visual start-up lines (they are not real checks).
import type { Lang } from '../i18n';
import { titled3 } from '../lib/titleCase';

const en = {
  opening: 'Opening your data on this phone…',
  slow: 'Opening is taking longer than usual. Your saved data has not been changed.',
  failed: 'Your saved data could not be opened. Nothing was changed or deleted.',
  retry: 'Try again',
  appName: 'Estate Agent AI Buddy',
  // Change 42: six purely visual lines shown in turn while the logo spins (they do not report real checks).
  steps: ['Initializing app', 'Analyzing', 'Checking encrypted data checksum', 'Checksum verified', 'Security checks', 'Security check pass'],
};
export type StartupStrings = typeof en;

const bm: StartupStrings = {
  opening: 'Membuka data anda dalam telefon ini…',
  slow: 'Pembukaan mengambil masa lebih lama daripada biasa. Data tersimpan anda tidak berubah.',
  failed: 'Data tersimpan anda tidak dapat dibuka. Tiada apa yang diubah atau dipadam.',
  retry: 'Cuba lagi',
  appName: 'Estate Agent AI Buddy',
  steps: ['Memulakan aplikasi', 'Menganalisis', 'Menyemak checksum data yang disulitkan', 'Checksum disahkan', 'Semakan keselamatan', 'Semakan keselamatan lulus'],
};

const zh: StartupStrings = {
  opening: '正在打开本手机上的数据…',
  slow: '打开的时间比平常长。已保存的数据没有改动。',
  failed: '无法打开已保存的数据。没有任何内容被更改或删除。',
  retry: '重试',
  appName: 'Estate Agent AI Buddy',
  steps: ['正在初始化应用', '正在分析', '正在检查加密数据校验和', '校验和已验证', '安全检查', '安全检查通过'],
};

export const startupStrings: Record<Lang, StartupStrings> = titled3({ en, bm, zh });
