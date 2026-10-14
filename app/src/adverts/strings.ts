// Advertising & Listing Tracker text in English, Bahasa Malaysia and Simplified Chinese (BM and 中文 are drafts for the owner to check).
import type { Lang } from '../i18n';
import { titled3 } from '../lib/titleCase';

const en = {
  title: 'Advert tracker', summaryTitle: 'Advertising summary', open: 'Advert tracker',
  intro: 'Keep a record of where this property is advertised. The app only records adverts: it never posts to a platform, and a saved advert does not mean it is published.',
  add: 'Add advert', addFake: 'Add Fake Listing', none: 'No adverts recorded for this property yet.', back: 'All adverts',
  fakeLabel: 'TEST · not a real listing', fakeNote: 'Test listing: it is not counted in costs or reminders and must not be posted to a platform.',
  sampleNote: 'Sample property: its adverts are examples and are not counted in costs or reminders.',
  f: { platformOther: 'Other platform', platform: 'Platform', type: 'Advert type', title: 'Listing title', url: 'Link (URL)', ref: 'Platform reference', start: 'Date published', end: 'Due to expire', cost: 'Cost', remind: 'Remind me before expiry', status: 'Status', notes: 'Notes', screenshot: 'Screenshot' },
  otherOption: 'Other (type the name)', types: { listing: 'Normal listing', featured: 'Featured / premium', boosted: 'Boosted (paid)', social: 'Social post', other: 'Other' } as Record<string, string>,
  remindOpt: (d: number) => (d === 0 ? 'On the day' : d === 1 ? '1 day before' : `${d} days before`),
  addShot: 'Add screenshot', changeShot: 'Change screenshot', removeShot: 'Remove screenshot', openLink: 'Open link',
  save: 'Save advert', cancel: 'Cancel', edit: 'Edit', del: 'Delete', delTitle: 'Delete this advert?', delBody: 'It is removed from this property. The change is kept in the property history.',
  err: { platform: 'Type the name of the platform.', url: 'The link must start with http:// or https://', dates: 'The expiry date is before the published date.', cost: 'Cost cannot be negative.' },
  stale: 'End date has passed: shown as Expired.', markExpired: 'Mark as expired',
  attention: 'Needs attention', attentionNone: 'Nothing needs attention.',
  attn: { expired: (d: number) => `Expired ${Math.abs(d)} day${Math.abs(d) === 1 ? '' : 's'} ago`, expiring: (d: number) => (d === 0 ? 'Expires today' : `Expires in ${d} day${d === 1 ? '' : 's'}`), needs_update: 'Marked Needs update' },
  reminderTitle: 'Advert expiring', reminderBody: (p: string, pf: string, d: number) => `${pf} advert for ${p} ${d === 0 ? 'expires today' : `expires in ${d} day${d === 1 ? '' : 's'}`}.`,
  sum: {
    total: 'Total cost', adverts: (n: number) => `${n} advert${n === 1 ? '' : 's'}`, noCost: (n: number) => `${n} without a cost entered (counted as RM 0)`,
    byProperty: 'By property', byPlatform: 'By platform', byMonth: 'By month (date published)', undated: 'No date', from: 'From', to: 'To',
    excluded: (t: number, s: number) => `Left out: ${t} test listing${t === 1 ? '' : 's'}, ${s} sample advert${s === 1 ? '' : 's'}.`, empty: 'No real adverts to add up yet.', all: 'Advertising summary', openProperty: 'Open tracker',
  },
  testsOut: (n: number) => `${n} test listing${n === 1 ? '' : 's'} not counted`,
  noProperty: 'This property no longer exists.', optional: 'optional', screenshotHelp: 'A screenshot of the live advert. It stays on this phone with the record.',
};
export type AdStrings = typeof en;
const bm: AdStrings = {
  title: 'Penjejak iklan', summaryTitle: 'Ringkasan pengiklanan', open: 'Penjejak iklan',
  intro: 'Simpan rekod tempat hartanah ini diiklankan. Aplikasi hanya merekod iklan: ia tidak pernah menyiarkan ke mana-mana platform, dan iklan yang disimpan tidak bermaksud ia telah diterbitkan.',
  add: 'Tambah iklan', addFake: 'Tambah Iklan Palsu', none: 'Belum ada iklan direkodkan untuk hartanah ini.', back: 'Semua iklan',
  fakeLabel: 'UJIAN · bukan iklan sebenar', fakeNote: 'Iklan ujian: tidak dikira dalam kos atau peringatan dan tidak boleh disiarkan ke platform.',
  sampleNote: 'Hartanah contoh: iklannya hanyalah contoh dan tidak dikira dalam kos atau peringatan.',
  f: { platformOther: 'Platform lain', platform: 'Platform', type: 'Jenis iklan', title: 'Tajuk iklan', url: 'Pautan (URL)', ref: 'Rujukan platform', start: 'Tarikh diterbitkan', end: 'Tarikh tamat', cost: 'Kos', remind: 'Ingatkan saya sebelum tamat', status: 'Status', notes: 'Catatan', screenshot: 'Tangkapan skrin' },
  otherOption: 'Lain-lain (taip nama)', types: { listing: 'Iklan biasa', featured: 'Pilihan / premium', boosted: 'Dipromosi (berbayar)', social: 'Hantaran sosial', other: 'Lain-lain' },
  remindOpt: (d: number) => (d === 0 ? 'Pada hari itu' : `${d} hari sebelum`),
  addShot: 'Tambah tangkapan skrin', changeShot: 'Tukar tangkapan skrin', removeShot: 'Buang tangkapan skrin', openLink: 'Buka pautan',
  save: 'Simpan iklan', cancel: 'Batal', edit: 'Ubah', del: 'Padam', delTitle: 'Padam iklan ini?', delBody: 'Ia dibuang daripada hartanah ini. Perubahan disimpan dalam sejarah hartanah.',
  err: { platform: 'Taip nama platform.', url: 'Pautan mesti bermula dengan http:// atau https://', dates: 'Tarikh tamat sebelum tarikh diterbitkan.', cost: 'Kos tidak boleh negatif.' },
  stale: 'Tarikh tamat sudah lepas: ditunjukkan sebagai Tamat.', markExpired: 'Tandakan tamat',
  attention: 'Perlu perhatian', attentionNone: 'Tiada yang perlu perhatian.',
  attn: { expired: (d: number) => `Tamat ${Math.abs(d)} hari lalu`, expiring: (d: number) => (d === 0 ? 'Tamat hari ini' : `Tamat dalam ${d} hari`), needs_update: 'Ditanda Perlu dikemas kini' },
  reminderTitle: 'Iklan hampir tamat', reminderBody: (p: string, pf: string, d: number) => `Iklan ${pf} untuk ${p} ${d === 0 ? 'tamat hari ini' : `tamat dalam ${d} hari`}.`,
  sum: {
    total: 'Jumlah kos', adverts: (n: number) => `${n} iklan`, noCost: (n: number) => `${n} tanpa kos dimasukkan (dikira RM 0)`,
    byProperty: 'Mengikut hartanah', byPlatform: 'Mengikut platform', byMonth: 'Mengikut bulan (tarikh diterbitkan)', undated: 'Tiada tarikh', from: 'Dari', to: 'Hingga',
    excluded: (t: number, s: number) => `Ditinggalkan: ${t} iklan ujian, ${s} iklan contoh.`, empty: 'Belum ada iklan sebenar untuk dijumlahkan.', all: 'Ringkasan pengiklanan', openProperty: 'Buka penjejak',
  },
  testsOut: (n: number) => `${n} iklan ujian tidak dikira`,
  noProperty: 'Hartanah ini sudah tiada.', optional: 'pilihan', screenshotHelp: 'Tangkapan skrin iklan yang aktif. Ia kekal dalam telefon ini bersama rekod.',
};
const zh: AdStrings = {
  title: '广告追踪', summaryTitle: '广告汇总', open: '广告追踪',
  intro: '记录此房产在哪里刊登广告。本应用只做记录：不会向任何平台发布，保存广告并不代表已经发布。',
  add: '添加广告', addFake: '添加测试刊登', none: '此房产还没有广告记录。', back: '所有广告',
  fakeLabel: '测试 · 非真实刊登', fakeNote: '测试刊登：不计入费用或提醒，也不得发布到任何平台。',
  sampleNote: '示例房产：其广告仅为示例，不计入费用或提醒。',
  f: { platformOther: '其他平台', platform: '平台', type: '广告类型', title: '刊登标题', url: '链接 (URL)', ref: '平台编号', start: '发布日期', end: '到期日期', cost: '费用', remind: '到期前提醒我', status: '状态', notes: '备注', screenshot: '截图' },
  otherOption: '其他（输入名称）', types: { listing: '普通刊登', featured: '精选 / 高级', boosted: '推广（付费）', social: '社交帖文', other: '其他' },
  remindOpt: (d: number) => (d === 0 ? '当天' : `提前 ${d} 天`),
  addShot: '添加截图', changeShot: '更换截图', removeShot: '移除截图', openLink: '打开链接',
  save: '保存广告', cancel: '取消', edit: '编辑', del: '删除', delTitle: '删除此广告？', delBody: '将从此房产中移除。更改会保留在房产记录中。',
  err: { platform: '请输入平台名称。', url: '链接必须以 http:// 或 https:// 开头', dates: '到期日期早于发布日期。', cost: '费用不能为负数。' },
  stale: '结束日期已过：显示为已过期。', markExpired: '标记为已过期',
  attention: '需要处理', attentionNone: '没有需要处理的项目。',
  attn: { expired: (d: number) => `已过期 ${Math.abs(d)} 天`, expiring: (d: number) => (d === 0 ? '今天到期' : `${d} 天后到期`), needs_update: '已标记需要更新' },
  reminderTitle: '广告即将到期', reminderBody: (p: string, pf: string, d: number) => `${p} 在 ${pf} 的广告${d === 0 ? '今天到期' : `将在 ${d} 天后到期`}。`,
  sum: {
    total: '总费用', adverts: (n: number) => `${n} 个广告`, noCost: (n: number) => `${n} 个未填费用（按 RM 0 计）`,
    byProperty: '按房产', byPlatform: '按平台', byMonth: '按月份（发布日期）', undated: '无日期', from: '从', to: '至',
    excluded: (t: number, s: number) => `已排除：${t} 个测试刊登，${s} 个示例广告。`, empty: '暂无真实广告可汇总。', all: '广告汇总', openProperty: '打开追踪',
  },
  testsOut: (n: number) => `${n} 个测试刊登未计入`,
  noProperty: '这个房产已不存在。', optional: '可选', screenshotHelp: '已上线广告的截图。与记录一同保存在本手机。',
};
export const adStrings: Record<Lang, AdStrings> = titled3({ en, bm, zh });
