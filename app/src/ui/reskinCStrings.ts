// EA AI Buddy reskin, Phase C (owner's mockups 4, 5, 6, 9 and 10, sent 9 Nov 2026): Track My Sales, AI Assistant,
// Calendar & To-Do, Property Calculator and Market News. Look and layout only; the words that are new on these screens.
import type { Lang } from '../i18n';

const en = {
  sales: {
    hero: 'Commission received this year',
    vsLast: 'vs same months last year',
    pending: 'Still to come',
    allTime: 'Received, all time',
    closed: 'Deals Closed', progress: 'In Progress', leads: 'New Inquiries', leadsSub: 'Last 7 days', viewings: 'Viewings', viewingsSub: 'Next 7 days',
    chart: (y: number) => `Commission received each month in ${y}`,
  },
  ai: {
    title: 'Your Personal Real Estate Assistant',
    sub: 'Speak or type: save inquiries, plan viewings, set reminders, message clients and more.',
    try: 'Try one of these',
  },
  calc: { monthly: 'Estimated monthly instalment', loan: 'Loan amount', interest: 'Total interest', payment: 'Total payment' },
  news: { all: 'Latest', unread: 'Unread', filter: 'Show', noUnread: 'All news read.' },
};
export type ReskinCStrings = typeof en;

const bm: ReskinCStrings = {
  sales: {
    hero: 'Komisen diterima tahun ini',
    vsLast: 'berbanding bulan sama tahun lepas',
    pending: 'Belum diterima',
    allTime: 'Diterima, keseluruhan',
    closed: 'Urusan Selesai', progress: 'Dalam Proses', leads: 'Pertanyaan Baharu', leadsSub: '7 hari lepas', viewings: 'Lawatan', viewingsSub: '7 hari akan datang',
    chart: (y: number) => `Komisen diterima setiap bulan pada ${y}`,
  },
  ai: {
    title: 'Pembantu Hartanah Peribadi Anda',
    sub: 'Cakap atau taip: simpan pertanyaan, rancang lawatan, tetapkan peringatan, hantar mesej kepada pelanggan dan lain-lain.',
    try: 'Cuba salah satu',
  },
  calc: { monthly: 'Anggaran ansuran bulanan', loan: 'Jumlah pinjaman', interest: 'Jumlah faedah', payment: 'Jumlah bayaran' },
  news: { all: 'Terkini', unread: 'Belum dibaca', filter: 'Tunjuk', noUnread: 'Semua berita sudah dibaca.' },
};

const zh: ReskinCStrings = {
  sales: {
    hero: '今年已收佣金',
    vsLast: '与去年同期相比',
    pending: '待收',
    allTime: '累计已收',
    closed: '已成交', progress: '进行中', leads: '新询问', leadsSub: '过去 7 天', viewings: '看房', viewingsSub: '未来 7 天',
    chart: (y: number) => `${y} 年每月已收佣金`,
  },
  ai: {
    title: '您的专属房地产助理',
    sub: '说话或打字：记录询问、安排看房、设置提醒、给客户发消息等。',
    try: '试试这些',
  },
  calc: { monthly: '估计每月供款', loan: '贷款额', interest: '总利息', payment: '总付款' },
  news: { all: '最新', unread: '未读', filter: '显示', noUnread: '所有新闻已读。' },
};

export const reskinCStrings: Record<Lang, ReskinCStrings> = { en, bm, zh };
