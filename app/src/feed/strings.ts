// MainForAdmin-D words: Market News and Intelligence, pushed Projects and invitation codes, announcements,
// force update and maintenance mode. English, Bahasa Melayu, Chinese (BM / ZH to be checked by a native speaker).
import type { Lang } from '../i18n';

const en = {
  marketTitle: 'Market News and Intelligence',
  unread: (n: number) => `${n} unread`,
  noNews: 'No news yet. News from the company will appear here.',
  offlineNote: 'Showing what was last received. Connect to the internet to check for new posts.',
  readMore: 'Read more', showLess: 'Show less', openLink: 'Open website', openPdf: 'Open PDF', newBadge: 'New',
  // Projects
  pushedTitle: 'Projects from your company',
  codeHint: "Don't see your project? Ask your team leader or management for an invitation code and enter it here.",
  codeLabel: 'Invitation code', codePh: 'e.g. K7PX2MQ9RT', codeGo: 'Add', codeBusy: 'Checking…',
  codeAdded: (n: number) => (n === 1 ? '1 project added.' : n > 1 ? `${n} projects added.` : 'You already have these projects.'),
  codeErr: {
    not_found: 'This code was not found. Check it with your team leader.', expired: 'This code has expired. Ask for a new one.',
    used_up: 'This code has been used the maximum number of times. Ask for a new one.',
    too_many: 'Too many wrong codes. Please wait an hour and try again.', empty: 'Type the invitation code.',
    offline: 'No internet connection. Try again when you are online.', unavailable: 'Invitation codes are not switched on yet for your company.',
    other: 'The code could not be checked. Please try again.',
  } as Record<string, string>,
  noPushed: 'No projects from your company yet.',
  pushedNote: 'Shared by your company. If they stop sharing it, it disappears from this list.',
  fromCode: 'From invitation code', developer: 'Developer', priceFrom: (a: string) => `From ${a}`,
  // Announcements
  close: 'Close', ok: 'OK, got it', announcement: 'Announcement',
  // Force update / maintenance
  updateSoft: 'A newer version of the app is available. Please update soon.',
  updateHard: 'This version of the app is no longer supported. Please update to continue.',
  updateTitle: 'Update needed', updateBtn: 'Update now', later: 'Later', noUpdateLink: 'Ask your company where to get the new version.',
  maintTitle: 'Under maintenance', maintDefault: 'The app is under maintenance. Please try again later.',
  maintBack: (t: string) => `Expected back: ${t}`, maintRetry: 'Check again', maintNote: 'Your data on this phone is safe.',
  yourVersion: (v: string, need: string) => `Your version: ${v}. Needed: ${need} or newer.`,
};
export type FeedStrings = typeof en;

const bm: FeedStrings = {
  marketTitle: 'Berita dan Risikan Pasaran',
  unread: (n: number) => `${n} belum dibaca`,
  noNews: 'Belum ada berita. Berita daripada syarikat akan dipaparkan di sini.',
  offlineNote: 'Memaparkan apa yang terakhir diterima. Sambung ke internet untuk menyemak siaran baharu.',
  readMore: 'Baca lagi', showLess: 'Tutup', openLink: 'Buka laman web', openPdf: 'Buka PDF', newBadge: 'Baharu',
  pushedTitle: 'Projek daripada syarikat anda',
  codeHint: 'Tidak nampak projek anda? Minta kod jemputan daripada ketua pasukan atau pihak pengurusan dan masukkan di sini.',
  codeLabel: 'Kod jemputan', codePh: 'cth. K7PX2MQ9RT', codeGo: 'Tambah', codeBusy: 'Menyemak…',
  codeAdded: (n: number) => (n === 1 ? '1 projek ditambah.' : n > 1 ? `${n} projek ditambah.` : 'Anda sudah mempunyai projek ini.'),
  codeErr: {
    not_found: 'Kod ini tidak dijumpai. Semak dengan ketua pasukan anda.', expired: 'Kod ini telah tamat tempoh. Minta kod baharu.',
    used_up: 'Kod ini telah digunakan sebanyak had maksimum. Minta kod baharu.',
    too_many: 'Terlalu banyak kod salah. Sila tunggu sejam dan cuba lagi.', empty: 'Taip kod jemputan.',
    offline: 'Tiada sambungan internet. Cuba lagi apabila dalam talian.', unavailable: 'Kod jemputan belum diaktifkan untuk syarikat anda.',
    other: 'Kod tidak dapat disemak. Sila cuba lagi.',
  },
  noPushed: 'Belum ada projek daripada syarikat anda.',
  pushedNote: 'Dikongsi oleh syarikat anda. Jika perkongsian dihentikan, projek ini hilang daripada senarai.',
  fromCode: 'Daripada kod jemputan', developer: 'Pemaju', priceFrom: (a: string) => `Dari ${a}`,
  close: 'Tutup', ok: 'OK, faham', announcement: 'Pengumuman',
  updateSoft: 'Versi aplikasi yang lebih baharu tersedia. Sila kemas kini segera.',
  updateHard: 'Versi aplikasi ini tidak lagi disokong. Sila kemas kini untuk meneruskan.',
  updateTitle: 'Perlu dikemas kini', updateBtn: 'Kemas kini sekarang', later: 'Nanti', noUpdateLink: 'Tanya syarikat anda di mana untuk mendapatkan versi baharu.',
  maintTitle: 'Dalam penyelenggaraan', maintDefault: 'Aplikasi sedang diselenggara. Sila cuba sebentar lagi.',
  maintBack: (t: string) => `Dijangka kembali: ${t}`, maintRetry: 'Semak semula', maintNote: 'Data anda dalam telefon ini selamat.',
  yourVersion: (v: string, need: string) => `Versi anda: ${v}. Diperlukan: ${need} atau lebih baharu.`,
};

const zh: FeedStrings = {
  marketTitle: '市场新闻与情报',
  unread: (n: number) => `${n} 条未读`,
  noNews: '暂无新闻。公司发布的新闻将显示在这里。',
  offlineNote: '显示的是最后收到的内容。请连接网络以查看新帖子。',
  readMore: '阅读更多', showLess: '收起', openLink: '打开网站', openPdf: '打开 PDF', newBadge: '新',
  pushedTitle: '公司分享的项目',
  codeHint: '看不到您的项目？请向团队领导或管理层索取邀请码，并在此输入。',
  codeLabel: '邀请码', codePh: '例如 K7PX2MQ9RT', codeGo: '添加', codeBusy: '正在核对…',
  codeAdded: (n: number) => (n === 1 ? '已添加 1 个项目。' : n > 1 ? `已添加 ${n} 个项目。` : '您已拥有这些项目。'),
  codeErr: {
    not_found: '找不到此邀请码。请与团队领导核对。', expired: '此邀请码已过期。请索取新的邀请码。',
    used_up: '此邀请码已达到使用次数上限。请索取新的邀请码。',
    too_many: '错误次数过多。请一小时后再试。', empty: '请输入邀请码。',
    offline: '没有网络连接。请在联网后再试。', unavailable: '您的公司尚未启用邀请码。',
    other: '无法核对邀请码。请再试一次。',
  },
  noPushed: '公司暂未分享项目。',
  pushedNote: '由您的公司分享。如果停止分享，项目会从列表中消失。',
  fromCode: '来自邀请码', developer: '发展商', priceFrom: (a: string) => `起价 ${a}`,
  close: '关闭', ok: '好的，知道了', announcement: '公告',
  updateSoft: '应用有新版本。请尽快更新。',
  updateHard: '此版本已不再支持。请更新后继续使用。',
  updateTitle: '需要更新', updateBtn: '立即更新', later: '稍后', noUpdateLink: '请向公司询问新版本的获取方式。',
  maintTitle: '系统维护中', maintDefault: '应用正在维护。请稍后再试。',
  maintBack: (t: string) => `预计恢复时间：${t}`, maintRetry: '重新检查', maintNote: '您手机上的数据是安全的。',
  yourVersion: (v: string, need: string) => `您的版本：${v}。需要：${need} 或更新版本。`,
};

export const feedStrings: Record<Lang, FeedStrings> = { en, bm, zh };
