// Text for ClaudeChanges001 (owner, 17 Oct 2026): the sync banner, the merged Availability list, Co-broke details, the
// photo viewer, the Booked / Sold / Rented prompts, Track My Sales and the Calendar / To-do chooser. English, Bahasa
// Malaysia and Chinese; the Bahasa Malaysia and Chinese wording is a first draft for the owner to check.
// The deal page's own field labels live with the field list (deals/spec.ts).
import type { Lang } from '../i18n';

const en = {
  // Change 2: one banner on the main page when something did not sync
  sync: {
    listings: (n: number) => `${n} ${n === 1 ? 'listing' : 'listings'} not synced`,
    changes: (n: number) => `${n} ${n === 1 ? 'change' : 'changes'} not synced`,
    retryIn: (sec: number) => `Retrying in ${sec}s`,
    phoneFailed: 'Not saved: the phone’s storage failed',
    conflicts: (n: number) => `${n} ${n === 1 ? 'record needs' : 'records need'} your review`,
  },
  // Changes 1, 8, 10: section 1 and the merged Availability list
  basicsTitle: 'Basic Info and Availability',
  idPreview: (r: string) => `ID: ${r}`,
  idLabel: 'ID',
  avail: {
    label: 'Availability',
    available_now: 'Available Now', available_from: 'Available From', booked: 'Booked', sold: 'Sold', rented: 'Rented', withdrawn: 'Withdrawn',
    fromMonth: 'Available From (Month)',
  } as Record<string, string>,
  // Change 3
  commissionPct: 'Commission (%)',
  commissionFlat: 'Commission (RM)',
  // Change 9
  whatsappUser: 'WhatsApp Username',
  personName: 'Name',
  personPhone: 'Phone',
  ownerWhatsapp: 'Owner WhatsApp Username',
  tenantWhatsapp: 'Tenant WhatsApp Username',
  pickPhone: 'Choose from phone book',
  vendorSearch: 'Search by name or number',
  vendorNone: 'Not Linked: Type the Owner Below',
  vendorNoMatch: 'No saved contact matches.',
  // Change 10: Co-broke details
  cobroke: {
    agent: 'Co-broke Agent Name', agency: 'Co-broke Agency Name', phone: 'Co-broke Agent Phone', whatsapp: 'Co-broke Agent WhatsApp Username',
  },
  arrangement: { direct: 'Direct', cobroke: 'Co-broke' } as Record<string, string>,
  // Change 7: photos
  photo: {
    setMain: 'Set as Main Photo', delete: 'Delete', deleteQ: 'Delete this photo?', deleteBody: 'The photo is removed from this property when you save.',
    viewer: 'Photo viewer', close: 'Close', counter: (i: number, n: number) => `${i} / ${n}`, prev: 'Previous photo', next: 'Next photo',
    open: (i: number) => `Open photo ${i} full screen`,
  },
  // Change 11: prompts when Booked / Sold / Rented is chosen
  deal: {
    bookedQ: 'Fill in booking details now?', bookedBody: 'The property is saved first, then the booking page opens.',
    soldQ: 'Sold by you or by others?', soldBody: 'The property is saved first, then the details page opens.',
    rentedQ: 'Fill in rental details now?', rentedBody: 'The property is saved first, then the rental page opens.',
    byMe: 'Sold by Me', byOthers: 'Sold by Others', fillNow: 'Fill In Now', later: 'Later', cancel: 'Cancel',
    openBooking: 'Booking Details', openSale: 'Sale Details', openRental: 'Rental Details', openOthers: 'Sold by Others',
    titleBooking: 'Booking Details', titleSale: 'Sale Details', titleRental: 'Rental Details', titleOthers: 'Sold by Others',
    save: 'Save', saved: 'Saved', notFound: 'This property was not found.',
    addRow: 'Add', removeRow: 'Remove', addFiles: 'Add Files', noFiles: 'No files yet.', open: 'Open',
    addField: 'Add My Own Field', fieldName: 'Field name', createField: 'Add Field', customTitle: 'My Own Fields', customNone: 'No fields of your own yet.',
    yes: 'Yes', no: 'No', notSet: 'Not Set', others: 'Others…', othersHint: 'Type a new value',
    reminderNote: 'Dates marked 🔔 are added to your Calendar with reminders 3 days and 1 day before.',
    soldByLabel: 'Sold By',
  },
  // Change 12
  agendaQ: 'Calendar or To-Do?', calendar: 'Calendar', todo: 'To-Do',
  sales: {
    title: 'Track My Sales',
    totals: 'Commission', earned: 'Received', pending: 'Pending', month: 'Received This Month', year: 'Received This Year',
    deadlines: 'Upcoming Deadlines (60 Days)', noDeadlines: 'No deadlines in the next 60 days.',
    deals: 'All Deals by Stage', none: 'No deals yet. Choose Booked, Sold or Rented in a property’s Availability to start one.',
    stage: { booked: 'Booked', spa: 'SPA Signed', completed: 'Completed', sold: 'Sold (Waiting for SPA)', rented: 'Rented', others: 'Sold by Others', cancelled: 'Booking Cancelled' } as Record<string, string>,
    due: { bookingExpiry: 'Booking expires', targetSpa: 'Target SPA date', balanceDue: 'Balance deposit due', completionDate: 'Completion', tenancyEnd: 'Tenancy ends', rentDue: 'Rent due' } as Record<string, string>,
    inDays: (n: number) => (n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`),
    commissionOf: (x: string) => `Commission ${x}`,
  },
  reminderTitle: (what: string, place: string) => `${what}: ${place}`,
};
export type CC001 = typeof en;

const bm: CC001 = {
  sync: {
    listings: n => `${n} senarai belum disegerakkan`,
    changes: n => `${n} perubahan belum disegerakkan`,
    retryIn: sec => `Cuba semula dalam ${sec}s`,
    phoneFailed: 'Tidak disimpan: storan telefon gagal',
    conflicts: n => `${n} rekod perlu anda semak`,
  },
  basicsTitle: 'Maklumat Asas dan Ketersediaan',
  idPreview: r => `ID: ${r}`,
  idLabel: 'ID',
  avail: {
    label: 'Ketersediaan',
    available_now: 'Ada Sekarang', available_from: 'Ada Mulai', booked: 'Telah Ditempah', sold: 'Dijual', rented: 'Disewa', withdrawn: 'Ditarik Balik',
    fromMonth: 'Ada Mulai (Bulan)',
  },
  commissionPct: 'Komisen (%)',
  commissionFlat: 'Komisen (RM)',
  whatsappUser: 'Nama Pengguna WhatsApp',
  personName: 'Nama',
  personPhone: 'Telefon',
  ownerWhatsapp: 'Nama Pengguna WhatsApp Pemilik',
  tenantWhatsapp: 'Nama Pengguna WhatsApp Penyewa',
  pickPhone: 'Pilih daripada buku telefon',
  vendorSearch: 'Cari mengikut nama atau nombor',
  vendorNone: 'Tidak Dipautkan: Taip Pemilik di Bawah',
  vendorNoMatch: 'Tiada kenalan yang sepadan.',
  cobroke: {
    agent: 'Nama Ejen Co-broke', agency: 'Nama Agensi Co-broke', phone: 'Telefon Ejen Co-broke', whatsapp: 'Nama Pengguna WhatsApp Ejen Co-broke',
  },
  arrangement: { direct: 'Terus', cobroke: 'Co-broke' },
  photo: {
    setMain: 'Jadikan Foto Utama', delete: 'Padam', deleteQ: 'Padam foto ini?', deleteBody: 'Foto dibuang daripada hartanah ini apabila anda simpan.',
    viewer: 'Pemapar foto', close: 'Tutup', counter: (i, n) => `${i} / ${n}`, prev: 'Foto sebelumnya', next: 'Foto seterusnya',
    open: i => `Buka foto ${i} skrin penuh`,
  },
  deal: {
    bookedQ: 'Isi butiran tempahan sekarang?', bookedBody: 'Hartanah disimpan dahulu, kemudian halaman tempahan dibuka.',
    soldQ: 'Dijual oleh anda atau orang lain?', soldBody: 'Hartanah disimpan dahulu, kemudian halaman butiran dibuka.',
    rentedQ: 'Isi butiran sewaan sekarang?', rentedBody: 'Hartanah disimpan dahulu, kemudian halaman sewaan dibuka.',
    byMe: 'Dijual oleh Saya', byOthers: 'Dijual oleh Orang Lain', fillNow: 'Isi Sekarang', later: 'Nanti', cancel: 'Batal',
    openBooking: 'Butiran Tempahan', openSale: 'Butiran Jualan', openRental: 'Butiran Sewaan', openOthers: 'Dijual oleh Orang Lain',
    titleBooking: 'Butiran Tempahan', titleSale: 'Butiran Jualan', titleRental: 'Butiran Sewaan', titleOthers: 'Dijual oleh Orang Lain',
    save: 'Simpan', saved: 'Disimpan', notFound: 'Hartanah ini tidak dijumpai.',
    addRow: 'Tambah', removeRow: 'Buang', addFiles: 'Tambah Fail', noFiles: 'Belum ada fail.', open: 'Buka',
    addField: 'Tambah Medan Sendiri', fieldName: 'Nama medan', createField: 'Tambah Medan', customTitle: 'Medan Sendiri', customNone: 'Belum ada medan sendiri.',
    yes: 'Ya', no: 'Tidak', notSet: 'Belum Ditetapkan', others: 'Lain-lain…', othersHint: 'Taip nilai baharu',
    reminderNote: 'Tarikh bertanda 🔔 dimasukkan ke Kalendar dengan peringatan 3 hari dan 1 hari sebelumnya.',
    soldByLabel: 'Dijual Oleh',
  },
  agendaQ: 'Kalendar atau Tugasan?', calendar: 'Kalendar', todo: 'Tugasan',
  sales: {
    title: 'Jejak Jualan Saya',
    totals: 'Komisen', earned: 'Diterima', pending: 'Belum Diterima', month: 'Diterima Bulan Ini', year: 'Diterima Tahun Ini',
    deadlines: 'Tarikh Akhir Akan Datang (60 Hari)', noDeadlines: 'Tiada tarikh akhir dalam 60 hari akan datang.',
    deals: 'Semua Urusan Mengikut Peringkat', none: 'Belum ada urusan. Pilih Telah Ditempah, Dijual atau Disewa dalam Ketersediaan hartanah untuk bermula.',
    stage: { booked: 'Telah Ditempah', spa: 'SPA Ditandatangani', completed: 'Selesai', sold: 'Dijual (Menunggu SPA)', rented: 'Disewa', others: 'Dijual oleh Orang Lain', cancelled: 'Tempahan Dibatalkan' },
    due: { bookingExpiry: 'Tempahan tamat', targetSpa: 'Sasaran tarikh SPA', balanceDue: 'Baki deposit perlu dibayar', completionDate: 'Penyempurnaan', tenancyEnd: 'Penyewaan tamat', rentDue: 'Sewa perlu dibayar' },
    inDays: n => (n === 0 ? 'hari ini' : n === 1 ? 'esok' : `dalam ${n} hari`),
    commissionOf: x => `Komisen ${x}`,
  },
  reminderTitle: (what, place) => `${what}: ${place}`,
};

const zh: CC001 = {
  sync: {
    listings: n => `${n} 个房源未同步`,
    changes: n => `${n} 项更改未同步`,
    retryIn: sec => `${sec} 秒后重试`,
    phoneFailed: '未保存：手机存储失败',
    conflicts: n => `${n} 条记录需要您检查`,
  },
  basicsTitle: '基本信息与可用性',
  idPreview: r => `ID：${r}`,
  idLabel: 'ID',
  avail: {
    label: '可用性',
    available_now: '现可入住', available_from: '可入住日期', booked: '已预订', sold: '已售', rented: '已出租', withdrawn: '已撤回',
    fromMonth: '可入住日期（月份）',
  },
  commissionPct: '佣金 (%)',
  commissionFlat: '佣金 (RM)',
  whatsappUser: 'WhatsApp 用户名',
  personName: '姓名',
  personPhone: '电话',
  ownerWhatsapp: '业主 WhatsApp 用户名',
  tenantWhatsapp: '租户 WhatsApp 用户名',
  pickPhone: '从通讯录选择',
  vendorSearch: '按姓名或号码搜索',
  vendorNone: '未关联：在下方输入业主',
  vendorNoMatch: '没有匹配的联系人。',
  cobroke: {
    agent: '联合代理经纪人姓名', agency: '联合代理公司名称', phone: '联合代理经纪人电话', whatsapp: '联合代理经纪人 WhatsApp 用户名',
  },
  arrangement: { direct: '直接委托', cobroke: '联合代理' },
  photo: {
    setMain: '设为主照片', delete: '删除', deleteQ: '删除这张照片？', deleteBody: '保存后，照片会从此房产中移除。',
    viewer: '照片查看器', close: '关闭', counter: (i, n) => `${i} / ${n}`, prev: '上一张', next: '下一张',
    open: i => `全屏打开第 ${i} 张照片`,
  },
  deal: {
    bookedQ: '现在填写预订资料？', bookedBody: '先保存房产，然后打开预订页面。',
    soldQ: '由您还是别人售出？', soldBody: '先保存房产，然后打开资料页面。',
    rentedQ: '现在填写出租资料？', rentedBody: '先保存房产，然后打开出租页面。',
    byMe: '由我售出', byOthers: '由别人售出', fillNow: '现在填写', later: '稍后', cancel: '取消',
    openBooking: '预订资料', openSale: '出售资料', openRental: '出租资料', openOthers: '由别人售出',
    titleBooking: '预订资料', titleSale: '出售资料', titleRental: '出租资料', titleOthers: '由别人售出',
    save: '保存', saved: '已保存', notFound: '找不到此房产。',
    addRow: '添加', removeRow: '删除', addFiles: '添加文件', noFiles: '还没有文件。', open: '打开',
    addField: '添加自定义字段', fieldName: '字段名称', createField: '添加字段', customTitle: '自定义字段', customNone: '还没有自定义字段。',
    yes: '是', no: '否', notSet: '未设置', others: '其他…', othersHint: '输入新的选项',
    reminderNote: '标有 🔔 的日期会加入日历，并在 3 天和 1 天前提醒。',
    soldByLabel: '售出方',
  },
  agendaQ: '日历还是待办？', calendar: '日历', todo: '待办',
  sales: {
    title: '我的成交追踪',
    totals: '佣金', earned: '已收', pending: '待收', month: '本月已收', year: '本年已收',
    deadlines: '即将到期（60 天内）', noDeadlines: '未来 60 天没有到期事项。',
    deals: '按阶段列出所有交易', none: '还没有交易。在房产的可用性中选择已预订、已售或已出租即可开始。',
    stage: { booked: '已预订', spa: '已签买卖合约', completed: '已完成', sold: '已售（等待买卖合约）', rented: '已出租', others: '由别人售出', cancelled: '预订已取消' },
    due: { bookingExpiry: '预订到期', targetSpa: '买卖合约目标日期', balanceDue: '余额订金到期', completionDate: '交易完成', tenancyEnd: '租约到期', rentDue: '租金到期' },
    inDays: n => (n === 0 ? '今天' : n === 1 ? '明天' : `${n} 天后`),
    commissionOf: x => `佣金 ${x}`,
  },
  reminderTitle: (what, place) => `${what}：${place}`,
};

export const cc001Strings: Record<Lang, CC001> = { en, bm, zh };
