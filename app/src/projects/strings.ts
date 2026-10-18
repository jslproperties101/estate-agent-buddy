// The Project feature's words, in English, Bahasa Malaysia and Chinese.
import type { Lang } from '../i18n';

const en = {
  title: 'Projects', add: 'Add new project', newTitle: 'New project', editTitle: 'Edit project', empty: 'No projects yet. Add a new development to keep its unit types, prices and bookings together.',
  search: 'Search name, developer or place', none: 'No project matches.', open: 'Open',
  status: { upcoming: 'Upcoming', launched: 'Launched', selling: 'Selling', sold_out: 'Sold out', completed: 'Completed' } as Record<string, string>,
  booking: { reserved: 'Reserved', booked: 'Booked', pending_loan: 'Booked - Pending Loan', spa_signed: 'SPA Signed', cancelled: 'Cancelled' } as Record<string, string>,
  f: {
    name: 'Project name', developer: 'Developer', developerContact: 'Developer contact person', developerPhone: 'Developer phone',
    state: 'State', city: 'City', township: 'Township', address: 'Address', tenure: 'Tenure', status: 'Project status',
    launchDate: 'Launch (month)', completionDate: 'Expected completion (month)', launchNotes: 'Launch details (rebates, packages, terms)',
    commissionPct: 'Your commission (%)', notes: 'Internal notes',
  },
  tenure: { freehold: 'Freehold', leasehold: 'Leasehold' } as Record<string, string>,
  sec: { about: 'Project', launch: 'Launch details', units: 'Unit types and prices', bookings: 'Bookings' },
  u: { name: 'Unit type name', layout: 'Property type', builtUp: 'Built-up (sq ft)', land: 'Land size (sq ft)', beds: 'Bedrooms', baths: 'Bathrooms',
    priceFrom: 'Price from (RM)', priceTo: 'Price to (RM)', units: 'Number of units', add: 'Add unit type', remove: 'Remove', namePh: 'e.g. Type A (22 × 75)' },
  b: { add: 'Add booking', edit: 'Edit booking', unitType: 'Unit type', unitNo: 'Unit number', buyer: 'Buyer', buyerNone: 'Not a saved buyer', buyerName: 'Buyer name',
    buyerPhone: 'Buyer phone', status: 'Booking status', bookedOn: 'Booking date', price: 'Price (RM)', fee: 'Booking fee (RM)', note: 'Note',
    taken: 'This unit number is already booked in this project.', unitRequired: 'Type the unit number.', none: 'No bookings yet.', anyType: 'Not set', delete: 'Delete booking', deleteQ: 'Delete this booking?' },
  priceRange: (a: string, b?: string) => (b && b !== a ? `${a} – ${b}` : a), noPrice: 'Price not set',
  counts: (booked: number, total?: number) => (total !== undefined ? `${booked} of ${total} units booked` : `${booked} booked`),
  left: (n: number) => `${n} left`, commission: (rm: string) => `Your commission: ${rm}`,
  nameRequired: 'Type the project name.', saved: 'Project saved.', deleteQ: 'Delete this project?', deleteBody: 'Its unit types and bookings are deleted with it.', delete: 'Delete project',
  units: (n: number) => `${n} unit types`,
};
export type ProjectStrings = typeof en;

const bm: ProjectStrings = {
  title: 'Projek', add: 'Tambah projek baharu', newTitle: 'Projek baharu', editTitle: 'Ubah projek', empty: 'Belum ada projek. Tambah pembangunan baharu untuk menyimpan jenis unit, harga dan tempahannya bersama.',
  search: 'Cari nama, pemaju atau tempat', none: 'Tiada projek sepadan.', open: 'Buka',
  status: { upcoming: 'Akan datang', launched: 'Dilancarkan', selling: 'Sedang dijual', sold_out: 'Habis dijual', completed: 'Siap' },
  booking: { reserved: 'Ditahan', booked: 'Ditempah', pending_loan: 'Ditempah - Menunggu Pinjaman', spa_signed: 'SPA Ditandatangani', cancelled: 'Dibatalkan' },
  f: {
    name: 'Nama projek', developer: 'Pemaju', developerContact: 'Pegawai pemaju', developerPhone: 'Telefon pemaju',
    state: 'Negeri', city: 'Bandar', township: 'Taman', address: 'Alamat', tenure: 'Pegangan', status: 'Status projek',
    launchDate: 'Pelancaran (bulan)', completionDate: 'Jangka siap (bulan)', launchNotes: 'Butiran pelancaran (rebat, pakej, syarat)',
    commissionPct: 'Komisen anda (%)', notes: 'Catatan dalaman',
  },
  tenure: { freehold: 'Pegangan bebas', leasehold: 'Pajakan' },
  sec: { about: 'Projek', launch: 'Butiran pelancaran', units: 'Jenis unit dan harga', bookings: 'Tempahan' },
  u: { name: 'Nama jenis unit', layout: 'Jenis hartanah', builtUp: 'Binaan (kps)', land: 'Saiz tanah (kps)', beds: 'Bilik tidur', baths: 'Bilik air',
    priceFrom: 'Harga dari (RM)', priceTo: 'Harga hingga (RM)', units: 'Bilangan unit', add: 'Tambah jenis unit', remove: 'Buang', namePh: 'cth. Jenis A (22 × 75)' },
  b: { add: 'Tambah tempahan', edit: 'Ubah tempahan', unitType: 'Jenis unit', unitNo: 'Nombor unit', buyer: 'Pembeli', buyerNone: 'Bukan pembeli tersimpan', buyerName: 'Nama pembeli',
    buyerPhone: 'Telefon pembeli', status: 'Status tempahan', bookedOn: 'Tarikh tempahan', price: 'Harga (RM)', fee: 'Yuran tempahan (RM)', note: 'Catatan',
    taken: 'Nombor unit ini sudah ditempah dalam projek ini.', unitRequired: 'Taip nombor unit.', none: 'Belum ada tempahan.', anyType: 'Belum ditetapkan', delete: 'Padam tempahan', deleteQ: 'Padam tempahan ini?' },
  priceRange: (a, b) => (b && b !== a ? `${a} – ${b}` : a), noPrice: 'Harga belum ditetapkan',
  counts: (booked, total) => (total !== undefined ? `${booked} daripada ${total} unit ditempah` : `${booked} ditempah`),
  left: n => `${n} tinggal`, commission: rm => `Komisen anda: ${rm}`,
  nameRequired: 'Taip nama projek.', saved: 'Projek disimpan.', deleteQ: 'Padam projek ini?', deleteBody: 'Jenis unit dan tempahannya dipadam bersama.', delete: 'Padam projek',
  units: n => `${n} jenis unit`,
};

const zh: ProjectStrings = {
  title: '新项目', add: '新增项目', newTitle: '新项目', editTitle: '编辑项目', empty: '还没有项目。新增一个发展项目，把单位类型、价格和预订集中记录。',
  search: '搜索名称、发展商或地点', none: '没有符合的项目。', open: '打开',
  status: { upcoming: '即将推出', launched: '已推出', selling: '销售中', sold_out: '已售罄', completed: '已完工' },
  booking: { reserved: '已保留', booked: '已预订', pending_loan: '已预订 - 等待贷款', spa_signed: '已签买卖合约', cancelled: '已取消' },
  f: {
    name: '项目名称', developer: '发展商', developerContact: '发展商联系人', developerPhone: '发展商电话',
    state: '州属', city: '城市', township: '花园', address: '地址', tenure: '地契', status: '项目状态',
    launchDate: '推出（月份）', completionDate: '预计完工（月份）', launchNotes: '推出详情（回扣、配套、条件）',
    commissionPct: '您的佣金 (%)', notes: '内部备注',
  },
  tenure: { freehold: '永久地契', leasehold: '租赁地契' },
  sec: { about: '项目', launch: '推出详情', units: '单位类型与价格', bookings: '预订' },
  u: { name: '单位类型名称', layout: '房产类型', builtUp: '建筑面积（平方尺）', land: '土地面积（平方尺）', beds: '卧室', baths: '浴室',
    priceFrom: '起价 (RM)', priceTo: '最高价 (RM)', units: '单位数量', add: '新增单位类型', remove: '移除', namePh: '例如 A 型 (22 × 75)' },
  b: { add: '新增预订', edit: '编辑预订', unitType: '单位类型', unitNo: '单位号码', buyer: '买家', buyerNone: '不是已存买家', buyerName: '买家姓名',
    buyerPhone: '买家电话', status: '预订状态', bookedOn: '预订日期', price: '价格 (RM)', fee: '订金 (RM)', note: '备注',
    taken: '此单位号码在本项目中已被预订。', unitRequired: '请输入单位号码。', none: '还没有预订。', anyType: '未设置', delete: '删除预订', deleteQ: '删除这项预订？' },
  priceRange: (a, b) => (b && b !== a ? `${a} – ${b}` : a), noPrice: '价格未设置',
  counts: (booked, total) => (total !== undefined ? `已预订 ${booked} / ${total} 个单位` : `已预订 ${booked} 个`),
  left: n => `剩余 ${n} 个`, commission: rm => `您的佣金：${rm}`,
  nameRequired: '请输入项目名称。', saved: '项目已保存。', deleteQ: '删除此项目？', deleteBody: '其单位类型和预订会一并删除。', delete: '删除项目',
  units: n => `${n} 种单位类型`,
};

export const projectStrings: Record<Lang, ProjectStrings> = { en, bm, zh };
