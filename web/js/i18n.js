// Screen labels in English and Bahasa Malaysia. Reference articles stay in English for now.

export const MENUS = [
  { id: 'home', n: 1, icon: '🏠', en: 'Welcome Home', ms: 'Laman Utama' },
  { id: 'tracker', n: 2, icon: '🧭', en: 'Application Tracker', ms: 'Penjejak Permohonan' },
  { id: 'renewals', n: 3, icon: '⏳', en: 'Visa & Pass Renewals', ms: 'Pembaharuan Visa & Pas' },
  { id: 'family', n: 4, icon: '👨‍👩‍👧', en: 'Family Members', ms: 'Ahli Keluarga' },
  { id: 'docs', n: 5, icon: '🗂️', en: 'Documents Vault', ms: 'Peti Dokumen' },
  { id: 'finance', n: 6, icon: '🏦', en: 'Fixed Deposit & Finance', ms: 'Simpanan Tetap & Kewangan' },
  { id: 'housing', n: 7, icon: '🏡', en: 'Housing', ms: 'Perumahan' },
  { id: 'schools', n: 8, icon: '🎓', en: 'Schools & Education', ms: 'Sekolah & Pendidikan' },
  { id: 'health', n: 9, icon: '🩺', en: 'Healthcare & Insurance', ms: 'Kesihatan & Insurans' },
  { id: 'settle', n: 10, icon: '✅', en: 'Settling In Checklist', ms: 'Senarai Semak Menetap' },
  { id: 'guide', n: 11, icon: '📖', en: 'Local Life Guide', ms: 'Panduan Kehidupan' },
  { id: 'chat', n: 12, icon: '💬', en: 'AI Buddy Chat', ms: 'Sembang AI Buddy' },
  { id: 'directory', n: 13, icon: '📇', en: 'Services Directory', ms: 'Direktori Perkhidmatan' },
  { id: 'tasks', n: 14, icon: '🗓️', en: 'Tasks & Calendar', ms: 'Tugasan & Kalendar' },
  { id: 'settings', n: 15, icon: '⚙️', en: 'Settings', ms: 'Tetapan' },
  { id: 'integrations', n: 16, icon: '🔌', en: 'Future Integrations', ms: 'Integrasi Akan Datang' },
  { id: 'news', n: 17, icon: '📰', en: 'News', ms: 'Berita' },
  { id: 'hotspots', n: 18, icon: '📍', en: 'Hotspots', ms: 'Tempat Popular' },
  { id: 'coupons', n: 19, icon: '🎟️', en: 'Coupons', ms: 'Kupon' },
];

const L = {
  appName: ['Malaysia Welcome AI Buddy', 'Malaysia Welcome AI Buddy'],
  tagline: ['Your MM2H family companion', 'Teman keluarga MM2H anda'],
  menu: ['Menu', 'Menu'],
  allMenus: ['All menus', 'Semua menu'],
  add: ['Add', 'Tambah'],
  save: ['Save', 'Simpan'],
  cancel: ['Cancel', 'Batal'],
  delete: ['Delete', 'Padam'],
  edit: ['Edit', 'Sunting'],
  back: ['Back', 'Kembali'],
  search: ['Search', 'Cari'],
  nothingYet: ['Nothing here yet.', 'Belum ada apa-apa.'],
  nextDeadlines: ['Next deadlines', 'Tarikh akhir seterusnya'],
  noDeadlines: ['No dates yet. Add family passports, tasks or renewals to see reminders here.', 'Belum ada tarikh. Tambah pasport, tugasan atau pembaharuan untuk melihat peringatan di sini.'],
  progress: ['Application progress', 'Kemajuan permohonan'],
  quick: ['Quick actions', 'Tindakan pantas'],
  daysLeft: ['days left', 'hari lagi'],
  dueToday: ['due today', 'hari ini'],
  overdueBy: ['overdue by', 'lewat'],
  days: ['days', 'hari'],
  welcome: ['Welcome', 'Selamat datang'],
  getStarted: ['Get started', 'Mula'],
  familyName: ['Family name', 'Nama keluarga'],
  tier: ['MM2H tier', 'Kategori MM2H'],
  state: ['State you plan to live in', 'Negeri pilihan'],
  arrival: ['Planned arrival date', 'Tarikh ketibaan'],
  language: ['Language', 'Bahasa'],
  offline: ['Offline', 'Luar talian'],
  done: ['Done', 'Selesai'],
  home: ['Home', 'Utama'],
  ask: ['Ask', 'Tanya'],
};

export function t(key, lang = 'en') {
  const v = L[key];
  if (!v) return key;
  return lang === 'ms' ? v[1] : v[0];
}

export function menuName(id, lang = 'en') {
  const m = MENUS.find(x => x.id === id);
  if (!m) return id;
  return lang === 'ms' ? m.ms : m.en;
}
