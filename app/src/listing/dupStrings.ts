// Text for the "this property may already be in your list" warning, in three languages.
import type { Lang } from '../i18n';

const en = {
  title: 'This may already be in your list',
  help: 'You can still save it. Check first that it is not the same property entered twice.',
  address: 'same street and unit',
  lot: 'same lot in the same area',
};
export type DupStrings = typeof en;
const bm: DupStrings = {
  title: 'Ini mungkin sudah ada dalam senarai anda',
  help: 'Anda masih boleh menyimpannya. Semak dahulu bahawa ia bukan hartanah yang sama dimasukkan dua kali.',
  address: 'jalan dan unit yang sama',
  lot: 'lot yang sama di kawasan yang sama',
};
const zh: DupStrings = {
  title: '这可能已在您的列表中',
  help: '您仍可保存。请先确认这不是同一物业被重复输入。',
  address: '相同的街道和单位',
  lot: '同一地区的相同地段',
};
export const dupStrings: Record<Lang, DupStrings> = { en, bm, zh };
