import type { Lang } from '../i18n';
import { titled3 } from '../lib/titleCase';
const en = { manageTitle: 'Export Management' };
type S = typeof en;
const bm: S = { manageTitle: 'Pengurusan Eksport' };
const zh: S = { manageTitle: '导出管理' };
export const exportStrings: Record<Lang, S> = titled3({ en, bm, zh });
