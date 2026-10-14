// Agent Financial text, in three languages.
import type { Lang } from '../i18n';
import { titled3 } from '../lib/titleCase';

const en = {
  title: 'Agent Financial',
  month: 'Month', year: 'Year', prev: 'Previous period', next: 'Next period',
  received: 'Income received', commission: 'Commission received', otherIncome: 'Other income', expenses: 'Expenses', net: 'Net income',
  outstanding: 'Outstanding commissions', outstandingConfirmed: (x: string) => `${x} confirmed, waiting for payment`,
  completed: 'Completed deals', dealValue: (x: string) => `Total value ${x}`,
  target: 'Target', setTarget: 'Set target', targetFor: (p: string) => `Target for ${p} (RM)`, progress: (p: number) => `${p}% of target`, noTarget: 'No target set for this period.',
  byCategory: 'Expenses by category', monthly: 'Income received each month',
  deals: 'Deals and commissions', addDeal: '+ Deal', noDeals: 'No deals recorded.',
  expenseList: 'Expenses', addExpense: '+ Expense', noExpenses: 'No expenses in this period.',
  incomeList: 'Other income', addIncome: '+ Income', noIncome: 'No other income in this period.',
  dealStatus: { estimated: 'Estimated', confirmed: 'Confirmed', received: 'Received' } as Record<string, string>,
  side: { sale: 'Sale', rent: 'Rental' } as Record<string, string>,
  f: {
    title: 'Deal name', property: 'Property', contact: 'Client', side: 'Sale or rental', date: 'Deal date', value: 'Price or rent (RM)', pct: 'Commission rate (%)',
    commission: 'Total commission (RM)', share: 'My share (%)', mine: (x: string) => `My commission: ${x}`, status: 'Status', receivedDate: 'Date received', receivedAmount: 'Amount received (RM)',
    notes: 'Notes', category: 'Category', amount: 'Amount (RM)', note: 'Note', source: 'Source',
  },
  newDeal: 'New deal', editDeal: 'Edit deal', newExpense: 'New expense', editExpense: 'Edit expense', newIncome: 'New income', editIncome: 'Edit income',
  calcHint: 'Fill the price and rate to calculate the commission, or type the commission yourself.',
  expenseCats: { 'Fuel': 'Fuel', 'Toll and parking': 'Toll and parking', 'Advertising': 'Advertising', 'Phone and internet': 'Phone and internet', 'Printing': 'Printing', 'Client meals': 'Client meals', 'Licence and training': 'Licence and training', 'Office': 'Office', 'Transport': 'Transport' } as Record<string, string>,
  incomeSources: { 'Commission': 'Commission', 'Referral fee': 'Referral fee', 'Rental management': 'Rental management', 'Consultancy': 'Consultancy' } as Record<string, string>,
  required: 'Fill the amount first.',
};
export type FinanceStrings = typeof en;

const bm: FinanceStrings = {
  title: 'Kewangan Ejen',
  month: 'Bulan', year: 'Tahun', prev: 'Tempoh sebelumnya', next: 'Tempoh seterusnya',
  received: 'Pendapatan diterima', commission: 'Komisen diterima', otherIncome: 'Pendapatan lain', expenses: 'Perbelanjaan', net: 'Pendapatan bersih',
  outstanding: 'Komisen tertunggak', outstandingConfirmed: (x: string) => `${x} disahkan, menunggu bayaran`,
  completed: 'Urusan selesai', dealValue: (x: string) => `Jumlah nilai ${x}`,
  target: 'Sasaran', setTarget: 'Tetapkan sasaran', targetFor: (p: string) => `Sasaran untuk ${p} (RM)`, progress: (p: number) => `${p}% daripada sasaran`, noTarget: 'Tiada sasaran ditetapkan untuk tempoh ini.',
  byCategory: 'Perbelanjaan mengikut kategori', monthly: 'Pendapatan diterima setiap bulan',
  deals: 'Urusan dan komisen', addDeal: '+ Urusan', noDeals: 'Tiada urusan direkodkan.',
  expenseList: 'Perbelanjaan', addExpense: '+ Perbelanjaan', noExpenses: 'Tiada perbelanjaan dalam tempoh ini.',
  incomeList: 'Pendapatan lain', addIncome: '+ Pendapatan', noIncome: 'Tiada pendapatan lain dalam tempoh ini.',
  dealStatus: { estimated: 'Anggaran', confirmed: 'Disahkan', received: 'Diterima' },
  side: { sale: 'Jualan', rent: 'Sewaan' },
  f: {
    title: 'Nama urusan', property: 'Hartanah', contact: 'Pelanggan', side: 'Jualan atau sewaan', date: 'Tarikh urusan', value: 'Harga atau sewa (RM)', pct: 'Kadar komisen (%)',
    commission: 'Jumlah komisen (RM)', share: 'Bahagian saya (%)', mine: (x: string) => `Komisen saya: ${x}`, status: 'Status', receivedDate: 'Tarikh diterima', receivedAmount: 'Jumlah diterima (RM)',
    notes: 'Catatan', category: 'Kategori', amount: 'Jumlah (RM)', note: 'Catatan', source: 'Sumber',
  },
  newDeal: 'Urusan baharu', editDeal: 'Ubah urusan', newExpense: 'Perbelanjaan baharu', editExpense: 'Ubah perbelanjaan', newIncome: 'Pendapatan baharu', editIncome: 'Ubah pendapatan',
  calcHint: 'Isi harga dan kadar untuk mengira komisen, atau taip komisen sendiri.',
  expenseCats: { 'Fuel': 'Minyak', 'Toll and parking': 'Tol dan parkir', 'Advertising': 'Pengiklanan', 'Phone and internet': 'Telefon dan internet', 'Printing': 'Percetakan', 'Client meals': 'Makan bersama pelanggan', 'Licence and training': 'Lesen dan latihan', 'Office': 'Pejabat', 'Transport': 'Pengangkutan' },
  incomeSources: { 'Commission': 'Komisen', 'Referral fee': 'Yuran rujukan', 'Rental management': 'Pengurusan sewaan', 'Consultancy': 'Perundingan' },
  required: 'Isi jumlah dahulu.',
};

const zh: FinanceStrings = {
  title: '代理财务',
  month: '月', year: '年', prev: '上一期', next: '下一期',
  received: '已收入', commission: '已收佣金', otherIncome: '其他收入', expenses: '开支', net: '净收入',
  outstanding: '未收佣金', outstandingConfirmed: (x: string) => `已确认 ${x}，等待付款`,
  completed: '已完成交易', dealValue: (x: string) => `总值 ${x}`,
  target: '目标', setTarget: '设定目标', targetFor: (p: string) => `${p} 的目标 (RM)`, progress: (p: number) => `达成目标的 ${p}%`, noTarget: '此期间未设定目标。',
  byCategory: '按类别的开支', monthly: '每月已收入',
  deals: '交易与佣金', addDeal: '+ 交易', noDeals: '没有交易记录。',
  expenseList: '开支', addExpense: '+ 开支', noExpenses: '此期间没有开支。',
  incomeList: '其他收入', addIncome: '+ 收入', noIncome: '此期间没有其他收入。',
  dealStatus: { estimated: '估计', confirmed: '已确认', received: '已收到' },
  side: { sale: '买卖', rent: '租赁' },
  f: {
    title: '交易名称', property: '房产', contact: '客户', side: '买卖或租赁', date: '交易日期', value: '价格或租金 (RM)', pct: '佣金率 (%)',
    commission: '总佣金 (RM)', share: '我的分成 (%)', mine: (x: string) => `我的佣金：${x}`, status: '状态', receivedDate: '收款日期', receivedAmount: '收到金额 (RM)',
    notes: '备注', category: '类别', amount: '金额 (RM)', note: '备注', source: '来源',
  },
  newDeal: '新交易', editDeal: '编辑交易', newExpense: '新开支', editExpense: '编辑开支', newIncome: '新收入', editIncome: '编辑收入',
  calcHint: '填写价格和佣金率可自动计算佣金，或自行输入佣金。',
  expenseCats: { 'Fuel': '油费', 'Toll and parking': '过路费与停车费', 'Advertising': '广告', 'Phone and internet': '电话与网络', 'Printing': '印刷', 'Client meals': '客户餐饮', 'Licence and training': '执照与培训', 'Office': '办公室', 'Transport': '交通' },
  incomeSources: { 'Commission': '佣金', 'Referral fee': '介绍费', 'Rental management': '租赁管理', 'Consultancy': '咨询' },
  required: '请先填写金额。',
};

export const financeStrings: Record<Lang, FinanceStrings> = titled3({ en, bm, zh });
