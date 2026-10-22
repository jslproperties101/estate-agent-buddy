// v1buddychange015 (Batch I): words for Open House Tour. BM / ZH to be checked by a native speaker.
import type { Lang } from '../../i18n';
import type { FeatureId } from './logic';

const en = {
  title: 'Open House Tour',
  blurb: 'Walk a 3D show unit and point out what each buyer asked for.',
  intro: 'Show buyers around a 3-bedroom show unit. Point out exactly what each buyer asked for.',
  how1: 'Left thumb walks, right thumb looks around', how2: "Read the buyer's wishlist at the top. Tap the gold sparkle on each feature they want.", how3: 'A wrong feature costs 5 seconds. A happy buyer adds 15 seconds.',
  start: 'Start tour', back: 'Back to Games', resume: 'Keep touring', finish: 'Finish round', pause: 'Pause', paused: 'Paused',
  time: 'Time', score: 'Score', buyers: 'Buyers', wants: 'Wants',
  notList: 'Not on the list', happy: 'Buyer is happy!', next: '+15 seconds · next buyer', already: 'Already shown',
  hint: 'Left side: walk · Right side: look · Tap a gold sparkle to show it',
  sample: 'Practice game in a sample show unit.', noGl: 'This phone could not start the 3D view.',
  f: {
    balcony: 'Balcony with city view', kitchen: 'Renovated kitchen with island', wardrobe: 'Built-in wardrobe', windows: 'Large windows, lots of light',
    lock: 'Smart digital door lock', aircon: 'Air-conditioning', study: 'Study nook', bedroom: 'Master bedroom fits a king-size bed',
  } as Record<FeatureId, string>,
};
type S = typeof en;
const bm: S = {
  title: 'Lawatan Rumah Terbuka',
  blurb: 'Berjalan di unit pameran 3D dan tunjukkan apa yang diminta setiap pembeli.',
  intro: 'Bawa pembeli melawat unit pameran 3 bilik. Tunjukkan tepat apa yang setiap pembeli minta.',
  how1: 'Ibu jari kiri berjalan, ibu jari kanan melihat', how2: 'Baca senarai kehendak pembeli di atas. Tekan kilauan emas pada setiap ciri yang mereka mahu.', how3: 'Ciri yang salah tolak 5 saat. Pembeli gembira tambah 15 saat.',
  start: 'Mula lawatan', back: 'Kembali ke Permainan', resume: 'Teruskan', finish: 'Tamatkan pusingan', pause: 'Jeda', paused: 'Dijeda',
  time: 'Masa', score: 'Mata', buyers: 'Pembeli', wants: 'Mahu',
  notList: 'Tiada dalam senarai', happy: 'Pembeli gembira!', next: '+15 saat · pembeli seterusnya', already: 'Sudah ditunjukkan',
  hint: 'Kiri: berjalan · Kanan: lihat · Tekan kilauan emas untuk menunjuk',
  sample: 'Permainan latihan dalam unit pameran contoh.', noGl: 'Telefon ini tidak dapat membuka paparan 3D.',
  f: {
    balcony: 'Balkoni dengan pemandangan bandar', kitchen: 'Dapur diubah suai dengan pulau', wardrobe: 'Almari terbina dalam', windows: 'Tingkap besar, banyak cahaya',
    lock: 'Kunci pintu digital pintar', aircon: 'Penghawa dingin', study: 'Ruang belajar', bedroom: 'Bilik utama muat katil king',
  },
};
const zh: S = {
  title: '开放参观',
  blurb: '走进 3D 样板单位，展示每位买家想要的特点。',
  intro: '带买家参观三房样板单位，准确展示每位买家想要的特点。',
  how1: '左手拇指行走，右手拇指环顾', how2: '查看顶部的买家需求清单，点击他们想要的每个特点上的金色闪光。', how3: '点错扣 5 秒，买家满意加 15 秒。',
  start: '开始参观', back: '返回游戏列表', resume: '继续参观', finish: '结束本局', pause: '暂停', paused: '已暂停',
  time: '时间', score: '得分', buyers: '买家', wants: '想要',
  notList: '不在清单上', happy: '买家很满意！', next: '+15 秒 · 下一位买家', already: '已经展示过',
  hint: '左边：行走 · 右边：环顾 · 点击金色闪光展示特点',
  sample: '在示例样板单位中的练习游戏。', noGl: '这部手机无法打开 3D 画面。',
  f: {
    balcony: '城市景观阳台', kitchen: '翻新厨房与中岛台', wardrobe: '嵌入式衣柜', windows: '大窗户，采光充足',
    lock: '智能电子门锁', aircon: '空调', study: '书房角落', bedroom: '主卧可放特大床',
  },
};
export const ohStrings: Record<Lang, S> = { en, bm, zh };
