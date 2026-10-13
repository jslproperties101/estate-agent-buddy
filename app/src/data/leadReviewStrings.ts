// Text for the "Inactive moved to Dropped" report, in three languages.
import type { Lang } from '../i18n';

const en = {
  title: 'Status review',
  body: (n: number) => `Inactive is no longer used as a buyer status. ${n} buyer${n === 1 ? ' was' : 's were'} marked Inactive, so ${n === 1 ? 'it was' : 'they were'} moved to Dropped. Their earlier status is kept on each record. Open a contact to choose a different status.`,
  reviewed: 'Mark as reviewed',
  notice: (n: number) => `${n} buyer${n === 1 ? '' : 's'} moved from Inactive to Dropped. Please review.`,
  review: 'Review',
};
export type LeadReviewStrings = typeof en;
const bm: LeadReviewStrings = {
  title: 'Semakan status',
  body: (n: number) => `Tidak aktif tidak lagi digunakan sebagai status pembeli. ${n} pembeli ditandakan Tidak aktif, jadi mereka dipindahkan ke Digugurkan. Status lama disimpan pada setiap rekod. Buka kenalan untuk memilih status lain.`,
  reviewed: 'Tandakan telah disemak',
  notice: (n: number) => `${n} pembeli dipindahkan daripada Tidak aktif ke Digugurkan. Sila semak.`,
  review: 'Semak',
};
const zh: LeadReviewStrings = {
  title: '状态检查',
  body: (n: number) => `“不活跃”不再作为买家状态。有 ${n} 位买家原为“不活跃”，已移至“已放弃”。原来的状态保留在每条记录上。打开联系人即可选择其他状态。`,
  reviewed: '标记为已检查',
  notice: (n: number) => `${n} 位买家已从“不活跃”移至“已放弃”，请检查。`,
  review: '检查',
};
export const leadReviewStrings: Record<Lang, LeadReviewStrings> = { en, bm, zh };
