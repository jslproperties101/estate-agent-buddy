// JoyChange006 Batch 1, Change C: one search bar for every pick list.
// The agent types part of a name OR part of a phone number and the list narrows at once. The same matching rule and the same
// search box are used by every list that has one, so they cannot drift apart.
import type { Lang } from '../i18n';
import { strings } from '../i18n';

export const joy006Strings: Record<Lang, { noResults: string; searchNamePhone: string }> = {
  en: { noResults: 'No results', searchNamePhone: 'Search by name or phone' },
  bm: { noResults: 'Tiada hasil', searchNamePhone: 'Cari nama atau nombor telefon' },
  zh: { noResults: '没有结果', searchNamePhone: '按姓名或电话搜索' },
};

const fold = (x: string) => x.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
const digitsOf = (x: string) => x.replace(/\D/g, '');

/**
 * True when the text matches what the agent typed. Every typed word must appear somewhere in the text (letters are
 * compared without accents or capitals). A search that is only digits and phone punctuation, such as "012-34" or "+60 12",
 * also matches the digits of a phone number written with spaces or dashes.
 */
export function matchesText(text: string, query: string): boolean {
  const q = query.trim();
  if (!q) return true;
  const hay = fold(text);
  if (fold(q).split(/\s+/).filter(Boolean).every(w => hay.includes(w))) return true;
  const d = digitsOf(q);
  return d.length >= 2 && /^[\d\s+\-().]+$/.test(q) && digitsOf(text).includes(d);
}

/** The search box at the top of a pick list. */
export function PickSearch({ lang, value, onChange, testId, label, placeholder }: {
  lang: Lang; value: string; onChange: (v: string) => void; testId?: string; label?: string; placeholder?: string;
}) {
  const ph = placeholder ?? strings[lang].c.search;
  return (
    <div className="opt-search pick-search">
      <input type="search" inputMode="search" value={value} placeholder={ph} aria-label={label ? `${strings[lang].c.search}: ${label}` : ph}
        data-testid={testId} onChange={e => onChange(e.target.value)} />
    </div>
  );
}

/** "No results", shown in place of the list when nothing matches. */
export function NoResults({ lang, testId }: { lang: Lang; testId?: string }) {
  return <small className="muted opt-none" role="status" data-testid={testId}>{joy006Strings[lang].noResults}</small>;
}
