// Text for the "contacts to follow up" reminder, in three languages.
import type { Lang } from '../i18n';

const en = {
  title: 'Contacts to follow up',
  notice: (n: number, days: number) => `${n} contact${n === 1 ? ' has' : 's have'} had no interaction for ${days} days or more.`,
  quiet: (d: number) => `${d} days without contact`,
  never: 'No interaction recorded yet',
  settingTitle: 'Follow-up reminder',
  settingHelp: 'Remind me about contacts with no interaction for this long. Nothing is changed automatically: no contact is made inactive or dropped by this reminder.',
  off: 'Off',
  days: (d: number) => `${d} days`,
};
export type FollowStrings = typeof en;
const bm: FollowStrings = {
  title: 'Kenalan untuk diikuti',
  notice: (n, days) => `${n} kenalan tiada interaksi selama ${days} hari atau lebih.`,
  quiet: d => `${d} hari tanpa hubungan`,
  never: 'Belum ada interaksi direkodkan',
  settingTitle: 'Peringatan susulan',
  settingHelp: 'Ingatkan saya tentang kenalan tanpa interaksi selama tempoh ini. Tiada apa-apa diubah secara automatik: peringatan ini tidak menjadikan kenalan tidak aktif atau digugurkan.',
  off: 'Mati',
  days: d => `${d} hari`,
};
const zh: FollowStrings = {
  title: '需要跟进的联系人',
  notice: (n, days) => `${n} 位联系人已有 ${days} 天或更久没有互动。`,
  quiet: d => `${d} 天没有联系`,
  never: '尚无互动记录',
  settingTitle: '跟进提醒',
  settingHelp: '提醒我这么长时间没有互动的联系人。不会自动更改任何内容：此提醒不会把联系人设为不活跃或放弃。',
  off: '关闭',
  days: d => `${d} 天`,
};
export const followStrings: Record<Lang, FollowStrings> = { en, bm, zh };
