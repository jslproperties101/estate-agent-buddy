// v1buddychange013: the Property Rules Quiz's own words in EN / BM / ZH.
import type { Lang } from '../../i18n';
import type { Topic } from './bank';

export interface PrqText {
  question: (n: number, total: number) => string;
  right: string;
  wrong: string;
  next: string;
  seeResult: string;
  exit: string;
  note: string;
  progress: string;
  topic: Record<Topic, string>;
}

export const PRQ_TEXT: Record<Lang, PrqText> = {
  en: {
    question: (n, t) => `Question ${n} of ${t}`,
    right: 'Correct!', wrong: 'Not quite.', next: 'Next', seeResult: 'See result', exit: 'Exit',
    note: 'For practice only. Rules change - always confirm with a lawyer or the relevant authority.',
    progress: 'Quiz progress',
    topic: { sale: 'Sale process', tenancy: 'Tenancy', title: 'Titles and tenure', loan: 'Loans', agent: 'Agent practice', cost: 'Costs and taxes' },
  },
  bm: {
    question: (n, t) => `Soalan ${n} daripada ${t}`,
    right: 'Betul!', wrong: 'Belum tepat.', next: 'Seterusnya', seeResult: 'Lihat keputusan', exit: 'Keluar',
    note: 'Untuk latihan sahaja. Peraturan berubah - sentiasa sahkan dengan peguam atau pihak berkuasa berkaitan.',
    progress: 'Kemajuan kuiz',
    topic: { sale: 'Proses jualan', tenancy: 'Sewaan', title: 'Hak milik dan pegangan', loan: 'Pinjaman', agent: 'Amalan ejen', cost: 'Kos dan cukai' },
  },
  zh: {
    question: (n, t) => `第 ${n} 题，共 ${t} 题`,
    right: '答对了！', wrong: '不太对。', next: '下一题', seeResult: '查看结果', exit: '退出',
    note: '仅供练习。规则会变动，请务必向律师或相关机构确认。',
    progress: '答题进度',
    topic: { sale: '买卖流程', tenancy: '租赁', title: '地契与产权', loan: '贷款', agent: '代理实务', cost: '费用与税项' },
  },
};
