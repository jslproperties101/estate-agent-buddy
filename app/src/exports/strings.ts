import type { Lang } from '../i18n';
import { titled3 } from '../lib/titleCase';
const en = { manageTitle: 'Export Management', exportTitle: 'Export Audit History' };
type S = typeof en;
const bm: S = { manageTitle: 'Pengurusan Eksport', exportTitle: 'Eksport Sejarah Audit' };
const zh: S = { manageTitle: '导出管理', exportTitle: '导出审计历史' };
export const exportStrings: Record<Lang, S> = titled3({ en, bm, zh });
