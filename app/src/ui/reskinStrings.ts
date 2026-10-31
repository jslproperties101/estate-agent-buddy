// EA AI Buddy reskin, Phase A (owner, 31 Oct 2026): the new home dashboard, the bottom tab bar and the More screen.
import type { Lang } from '../i18n';

const en = {
  tagline: 'SMART TOOLS. BIGGER DEALS.',
  greet: { morning: 'Good morning,', afternoon: 'Good afternoon,', evening: 'Good evening,' },
  agent: 'Agent',
  quote: '“New opportunities are closer than you think.”',
  tasksToday: (n: number) => (n === 0 ? 'Nothing due today' : n === 1 ? '1 task today' : `${n} tasks today`),
  stats: {
    sales: 'My Sales', salesSub: 'This month',
    deals: 'Active Deals', dealsSub: 'In progress',
    inquiries: 'New Inquiries', inquiriesSub: 'This week',
    viewings: 'Viewings', viewingsSub: 'Next 7 days',
  },
  quick: 'Quick Access',
  sub: {
    project: 'Manage & explore', sales: 'Performance', opportunities: 'Active deals', creative: 'Photos & content',
    contacts: 'Clients & network', activity: 'Inquiries & viewings', gps: 'Navigate easily', finance: 'Commission & expenses',
    calculator: 'Loan, ROI & more', matching: 'Find the right buyers', expert: 'Get professional advice', market: 'Updates & insights',
    agenda: 'Viewings, meetings & reminders', property: 'Manage your subsale properties',
  } as Record<string, string>,
  ai: { title: 'AI Assisted Command', body: 'Ask anything about property, create content, analyse deals and more!', start: 'Start Chat' },
  tabs: { home: 'Home', projects: 'Projects', ai: 'AI Buddy', inquiries: 'Inquiries', more: 'More', label: 'Main menu' },
  more: {
    title: 'More', profile: 'Agent Profile', viewProfile: 'View profile', settings: 'Settings', notifications: 'Notifications',
    team: 'Team Workspace', feedback: 'Send Feedback', about: 'About EA AI Buddy', agentFallback: 'Agent',
  },
};
export type ReskinStrings = typeof en;

const bm: ReskinStrings = {
  tagline: 'ALAT PINTAR. URUSAN LEBIH BESAR.',
  greet: { morning: 'Selamat pagi,', afternoon: 'Selamat petang,', evening: 'Selamat malam,' },
  agent: 'Ejen',
  quote: '“Peluang baharu lebih dekat daripada yang anda sangka.”',
  tasksToday: (n: number) => (n === 0 ? 'Tiada tugasan hari ini' : `${n} tugasan hari ini`),
  stats: {
    sales: 'Jualan Saya', salesSub: 'Bulan ini',
    deals: 'Urusan Aktif', dealsSub: 'Dalam proses',
    inquiries: 'Pertanyaan Baharu', inquiriesSub: 'Minggu ini',
    viewings: 'Lawatan', viewingsSub: '7 hari akan datang',
  },
  quick: 'Akses Pantas',
  sub: {
    project: 'Urus & teroka', sales: 'Prestasi', opportunities: 'Urusan aktif', creative: 'Foto & kandungan',
    contacts: 'Pelanggan & rangkaian', activity: 'Pertanyaan & lawatan', gps: 'Navigasi mudah', finance: 'Komisen & perbelanjaan',
    calculator: 'Pinjaman, ROI & lagi', matching: 'Cari pembeli yang sesuai', expert: 'Dapatkan nasihat profesional', market: 'Berita & pandangan',
    agenda: 'Lawatan, mesyuarat & peringatan', property: 'Urus hartanah subsale anda',
  },
  ai: { title: 'Arahan Dibantu AI', body: 'Tanya apa sahaja tentang hartanah, hasilkan kandungan, analisis urusan dan banyak lagi!', start: 'Mula Sembang' },
  tabs: { home: 'Utama', projects: 'Projek', ai: 'AI Buddy', inquiries: 'Pertanyaan', more: 'Lagi', label: 'Menu utama' },
  more: {
    title: 'Lagi', profile: 'Profil Ejen', viewProfile: 'Lihat profil', settings: 'Tetapan', notifications: 'Pemberitahuan',
    team: 'Ruang Kerja Pasukan', feedback: 'Hantar Maklum Balas', about: 'Mengenai EA AI Buddy', agentFallback: 'Ejen',
  },
};

const zh: ReskinStrings = {
  tagline: '智能工具 · 成交更大',
  greet: { morning: '早上好，', afternoon: '下午好，', evening: '晚上好，' },
  agent: '经纪人',
  quote: '“新机会比你想象的更近。”',
  tasksToday: (n: number) => (n === 0 ? '今天没有待办' : `今天 ${n} 项待办`),
  stats: {
    sales: '我的成交', salesSub: '本月',
    deals: '进行中交易', dealsSub: '处理中',
    inquiries: '新询问', inquiriesSub: '本周',
    viewings: '看房', viewingsSub: '未来 7 天',
  },
  quick: '快捷入口',
  sub: {
    project: '管理与浏览', sales: '业绩', opportunities: '进行中商机', creative: '图片与内容',
    contacts: '客户与人脉', activity: '询问与看房', gps: '轻松导航', finance: '佣金与支出',
    calculator: '贷款、回报率等', matching: '找到合适买家', expert: '获取专业建议', market: '动态与洞察',
    agenda: '看房、会议与提醒', property: '管理您的二手房源',
  },
  ai: { title: 'AI 辅助指令', body: '关于房产的任何问题都可以问，还能生成内容、分析交易！', start: '开始对话' },
  tabs: { home: '首页', projects: '新项目', ai: 'AI 助手', inquiries: '询问', more: '更多', label: '主菜单' },
  more: {
    title: '更多', profile: '经纪人资料', viewProfile: '查看资料', settings: '设置', notifications: '通知',
    team: '团队工作区', feedback: '发送反馈', about: '关于 EA AI Buddy', agentFallback: '经纪人',
  },
};

export const reskinStrings: Record<Lang, ReskinStrings> = { en, bm, zh };
