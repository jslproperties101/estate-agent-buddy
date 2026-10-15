import type { Lang } from '../i18n';
import { titled3 } from '../lib/titleCase';
const en = { searchTitle: 'Audit History' };
type S = typeof en;
const bm: S = { searchTitle: 'Sejarah Audit' };
const zh: S = { searchTitle: '审计历史' };
export const auditStrings: Record<Lang, S> = titled3({ en, bm, zh });
