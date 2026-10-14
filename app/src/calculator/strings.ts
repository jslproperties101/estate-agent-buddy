// Property Calculator text, in three languages.
import type { Lang } from '../i18n';
import { titled3 } from '../lib/titleCase';

const enBase = {
  title: 'Property Calculator',
  fromProperty: (x: string) => `Filled from: ${x}`,
  estimateNote: 'Estimates for discussion only, using the rates under Assumptions. Confirm the final amounts with the lawyer, the bank and LHDN for each case.',
  tabs: { purchase: 'Purchase & loan', rental: 'Rental & ROI', sale: 'Sale', commission: 'Agent commission', assumptions: 'Assumptions' } as Record<string, string>,
  in: {
    price: 'Property price (RM)', downPct: 'Down payment (%)', tenure: 'Loan tenure (years)', rate: 'Interest rate (% a year)',
    buyer: 'Buyer', citizen: 'Malaysian citizen', nonCitizen: 'Foreigner / foreign company', firstHome: 'First home (exemption)',
    valuation: 'Valuation fee (RM)', other: 'Other costs (RM)',
    rent: 'Monthly rent (RM)', maint: 'Maintenance fee (RM a month)', quit: 'Quit rent and assessment (RM a year)', insurance: 'Insurance (RM a year)', otherMonthly: 'Other costs (RM a month)', vacancy: 'Empty months a year',
    salePrice: 'Sale price (RM)', purchasePrice: 'Original purchase price (RM)', purchaseCosts: 'Purchase costs paid then (RM)', years: 'Year of sale (1 = within the first year)',
    loanLeft: 'Outstanding loan (RM)', commPct: 'Agent commission (%)', commSst: 'Add SST on commission', penalty: 'Early settlement penalty (RM)', otherSale: 'Other sale costs (RM)',
    dealValue: 'Price or rent (RM)',
  },
  out: {
    downPayment: 'Down payment', loan: 'Loan amount', monthly: 'Monthly repayment', totalInterest: 'Total interest', totalRepayment: 'Total loan repayment',
    mot: 'Stamp duty: Memorandum of Transfer (MOT)', motExempt: 'Exempt: first home up to the cap', motFlat: (p: number) => `Flat ${p}% for foreign buyers`,
    loanStamp: 'Stamp duty: loan agreement', spaLegal: 'Legal fee: Sale and Purchase Agreement', loanLegal: 'Legal fee: loan agreement', sst: (p: number) => `SST ${p}%`,
    disb: 'Disbursements (searches, registration, copies)', valuation: 'Valuation fee', other: 'Other costs',
    entry: 'Costs on top of the down payment', cash: 'Estimated total cash required',
    tier: (from: string, to: string, pct: number) => `${from} – ${to} at ${pct}%`,
    grossYearly: 'Rent a year', effective: 'Rent a year after empty months', costs: 'Running costs a year', netYearly: 'Net rental income a year',
    grossYield: 'Gross rental yield', netYield: 'Net rental yield', mortgageYearly: 'Loan repayments a year', cashFlow: 'Cash flow after loan', perMonth: 'a month', perYear: 'a year', roi: 'ROI (cash-on-cash)',
    roiHelp: 'Yearly cash flow after loan repayments ÷ the cash required at purchase.',
    commission: 'Agent commission', commissionSst: 'SST on commission', sellerLegal: 'Seller’s legal fee (estimate)', saleCosts: 'Total sale costs',
    gain: 'Gain', rpgtRate: 'RPGT rate', exemption: 'Exemption', chargeable: 'Chargeable gain', rpgt: 'RPGT (estimate)', net: 'Net sale proceeds', afterLoan: 'Cash after paying off the loan',
    fee: 'Commission', total: 'Total with SST',
  },
  as: {
    mot: 'MOT stamp duty tiers (%)', motTier: (n: number) => ['First RM100,000', 'RM100,001 – RM500,000', 'RM500,001 – RM1,000,000', 'Above RM1,000,000'][n] ?? '',
    nonCitizen: 'Foreign buyer flat rate (%)', loanStamp: 'Loan agreement stamp duty (%)',
    legal: 'Legal fee scale (%)', legalTier: (n: number) => ['First RM500,000', 'Next RM7,000,000', 'Above RM7,500,000'][n] ?? '', legalMin: 'Minimum legal fee (RM)',
    sst: 'SST (%)', spaDisb: 'SPA disbursements (RM)', loanDisb: 'Loan disbursements (RM)', firstHomeCap: 'First-home exemption cap (RM)',
    rpgt: 'RPGT by year of sale (%)', rpgtYear: (n: number) => (n < 5 ? `Year ${n + 1}` : 'Year 6 onwards'), rpgtExemptPct: 'RPGT exemption (% of gain)', rpgtExemptMin: 'RPGT exemption minimum (RM)',
    reset: 'Reset to default rates', saved: 'Rates are saved on this phone.',
    sources: 'Defaults: Stamp Act 1949 (MOT 1%/2%/3%/4%, loan 0.5%); first-home exemption for SPAs signed 2021–2027 up to RM500,000; Solicitors’ Remuneration Order 2023; SST 8%; RPGT for citizens 30/30/30/20/15/0%. Check them before relying on a result.',
  },
};

const enX = {
  tab: 'History',
  prop: { label: 'Property', search: 'Search properties (reference, type, place, owner)', none: 'No property selected', clear: 'Clear property', noMatch: 'No property matches.', pick: 'Choose', chosen: (x: string) => `Property: ${x}`, filled: 'Price, rent, maintenance and commission were filled in from the property. Your edits here do not change the property.', many: (n: number) => `${n} properties` },
  client: { label: 'Client', none: 'No client', pick: 'Choose a buyer, tenant or owner' },
  save: { name: 'Name (optional)', button: 'Save calculation', again: 'Save as a new calculation', saved: 'Saved on this phone.', update: 'Save changes', updated: 'Changes saved.', editing: (x: string) => `Editing the saved calculation: ${x}`, newCalc: 'Start a new one' },
  hist: {
    title: 'Saved calculations', empty: 'No saved calculations yet. Fill in a calculation and press Save calculation.', open: 'Open', pdf: 'PDF', del: 'Delete',
    delTitle: 'Delete this saved calculation?', delBody: 'It moves to Recently Deleted and can be restored for 30 days.', filter: 'Show', all: 'All', thisProperty: 'This property', untitled: 'Calculation',
    forProp: (x: string) => `Property: ${x}`, forClient: (x: string) => `Client: ${x}`, noProp: 'No property linked', kind: { purchase: 'Purchase & loan', rental: 'Rental & ROI', sale: 'Sale', commission: 'Agent commission' } as Record<string, string>,
    rates: 'Using the rates saved with this calculation.', useToday: "Use today's rates", savedOn: (x: string) => `Saved ${x}`,
  },
  upd: {
    button: 'Update property record…', title: 'Update the property record?', intro: 'These values from the calculation differ from the property record. Tick the ones to change. Nothing changes until you press Update property.',
    now: 'Now', next: 'New', nothing: 'The property record already has the same values, or this calculation has nothing to update.', apply: 'Update property', cancel: 'Cancel', applied: (n: number) => `Property updated (${n}).`,
    noProp: 'Choose a property first.', summary: 'Updated from a saved calculation', gone: 'The linked property no longer exists.',
    price: 'Asking price', rent: 'Monthly rent', maint: 'Maintenance fee', comm: 'Commission (%)',
  },
  pdf: {
    button: 'Export PDF', title: 'Property calculation', doc: (k: string) => `${k} calculation`, preparedFor: (x: string) => `Prepared for ${x}`, property: 'Property', date: 'Date', inputs: 'Inputs', results: 'Results',
    rates: 'Rates used', ratesNote: 'Malaysian stamp duty, legal fee, SST and RPGT rates as set under Assumptions on the day.', footer: 'Estimate only. Confirm the final amounts with the lawyer, the bank and LHDN.',
    agent: 'Prepared by', file: 'calculation',
  },
};
export type CalcX = typeof enX;
export type CalcStrings = typeof enBase & { x: CalcX };

const bmBase: Omit<CalcStrings, 'x'> = {
  title: 'Kalkulator Hartanah',
  fromProperty: (x: string) => `Diisi daripada: ${x}`,
  estimateNote: 'Anggaran untuk perbincangan sahaja, menggunakan kadar di bawah Andaian. Sahkan jumlah akhir dengan peguam, bank dan LHDN bagi setiap kes.',
  tabs: { purchase: 'Pembelian & pinjaman', rental: 'Sewaan & ROI', sale: 'Jualan', commission: 'Komisen ejen', assumptions: 'Andaian' },
  in: {
    price: 'Harga hartanah (RM)', downPct: 'Bayaran pendahuluan (%)', tenure: 'Tempoh pinjaman (tahun)', rate: 'Kadar faedah (% setahun)',
    buyer: 'Pembeli', citizen: 'Warganegara Malaysia', nonCitizen: 'Warga asing / syarikat asing', firstHome: 'Rumah pertama (pengecualian)',
    valuation: 'Yuran penilaian (RM)', other: 'Kos lain (RM)',
    rent: 'Sewa bulanan (RM)', maint: 'Yuran penyelenggaraan (RM sebulan)', quit: 'Cukai tanah dan taksiran (RM setahun)', insurance: 'Insurans (RM setahun)', otherMonthly: 'Kos lain (RM sebulan)', vacancy: 'Bulan kosong setahun',
    salePrice: 'Harga jualan (RM)', purchasePrice: 'Harga belian asal (RM)', purchaseCosts: 'Kos pembelian yang dibayar dahulu (RM)', years: 'Tahun jualan (1 = dalam tahun pertama)',
    loanLeft: 'Baki pinjaman (RM)', commPct: 'Komisen ejen (%)', commSst: 'Tambah SST pada komisen', penalty: 'Penalti penyelesaian awal (RM)', otherSale: 'Kos jualan lain (RM)',
    dealValue: 'Harga atau sewa (RM)',
  },
  out: {
    downPayment: 'Bayaran pendahuluan', loan: 'Jumlah pinjaman', monthly: 'Bayaran bulanan', totalInterest: 'Jumlah faedah', totalRepayment: 'Jumlah bayaran balik pinjaman',
    mot: 'Duti setem: Memorandum Pindah Milik (MOT)', motExempt: 'Dikecualikan: rumah pertama hingga had', motFlat: (p: number) => `Kadar rata ${p}% untuk pembeli asing`,
    loanStamp: 'Duti setem: perjanjian pinjaman', spaLegal: 'Yuran guaman: Perjanjian Jual Beli', loanLegal: 'Yuran guaman: perjanjian pinjaman', sst: (p: number) => `SST ${p}%`,
    disb: 'Pembayaran luar (carian, pendaftaran, salinan)', valuation: 'Yuran penilaian', other: 'Kos lain',
    entry: 'Kos selain bayaran pendahuluan', cash: 'Anggaran jumlah tunai diperlukan',
    tier: (from: string, to: string, pct: number) => `${from} – ${to} pada ${pct}%`,
    grossYearly: 'Sewa setahun', effective: 'Sewa setahun selepas bulan kosong', costs: 'Kos berjalan setahun', netYearly: 'Pendapatan sewa bersih setahun',
    grossYield: 'Hasil sewa kasar', netYield: 'Hasil sewa bersih', mortgageYearly: 'Bayaran pinjaman setahun', cashFlow: 'Aliran tunai selepas pinjaman', perMonth: 'sebulan', perYear: 'setahun', roi: 'ROI (tunai-ke-tunai)',
    roiHelp: 'Aliran tunai setahun selepas bayaran pinjaman ÷ tunai diperlukan semasa pembelian.',
    commission: 'Komisen ejen', commissionSst: 'SST atas komisen', sellerLegal: 'Yuran guaman penjual (anggaran)', saleCosts: 'Jumlah kos jualan',
    gain: 'Keuntungan', rpgtRate: 'Kadar CKHT', exemption: 'Pengecualian', chargeable: 'Keuntungan boleh dicukai', rpgt: 'CKHT (anggaran)', net: 'Hasil jualan bersih', afterLoan: 'Tunai selepas melunaskan pinjaman',
    fee: 'Komisen', total: 'Jumlah dengan SST',
  },
  as: {
    mot: 'Peringkat duti setem MOT (%)', motTier: (n: number) => ['RM100,000 pertama', 'RM100,001 – RM500,000', 'RM500,001 – RM1,000,000', 'Melebihi RM1,000,000'][n] ?? '',
    nonCitizen: 'Kadar rata pembeli asing (%)', loanStamp: 'Duti setem perjanjian pinjaman (%)',
    legal: 'Skala yuran guaman (%)', legalTier: (n: number) => ['RM500,000 pertama', 'RM7,000,000 berikutnya', 'Melebihi RM7,500,000'][n] ?? '', legalMin: 'Yuran guaman minimum (RM)',
    sst: 'SST (%)', spaDisb: 'Pembayaran luar SPA (RM)', loanDisb: 'Pembayaran luar pinjaman (RM)', firstHomeCap: 'Had pengecualian rumah pertama (RM)',
    rpgt: 'CKHT mengikut tahun jualan (%)', rpgtYear: (n: number) => (n < 5 ? `Tahun ${n + 1}` : 'Tahun 6 dan seterusnya'), rpgtExemptPct: 'Pengecualian CKHT (% keuntungan)', rpgtExemptMin: 'Pengecualian CKHT minimum (RM)',
    reset: 'Kembali ke kadar asal', saved: 'Kadar disimpan dalam telefon ini.',
    sources: 'Asal: Akta Setem 1949 (MOT 1%/2%/3%/4%, pinjaman 0.5%); pengecualian rumah pertama bagi SPA ditandatangani 2021–2027 hingga RM500,000; Perintah Saraan Peguamcara 2023; SST 8%; CKHT warganegara 30/30/30/20/15/0%. Semak sebelum bergantung pada hasil.',
  },
};

const zhBase: Omit<CalcStrings, 'x'> = {
  title: '房产计算器',
  fromProperty: (x: string) => `资料来自：${x}`,
  estimateNote: '仅供讨论的估算，使用“假设”中的费率。每个案例的最终金额请与律师、银行及内陆税收局确认。',
  tabs: { purchase: '购买与贷款', rental: '租金与回报', sale: '出售', commission: '代理佣金', assumptions: '假设' },
  in: {
    price: '房产价格 (RM)', downPct: '首付 (%)', tenure: '贷款年限（年）', rate: '利率（年 %）',
    buyer: '买家', citizen: '马来西亚公民', nonCitizen: '外国人 / 外国公司', firstHome: '首购屋（豁免）',
    valuation: '估价费 (RM)', other: '其他费用 (RM)',
    rent: '月租 (RM)', maint: '管理费（每月 RM）', quit: '地税与门牌税（每年 RM）', insurance: '保险（每年 RM）', otherMonthly: '其他费用（每月 RM）', vacancy: '每年空置月数',
    salePrice: '售价 (RM)', purchasePrice: '原购买价 (RM)', purchaseCosts: '当时支付的购买费用 (RM)', years: '出售年份（1 = 第一年内）',
    loanLeft: '贷款余额 (RM)', commPct: '代理佣金 (%)', commSst: '佣金加收 SST', penalty: '提前还款罚金 (RM)', otherSale: '其他出售费用 (RM)',
    dealValue: '价格或租金 (RM)',
  },
  out: {
    downPayment: '首付', loan: '贷款额', monthly: '每月供款', totalInterest: '总利息', totalRepayment: '贷款总还款',
    mot: '印花税：产权转让书 (MOT)', motExempt: '豁免：首购屋（上限内）', motFlat: (p: number) => `外国买家统一 ${p}%`,
    loanStamp: '印花税：贷款协议', spaLegal: '律师费：买卖合约', loanLegal: '律师费：贷款协议', sst: (p: number) => `SST ${p}%`,
    disb: '杂费（查册、注册、复印）', valuation: '估价费', other: '其他费用',
    entry: '首付以外的费用', cash: '估计所需现金总额',
    tier: (from: string, to: string, pct: number) => `${from} – ${to}，${pct}%`,
    grossYearly: '每年租金', effective: '扣除空置后的年租金', costs: '每年持有成本', netYearly: '每年净租金收入',
    grossYield: '毛租金回报率', netYield: '净租金回报率', mortgageYearly: '每年贷款供款', cashFlow: '扣除供款后的现金流', perMonth: '每月', perYear: '每年', roi: '投资回报率（现金回报）',
    roiHelp: '每年扣除供款后的现金流 ÷ 购买时所需现金。',
    commission: '代理佣金', commissionSst: '佣金 SST', sellerLegal: '卖方律师费（估算）', saleCosts: '出售总费用',
    gain: '收益', rpgtRate: '产业盈利税率', exemption: '豁免', chargeable: '应课税收益', rpgt: '产业盈利税（估算）', net: '出售净所得', afterLoan: '还清贷款后的现金',
    fee: '佣金', total: '含 SST 总额',
  },
  as: {
    mot: 'MOT 印花税分级 (%)', motTier: (n: number) => ['首 RM100,000', 'RM100,001 – RM500,000', 'RM500,001 – RM1,000,000', '超过 RM1,000,000'][n] ?? '',
    nonCitizen: '外国买家统一税率 (%)', loanStamp: '贷款协议印花税 (%)',
    legal: '律师费比例 (%)', legalTier: (n: number) => ['首 RM500,000', '其后 RM7,000,000', '超过 RM7,500,000'][n] ?? '', legalMin: '最低律师费 (RM)',
    sst: 'SST (%)', spaDisb: '买卖合约杂费 (RM)', loanDisb: '贷款杂费 (RM)', firstHomeCap: '首购屋豁免上限 (RM)',
    rpgt: '按出售年份的产业盈利税 (%)', rpgtYear: (n: number) => (n < 5 ? `第 ${n + 1} 年` : '第 6 年起'), rpgtExemptPct: '产业盈利税豁免（收益 %）', rpgtExemptMin: '产业盈利税最低豁免 (RM)',
    reset: '恢复默认费率', saved: '费率已保存在此手机。',
    sources: '默认值：1949 年印花税法（MOT 1%/2%/3%/4%，贷款 0.5%）；2021–2027 年签署、RM500,000 以内的首购屋豁免；2023 年律师酬金令；SST 8%；公民产业盈利税 30/30/30/20/15/0%。依赖结果前请先核实。',
  },
};


const bmX: CalcX = {
  tab: 'Sejarah',
  prop: { label: 'Hartanah', search: 'Cari hartanah (rujukan, jenis, tempat, pemilik)', none: 'Tiada hartanah dipilih', clear: 'Kosongkan hartanah', noMatch: 'Tiada hartanah sepadan.', pick: 'Pilih', chosen: (x: string) => `Hartanah: ${x}`, filled: 'Harga, sewa, penyelenggaraan dan komisen diisi daripada hartanah. Suntingan anda di sini tidak mengubah hartanah.', many: (n: number) => `${n} hartanah` },
  client: { label: 'Pelanggan', none: 'Tiada pelanggan', pick: 'Pilih pembeli, penyewa atau pemilik' },
  save: { name: 'Nama (pilihan)', button: 'Simpan pengiraan', again: 'Simpan sebagai pengiraan baharu', saved: 'Disimpan pada telefon ini.', update: 'Simpan perubahan', updated: 'Perubahan disimpan.', editing: (x: string) => `Menyunting pengiraan tersimpan: ${x}`, newCalc: 'Mulakan yang baharu' },
  hist: {
    title: 'Pengiraan tersimpan', empty: 'Belum ada pengiraan tersimpan. Isi satu pengiraan dan tekan Simpan pengiraan.', open: 'Buka', pdf: 'PDF', del: 'Padam',
    delTitle: 'Padam pengiraan tersimpan ini?', delBody: 'Ia dipindahkan ke Baru Dipadam dan boleh dipulihkan selama 30 hari.', filter: 'Papar', all: 'Semua', thisProperty: 'Hartanah ini', untitled: 'Pengiraan',
    forProp: (x: string) => `Hartanah: ${x}`, forClient: (x: string) => `Pelanggan: ${x}`, noProp: 'Tiada hartanah dipautkan', kind: { purchase: 'Pembelian & pinjaman', rental: 'Sewaan & ROI', sale: 'Jualan', commission: 'Komisen ejen' },
    rates: 'Menggunakan kadar yang disimpan bersama pengiraan ini.', useToday: 'Guna kadar semasa', savedOn: (x: string) => `Disimpan ${x}`,
  },
  upd: {
    button: 'Kemas kini rekod hartanah…', title: 'Kemas kini rekod hartanah?', intro: 'Nilai daripada pengiraan ini berbeza daripada rekod hartanah. Tanda yang hendak diubah. Tiada apa berubah sehingga anda tekan Kemas kini hartanah.',
    now: 'Sekarang', next: 'Baharu', nothing: 'Rekod hartanah sudah mempunyai nilai yang sama, atau pengiraan ini tiada apa untuk dikemas kini.', apply: 'Kemas kini hartanah', cancel: 'Batal', applied: (n: number) => `Hartanah dikemas kini (${n}).`,
    noProp: 'Pilih hartanah dahulu.', summary: 'Dikemas kini daripada pengiraan tersimpan', gone: 'Hartanah yang dipautkan sudah tiada.',
    price: 'Harga diminta', rent: 'Sewa bulanan', maint: 'Yuran penyelenggaraan', comm: 'Komisen (%)',
  },
  pdf: {
    button: 'Eksport PDF', title: 'Pengiraan hartanah', doc: (k: string) => `Pengiraan ${k}`, preparedFor: (x: string) => `Disediakan untuk ${x}`, property: 'Hartanah', date: 'Tarikh', inputs: 'Input', results: 'Keputusan',
    rates: 'Kadar digunakan', ratesNote: 'Kadar duti setem, yuran guaman, SST dan RPGT Malaysia seperti ditetapkan di bawah Andaian pada hari itu.', footer: 'Anggaran sahaja. Sahkan jumlah akhir dengan peguam, bank dan LHDN.',
    agent: 'Disediakan oleh', file: 'pengiraan',
  },
};

const zhX: CalcX = {
  tab: '记录',
  prop: { label: '房产', search: '搜索房产（编号、类型、地点、业主）', none: '未选择房产', clear: '清除房产', noMatch: '没有匹配的房产。', pick: '选择', chosen: (x: string) => `房产：${x}`, filled: '价格、租金、管理费和佣金已从房产带入。您在此处的修改不会更改房产。', many: (n: number) => `${n} 个房产` },
  client: { label: '客户', none: '无客户', pick: '选择买家、租客或业主' },
  save: { name: '名称（可选）', button: '保存计算', again: '另存为新计算', saved: '已保存在这部手机上。', update: '保存更改', updated: '更改已保存。', editing: (x: string) => `正在编辑已保存的计算：${x}`, newCalc: '开始新的计算' },
  hist: {
    title: '已保存的计算', empty: '还没有已保存的计算。填写计算后按“保存计算”。', open: '打开', pdf: 'PDF', del: '删除',
    delTitle: '删除这个已保存的计算？', delBody: '它会移到“最近删除”，30 天内可恢复。', filter: '显示', all: '全部', thisProperty: '此房产', untitled: '计算',
    forProp: (x: string) => `房产：${x}`, forClient: (x: string) => `客户：${x}`, noProp: '未关联房产', kind: { purchase: '购买与贷款', rental: '租金与回报', sale: '出售', commission: '代理佣金' },
    rates: '正在使用随此计算保存的税率。', useToday: '使用当前税率', savedOn: (x: string) => `保存于 ${x}`,
  },
  upd: {
    button: '更新房产记录…', title: '更新房产记录？', intro: '计算中的这些数值与房产记录不同。勾选要更改的项目。按“更新房产”之前不会有任何更改。',
    now: '现在', next: '新值', nothing: '房产记录已是相同的数值，或此计算没有可更新的内容。', apply: '更新房产', cancel: '取消', applied: (n: number) => `房产已更新（${n}）。`,
    noProp: '请先选择房产。', summary: '根据已保存的计算更新', gone: '关联的房产已不存在。',
    price: '开价', rent: '月租', maint: '管理费', comm: '佣金（%）',
  },
  pdf: {
    button: '导出 PDF', title: '房产计算', doc: (k: string) => `${k}计算`, preparedFor: (x: string) => `为 ${x} 准备`, property: '房产', date: '日期', inputs: '输入', results: '结果',
    rates: '所用税率', ratesNote: '马来西亚印花税、律师费、SST 和 RPGT 税率，按当天“假设”中的设置。', footer: '仅为估算。请与律师、银行和 LHDN 确认最终金额。',
    agent: '制备人', file: '计算',
  },
};
const en: CalcStrings = { ...enBase, x: enX };
const bm: CalcStrings = { ...bmBase, x: bmX };
const zh: CalcStrings = { ...zhBase, x: zhX };
export const calcStrings: Record<Lang, CalcStrings> = titled3({ en, bm, zh });
