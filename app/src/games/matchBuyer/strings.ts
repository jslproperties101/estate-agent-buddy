// v1buddychange015 (Batch I): words for Match the Buyer. BM / ZH to be checked by a native speaker.
import type { Lang } from '../../i18n';

const en = {
  title: 'Match the Buyer',
  blurb: "Swipe listings against a buyer's budget, area, type and bedrooms.",
  intro: "Read the buyer's brief, then decide fast: does this listing fit everything they asked for?",
  how1: 'Swipe right or tap Match if the listing fits budget, area, type and bedrooms', how2: 'Swipe left or tap Skip if even one thing is off', how3: 'Right answers build your streak. A wrong one costs 5 seconds.',
  start: 'Start matching', back: 'Back to Games', finish: 'Finish round',
  time: 'Time', score: 'Score', streak: 'Streak', brief: 'Buyer brief', budget: 'Budget', areas: 'Areas', type: 'Type', beds: 'Bedrooms', area: 'Area',
  skip: 'Skip', match: 'Match', upTo: (rm: string) => `Up to ${rm}`, any: 'Any type', or: 'or', min: (n: number) => `${n} or more`, listing: 'Listing',
  good: 'Correct!', fits: 'It fits everything on the brief.', overBy: (rm: string) => `Over budget by ${rm}`, wrongArea: (a: string) => `Wrong area: ${a}`,
  wrongType: (t: string) => `Wrong type: ${t}`, fewBeds: (n: number) => `Too few bedrooms: ${n}`, missed: 'Missed match. It fitted every need.',
  newBuyer: (n: string) => `New buyer: ${n}`, sample: 'Practice game with sample buyers and listings.',
};
type S = typeof en;
const bm: S = {
  title: 'Padankan Pembeli',
  blurb: 'Leret hartanah mengikut bajet, kawasan, jenis dan bilik tidur pembeli.',
  intro: 'Baca keperluan pembeli, kemudian putuskan pantas: adakah hartanah ini memenuhi semua yang diminta?',
  how1: 'Leret ke kanan atau tekan Padan jika hartanah sesuai bajet, kawasan, jenis dan bilik tidur', how2: 'Leret ke kiri atau tekan Langkau jika ada satu yang tidak sesuai', how3: 'Jawapan betul menambah rentetan. Salah tolak 5 saat.',
  start: 'Mula memadan', back: 'Kembali ke Permainan', finish: 'Tamatkan pusingan',
  time: 'Masa', score: 'Mata', streak: 'Berturut', brief: 'Keperluan pembeli', budget: 'Bajet', areas: 'Kawasan', type: 'Jenis', beds: 'Bilik tidur', area: 'Kawasan',
  skip: 'Langkau', match: 'Padan', upTo: rm => `Sehingga ${rm}`, any: 'Apa-apa jenis', or: 'atau', min: n => `${n} atau lebih`, listing: 'Hartanah',
  good: 'Betul!', fits: 'Memenuhi semua keperluan.', overBy: rm => `Melebihi bajet sebanyak ${rm}`, wrongArea: a => `Kawasan salah: ${a}`,
  wrongType: t => `Jenis salah: ${t}`, fewBeds: n => `Bilik tidur tidak cukup: ${n}`, missed: 'Terlepas padanan. Ia memenuhi semua keperluan.',
  newBuyer: n => `Pembeli baharu: ${n}`, sample: 'Permainan latihan dengan pembeli dan hartanah contoh.',
};
const zh: S = {
  title: '匹配买家',
  blurb: '根据买家的预算、地区、类型和卧室数量滑动房源。',
  intro: '阅读买家需求，然后快速判断：这个房源是否符合他们的所有要求？',
  how1: '如果房源符合预算、地区、类型和卧室数量，向右滑或点击匹配', how2: '只要有一项不符合，就向左滑或点击跳过', how3: '答对可累积连胜，答错扣 5 秒。',
  start: '开始匹配', back: '返回游戏列表', finish: '结束本局',
  time: '时间', score: '得分', streak: '连胜', brief: '买家需求', budget: '预算', areas: '地区', type: '类型', beds: '卧室', area: '地区',
  skip: '跳过', match: '匹配', upTo: rm => `最高 ${rm}`, any: '任何类型', or: '或', min: n => `${n} 间或以上`, listing: '房源',
  good: '答对了！', fits: '完全符合需求。', overBy: rm => `超出预算 ${rm}`, wrongArea: a => `地区不符：${a}`,
  wrongType: t => `类型不符：${t}`, fewBeds: n => `卧室不够：${n} 间`, missed: '错过了匹配，它符合所有需求。',
  newBuyer: n => `新买家：${n}`, sample: '使用示例买家和房源的练习游戏。',
};
export const mbStrings: Record<Lang, S> = { en, bm, zh };
