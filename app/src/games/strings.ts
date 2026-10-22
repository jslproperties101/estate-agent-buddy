// v1buddychange013: words for the Games tile and the Games list. BM / ZH to be checked by a native speaker.
import type { Lang } from '../i18n';
import type { Badge } from './scores';

const en = {
  title: 'Games',
  cardHint: 'Quick property games: learn, practise and keep your streak.',
  best: (s: number, m: number) => `Best ${s}/${m}`, notPlayed: 'Not played yet', plays: (n: number) => (n === 1 ? '1 play' : `${n} plays`),
  streak: (n: number) => (n === 1 ? '1-day streak' : `${n}-day streak`), noStreak: 'Play today to start a streak',
  badgesTitle: 'Badges', play: 'Play',
  resultTitle: 'Round finished', resultScore: (s: number, m: number) => `You scored ${s} out of ${m}`,
  newBest: 'New best score!', again: 'Play again', backToGames: 'Back to Games',
  note: 'Scores stay on this phone. Practice only: no prizes yet.',
  badge: { first: 'First game', streak3: '3-day streak', streak7: '7-day streak', perfect: 'Perfect round', allGames: 'Tried every game', plays25: '25 rounds' } as Record<Badge, string>,
};
type S = typeof en;
const bm: S = {
  title: 'Permainan',
  cardHint: 'Permainan hartanah ringkas: belajar, berlatih dan kekalkan rentetan anda.',
  best: (s, m) => `Terbaik ${s}/${m}`, notPlayed: 'Belum dimainkan', plays: n => `${n} kali main`,
  streak: n => `Rentetan ${n} hari`, noStreak: 'Main hari ini untuk mula rentetan',
  badgesTitle: 'Lencana', play: 'Main',
  resultTitle: 'Pusingan tamat', resultScore: (s, m) => `Markah anda ${s} daripada ${m}`,
  newBest: 'Markah terbaik baharu!', again: 'Main lagi', backToGames: 'Kembali ke Permainan',
  note: 'Markah disimpan dalam telefon ini sahaja. Untuk latihan: tiada hadiah buat masa ini.',
  badge: { first: 'Permainan pertama', streak3: 'Rentetan 3 hari', streak7: 'Rentetan 7 hari', perfect: 'Pusingan sempurna', allGames: 'Cuba semua permainan', plays25: '25 pusingan' },
};
const zh: S = {
  title: '游戏',
  cardHint: '轻松的房产小游戏：学习、练习，保持连续天数。',
  best: (s, m) => `最佳 ${s}/${m}`, notPlayed: '尚未玩过', plays: n => `已玩 ${n} 次`,
  streak: n => `连续 ${n} 天`, noStreak: '今天玩一局开始连续记录',
  badgesTitle: '徽章', play: '开始',
  resultTitle: '本局结束', resultScore: (s, m) => `得分 ${s} / ${m}`,
  newBest: '新的最高分！', again: '再玩一次', backToGames: '返回游戏列表',
  note: '分数只保存在本手机。仅供练习：暂无奖品。',
  badge: { first: '第一局', streak3: '连续 3 天', streak7: '连续 7 天', perfect: '满分一局', allGames: '玩过所有游戏', plays25: '25 局' },
};
export const gameStrings: Record<Lang, S> = { en, bm, zh };
