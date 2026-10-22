// v1buddychange015 (Batch I): words for Buddy Walk: Streets. BM / ZH to be checked by a native speaker.
import type { Lang } from '../../i18n';

const en = {
  title: 'Buddy Walk: Streets',
  blurb: 'Walk an endless 3D neighbourhood and price each For Sale sign.',
  intro: 'Walk the streets for 2 minutes. Find the gold For Sale signs and pick the right asking price for each listing.',
  how1: 'Left thumb walks, right thumb looks around', how2: 'Follow the gold arrow to the nearest sign', how3: 'Right price = points. A streak scores more.',
  start: 'Start walking', back: 'Back to Games', resume: 'Keep walking', finish: 'Finish round', pause: 'Pause', paused: 'Paused',
  time: 'Time', score: 'Score', streak: 'Streak',
  nearest: 'Nearest sign', keep: 'Keep walking to find a sign', priceIt: 'Price this listing',
  q: "What's the asking price?", correct: 'Correct!', wrong: 'Not quite.', actual: 'Asking price', psf: 'per sq ft', cont: 'Continue',
  tenure: 'Tenure', type: 'Type', beds: 'Bedrooms', size: 'Built-up', sqft: 'sq ft', listing: 'Listing', free: 'Freehold', lease: 'Leasehold', pts: 'pts',
  sample: 'Practice listings only. Prices are rough estimates.', hint: 'Left side: walk · Right side: look', noGl: 'This phone could not start the 3D view.',
};
type S = typeof en;
const bm: S = {
  title: 'Buddy Walk: Jalan',
  blurb: 'Berjalan di kawasan perumahan 3D dan taksir setiap papan Dijual.',
  intro: 'Berjalan selama 2 minit. Cari papan Dijual berwarna emas dan pilih harga jualan yang betul bagi setiap hartanah.',
  how1: 'Ibu jari kiri berjalan, ibu jari kanan melihat', how2: 'Ikut anak panah emas ke papan terdekat', how3: 'Harga betul = mata. Berturut-turut dapat lebih.',
  start: 'Mula berjalan', back: 'Kembali ke Permainan', resume: 'Teruskan', finish: 'Tamatkan pusingan', pause: 'Jeda', paused: 'Dijeda',
  time: 'Masa', score: 'Mata', streak: 'Berturut',
  nearest: 'Papan terdekat', keep: 'Terus berjalan untuk mencari papan', priceIt: 'Taksir hartanah ini',
  q: 'Berapakah harga jualannya?', correct: 'Betul!', wrong: 'Kurang tepat.', actual: 'Harga jualan', psf: 'sekaki persegi', cont: 'Teruskan',
  tenure: 'Pegangan', type: 'Jenis', beds: 'Bilik tidur', size: 'Keluasan binaan', sqft: 'kps', listing: 'Hartanah', free: 'Pegangan bebas', lease: 'Pajakan', pts: 'mata',
  sample: 'Hartanah latihan sahaja. Harga adalah anggaran kasar.', hint: 'Kiri: berjalan · Kanan: lihat', noGl: 'Telefon ini tidak dapat membuka paparan 3D.',
};
const zh: S = {
  title: 'Buddy 漫步：街道',
  blurb: '在无尽的 3D 住宅区漫步，为每个出售招牌估价。',
  intro: '漫步 2 分钟，找到金色的出售招牌，为每个房源选出正确的售价。',
  how1: '左手拇指行走，右手拇指环顾', how2: '跟着金色箭头走到最近的招牌', how3: '估对得分，连胜得分更多',
  start: '开始漫步', back: '返回游戏列表', resume: '继续漫步', finish: '结束本局', pause: '暂停', paused: '已暂停',
  time: '时间', score: '得分', streak: '连胜',
  nearest: '最近招牌', keep: '继续行走寻找招牌', priceIt: '为此房源估价',
  q: '这个房源的售价是多少？', correct: '答对了！', wrong: '差一点。', actual: '售价', psf: '每平方英尺', cont: '继续',
  tenure: '地契', type: '类型', beds: '卧室', size: '建筑面积', sqft: '平方英尺', listing: '房源', free: '永久地契', lease: '租赁地契', pts: '分',
  sample: '仅为练习房源，价格为粗略估算。', hint: '左边：行走 · 右边：环顾', noGl: '这部手机无法打开 3D 画面。',
};
export const bsStrings: Record<Lang, S> = { en, bm, zh };
