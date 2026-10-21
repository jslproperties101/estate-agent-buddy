// ClaudeChanges001 change 11 (owner, 17 Oct 2026): Booking, Sale and Rental details for a property, Track My Sales and
// the deal reminders. Everything is kept on the property record (Listing.deal), so it syncs, backs up and has history like
// any other detail; no new table and no database change. Files go into the property's documents as "transaction"
// documents (confidential: in the owner's own backups only, never in the shared team bucket).
import type { Lang } from '../i18n';
import type { Listing } from '../listing/model';
import { commissionRm, rentCommissionRm } from '../listing/model';

/** A person on a deal page: name, phone and WhatsApp username, like the property's owner box. */
export interface DealPerson { name?: string; phone?: string; whatsapp?: string; contactId?: string }
/** One row of a list field (viewing dates, offer history). */
export type DealRow = Record<string, string | number | undefined>;
export type DealValue = string | number | boolean | DealPerson | DealRow[];
export type DealSection = 'booking' | 'sale' | 'rental' | 'others';

export interface Deal {
  booking?: Record<string, DealValue>;
  /** Sold by me: legal, money and documents. */
  sale?: Record<string, DealValue>;
  rental?: Record<string, DealValue>;
  /** Sold by others: the agency and the price. */
  others?: Record<string, DealValue>;
  soldBy?: 'me' | 'others';
  /** The agent's own booking fields ("Add my own fields"); the names are shared, each property keeps its own values. */
  custom?: Record<string, string>;
}
/** The other agent when a listing is a Co-broke (change 10). */
export interface CoBroke { name?: string; agency?: string; phone?: string; whatsapp?: string; contactId?: string }

// ---------- the agreed field lists ----------
type Text3 = Record<Lang, string>;
const L = (en: string, bm: string, zh: string): Text3 => ({ en, bm, zh });

export type FieldType = 'text' | 'textarea' | 'money' | 'number' | 'date' | 'select' | 'yesno' | 'person' | 'rows' | 'files';
export interface FieldSpec {
  key: string;
  type: FieldType;
  label: Text3;
  /** select: the built-in values, each with its label (the agent can add others, remembered per agent). */
  options?: { value: string; label: Text3 }[];
  /** rows: the columns of each row. */
  columns?: { key: string; type: 'date' | 'money' | 'text' | 'select'; label: Text3; options?: { value: string; label: Text3 }[] }[];
  /** A date that goes into the Calendar with reminders. */
  reminder?: boolean;
  /** Shown only when this other field has one of these values. */
  when?: { key: string; is: string[] };
}
export interface GroupSpec { id: string; title: Text3; fields: FieldSpec[] }

const O = (value: string, en: string, bm: string, zh: string) => ({ value, label: L(en, bm, zh) });

const buyerFields = (p: 'buyer' | 'buyer2', n: Text3): FieldSpec[] => [
  { key: p, type: 'person', label: n },
  { key: `${p}Id`, type: 'text', label: L('IC / Passport Number', 'Nombor IC / Pasport', '身份证 / 护照号码') },
  { key: `${p}Address`, type: 'textarea', label: L('Address', 'Alamat', '地址') },
  { key: `${p}Email`, type: 'text', label: L('Email', 'E-mel', '电邮') },
  { key: `${p}Nationality`, type: 'select', label: L('Nationality', 'Warganegara', '国籍'), options: [O('malaysian', 'Malaysian', 'Warganegara Malaysia', '马来西亚公民'), O('foreign', 'Foreign', 'Warga Asing', '外国人')] },
  { key: `${p}FirstTime`, type: 'yesno', label: L('First-Time Buyer', 'Pembeli Kali Pertama', '首次购房者') },
];

export const BOOKING: GroupSpec[] = [
  { id: 'buyers', title: L('Buyers', 'Pembeli', '买家'), fields: [
    ...buyerFields('buyer', L('Buyer / Tenant', 'Pembeli / Penyewa', '买家 / 租户')),
    ...buyerFields('buyer2', L('Second Buyer', 'Pembeli Kedua', '第二买家')),
    { key: 'purchasePurpose', type: 'select', label: L('Purchase Purpose', 'Tujuan Pembelian', '购买用途'), options: [O('own_stay', 'Own Stay', 'Duduk Sendiri', '自住'), O('investment', 'Investment', 'Pelaburan', '投资')] },
    { key: 'income', type: 'money', label: L('Monthly Income (RM)', 'Pendapatan Bulanan (RM)', '月收入 (RM)') },
    { key: 'employer', type: 'text', label: L('Employer', 'Majikan', '雇主') },
    { key: 'propertiesOwned', type: 'number', label: L('Properties Already Owned', 'Hartanah Sedia Dimiliki', '已拥有房产数量') },
    { key: 'moveIn', type: 'date', label: L('Preferred Move-In Date', 'Tarikh Masuk Pilihan', '希望入住日期') },
  ] },
  { id: 'deal', title: L('Deal', 'Urusan', '交易'), fields: [
    { key: 'leadSource', type: 'select', label: L('Lead Source', 'Sumber Prospek', '客户来源'), options: [O('portal', 'Property Portal', 'Portal Hartanah', '房产网站'), O('referral', 'Referral', 'Rujukan', '介绍'), O('walk_in', 'Walk-In', 'Datang Sendiri', '上门'), O('social', 'Social Media', 'Media Sosial', '社交媒体'), O('banner', 'Banner', 'Banner', '横幅')] },
    { key: 'viewings', type: 'rows', label: L('Viewing Dates', 'Tarikh Tinjauan', '看房日期'), columns: [{ key: 'date', type: 'date', label: L('Date', 'Tarikh', '日期') }] },
    { key: 'offers', type: 'rows', label: L('Offer History', 'Sejarah Tawaran', '出价记录'), columns: [
      { key: 'date', type: 'date', label: L('Date', 'Tarikh', '日期') },
      { key: 'amount', type: 'money', label: L('Amount (RM)', 'Jumlah (RM)', '金额 (RM)') },
      { key: 'by', type: 'select', label: L('Offer By', 'Tawaran Oleh', '出价方'), options: [O('buyer', 'Buyer', 'Pembeli', '买家'), O('owner', 'Owner (Counter-Offer)', 'Pemilik (Tawaran Balas)', '业主（还价）')] },
    ] },
    { key: 'agreedPrice', type: 'money', label: L('Agreed Price (RM)', 'Harga Dipersetujui (RM)', '成交价 (RM)') },
    { key: 'bookingFee', type: 'money', label: L('Booking Fee (RM)', 'Yuran Tempahan (RM)', '订金 (RM)') },
    { key: 'bookingDate', type: 'date', label: L('Booking Date', 'Tarikh Tempahan', '预订日期') },
    { key: 'paymentMethod', type: 'select', label: L('Booking Fee Paid By', 'Yuran Tempahan Dibayar Melalui', '订金支付方式'), options: [O('transfer', 'Bank Transfer', 'Pindahan Bank', '银行转账'), O('cheque', 'Cheque', 'Cek', '支票'), O('cash', 'Cash', 'Tunai', '现金')] },
    { key: 'balanceDeposit', type: 'money', label: L('Balance Deposit (RM)', 'Baki Deposit (RM)', '余额订金 (RM)') },
    { key: 'balanceDue', type: 'date', label: L('Balance Deposit Due', 'Baki Deposit Perlu Dibayar', '余额订金到期日'), reminder: true },
    { key: 'stakeholder', type: 'select', label: L('Stakeholder (Holds the Booking Fee)', 'Pemegang Amanah (Memegang Yuran Tempahan)', '订金保管方'), options: [O('agency', 'Agency', 'Agensi', '中介公司'), O('lawyer', 'Lawyer', 'Peguam', '律师'), O('owner', 'Owner', 'Pemilik', '业主')] },
    { key: 'agreedCommission', type: 'money', label: L('Agreed Commission (RM)', 'Komisen Dipersetujui (RM)', '约定佣金 (RM)') },
    { key: 'buyerCobroke', type: 'person', label: L('Buyer’s Co-broke Agent', 'Ejen Co-broke Pembeli', '买方联合代理经纪人') },
    { key: 'buyerCobrokeAgency', type: 'text', label: L('Buyer’s Co-broke Agency', 'Agensi Co-broke Pembeli', '买方联合代理公司') },
  ] },
  { id: 'financing', title: L('Financing', 'Pembiayaan', '融资'), fields: [
    { key: 'payment', type: 'select', label: L('Cash or Loan', 'Tunai atau Pinjaman', '现金或贷款'), options: [O('cash', 'Cash Buyer', 'Pembeli Tunai', '现金买家'), O('loan', 'Loan', 'Pinjaman', '贷款')] },
    { key: 'loanBank', type: 'text', label: L('Loan Bank', 'Bank Pinjaman', '贷款银行'), when: { key: 'payment', is: ['loan'] } },
    { key: 'panelLawyer', type: 'person', label: L('Bank Panel Lawyer', 'Peguam Panel Bank', '银行指定律师') },
    { key: 'panelLawyerFirm', type: 'text', label: L('Bank Panel Lawyer Firm', 'Firma Peguam Panel Bank', '银行指定律师事务所') },
  ] },
  { id: 'paperwork', title: L('Paperwork', 'Dokumen', '文件'), fields: [
    { key: 'ownerAccepted', type: 'date', label: L('Owner Acceptance Date', 'Tarikh Pemilik Menerima', '业主接受日期') },
    { key: 'specialTerms', type: 'textarea', label: L('Special Terms', 'Syarat Khas', '特别条款') },
    { key: 'files', type: 'files', label: L('Booking Form and Receipt', 'Borang Tempahan dan Resit', '订房表格与收据') },
  ] },
  { id: 'reminders', title: L('Reminders', 'Peringatan', '提醒'), fields: [
    { key: 'bookingExpiry', type: 'date', label: L('Booking Expiry', 'Tempahan Tamat', '预订到期日'), reminder: true },
    { key: 'targetSpa', type: 'date', label: L('Target SPA Date', 'Sasaran Tarikh SPA', '买卖合约目标日期'), reminder: true },
  ] },
  { id: 'outcome', title: L('Outcome', 'Keputusan', '结果'), fields: [
    { key: 'outcome', type: 'select', label: L('Booking Outcome', 'Keputusan Tempahan', '预订结果'), options: [O('booked', 'Booked', 'Telah Ditempah', '已预订'), O('cancelled', 'Cancelled', 'Dibatalkan', '已取消'), O('refunded', 'Refunded', 'Dipulangkan', '已退款'), O('forfeited', 'Forfeited', 'Dilucuthakkan', '已没收')] },
    { key: 'cancelReason', type: 'textarea', label: L('Cancellation Reason', 'Sebab Pembatalan', '取消原因'), when: { key: 'outcome', is: ['cancelled', 'refunded', 'forfeited'] } },
    { key: 'notes', type: 'textarea', label: L('Notes', 'Catatan', '备注') },
  ] },
];

const lawyer = (p: 'buyerLawyer' | 'sellerLawyer', n: Text3, firm: Text3): FieldSpec[] => [
  { key: p, type: 'person', label: n }, { key: `${p}Firm`, type: 'text', label: firm },
];
const WHO_PAYS = [O('buyer', 'Buyer', 'Pembeli', '买家'), O('seller', 'Seller', 'Penjual', '卖家'), O('shared', 'Shared', 'Dikongsi', '双方分摊')];

export const SALE: GroupSpec[] = [
  { id: 'legal', title: L('Legal and Dates', 'Undang-Undang dan Tarikh', '法律与日期'), fields: [
    { key: 'spaSigned', type: 'date', label: L('SPA Signed', 'SPA Ditandatangani', '买卖合约签署日期') },
    { key: 'spaStamped', type: 'date', label: L('SPA Stamped', 'SPA Disetem', '买卖合约盖印日期') },
    ...lawyer('buyerLawyer', L('Buyer’s Lawyer', 'Peguam Pembeli', '买方律师'), L('Buyer’s Lawyer Firm', 'Firma Peguam Pembeli', '买方律师事务所')),
    ...lawyer('sellerLawyer', L('Seller’s Lawyer', 'Peguam Penjual', '卖方律师'), L('Seller’s Lawyer Firm', 'Firma Peguam Penjual', '卖方律师事务所')),
    { key: 'consentApplied', type: 'date', label: L('State Consent Applied', 'Kebenaran Negeri Dipohon', '州政府批准申请日期') },
    { key: 'consentReceived', type: 'date', label: L('State Consent Received', 'Kebenaran Negeri Diterima', '州政府批准获得日期') },
    { key: 'motSubmitted', type: 'date', label: L('MOT Submitted', 'MOT Diserahkan', '转让备忘录提交日期') },
    { key: 'motRegistered', type: 'date', label: L('MOT Registered', 'MOT Didaftarkan', '转让备忘录注册日期') },
    { key: 'stampDutySpa', type: 'money', label: L('Stamp Duty on SPA (RM)', 'Duti Setem SPA (RM)', '买卖合约印花税 (RM)') },
    { key: 'stampDutyMot', type: 'money', label: L('Stamp Duty on MOT (RM)', 'Duti Setem MOT (RM)', '转让备忘录印花税 (RM)') },
    { key: 'stampDutyPayer', type: 'select', label: L('Stamp Duty Paid By', 'Duti Setem Dibayar Oleh', '印花税支付方'), options: WHO_PAYS },
    { key: 'completionDate', type: 'date', label: L('Completion Date', 'Tarikh Penyempurnaan', '交易完成日期'), reminder: true },
    { key: 'completionPeriod', type: 'text', label: L('Completion Period', 'Tempoh Penyempurnaan', '完成期限') },
    { key: 'extensionGranted', type: 'text', label: L('Extension Granted', 'Lanjutan Diberi', '获批延期') },
    { key: 'lateInterest', type: 'text', label: L('Late Payment Interest', 'Faedah Bayaran Lewat', '逾期利息') },
    { key: 'keyHandover', type: 'date', label: L('Key Handover / Vacant Possession', 'Serahan Kunci / Milikan Kosong', '交钥匙 / 空屋交付') },
  ] },
  { id: 'money', title: L('Money', 'Wang', '款项'), fields: [
    { key: 'loanBank', type: 'text', label: L('Buyer’s Loan Bank', 'Bank Pinjaman Pembeli', '买家贷款银行') },
    { key: 'loanAmount', type: 'money', label: L('Loan Amount (RM)', 'Jumlah Pinjaman (RM)', '贷款金额 (RM)') },
    { key: 'loanStatus', type: 'select', label: L('Loan Status', 'Status Pinjaman', '贷款状态'), options: [O('applied', 'Applied', 'Dipohon', '已申请'), O('approved', 'Approved', 'Diluluskan', '已批准'), O('rejected', 'Rejected', 'Ditolak', '被拒绝')] },
    { key: 'loanOfferDate', type: 'date', label: L('Loan Offer Letter Date', 'Tarikh Surat Tawaran Pinjaman', '贷款批准信日期') },
    { key: 'valuationDate', type: 'date', label: L('Valuation Date', 'Tarikh Penilaian', '估价日期') },
    { key: 'redemptionBank', type: 'text', label: L('Seller’s Loan: Bank', 'Pinjaman Penjual: Bank', '卖家贷款银行') },
    { key: 'redemptionSum', type: 'money', label: L('Redemption Sum (RM)', 'Jumlah Penebusan (RM)', '赎回金额 (RM)') },
    { key: 'redemptionDate', type: 'date', label: L('Redemption Date', 'Tarikh Penebusan', '赎回日期') },
    { key: 'disbursementDate', type: 'date', label: L('Loan Disbursement Date', 'Tarikh Pengeluaran Pinjaman', '贷款发放日期') },
    { key: 'finalBalanceDate', type: 'date', label: L('Final Balance Paid', 'Baki Akhir Dibayar', '尾款付清日期') },
    { key: 'quitRent', type: 'money', label: L('Quit Rent Apportioned (RM)', 'Cukai Tanah Dibahagi (RM)', '地税分摊 (RM)') },
    { key: 'assessment', type: 'money', label: L('Assessment Apportioned (RM)', 'Cukai Pintu Dibahagi (RM)', '门牌税分摊 (RM)') },
    { key: 'maintenance', type: 'money', label: L('Maintenance Fee Apportioned (RM)', 'Yuran Penyelenggaraan Dibahagi (RM)', '管理费分摊 (RM)') },
    { key: 'rpgtFiled', type: 'date', label: L('RPGT Filed', 'CKHT Difailkan', '产业盈利税申报日期') },
    { key: 'rpgtPaid', type: 'date', label: L('RPGT Paid', 'CKHT Dibayar', '产业盈利税缴付日期') },
    { key: 'commissionReceived', type: 'money', label: L('Commission Received (RM)', 'Komisen Diterima (RM)', '已收佣金 (RM)') },
    { key: 'commissionReceivedDate', type: 'date', label: L('Commission Received Date', 'Tarikh Komisen Diterima', '佣金收到日期') },
    { key: 'cobrokeSplit', type: 'text', label: L('Co-broke Split', 'Pembahagian Co-broke', '联合代理分成') },
    { key: 'invoiceNo', type: 'text', label: L('Commission Invoice Number', 'Nombor Invois Komisen', '佣金发票号码') },
    { key: 'invoiceSent', type: 'date', label: L('Invoice Sent', 'Invois Dihantar', '发票寄出日期') },
    { key: 'invoicePaid', type: 'date', label: L('Invoice Paid', 'Invois Dibayar', '发票付款日期') },
  ] },
  { id: 'documents', title: L('Documents', 'Dokumen', '文件'), fields: [
    { key: 'files', type: 'files', label: L('SPA, MOT, Loan Offer, Consent Letters', 'SPA, MOT, Tawaran Pinjaman, Surat Kebenaran', '买卖合约、转让备忘录、贷款批准信、批准信') },
  ] },
];

export const OTHERS: GroupSpec[] = [
  { id: 'others', title: L('Sold by Others', 'Dijual oleh Orang Lain', '由别人售出'), fields: [
    { key: 'agency', type: 'text', label: L('Agency That Sold It', 'Agensi yang Menjual', '售出的中介公司') },
    { key: 'price', type: 'money', label: L('Sold Price (RM)', 'Harga Jualan (RM)', '成交价 (RM)') },
  ] },
];

export const RENTAL: GroupSpec[] = [
  { id: 'people', title: L('People', 'Orang', '人员'), fields: [
    { key: 'tenant', type: 'person', label: L('Tenant', 'Penyewa', '租户') },
    { key: 'tenantId', type: 'text', label: L('Tenant IC / Passport Number', 'Nombor IC / Pasport Penyewa', '租户身份证 / 护照号码') },
    { key: 'occupation', type: 'text', label: L('Tenant Occupation', 'Pekerjaan Penyewa', '租户职业') },
    { key: 'occupants', type: 'number', label: L('Number of Occupants', 'Bilangan Penghuni', '居住人数') },
    { key: 'tenantCobroke', type: 'person', label: L('Tenant’s Co-broke Agent', 'Ejen Co-broke Penyewa', '租户方联合代理经纪人') },
    { key: 'tenantCobrokeAgency', type: 'text', label: L('Tenant’s Co-broke Agency', 'Agensi Co-broke Penyewa', '租户方联合代理公司') },
  ] },
  { id: 'money', title: L('Money', 'Wang', '款项'), fields: [
    { key: 'rent', type: 'money', label: L('Monthly Rental (RM)', 'Sewa Bulanan (RM)', '月租 (RM)') },
    { key: 'securityDeposit', type: 'money', label: L('Security Deposit (RM)', 'Deposit Keselamatan (RM)', '保证金 (RM)') },
    { key: 'utilityDeposit', type: 'money', label: L('Utility Deposit (RM)', 'Deposit Utiliti (RM)', '水电押金 (RM)') },
    { key: 'advanceRental', type: 'money', label: L('Advance Rental (RM)', 'Sewa Pendahuluan (RM)', '预付租金 (RM)') },
    { key: 'taStampDuty', type: 'money', label: L('Tenancy Agreement Stamp Duty (RM)', 'Duti Setem Perjanjian Sewa (RM)', '租约印花税 (RM)') },
    { key: 'taStampPayer', type: 'select', label: L('Stamp Duty Paid By', 'Duti Setem Dibayar Oleh', '印花税支付方'), options: [O('tenant', 'Tenant', 'Penyewa', '租户'), O('landlord', 'Landlord', 'Tuan Rumah', '房东'), O('shared', 'Shared', 'Dikongsi', '双方分摊')] },
    { key: 'commission', type: 'money', label: L('Rental Commission (RM)', 'Komisen Sewaan (RM)', '出租佣金 (RM)') },
    { key: 'commissionReceivedDate', type: 'date', label: L('Commission Received Date', 'Tarikh Komisen Diterima', '佣金收到日期') },
  ] },
  { id: 'dates', title: L('Dates', 'Tarikh', '日期'), fields: [
    { key: 'start', type: 'date', label: L('Tenancy Start', 'Mula Penyewaan', '租约开始') },
    { key: 'end', type: 'date', label: L('Tenancy End', 'Tamat Penyewaan', '租约结束'), reminder: true },
    { key: 'renewal', type: 'text', label: L('Renewal Option', 'Pilihan Pembaharuan', '续约选项') },
    { key: 'rentDueDay', type: 'number', label: L('Rent Due Day of the Month (1–31)', 'Hari Sewa Perlu Dibayar (1–31)', '每月交租日 (1–31)'), reminder: true },
  ] },
  { id: 'documents', title: L('Documents', 'Dokumen', '文件'), fields: [
    { key: 'files', type: 'files', label: L('Tenancy Agreement, Inventory List, Key Handover Photos', 'Perjanjian Sewa, Senarai Inventori, Foto Serahan Kunci', '租约、物品清单、交钥匙照片') },
  ] },
];

export const SPEC: Record<DealSection, GroupSpec[]> = { booking: BOOKING, sale: SALE, rental: RENTAL, others: OTHERS };

// ---------- reading values ----------
export const dealValues = (l: Pick<Listing, 'deal'>, sec: DealSection): Record<string, DealValue> => l.deal?.[sec] ?? {};
export const numVal = (v: DealValue | undefined): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
export const strVal = (v: DealValue | undefined): string | undefined => (typeof v === 'string' && v.trim() ? v : undefined);
export const personVal = (v: DealValue | undefined): DealPerson | undefined => (v && typeof v === 'object' && !Array.isArray(v) ? v as DealPerson : undefined);
/** yyyy-mm-dd in local time. */
export const ymdLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const isDate = (s?: string): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

// ---------- Track My Sales ----------
// JoyChange010-02: 'rentpending' = Rented - Pending TA Signing. Listed in Track My Sales, but no commission is counted and no
// deadline is shown until the Tenancy Agreement is signed and the property becomes plain 'rented'.
export type Stage = 'booked' | 'spa' | 'completed' | 'sold' | 'rentpending' | 'rented' | 'others' | 'cancelled';
export const STAGES: Stage[] = ['booked', 'sold', 'spa', 'completed', 'rentpending', 'rented', 'others', 'cancelled'];

/** Where a property's deal stands, from what was recorded (undefined: no deal). */
export function stageOf(l: Pick<Listing, 'status' | 'deal'>, today = ymdLocal(new Date())): Stage | undefined {
  const b = dealValues(l, 'booking');
  const sale = dealValues(l, 'sale');
  const outcome = strVal(b.outcome);
  if (l.status === 'rented') return 'rented';
  if (l.status === 'rented_pending_ta') return 'rentpending';
  if (l.status === 'sold') {
    if (l.deal?.soldBy === 'others') return 'others';
    const done = strVal(sale.completionDate);
    if ((isDate(done) && done <= today) || strVal(sale.keyHandover)) return 'completed';
    if (strVal(sale.spaSigned)) return 'spa';
    return 'sold';
  }
  if (l.status === 'in_progress') return outcome && outcome !== 'booked' ? 'cancelled' : 'booked';
  if (l.deal?.booking && outcome && outcome !== 'booked') return 'cancelled';
  return undefined;
}

/** What one deal is worth to the agent: received (with its date) or still pending. */
export function commissionOf(l: Listing, stage: Stage): { received?: number; receivedOn?: string; pending?: number } {
  if (stage === 'others' || stage === 'cancelled' || stage === 'rentpending') return {};
  if (stage === 'rented') {
    const r = dealValues(l, 'rental');
    const amount = numVal(r.commission) ?? rentCommissionRm(l);
    const on = strVal(r.commissionReceivedDate);
    return on ? { received: amount, receivedOn: on } : { pending: amount };
  }
  const s = dealValues(l, 'sale');
  const got = numVal(s.commissionReceived);
  const on = strVal(s.commissionReceivedDate) ?? strVal(s.invoicePaid);
  if (got !== undefined && on) return { received: got, receivedOn: on };
  if (got !== undefined) return { received: got };
  return { pending: numVal(dealValues(l, 'booking').agreedCommission) ?? commissionRm(l) };
}

export interface Totals { received: number; pending: number; month: number; year: number }
export function totals(list: Listing[], today = new Date()): Totals {
  const t: Totals = { received: 0, pending: 0, month: 0, year: 0 };
  const ym = ymdLocal(today).slice(0, 7);
  const y = ym.slice(0, 4);
  for (const l of list) {
    const st = stageOf(l, ymdLocal(today));
    if (!st) continue;
    const c = commissionOf(l, st);
    if (c.received) {
      t.received += c.received;
      if (c.receivedOn?.startsWith(ym)) t.month += c.received;
      if (c.receivedOn?.startsWith(y)) t.year += c.received;
    }
    if (c.pending) t.pending += c.pending;
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return { received: r2(t.received), pending: r2(t.pending), month: r2(t.month), year: r2(t.year) };
}

/** Rent due dates (the chosen day each month; a short month uses its last day), from the tenancy start (or today) to its
 *  end, at most `max` of them. */
export function rentDueDates(day: number, from: string, to: string | undefined, max: number): string[] {
  if (!Number.isFinite(day) || day < 1 || day > 31 || !isDate(from)) return [];
  const out: string[] = [];
  let y = Number(from.slice(0, 4)); let m = Number(from.slice(5, 7)) - 1;
  for (let i = 0; i < 400 && out.length < max; i++) {
    const last = new Date(y, m + 1, 0).getDate();
    const d = ymdLocal(new Date(y, m, Math.min(day, last)));
    if (to && isDate(to) && d > to) break;
    if (d >= from) out.push(d);
    m++; if (m > 11) { m = 0; y++; }
  }
  return out;
}

export interface Deadline { key: string; date: string; propertyId: string; what: 'bookingExpiry' | 'targetSpa' | 'balanceDue' | 'completionDate' | 'tenancyEnd' | 'rentDue' }

/** Every dated reminder a deal asks for (they go into the Calendar), whatever the date. A cancelled booking asks for none;
 *  a finished sale keeps only its completion date. */
export function dealDates(l: Listing, today = new Date()): Deadline[] {
  const st = stageOf(l, ymdLocal(today));
  if (!st || st === 'others' || st === 'cancelled' || st === 'rentpending') return [];
  const out: Deadline[] = [];
  const add = (what: Deadline['what'], date: string | undefined, n = 0) => { if (isDate(date)) out.push({ key: `${what}${n ? `-${n}` : ''}`, date, propertyId: l.id, what }); };
  const b = dealValues(l, 'booking');
  if (st === 'booked' || st === 'sold') { add('bookingExpiry', strVal(b.bookingExpiry)); add('targetSpa', strVal(b.targetSpa)); add('balanceDue', strVal(b.balanceDue)); }
  if (st === 'sold' || st === 'spa' || st === 'booked') add('completionDate', strVal(dealValues(l, 'sale').completionDate));
  if (st === 'rented') {
    const r = dealValues(l, 'rental');
    const end = strVal(r.end);
    add('tenancyEnd', end);
    const day = numVal(r.rentDueDay);
    const start = strVal(r.start);
    const from = start && start > ymdLocal(today) ? start : ymdLocal(today);
    if (day !== undefined) rentDueDates(day, from, end, 12).forEach((d, i) => add('rentDue', d, i + 1));
  }
  return out;
}

/** Deadlines from today up to `days` ahead, soonest first. */
export function upcoming(list: Listing[], days = 60, today = new Date()): Deadline[] {
  const from = ymdLocal(today);
  const until = ymdLocal(new Date(today.getFullYear(), today.getMonth(), today.getDate() + days));
  return list.flatMap(l => dealDates(l, today)).filter(d => d.date >= from && d.date <= until)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Whole days from today to a yyyy-mm-dd date (local time). */
export function daysUntil(date: string, today = new Date()): number {
  const a = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const [y, m, d] = date.split('-').map(Number);
  return Math.round((new Date(y, m - 1, d).getTime() - a) / 86_400_000);
}

/** The Calendar entry id for one reminder (stable, so saving again updates it instead of adding another). */
export const reminderId = (propertyId: string, key: string) => `deal-${propertyId}-${key}`;
/** 3 days and 1 day before, in minutes. */
export const DEAL_REMINDERS = [3 * 1440, 1440];
