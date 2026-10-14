// To-Do, Calendar, Inquiry History and Viewing History text, in three languages.
import type { Lang } from '../i18n';
import { titled3 } from '../lib/titleCase';

const en = {
  inq: {
    title: 'Inquiry History', add: '+ Inquiry', none: 'No inquiries yet.',
    help: 'Enquiries and contacts where no viewing has happened yet. Convert to Viewing moves an inquiry to Viewing History as a Pending Viewing.',
    convert: 'Convert to Viewing', converted: 'Moved to Viewing History as a Pending Viewing.',
    newTitle: 'New inquiry', editTitle: 'Edit inquiry', who: 'Who asked', at: 'Date and time', channel: 'How they asked', message: 'What they asked',
    followUp: 'Follow-up on (creates a To-Do)', followUpTitle: (name: string) => `Follow up ${name}`,
    contactRequired: 'Choose or add the person who asked.',
    channels: { call: 'Phone call', whatsapp: 'WhatsApp', walk_in: 'Walk-in', portal: 'Property portal', referral: 'Referral', social: 'Social media', other: 'Other' } as Record<string, string>,
  },
  view: {
    title: 'Viewing History', add: '+ Viewing', none: 'No viewings yet.',
    flow: 'Inquiry → Pending Viewing → Viewed',
    status: { scheduled: 'Scheduled', pending: 'Pending Viewing', completed: 'Viewed', cancelled: 'Cancelled' } as Record<string, string>,
    markViewed: 'Mark as viewed', cancelIt: 'Cancel viewing', fromInquiry: (d: string) => `From inquiry on ${d}`, outcome: 'Outcome / feedback',
  },
  appt: {
    kinds: { viewing: 'Viewing', meeting: 'Meeting', site_visit: 'Site visit', follow_up: 'Follow-up', signing: 'Signing', other: 'Other' } as Record<string, string>,
    status: { scheduled: 'Scheduled', pending: 'Pending', completed: 'Completed', cancelled: 'Cancelled' } as Record<string, string>,
    newTitle: 'New appointment', editTitle: 'Edit appointment', kind: 'Type', title: 'Title', date: 'Date', time: 'Time', duration: 'Duration (minutes)',
    place: 'Place', outcome: 'Outcome / notes after', noDate: 'Date not set yet', complete: 'Mark completed', cancel: 'Mark cancelled', reopen: 'Reopen',
    followUp: 'Create follow-up To-Do', followUpTitle: (x: string) => `Follow up: ${x}`, deleteQ: 'Delete this appointment?',
    pendingHint: 'Pending = not confirmed yet. Set it to Scheduled when the date and time are agreed.',
  },
  todo: {
    title: 'To-Do', add: '+ New to-do', newTitle: 'New to-do', editTitle: 'Edit to-do',
    tabs: { today: 'Today', upcoming: 'Upcoming', overdue: 'Overdue', someday: 'No date', done: 'Completed' } as Record<string, string>,
    none: { today: 'Nothing due today.', upcoming: 'Nothing coming up.', overdue: 'Nothing overdue.', someday: 'No to-dos without a date.', done: 'No completed to-dos yet.' } as Record<string, string>,
    priority: { urgent: 'Urgent', high: 'High', medium: 'Medium', low: 'Low' } as Record<string, string>,
    fields: { title: 'What to do', due: 'Due date', time: 'Time', priority: 'Priority', notes: 'Notes', followUp: 'This is a follow-up' },
    followUp: 'Follow-up', markDone: (x: string) => `Mark done: ${x}`, reopen: (x: string) => `Mark not done: ${x}`,
    history: 'Completed items stay here as history.', deleteQ: 'Delete this to-do?', titleRequired: 'Type what to do first.',
    completedOn: (d: string) => `Completed ${d}`,
  },
  cal: {
    title: 'Calendar', today: 'Today', add: '+ Appointment', addTask: '+ To-do', none: 'Nothing on this day.', tasksDue: 'To-dos due',
    prev: 'Previous month', next: 'Next month', month: 'Month', week: 'Week', prevWeek: 'Previous week', nextWeek: 'Next week',
    filter: { all: 'All', open: 'Open', completed: 'Completed', cancelled: 'Cancelled' } as Record<string, string>,
  },
  activity: { title: 'Inquiries & Viewings' },
};
export type AgendaStrings = typeof en;

const bm: AgendaStrings = {
  inq: {
    title: 'Sejarah Pertanyaan', add: '+ Pertanyaan', none: 'Belum ada pertanyaan.',
    help: 'Pertanyaan dan hubungan yang belum ada lawatan. Tukar kepada Lawatan memindahkan pertanyaan ke Sejarah Lawatan sebagai Lawatan Belum Disahkan.',
    convert: 'Tukar kepada Lawatan', converted: 'Dipindahkan ke Sejarah Lawatan sebagai Lawatan Belum Disahkan.',
    newTitle: 'Pertanyaan baharu', editTitle: 'Ubah pertanyaan', who: 'Siapa yang bertanya', at: 'Tarikh dan masa', channel: 'Cara bertanya', message: 'Apa yang ditanya',
    followUp: 'Susulan pada (mencipta Tugasan)', followUpTitle: (name: string) => `Susuli ${name}`,
    contactRequired: 'Pilih atau tambah orang yang bertanya.',
    channels: { call: 'Panggilan telefon', whatsapp: 'WhatsApp', walk_in: 'Datang sendiri', portal: 'Portal hartanah', referral: 'Rujukan', social: 'Media sosial', other: 'Lain-lain' },
  },
  view: {
    title: 'Sejarah Lawatan', add: '+ Lawatan', none: 'Belum ada lawatan.',
    flow: 'Pertanyaan → Lawatan Belum Disahkan → Telah Dilawati',
    status: { scheduled: 'Dijadualkan', pending: 'Lawatan Belum Disahkan', completed: 'Telah Dilawati', cancelled: 'Dibatalkan' },
    markViewed: 'Tanda sudah dilawati', cancelIt: 'Batalkan lawatan', fromInquiry: (d: string) => `Daripada pertanyaan pada ${d}`, outcome: 'Keputusan / maklum balas',
  },
  appt: {
    kinds: { viewing: 'Lawatan', meeting: 'Mesyuarat', site_visit: 'Lawatan tapak', follow_up: 'Susulan', signing: 'Tandatangan', other: 'Lain-lain' },
    status: { scheduled: 'Dijadualkan', pending: 'Belum disahkan', completed: 'Selesai', cancelled: 'Dibatalkan' },
    newTitle: 'Temujanji baharu', editTitle: 'Ubah temujanji', kind: 'Jenis', title: 'Tajuk', date: 'Tarikh', time: 'Masa', duration: 'Tempoh (minit)',
    place: 'Tempat', outcome: 'Keputusan / catatan selepas', noDate: 'Tarikh belum ditetapkan', complete: 'Tanda selesai', cancel: 'Tanda dibatalkan', reopen: 'Buka semula',
    followUp: 'Cipta Tugasan susulan', followUpTitle: (x: string) => `Susuli: ${x}`, deleteQ: 'Padam temujanji ini?',
    pendingHint: 'Belum disahkan = belum dipersetujui. Tukar kepada Dijadualkan apabila tarikh dan masa dipersetujui.',
  },
  todo: {
    title: 'Tugasan', add: '+ Tugasan baharu', newTitle: 'Tugasan baharu', editTitle: 'Ubah tugasan',
    tabs: { today: 'Hari ini', upcoming: 'Akan datang', overdue: 'Tertunggak', someday: 'Tiada tarikh', done: 'Selesai' },
    none: { today: 'Tiada yang perlu dibuat hari ini.', upcoming: 'Tiada yang akan datang.', overdue: 'Tiada yang tertunggak.', someday: 'Tiada tugasan tanpa tarikh.', done: 'Belum ada tugasan selesai.' },
    priority: { urgent: 'Segera', high: 'Tinggi', medium: 'Sederhana', low: 'Rendah' },
    fields: { title: 'Apa yang perlu dibuat', due: 'Tarikh akhir', time: 'Masa', priority: 'Keutamaan', notes: 'Catatan', followUp: 'Ini susulan' },
    followUp: 'Susulan', markDone: (x: string) => `Tanda selesai: ${x}`, reopen: (x: string) => `Tanda belum selesai: ${x}`,
    history: 'Tugasan selesai kekal di sini sebagai sejarah.', deleteQ: 'Padam tugasan ini?', titleRequired: 'Taip apa yang perlu dibuat dahulu.',
    completedOn: (d: string) => `Selesai ${d}`,
  },
  cal: {
    title: 'Kalendar', today: 'Hari ini', add: '+ Temujanji', addTask: '+ Tugasan', none: 'Tiada apa-apa pada hari ini.', tasksDue: 'Tugasan perlu dibuat',
    prev: 'Bulan sebelumnya', next: 'Bulan seterusnya', month: 'Bulan', week: 'Minggu', prevWeek: 'Minggu sebelumnya', nextWeek: 'Minggu seterusnya',
    filter: { all: 'Semua', open: 'Terbuka', completed: 'Selesai', cancelled: 'Dibatalkan' },
  },
  activity: { title: 'Pertanyaan & Lawatan' },
};

const zh: AgendaStrings = {
  inq: {
    title: '询问记录', add: '+ 询问', none: '还没有询问。',
    help: '尚未看房的询问与联系。“转为看房”会把询问移到看房记录，状态为“待确认看房”。',
    convert: '转为看房', converted: '已移到看房记录，状态为“待确认看房”。',
    newTitle: '新询问', editTitle: '编辑询问', who: '询问者', at: '日期与时间', channel: '询问方式', message: '询问内容',
    followUp: '跟进日期（建立待办事项）', followUpTitle: (name: string) => `跟进 ${name}`,
    contactRequired: '请选择或添加询问者。',
    channels: { call: '电话', whatsapp: 'WhatsApp', walk_in: '亲自到访', portal: '房产网站', referral: '介绍', social: '社交媒体', other: '其他' },
  },
  view: {
    title: '看房记录', add: '+ 看房', none: '还没有看房记录。',
    flow: '询问 → 待确认看房 → 已看房',
    status: { scheduled: '已安排', pending: '待确认看房', completed: '已看房', cancelled: '已取消' },
    markViewed: '标记为已看房', cancelIt: '取消看房', fromInquiry: (d: string) => `来自 ${d} 的询问`, outcome: '结果 / 反馈',
  },
  appt: {
    kinds: { viewing: '看房', meeting: '会议', site_visit: '实地考察', follow_up: '跟进', signing: '签约', other: '其他' },
    status: { scheduled: '已安排', pending: '待确认', completed: '已完成', cancelled: '已取消' },
    newTitle: '新预约', editTitle: '编辑预约', kind: '类型', title: '标题', date: '日期', time: '时间', duration: '时长（分钟）',
    place: '地点', outcome: '结果 / 事后备注', noDate: '尚未定日期', complete: '标记完成', cancel: '标记取消', reopen: '重新打开',
    followUp: '建立跟进待办', followUpTitle: (x: string) => `跟进：${x}`, deleteQ: '删除此预约？',
    pendingHint: '待确认 = 尚未约定。日期和时间确定后改为“已安排”。',
  },
  todo: {
    title: '待办事项', add: '+ 新待办', newTitle: '新待办', editTitle: '编辑待办',
    tabs: { today: '今天', upcoming: '即将到来', overdue: '已逾期', someday: '无日期', done: '已完成' },
    none: { today: '今天没有到期事项。', upcoming: '没有即将到来的事项。', overdue: '没有逾期事项。', someday: '没有无日期的待办。', done: '还没有已完成的待办。' },
    priority: { urgent: '紧急', high: '高', medium: '中', low: '低' },
    fields: { title: '要做什么', due: '到期日', time: '时间', priority: '优先级', notes: '备注', followUp: '这是跟进事项' },
    followUp: '跟进', markDone: (x: string) => `标记完成：${x}`, reopen: (x: string) => `标记未完成：${x}`,
    history: '已完成的事项会保留在这里作为记录。', deleteQ: '删除此待办？', titleRequired: '请先输入要做的事。',
    completedOn: (d: string) => `${d} 完成`,
  },
  cal: {
    title: '日历', today: '今天', add: '+ 预约', addTask: '+ 待办', none: '这一天没有安排。', tasksDue: '到期待办',
    prev: '上个月', next: '下个月', month: '月', week: '周', prevWeek: '上一周', nextWeek: '下一周',
    filter: { all: '全部', open: '未完成', completed: '已完成', cancelled: '已取消' },
  },
  activity: { title: '询问与看房' },
};

export const agendaStrings: Record<Lang, AgendaStrings> = titled3({ en, bm, zh });
